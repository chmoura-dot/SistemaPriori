import React from 'react';
import { CheckCircle2, Clock, AlertCircle, Download, Trash2, Ban } from 'lucide-react';
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
}

export const BillingBatchTable: React.FC<Props> = ({
  batches,
  appointments,
  onDetails,
  onMarkAsPaid,
  onExport,
  onDelete,
}) => (
  <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-zinc-50/50 border-b border-zinc-100">
            <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lote</th>
            <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Operadora</th>
            <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Envio</th>
            <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Atendimentos</th>
            <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor Total</th>
            <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-5 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {batches.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-16 text-center">
                <div className="flex flex-col items-center justify-center text-zinc-400">
                  <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
                    <Ban size={32} className="text-zinc-300" />
                  </div>
                  <p className="text-lg font-medium text-zinc-600">Nenhum lote encontrado</p>
                  <p className="text-sm mt-1">Crie um novo lote para faturar os atendimentos.</p>
                </div>
              </td>
            </tr>
          ) : (
            batches.map((batch) => {
              const deniedCount = appointments.filter(
                a => batch.appointmentIds.includes(a.id) && a.billingStatus === 'denied'
              ).length;

              return (
                <tr key={batch.id} className="hover:bg-zinc-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-medium text-priori-navy">#{batch.batchNumber}</div>
                  </td>
                  <td className="px-6 py-4 text-zinc-600">{batch.healthPlan}</td>
                  <td className="px-6 py-4 text-zinc-600">
                    {format(new Date(batch.sentAt), 'dd/MM/yyyy')}
                  </td>
                  <td className="px-6 py-4 text-zinc-600">
                    {batch.appointmentIds.length} sessões
                  </td>
                  <td className="px-6 py-4 font-medium text-priori-navy">
                    {formatCurrency(batch.totalAmount)}
                  </td>
                  <td className="px-6 py-4">
                    {batch.status === BillingBatchStatus.PAID ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                          <CheckCircle2 size={12} className="mr-1" />
                          Pago em {format(new Date(batch.paidAt!), 'dd/MM/yyyy')}
                        </span>
                        {deniedCount > 0 && (
                          <div className="text-[10px] text-red-500 font-medium flex items-center gap-1">
                            <AlertCircle size={10} />
                            {deniedCount} glosa(s)
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-100">
                        <Clock size={12} className="mr-1" />
                        Enviado
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDetails(batch)}
                      className="text-priori-navy border-zinc-200"
                    >
                      Detalhes
                    </Button>
                    {batch.status === BillingBatchStatus.SENT && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onMarkAsPaid(batch)}
                        className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                      >
                        Registrar Pagamento
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExport(batch)}
                      className="text-priori-gold border-priori-gold/30 hover:bg-priori-gold/5"
                      title="Exportar Excel"
                    >
                      <Download size={16} />
                    </Button>
                    <button
                      onClick={() => onDelete(batch.id)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Excluir Lote"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  </div>
);
