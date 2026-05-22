/**
 * billingHelpers
 * Funções auxiliares puras/derivadas do hook de faturamento.
 * Recebem os dados de estado como parâmetros — sem useState/useEffect.
 */
import { differenceInDays } from 'date-fns';
import { api } from '../../services/api';
import { matchPlanByHealthPlan } from '../../services/supabase/helpers';
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

  /** Retorna o índice (0-based) da sessão neuropsicológica para pacientes AMS Petrobras,
   *  dentro do ciclo de 10 meses a partir da 1ª sessão do ciclo.
   *  Após 10 meses, um novo ciclo começa (índice volta a 0).
   *  Retorna -1 se não for AMS ou não for Avaliação Neuropsicológica. */
  const getAmsNeuropsicoSessionIndex = (app: Appointment): number => {
    if (app.type !== AppointmentType.NEUROPSICOLOGICA) return -1;
    const customer = customers.find(c => c.id === app.customerId);
    if (customer?.healthPlan !== HealthPlan.AMS_PETROBRAS) return -1;

    const allSessions = appointments
      .filter(a =>
        a.customerId === app.customerId &&
        a.type === AppointmentType.NEUROPSICOLOGICA &&
        a.status !== AppointmentStatus.CANCELED
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    // Agrupa sessões em ciclos de 10 meses a partir da 1ª sessão de cada ciclo.
    // Ao atingir 10 meses, inicia novo ciclo com índice 0.
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
          // Nova sessão fora da janela de 10 meses → inicia novo ciclo
          cycleStartDate = session.date;
          indexInCycle = 0;
        } else {
          indexInCycle++;
        }
      }
      if (session.id === app.id) return indexInCycle;
    }

    return -1;
  };

  const getNeuropsicoStatus = (app: Appointment) => {
    if (app.type !== AppointmentType.NEUROPSICOLOGICA) return { type: 'regular' as const };

    // AMS Petrobras tem regra própria — tratada por getAmsNeuropsicoSessionIndex
    const customer = customers.find(c => c.id === app.customerId);
    if (customer?.healthPlan === HealthPlan.AMS_PETROBRAS) return { type: 'regular' as const };

    const pastApps = appointments
      .filter(a =>
        a.customerId === app.customerId &&
        a.type === AppointmentType.NEUROPSICOLOGICA &&
        a.status !== AppointmentStatus.CANCELED &&
        a.date < app.date &&
        a.id !== app.id
      )
      .sort((a, b) => b.date.localeCompare(a.date));

    if (pastApps.length === 0) return { type: 'billable' as const };

    const lastAppDate    = new Date(pastApps[0].date + 'T12:00:00');
    const currentAppDate = new Date(app.date + 'T12:00:00');
    const diffDays       = differenceInDays(currentAppDate, lastAppDate);

    // Após 6 meses (≥ 180 dias) desde a última sessão, permite faturar novamente
    if (diffDays >= 180) return { type: 'billable' as const, diffDays };

    // Dentro de 6 meses: bloqueia automaticamente (R$ 0, sem perguntar)
    return { type: 'blocked' as const, diffDays };
  };

  const getAppPrice = (app: Appointment): number => {
    if (app.status === AppointmentStatus.CANCELED && app.cancellationBilling === 'none') return 0;

    const customer = customers.find(c => c.id === app.customerId);
    const plan     = matchPlanByHealthPlan(plans, customer?.healthPlan);

    // Regra específica AMS Petrobras para Avaliação Neuropsicológica.
    // Tem prioridade sobre qualquer procedureCode salvo no agendamento,
    // pois o procedureCode é preenchido automaticamente pelo ProcedureSelector
    // e não deve anular as regras de faturamento da operadora.
    if (customer?.healthPlan === HealthPlan.AMS_PETROBRAS && app.type === AppointmentType.NEUROPSICOLOGICA) {
      const sessionIdx = getAmsNeuropsicoSessionIndex(app);
      if (sessionIdx >= 3) return 0; // 4ª sessão em diante: sem cobrança
      if (sessionIdx === 1 || sessionIdx === 2) {
        // 2ª e 3ª sessão: cobra com código 95090010
        const proc95090010 = plan?.procedures?.find(p => p.code === '95090010');
        return app.customPrice ?? customer?.customPrice ?? proc95090010?.price ?? 0;
      }
      // 1ª sessão (sessionIdx === 0): cobra como avaliação neuropsicológica
      const neuroProc = plan?.procedures?.find(p => p.type === AppointmentType.NEUROPSICOLOGICA);
      return app.customPrice ?? customer?.customPrice ?? neuroProc?.price ?? 0;
    }

    // Regra genérica para neuropsico de outros planos — bloqueia independente de procedureCode
    {
      const status = getNeuropsicoStatus(app);
      if (status.type === 'blocked') return 0;
    }

    // Preço: prioriza o código de procedimento salvo (override manual), depois o tipo
    const procedure = app.procedureCode
      ? plan?.procedures?.find(proc => proc.code === app.procedureCode)
      : plan?.procedures?.find(proc => proc.type === app.type);
    return app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
  };

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
    const today         = new Date().toISOString().split('T')[0];
    const monthsToInclude = getMonthsToInclude();
    const editingDraftId  = editingDraftBatch?.id;

    return appointments.filter(a => {
      const customer        = customers.find(c => c.id === a.customerId);
      const matchesMonth    = monthsToInclude.length === 0 || monthsToInclude.some(m => a.date.startsWith(m));
      const isInCurrentDraft = editingDraftId ? a.billingBatchId === editingDraftId : false;
      // Inclui disponíveis (não ignorados) e também os ignorados (visíveis mas bloqueados)
      const isAvailable     = !a.billingBatchId;
      return (
        customer?.healthPlan === selectedPlan &&
        (isInCurrentDraft || isAvailable) &&
        a.date <= today &&
        matchesMonth
      );
    }).sort((a, b) => a.date.localeCompare(b.date));
  };

  const calculateTotalSelectedAmount = (): number =>
    appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);

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
