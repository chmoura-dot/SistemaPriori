import { api } from '../../services/api';
import { matchPlanByHealthPlan, supabase } from '../../services/supabase/helpers';
import {
  getAppPrice as sharedGetAppPrice,
  getAmsNeuropsicoSessionIndex as sharedGetAmsNeuropsicoSessionIndex,
  getNeuropsicoStatus as sharedGetNeuropsicoStatus,
  PricingContext,
} from '../../lib/pricing';
import {
  Appointment, Customer, Plan, BillingBatch,
  AppointmentType, HealthPlan, BillingBatchStatus,
} from '../../services/types';

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

const MONTH_NAMES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface BillingHelpersContext {
  appointments: Appointment[]; customers: Customer[]; plans: Plan[]; batches: BillingBatch[];
  neuropsicoDecisions: Record<string, boolean>; selectedPlan: HealthPlan; monthFilter: string;
  includePrevMonth: boolean; includeNextMonth: boolean; selectedAppointmentIds: string[];
  editingDraftBatch: BillingBatch | null;
}

export function createBillingHelpers({
  appointments, customers, plans, batches,
  neuropsicoDecisions, selectedPlan, monthFilter,
  includePrevMonth, includeNextMonth, selectedAppointmentIds, editingDraftBatch,
}: BillingHelpersContext) {

  const pricingCtx: PricingContext = { customers, plans, appointments };
  const getAmsNeuropsicoSessionIndex = (app: Appointment) => sharedGetAmsNeuropsicoSessionIndex(app, pricingCtx);
  const getNeuropsicoStatus = (app: Appointment) => sharedGetNeuropsicoStatus(app, pricingCtx);
  const getAppPrice = (app: Appointment) => sharedGetAppPrice(app, pricingCtx);

  const getTussCode = (app: Appointment): string => {
    const customer = customers.find(c => c.id === app.customerId);
    const effectiveHP = app.healthPlanAtTime ?? customer?.healthPlan;
    const plan = matchPlanByHealthPlan(plans, effectiveHP);
    if (effectiveHP === HealthPlan.AMS_PETROBRAS && app.type === AppointmentType.NEUROPSICOLOGICA) {
      const sessionIdx = getAmsNeuropsicoSessionIndex(app);
      if (sessionIdx >= 3) return '';
      if (sessionIdx === 1 || sessionIdx === 2) return '95090010';
      return plan?.procedures?.find(p => p.type === AppointmentType.NEUROPSICOLOGICA)?.code || app.procedureCode || '';
    }
    return app.procedureCode || plan?.procedures?.find(p => p.type === app.type)?.code || '';
  };

  const getPlanProcedures = (app: Appointment): PlanProcedureInfo[] => {
    const customer = customers.find(c => c.id === app.customerId);
    const plan = matchPlanByHealthPlan(plans, app.healthPlanAtTime ?? customer?.healthPlan);
    return (plan?.procedures ?? []).map(p => ({ code: p.code, type: p.type as AppointmentType, description: p.description, price: p.price }));
  };

  const generateBatchNumber = (plan: HealthPlan, month: string, isDraft = false): string => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return '';
    const sigla = { [HealthPlan.AMS_PETROBRAS]: 'AMS', [HealthPlan.PAE]: 'PAE', [HealthPlan.PORTO_SAUDE]: 'PORTO', [HealthPlan.MEDSENIOR]: 'MEDSN', [HealthPlan.REAL_GRANDEZA]: 'RG', [HealthPlan.SAUDE_BLUE]: 'SBLUE', [HealthPlan.GAMA]: 'GAMA', [HealthPlan.SAUDE_CAIXA]: 'SCAIXA', [HealthPlan.FUNDACAO_SAUDE]: 'FSI', [HealthPlan.PARTICULAR]: 'PART' }[plan] || 'LOTE';
    const monthFormatted = month.replace('-', '');
    if (isDraft) return `RASCUNHO-${sigla}-${monthFormatted}`;
    const existing = batches.filter(b => b.healthPlan === plan && b.sentAt.startsWith(month) && b.status !== BillingBatchStatus.DRAFT);
    return `${sigla}-${monthFormatted}-${String(existing.length + 1).padStart(3, '0')}`;
  };

  const getPlansWithEarlierDrafts = (targetMonth: string): Map<HealthPlan, string> => {
    const blocked = new Map<HealthPlan, string>();
    batches.forEach(b => {
      if (b.status === BillingBatchStatus.DRAFT && b.sentAt.substring(0, 7) < targetMonth) {
        if (!blocked.has(b.healthPlan)) {
          const dm = parseInt(b.sentAt.substring(5, 7)) - 1;
          blocked.set(b.healthPlan, `${MONTH_NAMES_PT[dm]}/${b.sentAt.substring(0, 4)}`);
        }
      }
    });
    return blocked;
  };

  // Mês seguinte à competência (YYYY-MM). Usado quando "incluir próximo mês"
  // está marcado, para antecipar atendimentos do mês posterior neste lote.
  const getNextMonth = (): string | null => {
    if (!monthFilter) return null;
    const [y, m] = monthFilter.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // Determina se o mês (YYYY-MM) de um atendimento está dentro da janela
  // selecionada de competência.
  //
  // Regras (comparação lexicográfica em YYYY-MM é equivalente à cronológica):
  //   • includePrevMonth = true  → competência E TODOS os meses anteriores
  //     (garante que nenhum atendimento antigo fique sem faturamento).
  //   • includePrevMonth = false → apenas a competência exata.
  //   • includeNextMonth = true  → também inclui o mês imediatamente seguinte.
  const isMonthInWindow = (appMonth: string): boolean => {
    if (!monthFilter) return true;
    if (includePrevMonth ? appMonth <= monthFilter : appMonth === monthFilter) return true;
    if (includeNextMonth && appMonth === getNextMonth()) return true;
    return false;
  };

  const getEligibleAppointments = (): Appointment[] => {
    const today = new Date().toISOString().split('T')[0];
    const editingDraftId = editingDraftBatch?.id;
    const draftBatchIds = new Set(batches.filter(b => b.status === BillingBatchStatus.DRAFT).map(b => b.id));
    const billedAppointmentIds = new Set(batches.filter(b => b.status !== BillingBatchStatus.DRAFT).flatMap(b => b.appointmentIds));
    return appointments.filter(a => {
      if (a.isInternal) return false;
      const customer = customers.find(c => c.id === a.customerId);
      const effectivePlan = a.healthPlanAtTime ?? customer?.healthPlan;
      const matchesMonth = isMonthInWindow(a.date.substring(0, 7));
      const isInCurrentDraft = editingDraftId ? a.billingBatchId === editingDraftId : false;
      const isAvailable = !a.billingBatchId || draftBatchIds.has(a.billingBatchId) || !billedAppointmentIds.has(a.id);
      // Oculta atendimentos com valor R$0,00 (ex: cancelamento isento, AMS 4ª+
      // sessão sem cobrança) para não poluir a lista de criação de lote.
      if (getAppPrice(a) <= 0) return false;
      return effectivePlan === selectedPlan && (isInCurrentDraft || isAvailable) && a.date <= today && matchesMonth;
    }).sort((a, b) => a.date.localeCompare(b.date));

  };


  const calculateTotalSelectedAmount = () => appointments.filter(a => selectedAppointmentIds.includes(a.id)).reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;

  const getPendingCountByPlan = () => {
    const today = new Date().toISOString().split('T')[0];
    const counts = new Map<HealthPlan, number>();
    const billedIds = new Set(batches.filter(b => b.status !== BillingBatchStatus.DRAFT).flatMap(b => b.appointmentIds));
    for (const a of appointments) {
      if (a.isInternal || a.date > today || billedIds.has(a.id)) continue;
      const c = customers.find(cx => cx.id === a.customerId);
      const plan = (a.healthPlanAtTime ?? c?.healthPlan) as HealthPlan;
      if (plan) counts.set(plan, (counts.get(plan) || 0) + 1);
    }
    return counts;
  };

  return { getNeuropsicoStatus, getAmsNeuropsicoSessionIndex, getAppPrice, getTussCode, getPlanProcedures, generateBatchNumber, getPlansWithEarlierDrafts, getEligibleAppointments, calculateTotalSelectedAmount, getPendingCountByPlan };
}

export async function syncAppointmentsBatch(batchId: string, prevIds: string[], nextIds: string[]) {
  const toAdd = nextIds.filter(id => !prevIds.includes(id));
  const toRemove = prevIds.filter(id => !nextIds.includes(id));
  await Promise.all([...toAdd.map(id => api.updateAppointment(id, { billingBatchId: batchId })), ...toRemove.map(id => api.updateAppointment(id, { billingBatchId: null as any }))]);
}

export async function auditPriceParity(appIds: string[], appointments: Appointment[], customers: Customer[], plans: Plan[], getAppPrice: (app: Appointment) => number): Promise<void> {
  const jobs = appIds.map(async (id) => {
    const app = appointments.find(a => a.id === id);
    const customer = customers.find(c => c.id === app?.customerId);
    const plan = matchPlanByHealthPlan(plans, app?.healthPlanAtTime ?? customer?.healthPlan);
    if (app && plan) {
      try {
        await supabase.rpc('validate_price_parity', { p_appointment_id: app.id, p_psychologist_id: app.psychologistId, p_plan_id: plan.id, p_date: app.date, p_session_type: app.type, p_price_from_frontend: getAppPrice(app) });
      } catch (e) { console.error('Falha auditoria:', e); }
    }
  });
  await Promise.allSettled(jobs);
}