import React, { useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface CustomerReactivationModalProps {
  isOpen: boolean;
  customerName: string;
  isSaving: boolean;
  onConfirm: (restoreRelated: boolean) => void;
  onClose: () => void;
}

export const CustomerReactivationModal: React.FC<CustomerReactivationModalProps> = ({
  isOpen,
  customerName,
  isSaving,
  onConfirm,
  onClose,
}) => {
  const [restoreRelated, setRestoreRelated] = useState(false);

  const handleClose = () => { setRestoreRelated(false); onClose(); };

  const options: { value: boolean; title: string; description: string }[] = [
    {
      value: false,
      title: 'Somente reativar o cadastro',
      description: 'Volta o paciente para Ativo. Consultas e assinaturas seguem como estão hoje.',
    },
    {
      value: true,
      title: 'Reativar e restaurar consultas/assinaturas',
      description: 'Além de reativar o cadastro, restaura as consultas futuras e assinaturas que foram canceladas/pausadas por essa mesma inativação.',
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Reativar Paciente">
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          Você está prestes a reativar <strong>{customerName}</strong>. Escolha o que fazer:
        </p>
        <div className="space-y-2">
          {options.map(opt => (
            <label key={String(opt.value)} className="flex items-start space-x-3 p-3 border border-zinc-200 rounded-lg cursor-pointer hover:bg-zinc-50">
              <input
                type="radio"
                name="reactivation_scope"
                checked={restoreRelated === opt.value}
                onChange={() => setRestoreRelated(opt.value)}
                className="mt-1 text-priori-navy focus:ring-priori-navy"
              />
              <span>
                <span className="block text-sm font-bold text-zinc-700">{opt.title}</span>
                <span className="block text-xs text-zinc-500">{opt.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(restoreRelated)}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSaving ? 'Reativando...' : 'Confirmar Reativação'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
