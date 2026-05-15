import React from 'react';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { BillingBatch, BillingBatchStatus, Appointment, Customer, Psychologist } from '../../services/types';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { formatCurrency, cn } from '../../lib/utils';

interface Props {
  batch: BillingBatch | null;
  appointments: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  getAppPrice: (app: Appointment) => number;
  onClose: () => void;
  onExport: (batch: BillingBatch) => void;
}

export const BatchDetailsModal: React.FC<Props> = ({
  batch,
  appointments,
  customers,
  psychologists,
  getAppPrice,
  onClose,
  onExport,
}) => (
  <Modal
    isOpen={!!batch}
    onClose={onClose}
    title={`Detalhes do Lote #${batch?.batchNumber}`}
    className="max-w-2xl"
  >
    {batch && (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500 block">Operadora</span>
            <span className="font-medium text-priori-navy">{batch.healthPlan}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Data de Envio</span>
            <span className="font-medium text-priori-navy">
              {format(new Date(batch.sentAt), 'dd/MM/yyyy')}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Status</span>
            <span className="font-medium text-priori-navy">
              {batch.status === BillingBatchStatus.PAID ? 'Pago' : 'Enviado'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Valor Total</span>
            <span className="font-medium text-priori-navy">
              {formatCurrency(batch.totalAmount)}
            </span>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-4">
          <h4 className="font-semibold text-priori-navy mb-3">Atendimentos no Lote</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {batch.appointmentIds.map(id => {
              const app = appointments.find(a => a.id === id);
              const customer = customers.find(c => c.id === app?.customerId);
              const psychologist = psychologists.find(p => p.id === app?.psychologistId);

              return (
                <div key={id} className="flex flex-col p-3 bg-zinc-50 rounded-xl text-sm gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-priori-navy">{customer?.name}</div>
                      <div className="text-xs text-zinc-500">
                        {psychologist?.name} •{' '}
                        {app ? format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy') : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-priori-navy">
                        {formatCurrency(app ? getAppPrice(app) : 0)}
                      </div>
                      {app?.billingStatus && (
                        <span className={cn(
                          'text-[10px] font-bold uppercase tracking-wider',
                          app.billingStatus === 'paid' ? 'text-emerald-600' : 'text-red-500'
                        )}>
                          {app.billingStatus === 'paid' ? 'Pago' : 'Glosa'}
                        </span>
                      )}
                    </div>
                  </div>
                  {app?.billingStatus === 'denied' && (
                    <div className="mt-1 p-2 bg-red-50 rounded-lg border border-red-100 text-xs">
                      <div className="font-semibold text-red-700">Motivo: {app.denialReason}</div>
                      <div className="text-red-600 mt-0.5">
                        Resolução: {app.denialResolution === 'appealed' ? 'Recursada' : 'Aceite'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-zinc-100">
          <Button
            variant="outline"
            onClick={() => onExport(batch)}
            className="text-priori-gold border-priori-gold/50"
          >
            <Download size={18} className="mr-2" />
            Exportar Excel
          </Button>
          <Button onClick={onClose} className="bg-priori-navy">
            Fechar
          </Button>
        </div>
      </div>
    )}
  </Modal>
);
