/**
 * useDashboardCaptacao — VISÃO 3
 * Novos Pacientes, Taxa de Retenção, LTV Clínico, CAC,
 * Funil de Conversão, Cohort de Retenção.
 */
import { useMemo } from 'react';
import {
  Appointment, Customer, Psychologist, Expense, WaitingListEntry,
  AppointmentStatus, CustomerStatus, ExpenseCategory,
} from '../../services/types';

interface Params {
  appointments: Appointment[];
  appointmentsFiltered: Appointment[];
  appsRealizados: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  expenses: Expense[];
  expensesFiltered: Expense[];
  waitingList: WaitingListEntry[];
  today: Date;
  filterMode: 'month' | 'year' | 'all';
  selectedMonth: number;
  selectedYear: number;
  isInSelectedPeriod: (dateStr: string) => boolean;
  isInPrevPeriod: (dateStr: string) => boolean;
  calculateRevenue: (apps: Appointment[]) => number;
  isCanceledButBilled: (app: Appointment) => boolean;
  activeCustomersCount: number;
  ticketMedioConsulta: number;
}

export function useDashboardCaptacao({
  appointments, appointmentsFiltered, appsRealizados,
  customers, psychologists, expenses, expensesFiltered, waitingList,
  today, filterMode, selectedMonth, selectedYear,
  isInSelectedPeriod, isInPrevPeriod,
  calculateRevenue, isCanceledButBilled,
  activeCustomersCount, ticketMedioConsulta,
}: Params) {

  // ─── NOVOS PACIENTES NO PERÍODO ────────────────────────────────────────
  const novosPacientes = useMemo(() =>
    customers.filter(c => isInSelectedPeriod(c.createdAt)),
    [customers, isInSelectedPeriod]
  );
  const novosPacientesPrev = useMemo(() =>
    customers.filter(c => isInPrevPeriod(c.createdAt)),
    [customers, isInPrevPeriod]
  );

  // ─── TAXA DE RETENÇÃO (voltaram após 1ª sessão) ───────────────────────
  const taxaRetencao = useMemo(() => {
    const allRealized = appointments.filter(app =>
      (app.confirmedPsychologist || isCanceledButBilled(app)) && !app.isInternal
    );
    const map: Record<string, number> = {};
    allRealized.forEach(app => { map[app.customerId] = (map[app.customerId] || 0) + 1; });
    const total = Object.keys(map).length;
    const returned = Object.values(map).filter(n => n >= 2).length;
    return total > 0 ? (returned / total) * 100 : 0;
  }, [appointments, isCanceledButBilled]);

  // ─── LTV CLÍNICO ──────────────────────────────────────────────────────
  // Método histórico: para pacientes com first e lastAppointmentDate
  const ltvData = useMemo(() => {
    const elegíveis = customers.filter(c =>
      c.firstAppointmentDate && c.lastAppointmentDate &&
      c.totalAppointmentsPerformed && c.totalAppointmentsPerformed >= 2
    );
    if (elegíveis.length === 0) return { ltvMedio: 0, duracaoMediaMeses: 0, sessoesMediaMensal: 0 };

    let totalDuracaoMeses = 0;
    let totalSessoes = 0;
    let totalReceita = 0;

    elegíveis.forEach(c => {
      const first = new Date(c.firstAppointmentDate! + 'T12:00:00');
      const last = new Date(c.lastAppointmentDate! + 'T12:00:00');
      const duracaoDias = Math.max(1, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
      const duracaoMeses = Math.max(1, duracaoDias / 30);
      totalDuracaoMeses += duracaoMeses;
      totalSessoes += (c.totalAppointmentsPerformed || 0);
      // Receita total do paciente
      const patientApps = appointments.filter(a =>
        a.customerId === c.id && (a.confirmedPsychologist || isCanceledButBilled(a))
      );
      totalReceita += calculateRevenue(patientApps);
    });

    const duracaoMediaMeses = totalDuracaoMeses / elegíveis.length;
    const sessoesMediaMensal = (totalSessoes / elegíveis.length) / duracaoMediaMeses;
    const ltvMedio = totalReceita / elegíveis.length;

    return { ltvMedio, duracaoMediaMeses, sessoesMediaMensal };
  }, [customers, appointments, calculateRevenue, isCanceledButBilled]);

  // ─── CAC (Custo de Aquisição de Cliente) ──────────────────────────────
  const despesaMarketing = useMemo(() =>
    expensesFiltered
      .filter(e => e.category === ExpenseCategory.MARKETING)
      .reduce((acc, e) => acc + e.amount, 0),
    [expensesFiltered]
  );
  const cac = novosPacientes.length > 0 ? despesaMarketing / novosPacientes.length : 0;

  // ─── EVOLUÇÃO NOVOS PACIENTES (últimos 12 meses) ──────────────────────
  const evolucaoNovosPacientes = useMemo(() => {
    const data: Record<string, { month: string; sortKey: number; count: number }> = {};
    customers.forEach(c => {
      if (!c.createdAt) return;
      const d = new Date(c.createdAt);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!data[key]) data[key] = { month: key, sortKey, count: 0 };
      data[key].count++;
    });
    return Object.values(data).sort((a, b) => a.sortKey - b.sortKey).slice(-12);
  }, [customers]);

  // ─── FUNIL DE CONVERSÃO ───────────────────────────────────────────────
  // Topo: Fila de Espera | Meio: Novos Pacientes | Fundo: Aderidos (≥3 sessões)
  const funil = useMemo(() => {
    const totalFilaEspera = waitingList.length;
    const novosPeriodo = novosPacientes.length;
    const aderidos = novosPacientes.filter(c =>
      (c.totalAppointmentsPerformed || 0) >= 3
    ).length;
    return {
      filaEspera: totalFilaEspera,
      novosPacientes: novosPeriodo,
      aderidos,
      taxaConversaoFila: totalFilaEspera > 0 ? (novosPeriodo / totalFilaEspera) * 100 : 0,
      taxaAdesao: novosPeriodo > 0 ? (aderidos / novosPeriodo) * 100 : 0,
    };
  }, [waitingList, novosPacientes]);

  // ─── COHORT DE RETENÇÃO ───────────────────────────────────────────────
  // Agrupa pacientes por mês de entrada e verifica se ainda estão ativos
  const cohortData = useMemo(() => {
    const cohorts: Record<string, {
      month: string; sortKey: number;
      total: number; ativosMes1: number; ativosMes3: number; ativosMes6: number;
      ltvAcumulado: number;
    }> = {};

    customers.forEach(c => {
      if (!c.createdAt) return;
      const d = new Date(c.createdAt);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!cohorts[key]) cohorts[key] = { month: key, sortKey, total: 0, ativosMes1: 0, ativosMes3: 0, ativosMes6: 0, ltvAcumulado: 0 };
      cohorts[key].total++;

      // Verifica se o paciente tem atividade nos marcos de tempo
      if (c.lastAppointmentDate) {
        const first = new Date(c.createdAt);
        const last = new Date(c.lastAppointmentDate + 'T12:00:00');
        const duracaoDias = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
        if (duracaoDias >= 30) cohorts[key].ativosMes1++;
        if (duracaoDias >= 90) cohorts[key].ativosMes3++;
        if (duracaoDias >= 180) cohorts[key].ativosMes6++;
      }

      // LTV acumulado do cohort
      const patientApps = appointments.filter(a =>
        a.customerId === c.id && (a.confirmedPsychologist || isCanceledButBilled(a))
      );
      cohorts[key].ltvAcumulado += calculateRevenue(patientApps);
    });

    return Object.values(cohorts)
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-12)
      .map(c => ({
        ...c,
        retencaoMes1: c.total > 0 ? (c.ativosMes1 / c.total) * 100 : 0,
        retencaoMes3: c.total > 0 ? (c.ativosMes3 / c.total) * 100 : 0,
        retencaoMes6: c.total > 0 ? (c.ativosMes6 / c.total) * 100 : 0,
      }));
  }, [customers, appointments, calculateRevenue, isCanceledButBilled]);

  // ─── FONTE DE CAPTAÇÃO (se campo existir) ─────────────────────────────
  const fonteCaptacao = useMemo(() => {
    const fontes: Record<string, { fonte: string; count: number; receita: number }> = {};
    novosPacientes.forEach(c => {
      const src = (c as any).acquisitionSource || 'Não informado';
      if (!fontes[src]) fontes[src] = { fonte: src, count: 0, receita: 0 };
      fontes[src].count++;
      // Receita gerada pelos pacientes dessa fonte
      const patientApps = appointments.filter(a =>
        a.customerId === c.id && (a.confirmedPsychologist || isCanceledButBilled(a))
      );
      fontes[src].receita += calculateRevenue(patientApps);
    });
    const list = Object.values(fontes).sort((a, b) => b.count - a.count);
    const total = list.reduce((a, f) => a + f.count, 0);
    return list.map(f => ({
      ...f,
      percent: total > 0 ? (f.count / total) * 100 : 0,
      ltvMedio: f.count > 0 ? f.receita / f.count : 0,
    }));
  }, [novosPacientes, appointments, calculateRevenue, isCanceledButBilled]);

  return {
    // Cards KPI
    novosPacientes: novosPacientes.length,
    novosPacientesPrev: novosPacientesPrev.length,
    taxaRetencao,
    ltvMedio: ltvData.ltvMedio,
    duracaoMediaMeses: ltvData.duracaoMediaMeses,
    sessoesMediaMensal: ltvData.sessoesMediaMensal,
    cac, despesaMarketing,
    // Gráficos e tabelas
    evolucaoNovosPacientes,
    funil,
    cohortData,
    fonteCaptacao,
  };
}
