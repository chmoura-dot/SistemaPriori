import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, AlertCircle, Download, Trash2, Edit2, Send, FileText, ChevronDown, Search, List, Building2 } from 'lucide-react';
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
  chipCls: string;
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
    chipCls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  [BillingBatchStatus.SENT]: {
    label: 'Faturamento Confirmado',
    icon: <Clock size={16} />,
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
    headerBg: 'bg-blue-50/60 hover:bg-blue-50',
    headerBorder: 'border-l-blue-400',
    headerText: 'text-blue-800',
    iconWrap: 'bg-blue-100 text-blue-600',
    chipCls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  [BillingBatchStatus.PARTIALLY_PAID]: {
    label: 'Parcialmente Pagos',
    icon: <Clock size={16} />,
    badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    headerBg: 'bg-indigo-50/60 hover:bg-indigo-50',
    headerBorder: 'border-l-indigo-400',
    headerText: 'text-indigo-800',
    iconWrap: 'bg-indigo-100 text-indigo-600',
    chipCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  [BillingBatchStatus.PAID]: {
    label: 'Pagos pelo Plano',
    icon: <CheckCircle2 size={16} />,
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    headerBg: 'bg-emerald-50/60 hover:bg-emerald-50',
    headerBorder: 'border-l-emerald-400',
    headerText: 'text-emerald-800',
    iconWrap: 'bg-emerald-100 text-emerald-600',
    chipCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

// Ordem fixa seguindo o fluxo do dinheiro
const STATUS_ORDER: BillingBatchStatus[] = [
  BillingBatchStatus.DRAFT,
  BillingBatchStatus.SENT,
  BillingBatchStatus.PARTIALLY_PAID,
  BillingBatchStatus.PAID,
];

// Rótulo curto (singular/plural) para os chips de contagem por status (visão "Por operadora").
const STATUS_SHORT_LABEL: Record<BillingBatchStatus, [string, string]> = {
  [BillingBatchStatus.DRAFT]: ['previsto', 'previstos'],
  [BillingBatchStatus.SENT]: ['confirmado', 'confirmados'],
  [BillingBatchStatus.PARTIALLY_PAID]: ['parcial', 'parciais'],
  [BillingBatchStatus.PAID]: ['pago', 'pagos'],
};

const STATUS_FILTER_OPTIONS: { value: 'all' | BillingBatchStatus; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: BillingBatchStatus.DRAFT, label: 'Previstos' },
  { value: BillingBatchStatus.SENT, label: 'Confirmados' },
  { value: BillingBatchStatus.PARTIALLY_PAID, label: 'Parciais' },
  { value: BillingBatchStatus.PAID, label: 'Pagos' },
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
type PaidPeriodFilter = '1m' | '3m' | '6m' | '1y' | 'all';

const PAID_PERIOD_OPTIONS: { value: PaidPeriodFilter; label: string }[] = [
  { value: '1m', label: 'Último mês' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '1y', label: 'Último ano' },
  { value: 'all', label: 'Ver tudo' },
];

type ViewMode = 'status' | 'operadora';

const normalize = (value: string): string =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

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
  // Estado de expansão de cada operadora na visão "Por operadora" (todas fechadas por padrão).
  const [openOperadoras, setOpenOperadoras] = useState<Record<string, boolean>>({});

  // Filtro de período do histórico de lotes pagos, para não listar tudo de uma vez.
  const [paidPeriod, setPaidPeriod] = useState<PaidPeriodFilter>('1m');

  // ─── Busca / filtro de status / alternância de visão ──────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BillingBatchStatus>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('status');

  const toggleSection = (status: BillingBatchStatus) =>
    setCollapsed(prev => ({ ...prev, [status]: !prev[status] }));

  const toggleOperadora = (op: string) =>
    setOpenOperadoras(prev => ({ ...prev, [op]: !prev[op] }));

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

  // Mês/ano em que o repasse foi de fato registrado como pago. Sem paidAt
  // (não deveria ocorrer em lotes PAID, mas o campo é opcional no tipo),
  // cai para sentAt como aproximação.
  const getPaidMonthKey = (batch: BillingBatch): string => {
    const paidAt = batch.paidAt || batch.sentAt;
    const month = paidAt.substring(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) return month;
    return format(new Date(paidAt), 'yyyy-MM');
  };

  // Filtra lotes pagos por período (data do pagamento) para evitar listar todo o histórico de uma vez.
  const filterByPaidPeriod = (groupBatches: BillingBatch[]): BillingBatch[] => {
    if (paidPeriod === 'all') return groupBatches;
    const monthsBack = paidPeriod === '1m' ? 0 : paidPeriod === '3m' ? 2 : paidPeriod === '6m' ? 5 : 11;
    const cutoffKey = format(subMonths(new Date(), monthsBack), 'yyyy-MM');
    return groupBatches.filter(b => getPaidMonthKey(b) >= cutoffKey);
  };

  // ─── Filtro de busca + status (toolbar), aplicado antes de agrupar ─────
  const visibleBatches = useMemo(() => {
    const term = normalize(search);
    return batches.filter(b => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (term && !(normalize(b.batchNumber).includes(term) || normalize(b.healthPlan).includes(term))) return false;
      return true;
    });
  }, [batches, search, statusFilter]);

  // ─── Renderiza uma linha de lote ─────────────────────────────────────
  const renderRow = (batch: BillingBatch, hideOperadora = false) => {
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
        {!hideOperadora && (
          <td className="px-6 py-4">
            <span className="text-sm text-zinc-700">{batch.healthPlan}</span>
          </td>
        )}
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

  // ─── Estado vazio (nenhum lote existe no sistema) ─────────────────────
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

  const TableHead: React.FC<{ hideOperadora?: boolean }> = ({ hideOperadora }) => (
    <thead>
      <tr className="bg-zinc-50/50 border-b border-zinc-100">
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lote</th>
        {!hideOperadora && (
          <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Operadora</th>
        )}
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Competência</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Atendimentos</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
        <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
      </tr>
    </thead>
  );

  // ─── Toolbar: busca, filtro de status e alternância de visão ──────────
  const Toolbar = (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-2.5 flex flex-wrap items-center gap-2.5">
      <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
        <Search size={15} className="text-zinc-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por lote ou operadora…"
          className="bg-transparent outline-none text-sm w-full placeholder:text-zinc-400"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`text-xs font-semibold px-3 py-2 rounded-full border transition-colors whitespace-nowrap ${
              statusFilter === opt.value
                ? 'bg-priori-navy border-priori-navy text-white'
                : 'bg-white border-zinc-200 text-zinc-500 hover:border-priori-navy/40 hover:text-priori-navy'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex border border-zinc-200 rounded-xl overflow-hidden shrink-0">
        <button
          onClick={() => setViewMode('status')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 transition-colors ${
            viewMode === 'status' ? 'bg-priori-navy text-white' : 'bg-white text-zinc-500 hover:bg-zinc-50'
          }`}
        >
          <List size={13} />
          Por status
        </button>
        <button
          onClick={() => setViewMode('operadora')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 transition-colors ${
            viewMode === 'operadora' ? 'bg-priori-navy text-white' : 'bg-white text-zinc-500 hover:bg-zinc-50'
          }`}
        >
          <Building2 size={13} />
          Por operadora
        </button>
      </div>
    </div>
  );

  // ─── Nenhum resultado para o filtro/busca atual ────────────────────────
  if (visibleBatches.length === 0) {
    return (
      <div className="space-y-4">
        {Toolbar}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
          <p className="text-sm text-zinc-500 font-medium">Nenhum lote encontrado para esse filtro.</p>
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); }}
            className="text-xs font-medium text-priori-navy hover:underline mt-2"
          >
            Limpar filtros
          </button>
        </div>
      </div>
    );
  }

  // ─── Visão "Por status" (padrão, agrupada por etapa do fluxo) ─────────
  const renderByStatus = () => (
    <>
      {STATUS_ORDER.map((status) => {
        const allGroupBatches = visibleBatches.filter(b => b.status === status);
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
                      {groupBatches.map(b => renderRow(b))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        );
      })}
    </>
  );

  // ─── Visão "Por operadora" (agrupada por plano de saúde) ──────────────
  const renderByOperadora = () => {
    const operadoras = Array.from(new Set(visibleBatches.map(b => b.healthPlan))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );

    return (
      <>
        {operadoras.map(op => {
          const opBatches = visibleBatches
            .filter(b => b.healthPlan === op)
            .sort((a, b) => (b.paidAt || b.sentAt).localeCompare(a.paidAt || a.sentAt));

          const pendente = opBatches
            .filter(b => b.status === BillingBatchStatus.SENT || b.status === BillingBatchStatus.PARTIALLY_PAID)
            .reduce((sum, b) => sum + appointments.filter(a => b.appointmentIds.includes(a.id)).reduce((s, a) => s + getAppPrice(a), 0), 0);
          const pago = opBatches
            .filter(b => b.status === BillingBatchStatus.PAID)
            .reduce((sum, b) => sum + appointments.filter(a => b.appointmentIds.includes(a.id)).reduce((s, a) => s + getAppPrice(a), 0), 0);
          const glosas = opBatches.reduce(
            (sum, b) => sum + appointments.filter(a => b.appointmentIds.includes(a.id) && a.billingStatus === 'denied').length,
            0
          );
          const isOpen = !!openOperadoras[op];
          const statusCounts = STATUS_ORDER
            .map(s => ({ status: s, n: opBatches.filter(b => b.status === s).length }))
            .filter(x => x.n > 0);

          return (
            <div key={op} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleOperadora(op)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOperadora(op); } }}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 cursor-pointer hover:bg-zinc-50/60 transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-bold text-priori-navy">{op}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {statusCounts.map(({ status, n }) => (
                      <span
                        key={status}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_THEME[status].chipCls}`}
                      >
                        {n} {STATUS_SHORT_LABEL[status][n > 1 ? 1 : 0]}
                      </span>
                    ))}
                    {glosas > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200">
                        {glosas} glosa{glosas > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Pendente</p>
                    <p className="text-sm font-bold text-blue-700">{formatCurrency(pendente)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Recebido</p>
                    <p className="text-sm font-bold text-emerald-700">{formatCurrency(pago)}</p>
                  </div>
                  <ChevronDown
                    size={20}
                    className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>

              {isOpen && (
                <div className="overflow-x-auto border-t border-zinc-100">
                  <table className="w-full text-left border-collapse">
                    <TableHead hideOperadora />
                    <tbody className="divide-y divide-zinc-50">
                      {opBatches.map(b => renderRow(b, true))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {Toolbar}
      {viewMode === 'status' ? renderByStatus() : renderByOperadora()}
    </div>
  );
};
