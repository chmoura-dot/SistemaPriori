import React, { useState } from 'react';
import { CheckCircle2, Clock, AlertCircle, Download, Trash2, Edit2, Send, FileText, ChevronDown } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { BillingBatch, BillingBatchStatus, Appointment } from '../../services/types';
import { Button } from '../Button';
import { formatCurrency } from '../../lib/utils';

interface Props {
  batches: BillingBatch[];
  appointments: Appointment[];
  getAppPrice: (app: Appointment) => number;
  onDetails: (batch: BillingBatch) => void;
  onMarkAsPaid: (batch: BillingBatch) => void;
  onExport: (batch: BillingBatch) => void;
  onDelete: (id: string) => void;
  onEditDraft: (batch: BillingBatch) => void;
}

// ─── Configuração visual de cada status ────────────────────────────────
type StatusTheme = {
  label: string;
  icon: React.ReactNode;
  badgeCls: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  iconWrap: string;
};

const STATUS_THEME: Record<BillingBatchStatus, StatusTheme> = {
  [BillingBatchStatus.DRAFT]: {
    label: 'Lotes Previstos',
    icon: <Edit2 size={16} />,
    badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',
    headerBg: 'bg-amber-50/60 hover:bg-amber-50',
    headerBorder: 'border-l-amber-400',
    headerText: 'text-amber-800',
    iconWrap: 'bg-amber-100 text-amber-600',
  },
  [BillingBatchStatus.SENT]: {
    label: 'Faturamento Confirmado',
    icon: <Clock size={16} />,
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
    headerBg: 'bg-blue-50/60 hover:bg-blue-50',
    headerBorder: 'border-l-blue-400',
    headerText: 'text-blue-800',
    iconWrap: 'bg-blue-100 text-blue-600',
  },
  [BillingBatchStatus.PARTIALLY_PAID]: {
    label: 'Parcialmente Pagos',
    icon: <Clock size={16} />,
    badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    headerBg: 'bg-indigo-50/60 hover:bg-indigo-50',
    headerBorder: 'border-l-indigo-400',
    headerText: 'text-indigo-800',
    iconWrap: 'bg-indigo-100 text-indigo-600',
  },
  [BillingBatchStatus.PAID]: {
    label: 'Pagos pelo Plano',
    icon: <CheckCircle2 size={16} />,
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    headerBg: 'bg-emerald-50/60 hover:bg-emerald-50',
    headerBorder: 'border-l-emerald-400',
    headerText: 'text-emerald-800',
    iconWrap: 'bg-emerald-100 text-emerald-600',
  },
};

// Ordem fixa seguindo o fluxo do dinheiro
const STATUS_ORDER: BillingBatchStatus[] = [
  BillingBatchStatus.DRAFT,
  BillingBatchStatus.SENT,
  BillingBatchStatus.PARTIALLY_PAID,
  BillingBatchStatus.PAID,
];

const StatusBadge: React.FC<{ status: BillingBatchStatus }> = ({ status }) => {
  const theme = STATUS_THEME[status];
  const shortLabel =
    status === BillingBatchStatus.SENT ? 'Faturamento Confirmado'
    : status === BillingBatchStatus.DRAFT ? 'Lote Previsto'
    : status === BillingBatchStatus.PARTIALLY_PAID ? 'Parcialmente Pago'
    : 'Pago pelo Plano';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${theme.badgeCls}`}>
      {React.cloneElement(theme.icon as React.ReactElement<{ size?: number }>, { size: 10 })}
      {shortLabel}
    </span>
  );

};

const MONTH_NAMES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

// ─── Filtro de período para o histórico de lotes pagos ─────────────────
type PaidPeriodFilter = '3m' | '6m' | '1y' | 'all';

const PAID_PERIOD_OPTIONS: { value: PaidPeriodFilter; label: string }[] = [
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '1y', label: 'Último ano' },
  { value: 'all', label: 'Ver tudo' },
];

export const BillingBatchTable: React.FC<Props> = ({
  batches,
  appointments,
  getAppPrice,
  onDetails,
  onMarkAsPaid,
  onExport,
  onDelete,
  onEditDraft,
}) => {
  // Estado de expansão de cada seção. "Pago" recolhido por padrão.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    [BillingBatchStatus.PAID]: true,
  });

  // Filtro de período do histórico de lotes pagos, para não listar tudo de uma vez.
  const [paidPeriod, setPaidPeriod] = useState<PaidPeriodFilter>('3m');

  const toggleSection = (status: BillingBatchStatus) =>
    setCollapsed(prev => ({ ...prev, [status]: !prev[status] }));

  const formatMonthLabel = (yyyyMm: string): string | null => {
    if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return null;
    const [y, m] = yyyyMm.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]}/${y}`;
  };

  // Competência = mês/ano dos ATENDIMENTOS do lote (não a data de geração do faturamento).
  const getCompetenciaMonthKey = (batch: BillingBatch): string => {
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
    const fallbackMonth = batch.sentAt.substring(0, 7);
    if (/^\d{4}-\d{2}$/.test(fallbackMonth)) return fallbackMonth;
    return format(new Date(batch.sentAt), 'yyyy-MM');
  };

  const formatCompetencia = (batch: BillingBatch): string => {
    const monthKey = getCompetenciaMonthKey(batch);
    return formatMonthLabel(monthKey) || format(new Date(batch.sentAt), 'dd/MM/yyyy');
  };

  // Filtra lotes pagos por período (competência) para evitar listar todo o histórico de uma vez.
  const filterByPaidPeriod = (groupBatches: BillingBatch[]): BillingBatch[] => {
    if (paidPeriod === 'all') return groupBatches;
    const monthsBack = paidPeriod === '3m' ? 2 : paidPeriod === '6m' ? 5 : 11;
    const cutoffKey = format(subMonths(new Date(), monthsBack), 'yyyy-MM');
    return groupBatches.filter(b => getCompetenciaMonthKey(b) >= cutoffKey);
  };

  // ─── Renderiza uma linha de lote ─────────────────────────────────────
  const renderRow = (batch: BillingBatch) => {
    const isDraft = batch.status === BillingBatchStatus.DRAFT;
    const batchAppointments = appointments.filter(a => batch.appointmentIds.includes(a.id));
    const deniedCount = batchAppointments.filter(a => a.billingStatus === 'denied').length;
    // Recalculado ao vivo (mesma lógica do modal de Detalhes) em vez de ler
    // batch.totalAmount persistido, que pode ficar desatualizado se o preço
    // de algum atendimento mudar após o lote ser criado/enviado.
    const batchTotal = batchAppointments.reduce((sum, a) => sum + getAppPrice(a), 0);

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
            <p className="text-[10px] text-amber-600 mt-0.5">Lote Previsto</p>
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
            {formatCurrency(batchTotal)}
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
                  title="Excluir lote previsto"
                >
                  <Trash2 size={15} />
                </button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDetails(batch)}
                  className="text-xs"
                >
                  {batch.status === BillingBatchStatus.SENT || batch.status === BillingBatchStatus.PARTIALLY_PAID
                    ? 'Detalhes / Editar'
                    : 'Detalhes'}
                </Button>

                {(batch.status === BillingBatchStatus.SENT || batch.status === BillingBatchStatus.PARTIALLY_PAID) && (
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
  };

  // ─── Estado vazio ────────────────────────────────────────────────────
  if (batches.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
        <div className="text-zinc-400 mb-3">
          <FileText size={32} className="mx-auto opacity-40" />
        </div>
        <p className="text-sm text-zinc-500 font-medium">Nenhum lote criado ainda.</p>
        <p className="text-xs text-zinc-400 mt-1">Clique em "Novo Lote" para criar um Lote Previsto.</p>
      </div>
    );
  }

  const TableHead = () => (
    <thead>
      <tr className="bg-zinc-50/50 border-b border-zinc-100">
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lote</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Operadora</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Competência</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Atendimentos</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4">
      {STATUS_ORDER.map((status) => {
        const allGroupBatches = batches.filter(b => b.status === status);
        if (allGroupBatches.length === 0) return null;

        const isPaidGroup = status === BillingBatchStatus.PAID;
        const groupBatches = isPaidGroup ? filterByPaidPeriod(allGroupBatches) : allGroupBatches;

        const theme = STATUS_THEME[status];
        const isCollapsed = !!collapsed[status];
        const groupTotal = groupBatches.reduce((sum, b) => {
          const batchAppointments = appointments.filter(a => b.appointmentIds.includes(a.id));
          return sum + batchAppointments.reduce((s, a) => s + getAppPrice(a), 0);
        }, 0);
        const count = groupBatches.length;
        const totalCount = allGroupBatches.length;
        const isDraftGroup = status === BillingBatchStatus.DRAFT;

        return (
          <div
            key={status}
            className={`bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden border-l-4 ${theme.headerBorder}`}
          >
            {/* Cabeçalho clicável da seção */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleSection(status)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(status); } }}
              className={`w-full flex items-center justify-between gap-4 px-5 py-4 transition-colors cursor-pointer ${theme.headerBg}`}
            >
              <div className="flex items-center gap-3">
                <span className={`p-2 rounded-lg ${theme.iconWrap}`}>{theme.icon}</span>
                <div className="text-left">
                  <p className={`text-sm font-bold ${theme.headerText}`}>{theme.label}</p>
                  <p className="text-xs text-zinc-500">
                    {isPaidGroup && count !== totalCount
                      ? `${count} de ${totalCount} ${totalCount === 1 ? 'lote' : 'lotes'}`
                      : `${totalCount} ${totalCount === 1 ? 'lote' : 'lotes'}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {isPaidGroup && !isCollapsed && (
                  <select
                    value={paidPeriod}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPaidPeriod(e.target.value as PaidPeriodFilter)}
                    className="text-xs font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
                  >
                    {PAID_PERIOD_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
                    {isDraftGroup ? 'Previsão' : 'Subtotal'}
                  </p>
                  <p className={`text-sm font-bold ${theme.headerText}`}>{formatCurrency(groupTotal)}</p>
                </div>
                <ChevronDown
                  size={20}
                  className={`text-zinc-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                />
              </div>
            </div>

            {/* Corpo da seção */}
            {!isCollapsed && (
              groupBatches.length === 0 ? (
                <div className="px-6 py-8 text-center border-t border-zinc-100">
                  <p className="text-sm text-zinc-400">Nenhum lote pago neste período.</p>
                  <button
                    onClick={() => setPaidPeriod('all')}
                    className="text-xs font-medium text-priori-navy hover:underline mt-1"
                  >
                    Ver todo o histórico
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border-t border-zinc-100">
                  <table className="w-full text-left border-collapse">
                    <TableHead />
                    <tbody className="divide-y divide-zinc-50">
                      {groupBatches.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};
