import React from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

export interface ClosureFormData {
  startDate: string;
  endDate: string;
  reason: string;
}

interface Props {
  isOpen: boolean;
  editingClosureId: string | null;
  closureForm: ClosureFormData;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  setClosureForm: React.Dispatch<React.SetStateAction<ClosureFormData>>;
}

export const ClosureFormModal: React.FC<Props> = ({
  isOpen, editingClosureId, closureForm, isSaving, onClose, onSave, setClosureForm,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={editingClosureId ? 'Editar Período de Fechamento' : 'Novo Período de Fechamento'}
    footer={
      <div className="flex gap-3 w-full">
        <Button variant="outline" className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" isLoading={isSaving} onClick={onSave}>
          {editingClosureId ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    }
  >
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <p className="text-xs text-blue-700 font-medium">
          💡 Use esta seção para cadastrar o recesso de fim de ano, reformas, eventos ou qualquer período em que a clínica estará fechada.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Motivo / Nome do Período</label>
        <input type="text"
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
          placeholder="Ex: Recesso de Fim de Ano 2026" value={closureForm.reason}
          onChange={e => setClosureForm(f => ({ ...f, reason: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Data de Início</label>
          <input type="date"
            className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
            value={closureForm.startDate}
            onChange={e => setClosureForm(f => ({ ...f, startDate: e.target.value }))} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Data de Fim</label>
          <input type="date"
            className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
            value={closureForm.endDate} min={closureForm.startDate}
            onChange={e => setClosureForm(f => ({ ...f, endDate: e.target.value }))} required />
        </div>
      </div>
      {closureForm.startDate && closureForm.endDate && closureForm.endDate >= closureForm.startDate && (
        <div className="p-3 bg-priori-navy/5 border border-priori-navy/10 rounded-xl">
          <p className="text-xs text-priori-navy font-bold">
            📅 Período: {new Date(closureForm.startDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} até{' '}
            {new Date(closureForm.endDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' '}({Math.round((new Date(closureForm.endDate + 'T12:00:00').getTime() - new Date(closureForm.startDate + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)) + 1} dias)
          </p>
        </div>
      )}
    </div>
  </Modal>
);
