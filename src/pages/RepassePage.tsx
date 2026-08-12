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
  Filter,
  X,
  ChevronDown,
  ChevronUp,
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
import { MonthSelector } from '../components/MonthSelector';
import { cn } from '../lib/utils';
import { calcRepass } from '../lib/repassRules';
import {
  getAppPrice,
  getAmsNeuropsicoSessionIndex,
  isRepassBlocked,
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

  // AMS Petrobras neuropsico: a 2ª/3ª sessão do ciclo usa SEMPRE o procedimento
  // 95090010 (repasse próprio), sobrepondo o procedureCode gravado no agendamento
  // (que é sempre 95110011, o único procedimento neuropsico do plano). A resolução
  // é INCONDICIONAL — não depende de procedureCode estar vazio — igual a getTussCode.
  let resolvedProcCode = app.procedureCode;
  if (
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
 * Retorna o mês e ano preponderante dos atendimentos do lote no formato YYYY-MM.
 * Caso não haja atendimentos, faz fallback para a data de envio.
 */
function getBatchYearMonth(batch: BillingBatch, appointments: Appointment[]): string {
  const batchApps = appointments.filter(a => batch.appointmentIds.includes(a.id));
  const monthCounts: Record<string, number> = {};
  for (const app of batchApps) {
    const month = (app.date || '').substring(0, 7); // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(month)) {
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    }
  }
  const predominant = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (predominant) return predominant;
  if (batch.sentAt) return batch.sentAt.substring(0, 7);
  return '';
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
  // AMS Petrobras neuropsico 2ª/3ª sessão → 95090010, INCONDICIONAL (igual getRepassValue).
  let resolvedProcCode = app.procedureCode;
  if (
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
    // AMS Petrobras neuropsico 2ª/3ª sessão → 95090010, INCONDICIONAL (igual getRepassValue).
    let resolvedProcCode = app.procedureCode;
    if (
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
      // Resolve o código TUSS efetivo com a MESMA lógica de getRepassValue/getTussCode.
      // Para AMS Petrobras neuropsico, a 2ª/3ª sessão do ciclo (índices 1 e 2) usa o
      // procedimento 95090010 — sem isso, o comprovante exibia 95110011 (código da 1ª
      // sessão) em todas as sessões, divergindo do valor de repasse realmente calculado.
      let resolvedProcCode = app.procedureCode;
      if (
        customer?.healthPlan === HealthPlan.AMS_PETROBRAS &&
        app.type === AppointmentType.NEUROPSICOLOGICA
      ) {
        const sessionIdx = getAmsNeuropsicoSessionIndex(app, pricingCtx);
        if (sessionIdx === 1 || sessionIdx === 2) resolvedProcCode = '95090010';
      }

      // Valida se o código TUSS pertence ao plano (consistente com getRepassValue).
      const procedureByCode = resolvedProcCode
        ? plan?.procedures?.find(proc => proc.code === resolvedProcCode)
        : undefined;
      const procedure = procedureByCode ?? plan?.procedures?.find(proc => proc.type === app.type);


      // Valor phase-aware: se este atendimento entra no split neuropsicológico,
      // o comprovante mostra apenas o valor correspondente a ESTA etapa de repasse
      // (1/2 na sessão, 2/2 na entrega do laudo), não o valor cheio.
      let repassVal = getRepassValue(app, customers, plans, psy, pricingCtx);
      let parcelaLabel = '';
      if (app.repassPhase1RepasseId === repasse.id) {
        repassVal = Math.round(repassVal * 100 * 0.5) / 100;
        parcelaLabel = ' (Etapa 1/2 — Sessão)';
      } else if (app.repassPhase2RepasseId === repasse.id) {
        repassVal = Math.round(repassVal * 100 * 0.5) / 100;
        parcelaLabel = ' (Etapa 2/2 — Laudo)';
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

  // Estados de Filtro
  const [filterMonth, setFilterMonth] = useState<string>(''); // YYYY-MM
  const [filterPsyId, setFilterPsyId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>(''); // '', 'READY', 'AWAITING_REPORT', 'PENDING', 'PAID'
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(true);

  // Estados de Expansão
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Record<string, boolean>>({});
  const [expandedRepasseIds, setExpandedRepasseIds] = useState<Record<string, boolean>>({});

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroupKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRepasseExpanded = (id: string) => {
    setExpandedRepasseIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Lotes pagos com atendimentos ainda não repassados.
  // Com pagamento individual, um mesmo lote pode gerar vários repasses ao longo
  // do tempo — por isso rastreamos os atendimentos JÁ repassados (por atendimento),
  // e não mais bloqueamos o par psicólogo+lote inteiro.
  const pendingGroups = useMemo(() => {
    const eligibleBatches = batches.filter(
      b => b.status === BillingBatchStatus.PAID
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
          // Repasse integral da sessão realizada/faturada (sem split)
          totalCents += Math.round(getRepassValue(app, customers, plans, psy, pricingCtx) * 100);
          // Detectar divergências entre override manual e valor calculado
          const div = checkDivergence(app, customers, plans, psy, pricingCtx);
          if (div) divergences.push(div);
        });

        groups.push({ psyId, batch, appIds: paidAppIds, total: totalCents / 100, divergences });

      });
    });

    return groups;
  }, [batches, repasses, appointments, customers, plans, psychologists]);

  // ── Filtragem Client-Side Reativa (Zero Supabase Calls) ──────────────────────
  const filteredPendingGroups = useMemo(() => {
    if (filterStatus && filterStatus !== 'READY') return [];
    return pendingGroups.filter(group => {
      if (filterPsyId && group.psyId !== filterPsyId) return false;
      if (filterMonth) {
        const batchMonth = getBatchYearMonth(group.batch, appointments);
        if (batchMonth !== filterMonth) return false;
      }
      return true;
    });
  }, [pendingGroups, filterPsyId, filterMonth, filterStatus, appointments]);

  const filteredRepasses = useMemo(() => {
    return repasses.filter(repasse => {
      if (filterPsyId && repasse.psychologistId !== filterPsyId) return false;
      if (filterStatus === 'PENDING' && repasse.status !== RepasseStatus.PENDING) return false;
      if (filterStatus === 'PAID' && repasse.status !== RepasseStatus.PAID) return false;
      if (filterStatus && filterStatus !== 'PENDING' && filterStatus !== 'PAID') return false;
      if (filterMonth) {
        const batch = batches.find(b => b.id === repasse.billingBatchId);
        const repasseMonth = batch ? getBatchYearMonth(batch, appointments) : '';
        if (repasseMonth !== filterMonth) return false;
      }
      return true;
    });
  }, [repasses, filterPsyId, filterMonth, filterStatus, batches, appointments]);

  // ── Métricas Consolidadas para os Cards de Resumo ────────────────────────────
  const summary = useMemo(() => {
    const totalPendingGeneration = pendingGroups.reduce((acc, g) => acc + g.total, 0);
    
    const repassesPending = repasses.filter(r => r.status === RepasseStatus.PENDING);
    const totalRepassesPending = repassesPending.reduce((acc, r) => acc + r.totalAmount, 0);
    
    const repassesPaid = repasses.filter(r => r.status === RepasseStatus.PAID);
    const totalRepassesPaid = repassesPaid.reduce((acc, r) => acc + r.totalAmount, 0);

    return {
      pendingGenerationCount: pendingGroups.length,
      pendingGenerationAmount: totalPendingGeneration,
      awaitingReportCount: 0,
      awaitingReportAmount: 0,
      repassesPendingCount: repassesPending.length,
      repassesPendingAmount: totalRepassesPending,
      repassesPaidCount: repassesPaid.length,
      repassesPaidAmount: totalRepassesPaid,
    };
  }, [pendingGroups, repasses]);

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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-priori-navy tracking-tight">Repasses</h1>
          <p className="text-zinc-500 mt-1">Gerencie pagamentos aos psicólogos após recebimento dos planos</p>
        </div>
        <Button
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
          variant="outline"
          className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 shadow-sm"
        >
          <Filter size={16} />
          {isFiltersOpen ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          {(filterMonth || filterPsyId || filterStatus) && (
            <span className="w-2 h-2 rounded-full bg-priori-navy animate-pulse" />
          )}
        </Button>
      </div>

      {/* Barra de Filtros */}
      {isFiltersOpen && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Psicólogo */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Psicólogo(a)</label>
              <select
                value={filterPsyId}
                onChange={(e) => setFilterPsyId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy transition-all"
              >
                <option value="">Todos os psicólogos</option>
                {psychologists
                  .filter(p => p.active)
                  .map(psy => (
                    <option key={psy.id} value={psy.id}>{psy.name}</option>
                  ))
                }
              </select>
            </div>

            {/* Mês de Referência */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Mês de Referência</label>
              <MonthSelector
                value={filterMonth}
                onChange={setFilterMonth}
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Status do Repasse</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy transition-all"
              >
                <option value="">Todos os status</option>
                <option value="READY">Repasses Disponíveis</option>
                <option value="PENDING">Repasse Pendente (Histórico)</option>
                <option value="PAID">Repasse Pago (Histórico)</option>
              </select>
            </div>
          </div>

          {/* Botão de limpar filtros se algum filtro estiver ativo */}
          {(filterMonth || filterPsyId || filterStatus) && (
            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setFilterMonth('');
                  setFilterPsyId('');
                  setFilterStatus('');
                }}
                className="text-xs font-semibold text-red-500 hover:text-red-700 flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-red-100"
              >
                <X size={12} />
                Limpar Filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Prontos para Repasse */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Repasses Disponíveis</p>
            <h3 className="text-xl font-bold text-priori-navy mt-1">{fmt.format(summary.pendingGenerationAmount)}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{summary.pendingGenerationCount} lote(s) pronto(s)</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
            <Clock size={20} />
          </div>
        </div>

        {/* Card 2: Gerados e Pendentes */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Repasses Pendentes</p>
            <h3 className="text-xl font-bold text-priori-navy mt-1">{fmt.format(summary.repassesPendingAmount)}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{summary.repassesPendingCount} pendente(s) de pgto</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
            <AlertTriangle size={20} />
          </div>
        </div>

        {/* Card 3: Pagos */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Repasses Pagos</p>
            <h3 className="text-xl font-bold text-priori-navy mt-1">{fmt.format(summary.repassesPaidAmount)}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{summary.repassesPaidCount} pago(s)</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* Pendentes de Geração */}
      {(!filterStatus || filterStatus === 'READY') && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-priori-navy flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            Repasses Pendentes de Geração
            <span className="text-xs font-normal text-zinc-400">({filteredPendingGroups.length} lote(s) pronto(s))</span>
          </h2>

          {filteredPendingGroups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center text-zinc-400 text-sm">
              {filterMonth || filterPsyId
                ? 'Nenhum repasse a gerar corresponde aos filtros aplicados.'
                : 'Nenhum lote pago aguarda repasse. Marque um lote como pago em Faturamento para gerar repasses.'}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Psicólogo(a)</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano de Saúde</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lote</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data Pagamento Plano</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sessões</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Repasse</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredPendingGroups.map(group => {
                    const psy = psychologists.find(p => p.id === group.psyId);
                    const key = `${group.psyId}-${group.batch.id}`;
                    const isExpanded = !!expandedGroupKeys[key];
                    const groupApps = appointments.filter(a => group.appIds.includes(a.id));

                    return (
                      <React.Fragment key={key}>
                        <tr className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-priori-navy">
                            <button
                              onClick={() => toggleGroupExpanded(key)}
                              className="flex items-center gap-2 text-left hover:text-priori-navy/80 focus:outline-none font-semibold"
                            >
                              {isExpanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                              {psy?.name ?? '—'}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-600">{group.batch.healthPlan}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600">#{group.batch.batchNumber}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600">
                            {group.batch.paidAt ? format(new Date(group.batch.paidAt), 'dd/MM/yyyy') : '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-600">{group.appIds.length}</td>
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
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-6 py-4 bg-zinc-50/50 border-t border-b border-zinc-100">
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-priori-navy uppercase tracking-wider">Atendimentos incluídos neste repasse planejado:</h4>
                                <div className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-500 font-semibold">
                                        <th className="px-4 py-2.5">Paciente</th>
                                        <th className="px-4 py-2.5">Data da Sessão</th>
                                        <th className="px-4 py-2.5">Tipo / Procedimento</th>
                                        <th className="px-4 py-2.5 text-right">Valor Repasse</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 text-zinc-600">
                                      {groupApps.map(app => {
                                        const customer = customers.find(c => c.id === app.customerId);
                                        const pricingCtx = { customers, plans, appointments };
                                        let repassVal = getRepassValue(app, customers, plans, psy, pricingCtx);
                                        if (app.repassPhase1RepasseId || app.repassPhase2RepasseId) {
                                          repassVal = Math.round(repassVal * 100 * 0.5) / 100;
                                        }
                                        return (
                                          <tr key={app.id} className="hover:bg-zinc-50/50">
                                            <td className="px-4 py-2 font-medium text-priori-navy">{customer?.name ?? '—'}</td>
                                            <td className="px-4 py-2">{format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                            <td className="px-4 py-2 capitalize">{app.type === AppointmentType.NEUROPSICOLOGICA ? 'Neuropsicologia' : 'Sessão Comum'}</td>
                                            <td className="px-4 py-2 text-right font-medium text-priori-navy">{fmt.format(repassVal)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}


      {/* Histórico de Repasses */}
      {(!filterStatus || filterStatus === 'PENDING' || filterStatus === 'PAID') && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-priori-navy flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-priori-navy" />
            Histórico de Repasses
            <span className="text-xs font-normal text-zinc-400">({filteredRepasses.length} repasses listados)</span>
          </h2>

          {filteredRepasses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center text-zinc-400 text-sm">
              {filterMonth || filterPsyId || filterStatus
                ? 'Nenhum repasse do histórico corresponde aos filtros aplicados.'
                : 'Nenhum repasse gerado ainda.'}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Psicólogo(a)</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lote</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data Envio Lote</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Repasse</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredRepasses.map(repasse => {
                    const psy = psychologists.find(p => p.id === repasse.psychologistId);
                    const batch = batches.find(b => b.id === repasse.billingBatchId);
                    const isExpanded = !!expandedRepasseIds[repasse.id];
                    const repasseApps = appointments.filter(a => repasse.appointmentIds.includes(a.id));

                    return (
                      <React.Fragment key={repasse.id}>
                        <tr className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-priori-navy">
                            <button
                              onClick={() => toggleRepasseExpanded(repasse.id)}
                              className="flex items-center gap-2 text-left hover:text-priori-navy/80 focus:outline-none font-semibold"
                            >
                              {isExpanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                              {psy?.name ?? '—'}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-600">{batch?.healthPlan ?? '—'}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600">#{batch?.batchNumber ?? '—'}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600">
                            {batch?.sentAt ? format(new Date(batch.sentAt), 'dd/MM/yyyy') : '—'}
                          </td>
                          <td className="px-6 py-4 font-semibold text-priori-navy">{fmt.format(repasse.totalAmount)}</td>
                          <td className="px-6 py-4">
                            {repasse.status === RepasseStatus.PAID ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 size={11} />
                                Pago em {repasse.paidAt ? format(new Date(repasse.paidAt), 'dd/MM/yyyy') : '—'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock size={11} />
                                Pendente
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePDF(repasse)}
                              className="text-priori-navy border-zinc-200 shadow-sm"
                              title="Exportar PDF"
                            >
                              <FileText size={14} />
                            </Button>
                            {repasse.status === RepasseStatus.PENDING && (
                              <Button
                                size="sm"
                                onClick={() => handleMarkAsPaid(repasse)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
                              >
                                <CheckCircle2 size={14} className="mr-1" />
                                Marcar Pago
                              </Button>
                            )}
                            <button
                              onClick={() => handleDelete(repasse.id)}
                              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all inline-block align-middle"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-6 py-4 bg-zinc-50/50 border-t border-b border-zinc-100">
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-priori-navy uppercase tracking-wider">Atendimentos incluídos neste repasse:</h4>
                                <div className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-500 font-semibold">
                                        <th className="px-4 py-2.5">Paciente</th>
                                        <th className="px-4 py-2.5">Data da Sessão</th>
                                        <th className="px-4 py-2.5">Tipo / Procedimento</th>
                                        <th className="px-4 py-2.5 text-right">Valor Repassado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 text-zinc-600">
                                      {repasseApps.map(app => {
                                        const customer = customers.find(c => c.id === app.customerId);
                                        const pricingCtx = { customers, plans, appointments };
                                        
                                        let repassVal = getRepassValue(app, customers, plans, psy, pricingCtx);
                                        if (app.repassPhase1RepasseId === repasse.id || app.repassPhase2RepasseId === repasse.id) {
                                          repassVal = Math.round(repassVal * 100 * 0.5) / 100;
                                        }

                                        return (
                                          <tr key={app.id} className="hover:bg-zinc-50/50">
                                            <td className="px-4 py-2 font-medium text-priori-navy">{customer?.name ?? '—'}</td>
                                            <td className="px-4 py-2">{format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                                            <td className="px-4 py-2 capitalize">{app.type === AppointmentType.NEUROPSICOLOGICA ? 'Neuropsicologia' : 'Sessão Comum'}</td>
                                            <td className="px-4 py-2 text-right font-medium text-priori-navy">{fmt.format(repassVal)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
