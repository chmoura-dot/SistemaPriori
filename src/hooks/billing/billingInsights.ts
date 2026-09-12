/**
 * billingInsights
 * Cálculos derivados (puros, sem efeitos colaterais) para o painel de
 * insights da aba de Faturamento: série mensal de confirmado x recebido e
 * desempenho por operadora (taxa de glosa, prazo médio de pagamento).
 */
import { Appointment, BillingBatch, BillingBatchStatus, HealthPlan } from '../../services/types';

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const monthKeyOf = (iso: string): string => iso.substring(0, 7);

const shiftMonthKey = (base: Date, monthsBack: number): string => {
  const d = new Date(base.getFullYear(), base.getMonth() - monthsBack, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export interface MonthlyChartPoint {
  monthKey: string; // YYYY-MM
  label: string;     // "Set"
  confirmado: number; // total faturado (lotes não-draft) cujo envio caiu no mês
  recebido: number;   // total efetivamente recebido (por atendimento) no mês
}

/**
 * Série dos últimos `monthsBack` meses (padrão 6, incluindo o mês corrente).
 * - confirmado: soma do totalAmount de lotes não-DRAFT cujo `sentAt` caiu no mês.
 * - recebido: soma, por ATENDIMENTO (não por lote), do valor dos itens com
 *   billingStatus 'paid' cujo `paidAt` caiu no mês — funciona tanto para lotes
 *   já totalmente PAID quanto para os ainda PARTIALLY_PAID (que não têm
 *   paidAt no lote, só nos itens já resolvidos).
 */
export function getMonthlyChartData(
  batches: BillingBatch[],
  appointments: Appointment[],
  getAppPrice: (app: Appointment) => number,
  monthsBack = 6,
  now: Date = new Date(),
): MonthlyChartPoint[] {
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) months.push(shiftMonthKey(now, i));

  const apptById = new Map(appointments.map(a => [a.id, a]));
  const billableBatches = batches.filter(b => b.status !== BillingBatchStatus.DRAFT);

  return months.map(monthKey => {
    const confirmado = billableBatches
      .filter(b => monthKeyOf(b.sentAt) === monthKey)
      .reduce((sum, b) => sum + b.totalAmount, 0);

    let recebido = 0;
    for (const b of billableBatches) {
      for (const id of b.appointmentIds) {
        const a = apptById.get(id);
        if (!a || a.billingStatus !== 'paid' || !a.paidAt) continue;
        if (monthKeyOf(a.paidAt) === monthKey) recebido += getAppPrice(a);
      }
    }

    const [, m] = monthKey.split('-').map(Number);
    return {
      monthKey,
      label: MONTH_NAMES_SHORT[m - 1],
      confirmado: Math.round(confirmado * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
    };
  });
}

export interface OperadoraPerformance {
  healthPlan: HealthPlan;
  glosaRate: number;            // 0-100
  avgDaysToPay: number | null;  // null quando não há lotes totalmente pagos para medir
  resolvedCount: number;
  paidBatchCount: number;
}

/**
 * Desempenho por operadora: taxa de glosa (glosados / resolvidos, entre
 * atendimentos cobráveis) e prazo médio, em dias corridos, entre o envio do
 * lote (sentAt) e sua quitação total (paidAt) — só considera lotes já 100%
 * PAID, já que é quando temos as duas datas com confiança.
 */
export function getOperadoraPerformance(
  batches: BillingBatch[],
  appointments: Appointment[],
  getAppPrice: (app: Appointment) => number,
): OperadoraPerformance[] {
  const apptById = new Map(appointments.map(a => [a.id, a]));
  const byPlan = new Map<HealthPlan, { resolved: number; denied: number; dayTotals: number[]; paidBatchCount: number }>();

  for (const b of batches) {
    if (b.status === BillingBatchStatus.DRAFT) continue;
    const entry = byPlan.get(b.healthPlan) ?? { resolved: 0, denied: 0, dayTotals: [], paidBatchCount: 0 };

    for (const id of b.appointmentIds) {
      const a = apptById.get(id);
      if (!a || getAppPrice(a) <= 0) continue;
      if (a.billingStatus === 'paid' || a.billingStatus === 'denied') entry.resolved += 1;
      if (a.billingStatus === 'denied') entry.denied += 1;
    }

    if (b.status === BillingBatchStatus.PAID && b.paidAt) {
      const days = (new Date(b.paidAt).getTime() - new Date(b.sentAt).getTime()) / 86400000;
      if (Number.isFinite(days) && days >= 0) {
        entry.dayTotals.push(days);
        entry.paidBatchCount += 1;
      }
    }

    byPlan.set(b.healthPlan, entry);
  }

  return Array.from(byPlan.entries())
    .filter(([, v]) => v.resolved > 0)
    .map(([healthPlan, v]) => ({
      healthPlan,
      glosaRate: v.resolved > 0 ? (v.denied / v.resolved) * 100 : 0,
      avgDaysToPay: v.dayTotals.length > 0
        ? Math.round(v.dayTotals.reduce((s, d) => s + d, 0) / v.dayTotals.length)
        : null,
      resolvedCount: v.resolved,
      paidBatchCount: v.paidBatchCount,
    }))
    .sort((a, b) => b.glosaRate - a.glosaRate);
}

export interface Trend {
  pct: number;
  direction: 'up' | 'down' | 'flat';
}

/** Variação percentual absoluta entre dois valores, com guarda para divisão por zero. */
export function pctChange(current: number, previous: number): Trend {
  if (previous <= 0) {
    if (current <= 0) return { pct: 0, direction: 'flat' };
    return { pct: 100, direction: 'up' };
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, direction: 'flat' };
  return { pct: Math.round(Math.abs(pct)), direction: pct > 0 ? 'up' : 'down' };
}
