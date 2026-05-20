import React from 'react';
import { Plus, Trash2, DollarSign, TrendingUp, Hash, FileText } from 'lucide-react';
import { Plan, AppointmentType, PlanProcedure } from '../../services/types';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';

export interface PlanFormData {
  name: string;
  procedures: PlanProcedure[];
  active: boolean;
}

interface Props {
  isOpen: boolean;
  editingPlan: Plan | null;
  formData: PlanFormData;
  setFormData: React.Dispatch<React.SetStateAction<PlanFormData>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSaving: boolean;
}

export const PlanFormModal: React.FC<Props> = ({
  isOpen, editingPlan, formData, setFormData, onClose, onSubmit, isSaving,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={editingPlan ? 'Editar Plano' : 'Novo Plano'}
    footer={
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="plan-form" className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" isLoading={isSaving}>
          {editingPlan ? 'Salvar Alterações' : 'Criar Plano'}
        </Button>
      </div>
    }
  >
    <form id="plan-form" onSubmit={onSubmit} className="space-y-6">
      <Input
        label="Nome do Plano"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
        placeholder="Ex: AMS Petrobras"
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Códigos TUSS e Valores</label>
          <Button
            type="button" variant="outline" size="sm" className="h-7 text-[10px]"
            onClick={() => setFormData({
              ...formData,
              procedures: [...formData.procedures, { type: AppointmentType.ADULTO, code: '', description: '', price: 0, repassAmount: 0, isOneTimeCharge: false }]
            })}
          >
            <Plus size={12} className="mr-1" /> Adicionar Código
          </Button>
        </div>

        <div className="space-y-4 divide-y divide-zinc-100">
          {formData.procedures.map((proc, idx) => (
            <div key={idx} className="pt-4 first:pt-0 space-y-3 relative group/form-proc">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-priori-gold" />
                  <select
                    className="bg-transparent text-xs font-bold text-priori-navy focus:outline-none border-none p-0 cursor-pointer"
                    value={proc.type}
                    onChange={(e) => {
                      const newProcs = [...formData.procedures];
                      newProcs[idx].type = e.target.value as AppointmentType;
                      setFormData({ ...formData, procedures: newProcs });
                    }}
                  >
                    {Object.values(AppointmentType).map(type => (
                      <option key={type} value={type} className="bg-white">{type}</option>
                    ))}
                  </select>
                  {proc.isOneTimeCharge && (
                    <span className="text-[8px] bg-priori-navy/10 text-priori-navy px-1.5 py-0.5 rounded border border-priori-navy/20 uppercase font-bold tracking-tighter">Cobrança Única</span>
                  )}
                </div>
                <button type="button" onClick={() => setFormData({ ...formData, procedures: formData.procedures.filter((_, i) => i !== idx) })} className="text-zinc-400 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1"><Hash size={10} /> Código TUSS</label>
                  <input className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20" value={proc.code}
                    onChange={(e) => { const n = [...formData.procedures]; n[idx].code = e.target.value; setFormData({ ...formData, procedures: n }); }} placeholder="Ex: 50000470" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1"><FileText size={10} /> Nome do Procedimento</label>
                  <input className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20" value={proc.description}
                    onChange={(e) => { const n = [...formData.procedures]; n[idx].description = e.target.value; setFormData({ ...formData, procedures: n }); }} placeholder="Ex: Sessão de Psicoterapia" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1"><DollarSign size={10} /> Valor (R$)</label>
                  <input type="number" step="0.01" min="0" className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20" value={proc.price}
                    onChange={(e) => { const n = [...formData.procedures]; n[idx].price = Number(e.target.value); setFormData({ ...formData, procedures: n }); }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1"><TrendingUp size={10} /> Repasse (R$)</label>
                  <input type="number" step="0.01" min="0" className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20" value={proc.repassAmount}
                    onChange={(e) => { const n = [...formData.procedures]; n[idx].repassAmount = Number(e.target.value); setFormData({ ...formData, procedures: n }); }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1"><Hash size={10} /> Limite Sessões/Mês</label>
                  <input type="number" step="1" min="0" className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/20" value={proc.maxSessionsPerMonth ?? 0} placeholder="0 = ilimitado"
                    onChange={(e) => { const n = [...formData.procedures]; n[idx].maxSessionsPerMonth = Number(e.target.value) || 0; setFormData({ ...formData, procedures: n }); }} />
                  <p className="text-[9px] text-zinc-400 ml-1">0 = sem limite</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" id={`onetime-${idx}`} checked={proc.isOneTimeCharge}
                  onChange={(e) => { const n = [...formData.procedures]; n[idx].isOneTimeCharge = e.target.checked; setFormData({ ...formData, procedures: n }); }}
                  className="w-3 h-3 rounded border-zinc-300 bg-white text-priori-navy focus:ring-priori-navy/20" />
                <label htmlFor={`onetime-${idx}`} className="text-[10px] text-zinc-500">Cobrar apenas uma vez (independente do nº de sessões)</label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 py-2 border-t border-zinc-100 pt-4">
        <input type="checkbox" id="active" checked={formData.active}
          onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
          className="w-4 h-4 rounded border-zinc-300 bg-white text-priori-navy focus:ring-priori-navy/20" />
        <label htmlFor="active" className="text-sm text-zinc-600">Plano Ativo</label>
      </div>
    </form>
  </Modal>
);
