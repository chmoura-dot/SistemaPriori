/**
 * useDashboardKPIs
 * Calcula: conjuntos de agendamentos, taxas, receitas, ticket médio,
 * novos pacientes, forecast, agenda do dia, ocupação e alertas.
 */
import { useMemo } from 'react';
import {
  Appointment, Customer, Psychologist, Plan, Subscription, Expense, WaitingListEntry,
  AppointmentStatus, SubscriptionStatus, CustomerStatus,
} from '../../services/types';
import { calcRepass } from '../../lib/repassRules';

interface DashboardKPIsParams {
  appointments: Appointment[];
  appointmentsFiltered: Appointment[];
  appointmentsPrevMonth: Appointment[];
  expensesFiltered: Expense[];
  expensesPrevMonth: Expense[];
  customers: Customer[];
  psychologists: Psychologist[];
  subscriptions: Subscription[];
  waitingList: WaitingListEntry[];
  subscriptionRevenue: number;
  today: Date;
  todayStr: string;
  filterMode: 'month' | 'year' | 'all';
  selectedMonth: number;
  selectedYear: number;
  isInSelectedPeriod: (dateStr: string) => boolean;
  isInPrevPeriod: (dateStr: string) => boolean;
  findPlan: (healthPlan?: string) => Plan | undefined;
  isCanceledButBilled: (app: Appointment) => boolean;
  calculateRevenue: (apps: Appointment[]) => number;
}

export function useDashboardKPIs({
  appointments, appointmentsFiltered, appointmentsPrevMonth,
  expensesFiltered, expensesPrevMonth, customers, psychologists,
  subscriptions, waitingList, subscriptionRevenue,
  today, todayStr, filterMode, selectedMonth, selectedYear,
  isInSelectedPeriod, isInPrevPeriod, findPlan, isCanceledButBilled, calculateRevenue,
}: DashboardKPIsParams) {

  // ─── Conjuntos de agendamentos ────────────────────────────────────────────
  const appsRealizados = useMemo(() =>
    appointmentsFiltered.filter(app => app.confirmedPsychologist || isCanceledButBilled(app)),
    [appointmentsFiltered, isCanceledButBilled]
  );
  const appsPrevistos = useMemo(() =>
    appointmentsFiltered.filter(app => !app.confirmedPsychologist && app.status !== AppointmentStatus.CANCELED),
    [appointmentsFiltered]
  );
  const appsRealizadosPrev = useMemo(() =>
    appointmentsPrevMonth.filter(app => app.confirmedPsychologist || isCanceledButBilled(app)),
    [appointmentsPrevMonth, isCanceledButBilled]
  );
  const appsNaoCancelados = useMemo(() =>
    appointmentsFiltered.filter(a => a.status !== AppointmentStatus.CANCELED),
    [appointmentsFiltered]
  );
  const appsNaoCanceladosPrev = useMemo(() =>
    appointmentsPrevMonth.filter(a => a.status !== AppointmentStatus.CANCELED),
    [appointmentsPrevMonth]
  );

  // ─── KPIs de taxas ───────────────────────────────────────────────────────
  const totalAppsScheduled = appointmentsFiltered.length;
  const totalAppsCanceled = useMemo(() =>
    appointmentsFiltered.filter(app => app.status === AppointmentStatus.CANCELED).length,
    [appointmentsFiltered]
  );
  const cancelationRate    = totalAppsScheduled > 0 ? (totalAppsCanceled / totalAppsScheduled) * 100 : 0;
  const attendanceRate     = totalAppsScheduled > 0 ? (appsRealizados.length / totalAppsScheduled) * 100 : 0;
  const cancelationRatePrev = useMemo(() =>
    appointmentsPrevMonth.length === 0 ? 0
      : (appointmentsPrevMonth.filter(a => a.status === AppointmentStatus.CANCELED).length / appointmentsPrevMonth.length) * 100,
    [appointmentsPrevMonth]
  );
  const attendanceRatePrev = useMemo(() =>
    appointmentsPrevMonth.length === 0 ? 0
      : (appsRealizadosPrev.length / appointmentsPrevMonth.length) * 100,
    [appointmentsPrevMonth, appsRealizadosPrev]
  );

  // ─── Receitas e despesas ──────────────────────────────────────────────────
  const revenueRealizado = useMemo(() =>
    calculateRevenue(appsRealizados) + subscriptionRevenue,
    [appsRealizados, subscriptionRevenue, calculateRevenue]
  );
  const revenueRealizadoPrev = useMemo(() =>
    calculateRevenue(appsRealizadosPrev),
    [appsRealizadosPrev, calculateRevenue]
  );
  const totalRepasseRealizado = useMemo(() =>
    appsRealizados.reduce((total, app) => {
      const customer    = customers.find(c => c.id === app.customerId);
      const psychologist = psychologists.find(p => p.id === app.psychologistId);
      const plan        = findPlan(customer?.healthPlan);
      const procedure   = plan?.procedures?.find(proc => proc.type === app.type);
      const appPrice    = app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
      return total + (app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(appPrice, psychologist));
    }, 0),
    [appsRealizados, customers, psychologists, findPlan]
  );
  const totalExpenses     = useMemo(() => expensesFiltered.reduce((acc, e) => acc + e.amount, 0), [expensesFiltered]);
  const totalExpensesPrev = useMemo(() => expensesPrevMonth.reduce((acc, e) => acc + e.amount, 0), [expensesPrevMonth]);
  const netProfit         = revenueRealizado - totalRepasseRealizado - totalExpenses;

  // ─── Ticket médio ─────────────────────────────────────────────────────────
  const revenueTotal = useMemo(() =>
    calculateRevenue(appsNaoCancelados) + subscriptionRevenue,
    [appsNaoCancelados, subscriptionRevenue, calculateRevenue]
  );
  const revenueTotalPrev = useMemo(() =>
    calculateRevenue(appsNaoCanceladosPrev),
    [appsNaoCanceladosPrev, calculateRevenue]
  );
  const activeCustomersCount    = useMemo(() => customers.filter(c => c.status === CustomerStatus.ACTIVE).length, [customers]);
  const ticketMedioConsulta     = appsNaoCancelados.length > 0 ? revenueTotal / appsNaoCancelados.length : 0;
  const ticketMedioPaciente     = activeCustomersCount > 0 ? revenueTotal / activeCustomersCount : 0;
  const ticketMedioConsultaPrev = appsNaoCanceladosPrev.length > 0 ? revenueTotalPrev / appsNaoCanceladosPrev.length : 0;

  // ─── Novos pacientes ─────────────────────────────────────────────────────
  const newPatientsCount     = useMemo(() => customers.filter(c => isInSelectedPeriod(c.createdAt)).length, [customers, isInSelectedPeriod]);
  const newPatientsCountPrev = useMemo(() => customers.filter(c => isInPrevPeriod(c.createdAt)).length, [customers, isInPrevPeriod]);

  // ─── Forecast de Receita ──────────────────────────────────────────────────
  // Calcula a projeção em UMA ÚNICA chamada a calculateRevenue para agrupar
  // corretamente por customerId-type (evita dupla contagem de one-time charges).
  const appsForecast = useMemo(() =>
    appointmentsFiltered.filter(
      a => a.status !== AppointmentStatus.CANCELED || isCanceledButBilled(a)
    ),
    [appointmentsFiltered, isCanceledButBilled]
  );
  const forecastRevenue  = useMemo(() =>
    calculateRevenue(appsForecast) + subscriptionRevenue,
    [appsForecast, subscriptionRevenue, calculateRevenue]
  );
  const revenuePrevisto  = Math.max(0, forecastRevenue - revenueRealizado);
  const forecastProgress = forecastRevenue > 0 ? (revenueRealizado / forecastRevenue) * 100 : 0;

  // ─── Agenda do Dia ────────────────────────────────────────────────────────
  const todayApps = useMemo(() =>
    appointments.filter(a => (a.date ?? '').substring(0, 10) === todayStr && !a.isInternal),
    [appointments, todayStr]
  );
  const todayConfirmed = useMemo(() =>
    todayApps.filter(a => a.confirmedPsychologist || a.confirmedPatient),
    [todayApps]
  );
  const todayPending = useMemo(() =>
    todayApps.filter(a => !a.confirmedPsychologist && !a.confirmedPatient && a.status !== AppointmentStatus.CANCELED),
    [todayApps]
  );
  const todayCanceled = useMemo(() =>
    todayApps.filter(a => a.status === AppointmentStatus.CANCELED),
    [todayApps]
  );
  const upcomingToday = useMemo(() =>
    todayApps
      .filter(a => a.status !== AppointmentStatus.CANCELED)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 5),
    [todayApps]
  );

  // ─── Dias úteis no mês (para ocupação) ───────────────────────────────────
  const workingDaysInMonth = useMemo(() => {
    if (filterMode !== 'month') return 22;
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(selectedYear, selectedMonth, d).getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return count;
  }, [selectedYear, selectedMonth, filterMode]);

  // ─── Alertas ──────────────────────────────────────────────────────────────
  const expiringSubscriptions = useMemo(() =>
    subscriptions.filter(s => {
      if (s.status !== SubscriptionStatus.ACTIVE) return false;
      const renewal  = new Date(s.nextRenewal + 'T12:00:00');
      const diffDays = Math.ceil((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 30 && diffDays >= 0;
    }),
    [subscriptions, today]
  );
  const pendingConfirmationsToday = useMemo(() =>
    todayApps.filter(a => a.confirmationStatus === 'pending' && a.status !== AppointmentStatus.CANCELED),
    [todayApps]
  );
  const inactivePatients = useMemo(() =>
    customers.filter(c => {
      if (c.status !== CustomerStatus.ACTIVE || !c.lastAppointmentDate) return false;
      const last     = new Date(c.lastAppointmentDate + 'T12:00:00');
      const diffDays = Math.ceil((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 30;
    }),
    [customers, today]
  );
  const waitingListPending = useMemo(() =>
    waitingList.filter(w => w.status === 'pending'),
    [waitingList]
  );

  return {
    // Conjuntos de agendamentos
    appsRealizados, appsPrevistos, appsNaoCancelados, appsRealizadosPrev, appsNaoCanceladosPrev,
    // KPIs de taxas
    totalAppsScheduled, totalAppsCanceled, cancelationRate, attendanceRate,
    cancelationRatePrev, attendanceRatePrev,
    // Financeiro
    revenueRealizado, revenuePrevisto, revenueRealizadoPrev,
    totalRepasseRealizado, totalExpenses, totalExpensesPrev, netProfit,
    revenueTotal, revenueTotalPrev,
    // Ticket médio + pacientes
    activeCustomersCount, ticketMedioConsulta, ticketMedioPaciente, ticketMedioConsultaPrev,
    newPatientsCount, newPatientsCountPrev,
    // Forecast
    forecastRevenue, forecastProgress,
    // Agenda do dia
    todayApps, todayConfirmed, todayPending, todayCanceled, upcomingToday,
    // Ocupação
    workingDaysInMonth,
    // Alertas
    expiringSubscriptions, pendingConfirmationsToday, inactivePatients, waitingListPending,
  };
}
