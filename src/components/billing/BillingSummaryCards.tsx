import React from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface Props {
  pendingCount: number;
  totalPendingAmount: number;
  totalPaidAmount: number;
  totalDenied: number;
}

export const BillingSummaryCards: React.FC<Props> = ({
  pendingCount,
  totalPendingAmount,
  totalPaidAmount,
  totalDenied,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
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
