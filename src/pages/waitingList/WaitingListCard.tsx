import React from 'react';
import { Phone, User, Calendar, Clock, AlertCircle, CheckCircle2, PhoneCall, Check, Edit2, Trash2 } from 'lucide-react';
import { WaitingListEntry, Psychologist } from '../../services/types';

const DAYS_OF_WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface Props {
  entry: WaitingListEntry;
  psychologist?: Psychologist;
  onEdit: (entry: WaitingListEntry) => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'called' | 'resolved' | 'canceled') => void;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'pending': return <span className="px-2 py-1 rounded bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100 flex items-center gap-1"><Clock size={10} /> Aguardando</span>;
    case 'called': return <span className="px-2 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider border border-blue-100 flex items-center gap-1"><PhoneCall size={10} /> Contatado</span>;
    case 'resolved': return <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100 flex items-center gap-1"><CheckCircle2 size={10} /> Agendado</span>;
    case 'canceled': return <span className="px-2 py-1 rounded bg-zinc-100 text-zinc-500 text-[10px] font-bold uppercase tracking-wider border border-zinc-200 flex items-center gap-1"><AlertCircle size={10} /> Cancelado</span>;
    default: return null;
  }
};

export const WaitingListCard: React.FC<Props> = ({ entry, psychologist, onEdit, onDelete, onUpdateStatus }) => (
  <div className="bg-white border border-zinc-100 rounded-2xl p-5 flex flex-col hover:border-priori-gold/30 shadow-sm transition-all relative group">
    <div className="absolute top-5 right-5">
      <StatusBadge status={entry.status} />
    </div>

    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-full bg-priori-navy/5 flex items-center justify-center text-priori-navy">
        <User size={18} />
      </div>
      <div>
        <h3 className="font-bold text-priori-navy text-sm">{entry.customerName}</h3>
        <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-0.5">
          <Phone size={10} /> {entry.phone || 'Sem telefone'}
        </div>
      </div>
    </div>

    <div className="space-y-3 flex-1 mb-4 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
      {entry.psychologistId && (
        <p className="text-xs text-zinc-600 flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Profissional:</span>
          <span className="font-medium text-priori-navy">{psychologist?.name || 'Não encontrado'}</span>
        </p>
      )}
      {entry.preferredDays.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5 w-16">Dias:</span>
          <div className="flex flex-wrap gap-1">
            {entry.preferredDays.map(d => (
              <span key={d} className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-[10px] font-medium text-zinc-600">{DAYS_OF_WEEK[d].substring(0, 3)}</span>
            ))}
          </div>
        </div>
      )}
      {entry.preferredHours.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5 w-16">Horários:</span>
          <div className="flex flex-wrap gap-1">
            {entry.preferredHours.map(h => (
              <span key={h} className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-[10px] font-medium text-zinc-600">{h}</span>
            ))}
          </div>
        </div>
      )}
      {entry.notes && (
        <p className="text-xs text-zinc-500 italic border-t border-zinc-200 pt-2 mt-2">"{entry.notes}"</p>
      )}
    </div>

    <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
      <div className="flex gap-1">
        {entry.status === 'pending' && (
          <button onClick={() => onUpdateStatus(entry.id, 'called')} className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors" title="Marcar como Contatado">
            <PhoneCall size={14} />
          </button>
        )}
        {(entry.status === 'pending' || entry.status === 'called') && (
          <button onClick={() => onUpdateStatus(entry.id, 'resolved')} className="p-1.5 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 transition-colors" title="Marcar como Agendado">
            <Check size={14} />
          </button>
        )}
      </div>
      <div className="flex gap-1">
        <button onClick={() => onEdit(entry)} className="p-1.5 text-zinc-400 hover:text-priori-navy hover:bg-priori-navy/5 rounded transition-all"><Edit2 size={14} /></button>
        <button onClick={() => onDelete(entry.id)} className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"><Trash2 size={14} /></button>
      </div>
    </div>
  </div>
);
