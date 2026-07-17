import React from 'react';
import { Modal } from '../../components/Modal';
import { Appointment } from '../../services/types';

export type CancellationChoice = 'plan' | 'particular' | 'none' | 'discharge' | 'psychologist_absence';

interface Props {
  app: Appointment | undefined;
  onClose: () => void;
  onConfirm: (billing: CancellationChoice) => void;
}

export const CancellationBillingModal: React.FC<Props> = ({ app, onClose, onConfirm }) => {
  if (!app) return null;

  const options: { value: CancellationChoice; label: string; desc: string; color: string }[] = [
    { value: 'plan',       label: 'Falta do Paciente — Cobrar Convênio',    desc: 'O paciente faltou. Cobra do plano e repassa ao psicólogo normalmente',          color: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100' },
    { value: 'particular', label: 'Falta do Paciente — Cobrar Particular',  desc: 'O paciente faltou. Cobra diretamente do paciente e repassa ao psicólogo',    color: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' },
    { value: 'none',       label: 'Falta do Paciente — Não Cobrar (Isento)', desc: 'O paciente faltou, mas não haverá cobrança. Repasse mantido ao psicólogo',    color: 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100' },
    { value: 'psychologist_absence', label: 'Falta do Psicólogo', desc: 'O profissional não compareceu. NÃO cobra e NÃO repassa', color: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100' },
    { value: 'discharge',  label: 'Alta / Interrompeu Tratamento', desc: 'Todos os agendamentos futuros deste paciente serão cancelados', color: 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100' },
  ];

  return (
    <Modal isOpen onClose={onClose} title="Registrar Cancelamento / Falta">
      <div className="space-y-3 pt-2">
        <p className="text-sm text-zinc-500">De quem foi a falta e como deseja registrar?</p>
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onConfirm(opt.value)}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-all font-semibold ${opt.color}`}
          >
            <span className="block text-sm font-bold">{opt.label}</span>
            <span className="block text-xs font-normal mt-0.5 opacity-75">{opt.desc}</span>
          </button>
        ))}
        <button
          onClick={onClose}
          className="w-full text-center text-xs text-zinc-400 hover:text-zinc-600 pt-2 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
};
