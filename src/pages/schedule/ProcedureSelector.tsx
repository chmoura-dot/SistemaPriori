import React from 'react';
import { Check, Globe } from 'lucide-react';
import { Customer, Plan, HealthPlan, AppointmentType } from '../../services/types';
import { ScheduleFormData } from './scheduleUtils';

interface ProcedureSelectorProps {
  currentCustomer: Customer | undefined;
  currentPlan: Plan | undefined;
  formData: ScheduleFormData;
  setFormData: React.Dispatch<React.SetStateAction<ScheduleFormData>>;
}

export const ProcedureSelector: React.FC<ProcedureSelectorProps> = ({
  currentCustomer, currentPlan, formData, setFormData,
}) => {
  if (!currentCustomer) return null;

  if (currentCustomer.healthPlan === HealthPlan.PARTICULAR) {
    return (
      <div className="pt-4 border-t border-zinc-100 space-y-4">
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
          <p className="text-xs font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-2">
            <Check size={14} /> Atendimento Particular
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Tipo de Atendimento</label>
          <select
            className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
            value={formData.type}
            onChange={e => setFormData(prev => ({ ...prev, type: e.target.value as AppointmentType }))}
            required
          >
            {Object.values(AppointmentType).map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-zinc-100 space-y-4">
      <div className="p-3 bg-priori-navy/5 border border-priori-navy/10 rounded-xl">
        <p className="text-xs font-bold text-priori-navy uppercase tracking-widest flex items-center gap-2">
          <Globe size={14} /> Convênio: {currentCustomer.healthPlan}
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Procedimento / Código TUSS</label>
        <select
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
          value={String(
            currentPlan?.procedures.findIndex(
              p => p.code === formData.procedureCode && p.type === formData.type
            ) ?? -1
          )}
          onChange={e => {
            const idx = Number(e.target.value);
            const proc = currentPlan?.procedures[idx];
            if (proc) setFormData(prev => ({ ...prev, procedureCode: proc.code, type: proc.type }));
          }}
          required
        >
          <option value="-1">Selecione o procedimento...</option>
          {currentPlan?.procedures.map((proc, idx) => (
            <option key={idx} value={String(idx)}>{proc.code} — {proc.type} ({proc.description})</option>
          ))}
          {!currentPlan && <option disabled>Nenhum procedimento para este plano</option>}
        </select>
      </div>
    </div>
  );
};
