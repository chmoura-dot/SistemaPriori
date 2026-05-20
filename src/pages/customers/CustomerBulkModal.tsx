import React, { useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Customer, HealthPlan, Psychologist } from '../../services/types';

interface CustomerBulkModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomers: Customer[];
  psychologists: Psychologist[];
  isSaving: boolean;
  onApply: (changes: { healthPlan?: HealthPlan; psychologistId?: string }) => void;
}

export const CustomerBulkModal: React.FC<CustomerBulkModalProps> = ({
  isOpen,
  onClose,
  selectedCustomers,
  psychologists,
  isSaving,
  onApply,
}) => {
  const [healthPlan, setHealthPlan] = useState<HealthPlan | ''>('');
  const [psychologistId, setPsychologistId] = useState('');

  const handleClose = () => {
    setHealthPlan('');
    setPsychologistId('');
    onClose();
  };

  const handleApply = () => {
    const changes: { healthPlan?: HealthPlan; psychologistId?: string } = {};
    if (healthPlan) changes.healthPlan = healthPlan;
    if (psychologistId) changes.psychologistId = psychologistId;
    onApply(changes);
  };

  const input = 'w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all';
  const label = 'text-sm font-bold text-zinc-500 uppercase tracking-widest';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edição em Massa">
      <div className="space-y-5">
        <p className="text-sm text-zinc-600">
          Aplicar alterações a <strong>{selectedCustomers.length}</strong> paciente(s) selecionado(s).
          Apenas os campos preenchidos serão alterados.
        </p>

        <div className="space-y-1">
          <label className={label}>Mudar Convênio / Plano</label>
          <select className={input} value={healthPlan} onChange={e => setHealthPlan(e.target.value as HealthPlan)}>
            <option value="">— Manter atual —</option>
            {Object.values(HealthPlan).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className={label}>Mudar Psicólogo Responsável</label>
          <select className={input} value={psychologistId} onChange={e => setPsychologistId(e.target.value)}>
            <option value="">— Manter atual —</option>
            {psychologists.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {selectedCustomers.length > 0 && (
          <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl max-h-40 overflow-y-auto">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Pacientes selecionados:</p>
            {selectedCustomers.map(c => (
              <p key={c.id} className="text-sm text-priori-navy truncate">{c.name}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>Cancelar</Button>
          <Button
            onClick={handleApply}
            disabled={(!healthPlan && !psychologistId) || isSaving}
            className="bg-priori-navy text-white"
            isLoading={isSaving}
          >
            Aplicar a {selectedCustomers.length} Paciente(s)
          </Button>
        </div>
      </div>
    </Modal>
  );
};
