/**
 * billingHelpers
 * Funções auxiliares puras/derivadas do hook de faturamento.
 * Recebem os dados de estado como parâmetros — sem useState/useEffect.
 */
import { api } from '../../services/api';
import { matchPlanByHealthPlan } from '../../services/supabase/helpers';
import {
  getAppPrice as sharedGetAppPrice,
  getAmsNeuropsicoSessionIndex as sharedGetAmsNeuropsicoSessionIndex,
  getNeuropsicoStatus as sharedGetNeuropsicoStatus,
  PricingContext,
} from '../../lib/pricing';
import {
  Appointment, Customer, Plan, BillingBatch,
  AppointmentStatus, AppointmentType, HealthPlan, BillingBatchStatus,
} from '../../services/types';

/** Tipo retornado por getPlanProcedures */
export interface PlanProcedureInfo {
  code: string;
  type: AppointmentType;
  description: string;
  price: number;
}

export interface AppointmentPaymentStatus {
  status: 'paid' | 'denied';
  reason?: string;
  resolution?: 'accepted' | 'appealed';
}

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface BillingHelpersContext {
  appointments: Appointment[];
  customers: Customer[];
  plans: Plan[];
  batches: BillingBatch[];
  neuropsicoDecisions: Record<string, boolean>;
  selectedPlan: HealthPlan;
  monthFilter: string;
  includePrevMonth: boolean;
  includeNextMonth: boolean;
  selectedAppointmentIds: string[];
  editingDraftBatch: BillingBatch | null;
}

export function createBillingHelpers({
  appointments, customers, plans, batches,
  neuropsicoDecisions, selectedPlan, monthFilter,
  includePrevMonth, includeNextMonth, selectedAppointmentIds, editingDraftBatch,
}: BillingHelpersContext) {

  // Contexto de precificação compartilhado com o Dashboard (mesma fonte de verdade)
  const pricingCtx: PricingContext = { customers, plans, appointments };

  const getAmsNeuropsicoSessionIndex = (app: Appointment): number =>
    sharedGetAmsNeuropsicoSessionIndex(app, pricingCtx);

  const getNeuropsicoStatus = (app: Appointment) =>
    sharedGetNeuropsicoStatus(app, pricingCtx);

  const getAppPrice = (app: Appointment): number =>
    sharedGetAppPrice(app, pricingCtx);

  /** Retorna o código TUSS efetivo para o atendimento (aplica regra AMS se necessário). */
  const getTussCode = (app: Appointment): string => {
    const customer = customers.find(c => c.id === app.customerId);
    const plan     = matchPlanByHealthPlan(plans, customer?.healthPlan);

    // Regra AMS Petrobras: tem prioridade sobre o procedureCode salvo no agendamento.
    // O procedureCode do agendamento (95110011) é preenchido automaticamente e não deve
    // substituir as regras de faturamento da operadora.
    if (customer?.healthPlan === HealthPlan.AMS_PETROBRAS && app.type === AppointmentType.NEUROPSICOLOGICA) {
      const sessionIdx = getAmsNeuropsicoSessionIndex(app);
      if (sessionIdx >= 3) return ''; // 4ª+ sem faturamento
      if (sessionIdx === 1 || sessionIdx === 2) return '95090010'; // 2ª e 3ª → psicoterapia
      // 1ª sessão → código original da avaliação neuropsicológica
      return plan?.procedures?.find(p => p.type === AppointmentType.NEUROPSICOLOGICA)?.code
        || app.procedureCode
        || '';
    }

    // Para outros planos: override manual tem prioridade
    if (app.procedureCode) return app.procedureCode;

    return plan?.procedures?.find(p => p.type === app.type)?.code || '';
  };

  /** Retorna os procedimentos disponíveis do plano do paciente (para override manual). */
  const getPlanProcedures = (app: Appointment): PlanProcedureInfo[] => {
    const customer = customers.find(c => c.id === app.customerId);
    const plan     = matchPlanByHealthPlan(plans, customer?.healthPlan);
    return (plan?.procedures ?? []).map(p => ({
      code: p.code,
      type: p.type as AppointmentType,
      description: p.description,
      price: p.price,
    }));
  };

  const generateBatchNumber = (plan: HealthPlan, month: string, isDraft = false): string => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return '';
    const planSiglas: Record<HealthPlan, string> = {
      [HealthPlan.AMS_PETROBRAS]: 'AMS',
      [HealthPlan.PAE]: 'PAE',
      [HealthPlan.PORTO_SAUDE]: 'PORTO',
      [HealthPlan.MEDSENIOR]: 'MEDSN',
      [HealthPlan.REAL_GRANDEZA]: 'RG',
      [HealthPlan.SAUDE_BLUE]: 'SBLUE',
      [HealthPlan.GAMA]: 'GAMA',
      [HealthPlan.SAUDE_CAIXA]: 'SCAIXA',
      [HealthPlan.FUNDACAO_SAUDE]: 'FSI',
      [HealthPlan.PARTICULAR]: 'PART',
    };
    const sigla          = planSiglas[plan] || 'LOTE';
    const monthFormatted = month.replace('-', '');
    if (isDraft) return `RASCUNHO-${sigla}-${monthFormatted}`;
    const existing = batches.filter(
      b => b.healthPlan === plan && b.sentAt.startsWith(month) && b.status !== BillingBatchStatus.DRAFT
    );
    const seq = String(existing.length + 1).padStart(3, '0');
    return `${sigla}-${monthFormatted}-${seq}`;
  };

  const getMonthsToInclude = (): string[] => {
    if (!monthFilter) return [];
    const months = [monthFilter];
    if (includePrevMonth) {
      const [y, m] = monthFilter.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    if (includeNextMonth) {
      const [y, m] = monthFilter.split('-').map(Number);
      const d = new Date(y, m, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  };

  const getPlansWithEarlierDrafts = (targetMonth: string): Map<HealthPlan, string> => {
    const blocked = new Map<HealthPlan, string>();
    if (!targetMonth) return blocked;
    batches.forEach(b => {
      if (b.status === BillingBatchStatus.DRAFT && b.sentAt.substring(0, 7) < targetMonth) {
        if (!blocked.has(b.healthPlan)) {
          const dm = parseInt(b.sentAt.substring(5, 7)) - 1;
          const dy = b.sentAt.substring(0, 4);
          blocked.set(b.healthPlan, `${MONTH_NAMES_PT[dm]}/${dy}`);
        }
      }
    });
    return blocked;
  };

  const getEligibleAppointments = (): Appointment[] => {
    const today           = new Date().toISOString().split('T')[0];
    const monthsToInclude = getMonthsToInclude();
    const editingDraftId  = editingDraftBatch?.id;

    // IDs de lotes com status DRAFT — atendimentos nesses lotes ainda não foram
    // "enviados" à operadora, portanto continuam elegíveis para novos lotes.
    const draftBatchIds = new Set(
      batches.filter(b => b.status === BillingBatchStatus.DRAFT).map(b => b.id)
    );

    // Fonte de verdade: IDs que estão efetivamente nos appointmentIds de lotes SENT/PAID.
    // Protege contra "estado zumbi" — atendimentos cujo billingBatchId aponta para um lote
    // do qual foram removidos (ou cujo lote foi excluído sem limpar a referência).
    const billedAppointmentIds = new Set(
      batches
        .filter(b => b.status !== BillingBatchStatus.DRAFT)
        .flatMap(b => b.appointmentIds)
    );

    return appointments.filter(a => {
      // Exclui horários internos (supervisão, reunião, etc.) — não são faturáveis
      if (a.isInternal) return false;

      // Cancelados sem cobrança continuam na lista (visíveis, mas não selecionáveis)

      const customer         = customers.find(c => c.id === a.customerId);
      const matchesMonth     = monthsToInclude.length === 0 || monthsToInclude.some(m => a.date.startsWith(m));
      const isInCurrentDraft = editingDraftId ? a.billingBatchId === editingDraftId : false;
      // Um atendimento é "disponível" se:
      //   a) não tem billingBatchId (nunca foi associado a lote), OU
      //   b) está num lote RASCUNHO (draft) — ainda não foi enviado à operadora, OU
      //   c) tem billingBatchId mas NÃO está nos appointmentIds de nenhum lote SENT/PAID
      //      (referência órfã após exclusão de lote ou estado zumbi do auto-save)
      const isAvailable = !a.billingBatchId
        || draftBatchIds.has(a.billingBatchId)
        || !billedAppointmentIds.has(a.id);

      return (
        customer?.healthPlan === selectedPlan &&
        (isInCurrentDraft || isAvailable) &&
        a.date <= today &&
        matchesMonth
      );
    }).sort((a, b) => a.date.localeCompare(b.date));
  };

  const calculateTotalSelectedAmount = (): number => {
    // Soma em centavos (inteiros) para evitar erros de floating-point em valores monetários
    const totalCents = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0);
    return totalCents / 100;
  };

  /** Conta atendimentos disponíveis (não faturados) por plano de saúde. */
  const getPendingCountByPlan = (): Map<HealthPlan, number> => {
    const today = new Date().toISOString().split('T')[0];
    const billedIds = new Set(
      batches.filter(b => b.status !== BillingBatchStatus.DRAFT).flatMap(b => b.appointmentIds)
    );
    const draftIds = new Set(
      batches.filter(b => b.status === BillingBatchStatus.DRAFT).map(b => b.id)
    );
    const counts = new Map<HealthPlan, number>();
    for (const a of appointments) {
      if (a.isInternal || a.date > today) continue;
      const avail = !a.billingBatchId || draftIds.has(a.billingBatchId) || !billedIds.has(a.id);
      if (!avail) continue;
      const c = customers.find(cx => cx.id === a.customerId);
      if (!c?.healthPlan) continue;
      const plan = c.healthPlan as HealthPlan;
      counts.set(plan, (counts.get(plan) || 0) + 1);
    }
    return counts;
  };

  return {
    getNeuropsicoStatus,
    getAmsNeuropsicoSessionIndex,
    getAppPrice,
    getTussCode,
    getPlanProcedures,
    generateBatchNumber,
    getMonthsToInclude,
    getPlansWithEarlierDrafts,
    getEligibleAppointments,
    calculateTotalSelectedAmount,
    getPendingCountByPlan,
  };
}

/** Sincroniza quais appointments estão vinculados a um lote (diff mínimo via API). */
export async function syncAppointmentsBatch(
  batchId: string,
  prevIds: string[],
  nextIds: string[]
) {
  const toAdd    = nextIds.filter(id => !prevIds.includes(id));
  const toRemove = prevIds.filter(id => !nextIds.includes(id));
  await Promise.all([
    ...toAdd.map(id    => api.updateAppointment(id, { billingBatchId: batchId })),
    ...toRemove.map(id => api.updateAppointment(id, { billingBatchId: null as any })),
  ]);
}
