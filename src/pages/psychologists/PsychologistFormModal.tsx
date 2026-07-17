import React from 'react';
import { Plus, Trash2, Globe, Home, Layers } from 'lucide-react';
import { Psychologist, PsychologistAvailability } from '../../services/types';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

const DAYS_OF_WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export interface PsyFormData {
  name: string;
  email: string;
  specialties: string[];
  phone: string;
  active: boolean;
  availability: PsychologistAvailability[];
  repassRate: number;
  repassFixedAmount: number | undefined;
  pixKeyType: 'telefone' | 'email' | 'cpf' | 'aleatoria' | '';
  pixKey: string;
}

interface Props {
  isOpen: boolean;
  editingPsychologist: Psychologist | null;
  formData: PsyFormData;
  setFormData: React.Dispatch<React.SetStateAction<PsyFormData>>;
  newSpecialty: string;
  setNewSpecialty: React.Dispatch<React.SetStateAction<string>>;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  addSpecialty: () => void;
  removeSpecialty: (i: number) => void;
  addAvailability: () => void;
  removeAvailability: (i: number) => void;
  updateAvailability: (i: number, field: keyof PsychologistAvailability, value: any) => void;
}

export const PsychologistFormModal: React.FC<Props> = ({
  isOpen, editingPsychologist, formData, setFormData, newSpecialty, setNewSpecialty,
  isSaving, onClose, onSubmit, addSpecialty, removeSpecialty, addAvailability, removeAvailability, updateAvailability,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={editingPsychologist ? 'Editar Psicólogo' : 'Novo Psicólogo'}
    footer={
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="psychologist-form" className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" isLoading={isSaving}>
          {editingPsychologist ? 'Salvar Alterações' : 'Criar Psicólogo'}
        </Button>
      </div>
    }
  >
    <form id="psychologist-form" onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Nome Completo</label>
          <input className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Dra. Ana Beatriz" required />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">E-mail para Agenda</label>
          <input type="email" className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="Ex: ana@prioriclinica.com.br" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Telefone (WhatsApp)</label>
            <input className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="(11) 99999-9999" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</label>
            <select className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none" value={formData.active ? 'true' : 'false'} onChange={e => setFormData({ ...formData, active: e.target.value === 'true' })}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>
        <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-priori-navy uppercase tracking-widest">Regra de Repasse do Psicólogo</p>
            <span className="px-1.5 py-0.5 rounded bg-priori-navy/5 text-[8px] font-bold text-priori-navy uppercase tracking-tighter">% ou Valor Fixo</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Percentual (%)</label>
              <div className="relative">
                <input type="number" step="0.01" className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-2 text-sm text-priori-navy focus:outline-none" value={formData.repassRate * 100} onChange={e => setFormData({ ...formData, repassRate: parseFloat(e.target.value) / 100 })} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor Fixo (Opcional)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">R$</span>
                <input type="number" step="0.01" className="w-full bg-white border border-zinc-100 rounded-xl pl-9 pr-4 py-2 text-sm text-priori-navy focus:outline-none" value={formData.repassFixedAmount || ''} onChange={e => setFormData({ ...formData, repassFixedAmount: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="0,00" />
              </div>
            </div>
          </div>
          <p className="text-[9px] text-zinc-400 italic">* Se o valor fixo for preenchido, ele terá prioridade sobre o percentual.</p>
        </div>
        <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3">
          <p className="text-[10px] font-bold text-priori-navy uppercase tracking-widest">Dados Pix</p>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tipo de Chave</label>
            <select
              className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-2 text-sm text-priori-navy focus:outline-none"
              value={formData.pixKeyType}
              onChange={e => setFormData({ ...formData, pixKeyType: e.target.value as PsyFormData['pixKeyType'], pixKey: '' })}
            >
              <option value="">Selecione o tipo</option>
              <option value="telefone">Telefone</option>
              <option value="email">E-mail</option>
              <option value="cpf">CPF</option>
              <option value="aleatoria">Chave Aleatória</option>
            </select>
          </div>
          {formData.pixKeyType && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Chave Pix</label>
              <input
                className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-2 text-sm text-priori-navy focus:outline-none"
                value={formData.pixKey}
                onChange={e => setFormData({ ...formData, pixKey: e.target.value })}
                placeholder={
                  formData.pixKeyType === 'telefone' ? '(11) 99999-9999' :
                  formData.pixKeyType === 'email' ? 'email@exemplo.com' :
                  formData.pixKeyType === 'cpf' ? '000.000.000-00' :
                  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
                }
              />
            </div>
          )}
        </div>
        <div className="space-y-3">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Especialidades</label>
          <div className="flex gap-2">
            <input className="flex-1 bg-white border border-zinc-100 rounded-xl px-4 py-2 text-sm text-priori-navy focus:outline-none" value={newSpecialty} onChange={e => setNewSpecialty(e.target.value)} placeholder="Ex: TCC, Infantil..." onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addSpecialty())} />
            <Button type="button" variant="outline" onClick={addSpecialty} className="border-zinc-100 text-priori-navy hover:bg-zinc-50"><Plus size={18} /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.specialties.map((spec, idx) => (
              <span key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-zinc-50 text-zinc-600 rounded-lg text-xs font-medium border border-zinc-100">
                {spec}
                <button type="button" onClick={() => removeSpecialty(idx)} className="text-zinc-400 hover:text-red-500">✕</button>
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Agenda de Disponibilidade</label>
            <Button type="button" variant="outline" size="sm" onClick={addAvailability} className="border-zinc-100 text-priori-navy hover:bg-zinc-50"><Plus size={14} className="mr-1" /> Add Horário</Button>
          </div>
          <div className="space-y-3">
            {formData.availability.map((slot, idx) => (
              <div key={idx} className="flex flex-col gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select className="w-full bg-white border border-zinc-100 rounded-lg px-2 py-1.5 text-xs text-priori-navy focus:outline-none" value={slot.dayOfWeek} onChange={e => updateAvailability(idx, 'dayOfWeek', parseInt(e.target.value))}>
                      {DAYS_OF_WEEK.map((day, i) => <option key={i} value={i}>{day}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3"><input type="time" className="w-full bg-white border border-zinc-100 rounded-lg px-2 py-1.5 text-xs text-priori-navy focus:outline-none" value={slot.startTime} onChange={e => updateAvailability(idx, 'startTime', e.target.value)} /></div>
                  <div className="col-span-3"><input type="time" className="w-full bg-white border border-zinc-100 rounded-lg px-2 py-1.5 text-xs text-priori-navy focus:outline-none" value={slot.endTime} onChange={e => updateAvailability(idx, 'endTime', e.target.value)} /></div>
                  <div className="col-span-1 flex justify-end"><button type="button" onClick={() => removeAvailability(idx)} className="text-zinc-400 hover:text-red-500"><Trash2 size={14} /></button></div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest shrink-0">Modalidade:</span>
                  <div className="flex gap-1 flex-1">
                    {(['Presencial', 'On-line', 'Ambos'] as const).map(m => {
                      const isSelected = (slot.mode ?? 'Ambos') === m;
                      const colors = m === 'Presencial' ? 'border-blue-200 bg-blue-50 text-blue-700' : m === 'On-line' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-violet-200 bg-violet-50 text-violet-700';
                      const ModeIcon = m === 'Presencial' ? Home : m === 'On-line' ? Globe : Layers;
                      return (
                        <button key={m} type="button" onClick={() => updateAvailability(idx, 'mode', m)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${isSelected ? colors : 'border-zinc-100 bg-white text-zinc-400 hover:border-zinc-200'}`}>
                          <ModeIcon size={10} />{m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </form>
  </Modal>
);
