import React, { useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface CustomerInactivationModalProps {
  isOpen: boolean;
  customerName: string;
  isSaving: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const INACTIVATION_REASONS = [
  'Alta terapêutica',
  'Solicitação do paciente',
  'Mudança de convênio',
  'Mudança de cidade / estado',
  'Motivos financeiros',
  'Óbito',
  'Outro',
];

export const CustomerInactivationModal: React.FC<CustomerInactivationModalProps> = ({
  isOpen,
  customerName,
  isSaving,
  onConfirm,
  onClose,
}) => {
  const [reason, setReason] = useState('');

  const handleClose = () => { setReason(''); onClose(); };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Inativar Paciente">
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">
          Você está prestes a inativar <strong>{customerName}</strong>. Selecione o motivo:
        </p>
        <div className="space-y-2">
          {INACTIVATION_REASONS.map(r => (
            <label key={r} className="flex items-center space-x-3 p-3 border border-zinc-200 rounded-lg cursor-pointer hover:bg-zinc-50">
              <input
                type="radio"
                name="inactivation_reason"
                value={r}
                checked={reason === r}
                onChange={e => setReason(e.target.value)}
                className="text-priori-navy focus:ring-priori-navy"
              />
              <span className="text-sm text-zinc-700">{r}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>Cancelar</Button>
          <Button
            onClick={() => { if (reason) { onConfirm(reason); setReason(''); } }}
            disabled={!reason || isSaving}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSaving ? 'Inativando...' : 'Confirmar Inativação'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
