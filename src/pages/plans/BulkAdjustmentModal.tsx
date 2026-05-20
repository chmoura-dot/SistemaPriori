import React from 'react';
import { TrendingUp, AlertCircle, Check } from 'lucide-react';
import { Plan } from '../../services/types';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { cn } from '../../lib/utils';

export interface BulkData {
  amount: number;
  adjustPrice: boolean;
  adjustRepass: boolean;
  selectedPlanIds: string[];
  effectiveDate: string;
}

interface Props {
  isOpen: boolean;
  plans: Plan[];
  bulkData: BulkData;
  setBulkData: React.Dispatch<React.SetStateAction<BulkData>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSaving: boolean;
}

export const BulkAdjustmentModal: React.FC<Props> = ({
  isOpen, plans, bulkData, setBulkData, onClose, onSubmit, isSaving,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Reajuste Anual de Preços"
    footer={
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="bulk-plan-form" className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" isLoading={isSaving}
          disabled={bulkData.selectedPlanIds.length === 0 || bulkData.amount === 0}>
          Aplicar Reajuste
        </Button>
      </div>
    }
  >
    <form id="bulk-plan-form" onSubmit={onSubmit} className="space-y-6">
      <div className="bg-priori-navy/5 border border-priori-navy/10 p-4 rounded-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-priori-navy rounded-lg text-white"><TrendingUp size={20} /></div>
          <div>
            <h4 className="text-sm font-bold text-priori-navy">Ajuste de Valor Fixo</h4>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Adicione um valor fixo aos planos selecionados</p>
          </div>
        </div>

        <div className="bg-priori-gold/10 border border-priori-gold/20 p-3 rounded-lg flex items-start gap-3">
          <AlertCircle size={16} className="text-priori-gold mt-0.5 shrink-0" />
          <p className="text-[10px] text-priori-gold leading-relaxed">
            <span className="font-bold uppercase">Impacto:</span> Este reajuste será aplicado em planos e em todos os agendamentos **não faturados** a partir da data de vigência selecionada abaixo. Agendamentos já vinculados a lotes de faturamento não serão alterados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Data de Vigência" type="date" value={bulkData.effectiveDate}
            onChange={(e) => setBulkData({ ...bulkData, effectiveDate: e.target.value })} required />
          <Input label="Valor do Aumento (R$)" type="number" step="0.01" value={bulkData.amount}
            onChange={(e) => setBulkData({ ...bulkData, amount: Number(e.target.value) })} required />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-2 pt-5">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={cn('w-4 h-4 rounded border flex items-center justify-center transition-all', bulkData.adjustPrice ? 'bg-priori-navy border-priori-navy' : 'border-zinc-300 bg-white')}
                onClick={() => setBulkData({ ...bulkData, adjustPrice: !bulkData.adjustPrice })}>
                {bulkData.adjustPrice && <Check size={12} className="text-white" />}
              </div>
              <span className="text-xs text-zinc-500 group-hover:text-priori-navy">Preço</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={cn('w-4 h-4 rounded border flex items-center justify-center transition-all', bulkData.adjustRepass ? 'bg-priori-navy border-priori-navy' : 'border-zinc-300 bg-white')}
                onClick={() => setBulkData({ ...bulkData, adjustRepass: !bulkData.adjustRepass })}>
                {bulkData.adjustRepass && <Check size={12} className="text-white" />}
              </div>
              <span className="text-xs text-zinc-500 group-hover:text-priori-navy">Repasse</span>
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Planos a Reajustar</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
          {plans.map(plan => (
            <div key={plan.id}
              onClick={() => {
                const newIds = bulkData.selectedPlanIds.includes(plan.id)
                  ? bulkData.selectedPlanIds.filter(id => id !== plan.id)
                  : [...bulkData.selectedPlanIds, plan.id];
                setBulkData({ ...bulkData, selectedPlanIds: newIds });
              }}
              className={cn('p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between',
                bulkData.selectedPlanIds.includes(plan.id)
                  ? 'bg-priori-gold/10 border-priori-gold/50 text-priori-gold'
                  : 'bg-white border-zinc-100 text-zinc-500 hover:border-priori-navy/30')}
            >
              <span className="text-xs font-medium">{plan.name}</span>
              {bulkData.selectedPlanIds.includes(plan.id) && <Check size={14} />}
            </div>
          ))}
        </div>
      </div>
    </form>
  </Modal>
);
