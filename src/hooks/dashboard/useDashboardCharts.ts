/**
 * useDashboardCharts
 * Calcula: dados de gráficos — heatmap, ranking de psicólogos, receita vs despesas,
 * faturamento por plano/psicólogo, modalidade, crescimento e ocupação por sala.
 */
import { useMemo } from 'react';
import {
  Appointment, Customer, Psychologist, Plan, Expense,
  AppointmentStatus, AppointmentType, HealthPlan,
} from '../../services/types';
import { calcRepass } from '../../lib/repassRules';

interface DashboardChartsParams {
  appointmentsFiltered: Appointment[];
  appointments: Appointment[];
  expenses: Expense[];
  customers: Customer[];
  psychologists: Psychologist[];
  plans: Plan[];
  appsRealizados: Appointment[];
  appsNaoCancelados: Appointment[];
  workingDaysInMonth: number;
  findPlan: (healthPlan?: string) => Plan | undefined;
  calculateRevenue: (apps: Appointment[]) => number;
  isCanceledButBilled: (app: Appointment) => boolean;
}

export function useDashboardCharts({
  appointmentsFiltered, appointments, expenses, customers, psychologists, plans,
  appsRealizados, appsNaoCancelados, workingDaysInMonth,
  findPlan, calculateRevenue, isCanceledButBilled,
}: DashboardChartsParams) {

  // ─── Taxa de Ocupação ─────────────────────────────────────────────────────
  const activePsychologists = useMemo(() => psychologists.filter(p => p.active), [psychologists]);
  const estimatedCapacity   = activePsychologists.length * workingDaysInMonth * 6;
  const occupancyRate       = estimatedCapacity > 0
    ? Math.min((appsNaoCancelados.length / estimatedCapacity) * 100, 100) : 0;

  // ─── Heatmap de Horários ──────────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
    const hours    = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];
    const grid: Record<string, Record<string, number>> = {};
    hours.forEach(h => { grid[h] = {}; dayNames.forEach(d => { grid[h][d] = 0; }); });
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
    Object.values(heatmapData.grid).forEach(row =>
      Object.values(row).forEach(v => { if (v > max) max = v; })
    );
    return max || 1;
  }, [heatmapData]);

  // ─── Ranking de Psicólogos ────────────────────────────────────────────────
  const psychologistRanking = useMemo(() =>
    psychologists.map(psy => {
      const psyApps      = appsRealizados.filter(a => a.psychologistId === psy.id);
      const grossRevenue = calculateRevenue(psyApps);
      const repasseTotal = psyApps.reduce((total, app) => {
        const customer  = customers.find(c => c.id === app.customerId);
        const plan      = findPlan(customer?.healthPlan);
        const procedure = plan?.procedures?.find(proc => proc.type === app.type);
        const appPrice  = app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
        return total + (app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(appPrice, psy));
      }, 0);
      const netRevenue       = grossRevenue - repasseTotal;
      const confirmationRate = psyApps.length > 0
        ? (psyApps.filter(a => a.confirmedPsychologist).length / psyApps.length) * 100 : 0;
      return { name: psy.name, appointments: psyApps.length, grossRevenue, repasseTotal, netRevenue, confirmationRate };
    }).filter(p => p.appointments > 0).sort((a, b) => b.grossRevenue - a.grossRevenue),
    [appsRealizados, psychologists, customers, findPlan, calculateRevenue]
  );

  // ─── Gráfico Receita vs Despesas ──────────────────────────────────────────
  const revenueVsExpensesData = useMemo(() => {
    const data: Record<string, { month: string; sortKey: number; receita: number; repasses: number; despesas: number; lucro: number }> = {};

    // Agrupa por paciente+tipo para lidar corretamente com cobranças únicas (isOneTimeCharge)
    const grouped = appointments
      .filter(app => app.confirmedPsychologist || isCanceledButBilled(app))
      .reduce((acc: Record<string, Appointment[]>, app) => {
        const key = `${app.customerId}-${app.type}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(app);
        return acc;
      }, {});

    Object.values(grouped).forEach(group => {
      const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
      sorted.forEach((app, idx) => {
        const customer  = customers.find(c => c.id === app.customerId);
        const psy       = psychologists.find(p => p.id === app.psychologistId);
        const plan      = findPlan(customer?.healthPlan);
        const procedure = plan?.procedures?.find(proc => proc.type === app.type);
        const isOneTime = procedure?.isOneTimeCharge ||
          (customer?.healthPlan === HealthPlan.PARTICULAR && app.type === AppointmentType.NEUROPSICOLOGICA);

        // Cobrança única: apenas a primeira consulta do grupo é contabilizada
        if (isOneTime && idx > 0) return;

        const amount = app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
        const repass = app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(amount, psy);

        const d       = new Date(app.date + 'T12:00:00');
        const key     = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
        const sortKey = d.getFullYear() * 100 + d.getMonth();
        if (!data[key]) data[key] = { month: key, sortKey, receita: 0, repasses: 0, despesas: 0, lucro: 0 };
        data[key].receita  += amount;
        data[key].repasses += repass;
      });
    });

    expenses.forEach(exp => {
      const d       = new Date(exp.date + 'T12:00:00');
      const key     = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      // Só adiciona despesas em meses que já possuem receita (evita meses "fantasma" com lucro negativo)
      if (data[key]) {
        data[key].despesas += exp.amount;
      }
    });

    return Object.values(data)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(d => ({ ...d, lucro: d.receita - d.repasses - d.despesas }));
  }, [appointments, expenses, customers, psychologists, findPlan, isCanceledButBilled]);

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

  // ─── Receita mensal (realizado vs previsto) ───────────────────────────────
  const monthlyData = useMemo(() => {
    const monthlyRevenue: Record<string, { realizado: number; previsto: number; sortKey: number }> = {};
    appointments
      .filter(app => app.status !== AppointmentStatus.CANCELED || isCanceledButBilled(app))
      .forEach(app => {
        const d       = new Date(app.date + 'T12:00:00');
        const month   = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        const sortKey = d.getFullYear() * 100 + d.getMonth();
        if (!monthlyRevenue[month]) monthlyRevenue[month] = { realizado: 0, previsto: 0, sortKey };
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
        if (app.confirmedPsychologist || isCanceledButBilled(app)) monthlyRevenue[month].realizado += amount;
        else monthlyRevenue[month].previsto += amount;
      });
    return Object.entries(monthlyRevenue)
      .map(([month, data]) => ({
        month, realizado: data.realizado, previsto: data.previsto,
        total: data.realizado + data.previsto, sortKey: data.sortKey,
      }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [appointments, customers, findPlan, isCanceledButBilled]);

  // ─── Modalidade ───────────────────────────────────────────────────────────
  const modalityData = useMemo(() => [
    { name: 'Presencial', value: appsRealizados.filter(app => app.mode === 'Presencial').length },
    { name: 'On-line',    value: appsRealizados.filter(app => app.mode === 'On-line').length },
  ].filter(d => d.value > 0), [appsRealizados]);

  // ─── Crescimento da clínica ───────────────────────────────────────────────
  const growthData = useMemo(() => {
    const months: Record<string, { month: string; patients: number; psychologists: number; timestamp: number }> = {};
    const getInfo = (dateStr?: string | null) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null; // proteção contra datas inválidas
      return { key: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }), sortKey: d.getFullYear() * 100 + d.getMonth() };
    };
    // Extrai createdAt de psicólogo de forma segura (campo pode não existir no tipo)
    const getPsyCreatedAt = (p: any): string | undefined => p?.createdAt ?? p?.created_at;
    customers.forEach(c => {
      const info = getInfo(c.createdAt);
      if (info && !months[info.key]) months[info.key] = { month: info.key, patients: 0, psychologists: 0, timestamp: info.sortKey };
    });
    psychologists.forEach(p => {
      const info = getInfo(getPsyCreatedAt(p));
      if (info && !months[info.key]) months[info.key] = { month: info.key, patients: 0, psychologists: 0, timestamp: info.sortKey };
    });
    customers.forEach(c => { const i = getInfo(c.createdAt); if (i && months[i.key]) months[i.key].patients++; });
    psychologists.forEach(p => { const i = getInfo(getPsyCreatedAt(p)); if (i && months[i.key]) months[i.key].psychologists++; });
    const sorted = Object.values(months).sort((a, b) => a.timestamp - b.timestamp);
    let accP = 0, accPsy = 0;
    return sorted.map(m => { accP += m.patients; accPsy += m.psychologists; return { ...m, patients: accP, psychologists: accPsy }; });
  }, [customers, psychologists]);

  // ─── Crescimento por plano ────────────────────────────────────────────────
  const planGrowthData = useMemo(() => {
    const data: Record<string, Record<string, any>> = {};
    const planNames = Array.from(new Set(plans.map(p => p.name)));
    // Mapa de normalização: healthPlan (upper) → nome canônico do plano
    const planNameMap: Record<string, string> = {};
    plans.forEach(p => { planNameMap[p.name.toUpperCase()] = p.name; });

    appointments.forEach(app => {
      const d        = new Date(app.date + 'T12:00:00');
      const monthKey = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey  = d.getFullYear() * 100 + d.getMonth();
      const customer = customers.find(c => c.id === app.customerId);
      const raw      = (customer?.healthPlan as string) || '';
      // Normaliza para o nome canônico do plano (garante que o dataKey do gráfico bate)
      const planName = planNameMap[raw.toUpperCase()] || raw || 'Não Identificado';
      if (!data[monthKey]) { data[monthKey] = { month: monthKey, sortKey }; planNames.forEach(n => { data[monthKey][n] = 0; }); }
      if (data[monthKey][planName] !== undefined) data[monthKey][planName]++;
      else data[monthKey][planName] = 1;
    });
    return Object.values(data).sort((a, b) => a.sortKey - b.sortKey);
  }, [appointments, customers, plans]);

  // ─── Crescimento por tipo ─────────────────────────────────────────────────
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

  // ─── Ocupação por dia da semana ───────────────────────────────────────────
  const roomUsageData = useMemo(() => {
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const usage    = dayNames.map(day => ({ day, count: 0 }));
    appointmentsFiltered.forEach(app => {
      const dayIdx = new Date(app.date + 'T12:00:00').getDay();
      if (app.status !== AppointmentStatus.CANCELED) usage[dayIdx].count++;
    });
    return usage.filter((_, i) => i !== 0); // Remove domingo
  }, [appointmentsFiltered]);

  return {
    activePsychologists, estimatedCapacity, occupancyRate,
    heatmapData, maxHeatmapValue,
    psychologistRanking,
    revenueVsExpensesData,
    revenueByPlan, revenueByPsychologist, monthlyData, modalityData,
    growthData, planGrowthData, typeGrowthData,
    roomUsageData,
  };
}
