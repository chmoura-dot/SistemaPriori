import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Appointment, RecurrenceFrequency } from '../../services/types';
import { ScheduleFormData } from './scheduleUtils';

interface RecurrenceSectionProps {
  formData: ScheduleFormData;
  setFormData: React.Dispatch<React.SetStateAction<ScheduleFormData>>;
  editingId: string | null;
  appointments: Appointment[];
  updateFuture: boolean;
  setUpdateFuture: React.Dispatch<React.SetStateAction<boolean>>;
}

export const RecurrenceSection: React.FC<RecurrenceSectionProps> = ({
  formData, setFormData, editingId, appointments, updateFuture, setUpdateFuture,
}) => {
  const isEditingRecurring = editingId && appointments.find(a => a.id === editingId)?.isRecurring;

  return (
    <div className="space-y-3 p-4 bg-zinc-50 border border-zinc-100 rounded-xl mt-4">
      {isEditingRecurring && (
        <div className="mb-4 pb-4 border-b border-zinc-200/60 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-lg">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  checked={updateFuture}
                  onChange={e => setUpdateFuture(e.target.checked)}
                />
                <span className="text-sm font-bold text-amber-900">Aplicar a todos os futuros</span>
              </label>
              <p className="text-[11px] text-amber-700 leading-snug">
                Marque para aplicar a mudança a esta sessão e todas as futuras da recorrência.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isRecurring"
          className="w-4 h-4 rounded border-zinc-200 bg-white text-priori-navy focus:ring-priori-navy/10"
          checked={formData.isRecurring}
          onChange={e => setFormData(prev => ({ ...prev, isRecurring: e.target.checked }))}
        />
        <label htmlFor="isRecurring" className="text-sm text-zinc-600 font-medium cursor-pointer">
          Agendamento Recorrente
        </label>
      </div>

      {formData.isRecurring && (
        <div className="pl-6 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Frequência</label>
          <select
            className="w-full rounded-lg bg-white border border-zinc-200 px-3 py-2 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
            value={formData.recurrenceFrequency}
            onChange={e => setFormData(prev => ({ ...prev, recurrenceFrequency: e.target.value as RecurrenceFrequency }))}
          >
            <option value={RecurrenceFrequency.SEMANAL}>Semanal (mês atual + próximo)</option>
            <option value={RecurrenceFrequency.QUINZENAL}>Quinzenal (mês atual + próximo)</option>
          </select>
        </div>
      )}
    </div>
  );
};
