import React from 'react';
import { AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { Appointment, Customer, Psychologist } from '../../services/types';
import { Modal } from '../../components/Modal';

interface RenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointments: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  onRenew: (appointment: Appointment) => void;
  onDismiss: (id: string) => void;
  isSaving: boolean;
}

export const RenewalModal: React.FC<RenewalModalProps> = ({
  isOpen,
  onClose,
  appointments,
  customers,
  psychologists,
  onRenew,
  onDismiss,
  isSaving,
}) => {
  if (!isOpen || appointments.length === 0) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Renovações Pendentes">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-amber-600 mb-4">
          <AlertCircle size={18} />
          <p className="text-sm font-medium">
            {appointments.length === 1
              ? 'Há 1 atendimento que precisa de renovação:'
              : `Há ${appointments.length} atendimentos que precisam de renovação:`}
          </p>
        </div>

        {appointments.map(appointment => {
          const customer = customers.find(c => c.id === appointment.customerId);
          const psychologist = psychologists.find(p => p.id === appointment.psychologistId);
          return (
            <div
              key={appointment.id}
              className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-priori-navy truncate">
                  {customer?.name || 'Paciente'}
                </p>
                <p className="text-xs text-zinc-500">
                  {psychologist?.name} • {appointment.startTime}-{appointment.endTime}
                </p>
                <p className="text-xs text-zinc-400">
                  {new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                  })}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => onRenew(appointment)}
                  disabled={isSaving}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={12} />
                  Renovar
                </button>
                <button
                  onClick={() => onDismiss(appointment.id)}
                  disabled={isSaving}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 text-zinc-500 text-xs font-bold rounded-lg hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                >
                  <XCircle size={12} />
                  Dispensar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
