import React from 'react';
import { format } from 'date-fns';
import { BillingBatch, Appointment, Customer } from '../../services/types';
import { AppointmentPaymentStatus } from '../../hooks/useBillingData';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Input } from '../Input';
import { cn, formatCurrency } from '../../lib/utils';

interface Props {
  isOpen: boolean;
  batch: BillingBatch | null;
  appointments: Appointment[];
  customers: Customer[];
  appointmentStatuses: Record<string, AppointmentPaymentStatus>;
  getAppPrice: (app: Appointment) => number;
  onUpdateStatus: (id: string, update: Partial<AppointmentPaymentStatus>) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const RegisterPaymentModal: React.FC<Props> = ({
  isOpen,
  batch,
  appointments,
  customers,
  appointmentStatuses,
  getAppPrice,
  onUpdateStatus,
  onClose,
  onSubmit,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={`Registrar Pagamento - Lote #${batch?.batchNumber}`}
    className="max-w-4xl"
  >
    {batch && (
      <div className="space-y-6">
        <p className="text-sm text-zinc-500">
          Indique o status de cada atendimento deste lote. Para glosas, informe o motivo e a resolução.
        </p>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {batch.appointmentIds.map(id => {
            const app = appointments.find(a => a.id === id);
            const customer = customers.find(c => c.id === app?.customerId);
            const statusData = appointmentStatuses[id] || { status: 'paid' };

            return (
              <div key={id} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-priori-navy">{customer?.name}</div>
                    <div className="text-xs text-zinc-500">
                      {app ? format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy') : ''} •{' '}
                      {formatCurrency(app ? getAppPrice(app) : 0)}
                    </div>
                  </div>
                  <div className="flex bg-white rounded-xl border border-zinc-200 p-1">
                    <button
                      onClick={() => onUpdateStatus(id, { status: 'paid' })}
                      className={cn(
                        'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                        statusData.status === 'paid'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'text-zinc-500 hover:bg-zinc-50'
                      )}
                    >
                      Pago
                    </button>
                    <button
                      onClick={() => onUpdateStatus(id, { status: 'denied', resolution: 'accepted' })}
                      className={cn(
                        'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                        statusData.status === 'denied'
                          ? 'bg-red-500 text-white shadow-sm'
                          : 'text-zinc-500 hover:bg-zinc-50'
                      )}
                    >
                      Glosa
                    </button>
                  </div>
                </div>

                {statusData.status === 'denied' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                        Motivo da Glosa
                      </label>
                      <Input
                        placeholder="Ex: Falta de guia, Código inválido..."
                        value={statusData.reason || ''}
                        onChange={(e) => onUpdateStatus(id, { reason: e.target.value })}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                        Resolução
                      </label>
                      <select
                        value={statusData.resolution}
                        onChange={(e) => onUpdateStatus(id, { resolution: e.target.value as 'accepted' | 'appealed' })}
                        className="w-full h-9 rounded-xl border-zinc-200 bg-white text-xs focus:ring-priori-navy focus:border-priori-navy"
                      >
                        <option value="accepted">Aceite (Perda)</option>
                        <option value="appealed">Recursada (Em recurso)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} className="bg-priori-navy">
            Confirmar Recebimento do Lote
          </Button>
        </div>
      </div>
    )}
  </Modal>
);
