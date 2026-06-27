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

/**
 * Calcula repasse respeitando a hierarquia completa (mesma da RepassePage):
 *  1. Override manual no atendimento (customRepassAmount)
 *  2. Override manual no paciente (customRepassAmount)
 *  3. Contrato pessoal do psicólogo (repassOverridesPlan = true) — ex: Michelly
 *  4. Valor cadastrado no plano (procedure.repassAmount)
 *  5. Fallback: regra genérica do psicólogo ou 50% padrão
 */
function getRepassValueForApp(
  app: Appointment,
  customers: Customer[],
  psy: Psychologist | undefined,
  findPlan: (hp?: string) => Plan | undefined,
  pricingCtx: PricingContext,
): number {
  const gross = getAppPrice(app, pricingCtx);
  if (gross <= 0) return 0;

  // 1. Override manual no atendimento
  if (app.customRepassAmount != null && app.customRepassAmount > 0) return app.customRepassAmount;

  // 2. Override manual no paciente
  const customer = customers.find(c => c.id === app.customerId);
  if (customer?.customRepassAmount != null && customer.customRepassAmount > 0) return customer.customRepassAmount;

  // 3. Contrato pessoal do psicólogo (repassOverridesPlan = true)
  if (psy?.repassOverridesPlan && (psy.repassRate != null || (psy.repassFixedAmount != null && psy.repassFixedAmount > 0))) {
    return calcRepass(gross, psy);
  }

  // 4. Valor cadastrado no plano (procedure.repassAmount)
  const plan = findPlan(customer?.healthPlan);
  const procedure = app.procedureCode
    ? plan?.procedures?.find(p => p.code === app.procedureCode)
    : plan?.procedures?.find(p => p.type === app.type);
  if (procedure?.repassAmount != null && procedure.repassAmount > 0) return procedure.repassAmount;

  // 5. Fallback: regra do psicólogo ou 50% padrão
  return calcRepass(gross, psy);
}

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
      const psy = psychologists.find(p => p.id === app.psychologistId);
      return total + getRepassValueForApp(app, customers, psy, findPlan, pricingCtx);
    }, 0),
    [appsRealizados, customers, psychologists, findPlan, pricingCtx]
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
      // Usa mesma hierarquia da RepassePage para consistência
      const { bruto, repasse } = psyApps.reduce((acc, app) => {
        const gross = getAppPrice(app, pricingCtx);
        const repasseVal = getRepassValueForApp(app, customers, psy, findPlan, pricingCtx);
        return { bruto: acc.bruto + gross, repasse: acc.repasse + repasseVal };
      }, { bruto: 0, repasse: 0 });
      const regra = psy.repassOverridesPlan
        ? (psy.repassFixedAmount && psy.repassFixedAmount > 0
            ? `R$ ${psy.repassFixedAmount.toFixed(0)} fixo`
            : `${((psy.repassRate ?? 0.5) * 100).toFixed(0)}%`)
        : 'Por plano';
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
    // ① Pré-gera janela fixa dos últimos 6 meses calendário
    const now = new Date();
    const data: Record<string, { month: string; sortKey: number; bruta: number; repasses: number; liquida: number; impostos: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      data[key] = { month: key, sortKey, bruta: 0, repasses: 0, liquida: 0, impostos: 0 };
    }

    // ② Preenche receita e repasses apenas com meses dentro da janela
    appointments
      .filter(app => app.confirmedPsychologist || isCanceledButBilled(app))
      .forEach(app => {
        const d = new Date(app.date + 'T12:00:00');
        const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
        if (!data[key]) return; // fora da janela de 6 meses, ignora
        const psy = psychologists.find(p => p.id === app.psychologistId);
        const appPrice = getAppPrice(app, pricingCtx);
        const repasse = getRepassValueForApp(app, customers, psy, findPlan, pricingCtx);
        data[key].bruta += appPrice;
        data[key].repasses += repasse;
      });

    // ③ Adiciona despesas fiscais SOMENTE em meses que já existem na janela
    expenses.forEach(exp => {
      const d = new Date(exp.date + 'T12:00:00');
      const key = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      if (data[key] && (exp.category === ExpenseCategory.TAX || exp.category === ExpenseCategory.BANK_FEES)) {
        data[key].impostos += exp.amount;
      }
    });

    const sorted = Object.values(data).sort((a, b) => a.sortKey - b.sortKey);
    // Calcula líquida: em meses sem receita, líquida = 0 (não fica negativo por impostos avulsos)
    sorted.forEach(d => {
      d.liquida = d.bruta > 0 ? d.bruta - d.repasses - d.impostos : 0;
    });
    return sorted;
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
