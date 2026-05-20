import React from 'react';
import { Calendar, Plus, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { ClinicClosure, Appointment } from '../../services/types';
import { Button } from '../../components/Button';

interface Props {
  closures: ClinicClosure[];
  appointments: Appointment[];
  onNew: () => void;
  onEdit: (c: ClinicClosure) => void;
  onDelete: (id: string) => void;
}

export const ClosuresTab: React.FC<Props> = ({ closures, appointments, onNew, onEdit, onDelete }) => (
  <div className="space-y-4">
    <div className="flex justify-end">
      <Button onClick={onNew} className="bg-priori-navy hover:bg-priori-navy/90 text-white">
        <Plus size={18} className="mr-2" /> Novo Período de Fechamento
      </Button>
    </div>
    {closures.length === 0 ? (
      <div className="bg-white border border-zinc-100 rounded-2xl p-12 text-center shadow-sm">
        <Calendar size={40} className="mx-auto text-zinc-200 mb-4" />
        <p className="text-zinc-400 font-medium">Nenhum período de fechamento cadastrado.</p>
        <p className="text-zinc-300 text-sm mt-1">Cadastre o recesso de fim de ano ou outros fechamentos aqui.</p>
      </div>
    ) : (
      <div className="bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="divide-y divide-zinc-50">
          {closures.map(c => {
            const start = new Date(c.startDate + 'T12:00:00');
            const end = new Date(c.endDate + 'T12:00:00');
            const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const affectedCount = appointments.filter(a => a.date >= c.startDate && a.date <= c.endDate && a.status !== 'canceled').length;
            return (
              <div key={c.id} className="px-6 py-5 flex items-center justify-between gap-4 hover:bg-zinc-50/50 transition-colors">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="p-3 bg-priori-navy/5 rounded-xl"><Calendar size={20} className="text-priori-navy" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-priori-navy text-sm">{c.reason}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-zinc-500 font-medium">
                        {start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} → {end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                      <span className="text-[10px] font-black text-priori-navy/60 bg-priori-navy/5 px-2 py-0.5 rounded-full">{diffDays} {diffDays === 1 ? 'dia' : 'dias'}</span>
                      {affectedCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
                          <AlertCircle size={10} />{affectedCount} agendamento{affectedCount > 1 ? 's' : ''} neste período
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onEdit(c)} className="p-2 text-zinc-400 hover:text-priori-navy hover:bg-zinc-100 rounded-lg transition-colors"><Edit2 size={14} /></button>
                  <button onClick={() => onDelete(c.id)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
  </div>
);
