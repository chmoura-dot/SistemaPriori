import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Activity, 
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  Lock,
  Calendar,
  Clock,
  Target,
  UserMinus,
  ListOrdered,
  DollarSign,
  Zap,
  BarChart2,
  ArrowUp,
  ArrowDown,
  Minus,
  Bell,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Flame
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, 
  LineChart, Line, XAxis, YAxis, CartesianGrid, AreaChart, Area, 
  BarChart, Bar,
  ComposedChart
} from 'recharts';
import { api } from '../services/api';
import { Appointment, Subscription, HealthPlan, Psychologist, Customer, CustomerStatus, SubscriptionStatus, AppointmentStatus, AppointmentType, Plan, Expense, ExpenseCategory, InactivationReason, WaitingListEntry } from '../services/types';
import { cn } from '../lib/utils';
import { calcRepass } from '../lib/repassRules';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtShort = (v: number) => v.toLocaleString('pt-BR');

function getTrendIcon(current: number, previous: number) {
  if (previous === 0) return <Minus size={12} className="text-zinc-400" />;
  const pct = ((current - previous) / previous) * 100;
  if (pct > 0) return <ArrowUp size={12} className="text-emerald-500" />;
  if (pct < 0) return <ArrowDown size={12} className="text-red-500" />;
  return <Minus size={12} className="text-zinc-400" />;
}

function getTrendText(current: number, previous: number) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const color = pct > 0 ? 'text-emerald-500' : pct < 0 ? 'text-red-500' : 'text-zinc-400';
  return <span className={cn('text-[10px] font-bold', color)}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}% vs mês ant.</span>;
}

// ─── Componente Principal ────────────────────────────────────────────────────

export const DashboardPage = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [psychologists, setPsychologists] = useState<any[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtro de período
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-11
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const user = api.getCurrentUser();

  useEffect(() => {
    const loadData = async () => {
      const [c, s, p, a, psy, exp, wl] = await Promise.all([
        api.getCustomers(),
        api.getSubscriptions(),
        api.getPlans(),
        api.getAppointments(),
        api.getPsychologists(),
        api.getExpenses(),
        api.getWaitingList()
      ]);
      setCustomers(c);
      setSubscriptions(s);
      setPlans(p);
      setAppointments(a);
      setPsychologists(psy);
      setExpenses(exp);
      setWaitingList(wl);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // ─── Filtro de período ───────────────────────────────────────────────────

  const isInSelectedMonth = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  };

  const isInPrevMonth = (dateStr: string) => {
    const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const d = new Date(dateStr + 'T12:00:00');
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  };

  const appointmentsFiltered = appointments.filter(a => isInSelectedMonth(a.date));
  const appointmentsPrevMonth = appointments.filter(a => isInPrevMonth(a.date));

  const expensesFiltered = expenses.filter(e => isInSelectedMonth(e.date));
  const expensesPrevMonth = expenses.filter(e => isInPrevMonth(e.date));

  // Meses disponíveis para o seletor
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    appointments.forEach(a => {
      const d = new Date(a.date + 'T12:00:00');
      months.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    // Sempre incluir mês atual
    months.add(`${today.getFullYear()}-${today.getMonth()}`);
    return Array.from(months)
      .map(m => {
        const [y, mo] = m.split('-').map(Number);
        return { year: y, month: mo, label: new Date(y, mo, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }) };
      })
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }, [appointments]);

  // ─── Helpers de cálculo ──────────────────────────────────────────────────

  const activeSubs = subscriptions.filter(s => s.status === SubscriptionStatus.ACTIVE);

  const subscriptionRevenue = activeSubs.reduce((acc, sub) => {
    const plan = plans.find(p => p.id === sub.planId);
    const price = plan?.procedures?.[0]?.price || 0;
    return acc + price;
  }, 0);

  const findPlan = (healthPlan?: string) =>
    plans.find(p => p.name.toUpperCase() === (healthPlan ?? '').toUpperCase());

  const isCanceledButBilled = (app: Appointment) =>
    app.status === AppointmentStatus.CANCELED &&
    (app.cancellationBilling === 'plan' || app.cancellationBilling === 'particular');

  const calculateRevenue = (apps: Appointment[]) => {
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
      const isOneTime = procedure?.isOneTimeCharge || (customer?.healthPlan === HealthPlan.PARTICULAR && firstApp.type === AppointmentType.NEUROPSICOLOGICA);

      if (isOneTime) {
        const amount = firstApp.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
        return total + amount;
      } else {
        const appTotal = customerApps.reduce((sum, app) => {
          const amount = app.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
          return sum + amount;
        }, 0);
        return total + appTotal;
      }
    }, 0);
  };

  // ─── KPIs do mês selecionado ─────────────────────────────────────────────

  const appsRealizados = appointmentsFiltered.filter(app => app.confirmedPsychologist || isCanceledButBilled(app));
  const appsPrevistos = appointmentsFiltered.filter(app => !app.confirmedPsychologist && app.status !== AppointmentStatus.CANCELED);
  const appsRealizadosPrev = appointmentsPrevMonth.filter(app => app.confirmedPsychologist || isCanceledButBilled(app));

  const totalAppsScheduled = appointmentsFiltered.length;
  const totalAppsCanceled = appointmentsFiltered.filter(app => app.status === AppointmentStatus.CANCELED).length;
  const cancelationRate = totalAppsScheduled > 0 ? (totalAppsCanceled / totalAppsScheduled) * 100 : 0;
  const attendanceRate = totalAppsScheduled > 0 ? (appsRealizados.length / totalAppsScheduled) * 100 : 0;

  const cancelationRatePrev = appointmentsPrevMonth.length > 0
    ? (appointmentsPrevMonth.filter(a => a.status === AppointmentStatus.CANCELED).length / appointmentsPrevMonth.length) * 100
    : 0;
  const attendanceRatePrev = appointmentsPrevMonth.length > 0
    ? (appsRealizadosPrev.length / appointmentsPrevMonth.length) * 100
    : 0;

  const revenueRealizado = calculateRevenue(appsRealizados) + subscriptionRevenue;
  const revenuePrevisto = calculateRevenue(appsPrevistos);
  const revenueRealizadoPrev = calculateRevenue(appsRealizadosPrev);

  const totalRepasseRealizado = useMemo(() => {
    return appsRealizados.reduce((total, app) => {
      const customer = customers.find(c => c.id === app.customerId);
      const psychologist = psychologists.find(p => p.id === app.psychologistId);
      const plan = findPlan(customer?.healthPlan);
      const procedure = plan?.procedures?.find(proc => proc.type === app.type);
      const appPrice = app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
      const repassAmount = app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(appPrice, psychologist);
      return total + repassAmount;
    }, 0);
  }, [appsRealizados, customers, psychologists, plans]);

  const totalExpenses = expensesFiltered.reduce((acc, exp) => acc + exp.amount, 0);
  const totalExpensesPrev = expensesPrevMonth.reduce((acc, exp) => acc + exp.amount, 0);
  const netProfit = revenueRealizado - totalRepasseRealizado - totalExpenses;

  // ─── Ticket Médio ────────────────────────────────────────────────────────

  const ticketMedioConsulta = appsRealizados.length > 0 ? revenueRealizado / appsRealizados.length : 0;
  const activeCustomersCount = customers.filter(c => c.status === CustomerStatus.ACTIVE).length;
  const ticketMedioPaciente = activeCustomersCount > 0 ? revenueRealizado / activeCustomersCount : 0;
  const ticketMedioConsultaPrev = appsRealizadosPrev.length > 0 ? revenueRealizadoPrev / appsRealizadosPrev.length : 0;

  // ─── Churn / Retenção ────────────────────────────────────────────────────

  const inactivatedThisMonth = customers.filter(c => {
    if (c.status !== CustomerStatus.INACTIVE) return false;
    // Usa lastAppointmentDate como proxy de quando ficou inativo
    const ref = c.lastAppointmentDate || c.createdAt;
    return isInSelectedMonth(ref);
  });

  const churnByReason = Object.values(InactivationReason).map(reason => ({
    reason,
    count: inactivatedThisMonth.filter(c => c.inactivationReason === reason).length
  })).filter(r => r.count > 0);

  const retentionRate = (activeCustomersCount + inactivatedThisMonth.length) > 0
    ? (activeCustomersCount / (activeCustomersCount + inactivatedThisMonth.length)) * 100
    : 100;

  // ─── Forecast de Receita ─────────────────────────────────────────────────

  const forecastRevenue = revenueRealizado + revenuePrevisto;
  const forecastProgress = forecastRevenue > 0 ? (revenueRealizado / forecastRevenue) * 100 : 0;

  // ─── Agenda do Dia ───────────────────────────────────────────────────────

  const todayStr = today.toISOString().split('T')[0];
  const todayApps = appointments.filter(a => a.date === todayStr && !a.isInternal);
  const todayConfirmed = todayApps.filter(a => a.confirmedPsychologist || a.confirmedPatient);
  const todayPending = todayApps.filter(a => !a.confirmedPsychologist && !a.confirmedPatient && a.status !== AppointmentStatus.CANCELED);
  const todayCanceled = todayApps.filter(a => a.status === AppointmentStatus.CANCELED);

  const upcomingToday = todayApps
    .filter(a => a.status !== AppointmentStatus.CANCELED)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 5);

  // ─── Taxa de Ocupação ────────────────────────────────────────────────────

  // Capacidade: psicólogos ativos × dias úteis no mês × slots por dia (estimativa: 8h/dia, 1h/consulta)
  const workingDaysInMonth = (() => {
    const year = selectedYear;
    const month = selectedMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d).getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return count;
  })();

  const activePsychologists = psychologists.filter(p => p.active);
  const estimatedCapacity = activePsychologists.length * workingDaysInMonth * 6; // ~6 consultas/dia/psicólogo
  const occupancyRate = estimatedCapacity > 0 ? Math.min((appsRealizados.length / estimatedCapacity) * 100, 100) : 0;

  // ─── Heatmap de Horários ─────────────────────────────────────────────────

  const heatmapData = useMemo(() => {
    const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
    const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
    const grid: Record<string, Record<string, number>> = {};

    hours.forEach(h => {
      grid[h] = {};
      dayNames.forEach(d => { grid[h][d] = 0; });
    });

    appointments.forEach(app => {
      if (app.status === AppointmentStatus.CANCELED || app.isInternal) return;
      const date = new Date(app.date + 'T12:00:00');
      const dayIdx = date.getDay(); // 0=Dom, 1=Seg...
      if (dayIdx === 0 || dayIdx === 6) return;
      const dayName = dayNames[dayIdx - 1];
      const hour = app.startTime?.substring(0, 5);
      if (grid[hour] && grid[hour][dayName] !== undefined) {
        grid[hour][dayName]++;
      }
    });

    return { grid, hours, dayNames };
  }, [appointments]);

  const maxHeatmapValue = useMemo(() => {
    let max = 0;
    Object.values(heatmapData.grid).forEach(row => {
      Object.values(row).forEach(v => { if (v > max) max = v; });
    });
    return max || 1;
  }, [heatmapData]);

  // ─── Ranking de Psicólogos ───────────────────────────────────────────────

  const psychologistRanking = useMemo(() => {
    return psychologists.map(psy => {
      const psyApps = appsRealizados.filter(a => a.psychologistId === psy.id);
      const revenue = calculateRevenue(psyApps);
      const confirmationRate = psyApps.length > 0
        ? (psyApps.filter(a => a.confirmedPsychologist).length / psyApps.length) * 100
        : 0;
      return {
        name: psy.name,
        appointments: psyApps.length,
        revenue,
        confirmationRate
      };
    }).filter(p => p.appointments > 0).sort((a, b) => b.revenue - a.revenue);
  }, [appsRealizados, psychologists, customers, plans]);

  // ─── Gráfico Receita vs Despesas ─────────────────────────────────────────

  const revenueVsExpensesData = useMemo(() => {
    const data: Record<string, { month: string; sortKey: number; receita: number; despesas: number; lucro: number }> = {};

    appointments.forEach(app => {
      if (!app.confirmedPsychologist && !isCanceledButBilled(app)) return;
      const d = new Date(app.date + 'T12:00:00');
      const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!data[key]) data[key] = { month: key, sortKey, receita: 0, despesas: 0, lucro: 0 };

      const customer = customers.find(c => c.id === app.customerId);
      const plan = findPlan(customer?.healthPlan);
      const procedure = plan?.procedures?.find(proc => proc.type === app.type);
      const amount = app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
      data[key].receita += amount;
    });

    expenses.forEach(exp => {
      const d = new Date(exp.date + 'T12:00:00');
      const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!data[key]) data[key] = { month: key, sortKey, receita: 0, despesas: 0, lucro: 0 };
      data[key].despesas += exp.amount;
    });

    return Object.values(data)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(d => ({ ...d, lucro: d.receita - d.despesas }));
  }, [appointments, expenses, customers, plans]);

  // ─── Dados existentes ────────────────────────────────────────────────────

  const revenueByPlan = plans.map(plan => {
    const planApps = appsRealizados.filter(app => {
      const customer = customers.find(c => c.id === app.customerId);
      return (customer?.healthPlan ?? '').toUpperCase() === plan.name.toUpperCase();
    });
    const appRevenue = calculateRevenue(planApps);
    return { name: plan.name, total: appRevenue };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  const revenueByPsychologist = psychologists.map(psy => {
    const psyApps = appsRealizados.filter(app => app.psychologistId === psy.id);
    return { name: psy.name, total: calculateRevenue(psyApps) };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  const monthlyRevenue = appointments
    .filter(app => app.status !== AppointmentStatus.CANCELED || isCanceledButBilled(app))
    .reduce((acc: any, app) => {
      const month = new Date(app.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      if (!acc[month]) acc[month] = { realizado: 0, previsto: 0 };
      const customer = customers.find(c => c.id === app.customerId);
      const plan = findPlan(customer?.healthPlan);
      const procedure = plan?.procedures?.find(proc => proc.type === app.type);
      const isOneTime = procedure?.isOneTimeCharge || (customer?.healthPlan === HealthPlan.PARTICULAR && app.type === AppointmentType.NEUROPSICOLOGICA);
      let amount = 0;
      if (isOneTime) {
        const firstApp = appointments
          .filter(a => a.customerId === app.customerId && a.type === app.type && (a.status !== AppointmentStatus.CANCELED || isCanceledButBilled(a)))
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        if (firstApp.id === app.id) amount = app.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
      } else {
        amount = app.customPrice ?? customer?.customPrice ?? (procedure?.price || 0);
      }
      if (app.confirmedPsychologist || isCanceledButBilled(app)) acc[month].realizado += amount;
      else acc[month].previsto += amount;
      return acc;
    }, {});

  const monthlyData = Object.entries(monthlyRevenue).map(([month, data]: [string, any]) => ({
    month, realizado: data.realizado, previsto: data.previsto, total: data.realizado + data.previsto
  }));

  const modalityData = [
    { name: 'Presencial', value: appsRealizados.filter(app => app.mode === 'Presencial').length },
    { name: 'On-line', value: appsRealizados.filter(app => app.mode === 'On-line').length },
  ].filter(d => d.value > 0);

  const MODALITY_COLORS = ['#1a365d', '#d4af37'];
  const CHART_COLORS = ['#1a365d', '#d4af37', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'];

  const growthData = useMemo(() => {
    const months: Record<string, { month: string; patients: number; psychologists: number; timestamp: number }> = {};
    const getMonthKey = (dateStr?: string) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      return { key: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }), sortKey: d.getFullYear() * 100 + d.getMonth() };
    };
    [...customers, ...psychologists].forEach(item => {
      const info = getMonthKey(item.createdAt);
      if (info && !months[info.key]) months[info.key] = { month: info.key, patients: 0, psychologists: 0, timestamp: info.sortKey };
    });
    customers.forEach(c => { const info = getMonthKey(c.createdAt); if (info) months[info.key].patients++; });
    psychologists.forEach(p => { const info = getMonthKey(p.createdAt); if (info) months[info.key].psychologists++; });
    const sorted = Object.values(months).sort((a, b) => a.timestamp - b.timestamp);
    let accPatients = 0, accPsys = 0;
    return sorted.map(m => { accPatients += m.patients; accPsys += m.psychologists; return { ...m, patients: accPatients, psychologists: accPsys }; });
  }, [customers, psychologists]);

  const planGrowthData = useMemo(() => {
    const data: Record<string, Record<string, any>> = {};
    const planNames = Array.from(new Set(plans.map(p => p.name)));
    appointments.forEach(app => {
      const date = new Date(app.date + 'T12:00:00');
      const monthKey = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = date.getFullYear() * 100 + date.getMonth();
      const customer = customers.find(c => c.id === app.customerId);
      const planName = (customer?.healthPlan as string) || 'Não Identificado';
      if (!data[monthKey]) { data[monthKey] = { month: monthKey, sortKey }; planNames.forEach(name => { data[monthKey][name as string] = 0; }); }
      if (data[monthKey][planName] !== undefined) data[monthKey][planName]++;
      else data[monthKey][planName] = 1;
    });
    return Object.values(data).sort((a, b) => a.sortKey - b.sortKey);
  }, [appointments, customers, plans]);

  const typeGrowthData = useMemo(() => {
    const data: Record<string, any> = {};
    const types = Array.from(new Set(appointments.map(a => a.type)));
    appointments.forEach(app => {
      const date = new Date(app.date + 'T12:00:00');
      const monthKey = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = date.getFullYear() * 100 + date.getMonth();
      if (!data[monthKey]) { data[monthKey] = { month: monthKey, sortKey }; types.forEach(t => data[monthKey][t as string] = 0); }
      data[monthKey][app.type as string]++;
    });
    return Object.values(data).sort((a, b) => a.sortKey - b.sortKey);
  }, [appointments]);

  const roomUsageData = useMemo(() => {
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const usage = dayNames.map(day => ({ day, count: 0 }));
    appointments.forEach(app => {
      const date = new Date(app.date + 'T12:00:00');
      const dayIdx = date.getDay();
      if (app.status !== AppointmentStatus.CANCELED) usage[dayIdx].count++;
    });
    return usage.filter((_, i) => i !== 0);
  }, [appointments]);

  const amsAlerts = customers.filter(c => {
    if (c.healthPlan !== HealthPlan.AMS_PETROBRAS || !c.amsPasswordExpiry || c.status !== CustomerStatus.ACTIVE) return false;
    const expiry = new Date(c.amsPasswordExpiry + 'T12:00:00');
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  });

  // Assinaturas próximas do vencimento (30 dias)
  const expiringSubscriptions = subscriptions.filter(s => {
    if (s.status !== SubscriptionStatus.ACTIVE) return false;
    const renewal = new Date(s.nextRenewal + 'T12:00:00');
    const diffDays = Math.ceil((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays >= 0;
  });

  // Confirmações pendentes de hoje
  const pendingConfirmationsToday = todayApps.filter(a =>
    a.confirmationStatus === 'pending' && a.status !== AppointmentStatus.CANCELED
  );

  // Pacientes sem agendamento há mais de 30 dias
  const inactivePatients = customers.filter(c => {
    if (c.status !== CustomerStatus.ACTIVE) return false;
    if (!c.lastAppointmentDate) return false;
    const last = new Date(c.lastAppointmentDate + 'T12:00:00');
    const diffDays = Math.ceil((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  });

  const waitingListPending = waitingList.filter(w => w.status === 'pending');

  const selectedMonthLabel = new Date(selectedYear, selectedMonth, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 min-h-[400px]">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Alertas AMS ── */}
          {amsAlerts.length > 0 && (
            <div className="space-y-3">
              {amsAlerts.map(customer => {
                const expiry = new Date(customer.amsPasswordExpiry! + 'T12:00:00');
                const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const isExpired = diffDays <= 0;
                return (
                  <div key={customer.id} className={cn("flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border animate-in fade-in slide-in-from-top-4 duration-500", isExpired ? "bg-red-50 border-red-100 text-red-900" : "bg-amber-50 border-amber-100 text-amber-900")}>
                    <div className="flex items-center gap-4">
                      <div className={cn("p-3 rounded-xl", isExpired ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600")}><Lock size={20} /></div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm">Vencimento de Senha AMS</h4>
                          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest", isExpired ? "bg-red-600 text-white" : "bg-amber-600 text-white")}>
                            {isExpired ? 'Expirada' : `Vence em ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`}
                          </span>
                        </div>
                        <p className="text-xs opacity-80 mt-0.5">A senha do portal AMS do paciente <span className="font-bold">{customer.name}</span> {isExpired ? 'expirou em' : 'vencerá em'} {new Date(customer.amsPasswordExpiry! + 'T12:00:00').toLocaleDateString('pt-BR')}.</p>
                      </div>
                    </div>
                    <button onClick={() => onNavigate('/clientes')} className={cn("mt-4 sm:mt-0 flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all hover:translate-x-1", isExpired ? "text-red-600" : "text-amber-600")}>
                      Atualizar no Cadastro <ChevronRight size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Header + Filtro de Período ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-priori-navy">Visão Geral</h2>
              <p className="text-zinc-500">Acompanhe o desempenho da clínica em tempo real.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-zinc-100 rounded-xl px-4 py-2.5 shadow-sm">
                <Calendar size={16} className="text-priori-navy" />
                <select
                  className="text-sm font-bold text-priori-navy bg-transparent focus:outline-none cursor-pointer"
                  value={`${selectedYear}-${selectedMonth}`}
                  onChange={e => {
                    const [y, m] = e.target.value.split('-').map(Number);
                    setSelectedYear(y);
                    setSelectedMonth(m);
                  }}
                >
                  {availableMonths.map(m => (
                    <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Alertas Consolidados ── */}
          {(pendingConfirmationsToday.length > 0 || expiringSubscriptions.length > 0 || inactivePatients.length > 0 || waitingListPending.length > 0) && (
            <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-amber-50 rounded-xl"><Bell size={16} className="text-amber-500" /></div>
                <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Alertas e Notificações</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {pendingConfirmationsToday.length > 0 && (
                  <button onClick={() => onNavigate('/pendentes')} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl hover:border-amber-300 transition-all text-left">
                    <AlertCircle size={18} className="text-amber-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-700">{pendingConfirmationsToday.length} confirmação{pendingConfirmationsToday.length > 1 ? 'ões' : ''} pendente{pendingConfirmationsToday.length > 1 ? 's' : ''} hoje</p>
                      <p className="text-[10px] text-amber-500">Ver pendentes →</p>
                    </div>
                  </button>
                )}
                {expiringSubscriptions.length > 0 && (
                  <button onClick={() => onNavigate('/planos')} className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl hover:border-blue-300 transition-all text-left">
                    <Clock size={18} className="text-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-blue-700">{expiringSubscriptions.length} assinatura{expiringSubscriptions.length > 1 ? 's' : ''} vencendo em 30 dias</p>
                      <p className="text-[10px] text-blue-500">Ver planos →</p>
                    </div>
                  </button>
                )}
                {inactivePatients.length > 0 && (
                  <button onClick={() => onNavigate('/clientes')} className="flex items-center gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl hover:border-zinc-300 transition-all text-left">
                    <UserMinus size={18} className="text-zinc-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-zinc-700">{inactivePatients.length} paciente{inactivePatients.length > 1 ? 's' : ''} sem consulta há +30 dias</p>
                      <p className="text-[10px] text-zinc-500">Ver pacientes →</p>
                    </div>
                  </button>
                )}
                {waitingListPending.length > 0 && (
                  <button onClick={() => onNavigate('/lista-espera')} className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-100 rounded-xl hover:border-purple-300 transition-all text-left">
                    <ListOrdered size={18} className="text-purple-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-purple-700">{waitingListPending.length} pessoa{waitingListPending.length > 1 ? 's' : ''} na fila de espera</p>
                      <p className="text-[10px] text-purple-500">Ver fila →</p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Agenda do Dia ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-priori-navy rounded-xl text-white"><Calendar size={18} /></div>
                <div>
                  <h3 className="text-sm font-bold text-priori-navy">Agenda de Hoje</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
              </div>
              <button onClick={() => onNavigate('/agenda')} className="text-xs font-bold text-priori-gold hover:text-priori-navy transition-colors flex items-center gap-1">
                Ver agenda completa <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="p-4 bg-priori-navy/5 rounded-xl text-center">
                <p className="text-2xl font-black text-priori-navy">{todayApps.length}</p>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Agendados</p>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl text-center">
                <p className="text-2xl font-black text-emerald-600">{todayConfirmed.length}</p>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Confirmados</p>
              </div>
              <div className="p-4 bg-red-50 rounded-xl text-center">
                <p className="text-2xl font-black text-red-500">{todayCanceled.length}</p>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Cancelados</p>
              </div>
            </div>

            {upcomingToday.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Próximos atendimentos</p>
                {upcomingToday.map(app => {
                  const customer = customers.find(c => c.id === app.customerId);
                  const psy = psychologists.find(p => p.id === app.psychologistId);
                  const isConfirmed = app.confirmedPsychologist || app.confirmedPatient;
                  return (
                    <div key={app.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <div className="text-center min-w-[48px]">
                        <p className="text-sm font-black text-priori-navy">{app.startTime}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-priori-navy truncate">{customer?.name || 'Paciente'}</p>
                        <p className="text-[10px] text-zinc-400">{psy?.name} · {app.type}</p>
                      </div>
                      <div className={cn("px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider", isConfirmed ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                        {isConfirmed ? 'Confirmado' : 'Pendente'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-400">
                <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum atendimento agendado para hoje</p>
              </div>
            )}
          </div>

          {/* ── KPIs Principais ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                label: 'Pacientes Ativos',
                value: activeCustomersCount,
                prevValue: activeCustomersCount, // sem variação direta
                icon: Users, color: 'text-priori-navy', bg: 'bg-priori-navy/10', path: '/clientes',
                extra: null
              },
              {
                label: 'Faturamento Realizado',
                value: `R$ ${fmt(revenueRealizado)}`,
                prevValue: revenueRealizadoPrev,
                currentNum: revenueRealizado,
                icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', path: '/financeiro',
                extra: getTrendText(revenueRealizado, revenueRealizadoPrev)
              },
              {
                label: 'Taxa de Comparecimento',
                value: `${attendanceRate.toFixed(1)}%`,
                prevValue: attendanceRatePrev,
                currentNum: attendanceRate,
                icon: ShieldCheck, color: 'text-priori-gold', bg: 'bg-priori-gold/10', path: '/agenda',
                extra: getTrendText(attendanceRate, attendanceRatePrev)
              },
              {
                label: 'Taxa de Cancelamentos',
                value: `${cancelationRate.toFixed(1)}%`,
                prevValue: cancelationRatePrev,
                currentNum: cancelationRate,
                icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', path: '/agenda',
                extra: getTrendText(cancelationRate, cancelationRatePrev)
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white border border-zinc-100 p-6 rounded-2xl relative overflow-hidden group shadow-sm cursor-pointer hover:border-priori-gold/30 transition-all"
                onClick={() => stat.path && onNavigate(stat.path)}
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <stat.icon size={80} className={stat.color} />
                </div>
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("p-3 rounded-xl", stat.bg)}>
                    <stat.icon size={20} className={stat.color} />
                  </div>
                  <ArrowUpRight size={16} className="text-zinc-300 group-hover:text-priori-gold transition-colors" />
                </div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
                <h3 className="text-2xl font-bold text-priori-navy">{stat.value}</h3>
                {stat.extra && <div className="mt-1 flex items-center gap-1">{stat.extra}</div>}
              </div>
            ))}
          </div>

          {/* ── Ticket Médio + Ocupação + Retenção ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-priori-gold/10 rounded-xl"><DollarSign size={18} className="text-priori-gold" /></div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ticket Médio / Consulta</p>
              </div>
              <p className="text-2xl font-black text-priori-navy">R$ {fmt(ticketMedioConsulta)}</p>
              <div className="mt-1">{getTrendText(ticketMedioConsulta, ticketMedioConsultaPrev)}</div>
            </div>

            <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-emerald-50 rounded-xl"><Users size={18} className="text-emerald-500" /></div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ticket Médio / Paciente</p>
              </div>
              <p className="text-2xl font-black text-priori-navy">R$ {fmt(ticketMedioPaciente)}</p>
              <p className="text-[10px] text-zinc-400 mt-1">{activeCustomersCount} pacientes ativos</p>
            </div>

            <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-blue-50 rounded-xl"><Zap size={18} className="text-blue-500" /></div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Taxa de Ocupação</p>
              </div>
              <p className="text-2xl font-black text-priori-navy">{occupancyRate.toFixed(1)}%</p>
              <div className="mt-2 h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${occupancyRate}%` }} />
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">{appsRealizados.length} de ~{estimatedCapacity} slots</p>
            </div>

            <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-purple-50 rounded-xl"><ShieldCheck size={18} className="text-purple-500" /></div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Retenção de Pacientes</p>
              </div>
              <p className="text-2xl font-black text-priori-navy">{retentionRate.toFixed(1)}%</p>
              <div className="mt-2 h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-400 rounded-full transition-all" style={{ width: `${retentionRate}%` }} />
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">{inactivatedThisMonth.length} inativado{inactivatedThisMonth.length !== 1 ? 's' : ''} no período</p>
            </div>
          </div>

          {/* ── Forecast de Receita ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 rounded-xl"><Target size={18} className="text-emerald-500" /></div>
                <div>
                  <h3 className="text-sm font-bold text-priori-navy">Forecast de Receita — {selectedMonthLabel}</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Realizado + Previsto (agendamentos futuros)</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400">Projeção total</p>
                <p className="text-lg font-black text-priori-navy">R$ {fmt(forecastRevenue)}</p>
              </div>
            </div>
            <div className="h-3 w-full bg-zinc-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700"
                style={{ width: `${forecastProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                <span className="text-zinc-600">Realizado: <strong className="text-emerald-600">R$ {fmt(revenueRealizado)}</strong></span>
              </div>
              <span className="font-bold text-zinc-400">{forecastProgress.toFixed(1)}% concluído</span>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-zinc-200 inline-block" />
                <span className="text-zinc-600">Previsto: <strong className="text-priori-gold">R$ {fmt(revenuePrevisto)}</strong></span>
              </div>
            </div>
          </div>

          {/* ── DRE Gerencial ── */}
          <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
              <TrendingUp size={200} className="text-priori-navy" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-priori-navy rounded-2xl text-white shadow-lg shadow-priori-navy/20"><Activity size={24} /></div>
                <div>
                  <h3 className="text-xl font-bold text-priori-navy">Margem Líquida Real (DRE)</h3>
                  <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Resultado Financeiro Consolidado — {selectedMonthLabel}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Faturamento Bruto</p>
                  <p className="text-2xl font-black text-emerald-600">R$ {fmt(revenueRealizado)}</p>
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 w-full" /></div>
                </div>
                <div className="space-y-2 text-red-500">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Total de Repasses</p>
                  <p className="text-2xl font-black">- R$ {fmt(totalRepasseRealizado)}</p>
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400" style={{ width: `${revenueRealizado > 0 ? (totalRepasseRealizado / revenueRealizado) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[9px] font-bold uppercase">Representa {revenueRealizado > 0 ? ((totalRepasseRealizado / revenueRealizado) * 100).toFixed(1) : 0}% da receita</p>
                </div>
                <div className="space-y-2 text-amber-600">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Despesas Clínica</p>
                  <p className="text-2xl font-black">- R$ {fmt(totalExpenses)}</p>
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${revenueRealizado > 0 ? (totalExpenses / revenueRealizado) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[9px] font-bold uppercase">Custos fixos e operacionais</p>
                </div>
                <div className="p-6 bg-priori-navy rounded-3xl text-white shadow-xl shadow-priori-navy/20 flex flex-col justify-center">
                  <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-1">Lucro Líquido Real</p>
                  <p className="text-3xl font-black text-priori-gold">R$ {fmt(netProfit)}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="px-2 py-0.5 bg-white/10 rounded-full">
                      <span className="text-[10px] font-bold">MARGEM: {revenueRealizado > 0 ? ((netProfit / revenueRealizado) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Gráfico Receita vs Despesas ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Receita vs Despesas ao Longo do Tempo</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueVsExpensesData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: number) => `R$ ${fmt(v)}`} />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area type="monotone" dataKey="receita" name="Receita" fill="#10b981" stroke="#10b981" fillOpacity={0.15} strokeWidth={2} animationDuration={1500} />
                  <Area type="monotone" dataKey="despesas" name="Despesas" fill="#ef4444" stroke="#ef4444" fillOpacity={0.15} strokeWidth={2} animationDuration={1500} />
                  <Line type="monotone" dataKey="lucro" name="Lucro Líquido" stroke="#d4af37" strokeWidth={3} dot={{ r: 4, fill: '#d4af37' }} activeDot={{ r: 6 }} animationDuration={1500} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Ranking de Psicólogos ── */}
          {psychologistRanking.length > 0 && (
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-priori-gold/10 rounded-xl"><Flame size={18} className="text-priori-gold" /></div>
                <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Ranking de Produtividade — Psicólogos</h3>
              </div>
              <div className="space-y-3">
                {psychologistRanking.map((psy, idx) => {
                  const maxRevenue = psychologistRanking[0].revenue || 1;
                  return (
                    <div key={psy.name} className="flex items-center gap-4">
                      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0",
                        idx === 0 ? "bg-priori-gold text-white" : idx === 1 ? "bg-zinc-300 text-zinc-700" : idx === 2 ? "bg-amber-700/20 text-amber-700" : "bg-zinc-100 text-zinc-500"
                      )}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-priori-navy truncate">{psy.name}</span>
                          <span className="text-sm font-black text-priori-gold ml-2 shrink-0">R$ {fmtShort(psy.revenue)}</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-priori-gold rounded-full transition-all" style={{ width: `${(psy.revenue / maxRevenue) * 100}%` }} />
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-zinc-400">{psy.appointments} atendimentos</span>
                          <span className="text-[10px] text-zinc-400">·</span>
                          <span className="text-[10px] text-zinc-400">{psy.confirmationRate.toFixed(0)}% confirmação</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Churn / Retenção ── */}
          {inactivatedThisMonth.length > 0 && (
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-red-50 rounded-xl"><UserMinus size={18} className="text-red-500" /></div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Churn — Pacientes Inativados</h3>
                  <p className="text-[10px] text-zinc-400">{selectedMonthLabel}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="p-4 bg-red-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-red-500">{inactivatedThisMonth.length}</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Inativados</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-emerald-600">{activeCustomersCount}</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Ativos</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-purple-600">{retentionRate.toFixed(1)}%</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Retenção</p>
                </div>
              </div>
              {churnByReason.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Motivos de Inativação</p>
                  {churnByReason.map(r => (
                    <div key={r.reason} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <span className="text-sm text-zinc-600">{r.reason}</span>
                      <span className="text-sm font-bold text-red-500">{r.count} paciente{r.count > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Faturamento por Plano / Psicólogo / Mensal ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento por Plano</h3>
              <div className="space-y-4">
                {revenueByPlan.length > 0 ? revenueByPlan.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm text-priori-navy">{item.name}</span>
                    <span className="text-sm font-bold text-priori-gold">R$ {fmtShort(item.total)}</span>
                  </div>
                )) : <p className="text-sm text-zinc-400 text-center py-4">Sem dados no período</p>}
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento por Psicólogo</h3>
              <div className="space-y-4">
                {revenueByPsychologist.length > 0 ? revenueByPsychologist.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm text-priori-navy">{item.name}</span>
                    <span className="text-sm font-bold text-priori-gold">R$ {fmtShort(item.total)}</span>
                  </div>
                )) : <p className="text-sm text-zinc-400 text-center py-4">Sem dados no período</p>}
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento Mensal (Consultas)</h3>
              <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {monthlyData.map(item => (
                  <div key={item.month} className="flex flex-col gap-1 py-1 border-b border-zinc-50 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-priori-navy capitalize">{item.month}</span>
                      <span className="text-sm font-bold text-priori-navy">Total: R$ {fmtShort(item.total)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-600">Realizado: R$ {fmtShort(item.realizado)}</span>
                      <span className="text-priori-gold">Previsto: R$ {fmtShort(item.previsto)}</span>
                    </div>
                  </div>
                ))}
                {monthlyData.length === 0 && <p className="text-sm text-zinc-400 text-center py-4">Nenhum dado financeiro</p>}
              </div>
            </div>

            {/* Modalidade */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">Distribuição por Modalidade</h3>
              <div className="h-[220px] w-full">
                {modalityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={modalityData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" animationBegin={0} animationDuration={1500}>
                        {modalityData.map((_entry, index) => <Cell key={`cell-${index}`} fill={MODALITY_COLORS[index % MODALITY_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value: number) => [`${value} atendimentos`, 'Quantidade']} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic">Nenhum atendimento realizado</div>
                )}
              </div>
              {modalityData.length > 0 && (
                <div className="mt-4 flex justify-around text-[10px] font-bold uppercase tracking-tight text-zinc-400">
                  {modalityData.map((d, i) => {
                    const total = modalityData.reduce((acc, curr) => acc + curr.value, 0);
                    const percent = Math.round((d.value / total) * 100);
                    return (
                      <div key={d.name} className="flex flex-col items-center">
                        <span style={{ color: MODALITY_COLORS[i] }}>{d.name}</span>
                        <span className="text-lg text-priori-navy">{percent}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Despesas */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Resumo de Despesas por Categoria</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-red-500">Total: R$ {fmtShort(totalExpenses)}</span>
                  {getTrendText(totalExpenses, totalExpensesPrev)}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.values(ExpenseCategory).map(cat => {
                  const catTotal = expensesFiltered.filter(e => e.category === cat).reduce((acc, e) => acc + e.amount, 0);
                  if (catTotal === 0) return null;
                  return (
                    <div key={cat} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">{cat}</p>
                      <p className="text-lg font-bold text-priori-navy">R$ {fmtShort(catTotal)}</p>
                    </div>
                  );
                })}
                {expensesFiltered.length === 0 && <p className="col-span-4 text-sm text-zinc-400 text-center py-4">Sem despesas no período</p>}
              </div>
            </div>
          </div>

          {/* ── Gráficos de Evolução ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Crescimento da Clínica</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line type="monotone" dataKey="patients" name="Pacientes" stroke="#1a365d" strokeWidth={3} dot={{ r: 4, fill: '#1a365d' }} activeDot={{ r: 6 }} animationDuration={1500} />
                    <Line type="monotone" dataKey="psychologists" name="Psicólogos" stroke="#d4af37" strokeWidth={3} dot={{ r: 4, fill: '#d4af37' }} activeDot={{ r: 6 }} animationDuration={1500} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Evolução por Plano (Volume)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={planGrowthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {Array.from(new Set(plans.map(p => p.name))).map((name, i) => (
                      <Area key={name} type="monotone" dataKey={name as string} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.6} animationDuration={1500} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Distribuição por Tipo (TUSS)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeGrowthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {Array.from(new Set(appointments.map(a => a.type))).map((type, i) => (
                      <Bar key={type} dataKey={type as string} stackId="a" fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} radius={i === 0 ? [0, 0, 4, 4] : [0, 0, 0, 0]} animationDuration={1500} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Ocupação das Salas (Por Dia)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roomUsageData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="day" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="count" name="Atendimentos" fill="#1a365d" radius={[8, 8, 0, 0]} animationDuration={1500} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Heatmap de Horários ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-priori-navy/10 rounded-xl"><BarChart2 size={18} className="text-priori-navy" /></div>
              <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Mapa de Calor — Horários Mais Ocupados</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-3 pr-4 w-16">Hora</th>
                    {heatmapData.dayNames.map(d => (
                      <th key={d} className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-3 px-1">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.hours.map(hour => (
                    <tr key={hour}>
                      <td className="text-[10px] font-bold text-zinc-400 pr-4 py-1">{hour}</td>
                      {heatmapData.dayNames.map(day => {
                        const value = heatmapData.grid[hour]?.[day] || 0;
                        const intensity = value / maxHeatmapValue;
                        const bg = intensity === 0
                          ? 'bg-zinc-50'
                          : intensity < 0.33
                          ? 'bg-priori-navy/10'
                          : intensity < 0.66
                          ? 'bg-priori-navy/30'
                          : 'bg-priori-navy/70';
                        const textColor = intensity >= 0.66 ? 'text-white' : 'text-priori-navy';
                        return (
                          <td key={day} className="px-1 py-1">
                            <div className={cn("w-full h-8 rounded-lg flex items-center justify-center font-bold transition-all", bg, textColor)}>
                              {value > 0 ? value : ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-3 mt-4 justify-end">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Intensidade:</span>
                {[
                  { label: 'Vazio', bg: 'bg-zinc-50 border border-zinc-200' },
                  { label: 'Baixo', bg: 'bg-priori-navy/10' },
                  { label: 'Médio', bg: 'bg-priori-navy/30' },
                  { label: 'Alto', bg: 'bg-priori-navy/70' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div className={cn("w-4 h-4 rounded", l.bg)} />
                    <span className="text-[10px] text-zinc-400">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-priori-gold/10 flex items-center justify-center">
              <Activity size={32} className="text-priori-gold" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-priori-navy">Núcleo Priori</h3>
              <p className="text-zinc-500 text-sm max-w-xs">Neuropsicologia e Psicoterapia. Use o menu lateral para gerenciar seus pacientes e agenda.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
