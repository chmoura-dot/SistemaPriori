import React from 'react';
import { ScheduleFormData } from './scheduleUtils';

interface InternalBlockFormProps {
  formData: ScheduleFormData;
  setFormData: React.Dispatch<React.SetStateAction<ScheduleFormData>>;
}

export const InternalBlockForm: React.FC<InternalBlockFormProps> = ({ formData, setFormData }) => (
  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
    <div className="space-y-2">
      <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Motivo / Tipo de Bloqueio</label>
      <select
        className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
        value={formData.internalType}
        onChange={e => setFormData(prev => ({ ...prev, internalType: e.target.value as any }))}
        required
      >
        <option value="SUPERVISAO">Supervisão</option>
        <option value="RESPONSAVEIS">Reunião com Responsáveis</option>
        <option value="REUNIAO">Reunião Clínica / Equipe</option>
        <option value="ADMIN">Trabalho Administrativo</option>
        <option value="OUTRO">Outro Motivo</option>
      </select>
    </div>

    {formData.internalType === 'OUTRO' && (
      <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Título do Bloqueio</label>
        <input
          type="text"
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
          placeholder="Ex: Treinamento externo..."
          value={formData.internalTitle}
          onChange={e => setFormData(prev => ({ ...prev, internalTitle: e.target.value }))}
          required
        />
      </div>
    )}

    <div className="space-y-2">
      <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Observações Internas</label>
      <textarea
        className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all resize-none"
        placeholder="Notas adicionais sobre este bloqueio..."
        rows={3}
        value={formData.internalNotes}
        onChange={e => setFormData(prev => ({ ...prev, internalNotes: e.target.value }))}
      />
    </div>
  </div>
);
