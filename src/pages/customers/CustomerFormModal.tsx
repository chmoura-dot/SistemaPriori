import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Customer, HealthPlan, Psychologist } from '../../services/types';
import { cn } from '../../lib/utils';

export type CustomerFormData = {
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: string;
  healthPlan: HealthPlan;
  psychologistId: string;
  customPrice: number | undefined;
  customRepassAmount: number | undefined;
  notes: string;
  amsPassword: string;
  amsPasswordExpiry: string;
};

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
  formData: CustomerFormData;
  setFormData: React.Dispatch<React.SetStateAction<CustomerFormData>>;
  handleSubmit: (e: React.FormEvent) => void;
  isSaving: boolean;
  psychologists: Psychologist[];
  existingCustomers: Customer[];
  onInactivate?: () => void;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  editingId,
  formData,
  setFormData,
  handleSubmit,
  isSaving,
  psychologists,
  existingCustomers,
  onInactivate,
}) => {
  const nameUpper = formData.name.trim().toUpperCase();
  const duplicateWarning =
    nameUpper.length > 3 &&
    existingCustomers.some(c => c.name.toUpperCase() === nameUpper && c.id !== editingId);

  const isAms = String(formData.healthPlan).toUpperCase().includes('AMS') ||
                String(formData.healthPlan).toUpperCase().includes('PETROBRAS');
  const isParticular = formData.healthPlan === HealthPlan.PARTICULAR;

  const input = 'w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all';
  const label = 'text-sm font-bold text-zinc-500 uppercase tracking-widest';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingId ? 'Editar Paciente' : 'Novo Paciente'}
      className="max-w-xl h-[70vh]"
      footer={
        <div className="flex gap-3 w-full">
          {editingId && onInactivate && (
            <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={onInactivate}>
              Inativar
            </Button>
          )}
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="customer-form" className="flex-1 bg-priori-navy text-white" isLoading={isSaving}>
            {editingId ? 'Salvar' : 'Cadastrar'}
          </Button>
        </div>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Nome */}
        <div className="space-y-1">
          <label className={label}>Nome Completo</label>
          <input
            className={cn(input, duplicateWarning && 'border-amber-400')}
            value={formData.name}
            onChange={e => setFormData(p => ({ ...p, name: e.target.value.toUpperCase() }))}
            placeholder="Nome do paciente em maiúsculas"
            required
          />
          {duplicateWarning && (
            <div className="flex items-center gap-2 text-amber-600 text-xs">
              <AlertCircle size={12} /> Paciente com este nome já existe.
            </div>
          )}
        </div>

        {/* Telefone */}
        <div className="space-y-1">
          <label className={label}>Telefone (WhatsApp)</label>
          <input className={input} value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="(21) 99999-9999" />
        </div>

        {/* Nascimento + Gênero */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={label}>Data de Nascimento</label>
            <input type="date" className={input} value={formData.birthDate} onChange={e => setFormData(p => ({ ...p, birthDate: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className={label}>Gênero</label>
            <select className={input} value={formData.gender} onChange={e => setFormData(p => ({ ...p, gender: e.target.value }))}>
              <option value="">Não informado</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
              <option value="O">Outro</option>
            </select>
          </div>
        </div>

        {/* AMS Section */}
        {isAms && (
          <div className="space-y-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-widest">Dados AMS / Petrobras</p>
            <div className="space-y-1">
              <label className={label}>Senha AMS</label>
              <input className={input} value={formData.amsPassword} onChange={e => setFormData(p => ({ ...p, amsPassword: e.target.value }))} placeholder="Senha atual" />
            </div>
            <div className="space-y-1">
              <label className={label}>Vencimento da Senha</label>
              <input type="date" className={input} value={formData.amsPasswordExpiry} onChange={e => setFormData(p => ({ ...p, amsPasswordExpiry: e.target.value }))} />
            </div>
          </div>
        )}

        {/* Convênio + Psicólogo */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={label}>Convênio / Plano</label>
            <select className={input} value={formData.healthPlan} onChange={e => setFormData(p => ({ ...p, healthPlan: e.target.value as HealthPlan }))} required>
              {Object.values(HealthPlan).map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className={label}>Psicólogo Responsável</label>
            <select className={input} value={formData.psychologistId} onChange={e => setFormData(p => ({ ...p, psychologistId: e.target.value }))}>
              <option value="">Sem responsável</option>
              {psychologists.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Particular price fields */}
        {isParticular && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={label}>Valor da Sessão (R$)</label>
              <input type="number" min="0" step="0.01" className={input} value={formData.customPrice ?? ''} onChange={e => setFormData(p => ({ ...p, customPrice: e.target.value ? Number(e.target.value) : undefined }))} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <label className={label}>Repasse Psicólogo (R$)</label>
              <input type="number" min="0" step="0.01" className={input} value={formData.customRepassAmount ?? ''} onChange={e => setFormData(p => ({ ...p, customRepassAmount: e.target.value ? Number(e.target.value) : undefined }))} placeholder="0,00" />
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1">
          <label className={label}>Observações</label>
          <textarea className={cn(input, 'min-h-[80px] resize-none')} value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Informações adicionais sobre o paciente..." />
        </div>
      </form>
    </Modal>
  );
};
