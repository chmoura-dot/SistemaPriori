/**
 * useDashboardData — Orquestrador V2
 * Combina os sub-hooks originais + 3 novos hooks do Dashboard V2
 * em um único objeto de retorno.
 */
import { useMemo } from 'react';
import { useDashboardBase }        from './dashboard/useDashboardBase';
import { useDashboardKPIs }        from './dashboard/useDashboardKPIs';
import { useDashboardClinico }     from './dashboard/useDashboardClinico';
import { useDashboardCharts }      from './dashboard/useDashboardCharts';
import { useDashboardFinanceiro }  from './dashboard/useDashboardFinanceiro';
import { useDashboardOperacional } from './dashboard/useDashboardOperacional';
import { useDashboardCaptacao }    from './dashboard/useDashboardCaptacao';
import { PricingContext } from '../lib/pricing';

export function useDashboardData() {
  const base = useDashboardBase();

  // Contexto de precificação (compartilhado entre hooks)
  const pricingCtx: PricingContext = useMemo(() => ({
    customers: base.customers,
    plans: base.plans,
    appointments: base.appointments,
  }), [base.customers, base.plans, base.appointments]);

  const kpis = useDashboardKPIs({
    appointments:         base.appointments,
    appointmentsFiltered: base.appointmentsFiltered,
    appointmentsPrevMonth: base.appointmentsPrevMonth,
    expensesFiltered:     base.expensesFiltered,
    expensesPrevMonth:    base.expensesPrevMonth,
    customers:            base.customers,
    psychologists:        base.psychologists,
    subscriptions:        base.subscriptions,
    waitingList:          base.waitingList,
    subscriptionRevenue:  base.subscriptionRevenue,
    today:                base.today,
    todayStr:             base.todayStr,
    filterMode:           base.filterMode,
    selectedMonth:        base.selectedMonth,
    selectedYear:         base.selectedYear,
    isInSelectedPeriod:   base.isInSelectedPeriod,
    isInPrevPeriod:       base.isInPrevPeriod,
    findPlan:             base.findPlan,
    isCanceledButBilled:  base.isCanceledButBilled,
    calculateRevenue:     base.calculateRevenue,
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

  // ── NOVOS HOOKS V2 ──────────────────────────────────────────────────────
  const financeiro = useDashboardFinanceiro({
    appointments:         base.appointments,
    appointmentsFiltered: base.appointmentsFiltered,
    appsRealizados:       kpis.appsRealizados,
    appsRealizadosPrev:   kpis.appsRealizadosPrev,
    customers:            base.customers,
    psychologists:        base.psychologists,
    plans:                base.plans,
    expenses:             base.expenses,
    expensesFiltered:     base.expensesFiltered,
    expensesPrevMonth:    base.expensesPrevMonth,
    subscriptionRevenue:  base.subscriptionRevenue,
    findPlan:             base.findPlan,
    calculateRevenue:     base.calculateRevenue,
    isCanceledButBilled:  base.isCanceledButBilled,
    filterMode:           base.filterMode,
    pricingCtx,
  });

  const operacional = useDashboardOperacional({
    appointments:         base.appointments,
    appointmentsFiltered: base.appointmentsFiltered,
    appsRealizados:       kpis.appsRealizados,
    customers:            base.customers,
    psychologists:        base.psychologists,
    today:                base.today,
    todayStr:             base.todayStr,
    filterMode:           base.filterMode,
    selectedMonth:        base.selectedMonth,
    selectedYear:         base.selectedYear,
    isInSelectedPeriod:   base.isInSelectedPeriod,
    activeCustomersCount: kpis.activeCustomersCount,
    calculateRevenue:     base.calculateRevenue,
    isCanceledButBilled:  base.isCanceledButBilled,
    pricingCtx,
  });

  const captacao = useDashboardCaptacao({
    appointments:         base.appointments,
    appointmentsFiltered: base.appointmentsFiltered,
    appsRealizados:       kpis.appsRealizados,
    customers:            base.customers,
    psychologists:        base.psychologists,
    expenses:             base.expenses,
    expensesFiltered:     base.expensesFiltered,
    waitingList:          base.waitingList,
    today:                base.today,
    filterMode:           base.filterMode,
    selectedMonth:        base.selectedMonth,
    selectedYear:         base.selectedYear,
    isInSelectedPeriod:   base.isInSelectedPeriod,
    isInPrevPeriod:       base.isInPrevPeriod,
    calculateRevenue:     base.calculateRevenue,
    isCanceledButBilled:  base.isCanceledButBilled,
    activeCustomersCount: kpis.activeCustomersCount,
    ticketMedioConsulta:  kpis.ticketMedioConsulta,
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
    // ── V2: Financeiro Avançado ──────────────────────────────────────────────
    financeiro,
    // ── V2: Operacional ─────────────────────────────────────────────────────
    operacional,
    // ── V2: Captação ────────────────────────────────────────────────────────
    captacao,
    // Callbacks utilitários explícitos (para consumidores que importam por nome)
    findPlan:            base.findPlan,
    isCanceledButBilled: base.isCanceledButBilled,
  };
}
