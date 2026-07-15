import React from 'react';
import { CheckCircle2, Clock, AlertCircle, Download, Trash2, Ban, Edit2, Send, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { BillingBatch, BillingBatchStatus, Appointment } from '../../services/types';
import { Button } from '../Button';
import { formatCurrency } from '../../lib/utils';

interface Props {
  batches: BillingBatch[];
  appointments: Appointment[];
  onDetails: (batch: BillingBatch) => void;
  onMarkAsPaid: (batch: BillingBatch) => void;
  onExport: (batch: BillingBatch) => void;
  onDelete: (id: string) => void;
  onEditDraft: (batch: BillingBatch) => void;
}

const StatusBadge: React.FC<{ status: BillingBatchStatus }> = ({ status }) => {
  if (status === BillingBatchStatus.DRAFT) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <Edit2 size={10} />
        Rascunho
      </span>
    );
  }
  if (status === BillingBatchStatus.SENT) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
        <Clock size={10} />
        Enviado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 size={10} />
      Pago
    </span>
  );
};

export const BillingBatchTable: React.FC<Props> = ({
  batches,
  appointments,
  onDetails,
  onMarkAsPaid,
  onExport,
  onDelete,
  onEditDraft,
}) => {
  // Separar rascunhos dos demais (rascunhos aparecem primeiro, com destaque)
  const drafts = batches.filter(b => b.status === BillingBatchStatus.DRAFT);
  const others = batches.filter(b => b.status !== BillingBatchStatus.DRAFT);
  const sortedBatches = [...drafts, ...others];

  const MONTH_NAMES = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];

  const formatMonthLabel = (yyyyMm: string): string | null => {
    if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return null;
    const [y, m] = yyyyMm.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]}/${y}`;
  };

  // Competência = mês/ano dos ATENDIMENTOS do lote (não a data de geração do faturamento).
  const formatCompetencia = (batch: BillingBatch): string => {
    // Agrupa as datas dos atendimentos por mês (YYYY-MM) e usa o mês predominante.
    const batchApps = appointments.filter(a => batch.appointmentIds.includes(a.id));
    const monthCounts: Record<string, number> = {};
    for (const app of batchApps) {
      const month = (app.date || '').substring(0, 7); // YYYY-MM
      if (/^\d{4}-\d{2}$/.test(month)) {
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      }
    }
    const predominant = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (predominant) {
      const label = formatMonthLabel(predominant);
      if (label) return label;
    }

    // Fallback: usa sentAt (para rascunhos sem atendimentos, guarda a competência).
    const fallbackMonth = formatMonthLabel(batch.sentAt.substring(0, 7));
    if (fallbackMonth) return fallbackMonth;
    return format(new Date(batch.sentAt), 'dd/MM/yyyy');
  };


  if (sortedBatches.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
        <div className="text-zinc-400 mb-3">
          <FileText size={32} className="mx-auto opacity-40" />
        </div>
        <p className="text-sm text-zinc-500 font-medium">Nenhum lote criado ainda.</p>
        <p className="text-xs text-zinc-400 mt-1">Clique em "Novo Lote" para começar a faturar.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50/50 border-b border-zinc-100">
              <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lote</th>
              <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Operadora</th>
              <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Competência</th>
              <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Atendimentos</th>
              <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total</th>
              <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {sortedBatches.map((batch) => {
              const isDraft = batch.status === BillingBatchStatus.DRAFT;
              const batchAppointments = appointments.filter(a => batch.appointmentIds.includes(a.id));
              const deniedCount = batchAppointments.filter(a => a.billingStatus === 'denied').length;

              return (
                <tr
                  key={batch.id}
                  className={`transition-colors ${isDraft ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-zinc-50/50'}`}
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-semibold text-priori-navy">
                      #{batch.batchNumber}
                    </span>
                    {isDraft && (
                      <p className="text-[10px] text-amber-600 mt-0.5">Em construção</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-zinc-700">{batch.healthPlan}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-zinc-600">{formatCompetencia(batch)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-700">
                        {batch.appointmentIds.length}
                      </span>
                      {deniedCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-red-500">
                          <AlertCircle size={12} />
                          {deniedCount} glosa{deniedCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-priori-navy">
                      {formatCurrency(batch.totalAmount)}
                    </span>
                    {isDraft && (
                      <p className="text-[10px] text-amber-600 mt-0.5">Previsão</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 justify-end flex-wrap">
                      {isDraft ? (
                        // ── Ações para RASCUNHO ──────────────────────────────
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEditDraft(batch)}
                            className="text-xs flex items-center gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                          >
                            <Edit2 size={12} />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => onEditDraft(batch)}
                            className="text-xs flex items-center gap-1 bg-priori-navy hover:bg-priori-navy/90"
                          >
                            <Send size={12} />
                            Finalizar
                          </Button>
                          <button
                            onClick={() => onDelete(batch.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Excluir rascunho"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        // ── Ações para SENT / PAID ───────────────────────────
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDetails(batch)}
                            className="text-xs"
                          >
                            Detalhes
                          </Button>
                          {batch.status === BillingBatchStatus.SENT && (
                            <Button
                              size="sm"
                              onClick={() => onMarkAsPaid(batch)}
                              className="text-xs bg-emerald-600 hover:bg-emerald-700"
                            >
                              Registrar Pagamento
                            </Button>
                          )}
                          <button
                            onClick={() => onExport(batch)}
                            className="p-1.5 text-zinc-400 hover:text-priori-navy hover:bg-zinc-100 rounded-lg transition-all"
                            title="Exportar Excel"
                          >
                            <Download size={15} />
                          </button>
                          <button
                            onClick={() => onDelete(batch.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Excluir lote"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
