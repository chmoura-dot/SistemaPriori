import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../services/api';
import {
  Appointment,
  BillingBatch,
  BillingBatchStatus,
  Customer,
  Plan,
  Psychologist,
  Repasse,
  RepasseStatus,
} from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { calcRepass } from '../lib/repassRules';

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// ─── PDF Generation ──────────────────────────────────────────────────────────

function generateRepassePDF(
  repasse: Repasse,
  psy: Psychologist | undefined,
  batch: BillingBatch | undefined,
  appointments: Appointment[],
  customers: Customer[],
  plans: Plan[],
) {
  const rows = repasse.appointmentIds.map(id => {
    const app = appointments.find(a => a.id === id);
    const customer = customers.find(c => c.id === app?.customerId);
    const plan = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
    const procedure = plan?.procedures?.find(proc => proc.type === app?.type);
    const gross = app?.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
    const fixedRepass = app?.customRepassAmount ?? customer?.customRepassAmount ?? procedure?.repassAmount ?? 0;
    const repassVal = calcRepass(gross, psy?.name, fixedRepass);
    return { app, customer, procedure, repassVal };
  });

  const today = format(new Date(), 'dd/MM/yyyy');
  const planName = batch?.healthPlan ?? '—';
  const batchNum = batch?.batchNumber ?? '—';
  const sentAt = batch?.sentAt ? format(new Date(batch.sentAt), 'dd/MM/yyyy') : '—';
  const paidAt = batch?.paidAt ? format(new Date(batch.paidAt), 'dd/MM/yyyy') : '—';

  const tableRows = rows
    .map(({ app, customer, procedure, repassVal }) => {
      const dateStr = app ? format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy') : '—';
      return `
        <tr>
          <td class="cell">${customer?.name ?? '—'}</td>
          <td class="cell">${dateStr}</td>
          <td class="cell">${procedure?.code ?? '—'}</td>
          <td class="cell">${procedure?.description ?? '—'}</td>
          <td class="cell right">${fmt.format(repassVal)}</td>
        </tr>`;
    })
    .join('');

  const total = rows.reduce((s, r) => s + r.repassVal, 0);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Repasse — ${psy?.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #1a202c; padding: 40px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #1B365D; padding-bottom: 16px; }
    .brand { font-size: 20px; font-weight: 700; color: #1B365D; }
    .brand-sub { font-size: 11px; color: #718096; margin-top: 2px; }
    .meta { text-align: right; font-size: 11px; color: #718096; }
    h2 { font-size: 16px; color: #1B365D; margin-bottom: 16px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; margin-bottom: 28px; padding: 16px; background: #f7f8fa; border-radius: 8px; }
    .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #718096; }
    .info-value { font-weight: 600; color: #1B365D; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #1B365D; color: white; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .cell { padding: 9px 12px; border-bottom: 1px solid #edf2f7; color: #2d3748; }
    .right { text-align: right; }
    tr:nth-child(even) td { background: #f7f8fa; }
    .total-row { background: #1B365D !important; color: white !important; font-weight: 700; }
    .total-row td { color: white !important; padding: 10px 12px; }
    .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #a0aec0; text-align: center; }
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

  <h2>Atendimentos</h2>
  <table>
    <thead>
      <tr>
        <th>Paciente</th>
        <th>Data do Atendimento</th>
        <th>Cód TUSS</th>
        <th>Procedimento</th>
        <th style="text-align:right">Valor Repasse</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td colspan="4">TOTAL DO REPASSE</td>
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
        api.getAppointments(),
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

  // Lotes pagos que ainda não têm repasse gerado para algum psicólogo
  const pendingGroups = useMemo(() => {
    const paidBatches = batches.filter(b => b.status === BillingBatchStatus.PAID);
    const groups: { psyId: string; batch: BillingBatch; appIds: string[]; total: number }[] = [];

    paidBatches.forEach(batch => {
      // Group batch appointments by psychologist
      const byPsy: Record<string, string[]> = {};
      batch.appointmentIds.forEach(appId => {
        const app = appointments.find(a => a.id === appId);
        if (!app) return;
        if (!byPsy[app.psychologistId]) byPsy[app.psychologistId] = [];
        byPsy[app.psychologistId].push(appId);
      });

      Object.entries(byPsy).forEach(([psyId, appIds]) => {
        // Check if repasse already exists for this psy + batch
        const exists = repasses.some(r => r.psychologistId === psyId && r.billingBatchId === batch.id);
        if (exists) return;

        // Calculate total
        let total = 0;
        appIds.forEach(appId => {
          const app = appointments.find(a => a.id === appId);
          const customer = customers.find(c => c.id === app?.customerId);
          const plan = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
          const procedure = plan?.procedures?.find(proc => proc.type === app?.type);
          const gross = app?.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
          const psy = psychologists.find(p => p.id === psyId);
          const fixedRepass = app?.customRepassAmount ?? customer?.customRepassAmount ?? procedure?.repassAmount ?? 0;
          total += calcRepass(gross, psy?.name, fixedRepass);
        });

        groups.push({ psyId, batch, appIds, total });
      });
    });

    return groups;
  }, [batches, repasses, appointments, customers, plans, psychologists]);

  const handleGenerateRepasse = async (group: typeof pendingGroups[0]) => {
    setIsGenerating(`${group.psyId}-${group.batch.id}`);
    try {
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
                      <td className="px-6 py-4 font-semibold text-priori-navy">{fmt.format(group.total)}</td>
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
