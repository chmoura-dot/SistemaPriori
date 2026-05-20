/**
 * billingHelpers
 * Funções auxiliares puras/derivadas do hook de faturamento.
 * Recebem os dados de estado como parâmetros — sem useState/useEffect.
 */
import { differenceInMonths, differenceInDays } from 'date-fns';
import { api } from '../../services/api';
import {
  Appointment, Customer, Plan, BillingBatch,
  AppointmentStatus, AppointmentType, HealthPlan, BillingBatchStatus,
} from '../../services/types';

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

  const getNeuropsicoStatus = (app: Appointment) => {
    if (app.type !== AppointmentType.NEUROPSICOLOGICA) return { type: 'regular' as const };

    const pastApps = appointments
      .filter(a =>
        a.customerId === app.customerId &&
        a.type === AppointmentType.NEUROPSICOLOGICA &&
        a.date < app.date &&
        a.id !== app.id
      )
      .sort((a, b) => b.date.localeCompare(a.date));

    if (pastApps.length === 0) return { type: 'billable' as const };

    const lastAppDate     = new Date(pastApps[0].date + 'T12:00:00');
    const currentAppDate  = new Date(app.date + 'T12:00:00');
    const diffMonths      = differenceInMonths(currentAppDate, lastAppDate);
    const diffDays        = differenceInDays(currentAppDate, lastAppDate);

    if (diffMonths >= 11) return { type: 'billable' as const, diffDays };
    if (diffDays <= 90)   return { type: 'blocked' as const, diffDays };
    return { type: 'ask' as const, diffDays };
  };

  const getAppPrice = (app: Appointment): number => {
    if (app.status === AppointmentStatus.CANCELED && app.cancellationBilling === 'none') return 0;
    const status = getNeuropsicoStatus(app);
    if (status.type === 'blocked') return 0;
    if (status.type === 'ask' && !neuropsicoDecisions[app.id]) return 0;

    const customer  = customers.find(c => c.id === app.customerId);
    const plan      = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
    const procedure = plan?.procedures?.find(proc => proc.type === app.type);
    return app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
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
      const isAvailable     = !a.billingBatchId && !a.billingIgnored;
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
    getAppPrice,
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
