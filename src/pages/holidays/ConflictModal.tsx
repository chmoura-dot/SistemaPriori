import React from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { Appointment } from '../../services/types';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface Props {
  affectedAppointments: Appointment[];
  onClose: () => void;
  onConfirm: () => void;
}

export const ConflictModal: React.FC<Props> = ({ affectedAppointments, onClose, onConfirm }) => (
  <Modal
    isOpen={true}
    onClose={onClose}
    title="⚠️ Agendamentos no Período"
    footer={
      <div className="flex gap-3 w-full">
        <Button variant="outline" className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={onConfirm}>
          <Check size={16} className="mr-2" /> Salvar Mesmo Assim
        </Button>
      </div>
    }
  >
    <div className="space-y-4">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          Existem <strong>{affectedAppointments.length} agendamento(s)</strong> ativos neste período. A clínica ficará marcada como fechada, mas os agendamentos <strong>não serão cancelados automaticamente</strong>. Você precisará revisá-los manualmente na agenda.
        </p>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar">
        {affectedAppointments.slice(0, 10).map(a => (
          <div key={a.id} className="flex items-center justify-between p-2 bg-zinc-50 rounded-lg text-xs">
            <span className="font-bold text-priori-navy">{a.date}</span>
            <span className="text-zinc-500">{a.startTime} - {a.endTime}</span>
          </div>
        ))}
        {affectedAppointments.length > 10 && (
          <p className="text-xs text-zinc-400 text-center">... e mais {affectedAppointments.length - 10} agendamentos</p>
        )}
      </div>
    </div>
  </Modal>
);
