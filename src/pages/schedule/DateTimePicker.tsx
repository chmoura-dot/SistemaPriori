import React from 'react';
import { AttendanceMode } from '../../services/types';
import { ScheduleFormData } from './scheduleUtils';

const ALL_TIME_SLOTS = Array.from({ length: 15 * 6 + 1 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 10;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}).filter(slot => Number(slot.split(':')[0]) <= 22);

interface DateTimePickerProps {
  formData: ScheduleFormData;
  setFormData: React.Dispatch<React.SetStateAction<ScheduleFormData>>;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({ formData, setFormData }) => {
  const dayOfWeek = formData.date ? new Date(formData.date + 'T12:00:00').getDay() : -1;
  const isOnline = formData.mode === AttendanceMode.ONLINE;
  const limit = dayOfWeek === 6 ? '14:00' : '20:00';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Data</label>
        <input
          type="date"
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
          value={formData.date}
          onChange={e => setFormData(prev => ({ ...prev, date: e.target.value, startTime: '', endTime: '', psychologistId: '', roomId: '' }))}
          required
        />
        {formData.date && (
          <p className="text-xs text-zinc-500 mt-1">
            {new Date(formData.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Hora Início</label>
        <select
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
          value={formData.startTime}
          onChange={e => setFormData(prev => ({ ...prev, startTime: e.target.value, psychologistId: '', roomId: '' }))}
          required
        >
          <option value="">Selecione...</option>
          {ALL_TIME_SLOTS.filter(t => {
            if (dayOfWeek === 0) return false;
            if (!isOnline && t >= limit) return false;
            return true;
          }).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Hora Fim</label>
        <select
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
          value={formData.endTime}
          onChange={e => setFormData(prev => ({ ...prev, endTime: e.target.value, psychologistId: '', roomId: '' }))}
          required
        >
          <option value="">Selecione...</option>
          {ALL_TIME_SLOTS.filter(t => t > formData.startTime).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
};
