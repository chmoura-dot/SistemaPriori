import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  FileText,
  Hourglass,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { api } from '../services/api';
import {
  Appointment,
  AppointmentType,
  BillingBatch,
  BillingBatchStatus,
  Customer,
  HealthPlan,
  Plan,
  Psychologist,
  Repasse,
  RepasseStatus,
} from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { calcRepass } from '../lib/repassRules';
import {
  getAppPrice,
  getAmsNeuropsicoSessionIndex,
  isRepassBlocked,
  isNeuropsicoReportSplit,
  NEUROPSICO_REPORT_SPLIT_RATE,
  PricingContext,
} from '../lib/pricing';

import { matchPlanByHealthPlan } from '../services/supabase/helpers';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';


const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// ─── Repasse Value ───────────────────────────────────────────────────────────

/**
 * Calcula o valor de repasse para um atendimento respeitando a hierarquia:
 *  1. Override manual no atendimento (customRepassAmount)
 *  2. Override manual no paciente (customRepassAmount)
 *  3. Regra do psicólogo (repassRate/repassFixedAmount) — ex: Michelly = 92%
 *  4. Valor cadastrado no plano (procedure.repassAmount) — para psicólogos sem regra
 *  5. Fallback: 50% padrão (nenhuma regra configurada)
 */
function getRepassValue(
  app: Appointment,
  customers: Customer[],
  plans: Plan[],
  psy: Psychologist | undefined,
  pricingCtx: PricingContext,
): number {
  // Guard primário: se o faturamento é R$0, o repasse também é R$0.
  // Garante que regras de negócio do Faturamento (180 dias neuropsico,
  // AMS 4ª+ sessão, cancelado sem cobrança, etc.) sejam respeitadas.
  // Falta do psicólogo: não há repasse (a clínica não pagou nem faturou).
  if (isRepassBlocked(app)) return 0;

  const gross = getAppPrice(app, pricingCtx);
  if (gross <= 0) return 0;

  // 1. Override manual no atendimento
  if (app.customRepassAmount != null && app.customRepassAmount > 0) {
    return app.customRepassAmount;
  }

  // 2. Override manual no paciente
  const customer = customers.find(c => c.id === app.customerId);
  if (customer?.customRepassAmount != null && customer.customRepassAmount > 0) {
    return customer.customRepassAmount;
  }

  // 3. Contrato pessoal do psicólogo (repassOverridesPlan = true)
  //    Exemplo: Michelly = 92% do valor bruto faturado, independente do plano.
  //    Só aplica quando a flag repassOverridesPlan estiver ativada no cadastro.
  if (psy?.repassOverridesPlan && (psy.repassRate != null || (psy.repassFixedAmount != null && psy.repassFixedAmount > 0))) {
    return calcRepass(gross, psy);
  }

  // 4. Valor cadastrado no plano (procedure.repassAmount) — regra padrão
  //    Usado para psicólogos sem contrato pessoal (repassOverridesPlan = false).
  //    Para AMS Petrobras neuropsico 2ª/3ª sessão, usa procedimento 95090010.
  const plan = matchPlanByHealthPlan(plans, customer?.healthPlan);

  let resolvedProcCode = app.procedureCode;
  if (
    !resolvedProcCode &&
    customer?.healthPlan === HealthPlan.AMS_PETROBRAS &&
    app.type === AppointmentType.NEUROPSICOLOGICA
  ) {
    const sessionIdx = getAmsNeuropsicoSessionIndex(app, pricingCtx);
    if (sessionIdx === 1 || sessionIdx === 2) {
      resolvedProcCode = '95090010';
    }
  }

  // Valida se o código TUSS pertence ao plano do paciente.
  // Se o código armazenado for de outro plano (ex: AMS 95110011 em atendimento Porto Seguro),
  // faz fallback para o procedimento correto do plano pelo tipo de atendimento.
  const procedureByCode = resolvedProcCode
    ? plan?.procedures?.find(p => p.code === resolvedProcCode)
    : undefined;
  const procedure = procedureByCode ?? plan?.procedures?.find(p => p.type === app.type);

  if (procedure?.repassAmount != null && procedure.repassAmount > 0) {
    return procedure.repassAmount;
  }

  // 5. Último fallback: 50% padrão (psicólogo sem regra + plano sem repassAmount)
  return calcRepass(gross, psy);
}

/**
 * Valor de repasse de um atendimento para uma FASE específica.
 *
 * - Atendimentos comuns: 100% na fase 1 (fase 2 = R$0, nunca gerada).
 * - Avaliação Neuropsicológica elegível ao split: 50% na fase 1 (sessão paga)
 *   e 50% na fase 2 (entrega do laudo). Arredondado em centavos; a fase 2
 *   recebe o RESÍDUO para garantir que fase1 + fase2 === valor cheio.
 */
function getPhaseRepassValue(
  app: Appointment,
  customers: Customer[],
  plans: Plan[],
  psy: Psychologist | undefined,
  pricingCtx: PricingContext,
  phase: 1 | 2,
): number {
  const full = getRepassValue(app, customers, plans, psy, pricingCtx);
  if (!isNeuropsicoReportSplit(app, pricingCtx)) {
    return phase === 1 ? full : 0;
  }
  const fullCents = Math.round(full * 100);
  const phase1Cents = Math.round(fullCents * NEUROPSICO_REPORT_SPLIT_RATE);
  const phase2Cents = fullCents - phase1Cents; // resíduo evita perda de 1 centavo
  return (phase === 1 ? phase1Cents : phase2Cents) / 100;
}

/**
 * Indica se a 1ª parcela (50%) do split neuropsicológico já foi repassada.
 * Fonte dupla p/ robustez: coluna de fase (fluxo novo + backfill) OU presença
 * em repasse legado (fluxo antigo de convênios comuns).
 */
function isPhase1Done(app: Appointment, legacyRepassed: Set<string>): boolean {
  return app.repassPhase1RepasseId != null || legacyRepassed.has(app.id);
}

// ─── Divergence Detection ────────────────────────────────────────────────────


interface RepassDivergence {
  customerName: string;
  date: string;
  actual: number;
  expected: number;
}

/**
 * Calcula o repasse esperado SEM considerar o override do atendimento (step 1).
 * Usado para detectar divergências entre o valor salvo no atendimento e o que
 * seria calculado pelas regras automáticas (paciente → psicólogo → plano → 50%).
 */
function getExpectedRepass(
  app: Appointment,
  customers: Customer[],
  plans: Plan[],
  psy: Psychologist | undefined,
  pricingCtx: PricingContext,
): number {
  // Falta do psicólogo: não há repasse.
  if (isRepassBlocked(app)) return 0;

  const gross = getAppPrice(app, pricingCtx);
  if (gross <= 0) return 0;

  // Pula step 1 (app.customRepassAmount) — vai direto para step 2+
  const customer = customers.find(c => c.id === app.customerId);
  if (customer?.customRepassAmount != null && customer.customRepassAmount > 0) {
    return customer.customRepassAmount;
  }

  if (psy?.repassOverridesPlan && (psy.repassRate != null || (psy.repassFixedAmount != null && psy.repassFixedAmount > 0))) {
    return calcRepass(gross, psy);
  }

  const plan = matchPlanByHealthPlan(plans, customer?.healthPlan);
  let resolvedProcCode = app.procedureCode;
  if (
    !resolvedProcCode &&
    customer?.healthPlan === HealthPlan.AMS_PETROBRAS &&
    app.type === AppointmentType.NEUROPSICOLOGICA
  ) {
    const sessionIdx = getAmsNeuropsicoSessionIndex(app, pricingCtx);
    if (sessionIdx === 1 || sessionIdx === 2) resolvedProcCode = '95090010';
  }
  // Valida se o código TUSS pertence ao plano do paciente (mesma lógica do getRepassValue).
  const procedureByCode = resolvedProcCode
    ? plan?.procedures?.find(p => p.code === resolvedProcCode)
    : undefined;
  const procedure = procedureByCode ?? plan?.procedures?.find(p => p.type === app.type);
  if (procedure?.repassAmount != null && procedure.repassAmount > 0) {
    return procedure.repassAmount;
  }

  return calcRepass(gross, psy);
}

/**
 * Monta o item enviado à RPC check_repass_integrity para um atendimento.
 * O frontend resolve o gross (getAppPrice) e o plan_repass (procedure.repassAmount)
 * — que dependem de contexto complexo (neuropsico/AMS/TUSS) — e o SERVIDOR resolve
 * a regra do psicólogo (repass_rate/fixed/overridesPlan), fonte das divergências.
 */
function buildRepassItem(
  app: Appointment,
  customers: Customer[],
  plans: Plan[],
  pricingCtx: PricingContext,
): { gross: number; app_repass: number | null; customer_repass: number | null; plan_repass: number | null } {
  const gross = getAppPrice(app, pricingCtx);
  const customer = customers.find(c => c.id === app.customerId);

  // Resolve plan_repass com a MESMA lógica do getRepassValue (step 4)
  let plan_repass: number | null = null;
  if (gross > 0) {
    const plan = matchPlanByHealthPlan(plans, customer?.healthPlan);
    let resolvedProcCode = app.procedureCode;
    if (
      !resolvedProcCode &&
      customer?.healthPlan === HealthPlan.AMS_PETROBRAS &&
      app.type === AppointmentType.NEUROPSICOLOGICA
    ) {
      const sessionIdx = getAmsNeuropsicoSessionIndex(app, pricingCtx);
      if (sessionIdx === 1 || sessionIdx === 2) resolvedProcCode = '95090010';
    }
    const procedureByCode = resolvedProcCode
      ? plan?.procedures?.find(p => p.code === resolvedProcCode)
      : undefined;
    const procedure = procedureByCode ?? plan?.procedures?.find(p => p.type === app.type);
    if (procedure?.repassAmount != null && procedure.repassAmount > 0) {
      plan_repass = procedure.repassAmount;
    }
  }

  return {
    gross,
    app_repass: app.customRepassAmount ?? null,
    customer_repass: customer?.customRepassAmount ?? null,
    plan_repass,
  };
}

/**
 * Verifica se o atendimento tem um customRepassAmount que diverge (≥ R$1)
 * do valor que seria calculado automaticamente.
 */
function checkDivergence(

  app: Appointment,
  customers: Customer[],
  plans: Plan[],
  psy: Psychologist | undefined,
  pricingCtx: PricingContext,
): RepassDivergence | null {
  if (app.customRepassAmount == null || app.customRepassAmount <= 0) return null;
  // Aplica os MESMOS guards de getRepassValue antes de comparar. Sem isso, o
  // customRepassAmount cru do banco (ex: herdado do cadastro do paciente ou de
  // um reajuste) era comparado contra um "esperado" que respeita as regras de
  // bloqueio, gerando falsos positivos em sessões que corretamente valem R$0:
  //  • Falta do psicólogo (isRepassBlocked)
  //  • Neuropsico bloqueado: 2ª/3ª/4ª+ sessão AMS ou <180 dias (gross <= 0)
  if (isRepassBlocked(app)) return null;
  const gross = getAppPrice(app, pricingCtx);
  if (gross <= 0) return null;
  const expected = getExpectedRepass(app, customers, plans, psy, pricingCtx);

  if (Math.abs(app.customRepassAmount - expected) < 1) return null;
  const customer = customers.find(c => c.id === app.customerId);
  return {
    customerName: customer?.name ?? '—',
    date: app.date,
    actual: app.customRepassAmount,
    expected,
  };
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

function generateRepassePDF(
  repasse: Repasse,
  psy: Psychologist | undefined,
  batch: BillingBatch | undefined,
  appointments: Appointment[],
  customers: Customer[],
  plans: Plan[],
) {
  const pricingCtx: PricingContext = { customers, plans, appointments };
  const rows = repasse.appointmentIds
    .map(id => {
      const app = appointments.find(a => a.id === id);
      // Filtro de segurança: excluir atendimentos glosados do PDF
      if (!app || app.billingStatus === 'denied') return null;
      const customer = customers.find(c => c.id === app.customerId);
      const plan = matchPlanByHealthPlan(plans, customer?.healthPlan);
      // Valida se o código TUSS pertence ao plano (consistente com getRepassValue).
      const procedureByCode = app.procedureCode
        ? plan?.procedures?.find(proc => proc.code === app.procedureCode)
        : undefined;
      const procedure = procedureByCode ?? plan?.procedures?.find(proc => proc.type === app.type);

      // Valor phase-aware: se este atendimento entra no split neuropsicológico,
      // o comprovante mostra apenas a parcela correspondente a ESTE repasse
      // (1/2 na sessão, 2/2 na entrega do laudo), não o valor cheio.
      let repassVal = getRepassValue(app, customers, plans, psy, pricingCtx);
      let parcelaLabel = '';
      if (isNeuropsicoReportSplit(app, pricingCtx)) {
        const isPhase2 = app.repassPhase2RepasseId === repasse.id;
        const phase: 1 | 2 = isPhase2 ? 2 : 1;
        repassVal = getPhaseRepassValue(app, customers, plans, psy, pricingCtx, phase);
        parcelaLabel = isPhase2 ? ' (Parcela 2/2 — Laudo)' : ' (Parcela 1/2 — Sessão)';
      }
      return { app, customer, procedure, repassVal, parcelaLabel };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    // Oculta linhas com repasse R$0,00 para não poluir o comprovante.
    .filter(r => r.repassVal > 0);



  const today = format(new Date(), 'dd/MM/yyyy');
  const planName = batch?.healthPlan ?? '—';
  const batchNum = batch?.batchNumber ?? '—';
  const sentAt = batch?.sentAt ? format(new Date(batch.sentAt), 'dd/MM/yyyy') : '—';
  const paidAt = batch?.paidAt ? format(new Date(batch.paidAt), 'dd/MM/yyyy') : '—';

  // Agrupar atendimentos individuais por paciente (mantendo cada sessão visível)
  const byPatient: Record<string, {
    name: string;
    sessions: { date: string; code: string; description: string; repassVal: number }[];
    subtotal: number;
  }> = {};

  rows.forEach(({ app, customer, procedure, repassVal, parcelaLabel }) => {
    const patientId = customer?.id ?? 'unknown';
    if (!byPatient[patientId]) {
      byPatient[patientId] = {
        name: customer?.name ?? '—',
        sessions: [],
        subtotal: 0,
      };
    }
    byPatient[patientId].sessions.push({
      date: app.date ? format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy') : '—',
      code: procedure?.code ?? '—',
      description: (procedure?.description ?? app.type ?? '—') + parcelaLabel,
      repassVal,
    });

    byPatient[patientId].subtotal += repassVal;
  });

  // Ordenar sessões por data dentro de cada paciente
  Object.values(byPatient).forEach(p => {
    p.sessions.sort((a, b) => a.date.localeCompare(b.date));
  });

  // Ordenar pacientes por nome
  const sortedPatients = Object.values(byPatient).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR'),
  );

  // Gerar linhas da tabela
  let tableRows = '';
  sortedPatients.forEach(patient => {
    // Cabeçalho do paciente
    tableRows += `
        <tr class="patient-header">
          <td colspan="4">${patient.name}</td>
          <td class="right">${patient.sessions.length} sessão(ões)</td>
        </tr>`;
    // Sessões individuais
    patient.sessions.forEach(s => {
      tableRows += `
        <tr>
          <td class="cell indent">${s.date}</td>
          <td class="cell">${s.code}</td>
          <td class="cell" colspan="2">${s.description}</td>
          <td class="cell right">${fmt.format(s.repassVal)}</td>
        </tr>`;
    });
    // Subtotal do paciente
    tableRows += `
        <tr class="subtotal-row">
          <td colspan="4" class="right">Subtotal — ${patient.name}</td>
          <td class="right">${fmt.format(patient.subtotal)}</td>
        </tr>`;
  });

  // Total: sempre recalcular a partir das linhas para garantir consistência
  // entre soma das linhas e total exibido no PDF. Usa centavos para precisão.
  const totalCents = rows.reduce((s, r) => s + Math.round(r.repassVal * 100), 0);
  const total = totalCents / 100;
  const totalSessions = rows.length;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Repasse — ${planName} — Lote ${batchNum} — ${psy?.name ?? ''} — ${repasse.paidAt ? format(parseISO(repasse.paidAt), 'dd-MM-yyyy') : 'sem data'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 20mm 15mm; }
    body { font-family: Arial, sans-serif; color: #1a202c; padding: 40px; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 2px solid #1B365D; padding-bottom: 14px; }
    .brand { font-size: 20px; font-weight: 700; color: #1B365D; }
    .brand-sub { font-size: 11px; color: #718096; margin-top: 2px; }
    .meta { text-align: right; font-size: 11px; color: #718096; }
    h2 { font-size: 14px; color: #1B365D; margin-bottom: 12px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 24px; margin-bottom: 24px; padding: 14px 16px; background: #f7f8fa; border-radius: 8px; }
    .info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #718096; }
    .info-value { font-weight: 600; color: #1B365D; margin-top: 2px; font-size: 12px; }
    .summary-bar { display: flex; justify-content: flex-end; gap: 24px; margin-bottom: 12px; padding: 10px 16px; background: #edf2f7; border-radius: 6px; }
    .summary-item { text-align: center; }
    .summary-number { font-size: 18px; font-weight: 700; color: #1B365D; }
    .summary-label { font-size: 9px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #1B365D; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .cell { padding: 6px 10px; border-bottom: 1px solid #edf2f7; color: #2d3748; font-size: 11px; }
    .indent { padding-left: 20px; }
    .right { text-align: right; }
    .patient-header td { background: #edf2f7; font-weight: 700; color: #1B365D; padding: 8px 10px; font-size: 11px; border-bottom: 1px solid #cbd5e0; }
    .subtotal-row td { background: #f7f8fa; font-weight: 600; color: #4a5568; padding: 6px 10px; font-size: 11px; border-bottom: 2px solid #cbd5e0; }
    .total-row { background: #1B365D !important; }
    .total-row td { color: white !important; padding: 10px; font-weight: 700; font-size: 13px; }
    .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 9px; color: #a0aec0; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Núcleo Priori</div>
      <div class="brand-sub">Neuropsicologia e Psicoterapia</div>
    </div>
    <div class="meta">
      <div><strong>Comprovante de Repasse</strong></div>
      <div>Emitido em: ${today}</div>
    </div>
  </div>

  <h2>Detalhes do Repasse</h2>
  <div class="info-grid">
    <div>
      <div class="info-label">Psicólogo(a)</div>
      <div class="info-value">${psy?.name ?? '—'}</div>
    </div>
    <div>
      <div class="info-label">Plano de Saúde</div>
      <div class="info-value">${planName}</div>
    </div>
    <div>
      <div class="info-label">Número do Lote</div>
      <div class="info-value">#${batchNum}</div>
    </div>
    <div>
      <div class="info-label">Data de Envio do Lote</div>
      <div class="info-value">${sentAt}</div>
    </div>
    <div>
      <div class="info-label">Data de Pagamento pelo Plano</div>
      <div class="info-value">${paidAt}</div>
    </div>
    <div>
      <div class="info-label">Status</div>
      <div class="info-value">${repasse.status === RepasseStatus.PAID ? `Pago em ${repasse.paidAt ? format(new Date(repasse.paidAt), 'dd/MM/yyyy') : '—'}` : 'Pendente'}</div>
    </div>
  </div>

  <div class="summary-bar">
    <div class="summary-item">
      <div class="summary-number">${totalSessions}</div>
      <div class="summary-label">Sessões</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${sortedPatients.length}</div>
      <div class="summary-label">Pacientes</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${fmt.format(total)}</div>
      <div class="summary-label">Total do Repasse</div>
    </div>
  </div>

  <h2>Atendimentos</h2>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>COD TUSS</th>
        <th colspan="2">Procedimento</th>
        <th style="text-align:right">Valor Repasse</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td colspan="4">TOTAL DO REPASSE (${totalSessions} sessões)</td>
        <td style="text-align:right">${fmt.format(total)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    Documento gerado automaticamente pelo Sistema Núcleo Priori em ${today}. Este documento é um comprovante interno.
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const RepassePage = () => {
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rData, bData, aData, cData, plData, psyData] = await Promise.all([
        api.getRepasses(),
        api.getBillingBatches(),
        api.getAppointmentsForBilling(),
        api.getCustomers(),
        api.getPlans(),
        api.getPsychologists(),
      ]);
      setRepasses(rData);
      setBatches(bData);
      setAppointments(aData);
      setCustomers(cData);
      setPlans(plData);
      setPsychologists(psyData);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Lotes pagos (total ou parcialmente) com atendimentos ainda não repassados.
  // Com pagamento individual, um mesmo lote pode gerar vários repasses ao longo
  // do tempo — por isso rastreamos os atendimentos JÁ repassados (por atendimento),
  // e não mais bloqueamos o par psicólogo+lote inteiro.
  const pendingGroups = useMemo(() => {
    const eligibleBatches = batches.filter(
      b => b.status === BillingBatchStatus.PAID || b.status === BillingBatchStatus.PARTIALLY_PAID
    );
    const groups: { psyId: string; batch: BillingBatch; appIds: string[]; total: number; divergences: RepassDivergence[] }[] = [];

    eligibleBatches.forEach(batch => {
      // Group batch appointments by psychologist
      const byPsy: Record<string, string[]> = {};
      batch.appointmentIds.forEach(appId => {
        const app = appointments.find(a => a.id === appId);
        if (!app) return;
        if (!byPsy[app.psychologistId]) byPsy[app.psychologistId] = [];
        byPsy[app.psychologistId].push(appId);
      });

      Object.entries(byPsy).forEach(([psyId, appIds]) => {
        // Atendimentos já incluídos em repasses anteriores deste psicólogo + lote.
        const alreadyRepassed = new Set(
          repasses
            .filter(r => r.psychologistId === psyId && r.billingBatchId === batch.id)
            .flatMap(r => r.appointmentIds)
        );

        // Filtrar atendimentos elegíveis para repasse:
        // - Incluir SOMENTE os efetivamente pagos (billingStatus === 'paid')
        // - Excluir glosas, ignorados e internos
        // - Excluir os que já foram repassados
        const paidAppIds = appIds.filter(appId => {
          const app = appointments.find(a => a.id === appId);
          if (!app) return false;
          if (app.billingStatus !== 'paid') return false;
          if (app.billingIgnored) return false;
          if (app.isInternal) return false;
          if (alreadyRepassed.has(appId)) return false;
          return true;
        });


        // Se todos os atendimentos foram excluídos, não gera repasse
        if (paidAppIds.length === 0) return;

        // Calcular total usando procedure.repassAmount do plano (ou regra do psicólogo)
        // Acumula em centavos para evitar erros de floating-point
        const pricingCtx: PricingContext = { customers, plans, appointments };
        const psy = psychologists.find(p => p.id === psyId);
        let totalCents = 0;
        const divergences: RepassDivergence[] = [];
        paidAppIds.forEach(appId => {
          const app = appointments.find(a => a.id === appId);
          if (!app) return;
          // FASE 1: sessão paga. Neuropsico elegível ao split libera só 50% aqui;
          // os demais atendimentos liberam 100%.
          totalCents += Math.round(getPhaseRepassValue(app, customers, plans, psy, pricingCtx, 1) * 100);
          // Detectar divergências entre override manual e valor calculado
          const div = checkDivergence(app, customers, plans, psy, pricingCtx);
          if (div) divergences.push(div);
        });

        groups.push({ psyId, batch, appIds: paidAppIds, total: totalCents / 100, divergences });

      });
    });

    return groups;
  }, [batches, repasses, appointments, customers, plans, psychologists]);

  // ── Fila de 2ª Parcela (Avaliação Neuropsicológica) ──────────────────────
  // Sessões neuropsicológicas cuja FASE 1 (50%) já foi repassada e a FASE 2
  // ainda não. Enquanto o laudo não é entregue, a linha exibe o botão de
  // registro de entrega; após entregue, libera a geração da 2ª parcela.
  // Sessões antigas (grandfathering) têm phase2 já preenchida e não aparecem.
  const reportQueue = useMemo(() => {
    const pricingCtx: PricingContext = { customers, plans, appointments };
    // Fallback legado: atendimentos presentes em qualquer repasse (fluxo antigo).
    const legacyRepassed = new Set(repasses.flatMap(r => r.appointmentIds));

    return appointments
      .filter(a => isNeuropsicoReportSplit(a, pricingCtx))
      .filter(a => isPhase1Done(a, legacyRepassed))
      .filter(a => a.repassPhase2RepasseId == null)
      .map(a => {
        const psy = psychologists.find(p => p.id === a.psychologistId);
        const customer = customers.find(c => c.id === a.customerId);
        const phase2 = getPhaseRepassValue(a, customers, plans, psy, pricingCtx, 2);
        const daysElapsed = differenceInDays(new Date(), new Date(a.date + 'T12:00:00'));
        return { app: a, psy, customer, phase2, daysElapsed, delivered: a.reportDeliveredAt != null };
      })
      .filter(i => i.phase2 > 0)
      .sort((a, b) => b.daysElapsed - a.daysElapsed);
  }, [appointments, repasses, customers, plans, psychologists]);

  // Registra a entrega do laudo (habilita a 2ª parcela).
  const handleMarkReportDelivered = async (app: Appointment) => {
    if (!confirm('Confirmar que o laudo desta avaliação foi ENTREGUE? Isso liberará a 2ª parcela (50%) do repasse.')) return;
    let deliveredBy: string | undefined;
    try {
      const stored = localStorage.getItem('nucleo_user_v2');
      if (stored) deliveredBy = JSON.parse(stored)?.email ?? undefined;
    } catch { /* ignore */ }
    await api.updateAppointment(app.id, {
      reportDeliveredAt: new Date().toISOString(),
      reportDeliveredBy: deliveredBy,
    });
    await loadData();
  };

  // Gera o repasse da 2ª parcela (50%) para uma sessão com laudo entregue.
  const handleGeneratePhase2 = async (item: typeof reportQueue[0]) => {
    setIsGenerating(`p2-${item.app.id}`);
    try {
      const created = await api.createRepasse({
        psychologistId: item.app.psychologistId,
        billingBatchId: item.app.billingBatchId ?? '',
        appointmentIds: [item.app.id],
        totalAmount: item.phase2,
        status: RepasseStatus.PENDING,
      });
      await api.updateAppointment(item.app.id, { repassPhase2RepasseId: created.id });
      await loadData();
      const batch = batches.find(b => b.id === item.app.billingBatchId);
      generateRepassePDF(created, item.psy, batch, appointments, customers, plans);
    } finally {
      setIsGenerating(null);
    }
  };

  const handleGenerateRepasse = async (group: typeof pendingGroups[0]) => {

    // Verificar divergências antes de gerar — protege contra erros de dados
    if (group.divergences.length > 0) {
      const lines = group.divergences.map(d =>
        `• ${d.customerName} (${format(new Date(d.date + 'T12:00:00'), 'dd/MM/yyyy')}): salvo R$ ${d.actual.toFixed(2)}, esperado R$ ${d.expected.toFixed(2)}`
      ).join('\n');
      const msg = `⚠️ ${group.divergences.length} atendimento(s) com valor de repasse manual diferente do calculado automaticamente:\n\n${lines}\n\nDeseja gerar o repasse mesmo assim?`;
      if (!confirm(msg)) {
        return;
      }
    }

    setIsGenerating(`${group.psyId}-${group.batch.id}`);
    try {
      // ── Monitor de paridade financeira (Fase 2) ────────────────────────────
      // Antes de gravar, o servidor recalcula o repasse esperado resolvendo a
      // regra do psicólogo (repass_rate/fixed/overridesPlan) de forma autoritativa.
      // Se o total do servidor divergir do calculado no front (≥ R$1), bloqueia a
      // gravação e registra a divergência em operation_failures (logger.critical).
      try {
        const pricingCtx: PricingContext = { customers, plans, appointments };
        const items = group.appIds
          .map(id => appointments.find(a => a.id === id))
          .filter((a): a is Appointment => !!a)
          .map(app => buildRepassItem(app, customers, plans, pricingCtx));

        const { data: parity, error: parityError } = await supabase.rpc('check_repass_integrity', {
          p_psychologist_id: group.psyId,
          p_items: items,
        });

        if (parityError) throw parityError;

        const serverTotal = Number(parity?.expected_total ?? NaN);
        if (!Number.isNaN(serverTotal) && Math.abs(serverTotal - group.total) >= 1) {
          await logger.critical('repasse.parityMismatch', 'Divergência entre repasse do front e do servidor', {
            psychologistId: group.psyId,
            batchId: group.batch.id,
            frontTotal: group.total,
            serverTotal,
            appointmentIds: group.appIds,
          });
          const proceed = confirm(
            `⚠️ Divergência de repasse detectada!\n\n` +
            `Valor calculado no sistema: R$ ${group.total.toFixed(2)}\n` +
            `Valor esperado pelo servidor: R$ ${serverTotal.toFixed(2)}\n\n` +
            `Esta diferença foi registrada para auditoria. Deseja gravar assim mesmo?`,
          );
          if (!proceed) {
            setIsGenerating(null);
            return;
          }
        }
      } catch (parityErr) {
        // Falha na verificação não deve travar a operação — apenas registra.
        await logger.failure('repasse.parityCheckFailed', parityErr, {
          psychologistId: group.psyId,
          batchId: group.batch.id,
        });
      }

      const created = await api.createRepasse({

        psychologistId: group.psyId,
        billingBatchId: group.batch.id,
        appointmentIds: group.appIds,
        totalAmount: group.total,
        status: RepasseStatus.PENDING,
      });

      // Vincula a FASE 1 nas Avaliações Neuropsicológicas elegíveis ao split.
      // Isso as move para a fila "Aguardando Entrega de Laudo" (2ª parcela)
      // e evita que a 1ª parcela seja recalculada/reofertada futuramente.
      {
        const pricingCtx: PricingContext = { customers, plans, appointments };
        const splitApps = group.appIds
          .map(id => appointments.find(a => a.id === id))
          .filter((a): a is Appointment => !!a && isNeuropsicoReportSplit(a, pricingCtx));
        await Promise.all(
          splitApps.map(a =>
            api.updateAppointment(a.id, { repassPhase1RepasseId: created.id }),
          ),
        );
      }

      await loadData();

      // Auto-generate PDF
      const psy = psychologists.find(p => p.id === group.psyId);
      generateRepassePDF(created, psy, group.batch, appointments, customers, plans);
    } finally {
      setIsGenerating(null);
    }
  };

  const handleMarkAsPaid = async (repasse: Repasse) => {
    await api.updateRepasse(repasse.id, {
      status: RepasseStatus.PAID,
      paidAt: new Date().toISOString(),
    });
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este repasse? O lote voltará a ser elegível para novo repasse.')) return;
    await api.deleteRepasse(id);
    await loadData();
  };

  const handlePDF = (repasse: Repasse) => {
    const psy = psychologists.find(p => p.id === repasse.psychologistId);
    const batch = batches.find(b => b.id === repasse.billingBatchId);
    generateRepassePDF(repasse, psy, batch, appointments, customers, plans);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-priori-navy" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-priori-navy">Repasses</h1>
        <p className="text-zinc-500 mt-1">Gerencie pagamentos aos psicólogos após recebimento dos planos</p>
      </div>

      {/* Pendentes */}
      <section>
        <h2 className="text-base font-semibold text-priori-navy mb-3 flex items-center gap-2">
          <Clock size={16} className="text-amber-500" />
          Repasses Pendentes de Geração
        </h2>

        {pendingGroups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center text-zinc-400 text-sm">
            Nenhum lote pago aguarda repasse. Marque um lote como pago em <strong>Faturamento</strong> para gerar repasses.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/50 border-b border-zinc-100">
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Psicólogo(a)</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Plano de Saúde</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Lote</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Data Pagamento Plano</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Sessões</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Total Repasse</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pendingGroups.map(group => {
                  const psy = psychologists.find(p => p.id === group.psyId);
                  const key = `${group.psyId}-${group.batch.id}`;
                  return (
                    <tr key={key} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-priori-navy">{psy?.name ?? '—'}</td>
                      <td className="px-6 py-4 text-zinc-600">{group.batch.healthPlan}</td>
                      <td className="px-6 py-4 text-zinc-600">#{group.batch.batchNumber}</td>
                      <td className="px-6 py-4 text-zinc-600">
                        {group.batch.paidAt ? format(new Date(group.batch.paidAt), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-6 py-4 text-zinc-600">{group.appIds.length}</td>
                      <td className="px-6 py-4 font-semibold text-priori-navy">
                        <div className="flex items-center gap-1.5">
                          {fmt.format(group.total)}
                          {group.divergences.length > 0 && (
                            <span
                              className="text-amber-500 cursor-help"
                              title={group.divergences.map(d =>
                                `${d.customerName}: salvo R$ ${d.actual.toFixed(2)}, esperado R$ ${d.expected.toFixed(2)}`
                              ).join('\n')}
                            >
                              <AlertTriangle size={14} />
                            </span>
                          )}
                        </div>
                        {group.divergences.length > 0 && (
                          <div className="text-[10px] text-amber-600 font-normal mt-0.5">
                            {group.divergences.length} valor(es) divergente(s)
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          className="bg-priori-navy hover:bg-priori-navy/90 text-white"
                          onClick={() => handleGenerateRepasse(group)}
                          disabled={isGenerating === key}
                        >
                          {isGenerating === key ? (
                            <Loader2 size={14} className="animate-spin mr-1" />
                          ) : (
                            <Plus size={14} className="mr-1" />
                          )}
                          Gerar Repasse
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Aguardando Entrega de Laudo (2ª parcela — Avaliação Neuropsicológica) */}
      <section>
        <h2 className="text-base font-semibold text-priori-navy mb-3 flex items-center gap-2">
          <Hourglass size={16} className="text-indigo-500" />
          Aguardando Entrega de Laudo
          <span className="text-xs font-normal text-zinc-400">(2ª parcela — 50% — Avaliação Neuropsicológica)</span>
        </h2>

        {reportQueue.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center text-zinc-400 text-sm">
            Nenhuma avaliação neuropsicológica aguardando entrega de laudo.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/50 border-b border-zinc-100">
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Psicólogo(a)</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Paciente</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Data da Sessão</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Prazo</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">2ª Parcela</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {reportQueue.map(item => {
                  const overdue = !item.delivered && item.daysElapsed >= 75;
                  return (
                    <tr key={item.app.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-priori-navy">{item.psy?.name ?? '—'}</td>
                      <td className="px-6 py-4 text-zinc-600">{item.customer?.name ?? '—'}</td>
                      <td className="px-6 py-4 text-zinc-600">
                        {format(new Date(item.app.date + 'T12:00:00'), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        {item.delivered ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                            <CheckCircle2 size={11} />
                            Laudo entregue
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                              overdue
                                ? 'bg-red-50 text-red-600 border-red-100'
                                : 'bg-zinc-50 text-zinc-500 border-zinc-100',
                            )}
                            title={`${item.daysElapsed} dia(s) desde a sessão`}
                          >
                            {overdue && <AlertTriangle size={11} />}
                            {item.daysElapsed} dias
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-priori-navy">{fmt.format(item.phase2)}</td>
                      <td className="px-6 py-4 text-right">
                        {item.delivered ? (
                          <Button
                            size="sm"
                            className="bg-priori-navy hover:bg-priori-navy/90 text-white"
                            onClick={() => handleGeneratePhase2(item)}
                            disabled={isGenerating === `p2-${item.app.id}`}
                          >
                            {isGenerating === `p2-${item.app.id}` ? (
                              <Loader2 size={14} className="animate-spin mr-1" />
                            ) : (
                              <Plus size={14} className="mr-1" />
                            )}
                            Gerar 2ª Parcela
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                            onClick={() => handleMarkReportDelivered(item.app)}
                          >
                            <FileText size={14} className="mr-1" />
                            Marcar Laudo Entregue
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Histórico */}
      <section>
        <h2 className="text-base font-semibold text-priori-navy mb-3 flex items-center gap-2">
          <ArrowRightLeft size={16} className="text-priori-navy" />
          Histórico de Repasses
        </h2>


        {repasses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center text-zinc-400 text-sm">
            Nenhum repasse gerado ainda.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/50 border-b border-zinc-100">
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Psicólogo(a)</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Plano</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Lote</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Data Envio Lote</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Total Repasse</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-priori-navy uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {repasses.map(repasse => {
                  const psy = psychologists.find(p => p.id === repasse.psychologistId);
                  const batch = batches.find(b => b.id === repasse.billingBatchId);
                  return (
                    <tr key={repasse.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-priori-navy">{psy?.name ?? '—'}</td>
                      <td className="px-6 py-4 text-zinc-600">{batch?.healthPlan ?? '—'}</td>
                      <td className="px-6 py-4 text-zinc-600">#{batch?.batchNumber ?? '—'}</td>
                      <td className="px-6 py-4 text-zinc-600">
                        {batch?.sentAt ? format(new Date(batch.sentAt), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-priori-navy">{fmt.format(repasse.totalAmount)}</td>
                      <td className="px-6 py-4">
                        {repasse.status === RepasseStatus.PAID ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                            <CheckCircle2 size={11} />
                            Pago em {repasse.paidAt ? format(new Date(repasse.paidAt), 'dd/MM/yyyy') : '—'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-100">
                            <Clock size={11} />
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePDF(repasse)}
                          className="text-priori-navy border-zinc-200"
                          title="Exportar PDF"
                        >
                          <FileText size={14} />
                        </Button>
                        {repasse.status === RepasseStatus.PENDING && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkAsPaid(repasse)}
                            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          >
                            <CheckCircle2 size={14} className="mr-1" />
                            Marcar Pago
                          </Button>
                        )}
                        <button
                          onClick={() => handleDelete(repasse.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
