/**
 * useDashboardData
 * Hook centralizado com toda a lógica de dados do Dashboard.
 *
 * Melhorias em relação ao código inline anterior:
 * - Separação de concerns (dados vs. apresentação)
 * - Memoização adequada de todos os cálculos pesados
 * - Tipagem correta (Psychologist[] ao invés de any[])
 * - Correção: heatmap e roomUsage agora respeitam o filtro de período
 * - Correção: genderProfileData usa apenas campo gender do banco (sem inferência por nome)
 * - Correção: ranking de psicólogos expõe receita bruta E líquida (após repasse)
 * - Novo: Métricas clínicas (novos pacientes, sessões médias, no-show, tempo em terapia, retorno)
 * - Novo: Estado de erro visível para o usuário
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api } from '../services/api';
import {
  Appointment, Subscription, HealthPlan, Psychologist, Customer,
  CustomerStatus, SubscriptionStatus, AppointmentStatus, AppointmentType,
  Plan, Expense, InactivationReason, WaitingListEntry
} from '../services/types';
import { calcRepass } from '../lib/repassRules';

export function useDashboardData() {
  // ─── Estado de dados ─────────────────────────────────────────────────────
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans]               = useState<Plan[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses]         = useState<Expense[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [waitingList, setWaitingList]   = useState<WaitingListEntry[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // Estabiliza `today` para não causar re-renders desnecessários em useMemos
  const todayRef = useRef(new Date());
  const today    = todayRef.current;
  const todayStr = today.toISOString().split('T')[0];

  // ─── Filtro de período ────────────────────────────────────────────────────
  const [filterMode, setFilterMode]       = useState<'month' | 'year' | 'all'>('month');
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear]   = useState(today.getFullYear());

  // ─── Carregamento de dados ────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        setError(null);
        const [c, s, p, a, psy, exp, wl] = await Promise.all([
          api.getCustomers(),
          api.getSubscriptions(),
          api.getPlans(),
          api.getAppointments(),
          api.getPsychologists(),
          api.getExpenses(),
          api.getWaitingList(),
        ]);
        setCustomers(c);
        setSubscriptions(s);
        setPlans(p);
        setAppointments(a);
        setPsychologists(psy);
        setExpenses(exp);
        setWaitingList(wl);
      } catch (err) {
        console.error('[Dashboard] Erro ao carregar dados:', err);
        setError('Falha ao carregar dados do dashboard. Verifique a conexão e tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // ─── Helpers de período ───────────────────────────────────────────────────
  const isInSelectedPeriod = useCallback((dateStr: string) => {
    if (filterMode === 'all') return true;
    const d = new Date(dateStr + 'T12:00:00');
    if (filterMode === 'year') return d.getFullYear() === selectedYear;
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  }, [filterMode, selectedMonth, selectedYear]);

  const isInPrevPeriod = useCallback((dateStr: string) => {
    if (filterMode === 'all') return false;
    const d = new Date(dateStr + 'T12:00:00');
    if (filterMode === 'year') return d.getFullYear() === selectedYear - 1;
    const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYear  = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  }, [filterMode, selectedMonth, selectedYear]);

  // ─── Agendamentos e despesas filtrados ────────────────────────────────────
  const appointmentsFiltered = useMemo(() =>
    appointments.filter(a => isInSelectedPeriod(a.date)),
    [appointments, isInSelectedPeriod]
  );

  const appointmentsPrevMonth = useMemo(() =>
    appointments.filter(a => isInPrevPeriod(a.date)),
    [appointments, isInPrevPeriod]
  );

  const expensesFiltered = useMemo(() =>
    expenses.filter(e => isInSelectedPeriod(e.date)),
    [expenses, isInSelectedPeriod]
  );

  const expensesPrevMonth = useMemo(() =>
    expenses.filter(e => isInPrevPeriod(e.date)),
    [expenses, isInPrevPeriod]
  );

  // ─── Seletores de período disponíveis ────────────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    appointments.forEach(a => {
      const d = new Date(a.date + 'T12:00:00');
      months.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    months.add(`${today.getFullYear()}-${today.getMonth()}`);
    return Array.from(months)
      .map(m => {
        const [y, mo] = m.split('-').map(Number);
        return {
          year: y, month: mo,
          label: new Date(y, mo, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
        };
      })
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }, [appointments]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    appointments.forEach(a => years.add(new Date(a.date + 'T12:00:00').getFullYear()));
    expenses.forEach(e => years.add(new Date(e.date + 'T12:00:00').getFullYear()));
    years.add(today.getFullYear());
    return Array.from(years).sort((a, b) => a - b);
  }, [appointments, expenses]);

  const selectedMonthLabel = filterMode === 'all'
    ? 'Todo o Período'
    : filterMode === 'year'
    ? `${selectedYear}`
    : new Date(selectedYear, selectedMonth, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  // ─── Funções auxiliares de cálculo ───────────────────────────────────────
  const findPlan = useCallback((healthPlan?: string) =>
    plans.find(p => p.name.toUpperCase() === (healthPlan ?? '').toUpperCase()),
    [plans]
  );

  const isCanceledButBilled = useCallback((app: Appointment) =>
    app.status === AppointmentStatus.CANCELED &&
    (app.cancellationBilling === 'plan' || app.cancellationBilling === 'particular'),
    []
  );

  const calculateRevenue = useCallback((apps: Appointment[]): number => {
    const grouped = apps.reduce((acc: Record<string, Appointment[]>, app) => {
      const key = `${app.customerId}-${app.type}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(app);
      return acc;
    }, {});

    return Object.values(grouped).reduce((total, customerApps) => {
      const firstApp = customerApps[0];
      const customer = customers.find(c => c.id === firstApp.customerId);
      const plan = findPlan(customer?.healthPlan);
      const procedure = plan?.procedures?.find(proc => proc.type === firstApp.type);
      const isOneTime = procedure?.isOneTimeCharge ||
        (customer?.healthPlan === HealthPlan.PARTICULAR && firstApp.type === AppointmentType.NEUROPSICOLOGICA);

      if (isOneTime) {
        return total + (firstApp.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0);
      }
      return total + customerApps.reduce((sum, app) =>
        sum + (app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0), 0
      );
    }, 0);
  }, [customers, findPlan]);

  // ─── Assinaturas e receita de assinaturas ─────────────────────────────────
  const activeSubs = useMemo(() =>
    subscriptions.filter(s => s.status === SubscriptionStatus.ACTIVE),
    [subscriptions]
  );

  const subscriptionRevenue = useMemo(() =>
    activeSubs.reduce((acc, sub) => {
      const plan = plans.find(p => p.id === sub.planId);
      return acc + (plan?.procedures?.[0]?.price || 0);
    }, 0),
    [activeSubs, plans]
  );

  // ─── Conjuntos principais de agendamentos ─────────────────────────────────
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

  const revenuePrevisto = useMemo(() =>
    calculateRevenue(appsPrevistos),
    [appsPrevistos, calculateRevenue]
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
      const repassAmount = app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(appPrice, psychologist);
      return total + repassAmount;
    }, 0),
    [appsRealizados, customers, psychologists, findPlan]
  );

  const totalExpenses     = useMemo(() => expensesFiltered.reduce((acc, e) => acc + e.amount, 0), [expensesFiltered]);
  const totalExpensesPrev = useMemo(() => expensesPrevMonth.reduce((acc, e) => acc + e.amount, 0), [expensesPrevMonth]);
  const netProfit         = revenueRealizado - totalRepasseRealizado - totalExpenses;

  // ─── Ticket médio ─────────────────────────────────────────────────────────
  const revenueTotal     = useMemo(() => calculateRevenue(appsNaoCancelados) + subscriptionRevenue, [appsNaoCancelados, subscriptionRevenue, calculateRevenue]);
  const revenueTotalPrev = useMemo(() => calculateRevenue(appsNaoCanceladosPrev), [appsNaoCanceladosPrev, calculateRevenue]);

  const activeCustomersCount   = useMemo(() => customers.filter(c => c.status === CustomerStatus.ACTIVE).length, [customers]);
  const ticketMedioConsulta    = appsNaoCancelados.length > 0 ? revenueTotal / appsNaoCancelados.length : 0;
  const ticketMedioPaciente    = activeCustomersCount > 0 ? revenueTotal / activeCustomersCount : 0;
  const ticketMedioConsultaPrev = appsNaoCanceladosPrev.length > 0 ? revenueTotalPrev / appsNaoCanceladosPrev.length : 0;

  // ─── Novos pacientes no período (FIX: tendência real vs. período anterior) ──
  const newPatientsCount     = useMemo(() => customers.filter(c => isInSelectedPeriod(c.createdAt)).length, [customers, isInSelectedPeriod]);
  const newPatientsCountPrev = useMemo(() => customers.filter(c => isInPrevPeriod(c.createdAt)).length, [customers, isInPrevPeriod]);

  // ─── Métricas clínicas (NOVO) ─────────────────────────────────────────────

  /** Sessões médias realizadas por paciente no período */
  const avgSessionsPerPatient = useMemo(() => {
    const map: Record<string, number> = {};
    appsRealizados.forEach(app => {
      if (!app.isInternal) map[app.customerId] = (map[app.customerId] || 0) + 1;
    });
    const counts = Object.values(map);
    return counts.length === 0 ? 0 : counts.reduce((a, b) => a + b, 0) / counts.length;
  }, [appsRealizados]);

  /**
   * No-show: agendamentos passados, não-cancelados e não-confirmados pelo psicólogo.
   * Distinção importante vs. cancelamento: o paciente simplesmente não apareceu.
   */
  const noShowApps = useMemo(() =>
    appointmentsFiltered.filter(app =>
      app.date < todayStr &&
      app.status !== AppointmentStatus.CANCELED &&
      !app.confirmedPsychologist &&
      !app.isInternal
    ),
    [appointmentsFiltered, todayStr]
  );
  const noShowRate = totalAppsScheduled > 0 ? (noShowApps.length / totalAppsScheduled) * 100 : 0;

  /** Tempo médio em terapia: dias entre 1ª e última consulta dos pacientes ativos */
  const avgTherapyDurationDays = useMemo(() => {
    const active = customers.filter(c =>
      c.status === CustomerStatus.ACTIVE && c.firstAppointmentDate && c.lastAppointmentDate
    );
    if (active.length === 0) return 0;
    const durations = active.map(c => {
      const first = new Date(c.firstAppointmentDate! + 'T12:00:00');
      const last  = new Date(c.lastAppointmentDate!  + 'T12:00:00');
      return Math.max(0, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
    });
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }, [customers]);

  /** Taxa de retorno: % de pacientes que fizeram 2+ sessões (histórico completo) */
  const returnRate = useMemo(() => {
    const allRealized = appointments.filter(app =>
      (app.confirmedPsychologist || isCanceledButBilled(app)) && !app.isInternal
    );
    const map: Record<string, number> = {};
    allRealized.forEach(app => { map[app.customerId] = (map[app.customerId] || 0) + 1; });
    const total    = Object.keys(map).length;
    const returned = Object.values(map).filter(n => n >= 2).length;
    return total > 0 ? (returned / total) * 100 : 0;
  }, [appointments, isCanceledButBilled]);

  // ─── Churn / Retenção ─────────────────────────────────────────────────────
  const inactivatedThisMonth = useMemo(() =>
    customers.filter(c => {
      if (c.status !== CustomerStatus.INACTIVE) return false;
      const ref = c.lastAppointmentDate || c.createdAt;
      return isInSelectedPeriod(ref);
    }),
    [customers, isInSelectedPeriod]
  );

  const churnByReason = useMemo(() =>
    Object.values(InactivationReason)
      .map(reason => ({ reason, count: inactivatedThisMonth.filter(c => c.inactivationReason === reason).length }))
      .filter(r => r.count > 0),
    [inactivatedThisMonth]
  );

  const retentionRate = (activeCustomersCount + inactivatedThisMonth.length) > 0
    ? (activeCustomersCount / (activeCustomersCount + inactivatedThisMonth.length)) * 100
    : 100;

  // ─── Forecast de Receita ──────────────────────────────────────────────────
  const forecastRevenue  = revenueRealizado + revenuePrevisto;
  const forecastProgress = forecastRevenue > 0 ? (revenueRealizado / forecastRevenue) * 100 : 0;

  // ─── Agenda do Dia ────────────────────────────────────────────────────────
  const todayApps = useMemo(() =>
    appointments.filter(a => a.date === todayStr && !a.isInternal),
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

  // ─── Taxa de Ocupação ─────────────────────────────────────────────────────
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

  const activePsychologists = useMemo(() => psychologists.filter(p => p.active), [psychologists]);
  const estimatedCapacity   = activePsychologists.length * workingDaysInMonth * 6;
  const occupancyRate       = estimatedCapacity > 0 ? Math.min((appsNaoCancelados.length / estimatedCapacity) * 100, 100) : 0;

  // ─── Heatmap de Horários (FIX: usa período filtrado) ─────────────────────
  const heatmapData = useMemo(() => {
    const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
    const hours = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];
    const grid: Record<string, Record<string, number>> = {};
    hours.forEach(h => { grid[h] = {}; dayNames.forEach(d => { grid[h][d] = 0; }); });

    // FIX: antes usava `appointments` (todo o histórico); agora usa `appointmentsFiltered`
    appointmentsFiltered.forEach(app => {
      if (app.status === AppointmentStatus.CANCELED || app.isInternal) return;
      const date   = new Date(app.date + 'T12:00:00');
      const dayIdx = date.getDay();
      if (dayIdx === 0 || dayIdx === 6) return;
      const dayName = dayNames[dayIdx - 1];
      const hour    = app.startTime?.substring(0, 5);
      if (grid[hour] && grid[hour][dayName] !== undefined) grid[hour][dayName]++;
    });

    return { grid, hours, dayNames };
  }, [appointmentsFiltered]);

  const maxHeatmapValue = useMemo(() => {
    let max = 0;
    Object.values(heatmapData.grid).forEach(row => Object.values(row).forEach(v => { if (v > max) max = v; }));
    return max || 1;
  }, [heatmapData]);

  // ─── Ranking de Psicólogos (FIX: expõe receita bruta E líquida para a clínica) ─
  const psychologistRanking = useMemo(() => {
    return psychologists.map(psy => {
      const psyApps     = appsRealizados.filter(a => a.psychologistId === psy.id);
      const grossRevenue = calculateRevenue(psyApps);

      const repasseTotal = psyApps.reduce((total, app) => {
        const customer  = customers.find(c => c.id === app.customerId);
        const plan      = findPlan(customer?.healthPlan);
        const procedure = plan?.procedures?.find(proc => proc.type === app.type);
        const appPrice  = app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
        const repasse   = app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(appPrice, psy);
        return total + repasse;
      }, 0);

      const netRevenue       = grossRevenue - repasseTotal;
      const confirmationRate = psyApps.length > 0
        ? (psyApps.filter(a => a.confirmedPsychologist).length / psyApps.length) * 100 : 0;

      return { name: psy.name, appointments: psyApps.length, grossRevenue, repasseTotal, netRevenue, confirmationRate };
    }).filter(p => p.appointments > 0).sort((a, b) => b.grossRevenue - a.grossRevenue);
  }, [appsRealizados, psychologists, customers, findPlan, calculateRevenue]);

  // ─── Gráfico Receita vs Despesas (histórico completo) ────────────────────
  const revenueVsExpensesData = useMemo(() => {
    const data: Record<string, { month: string; sortKey: number; receita: number; despesas: number; lucro: number }> = {};

    appointments.forEach(app => {
      if (!app.confirmedPsychologist && !isCanceledButBilled(app)) return;
      const d      = new Date(app.date + 'T12:00:00');
      const key    = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!data[key]) data[key] = { month: key, sortKey, receita: 0, despesas: 0, lucro: 0 };
      const customer  = customers.find(c => c.id === app.customerId);
      const plan      = findPlan(customer?.healthPlan);
      const procedure = plan?.procedures?.find(proc => proc.type === app.type);
      data[key].receita += app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
    });

    expenses.forEach(exp => {
      const d      = new Date(exp.date + 'T12:00:00');
      const key    = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!data[key]) data[key] = { month: key, sortKey, receita: 0, despesas: 0, lucro: 0 };
      data[key].despesas += exp.amount;
    });

    return Object.values(data)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(d => ({ ...d, lucro: d.receita - d.despesas }));
  }, [appointments, expenses, customers, findPlan, isCanceledButBilled]);

  // ─── Faturamento por plano / psicólogo ────────────────────────────────────
  const revenueByPlan = useMemo(() =>
    plans.map(plan => {
      const planApps = appsRealizados.filter(app => {
        const customer = customers.find(c => c.id === app.customerId);
        return (customer?.healthPlan ?? '').toUpperCase() === plan.name.toUpperCase();
      });
      return { name: plan.name, total: calculateRevenue(planApps) };
    }).filter(p => p.total > 0).sort((a, b) => b.total - a.total),
    [appsRealizados, plans, customers, calculateRevenue]
  );

  const revenueByPsychologist = useMemo(() =>
    psychologists.map(psy => ({
      name: psy.name,
      total: calculateRevenue(appsRealizados.filter(app => app.psychologistId === psy.id)),
    })).filter(p => p.total > 0).sort((a, b) => b.total - a.total),
    [appsRealizados, psychologists, calculateRevenue]
  );

  const monthlyData = useMemo(() => {
    const monthlyRevenue = appointments
      .filter(app => app.status !== AppointmentStatus.CANCELED || isCanceledButBilled(app))
      .reduce((acc: Record<string, { realizado: number; previsto: number }>, app) => {
        const month = new Date(app.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        if (!acc[month]) acc[month] = { realizado: 0, previsto: 0 };
        const customer  = customers.find(c => c.id === app.customerId);
        const plan      = findPlan(customer?.healthPlan);
        const procedure = plan?.procedures?.find(proc => proc.type === app.type);
        const isOneTime = procedure?.isOneTimeCharge ||
          (customer?.healthPlan === HealthPlan.PARTICULAR && app.type === AppointmentType.NEUROPSICOLOGICA);
        let amount = 0;
        if (isOneTime) {
          const firstApp = appointments
            .filter(a => a.customerId === app.customerId && a.type === app.type &&
              (a.status !== AppointmentStatus.CANCELED || isCanceledButBilled(a)))
            .sort((a, b) => a.date.localeCompare(b.date))[0];
          if (firstApp?.id === app.id) amount = app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
        } else {
          amount = app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
        }
        if (app.confirmedPsychologist || isCanceledButBilled(app)) acc[month].realizado += amount;
        else acc[month].previsto += amount;
        return acc;
      }, {});
    return Object.entries(monthlyRevenue).map(([month, data]) => ({
      month, realizado: data.realizado, previsto: data.previsto, total: data.realizado + data.previsto
    }));
  }, [appointments, customers, findPlan, isCanceledButBilled]);

  const modalityData = useMemo(() => [
    { name: 'Presencial', value: appsRealizados.filter(app => app.mode === 'Presencial').length },
    { name: 'On-line',    value: appsRealizados.filter(app => app.mode === 'On-line').length },
  ].filter(d => d.value > 0), [appsRealizados]);

  // ─── Perfil de Gênero (FIX: apenas campo gender do banco, sem inferência por nome) ─
  const genderProfileData = useMemo(() => {
    const activeCustomers = customers.filter(c => c.status === CustomerStatus.ACTIVE);
    let feminino = 0, masculino = 0, naoIdentificado = 0;
    activeCustomers.forEach(c => {
      if (c.gender === 'F') feminino++;
      else if (c.gender === 'M') masculino++;
      else naoIdentificado++;
    });
    return {
      data: [
        { name: 'Feminino',  value: feminino,  color: '#ec4899' },
        { name: 'Masculino', value: masculino, color: '#3b82f6' },
      ].filter(d => d.value > 0),
      totalIdentificado: feminino + masculino,
      naoIdentificado,
      totalAtivos: activeCustomers.length,
    };
  }, [customers]);

  // ─── Perfil de Idade ──────────────────────────────────────────────────────
  const ageProfileData = useMemo(() => {
    const activeCustomers = customers.filter(c => c.status === CustomerStatus.ACTIVE);
    let crianca = 0, adolescente = 0, adulto = 0, idoso = 0, semIdade = 0;
    const nowYear = today.getFullYear(), nowMonth = today.getMonth(), nowDay = today.getDate();
    activeCustomers.forEach(c => {
      if (!c.birthDate) { semIdade++; return; }
      const birth = new Date(c.birthDate + 'T12:00:00');
      let age = nowYear - birth.getFullYear();
      const m = nowMonth - birth.getMonth();
      if (m < 0 || (m === 0 && nowDay < birth.getDate())) age--;
      if (age <= 12) crianca++;
      else if (age <= 17) adolescente++;
      else if (age <= 59) adulto++;
      else idoso++;
    });
    return {
      data: [
        { name: 'Criança (0-12)',       value: crianca,      color: '#6366f1' },
        { name: 'Adolescente (13-17)', value: adolescente,  color: '#10b981' },
        { name: 'Adulto (18-59)',       value: adulto,       color: '#1a365d' },
        { name: 'Idoso (60+)',          value: idoso,        color: '#d4af37' },
      ].filter(d => d.value > 0),
      totalComIdade: crianca + adolescente + adulto + idoso,
      semIdade, totalAtivos: activeCustomers.length,
    };
  }, [customers]);

  // ─── Crescimento da clínica ───────────────────────────────────────────────
  const growthData = useMemo(() => {
    const months: Record<string, { month: string; patients: number; psychologists: number; timestamp: number }> = {};
    const getInfo = (dateStr?: string) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      return { key: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }), sortKey: d.getFullYear() * 100 + d.getMonth() };
    };
    // Inicializa as entradas de mês para cada fonte de dados
    customers.forEach(c => {
      const info = getInfo(c.createdAt);
      if (info && !months[info.key]) months[info.key] = { month: info.key, patients: 0, psychologists: 0, timestamp: info.sortKey };
    });
    // Psychologist não tem createdAt no tipo base — usamos cast seguro
    psychologists.forEach(p => {
      const info = getInfo((p as any).createdAt);
      if (info && !months[info.key]) months[info.key] = { month: info.key, patients: 0, psychologists: 0, timestamp: info.sortKey };
    });
    customers.forEach(c => { const i = getInfo(c.createdAt); if (i) months[i.key].patients++; });
    psychologists.forEach(p => { const i = getInfo((p as any).createdAt); if (i) months[i.key].psychologists++; });
    const sorted = Object.values(months).sort((a, b) => a.timestamp - b.timestamp);
    let accP = 0, accPsy = 0;
    return sorted.map(m => { accP += m.patients; accPsy += m.psychologists; return { ...m, patients: accP, psychologists: accPsy }; });
  }, [customers, psychologists]);

  const planGrowthData = useMemo(() => {
    const data: Record<string, Record<string, any>> = {};
    const planNames = Array.from(new Set(plans.map(p => p.name)));
    appointments.forEach(app => {
      const d        = new Date(app.date + 'T12:00:00');
      const monthKey = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey  = d.getFullYear() * 100 + d.getMonth();
      const customer = customers.find(c => c.id === app.customerId);
      const planName = (customer?.healthPlan as string) || 'Não Identificado';
      if (!data[monthKey]) { data[monthKey] = { month: monthKey, sortKey }; planNames.forEach(n => { data[monthKey][n] = 0; }); }
      if (data[monthKey][planName] !== undefined) data[monthKey][planName]++;
      else data[monthKey][planName] = 1;
    });
    return Object.values(data).sort((a, b) => a.sortKey - b.sortKey);
  }, [appointments, customers, plans]);

  const typeGrowthData = useMemo(() => {
    const data: Record<string, any> = {};
    const types = Array.from(new Set(appointments.map(a => a.type)));
    appointments.forEach(app => {
      const d        = new Date(app.date + 'T12:00:00');
      const monthKey = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey  = d.getFullYear() * 100 + d.getMonth();
      if (!data[monthKey]) { data[monthKey] = { month: monthKey, sortKey }; types.forEach(t => { data[monthKey][t as string] = 0; }); }
      data[monthKey][app.type as string]++;
    });
    return Object.values(data).sort((a, b) => a.sortKey - b.sortKey);
  }, [appointments]);

  // ─── Ocupação por dia da semana (FIX: usa período filtrado) ──────────────
  const roomUsageData = useMemo(() => {
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const usage    = dayNames.map(day => ({ day, count: 0 }));
    // FIX: antes usava `appointments`; agora usa `appointmentsFiltered`
    appointmentsFiltered.forEach(app => {
      const dayIdx = new Date(app.date + 'T12:00:00').getDay();
      if (app.status !== AppointmentStatus.CANCELED) usage[dayIdx].count++;
    });
    return usage.filter((_, i) => i !== 0); // Remove domingo
  }, [appointmentsFiltered]);

  // ─── Alertas ──────────────────────────────────────────────────────────────
  const expiringSubscriptions = useMemo(() =>
    subscriptions.filter(s => {
      if (s.status !== SubscriptionStatus.ACTIVE) return false;
      const renewal  = new Date(s.nextRenewal + 'T12:00:00');
      const diffDays = Math.ceil((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 30 && diffDays >= 0;
    }),
    [subscriptions]
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
    [customers]
  );

  const waitingListPending = useMemo(() =>
    waitingList.filter(w => w.status === 'pending'),
    [waitingList]
  );

  // ─── Retorno do hook ──────────────────────────────────────────────────────
  return {
    // Dados brutos
    customers, subscriptions, plans, appointments, expenses, psychologists, waitingList,

    // Estado de carregamento
    isLoading, error,

    // Filtro de período
    filterMode, setFilterMode,
    selectedMonth, setSelectedMonth,
    selectedYear, setSelectedYear,
    availableMonths, availableYears, selectedMonthLabel,

    // Agendamentos e despesas filtrados
    appointmentsFiltered, appointmentsPrevMonth,
    expensesFiltered, expensesPrevMonth,

    // KPIs de agendamento
    appsRealizados, appsPrevistos, appsNaoCancelados,
    totalAppsScheduled, totalAppsCanceled,
    cancelationRate, attendanceRate,
    cancelationRatePrev, attendanceRatePrev,

    // Financeiros
    revenueRealizado, revenuePrevisto, revenueRealizadoPrev,
    totalRepasseRealizado, totalExpenses, totalExpensesPrev, netProfit,
    subscriptionRevenue, activeSubs,

    // Ticket médio
    ticketMedioConsulta, ticketMedioPaciente, ticketMedioConsultaPrev,

    // Contagens de pacientes
    activeCustomersCount, newPatientsCount, newPatientsCountPrev,

    // Métricas clínicas (NOVO)
    avgSessionsPerPatient,
    noShowApps, noShowRate,
    avgTherapyDurationDays,
    returnRate,

    // Churn / Retenção
    inactivatedThisMonth, churnByReason, retentionRate,

    // Forecast
    forecastRevenue, forecastProgress,

    // Agenda do dia
    today, todayStr,
    todayApps, todayConfirmed, todayPending, todayCanceled, upcomingToday,

    // Ocupação
    workingDaysInMonth, estimatedCapacity, occupancyRate, activePsychologists,

    // Dados de gráficos
    heatmapData, maxHeatmapValue,
    psychologistRanking,
    revenueVsExpensesData,
    revenueByPlan, revenueByPsychologist, monthlyData, modalityData,
    genderProfileData, ageProfileData,
    growthData, planGrowthData, typeGrowthData, roomUsageData,

    // Alertas
    expiringSubscriptions, pendingConfirmationsToday, inactivePatients, waitingListPending,

    // Utilitários (para uso no render)
    findPlan, isCanceledButBilled,
  };
}
