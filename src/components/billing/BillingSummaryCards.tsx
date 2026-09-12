import React from 'react';
import { CheckCircle2, Clock, AlertCircle, Edit2, ArrowUp, ArrowDown } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { Trend } from '../../hooks/billing/billingInsights';

interface Props {
  pendingCount: number;
  totalPendingAmount: number;
  totalPaidAmount: number;
  totalDenied: number;
  draftCount: number;
  totalDraftAmount: number;
  onOpenDenied?: () => void;
  confirmadoTrend?: Trend | null;
  pagoTrend?: Trend | null;
}

// Badge de tendência mensal (fluxo do mês corrente vs. mês anterior). Some
// quando não há dado suficiente (ex: menos de 2 meses de histórico).
const TrendBadge: React.FC<{ trend?: Trend | null }> = ({ trend }) => {
  if (!trend || trend.direction === 'flat') return null;
  const isUp = trend.direction === 'up';
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
      <Icon size={11} />
      {trend.pct}%
    </span>
  );
};

export const BillingSummaryCards: React.FC<Props> = ({
  pendingCount,
  totalPendingAmount,
  totalPaidAmount,
  totalDenied,
  draftCount,
  totalDraftAmount,
  onOpenDenied,
  confirmadoTrend,
  pagoTrend,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
    {/* Lotes Previstos */}
    <div className="bg-white rounded-2xl border border-amber-100 p-6 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
        <Edit2 size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">
          Lotes Previstos ({draftCount} {draftCount === 1 ? 'lote' : 'lotes'})
        </p>
        <h3 className="text-2xl font-bold text-priori-navy">
          {formatCurrency(totalDraftAmount)}
        </h3>
        <p className="text-xs text-amber-600 mt-0.5">Em edição</p>
      </div>
    </div>

    {/* Faturamento Confirmado */}
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
        <Clock size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">
          Faturamento Confirmado ({pendingCount} lotes)
        </p>
        <h3 className="text-2xl font-bold text-priori-navy">
          {formatCurrency(totalPendingAmount)}
        </h3>
        <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1.5">
          Previsão de Receita
          {confirmadoTrend && confirmadoTrend.direction !== 'flat' && (
            <>
              <span className="text-zinc-300">·</span>
              <TrendBadge trend={confirmadoTrend} />
              <span className="text-zinc-400">vs. mês anterior</span>
            </>
          )}
        </p>
      </div>
    </div>

    {/* Pago pelo Plano */}
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
        <CheckCircle2 size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">Pago pelo Plano</p>
        <h3 className="text-2xl font-bold text-priori-navy">
          {formatCurrency(totalPaidAmount)}
        </h3>
        {pagoTrend && pagoTrend.direction !== 'flat' && (
          <p className="text-xs mt-0.5 flex items-center gap-1.5">
            <TrendBadge trend={pagoTrend} />
            <span className="text-zinc-400">vs. mês anterior</span>
          </p>
        )}
      </div>
    </div>

    {/* Glosas */}
    <button
      type="button"
      onClick={onOpenDenied}
      disabled={!onOpenDenied}
      className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4 text-left transition-colors enabled:hover:bg-red-50/40 enabled:hover:border-red-200 enabled:cursor-pointer disabled:cursor-default"
      title={onOpenDenied ? 'Ver detalhes das glosas' : undefined}
    >
      <div className="p-3 bg-red-50 text-red-600 rounded-xl">
        <AlertCircle size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">Glosas Registradas</p>
        <h3 className="text-2xl font-bold text-priori-navy">
          {totalDenied} {totalDenied === 1 ? 'atendimento' : 'atendimentos'}
        </h3>
        {onOpenDenied && (
          <p className="text-xs text-red-600 mt-0.5">Ver motivos e status &rarr;</p>
        )}
      </div>
    </button>
  </div>
);
