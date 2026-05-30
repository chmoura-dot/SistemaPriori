import React from 'react';
import { Modal } from '../../components/Modal';
import { Appointment } from '../../services/types';

interface Props {
  app: Appointment | undefined;
  onClose: () => void;
  onConfirm: (billing: 'plan' | 'particular' | 'none' | 'discharge') => void;
}

export const CancellationBillingModal: React.FC<Props> = ({ app, onClose, onConfirm }) => {
  if (!app) return null;

  const options: { value: 'plan' | 'particular' | 'none' | 'discharge'; label: string; desc: string; color: string }[] = [
    { value: 'plan',       label: 'Cobrar Convênio',    desc: 'A falta será cobrada ao plano de saúde',          color: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100' },
    { value: 'particular', label: 'Cobrar Particular',  desc: 'A falta será cobrada diretamente ao paciente',    color: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' },
    { value: 'none',       label: 'Não Cobrar (Isento)', desc: 'Nenhuma cobrança será feita por esta falta',    color: 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100' },
    { value: 'discharge',  label: 'Alta / Interrompeu Tratamento', desc: 'Todos os agendamentos futuros deste paciente serão cancelados', color: 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100' },
  ];

  return (
    <Modal isOpen onClose={onClose} title="Registrar Falta do Paciente">
      <div className="space-y-3 pt-2">
        <p className="text-sm text-zinc-500">Como deseja registrar esta falta?</p>
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
