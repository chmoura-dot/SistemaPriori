import React, { useMemo, useState } from 'react';
import { ChevronRight, CheckCircle2, FileText, Loader2, Save, Send } from 'lucide-react';
import {
  HealthPlan, Appointment, Customer, Psychologist, Plan,
  AppointmentType, BillingBatch,
} from '../../services/types';
import { PlanProcedureInfo } from '../../hooks/billing/billingHelpers';
import { NeuropsicoStatus } from '../../lib/pricing';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Input } from '../Input';
import { formatCurrency } from '../../lib/utils';
import { ConfirmBatchStep } from './ConfirmBatchStep';
import { BatchFilters } from './BatchFilters';
import { BatchAppointmentList } from './BatchAppointmentList';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface Props {
  isOpen: boolean;
  selectedPlan: HealthPlan;
  batchNumber: string;
  patientFilter: string;
  monthFilter: string;
  selectedAppointmentIds: string[];
  neuropsicoDecisions: Record<string, boolean>;
  customers: Customer[];
  psychologists: Psychologist[];
  plans: Plan[];
  eligibleAppointments: Appointment[];
  totalSelectedAmount: number;
  editingDraftBatch?: BillingBatch | null;
  includePrevMonth: boolean;
  blockedPlans?: Map<HealthPlan, string>;
  pendingCountByPlan?: Map<HealthPlan, number>;
  getNeuropsicoStatus: (app: Appointment) => NeuropsicoStatus;
  getAppPrice: (app: Appointment) => number;
  getTussCode: (app: Appointment) => string;
  getAmsNeuropsicoSessionIndex: (app: Appointment) => number;
  getPlanProcedures: (app: Appointment) => PlanProcedureInfo[];
  onClose: () => void;
  onPlanChange: (plan: HealthPlan) => void;
  onBatchNumberChange: (value: string) => void;
  onPatientFilterChange: (value: string) => void;
  onMonthFilterChange: (value: string) => void;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onConfirmAppointment: (id: string, e: React.MouseEvent) => void;
  onIgnoreAppointment: (id: string, e: React.MouseEvent) => void;
  onUnignoreAppointment: (id: string, e: React.MouseEvent) => void;
  onToggleNeuropsico: (id: string, value: boolean) => void;
  onIncludePrevMonthChange: (value: boolean) => void;
  includeNextMonth: boolean;
  onIncludeNextMonthChange: (value: boolean) => void;
  autoSaveStatus?: 'idle' | 'saving' | 'saved';
  onSaveAsDraft: () => void;
  onQuickAddToDraft: (id: string, e: React.MouseEvent) => void;
  onOverrideProcedureCode: (id: string, newCode: string) => void;
  onOverridePrice?: (id: string, newPrice: number) => void;
  onSubmit: () => void;
  onFinalizeDraft?: () => void;
}

function parseMonthFilter(monthFilter: string) {
  const now = new Date();
  if (!monthFilter || !/^\d{4}-\d{2}$/.test(monthFilter)) return { month: now.getMonth() + 1, year: now.getFullYear() };
  const [y, m] = monthFilter.split('-').map(Number);
  return { month: m, year: y };
}

export const CreateBatchModal: React.FC<Props> = ({
  isOpen, selectedPlan, batchNumber, patientFilter, monthFilter,
  selectedAppointmentIds, neuropsicoDecisions, customers, psychologists, plans,
  eligibleAppointments, totalSelectedAmount, editingDraftBatch, includePrevMonth, blockedPlans,
  pendingCountByPlan,
  getNeuropsicoStatus, getAppPrice, getTussCode, getAmsNeuropsicoSessionIndex, getPlanProcedures,
  onClose, onPlanChange, onBatchNumberChange,
  onPatientFilterChange, onMonthFilterChange, onToggleSelection, onSelectAll,
  onConfirmAppointment, onIgnoreAppointment, onUnignoreAppointment, onToggleNeuropsico, onIncludePrevMonthChange,
  includeNextMonth, onIncludeNextMonthChange, autoSaveStatus, onSaveAsDraft, onQuickAddToDraft,
  onOverrideProcedureCode, onOverridePrice, onSubmit, onFinalizeDraft,
}) => {
  const [showConfirm, setShowConfirm] = useState<false | 'send' | 'finalize'>(false);
  const isDraftMode = !!editingDraftBatch;

  const { month: filterMonth, year: filterYear } = parseMonthFilter(monthFilter);
  const monthLabel = monthFilter ? `${MONTH_NAMES[filterMonth - 1]}/${filterYear}` : '—';

  const prevMonthLabel = useMemo(() => {
    if (!monthFilter) return '';
    const [y, m] = monthFilter.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`;
  }, [monthFilter]);

  const nextMonthLabel = useMemo(() => {
    if (!monthFilter) return '';
    const [y, m] = monthFilter.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`;
  }, [monthFilter]);

  const handleMonthChange = (newMonth: number) => onMonthFilterChange(`${filterYear}-${String(newMonth).padStart(2, '0')}`);
  const handleYearChange  = (newYear: number)  => onMonthFilterChange(`${newYear}-${String(filterMonth).padStart(2, '0')}`);

  // ── Lookup Maps ──────────────────────────────────────────────────────────
  const customerMap     = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const psychologistMap = useMemo(() => new Map(psychologists.map(p => [p.id, p])), [psychologists]);
  const planByNameMap   = useMemo(() => { const m = new Map<string, Plan>(); plans.forEach(p => m.set(p.name.toUpperCase(), p)); return m; }, [plans]);

  const duplicateKeys = useMemo(() => {
    const kc = new Map<string, number>();
    eligibleAppointments.forEach(a => { const k = `${a.customerId}-${a.date}`; kc.set(k, (kc.get(k) || 0) + 1); });
    return kc;
  }, [eligibleAppointments]);

  const sessionLimitMap = useMemo(() => {
    const m = new Map<string, number>();
    customers.forEach(c => {
      const plan = planByNameMap.get((c.healthPlan ?? '').toUpperCase());
      plan?.procedures?.forEach(proc => { if (proc.maxSessionsPerMonth && proc.maxSessionsPerMonth > 0) m.set(`${c.id}-${proc.type}`, proc.maxSessionsPerMonth); });
    });
    return m;
  }, [customers, planByNameMap]);

  const selectedCountMap = useMemo(() => {
    const m = new Map<string, number>(); const ss = new Set(selectedAppointmentIds);
    eligibleAppointments.forEach(a => { if (!ss.has(a.id)) return; const k = `${a.customerId}-${a.type}`; m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [selectedAppointmentIds, eligibleAppointments]);

  const sessionWarnings = useMemo(() => {
    const warnings: { customerName: string; type: AppointmentType; count: number; limit: number }[] = [];
    const seen = new Set<string>();
    for (const id of selectedAppointmentIds) {
      const app = eligibleAppointments.find(a => a.id === id);
      if (!app) continue;
      const key = `${app.customerId}-${app.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const limit = sessionLimitMap.get(key);
      if (!limit) continue;
      const count = selectedCountMap.get(key) || 0;
      if (count > limit) { const customer = customerMap.get(app.customerId); warnings.push({ customerName: customer?.name || '', type: app.type, count, limit }); }
    }
    return warnings;
  }, [selectedAppointmentIds, eligibleAppointments, sessionLimitMap, selectedCountMap, customerMap]);

  const filteredAppointments = useMemo(() => {
    if (!patientFilter.trim()) return eligibleAppointments;
    const lower = patientFilter.toLowerCase();
    return eligibleAppointments.filter(app => customerMap.get(app.customerId)?.name?.toLowerCase().includes(lower));
  }, [eligibleAppointments, patientFilter, customerMap]);

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    filteredAppointments.forEach(app => { const list = map.get(app.customerId); if (list) list.push(app); else map.set(app.customerId, [app]); });
    return Array.from(map.entries()).map(([customerId, apps]) => ({ customer: customerMap.get(customerId), appointments: apps }));
  }, [filteredAppointments, customerMap]);

  // allSelected considera apenas atendimentos NÃO ignorados (ignorados são visíveis mas não selecionáveis)
  const selectableCount = filteredAppointments.filter(a => !a.billingIgnored).length;
  const allSelected = selectableCount > 0 && filteredAppointments.filter(a => !a.billingIgnored).every(a => selectedAppointmentIds.includes(a.id));
  const uniquePatients = useMemo(() => {
    const ss = new Set(selectedAppointmentIds);
    return new Set(eligibleAppointments.filter(a => ss.has(a.id)).map(a => a.customerId)).size;
  }, [eligibleAppointments, selectedAppointmentIds]);

  const modalTitle = isDraftMode ? `✏️ Editar Rascunho — ${editingDraftBatch!.healthPlan}` : 'Novo Lote de Faturamento';

  // ── Confirmation Step ────────────────────────────────────────────────────
  if (showConfirm) {
    return (
      <ConfirmBatchStep
        isOpen={isOpen} mode={showConfirm} selectedPlan={selectedPlan} monthLabel={monthLabel}
        batchNumber={batchNumber} uniquePatients={uniquePatients} selectedCount={selectedAppointmentIds.length}
        totalAmount={totalSelectedAmount} sessionWarnings={sessionWarnings}
        onBack={() => setShowConfirm(false)}
        onConfirm={() => { setShowConfirm(false); showConfirm === 'finalize' ? onFinalizeDraft?.() : onSubmit(); }}
      />
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} className="max-w-4xl">
      <div className="space-y-4">
        {isDraftMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="p-1.5 bg-amber-100 rounded-lg"><Save size={14} className="text-amber-700" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">Editando rascunho</p>
              <p className="text-xs text-amber-700 truncate">{selectedAppointmentIds.length} atendimento(s) • {formatCurrency(totalSelectedAmount)} previstos</p>
            </div>
            {autoSaveStatus === 'saving' && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 shrink-0">
                <Loader2 size={13} className="animate-spin" />
                <span>Salvando...</span>
              </div>
            )}
            {autoSaveStatus === 'saved' && (
              <div className="flex items-center gap-1.5 text-xs text-green-600 shrink-0">
                <CheckCircle2 size={13} />
                <span>Salvo</span>
              </div>
            )}
          </div>
        )}

        <BatchFilters
          selectedPlan={selectedPlan} filterMonth={filterMonth} filterYear={filterYear}
          monthLabel={monthLabel} prevMonthLabel={prevMonthLabel} nextMonthLabel={nextMonthLabel}
          includePrevMonth={includePrevMonth} includeNextMonth={includeNextMonth}
          isDraftMode={isDraftMode} blockedPlans={blockedPlans}
          pendingCountByPlan={pendingCountByPlan}
          onPlanChange={onPlanChange} onMonthChange={handleMonthChange} onYearChange={handleYearChange}
          onIncludePrevMonthChange={onIncludePrevMonthChange} onIncludeNextMonthChange={onIncludeNextMonthChange}
        />

        <BatchAppointmentList
          patientFilter={patientFilter} monthFilter={monthFilter} monthLabel={monthLabel}
          prevMonthLabel={prevMonthLabel} includePrevMonth={includePrevMonth} includeNextMonth={includeNextMonth}
          allSelected={allSelected} eligibleAppointments={eligibleAppointments} grouped={grouped}
          selectedAppointmentIds={selectedAppointmentIds} neuropsicoDecisions={neuropsicoDecisions}
          sessionLimitMap={sessionLimitMap} selectedCountMap={selectedCountMap} duplicateKeys={duplicateKeys}
          isDraftMode={isDraftMode} editingDraftBatch={editingDraftBatch}
          uniquePatients={uniquePatients} totalSelectedAmount={totalSelectedAmount} sessionWarnings={sessionWarnings}
          psychologistMap={psychologistMap} getAppPrice={getAppPrice} getTussCode={getTussCode}
          getNeuropsicoStatus={getNeuropsicoStatus}
          getAmsNeuropsicoSessionIndex={getAmsNeuropsicoSessionIndex}
          getPlanProcedures={getPlanProcedures}
          onPatientFilterChange={onPatientFilterChange} onSelectAll={onSelectAll}
          onToggleSelection={onToggleSelection} onConfirmAppointment={onConfirmAppointment}
          onIgnoreAppointment={onIgnoreAppointment} onUnignoreAppointment={onUnignoreAppointment}
          onToggleNeuropsico={onToggleNeuropsico}
          onQuickAddToDraft={onQuickAddToDraft}
          onOverrideProcedureCode={onOverrideProcedureCode}
          onOverridePrice={onOverridePrice}
        />

        {/* Número do lote + ações */}
        <div className="border-t border-zinc-100 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-priori-navy mb-1 flex items-center gap-1.5">
                <FileText size={13} /> Número do Lote / Protocolo
              </label>
              <Input value={batchNumber} onChange={e => onBatchNumberChange(e.target.value)} />
              <p className="text-xs text-zinc-400 mt-1">
                {batchNumber.startsWith('RASCUNHO-')
                  ? 'Número provisório. Será gerado o número final ao finalizar o lote.'
                  : 'Gerado automaticamente. Pode editar se necessário.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                variant="outline" onClick={onSaveAsDraft}
                disabled={selectedAppointmentIds.length === 0}
                className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 flex items-center gap-1.5"
              >
                <Save size={15} />
                {isDraftMode ? 'Atualizar Rascunho' : 'Salvar Rascunho'}
              </Button>
              {isDraftMode ? (
                <Button
                  onClick={() => setShowConfirm('finalize')}
                  disabled={!batchNumber || selectedAppointmentIds.length === 0}
                  className="bg-priori-navy hover:bg-priori-navy/90 flex items-center gap-2"
                >
                  <Send size={15} /> Finalizar e Enviar <ChevronRight size={16} />
                </Button>
              ) : (
                <Button
                  onClick={() => setShowConfirm('send')}
                  disabled={!batchNumber || selectedAppointmentIds.length === 0}
                  className="bg-priori-navy hover:bg-priori-navy/90 flex items-center gap-2"
                >
                  Revisar e Gerar Lote <ChevronRight size={16} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
