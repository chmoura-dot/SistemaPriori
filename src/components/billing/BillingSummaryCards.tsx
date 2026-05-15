import React from 'react';
import { CheckCircle2, Clock, AlertCircle, Edit2 } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface Props {
  pendingCount: number;
  totalPendingAmount: number;
  totalPaidAmount: number;
  totalDenied: number;
  draftCount: number;
  totalDraftAmount: number;
}

export const BillingSummaryCards: React.FC<Props> = ({
  pendingCount,
  totalPendingAmount,
  totalPaidAmount,
  totalDenied,
  draftCount,
  totalDraftAmount,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
    {/* Rascunhos em aberto */}
    <div className="bg-white rounded-2xl border border-amber-100 p-6 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
        <Edit2 size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">
          Rascunhos ({draftCount} {draftCount === 1 ? 'lote' : 'lotes'})
        </p>
        <h3 className="text-2xl font-bold text-priori-navy">
          {formatCurrency(totalDraftAmount)}
        </h3>
        <p className="text-xs text-amber-600 mt-0.5">Previsão de faturamento</p>
      </div>
    </div>

    {/* A Receber */}
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
        <Clock size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">
          A Receber ({pendingCount} lotes)
        </p>
        <h3 className="text-2xl font-bold text-priori-navy">
          {formatCurrency(totalPendingAmount)}
        </h3>
      </div>
    </div>

    {/* Total Recebido */}
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
        <CheckCircle2 size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">Total Recebido</p>
        <h3 className="text-2xl font-bold text-priori-navy">
          {formatCurrency(totalPaidAmount)}
        </h3>
      </div>
    </div>

    {/* Glosas */}
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-red-50 text-red-600 rounded-xl">
        <AlertCircle size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">Glosas Registradas</p>
        <h3 className="text-2xl font-bold text-priori-navy">
          {totalDenied} {totalDenied === 1 ? 'atendimento' : 'atendimentos'}
        </h3>
      </div>
    </div>
  </div>
);
