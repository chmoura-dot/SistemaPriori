/**
 * useDashboardData — Orquestrador
 * Combina os 4 sub-hooks em um único objeto de retorno,
 * mantendo a API pública idêntica ao código anterior.
 */
import { useDashboardBase }    from './dashboard/useDashboardBase';
import { useDashboardKPIs }    from './dashboard/useDashboardKPIs';
import { useDashboardClinico } from './dashboard/useDashboardClinico';
import { useDashboardCharts }  from './dashboard/useDashboardCharts';

export function useDashboardData() {
  const base = useDashboardBase();

  const kpis = useDashboardKPIs({
    appointments:        base.appointments,
    appointmentsFiltered: base.appointmentsFiltered,
    appointmentsPrevMonth: base.appointmentsPrevMonth,
    expensesFiltered:    base.expensesFiltered,
    expensesPrevMonth:   base.expensesPrevMonth,
    customers:           base.customers,
    psychologists:       base.psychologists,
    subscriptions:       base.subscriptions,
    waitingList:         base.waitingList,
    subscriptionRevenue: base.subscriptionRevenue,
    today:               base.today,
    todayStr:            base.todayStr,
    filterMode:          base.filterMode,
    selectedMonth:       base.selectedMonth,
    selectedYear:        base.selectedYear,
    isInSelectedPeriod:  base.isInSelectedPeriod,
    isInPrevPeriod:      base.isInPrevPeriod,
    findPlan:            base.findPlan,
    isCanceledButBilled: base.isCanceledButBilled,
    calculateRevenue:    base.calculateRevenue,
  });

  const clinico = useDashboardClinico({
    appointmentsFiltered: base.appointmentsFiltered,
    appointments:         base.appointments,
    appsRealizados:       kpis.appsRealizados,
    customers:            base.customers,
    todayStr:             base.todayStr,
    today:                base.today,
    totalAppsScheduled:   kpis.totalAppsScheduled,
    activeCustomersCount: kpis.activeCustomersCount,
    isCanceledButBilled:  base.isCanceledButBilled,
    isInSelectedPeriod:   base.isInSelectedPeriod,
  });

  const charts = useDashboardCharts({
    appointmentsFiltered: base.appointmentsFiltered,
    appointments:         base.appointments,
    expenses:             base.expenses,
    customers:            base.customers,
    psychologists:        base.psychologists,
    plans:                base.plans,
    appsRealizados:       kpis.appsRealizados,
    appsNaoCancelados:    kpis.appsNaoCancelados,
    workingDaysInMonth:   kpis.workingDaysInMonth,
    findPlan:             base.findPlan,
    calculateRevenue:     base.calculateRevenue,
    isCanceledButBilled:  base.isCanceledButBilled,
  });

  return {
    // ── Base ────────────────────────────────────────────────────────────────
    ...base,
    // ── KPIs / Financeiro / Alertas ─────────────────────────────────────────
    ...kpis,
    // ── Clínico ─────────────────────────────────────────────────────────────
    ...clinico,
    // ── Gráficos / Equipe ────────────────────────────────────────────────────
    ...charts,
    // Callbacks utilitários explícitos (para consumidores que importam por nome)
    findPlan:            base.findPlan,
    isCanceledButBilled: base.isCanceledButBilled,
  };
}
