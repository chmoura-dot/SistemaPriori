import React, { useMemo, useState } from 'react';
import {
  Ban, AlertTriangle, Calendar, ChevronRight, Users, FileText,
  BookmarkPlus, Save, Send, CheckCircle2, Info
} from 'lucide-react';
import { format } from 'date-fns';
import {
  HealthPlan, Appointment, Customer, Psychologist, Plan,
  AppointmentType, BillingBatch
} from '../../services/types';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Input } from '../Input';
import { cn, formatCurrency } from '../../lib/utils';

// ── Constantes ────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// ── Types ─────────────────────────────────────────────────────────────────────
type NeuropsicoStatus =
  | { type: 'regular' }
  | { type: 'billable'; diffDays?: number }
  | { type: 'blocked'; diffDays: number }
  | { type: 'ask'; diffDays: number };

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
  // Rascunho
  editingDraftBatch?: BillingBatch | null;
  includePrevMonth: boolean;
  getNeuropsicoStatus: (app: Appointment) => NeuropsicoStatus;
  getAppPrice: (app: Appointment) => number;
  onClose: () => void;
  onPlanChange: (plan: HealthPlan) => void;
  onBatchNumberChange: (value: string) => void;
  onPatientFilterChange: (value: string) => void;
  onMonthFilterChange: (value: string) => void;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onConfirmAppointment: (id: string, e: React.MouseEvent) => void;
  onIgnoreAppointment: (id: string, e: React.MouseEvent) => void;
  onToggleNeuropsico: (id: string, value: boolean) => void;
  onIncludePrevMonthChange: (value: boolean) => void;
  includeNextMonth: boolean;
  onIncludeNextMonthChange: (value: boolean) => void;
  /** Salvar como rascunho sem passar pela etapa de confirmação */
  onSaveAsDraft: () => void;
  /** Adicionar UM atendimento rapidamente ao rascunho (botão por linha) */
  onQuickAddToDraft: (id: string, e: React.MouseEvent) => void;
  /** Criar lote como ENVIADO (após confirmação) */
  onSubmit: () => void;
  /** Finalizar rascunho existente → ENVIADO (após confirmação) */
  onFinalizeDraft?: () => void;
}

// ── Helper: parse monthFilter safely ─────────────────────────────────────────
function parseMonthFilter(monthFilter: string): { month: number; year: number } {
  const now = new Date();
  if (!monthFilter || !/^\d{4}-\d{2}$/.test(monthFilter)) {
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  const [y, m] = monthFilter.split('-').map(Number);
  return { month: m, year: y };
}

// ── Component ─────────────────────────────────────────────────────────────────
export const CreateBatchModal: React.FC<Props> = ({
  isOpen,
  selectedPlan,
  batchNumber,
  patientFilter,
  monthFilter,
  selectedAppointmentIds,
  neuropsicoDecisions,
  customers,
  psychologists,
  plans,
  eligibleAppointments,
  totalSelectedAmount,
  editingDraftBatch,
  includePrevMonth,
  getNeuropsicoStatus,
  getAppPrice,
  onClose,
  onPlanChange,
  onBatchNumberChange,
  onPatientFilterChange,
  onMonthFilterChange,
  onToggleSelection,
  onSelectAll,
  onConfirmAppointment,
  onIgnoreAppointment,
  onToggleNeuropsico,
  onIncludePrevMonthChange,
  includeNextMonth,
  onIncludeNextMonthChange,
  onSaveAsDraft,
  onQuickAddToDraft,
  onSubmit,
  onFinalizeDraft,
}) => {
  // showConfirm: 'send' para gerar lote, 'finalize' para finalizar rascunho
  const [showConfirm, setShowConfirm] = useState<false | 'send' | 'finalize'>(false);

  const isDraftMode = !!editingDraftBatch;

  // ── Month/Year picker state ────────────────────────────────────────────────
  const { month: filterMonth, year: filterYear } = parseMonthFilter(monthFilter);

  const monthLabel = monthFilter
    ? `${MONTH_NAMES[filterMonth - 1]}/${filterYear}`
    : '—';

  // Mês anterior (para exibição no toggle)
  const prevMonthLabel = useMemo(() => {
    if (!monthFilter) return '';
    const [y, m] = monthFilter.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`;
  }, [monthFilter]);

  // Mês seguinte (para exibição no toggle)
  const nextMonthLabel = useMemo(() => {
    if (!monthFilter) return '';
    const [y, m] = monthFilter.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`;
  }, [monthFilter]);

  const handleMonthSelectChange = (newMonth: number) => {
    const mm = String(newMonth).padStart(2, '0');
    onMonthFilterChange(`${filterYear}-${mm}`);
  };

  const handleYearSelectChange = (newYear: number) => {
    const mm = String(filterMonth).padStart(2, '0');
    onMonthFilterChange(`${newYear}-${mm}`);
  };

  // ── Filter appointments by patient name ───────────────────────────────────
  const filteredAppointments = useMemo(() => {
    if (!patientFilter.trim()) return eligibleAppointments;
    return eligibleAppointments.filter(app => {
      const customer = customers.find(c => c.id === app.customerId);
      return customer?.name?.toLowerCase().includes(patientFilter.toLowerCase());
    });
  }, [eligibleAppointments, patientFilter, customers]);

  // ── Group appointments by patient ─────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    filteredAppointments.forEach(app => {
      const list = map.get(app.customerId) || [];
      map.set(app.customerId, [...list, app]);
    });
    return Array.from(map.entries()).map(([customerId, apps]) => ({
      customer: customers.find(c => c.id === customerId),
      appointments: apps,
    }));
  }, [filteredAppointments, customers]);

  // ── Duplicate detection (same patient + same date) ────────────────────────
  const duplicateKeys = useMemo(() => {
    const keyCount = new Map<string, number>();
    eligibleAppointments.forEach(a => {
      const key = `${a.customerId}-${a.date}`;
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });
    return keyCount;
  }, [eligibleAppointments]);

  const isDuplicate = (app: Appointment) =>
    (duplicateKeys.get(`${app.customerId}-${app.date}`) || 0) > 1;

  // ── Session limit helpers ─────────────────────────────────────────────────
  const getSessionLimit = (customerId: string, type: AppointmentType): number | undefined => {
    const customer = customers.find(c => c.id === customerId);
    const plan = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
    const procedure = plan?.procedures?.find(proc => proc.type === type);
    return procedure?.maxSessionsPerMonth && procedure.maxSessionsPerMonth > 0
      ? procedure.maxSessionsPerMonth
      : undefined;
  };

  const getSelectedCountForCustomerType = (customerId: string, type: AppointmentType): number =>
    eligibleAppointments.filter(
      a => a.customerId === customerId && a.type === type && selectedAppointmentIds.includes(a.id)
    ).length;

  // ── Session warnings ──────────────────────────────────────────────────────
  const sessionWarnings = useMemo(() => {
    const warnings: { customerName: string; type: AppointmentType; count: number; limit: number }[] = [];
    const seen = new Set<string>();
    for (const id of selectedAppointmentIds) {
      const app = eligibleAppointments.find(a => a.id === id);
      if (!app) continue;
      const key = `${app.customerId}-${app.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const limit = getSessionLimit(app.customerId, app.type);
      if (!limit) continue;
      const count = getSelectedCountForCustomerType(app.customerId, app.type);
      if (count > limit) {
        const customer = customers.find(c => c.id === app.customerId);
        warnings.push({ customerName: customer?.name || '', type: app.type, count, limit });
      }
    }
    return warnings;
  }, [selectedAppointmentIds, eligibleAppointments, customers, plans]);

  // ── TUSS code ─────────────────────────────────────────────────────────────
  const getTussCode = (app: Appointment): string => {
    if (app.procedureCode) return app.procedureCode;
    const customer = customers.find(c => c.id === app.customerId);
    const plan = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
    return plan?.procedures?.find(proc => proc.type === app.type)?.code || '';
  };

  const allSelected =
    filteredAppointments.length > 0 &&
    selectedAppointmentIds.length === eligibleAppointments.length;

  const uniquePatients = new Set(
    eligibleAppointments.filter(a => selectedAppointmentIds.includes(a.id)).map(a => a.customerId)
  ).size;

  // ── Título do modal ───────────────────────────────────────────────────────
  const modalTitle = isDraftMode
    ? `✏️ Editar Rascunho — ${editingDraftBatch!.healthPlan}`
    : 'Novo Lote de Faturamento';

  // ── Confirmation Step ─────────────────────────────────────────────────────
  if (showConfirm) {
    const isFinalize = showConfirm === 'finalize';
    const confirmTitle = isFinalize ? 'Finalizar e Enviar Rascunho' : 'Confirmar Criação do Lote';
    const confirmAction = isFinalize ? onFinalizeDraft : onSubmit;
    const confirmLabel = sessionWarnings.length > 0
      ? isFinalize ? 'Finalizar Assim Mesmo' : 'Criar Assim Mesmo'
      : isFinalize ? '🚀 Finalizar e Enviar' : 'Confirmar e Criar';

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={confirmTitle}
        className="max-w-lg"
      >
        <div className="space-y-5">
          {sessionWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-semibold text-amber-800 mb-2">Limite de sessões excedido</p>
                <ul className="space-y-1">
                  {sessionWarnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-700">
                      • <strong>{w.customerName}</strong>:{' '}
                      <span className="font-semibold">{w.count}</span> sess. de{' '}
                      <em>{w.type}</em> (limite do plano: {w.limit}/mês)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {isFinalize && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
              <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={15} />
              <p className="text-xs text-blue-700">
                Ao finalizar, o rascunho será convertido em um lote oficial enviado à operadora.
                O número do lote será gerado automaticamente.
              </p>
            </div>
          )}

          <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Resumo do Lote</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              <div className="text-zinc-500">Operadora</div>
              <div className="font-medium text-priori-navy">{selectedPlan}</div>
              <div className="text-zinc-500">Competência</div>
              <div className="font-medium text-priori-navy capitalize">{monthLabel}</div>
              <div className="text-zinc-500">Nº do Lote</div>
              <div className="font-medium text-priori-navy font-mono">{batchNumber}</div>
              <div className="text-zinc-500">Pacientes</div>
              <div className="font-medium text-priori-navy">{uniquePatients}</div>
              <div className="text-zinc-500">Atendimentos</div>
              <div className="font-medium text-priori-navy">{selectedAppointmentIds.length}</div>
              <div className="text-zinc-500 font-semibold border-t border-zinc-200 pt-2 mt-1">Total</div>
              <div className="font-bold text-priori-navy text-base border-t border-zinc-200 pt-2 mt-1">
                {formatCurrency(totalSelectedAmount)}
              </div>
            </div>
          </div>

          <p className="text-sm text-zinc-500">
            {sessionWarnings.length > 0
              ? 'Deseja prosseguir mesmo com as advertências acima?'
              : isFinalize
                ? 'Tudo certo! Confirmar finalização e envio do lote?'
                : 'Tudo certo! Confirmar criação do lote?'}
          </p>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Voltar e Revisar
            </Button>
            <Button
              onClick={() => { setShowConfirm(false); confirmAction?.(); }}
              className="bg-priori-navy hover:bg-priori-navy/90 flex items-center gap-2"
            >
              {isFinalize && <Send size={15} />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Main Selection Step ───────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      className="max-w-4xl"
    >
      <div className="space-y-4">

        {/* Banner: modo edição de rascunho */}
        {isDraftMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <Save size={14} className="text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800">Editando rascunho</p>
              <p className="text-xs text-amber-700 truncate">
                {editingDraftBatch!.appointmentIds.length} atendimento(s) já no rascunho •{' '}
                {formatCurrency(editingDraftBatch!.totalAmount)} previstos
              </p>
            </div>
          </div>
        )}

        {/* Row 1: Operadora + Competência */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Operadora */}
          <div>
            <label className="block text-sm font-medium text-priori-navy mb-1">Operadora</label>
            <select
              value={selectedPlan}
              onChange={(e) => onPlanChange(e.target.value as HealthPlan)}
              disabled={isDraftMode}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {Object.values(HealthPlan).map(plan => (
                <option key={plan} value={plan}>{plan}</option>
              ))}
            </select>
          </div>

          {/* Competência — dois selects lado a lado */}
          <div>
            <label className="block text-sm font-medium text-priori-navy mb-1 flex items-center gap-1.5">
              <Calendar size={13} />
              Competência
            </label>
            <div className="flex gap-2">
              {/* Mês */}
              <select
                value={filterMonth}
                onChange={(e) => handleMonthSelectChange(Number(e.target.value))}
                disabled={isDraftMode}
                className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>{name}</option>
                ))}
              </select>
              {/* Ano */}
              <select
                value={filterYear}
                onChange={(e) => handleYearSelectChange(Number(e.target.value))}
                disabled={isDraftMode}
                className="w-28 rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {YEAR_OPTIONS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Label de competência + toggle mês anterior */}
            <div className="flex items-center justify-between mt-1.5 ml-1">
              <p className="text-xs text-zinc-400">
                Exibindo: <span className="font-medium text-priori-navy capitalize">{monthLabel}</span>
                {includePrevMonth && prevMonthLabel && (
                  <span className="ml-1 text-amber-600">+ {prevMonthLabel}</span>
                )}
                {includeNextMonth && nextMonthLabel && (
                  <span className="ml-1 text-blue-600">+ {nextMonthLabel}</span>
                )}
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={includePrevMonth}
                    onChange={(e) => onIncludePrevMonthChange(e.target.checked)}
                    className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs text-zinc-500 group-hover:text-amber-700 font-medium">
                    Incluir mês anterior
                  </span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={includeNextMonth}
                    onChange={(e) => onIncludeNextMonthChange(e.target.checked)}
                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-zinc-500 group-hover:text-blue-700 font-medium">
                    Incluir próximo mês
                  </span>
                </label>
              </div>
            </div>

            {includePrevMonth && prevMonthLabel && (
              <div className="mt-1.5 ml-1 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                <Info size={11} className="flex-shrink-0" />
                Mostrando atendimentos de <strong>{prevMonthLabel}</strong> e <strong>{monthLabel}</strong> — use para incluir atendimentos esquecidos no lote anterior.
              </div>
            )}
            {includeNextMonth && nextMonthLabel && (
              <div className="mt-1.5 ml-1 flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
                <Info size={11} className="flex-shrink-0" />
                Mostrando atendimentos de <strong>{monthLabel}</strong> e <strong>{nextMonthLabel}</strong> — use para antecipar atendimentos do próximo mês neste lote.
              </div>
            )}
          </div>
        </div>

        {/* Appointments List */}
        <div className="border-t border-zinc-100 pt-3">

          {/* Filter + SelectAll */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              placeholder="Filtrar por paciente..."
              value={patientFilter}
              onChange={(e) => onPatientFilterChange(e.target.value)}
              className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy"
            />
            <div className="flex items-center gap-4 text-sm justify-between sm:justify-end">
              <span className="text-zinc-500 font-medium">
                {selectedAppointmentIds.length} selecionados
              </span>
              {eligibleAppointments.length > 0 && (
                <button
                  onClick={onSelectAll}
                  className="text-priori-navy hover:text-priori-navy/80 hover:underline font-semibold"
                >
                  {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </button>
              )}
            </div>
          </div>

          {/* Grouped list */}
          <div className="max-h-[380px] overflow-y-auto border border-zinc-100 rounded-xl">
            {grouped.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">
                {patientFilter.trim()
                  ? 'Nenhum atendimento encontrado para este paciente.'
                  : `Nenhum atendimento disponível em ${monthLabel}${includePrevMonth && prevMonthLabel ? ` / ${prevMonthLabel}` : ''}.`}
              </div>
            ) : (
              grouped.map(({ customer, appointments: apps }) => {
                const appTypes = [...new Set(apps.map(a => a.type))];
                const selectedForThisPatient = apps.filter(a => selectedAppointmentIds.includes(a.id));
                const patientTotal = selectedForThisPatient.reduce((sum, a) => sum + getAppPrice(a), 0);
                const hasWarning = appTypes.some(type => {
                  const limit = getSessionLimit(customer?.id || '', type);
                  if (!limit) return false;
                  return getSelectedCountForCustomerType(customer?.id || '', type) > limit;
                });

                return (
                  <div key={customer?.id} className="divide-y divide-zinc-50">
                    {/* Patient header */}
                    <div className="bg-zinc-50 px-4 py-2 flex items-center justify-between border-b border-zinc-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Users size={13} className="text-zinc-400 flex-shrink-0" />
                        <span className={cn(
                          'font-semibold text-sm',
                          hasWarning ? 'text-amber-700' : 'text-priori-navy'
                        )}>
                          {customer?.name}
                        </span>
                        {appTypes.map(type => {
                          const count = getSelectedCountForCustomerType(customer?.id || '', type);
                          if (count === 0) return null;
                          const limit = getSessionLimit(customer?.id || '', type);
                          const exceeded = limit ? count > limit : false;
                          return (
                            <span
                              key={type}
                              title={`${type}: ${count}${limit ? `/${limit}` : ''} sessões selecionadas`}
                              className={cn(
                                'text-[10px] px-2 py-0.5 rounded-full font-semibold border',
                                exceeded
                                  ? 'bg-red-50 text-red-600 border-red-200'
                                  : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              )}
                            >
                              {count}{limit ? `/${limit}` : ''} sess.{exceeded ? ' ⚠️' : ''}
                            </span>
                          );
                        })}
                      </div>
                      {selectedForThisPatient.length > 0 && (
                        <span className="text-xs font-medium text-zinc-400">{formatCurrency(patientTotal)}</span>
                      )}
                    </div>

                    {/* Appointment rows */}
                    {apps.map(app => {
                      const psychologist = psychologists.find(p => p.id === app.psychologistId);
                      const neuropsicoStatus = getNeuropsicoStatus(app);
                      const basePrice = getAppPrice(app);
                      const isConfirmed = app.confirmedPsychologist === true;
                      const tussCode = getTussCode(app);
                      const duplic = isDuplicate(app);
                      // Indica se este atendimento já estava no rascunho antes de abrir o modal
                      const isAlreadyInDraft =
                        isDraftMode &&
                        editingDraftBatch!.appointmentIds.includes(app.id);
                      // Indica se é de mês anterior (label informativo)
                      const appMonth = app.date.substring(0, 7);
                      const isFromPrevMonth = (includePrevMonth || includeNextMonth) && appMonth !== monthFilter;

                      return (
                        <div key={app.id} className="flex flex-col last:border-0">
                          <div
                            className={cn(
                              'flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-50 transition-colors',
                              selectedAppointmentIds.includes(app.id) && 'bg-priori-navy/5',
                              isAlreadyInDraft && !selectedAppointmentIds.includes(app.id) && 'bg-zinc-50/80',
                              isConfirmed ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed bg-zinc-50/50'
                            )}
                            onClick={() => isConfirmed && onToggleSelection(app.id)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedAppointmentIds.includes(app.id)}
                              disabled={!isConfirmed}
                              onChange={() => {}}
                              className="rounded border-zinc-300 text-priori-navy focus:ring-priori-navy disabled:opacity-50 flex-shrink-0"
                            />
                            <div className="text-xs font-semibold text-zinc-600 w-20 flex-shrink-0">
                              {format(new Date(app.date + 'T12:00:00'), 'dd/MM/yy')} {app.startTime}
                            </div>
                            <div className="text-xs text-zinc-400 flex-1 truncate min-w-0">
                              {psychologist?.name}
                            </div>
                            {tussCode && (
                              <span
                                title={`TUSS: ${tussCode} — ${app.type}`}
                                className="text-[10px] text-zinc-400 font-mono bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200 flex-shrink-0 hidden sm:inline"
                              >
                                {tussCode}
                              </span>
                            )}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Badge: mês anterior */}
                              {isFromPrevMonth && (
                                <span
                                  title="Atendimento do mês anterior"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold"
                                >
                                  {appMonth.substring(5, 7)}/{appMonth.substring(0, 4)}
                                </span>
                              )}
                              {/* Badge: já estava no rascunho */}
                              {isAlreadyInDraft && (
                                <span
                                  title="Já estava neste rascunho"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-0.5"
                                >
                                  <CheckCircle2 size={9} />
                                  Rascunho
                                </span>
                              )}
                              {duplic && selectedAppointmentIds.includes(app.id) && (
                                <span
                                  title="Possível duplicata: mesmo paciente com sessão na mesma data"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200"
                                >
                                  Duplicata ⚠️
                                </span>
                              )}
                              {neuropsicoStatus.type === 'blocked' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
                                  Neuropsico R$0
                                </span>
                              )}
                              {neuropsicoStatus.type === 'ask' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                                  ⚠️ Neuropsico
                                </span>
                              )}
                              {!isConfirmed && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                                  Ag. confirmação
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-priori-navy w-20 text-right flex-shrink-0">
                              {formatCurrency(basePrice)}
                            </div>
                            {!isConfirmed && (
                              <Button
                                size="sm"
                                onClick={(e) => onConfirmAppointment(app.id, e)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-xs px-2 h-7 flex-shrink-0"
                              >
                                Confirmar
                              </Button>
                            )}
                            {/* Botão rápido: adicionar ao rascunho (só para atendimentos confirmados e não editando draft) */}
                            {isConfirmed && !isDraftMode && (
                              <button
                                onClick={(e) => onQuickAddToDraft(app.id, e)}
                                className="p-1 text-zinc-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all flex-shrink-0"
                                title="Adicionar ao rascunho agora (sem fechar o modal)"
                              >
                                <BookmarkPlus size={14} />
                              </button>
                            )}
                            <button
                              onClick={(e) => onIgnoreAppointment(app.id, e)}
                              className="p-1 text-zinc-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                              title="Ignorar para faturamento"
                            >
                              <Ban size={14} />
                            </button>
                          </div>

                          {neuropsicoStatus.type === 'ask' && (
                            <div className="bg-amber-50/50 px-12 py-2 flex items-center gap-3 text-xs border-t border-amber-100/50">
                              <span className="text-amber-700 font-medium">Cobrar este atendimento?</span>
                              <div className="flex bg-white rounded-lg border border-amber-200 p-0.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); onToggleNeuropsico(app.id, false); }}
                                  className={cn(
                                    'px-3 py-1 font-semibold rounded-md transition-all',
                                    !neuropsicoDecisions[app.id]
                                      ? 'bg-amber-100 text-amber-800 shadow-sm'
                                      : 'text-zinc-500 hover:bg-zinc-50'
                                  )}
                                >
                                  Não cobrar (R$ 0)
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onToggleNeuropsico(app.id, true); }}
                                  className={cn(
                                    'px-3 py-1 font-semibold rounded-md transition-all',
                                    neuropsicoDecisions[app.id]
                                      ? 'bg-priori-navy text-white shadow-sm'
                                      : 'text-zinc-500 hover:bg-zinc-50'
                                  )}
                                >
                                  Cobrar normal
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Running total */}
          {selectedAppointmentIds.length > 0 && (
            <div className="mt-3 flex items-center justify-between px-4 py-3 bg-priori-navy/5 rounded-xl border border-priori-navy/10">
              <div className="flex items-center gap-3 text-sm text-priori-navy">
                <span className="font-medium">
                  {selectedAppointmentIds.length}{' '}
                  {selectedAppointmentIds.length === 1 ? 'atendimento' : 'atendimentos'}
                </span>
                <span className="text-zinc-400">•</span>
                <span className="text-zinc-500">
                  {uniquePatients} {uniquePatients === 1 ? 'paciente' : 'pacientes'}
                </span>
              </div>
              <span className="text-lg font-bold text-priori-navy">{formatCurrency(totalSelectedAmount)}</span>
            </div>
          )}

          {/* Session warnings banner */}
          {sessionWarnings.length > 0 && selectedAppointmentIds.length > 0 && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={15} />
              <div className="text-xs text-amber-700 space-y-0.5">
                {sessionWarnings.map((w, i) => (
                  <p key={i}>
                    <strong>{w.customerName}</strong>: {w.count}/{w.limit} sessões de {w.type} — excede o limite do plano
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Batch number + actions */}
        <div className="border-t border-zinc-100 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-priori-navy mb-1 flex items-center gap-1.5">
                <FileText size={13} />
                Número do Lote / Protocolo
              </label>
              <Input
                value={batchNumber}
                onChange={(e) => onBatchNumberChange(e.target.value)}
              />
              <p className="text-xs text-zinc-400 mt-1">
                {batchNumber.startsWith('RASCUNHO-')
                  ? 'Número provisório. Será gerado o número final ao finalizar o lote.'
                  : 'Gerado automaticamente. Pode editar se necessário.'}
              </p>
            </div>

            {/* Botões de ação */}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>

              {/* Salvar como Rascunho */}
              <Button
                variant="outline"
                onClick={onSaveAsDraft}
                disabled={selectedAppointmentIds.length === 0}
                className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 flex items-center gap-1.5"
              >
                <Save size={15} />
                {isDraftMode ? 'Atualizar Rascunho' : 'Salvar Rascunho'}
              </Button>

              {/* Revisar e Gerar / Finalizar */}
              {isDraftMode ? (
                <Button
                  onClick={() => setShowConfirm('finalize')}
                  disabled={!batchNumber || selectedAppointmentIds.length === 0}
                  className="bg-priori-navy hover:bg-priori-navy/90 flex items-center gap-2"
                >
                  <Send size={15} />
                  Finalizar e Enviar
                  <ChevronRight size={16} />
                </Button>
              ) : (
                <Button
                  onClick={() => setShowConfirm('send')}
                  disabled={!batchNumber || selectedAppointmentIds.length === 0}
                  className="bg-priori-navy hover:bg-priori-navy/90 flex items-center gap-2"
                >
                  Revisar e Gerar Lote
                  <ChevronRight size={16} />
                </Button>
              )}
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
};
