import React from 'react';
import { Edit2, Trash2, Phone, Calendar, MessageCircle, FileText, Globe, Home, Layers, Mail, Key, QrCode } from 'lucide-react';
import { Psychologist } from '../../services/types';
import { cn } from '../../lib/utils';

const DAYS_OF_WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface Props {
  psy: Psychologist;
  onEdit: (psy: Psychologist) => void;
  onDelete: (id: string) => void;
  onInvite: (email: string) => void;
  onWhatsApp: (phone: string, message: string) => void;
}

export const PsychologistCard: React.FC<Props> = ({ psy, onEdit, onDelete, onInvite, onWhatsApp }) => (
  <div className="bg-white border border-zinc-100 rounded-2xl p-6 flex flex-col hover:border-priori-gold/30 shadow-sm transition-all group">
    <div className="flex justify-between items-start mb-4">
      <div>
        <h3 className="text-lg font-bold text-priori-navy">{psy.name}</h3>
        <div className="flex flex-wrap gap-1 mt-1">
          {psy.specialties.map((spec, idx) => (
            <span key={idx} className="text-[9px] bg-zinc-50 text-zinc-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider border border-zinc-100">{spec}</span>
          ))}
        </div>
      </div>
      <span className={cn('px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider', psy.active ? 'bg-priori-gold/10 text-priori-gold' : 'bg-zinc-100 text-zinc-500')}>
        {psy.active ? 'Ativo' : 'Inativo'}
      </span>
    </div>

    <div className="space-y-4 mb-6 flex-1">
      <div className="flex items-center gap-2 text-zinc-500"><Phone size={14} className="text-priori-navy" /><span className="text-sm">{psy.phone || 'Sem telefone'}</span></div>
      <div className="flex items-center gap-2 text-zinc-500"><Mail size={14} className="text-priori-navy" /><span className="text-sm truncate" title={psy.email}>{psy.email || 'Sem e-mail (agenda desativada)'}</span></div>
      {psy.pixKey && (
        <div className="flex items-center gap-2 text-zinc-500">
          <QrCode size={14} className="text-emerald-600 shrink-0" />
          <span className="text-sm truncate">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mr-1">
              Pix {psy.pixKeyType === 'telefone' ? '(Tel)' : psy.pixKeyType === 'email' ? '(E-mail)' : psy.pixKeyType === 'cpf' ? '(CPF)' : psy.pixKeyType === 'aleatoria' ? '(Aleat.)' : ''}
            </span>
            {psy.pixKey}
          </span>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-widest"><Calendar size={12} /> Agenda Disponível</div>
        <div className="space-y-1">
          {psy.availability.length > 0 ? psy.availability.sort((a, b) => a.dayOfWeek - b.dayOfWeek).map((slot, idx) => {
            const slotMode = slot.mode ?? 'Ambos';
            const modeColor = slotMode === 'Presencial' ? 'bg-blue-50 text-blue-600 border-blue-100' : slotMode === 'On-line' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-violet-50 text-violet-600 border-violet-100';
            const ModeIcon = slotMode === 'Presencial' ? Home : slotMode === 'On-line' ? Globe : Layers;
            return (
              <div key={idx} className="flex items-center justify-between text-xs text-zinc-600 bg-zinc-50 p-1.5 rounded border border-zinc-100 gap-2">
                <span className="font-medium shrink-0">{DAYS_OF_WEEK[slot.dayOfWeek]}</span>
                <span className="text-zinc-500 flex-1 text-right">{slot.startTime} – {slot.endTime}</span>
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${modeColor}`}><ModeIcon size={9} />{slotMode}</span>
              </div>
            );
          }) : <p className="text-xs text-zinc-400 italic">Nenhum horário configurado</p>}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2 mb-4">
      <button onClick={() => onWhatsApp(psy.phone, `Olá ${psy.name}, gostaria de confirmar sua agenda para esta semana.`)}
        className="flex items-center justify-center gap-2 py-2 px-3 bg-priori-navy/5 text-priori-navy rounded-xl text-xs font-bold hover:bg-priori-navy/10 transition-all">
        <MessageCircle size={14} /> Confirmar
      </button>
      <button onClick={() => onWhatsApp(psy.phone, `Olá ${psy.name}, segue o relatório de atendimentos da semana.`)}
        className="flex items-center justify-center gap-2 py-2 px-3 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all">
        <FileText size={14} /> Relatório
      </button>
    </div>

    <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100">
      <button onClick={() => onInvite(psy.email)} title="Gerar Acesso / Reenviar Convite" className="p-2 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/5 rounded-lg transition-all mr-auto"><Key size={16} /></button>
      <button onClick={() => onEdit(psy)} className="p-2 text-zinc-400 hover:text-priori-navy hover:bg-priori-navy/5 rounded-lg transition-all"><Edit2 size={16} /></button>
      <button onClick={() => onDelete(psy.id)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all"><Trash2 size={16} /></button>
    </div>
  </div>
);
