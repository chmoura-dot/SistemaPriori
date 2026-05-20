/**
 * useDashboardBase
 * Responsável por: estado bruto, carregamento de dados, filtro de período
 * e callbacks utilitários compartilhados por todos os sub-hooks do dashboard.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import {
  Appointment, Subscription, HealthPlan, Psychologist, Customer,
  SubscriptionStatus, AppointmentStatus, AppointmentType,
  Plan, Expense, WaitingListEntry
} from '../../services/types';
import { calcRepass } from '../../lib/repassRules';

export function useDashboardBase() {
  // ─── Estado de dados ──────────────────────────────────────────────────────
  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans]                 = useState<Plan[]>([]);
  const [appointments, setAppointments]   = useState<Appointment[]>([]);
  const [expenses, setExpenses]           = useState<Expense[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [waitingList, setWaitingList]     = useState<WaitingListEntry[]>([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [error, setError]                 = useState<string | null>(null);

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
          api.getCustomers(), api.getSubscriptions(), api.getPlans(),
          api.getAppointments(), api.getPsychologists(), api.getExpenses(), api.getWaitingList(),
        ]);
        setCustomers(c); setSubscriptions(s); setPlans(p); setAppointments(a);
        setPsychologists(psy); setExpenses(exp); setWaitingList(wl);
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

  // ─── Dados filtrados por período ──────────────────────────────────────────
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

  // ─── Seletores de período disponíveis ─────────────────────────────────────
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
        return { year: y, month: mo, label: new Date(y, mo, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }) };
      })
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }, [appointments, today]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    appointments.forEach(a => years.add(new Date(a.date + 'T12:00:00').getFullYear()));
    expenses.forEach(e => years.add(new Date(e.date + 'T12:00:00').getFullYear()));
    years.add(today.getFullYear());
    return Array.from(years).sort((a, b) => a - b);
  }, [appointments, expenses, today]);

  const selectedMonthLabel = filterMode === 'all'
    ? 'Todo o Período'
    : filterMode === 'year'
    ? `${selectedYear}`
    : new Date(selectedYear, selectedMonth, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  // ─── Callbacks utilitários ────────────────────────────────────────────────
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
      const firstApp  = customerApps[0];
      const customer  = customers.find(c => c.id === firstApp.customerId);
      const plan      = findPlan(customer?.healthPlan);
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

  return {
    customers, subscriptions, plans, appointments, expenses, psychologists, waitingList,
    isLoading, error,
    today, todayStr,
    filterMode, setFilterMode,
    selectedMonth, setSelectedMonth,
    selectedYear, setSelectedYear,
    availableMonths, availableYears, selectedMonthLabel,
    appointmentsFiltered, appointmentsPrevMonth,
    expensesFiltered, expensesPrevMonth,
    activeSubs, subscriptionRevenue,
    isInSelectedPeriod, isInPrevPeriod,
    findPlan, isCanceledButBilled, calculateRevenue,
  };
}
