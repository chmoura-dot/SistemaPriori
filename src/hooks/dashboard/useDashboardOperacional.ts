/**
 * useDashboardOperacional — VISÃO 2
 * Taxa de Ocupação (capacidade instalada), No-Show ponderado,
 * Churn segmentado, Heatmap de ociosidade, Ranking de no-show.
 */
import { useMemo } from 'react';
import {
  Appointment, Customer, Psychologist, Plan,
  AppointmentStatus, CustomerStatus, InactivationReason,
} from '../../services/types';
import { getAppPrice, PricingContext } from '../../lib/pricing';

interface Params {
  appointments: Appointment[];
  appointmentsFiltered: Appointment[];
  appsRealizados: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  today: Date;
  todayStr: string;
  filterMode: 'month' | 'year' | 'all';
  selectedMonth: number;
  selectedYear: number;
  isInSelectedPeriod: (dateStr: string) => boolean;
  activeCustomersCount: number;
  calculateRevenue: (apps: Appointment[]) => number;
  isCanceledButBilled: (app: Appointment) => boolean;
  pricingCtx: PricingContext;
}

/** Minutos entre dois horários HH:mm */
function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export function useDashboardOperacional({
  appointments, appointmentsFiltered, appsRealizados, customers, psychologists,
  today, todayStr, filterMode, selectedMonth, selectedYear,
  isInSelectedPeriod, activeCustomersCount, calculateRevenue, isCanceledButBilled,
  pricingCtx,
}: Params) {

  const activePsychologists = useMemo(() => psychologists.filter(p => p.active), [psychologists]);

  // ─── CAPACIDADE INSTALADA (horas reais por availability) ───────────────
  const capacidadeHoras = useMemo(() => {
    if (filterMode === 'all') {
      // Para "todo período" usa estimativa: psicólogos ativos × 22 dias × horas médias
      return activePsychologists.reduce((total, psy) => {
        const avgHoursPerDay = (psy.availability || []).reduce((h, av) => h + diffMinutes(av.startTime, av.endTime) / 60, 0)
          / Math.max((psy.availability || []).length, 1);
        return total + avgHoursPerDay * 22 * 6; // ~6 meses estimado
      }, 0);
    }
    // Conta dias úteis no período por dayOfWeek
    const daysInPeriod = filterMode === 'year' ? 12 : 1;
    let totalHours = 0;
    activePsychologists.forEach(psy => {
      (psy.availability || []).forEach(av => {
        const hoursPerSlot = diffMinutes(av.startTime, av.endTime) / 60;
        // Conta quantos dias desse dayOfWeek existem no período
        let count = 0;
        if (filterMode === 'month') {
          const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
          for (let d = 1; d <= daysInMonth; d++) {
            if (new Date(selectedYear, selectedMonth, d).getDay() === av.dayOfWeek) count++;
          }
        } else {
          // Ano inteiro
          for (let m = 0; m < 12; m++) {
            const daysInMonth = new Date(selectedYear, m + 1, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
              if (new Date(selectedYear, m, d).getDay() === av.dayOfWeek) count++;
            }
          }
        }
        totalHours += hoursPerSlot * count;
      });
    });
    return totalHours;
  }, [activePsychologists, filterMode, selectedMonth, selectedYear]);

  // ─── HORAS EFETIVAMENTE OCUPADAS ───────────────────────────────────────
  const horasOcupadas = useMemo(() => {
    const appsValidos = appointmentsFiltered.filter(
      a => a.status !== AppointmentStatus.CANCELED && !a.isInternal
    );
    return appsValidos.reduce((total, app) => {
      const mins = diffMinutes(app.startTime, app.endTime);
      return total + (mins > 0 ? mins / 60 : 0.83); // fallback 50min
    }, 0);
  }, [appointmentsFiltered]);

  const taxaOcupacao = capacidadeHoras > 0 ? Math.min((horasOcupadas / capacidadeHoras) * 100, 100) : 0;

  // ─── OCUPAÇÃO POR PSICÓLOGO ────────────────────────────────────────────
  const ocupacaoPorPsicologo = useMemo(() =>
    activePsychologists.map(psy => {
      // Agendados = todos não cancelados no período
      const psyAppsAgendados = appointmentsFiltered.filter(
        a => a.psychologistId === psy.id && a.status !== AppointmentStatus.CANCELED && !a.isInternal
      );
      const horasAgendadas = psyAppsAgendados.reduce((t, a) => {
        const mins = diffMinutes(a.startTime, a.endTime);
        return t + (mins > 0 ? mins / 60 : 0.83);
      }, 0);
      // Realizado = apenas confirmados pelo psicólogo
      const psyAppsRealizados = psyAppsAgendados.filter(a => a.confirmedPsychologist);
      const horasUsadas = psyAppsRealizados.reduce((t, a) => {
        const mins = diffMinutes(a.startTime, a.endTime);
        return t + (mins > 0 ? mins / 60 : 0.83);
      }, 0);
      // Capacidade individual
      let capacidade = 0;
      if (filterMode === 'month') {
        (psy.availability || []).forEach(av => {
          const hoursPerSlot = diffMinutes(av.startTime, av.endTime) / 60;
          const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
          let count = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            if (new Date(selectedYear, selectedMonth, d).getDay() === av.dayOfWeek) count++;
          }
          capacidade += hoursPerSlot * count;
        });
      } else {
        const avgDaily = (psy.availability || []).reduce((h, av) => h + diffMinutes(av.startTime, av.endTime) / 60, 0);
        capacidade = avgDaily * 22; // estimativa simples
      }
      const cancelados = appointmentsFiltered.filter(
        a => a.psychologistId === psy.id && a.status === AppointmentStatus.CANCELED && !a.isInternal
      ).length;
      const pendente = Math.max(0, horasAgendadas - horasUsadas);
      return {
        nome: psy.name,
        horasAgendadas: Math.round(horasAgendadas * 10) / 10,
        horasUsadas: Math.round(horasUsadas * 10) / 10,
        pendente: Math.round(pendente * 10) / 10,
        capacidade: Math.round(capacidade * 10) / 10,
        ociosidade: Math.round(Math.max(0, capacidade - horasAgendadas) * 10) / 10,
        taxa: capacidade > 0 ? Math.min((horasAgendadas / capacidade) * 100, 100) : 0,
        sessoes: psyAppsAgendados.length,
        cancelados,
      };
    }).sort((a, b) => b.taxa - a.taxa),
    [activePsychologists, appointmentsFiltered, filterMode, selectedMonth, selectedYear]
  );

  // ─── NO-SHOW (consultas passadas, não canceladas, não confirmadas) ─────
  const noShowApps = useMemo(() =>
    appointmentsFiltered.filter(app =>
      app.date < todayStr &&
      app.status !== AppointmentStatus.CANCELED &&
      !app.confirmedPsychologist &&
      !app.confirmedPatient &&
      !app.isInternal
    ),
    [appointmentsFiltered, todayStr]
  );
  const pastNonCanceled = useMemo(() =>
    appointmentsFiltered.filter(a =>
      a.date <= todayStr && a.status !== AppointmentStatus.CANCELED && !a.isInternal
    ).length,
    [appointmentsFiltered, todayStr]
  );
  const noShowRate = pastNonCanceled > 0 ? (noShowApps.length / pastNonCanceled) * 100 : 0;

  // ─── IMPACTO FINANCEIRO DO NO-SHOW (ponderado por psicólogo) ───────────
  const impactoFinanceiroNoShow = useMemo(() =>
    noShowApps.reduce((total, app) => total + getAppPrice(app, pricingCtx), 0),
    [noShowApps, pricingCtx]
  );

  // ─── NO-SHOW POR PSICÓLOGO ────────────────────────────────────────────
  const noShowPorPsicologo = useMemo(() =>
    activePsychologists.map(psy => {
      const psyNoShows = noShowApps.filter(a => a.psychologistId === psy.id);
      const psyTotal = appointmentsFiltered.filter(
        a => a.psychologistId === psy.id && a.date <= todayStr &&
        a.status !== AppointmentStatus.CANCELED && !a.isInternal
      ).length;
      const impacto = psyNoShows.reduce((t, a) => t + getAppPrice(a, pricingCtx), 0);
      return {
        nome: psy.name,
        noShows: psyNoShows.length,
        total: psyTotal,
        taxa: psyTotal > 0 ? (psyNoShows.length / psyTotal) * 100 : 0,
        impactoR$: impacto,
      };
    }).filter(p => p.noShows > 0).sort((a, b) => b.impactoR$ - a.impactoR$),
    [activePsychologists, noShowApps, appointmentsFiltered, todayStr, pricingCtx]
  );

  // ─── EVOLUÇÃO NO-SHOW MENSAL (últimos 6 meses) ────────────────────────
  const noShowTendencia = useMemo(() => {
    const data: Record<string, { month: string; sortKey: number; noShows: number; total: number }> = {};
    appointments.filter(a => a.date <= todayStr && !a.isInternal).forEach(app => {
      const d = new Date(app.date + 'T12:00:00');
      const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!data[key]) data[key] = { month: key, sortKey, noShows: 0, total: 0 };
      if (app.status !== AppointmentStatus.CANCELED) {
        data[key].total++;
        if (!app.confirmedPsychologist && !app.confirmedPatient) data[key].noShows++;
      }
    });
    return Object.values(data)
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-6)
      .map(d => ({ ...d, taxa: d.total > 0 ? (d.noShows / d.total) * 100 : 0 }));
  }, [appointments, todayStr]);

  // ─── CHURN SEGMENTADO ──────────────────────────────────────────────────
  const churnDesistencia = useMemo(() =>
    customers.filter(c => c.status === CustomerStatus.INACTIVE && c.inactivationReason === InactivationReason.DESISTENCIA).length,
    [customers]
  );
  const churnPerda = useMemo(() =>
    customers.filter(c => c.status === CustomerStatus.INACTIVE && c.inactivationReason === InactivationReason.PERDA_PLANO).length,
    [customers]
  );
  const churnAlta = useMemo(() =>
    customers.filter(c => c.status === CustomerStatus.INACTIVE && c.inactivationReason === InactivationReason.ALTA_PSICOLOGO).length,
    [customers]
  );
  // Churn fantasma: ativos mas sem consulta há >30 dias
  const churnFantasma = useMemo(() =>
    customers.filter(c => {
      if (c.status !== CustomerStatus.ACTIVE || !c.lastAppointmentDate) return false;
      const last = new Date(c.lastAppointmentDate + 'T12:00:00');
      return Math.ceil((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)) > 30;
    }),
    [customers, today]
  );
  const totalBase = useMemo(() => customers.length, [customers]);
  const churnRateTotal = totalBase > 0
    ? ((churnDesistencia + churnPerda + churnFantasma.length) / totalBase) * 100
    : 0;

  // ─── PACIENTES EM RISCO DE CHURN (tabela) ─────────────────────────────
  const pacientesRiscoChurn = useMemo(() =>
    churnFantasma.map(c => {
      const psy = psychologists.find(p => p.id === c.psychologistId);
      const last = new Date(c.lastAppointmentDate! + 'T12:00:00');
      const diasAusente = Math.ceil((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      // Receita mensal estimada: ticket médio do paciente × frequência semanal
      const psyApps = appsRealizados.filter(a => a.customerId === c.id);
      const receitaTotal = calculateRevenue(psyApps);
      return {
        nome: c.name,
        psicologo: psy?.name || '—',
        ultimaConsulta: c.lastAppointmentDate || '—',
        diasAusente,
        receitaPerdidaEstimada: psyApps.length > 0 ? receitaTotal / psyApps.length : 0,
      };
    }).sort((a, b) => b.diasAusente - a.diasAusente).slice(0, 20),
    [churnFantasma, psychologists, appsRealizados, calculateRevenue, today]
  );

  // ─── HEATMAP DE HORÁRIOS ───────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
    const hours = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];
    const grid: Record<string, Record<string, number>> = {};
    hours.forEach(h => { grid[h] = {}; dayNames.forEach(d => { grid[h][d] = 0; }); });
    appointmentsFiltered.forEach(app => {
      if (app.status === AppointmentStatus.CANCELED || app.isInternal) return;
      const date = new Date(app.date + 'T12:00:00');
      const dayIdx = date.getDay();
      if (dayIdx === 0 || dayIdx === 6) return;
      const dayName = dayNames[dayIdx - 1];
      const hour = app.startTime?.substring(0, 5);
      if (grid[hour] && grid[hour][dayName] !== undefined) grid[hour][dayName]++;
    });
    // Calcula capacidade por slot para mostrar ociosidade
    const capacityGrid: Record<string, Record<string, number>> = {};
    hours.forEach(h => { capacityGrid[h] = {}; dayNames.forEach(d => { capacityGrid[h][d] = 0; }); });
    activePsychologists.forEach(psy => {
      (psy.availability || []).forEach(av => {
        const dayIdx = av.dayOfWeek;
        if (dayIdx === 0 || dayIdx === 6) return;
        const dayName = dayNames[dayIdx - 1];
        hours.forEach(h => {
          if (h >= av.startTime && h < av.endTime) {
            capacityGrid[h][dayName]++;
          }
        });
      });
    });
    return { grid, capacityGrid, hours, dayNames };
  }, [appointmentsFiltered, activePsychologists]);

  return {
    // Cards KPI
    taxaOcupacao, capacidadeHoras, horasOcupadas,
    noShowRate, noShowApps, impactoFinanceiroNoShow,
    churnRateTotal, churnDesistencia, churnPerda, churnAlta, churnFantasma,
    // Gráficos e tabelas
    ocupacaoPorPsicologo,
    noShowPorPsicologo, noShowTendencia,
    pacientesRiscoChurn,
    heatmapData,
  };
}
