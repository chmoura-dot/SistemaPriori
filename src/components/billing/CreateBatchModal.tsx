import React from 'react';
import { Ban } from 'lucide-react';
import { format } from 'date-fns';
import { HealthPlan, Appointment, Customer, Psychologist } from '../../services/types';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Input } from '../Input';
import { cn, formatCurrency } from '../../lib/utils';

type NeuropsicoStatus =
  | { type: 'regular' }
  | { type: 'billable'; diffDays?: number }
  | { type: 'blocked'; diffDays: number }
  | { type: 'ask'; diffDays: number };

interface Props {
  isOpen: boolean;
  selectedPlan: HealthPlan;
  batchNumber: string;
  patientFilter: string;
  selectedAppointmentIds: string[];
  neuropsicoDecisions: Record<string, boolean>;
  customers: Customer[];
  psychologists: Psychologist[];
  eligibleAppointments: Appointment[];
  totalSelectedAmount: number;
  getNeuropsicoStatus: (app: Appointment) => NeuropsicoStatus;
  getAppPrice: (app: Appointment) => number;
  onClose: () => void;
  onPlanChange: (plan: HealthPlan) => void;
  onBatchNumberChange: (value: string) => void;
  onPatientFilterChange: (value: string) => void;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onConfirmAppointment: (id: string, e: React.MouseEvent) => void;
  onIgnoreAppointment: (id: string, e: React.MouseEvent) => void;
  onToggleNeuropsico: (id: string, value: boolean) => void;
  onSubmit: () => void;
}

export const CreateBatchModal: React.FC<Props> = ({
  isOpen,
  selectedPlan,
  batchNumber,
  patientFilter,
  selectedAppointmentIds,
  neuropsicoDecisions,
  customers,
  psychologists,
  eligibleAppointments,
  totalSelectedAmount,
  getNeuropsicoStatus,
  getAppPrice,
  onClose,
  onPlanChange,
  onBatchNumberChange,
  onPatientFilterChange,
  onToggleSelection,
  onSelectAll,
  onConfirmAppointment,
  onIgnoreAppointment,
  onToggleNeuropsico,
  onSubmit,
}) => {
  const filteredAppointments = patientFilter.trim()
    ? eligibleAppointments.filter(app => {
        const customer = customers.find(c => c.id === app.customerId);
        return customer?.name?.toLowerCase().includes(patientFilter.toLowerCase());
      })
    : eligibleAppointments;

  const allSelected = filteredAppointments.length > 0 &&
    selectedAppointmentIds.length === eligibleAppointments.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Lote de Faturamento"
      className="max-w-4xl"
    >
      <div className="space-y-6">
        {/* Operadora */}
        <div>
          <label className="block text-sm font-medium text-priori-navy mb-1">Operadora</label>
          <select
            value={selectedPlan}
            onChange={(e) => onPlanChange(e.target.value as HealthPlan)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy"
          >
            {Object.values(HealthPlan).map(plan => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
          </select>
        </div>

        {/* Lista de Atendimentos */}
        <div className="border-t border-zinc-100 pt-4">
          {/* Filtro por paciente */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Filtrar por paciente..."
              value={patientFilter}
              onChange={(e) => onPatientFilterChange(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h4 className="font-semibold text-priori-navy">Atendimentos Disponíveis</h4>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-zinc-500 font-medium">
                {selectedAppointmentIds.length} selecionados
              </div>
              {eligibleAppointments.length > 0 && (
                <button
                  onClick={onSelectAll}
                  className="text-priori-navy hover:text-priori-navy/80 hover:underline font-semibold"
                >
                  {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto border border-zinc-100 rounded-xl divide-y divide-zinc-100">
            {filteredAppointments.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">
                {patientFilter.trim()
                  ? 'Nenhum atendimento encontrado para este paciente.'
                  : 'Nenhum atendimento confirmado encontrado para esta operadora.'}
              </div>
            ) : (
              filteredAppointments.map(app => {
                const customer = customers.find(c => c.id === app.customerId);
                const psychologist = psychologists.find(p => p.id === app.psychologistId);
                const neuropsicoStatus = getNeuropsicoStatus(app);
                const basePrice = getAppPrice(app);
                const isConfirmed = app.confirmedPsychologist === true;

                return (
                  <div key={app.id} className="flex flex-col border-b border-zinc-100 last:border-0">
                    <div
                      className={cn(
                        'flex items-center gap-4 p-3 hover:bg-zinc-50 transition-colors',
                        selectedAppointmentIds.includes(app.id) && 'bg-priori-navy/5',
                        isConfirmed ? 'cursor-pointer' : 'opacity-75 cursor-not-allowed bg-zinc-50/50'
                      )}
                      onClick={() => isConfirmed && onToggleSelection(app.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAppointmentIds.includes(app.id)}
                        disabled={!isConfirmed}
                        onChange={() => {}}
                        className="rounded border-zinc-300 text-priori-navy focus:ring-priori-navy disabled:opacity-50"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-priori-navy truncate flex items-center gap-2">
                          {customer?.name}
                          {neuropsicoStatus.type === 'blocked' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                              Neuropsico R$0 (último há {neuropsicoStatus.diffDays} dias)
                            </span>
                          )}
                          {neuropsicoStatus.type === 'ask' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                              ⚠️ Neuropsico (último há {neuropsicoStatus.diffDays} dias)
                            </span>
                          )}
                          {!isConfirmed && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                              Aguardando confirmação
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          {psychologist?.name} •{' '}
                          {format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy')} •{' '}
                          {app.startTime}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-priori-navy mr-2">
                        {formatCurrency(basePrice)}
                      </div>
                      {!isConfirmed && (
                        <Button
                          size="sm"
                          onClick={(e) => onConfirmAppointment(app.id, e)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-xs px-3 h-8 mr-2"
                        >
                          Confirmar
                        </Button>
                      )}
                      <button
                        onClick={(e) => onIgnoreAppointment(app.id, e)}
                        className="p-1.5 text-zinc-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                        title="Ignorar para faturamento"
                      >
                        <Ban size={15} />
                      </button>
                    </div>

                    {neuropsicoStatus.type === 'ask' && (
                      <div className="bg-amber-50/50 px-11 py-2 flex items-center gap-3 text-xs border-t border-amber-100/50">
                        <span className="text-amber-700 font-medium">Cobrar este atendimento?</span>
                        <div className="flex bg-white rounded-lg border border-amber-200 p-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleNeuropsico(app.id, false); }}
                            className={cn(
                              'px-3 py-1 font-semibold rounded-md transition-all',
                              !neuropsicoDecisions[app.id]
                                ? 'bg-amber-100 text-amber-800 shadow-sm'
                                : 'text-zinc-500 hover:bg-zinc-50'
                            )}
                          >
                            Não cobrar (R$ 0)
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleNeuropsico(app.id, true); }}
                            className={cn(
                              'px-3 py-1 font-semibold rounded-md transition-all',
                              neuropsicoDecisions[app.id]
                                ? 'bg-priori-navy text-white shadow-sm'
                                : 'text-zinc-500 hover:bg-zinc-50'
                            )}
                          >
                            Cobrar normal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Somatório dinâmico */}
          {selectedAppointmentIds.length > 0 && (
            <div className="mt-3 flex items-center justify-between px-4 py-3 bg-priori-navy/5 rounded-xl border border-priori-navy/10">
              <span className="text-sm font-medium text-priori-navy">
                Total selecionado ({selectedAppointmentIds.length}{' '}
                {selectedAppointmentIds.length === 1 ? 'atendimento' : 'atendimentos'})
              </span>
              <span className="text-lg font-bold text-priori-navy">
                {formatCurrency(totalSelectedAmount)}
              </span>
            </div>
          )}
        </div>

        {/* Número do Lote + Ações */}
        <div className="border-t border-zinc-100 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-priori-navy mb-1">
                Número do Lote / Protocolo
              </label>
              <Input
                placeholder="Ex: 20240311-01"
                value={batchNumber}
                onChange={(e) => onBatchNumberChange(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={onSubmit}
                disabled={!batchNumber || selectedAppointmentIds.length === 0}
                className="bg-priori-navy hover:bg-priori-navy/90"
              >
                Gerar Lote de Faturamento
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
