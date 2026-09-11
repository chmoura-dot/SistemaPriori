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
 * Classificação de cobrança de uma tentativa (sessão real ou falta faturada)
 * dentro do ciclo AMS Petrobras de Avaliação Neuropsicológica.
 */
export type AmsNeuropsicoCharge = 'integral' | 'code_95090010' | 'blocked';

interface AmsNeuropsicoCycleResult {
  position: number;
  charge: AmsNeuropsicoCharge;
}

/**
 * Uma falta (status CANCELED) "consome" posição no ciclo AMS quando ela
 * efetivamente gera cobrança ao convênio — ou seja, quando não se enquadra na
 * regra de isenção total de getAppPrice (cancellationBilling='none', exceto o
 * caso 'patient_exempt' que também cobra o convênio). Falta totalmente isenta
 * (sem cobrança nenhuma) não consome posição nem é considerada aqui.
 */
function isBilledFalta(a: Appointment): boolean {
  if (a.status !== AppointmentStatus.CANCELED) return false;
  if (a.cancellationBilling && a.cancellationBilling !== 'none') return true;
  return a.cancellationFault === 'patient_exempt';
}

/**
 * Percorre o ciclo (até 10 meses) de tentativas de Avaliação Neuropsicológica
 * de um paciente AMS Petrobras — contando tanto sessões realmente realizadas
 * quanto faltas que geram cobrança ao convênio (isBilledFalta) numa única fila
 * cronológica compartilhada — e classifica cada uma:
 *
 *  - Posição ≥ 3 no ciclo → sempre bloqueada (R$0), comparecendo ou faltando.
 *  - Comparecimento real, e o valor integral ainda não foi cobrado no ciclo
 *    → cobra o integral (a 1ª vez que a avaliação é de fato entregue).
 *  - Qualquer outro caso dentro do ciclo (falta, ou comparecimento com
 *    integral já usado) → cobra o código 95090010, até no máximo 2 vezes por
 *    ciclo; esgotado esse limite, também bloqueia (R$0).
 *
 * Retorna null se não for AMS Petrobras / Avaliação Neuropsicológica, ou se o
 * agendamento não for encontrado na própria fila (ex.: falta isenta).
 */
function computeAmsNeuropsicoCycle(
  app: Appointment,
  ctx: PricingContext,
): AmsNeuropsicoCycleResult | null {
  if (app.type !== AppointmentType.NEUROPSICOLOGICA) return null;
  const customer = ctx.customers.find(c => c.id === app.customerId);
  if (customer?.healthPlan !== HealthPlan.AMS_PETROBRAS) return null;

  const attempts = ctx.appointments
    .filter(a =>
      a.customerId === app.customerId &&
      a.type === AppointmentType.NEUROPSICOLOGICA &&
      (a.status !== AppointmentStatus.CANCELED || isBilledFalta(a))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  let cycleStartDate: string | null = null;
  let position = -1;
  let integralUsed = false;
  let code95090010Count = 0;

  for (const attempt of attempts) {
    const attended = attempt.status !== AppointmentStatus.CANCELED;

    if (cycleStartDate === null) {
      cycleStartDate = attempt.date;
      position = 0;
    } else {
      const [sy, sm] = cycleStartDate.split('-').map(Number);
      const [ey, em] = attempt.date.split('-').map(Number);
      const monthsDiff = (ey - sy) * 12 + (em - sm);
      if (monthsDiff >= 10) {
        cycleStartDate = attempt.date;
        position = 0;
        integralUsed = false;
        code95090010Count = 0;
      } else {
        position++;
      }
    }

    let charge: AmsNeuropsicoCharge;
    if (position >= 3) {
      charge = 'blocked';
    } else if (attended && !integralUsed) {
      charge = 'integral';
      integralUsed = true;
    } else if (code95090010Count < 2) {
      charge = 'code_95090010';
      code95090010Count++;
    } else {
      charge = 'blocked';
    }

    if (attempt.id === app.id) return { position, charge };
  }
  return null;
}

/**
 * Retorna o índice (0-based) da tentativa dentro do ciclo AMS Petrobras —
 * conta sessões reais e faltas faturadas na mesma fila. Uso: exibição
 * ("AMS 2ª") — para decidir o VALOR a cobrar, use getAmsNeuropsicoCharge.
 * Retorna -1 se não for AMS ou não for Avaliação Neuropsicológica.
 */
export function getAmsNeuropsicoSessionIndex(
  app: Appointment,
  ctx: PricingContext,
): number {
  return computeAmsNeuropsicoCycle(app, ctx)?.position ?? -1;
}

/**
 * Retorna como cobrar esta tentativa no ciclo AMS Petrobras (ver regra em
 * computeAmsNeuropsicoCycle). Retorna null se não for AMS/Avaliação
 * Neuropsicológica.
 */
export function getAmsNeuropsicoCharge(
  app: Appointment,
  ctx: PricingContext,
): AmsNeuropsicoCharge | null {
  return computeAmsNeuropsicoCycle(app, ctx)?.charge ?? null;
}

/**
 * Detecta se o ciclo AMS Petrobras ATUAL (o mais recente, ainda dentro da
 * janela de 10 meses) de um paciente já esgotou as 3 tentativas sem que o
 * paciente tenha comparecido nenhuma vez — ou seja, a avaliação nunca foi de
 * fato entregue, mas o ciclo não tem mais posições cobráveis. Usado para
 * alertar a secretária ao tentar marcar um novo atendimento para esse
 * paciente, já que agendar não vai resolver a cobrança sozinho.
 */
export function amsNeuropsicoCycleNeedsAttention(
  customerId: string,
  ctx: PricingContext,
): boolean {
  const customer = ctx.customers.find(c => c.id === customerId);
  if (customer?.healthPlan !== HealthPlan.AMS_PETROBRAS) return false;

  const attempts = ctx.appointments
    .filter(a =>
      a.customerId === customerId &&
      a.type === AppointmentType.NEUROPSICOLOGICA &&
      (a.status !== AppointmentStatus.CANCELED || isBilledFalta(a))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  let cycleStartDate: string | null = null;
  let cycleAttempts: Appointment[] = [];

  for (const attempt of attempts) {
    if (cycleStartDate === null) {
      cycleStartDate = attempt.date;
      cycleAttempts = [attempt];
    } else {
      const [sy, sm] = cycleStartDate.split('-').map(Number);
      const [ey, em] = attempt.date.split('-').map(Number);
      const monthsDiff = (ey - sy) * 12 + (em - sm);
      if (monthsDiff >= 10) {
        cycleStartDate = attempt.date;
        cycleAttempts = [attempt];
      } else {
        cycleAttempts.push(attempt);
      }
    }
  }

  const everAttended = cycleAttempts.some(a => a.status !== AppointmentStatus.CANCELED);
  return cycleAttempts.length >= 3 && !everAttended;
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
  const customer = ctx.customers.find(c => c.id === app.customerId);
  // Usa o plano histórico gravado no agendamento; fallback para o plano atual do paciente
  const effectiveHealthPlan = (app.healthPlanAtTime ?? customer?.healthPlan) as HealthPlan | undefined;
  const isParticularPlan = !effectiveHealthPlan || effectiveHealthPlan === HealthPlan.PARTICULAR;

  // Cancelado sem cobrança = R$0, EXCETO no caso "Falta do Paciente — Isento"
  // (cancellationFault='patient_exempt') de um paciente de CONVÊNIO: nesse
  // caso o convênio é cobrado normalmente (autorização já consumida), mas o
  // repasse ao psicólogo é bloqueado separadamente por isRepassBlocked.
  // Particular isento continua R$0 (não há convênio para cobrar).
  if (app.status === AppointmentStatus.CANCELED && app.cancellationBilling === 'none') {
    const isPatientExemptAtPlanCovered = app.cancellationFault === 'patient_exempt' && !isParticularPlan;
    if (!isPatientExemptAtPlanCovered) return 0;
  }

  const plan = matchPlanByHealthPlan(ctx.plans, effectiveHealthPlan);

  // Regra específica AMS Petrobras para Avaliação Neuropsicológica
  if (effectiveHealthPlan === HealthPlan.AMS_PETROBRAS && app.type === AppointmentType.NEUROPSICOLOGICA) {
    const charge = getAmsNeuropsicoCharge(app, ctx);
    if (charge === 'blocked' || charge === null) return 0;
    if (charge === 'code_95090010') {
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
  const overrideCode = app.procedureCode?.trim();
  const procedureByCode = overrideCode
    ? plan?.procedures?.find(proc => proc.code?.trim() === overrideCode)
    : undefined;
  const procedure = procedureByCode ?? plan?.procedures?.find(proc => proc.type === app.type);

  const isParticular = effectiveHealthPlan === HealthPlan.PARTICULAR;

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
 * Determina se um atendimento está BLOQUEADO para repasse ao psicólogo.
 *
 * Regra de negócio:
 *  • Falta do PSICÓLOGO (cancellationFault='psychologist') → nunca repassa,
 *    mesmo quando o convênio é cobrado normalmente (autorização por sessão
 *    já consumida). Quem faltou foi o profissional.
 *  • Falta do PACIENTE marcada como "Isento" (cancellationFault=
 *    'patient_exempt') → o convênio pode ser cobrado (getAppPrice), mas o
 *    repasse também é bloqueado: a clínica optou por não cobrar do paciente,
 *    então não há base para repassar ao profissional.
 *  • Falta do PACIENTE normal ('patient') ou sessão realizada → mantém o
 *    repasse normalmente, pois o profissional compareceu / reservou o horário.
 *
 * O faturamento (getAppPrice) tem sua PRÓPRIA guarda equivalente — ver o
 * bloco "Cancelado sem cobrança" em getAppPrice, que já trata o caso
 * 'patient_exempt' de convênio como faturável.
 */
export function isRepassBlocked(app: Appointment): boolean {
  if (app.status !== AppointmentStatus.CANCELED) return false;
  return app.cancellationFault === 'psychologist' || app.cancellationFault === 'patient_exempt';
}

/**
 * Determina COMO faturar uma FALTA DO PSICÓLOGO conforme o plano do paciente.
 *
 * Regra de negócio:
 *  • Particular / sem plano → NÃO cobra ('none'). Não se cobra do paciente
 *    por uma falha da clínica.
 *  • Convênios (incluindo AMS Petrobras) → COBRA ('plan'). A autorização é
 *    solicitada por sessão junto ao convênio e é "consumida" independente
 *    do comparecimento do profissional — o convênio reconhece o atendimento.
 *
 * Em TODOS os casos o repasse ao psicólogo é bloqueado (ver isRepassBlocked),
 * pois quem faltou foi o profissional: a clínica não paga por atendimento não
 * realizado, mesmo quando cobra do convênio.
 *
 * @param effectiveHealthPlan Plano vigente do atendimento (healthPlanAtTime ?? customer.healthPlan)
 */
export function resolvePsychologistAbsenceBilling(
  effectiveHealthPlan: HealthPlan | string | undefined,
): 'none' | 'plan' {
  if (!effectiveHealthPlan || effectiveHealthPlan === HealthPlan.PARTICULAR) {
    return 'none';
  }
  return 'plan';
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
