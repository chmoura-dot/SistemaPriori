import React, { useState } from 'react';
import { Download, Pencil, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { BillingBatch, BillingBatchStatus, Appointment, Customer, Psychologist, HealthPlan } from '../../services/types';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { formatCurrency, cn } from '../../lib/utils';

interface Props {
  batch: BillingBatch | null;
  appointments: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  getAppPrice: (app: Appointment) => number;
  onUpdatePrice?: (appointmentId: string, newPrice: number) => Promise<void>;
  onClose: () => void;
  onExport: (batch: BillingBatch) => void;
}

export const BatchDetailsModal: React.FC<Props> = ({
  batch,
  appointments,
  customers,
  psychologists,
  getAppPrice,
  onUpdatePrice,
  onClose,
  onExport,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (id: string, currentPrice: number) => {
    setEditingId(id);
    setEditValue(String(currentPrice));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const confirmEdit = async (id: string) => {
    const parsed = parseFloat(editValue.replace(',', '.'));
    if (isNaN(parsed) || parsed < 0) { cancelEdit(); return; }
    if (onUpdatePrice) await onUpdatePrice(id, parsed);
    setEditingId(null);
    setEditValue('');
  };

  return (
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
                {formatCurrency(
                  batch.appointmentIds.reduce((sum, id) => {
                    const app = appointments.find(a => a.id === id);
                    return sum + (app ? getAppPrice(app) : 0);
                  }, 0)
                )}
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
                const price = app ? getAppPrice(app) : 0;
                const isParticular = customer?.healthPlan === HealthPlan.PARTICULAR;
                const isEditing = editingId === id;

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
                      <div className="text-right flex items-center gap-1.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-zinc-400">R$</span>
                            <input
                              type="text"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') confirmEdit(id);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              autoFocus
                              className="w-20 text-right text-sm font-medium border border-priori-navy/30 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-priori-navy"
                            />
                            <button
                              onClick={() => confirmEdit(id)}
                              className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Confirmar"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-0.5 text-red-400 hover:bg-red-50 rounded transition-colors"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-priori-navy">
                              {formatCurrency(price)}
                            </div>
                            {isParticular && onUpdatePrice && (
                              <button
                                onClick={() => startEdit(id, price)}
                                className="p-0.5 text-zinc-300 hover:text-priori-navy hover:bg-priori-navy/5 rounded transition-colors"
                                title="Corrigir valor deste atendimento"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {!isEditing && app?.billingStatus && (
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider text-right',
                        app.billingStatus === 'paid' ? 'text-emerald-600' : 'text-red-500'
                      )}>
                        {app.billingStatus === 'paid' ? 'Pago' : 'Glosa'}
                      </span>
                    )}
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
};
