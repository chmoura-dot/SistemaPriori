/**
 * pricing.ts
 * Lógica de precificação compartilhada entre Dashboard e Faturamento.
 * Extraída de billingHelpers.ts para garantir que qualquer cálculo monetário
 * use exatamente as mesmas regras de negócio.
 */
import { differenceInDays } from 'date-fns';
import { matchPlanByHealthPlan } from '../services/supabase/helpers';
import {
  Appointment, Customer, Plan,
  AppointmentStatus, AppointmentType, HealthPlan,
} from '../services/types';

export interface PricingContext {
  customers: Customer[];
  plans: Plan[];
  appointments: Appointment[];
}

/**
 * Retorna o índice (0-based) da sessão neuropsicológica para pacientes AMS Petrobras,
 * dentro do ciclo de 10 meses. Após 10 meses, um novo ciclo começa (índice volta a 0).
 * Retorna -1 se não for AMS ou não for Avaliação Neuropsicológica.
 */
export function getAmsNeuropsicoSessionIndex(
  app: Appointment,
  ctx: PricingContext,
): number {
  if (app.type !== AppointmentType.NEUROPSICOLOGICA) return -1;
  const customer = ctx.customers.find(c => c.id === app.customerId);
  if (customer?.healthPlan !== HealthPlan.AMS_PETROBRAS) return -1;

  const allSessions = ctx.appointments
    .filter(a =>
      a.customerId === app.customerId &&
      a.type === AppointmentType.NEUROPSICOLOGICA &&
      a.status !== AppointmentStatus.CANCELED
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  let cycleStartDate: string | null = null;
  let indexInCycle = -1;

  for (const session of allSessions) {
    if (cycleStartDate === null) {
      cycleStartDate = session.date;
      indexInCycle = 0;
    } else {
      const [sy, sm] = cycleStartDate.split('-').map(Number);
      const [ey, em] = session.date.split('-').map(Number);
      const monthsDiff = (ey - sy) * 12 + (em - sm);
      if (monthsDiff >= 10) {
        cycleStartDate = session.date;
        indexInCycle = 0;
      } else {
        indexInCycle++;
      }
    }
    if (session.id === app.id) return indexInCycle;
  }
  return -1;
}

/**
 * Verifica o status de faturabilidade de uma sessão neuropsicológica.
 * - 'regular': não é neuropsicológica ou é AMS (tratada por getAmsNeuropsicoSessionIndex)
 * - 'billable': primeira sessão ou após 180 dias → pode faturar
 * - 'blocked': dentro de 180 dias → R$0
 */
export type NeuropsicoStatus =
  | { type: 'regular' }
  | { type: 'billable'; diffDays?: number }
  | { type: 'blocked'; diffDays: number };

export function getNeuropsicoStatus(
  app: Appointment,
  ctx: PricingContext,
): NeuropsicoStatus {
  if (app.type !== AppointmentType.NEUROPSICOLOGICA) return { type: 'regular' };

  const customer = ctx.customers.find(c => c.id === app.customerId);
  if (customer?.healthPlan === HealthPlan.AMS_PETROBRAS) return { type: 'regular' };

  const pastApps = ctx.appointments
    .filter(a =>
      a.customerId === app.customerId &&
      a.type === AppointmentType.NEUROPSICOLOGICA &&
      a.status !== AppointmentStatus.CANCELED &&
      a.date < app.date &&
      a.id !== app.id
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  if (pastApps.length === 0) return { type: 'billable' };

  const lastAppDate    = new Date(pastApps[0].date + 'T12:00:00');
  const currentAppDate = new Date(app.date + 'T12:00:00');
  const diffDays       = differenceInDays(currentAppDate, lastAppDate);

  if (diffDays >= 180) return { type: 'billable', diffDays };
  return { type: 'blocked', diffDays };
}

/**
 * Calcula o preço de um agendamento usando EXATAMENTE as mesmas regras do faturamento:
 * - Cancelado sem cobrança = R$0
 * - AMS Petrobras neuropsico: 1ª→integral, 2ª/3ª→95090010, 4ª+→R$0
 * - Neuropsico outros planos: bloqueia se <180 dias
 * - Usa procedureCode salvo (override manual) com prioridade
 * - Fallback: customPrice > customer.customPrice > procedure.price
 */
export function getAppPrice(app: Appointment, ctx: PricingContext): number {
  if (app.status === AppointmentStatus.CANCELED && app.cancellationBilling === 'none') return 0;

  const customer = ctx.customers.find(c => c.id === app.customerId);
  const plan     = matchPlanByHealthPlan(ctx.plans, customer?.healthPlan);

  // Regra específica AMS Petrobras para Avaliação Neuropsicológica
  if (customer?.healthPlan === HealthPlan.AMS_PETROBRAS && app.type === AppointmentType.NEUROPSICOLOGICA) {
    const sessionIdx = getAmsNeuropsicoSessionIndex(app, ctx);
    if (sessionIdx >= 3) return 0;
    if (sessionIdx === 1 || sessionIdx === 2) {
      const proc95090010 = plan?.procedures?.find(p => p.code === '95090010');
      return app.customPrice ?? proc95090010?.price ?? customer?.customPrice ?? 0;
    }
    const neuroProc = plan?.procedures?.find(p => p.type === AppointmentType.NEUROPSICOLOGICA);
    return app.customPrice ?? neuroProc?.price ?? customer?.customPrice ?? 0;
  }

  // Regra genérica neuropsico — bloqueia dentro de 180 dias
  {
    const status = getNeuropsicoStatus(app, ctx);
    if (status.type === 'blocked') return 0;
  }

  // Preço: prioriza procedureCode salvo (override manual) sem restrição de tipo.
  // O override é intencional (usuário selecionou código no dropdown de faturamento),
  // e pode legitimamente apontar para um tipo diferente de app.type (ex: plano que
  // não tem código de "Avaliação Neuropsicológica" e usa código de "Psicoterapia").
  const procedureByCode = app.procedureCode
    ? plan?.procedures?.find(proc => proc.code === app.procedureCode)
    : undefined;
  const procedure = procedureByCode ?? plan?.procedures?.find(proc => proc.type === app.type);

  const isParticular = customer?.healthPlan === HealthPlan.PARTICULAR;

  // ── LOG DE DIAGNÓSTICO (Avaliação Neuropsicológica) ──────────────────────
  if (app.type === AppointmentType.NEUROPSICOLOGICA) {
    const finalPrice = !isParticular && procedureByCode
      ? procedureByCode.price
      : !isParticular && procedure?.price !== undefined
        ? (app.customPrice ?? procedure.price)
        : (app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0);

    console.group(`[PRICING DIAG] ${app.id} — ${app.date}`);
    console.log('type:', app.type, '| procedureCode:', app.procedureCode ?? '(vazio)');
    console.log('customPrice:', app.customPrice ?? '—', '| customer.customPrice:', customer?.customPrice ?? '—');
    console.log('healthPlan:', customer?.healthPlan, '| plan:', plan?.name ?? '(nenhum)');
    console.log('procedureByCode:', procedureByCode ? `${procedureByCode.code}→R$${procedureByCode.price}` : '—');
    console.log('procedure (tipo):', procedure ? `${procedure.code}→R$${procedure.price}` : '—');
    console.log('→ PREÇO:', `R$${finalPrice}`);
    console.groupEnd();
  }

  // ── Cadeia de prioridade ────────────────────────────────────────────────
  // Convênio COM código explícito (override manual ou auto-atribuído):
  //   → preço do procedimento tem prioridade ABSOLUTA sobre customPrice.
  //   Isso garante que alterar o código no faturamento atualize o preço
  //   imediatamente, sem que um customPrice antigo "trave" o valor.
  if (!isParticular && procedureByCode) {
    return procedureByCode.price;
  }

  // Convênio SEM código explícito (fallback por tipo):
  //   → customPrice pode sobrescrever se definido (caso raro).
  if (!isParticular && procedure?.price !== undefined) {
    return app.customPrice ?? procedure.price;
  }

  // Particular ou sem plano:
  //   → customPrice tem prioridade (preço negociado individualmente).
  return app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
}

/**
 * Calcula a receita total de uma lista de agendamentos,
 * somando getAppPrice para cada um individualmente.
 */
export function calculateRevenueFromApps(apps: Appointment[], ctx: PricingContext): number {
  // Soma em centavos para evitar erros de floating-point
  const totalCents = apps.reduce(
    (sum, app) => sum + Math.round(getAppPrice(app, ctx) * 100),
    0
  );
  return totalCents / 100;
}
