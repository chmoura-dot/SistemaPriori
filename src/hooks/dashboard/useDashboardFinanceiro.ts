/**
 * useDashboardFinanceiro — VISÃO 1
 * Receita Bruta × Líquida, Repasse por Psicólogo, Receita por Canal,
 * Glosa/Lead-Time de Convênios, Ticket Médio por Profissional e por Canal.
 */
import { useMemo } from 'react';
import {
  Appointment, Customer, Psychologist, Plan, Expense, BillingBatch,
  AppointmentStatus, HealthPlan, ExpenseCategory,
} from '../../services/types';
import { calcRepass } from '../../lib/repassRules';
import { getAppPrice, PricingContext } from '../../lib/pricing';

interface Params {
  appointments: Appointment[];
  appointmentsFiltered: Appointment[];
  appsRealizados: Appointment[];
  appsRealizadosPrev: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  plans: Plan[];
  expenses: Expense[];
  expensesFiltered: Expense[];
  expensesPrevMonth: Expense[];
  subscriptionRevenue: number;
  findPlan: (hp?: string) => Plan | undefined;
  calculateRevenue: (apps: Appointment[]) => number;
  isCanceledButBilled: (app: Appointment) => boolean;
  filterMode: 'month' | 'year' | 'all';
  pricingCtx: PricingContext;
}

export function useDashboardFinanceiro({
  appointments, appointmentsFiltered, appsRealizados, appsRealizadosPrev,
  customers, psychologists, plans, expenses, expensesFiltered, expensesPrevMonth,
  subscriptionRevenue, findPlan, calculateRevenue, isCanceledButBilled,
  filterMode, pricingCtx,
}: Params) {

  // ─── RECEITA BRUTA ──────────────────────────────────────────────────────
  const receitaBruta = useMemo(() =>
    calculateRevenue(appsRealizados) + subscriptionRevenue,
    [appsRealizados, subscriptionRevenue, calculateRevenue]
  );
  const receitaBrutaPrev = useMemo(() =>
    calculateRevenue(appsRealizadosPrev),
    [appsRealizadosPrev, calculateRevenue]
  );

  // ─── TOTAL DE REPASSES ─────────────────────────────────────────────────
  const totalRepasses = useMemo(() =>
    appsRealizados.reduce((total, app) => {
      const customer = customers.find(c => c.id === app.customerId);
      const psy = psychologists.find(p => p.id === app.psychologistId);
      const appPrice = getAppPrice(app, pricingCtx);
      return total + (app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(appPrice, psy));
    }, 0),
    [appsRealizados, customers, psychologists, pricingCtx]
  );

  // ─── IMPOSTOS + TAXAS (das despesas reais) ──────────────────────────────
  const impostosPeriodo = useMemo(() =>
    expensesFiltered
      .filter(e => e.category === ExpenseCategory.TAX)
      .reduce((acc, e) => acc + e.amount, 0),
    [expensesFiltered]
  );
  const taxasBancarias = useMemo(() =>
    expensesFiltered
      .filter(e => e.category === ExpenseCategory.BANK_FEES)
      .reduce((acc, e) => acc + e.amount, 0),
    [expensesFiltered]
  );
  const despesasOperacionais = useMemo(() =>
    expensesFiltered
      .filter(e => e.category !== ExpenseCategory.TAX && e.category !== ExpenseCategory.BANK_FEES)
      .reduce((acc, e) => acc + e.amount, 0),
    [expensesFiltered]
  );

  // ─── RECEITA LÍQUIDA ───────────────────────────────────────────────────
  const receitaLiquida = receitaBruta - impostosPeriodo - taxasBancarias - totalRepasses;

  // ─── LUCRO OPERACIONAL ─────────────────────────────────────────────────
  const lucroOperacional = receitaLiquida - despesasOperacionais;
  const totalDespesas = useMemo(() => expensesFiltered.reduce((a, e) => a + e.amount, 0), [expensesFiltered]);
  const totalDespesasPrev = useMemo(() => expensesPrevMonth.reduce((a, e) => a + e.amount, 0), [expensesPrevMonth]);

  // ─── REPASSE POR PSICÓLOGO (tabela detalhada) ──────────────────────────
  const repassePorPsicologo = useMemo(() =>
    psychologists.filter(p => p.active).map(psy => {
      const psyApps = appsRealizados.filter(a => a.psychologistId === psy.id);
      const bruto = calculateRevenue(psyApps);
      const repasse = psyApps.reduce((total, app) => {
        const customer = customers.find(c => c.id === app.customerId);
        const appPrice = getAppPrice(app, pricingCtx);
        return total + (app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(appPrice, psy));
      }, 0);
      const regra = psy.repassFixedAmount && psy.repassFixedAmount > 0
        ? `R$ ${psy.repassFixedAmount.toFixed(0)} fixo`
        : `${((psy.repassRate ?? 0.5) * 100).toFixed(0)}%`;
      return {
        nome: psy.name,
        sessoes: psyApps.length,
        bruto,
        repasse,
        regra,
        percentReceita: receitaBruta > 0 ? (bruto / receitaBruta) * 100 : 0,
      };
    }).filter(p => p.sessoes > 0).sort((a, b) => b.bruto - a.bruto),
    [psychologists, appsRealizados, customers, findPlan, calculateRevenue, receitaBruta]
  );

  // ─── RECEITA POR CANAL (Particular vs cada Convênio) ───────────────────
  const receitaPorCanal = useMemo(() => {
    const canais: Record<string, { nome: string; sessoes: number; receita: number }> = {};
    appsRealizados.forEach(app => {
      const customer = customers.find(c => c.id === app.customerId);
      const hp = (customer?.healthPlan as string) || 'Particular';
      const canal = hp === HealthPlan.PARTICULAR ? 'Particular' : hp;
      if (!canais[canal]) canais[canal] = { nome: canal, sessoes: 0, receita: 0 };
      canais[canal].sessoes++;
      canais[canal].receita += getAppPrice(app, pricingCtx);
    });
    const list = Object.values(canais).sort((a, b) => b.receita - a.receita);
    const totalReceita = list.reduce((a, c) => a + c.receita, 0);
    return list.map(c => ({
      ...c,
      ticketMedio: c.sessoes > 0 ? c.receita / c.sessoes : 0,
      percentMix: totalReceita > 0 ? (c.receita / totalReceita) * 100 : 0,
    }));
  }, [appsRealizados, customers, pricingCtx]);

  // ─── TICKET MÉDIO POR PSICÓLOGO ────────────────────────────────────────
  const ticketMedioPorPsicologo = useMemo(() =>
    psychologists.filter(p => p.active).map(psy => {
      const psyApps = appsRealizados.filter(a => a.psychologistId === psy.id);
      const receita = calculateRevenue(psyApps);
      return {
        nome: psy.name,
        sessoes: psyApps.length,
        receita,
        ticketMedio: psyApps.length > 0 ? receita / psyApps.length : 0,
      };
    }).filter(p => p.sessoes > 0).sort((a, b) => b.ticketMedio - a.ticketMedio),
    [psychologists, appsRealizados, calculateRevenue]
  );

  // ─── GLOSA POR CONVÊNIO (appointments com billingStatus === 'denied') ──
  const glosaPorConvenio = useMemo(() => {
    const convMap: Record<string, { plano: string; enviados: number; glosados: number; motivos: Record<string, number> }> = {};
    appointmentsFiltered.forEach(app => {
      if (!app.billingBatchId) return; // sem lote = particular, não entra
      const customer = customers.find(c => c.id === app.customerId);
      const hp = (customer?.healthPlan as string) || '';
      if (!hp || hp === HealthPlan.PARTICULAR) return;
      if (!convMap[hp]) convMap[hp] = { plano: hp, enviados: 0, glosados: 0, motivos: {} };
      convMap[hp].enviados++;
      if (app.billingStatus === 'denied') {
        convMap[hp].glosados++;
        const motivo = app.denialReason || 'Não informado';
        convMap[hp].motivos[motivo] = (convMap[hp].motivos[motivo] || 0) + 1;
      }
    });
    return Object.values(convMap).map(c => ({
      plano: c.plano,
      guiasEnviadas: c.enviados,
      guiasGlosadas: c.glosados,
      taxaGlosa: c.enviados > 0 ? (c.glosados / c.enviados) * 100 : 0,
      motivoFrequente: Object.entries(c.motivos).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
    })).sort((a, b) => b.taxaGlosa - a.taxaGlosa);
  }, [appointmentsFiltered, customers]);

  // ─── TENDÊNCIA RECEITA 6 MESES ─────────────────────────────────────────
  const tendenciaReceita6m = useMemo(() => {
    const data: Record<string, { month: string; sortKey: number; bruta: number; repasses: number; liquida: number; impostos: number }> = {};
    appointments
      .filter(app => app.confirmedPsychologist || isCanceledButBilled(app))
      .forEach(app => {
        const d = new Date(app.date + 'T12:00:00');
        const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
        const sortKey = d.getFullYear() * 100 + d.getMonth();
        if (!data[key]) data[key] = { month: key, sortKey, bruta: 0, repasses: 0, liquida: 0, impostos: 0 };
        const customer = customers.find(c => c.id === app.customerId);
        const psy = psychologists.find(p => p.id === app.psychologistId);
        const appPrice = getAppPrice(app, pricingCtx);
        const repasse = app.customRepassAmount ?? customer?.customRepassAmount ?? calcRepass(appPrice, psy);
        data[key].bruta += appPrice;
        data[key].repasses += repasse;
      });
    // Adiciona despesas fiscais por mês
    expenses.forEach(exp => {
      const d = new Date(exp.date + 'T12:00:00');
      const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!data[key]) data[key] = { month: key, sortKey, bruta: 0, repasses: 0, liquida: 0, impostos: 0 };
      if (exp.category === ExpenseCategory.TAX || exp.category === ExpenseCategory.BANK_FEES) {
        data[key].impostos += exp.amount;
      }
    });
    const sorted = Object.values(data).sort((a, b) => a.sortKey - b.sortKey);
    // Calcula líquida
    sorted.forEach(d => { d.liquida = d.bruta - d.repasses - d.impostos; });
    return sorted.slice(-6);
  }, [appointments, expenses, customers, psychologists, findPlan, isCanceledButBilled, pricingCtx]);

  return {
    // Cards KPI
    receitaBruta, receitaBrutaPrev,
    receitaLiquida,
    totalRepasses,
    lucroOperacional,
    impostosPeriodo, taxasBancarias, despesasOperacionais,
    totalDespesas, totalDespesasPrev,
    // Tabelas e gráficos
    repassePorPsicologo,
    receitaPorCanal,
    ticketMedioPorPsicologo,
    glosaPorConvenio,
    tendenciaReceita6m,
  };
}
