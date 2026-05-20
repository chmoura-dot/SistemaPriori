import React from 'react';
import { Psychologist, WaitingListEntry } from '../../services/types';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { cn } from '../../lib/utils';

const DAYS_OF_WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HOURS = Array.from({ length: 15 }, (_, i) => `${(i + 8).toString().padStart(2, '0')}:00`);

export interface WaitingFormData {
  customerName: string;
  phone: string;
  preferredDays: number[];
  preferredHours: string[];
  psychologistId: string;
  notes: string;
  status: 'pending' | 'called' | 'resolved' | 'canceled';
}

interface Props {
  isOpen: boolean;
  editingEntry: WaitingListEntry | null;
  formData: WaitingFormData;
  setFormData: React.Dispatch<React.SetStateAction<WaitingFormData>>;
  psychologists: Psychologist[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const WaitingListFormModal: React.FC<Props> = ({
  isOpen, editingEntry, formData, setFormData, psychologists, isSaving, onClose, onSubmit,
}) => {
  const toggleDay = (day: number) => setFormData(prev => {
    const days = prev.preferredDays.includes(day) ? prev.preferredDays.filter(d => d !== day) : [...prev.preferredDays, day].sort();
    return { ...prev, preferredDays: days };
  });
  const toggleHour = (hour: string) => setFormData(prev => {
    const hours = prev.preferredHours.includes(hour) ? prev.preferredHours.filter(h => h !== hour) : [...prev.preferredHours, hour].sort();
    return { ...prev, preferredHours: hours };
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingEntry ? 'Editar Interessado' : 'Adicionar à Fila de Espera'}
      footer={
        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="waiting-form" className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" isLoading={isSaving}>
            {editingEntry ? 'Salvar Alterações' : 'Adicionar Interessado'}
          </Button>
        </div>
      }
    >
      <form id="waiting-form" onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Nome do Paciente</label>
            <input className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5" value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} placeholder="Nome do interessado" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Telefone de Contato</label>
              <input className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Status Atual</label>
              <select className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })}>
                <option value="pending">Aguardando Vaga</option>
                <option value="called">Foi Contatado</option>
                <option value="resolved">Já Agendado</option>
                <option value="canceled">Desistiu</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Profissional Desejado (Opcional)</label>
            <select className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5" value={formData.psychologistId} onChange={e => setFormData({ ...formData, psychologistId: e.target.value })}>
              <option value="">Qualquer profissional</option>
              {psychologists.map(psy => <option key={psy.id} value={psy.id}>{psy.name}</option>)}
            </select>
          </div>
          <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-priori-navy uppercase tracking-widest">Dias da Semana Preferidos</label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day, idx) => {
                  if (idx === 0) return null;
                  const isSelected = formData.preferredDays.includes(idx);
                  return (
                    <button key={idx} type="button" onClick={() => toggleDay(idx)}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', isSelected ? 'bg-priori-navy border-priori-navy text-white shadow-sm' : 'bg-white border-zinc-200 text-zinc-500 hover:border-priori-navy/50')}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-priori-navy uppercase tracking-widest">Faixas de Horário</label>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                {HOURS.map(hour => {
                  const isSelected = formData.preferredHours.includes(hour);
                  return (
                    <button key={hour} type="button" onClick={() => toggleHour(hour)}
                      className={cn('px-2 py-1 rounded border text-xs font-medium transition-colors', isSelected ? 'bg-priori-gold/10 border-priori-gold text-priori-gold font-bold' : 'bg-white border-zinc-200 text-zinc-500 hover:border-priori-gold/50')}>
                      {hour}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Observações Adicionais</label>
            <textarea className="w-full bg-white border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 min-h-[80px]" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Ex: Prefere atendimento online..." />
          </div>
        </div>
      </form>
    </Modal>
  );
};
