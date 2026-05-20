import React from 'react';
import { Holiday } from '../../services/types';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

export interface HolidayFormData {
  date: string;
  name: string;
  type: Holiday['type'];
  recurring: boolean;
  clinicOpen: boolean;
}

interface Props {
  isOpen: boolean;
  editingHolidayId: string | null;
  holidayForm: HolidayFormData;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  setHolidayForm: React.Dispatch<React.SetStateAction<HolidayFormData>>;
}

export const HolidayFormModal: React.FC<Props> = ({
  isOpen, editingHolidayId, holidayForm, isSaving, onClose, onSave, setHolidayForm,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={editingHolidayId ? 'Editar Feriado' : 'Novo Feriado'}
    footer={
      <div className="flex gap-3 w-full">
        <Button variant="outline" className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" isLoading={isSaving} onClick={onSave}>
          {editingHolidayId ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    }
  >
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Data</label>
        <input type="date"
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
          value={holidayForm.date}
          onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))} required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Nome do Feriado</label>
        <input type="text"
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
          placeholder="Ex: Tiradentes" value={holidayForm.name}
          onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Tipo</label>
        <select
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
          value={holidayForm.type}
          onChange={e => setHolidayForm(f => ({ ...f, type: e.target.value as Holiday['type'] }))}>
          <option value="nacional">Nacional</option>
          <option value="estadual">Estadual</option>
          <option value="municipal">Municipal</option>
          <option value="facultativo">Ponto Facultativo</option>
        </select>
      </div>
      <div className="space-y-3 p-4 bg-zinc-50 border border-zinc-100 rounded-xl">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-zinc-300 text-priori-navy"
            checked={holidayForm.recurring}
            onChange={e => setHolidayForm(f => ({ ...f, recurring: e.target.checked }))} />
          <div>
            <span className="text-sm font-bold text-zinc-700">Feriado Anual</span>
            <p className="text-xs text-zinc-400">Repete todo ano na mesma data (ex: Natal, Tiradentes)</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-zinc-300 text-emerald-600"
            checked={holidayForm.clinicOpen}
            onChange={e => setHolidayForm(f => ({ ...f, clinicOpen: e.target.checked }))} />
          <div>
            <span className="text-sm font-bold text-zinc-700">Clínica Aberta</span>
            <p className="text-xs text-zinc-400">A clínica funciona normalmente neste dia (ex: ponto facultativo)</p>
          </div>
        </label>
      </div>
    </div>
  </Modal>
);
