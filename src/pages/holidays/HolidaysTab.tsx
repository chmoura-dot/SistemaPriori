import React from 'react';
import { CalendarIcon, Plus, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { Holiday, Appointment } from '../../services/types';
import { Button } from '../../components/Button';
import { cn } from '../../lib/utils';

const TYPE_LABELS: Record<string, string> = { nacional: 'Nacional', estadual: 'Estadual', municipal: 'Municipal', facultativo: 'Ponto Facultativo' };
const TYPE_COLORS: Record<string, string> = { nacional: 'bg-red-100 text-red-700 border-red-200', estadual: 'bg-blue-100 text-blue-700 border-blue-200', municipal: 'bg-yellow-100 text-yellow-700 border-yellow-200', facultativo: 'bg-zinc-100 text-zinc-600 border-zinc-200' };

interface Props {
  holidays: Holiday[];
  appointments: Appointment[];
  onNew: () => void;
  onEdit: (h: Holiday) => void;
  onDelete: (id: string) => void;
}

export const HolidaysTab: React.FC<Props> = ({ holidays, appointments, onNew, onEdit, onDelete }) => {
  const holidaysByYear = holidays.reduce((acc, h) => {
    const year = h.date.split('-')[0];
    if (!acc[year]) acc[year] = [];
    acc[year].push(h);
    return acc;
  }, {} as Record<string, Holiday[]>);
  const years = Object.keys(holidaysByYear).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onNew} className="bg-priori-navy hover:bg-priori-navy/90 text-white">
          <Plus size={18} className="mr-2" /> Novo Feriado
        </Button>
      </div>
      {years.length === 0 ? (
        <div className="bg-white border border-zinc-100 rounded-2xl p-12 text-center shadow-sm">
          <CalendarIcon size={40} className="mx-auto text-zinc-200 mb-4" />
          <p className="text-zinc-400 font-medium">Nenhum feriado cadastrado.</p>
          <p className="text-zinc-300 text-sm mt-1">Clique em "Novo Feriado" para adicionar.</p>
        </div>
      ) : years.map(year => (
        <div key={year} className="bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-2">
            <CalendarIcon size={16} className="text-priori-navy" />
            <h3 className="font-bold text-priori-navy text-sm uppercase tracking-widest">{year}</h3>
            <span className="text-xs text-zinc-400 font-medium">({holidaysByYear[year].length} feriados)</span>
          </div>
          <div className="divide-y divide-zinc-50">
            {holidaysByYear[year].map(h => {
              const dateObj = new Date(h.date + 'T12:00:00');
              const hasAppointments = appointments.some(a => a.date === h.date && a.status !== 'canceled');
              return (
                <div key={h.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="text-center min-w-[60px]">
                      <p className="text-2xl font-black text-priori-navy leading-none">{dateObj.getDate().toString().padStart(2, '0')}</p>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{dateObj.toLocaleDateString('pt-BR', { month: 'short' })}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-priori-navy text-sm truncate">{h.name}</p>
                        {h.recurring && <span className="text-[9px] font-black text-priori-gold uppercase tracking-widest bg-priori-gold/10 px-1.5 py-0.5 rounded-full">Anual</span>}
                        {h.clinicOpen && <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">Clínica Aberta</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', TYPE_COLORS[h.type])}>{TYPE_LABELS[h.type]}</span>
                        <span className="text-[10px] text-zinc-400">{dateObj.toLocaleDateString('pt-BR', { weekday: 'long' })}</span>
                        {hasAppointments && !h.clinicOpen && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600"><AlertCircle size={10} />Há agendamentos neste dia</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => onEdit(h)} className="p-2 text-zinc-400 hover:text-priori-navy hover:bg-zinc-100 rounded-lg transition-colors"><Edit2 size={14} /></button>
                    <button onClick={() => onDelete(h.id)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
