/**
 * BatchAppointmentList
 * Renderiza a lista agrupada de atendimentos elegíveis dentro do modal de criação de lote.
 * Extraído de CreateBatchModal para manter cada arquivo abaixo de 300 linhas.
 */
import React from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { Appointment, Customer, Plan, BillingBatch, AppointmentType } from '../../services/types';
import { cn, formatCurrency } from '../../lib/utils';
import { AppointmentRow } from './AppointmentRow';
import { PlanProcedureInfo } from '../../hooks/billing/billingHelpers';

type NeuropsicoStatus =
  | { type: 'regular' }
  | { type: 'billable'; diffDays?: number }
  | { type: 'blocked'; diffDays: number };

interface SessionWarning {
  customerName: string;
  type: AppointmentType;
  count: number;
  limit: number;
}

interface Props {
  patientFilter: string;
  monthFilter: string;
  monthLabel: string;
  prevMonthLabel: string;
  includePrevMonth: boolean;
  includeNextMonth: boolean;
  allSelected: boolean;
  eligibleAppointments: Appointment[];
  grouped: { customer: Customer | undefined; appointments: Appointment[] }[];
  selectedAppointmentIds: string[];
  neuropsicoDecisions: Record<string, boolean>;
  sessionLimitMap: Map<string, number>;
  selectedCountMap: Map<string, number>;
  duplicateKeys: Map<string, number>;
  isDraftMode: boolean;
  editingDraftBatch?: BillingBatch | null;
  uniquePatients: number;
  totalSelectedAmount: number;
  sessionWarnings: SessionWarning[];
  psychologistMap: Map<string, { name: string }>;
  getAppPrice: (app: Appointment) => number;
  getTussCode: (app: Appointment) => string;
  getNeuropsicoStatus: (app: Appointment) => NeuropsicoStatus;
  getAmsNeuropsicoSessionIndex: (app: Appointment) => number;
  getPlanProcedures: (app: Appointment) => PlanProcedureInfo[];
  onPatientFilterChange: (value: string) => void;
  onSelectAll: () => void;
  onToggleSelection: (id: string) => void;
  onConfirmAppointment: (id: string, e: React.MouseEvent) => void;
  onIgnoreAppointment: (id: string, e: React.MouseEvent) => void;
  onUnignoreAppointment: (id: string, e: React.MouseEvent) => void;
  onToggleNeuropsico: (id: string, value: boolean) => void;
  onQuickAddToDraft: (id: string, e: React.MouseEvent) => void;
  onOverrideProcedureCode: (id: string, newCode: string) => void;
}

export const BatchAppointmentList: React.FC<Props> = ({
  patientFilter, monthFilter, monthLabel, prevMonthLabel,
  includePrevMonth, includeNextMonth, allSelected,
  eligibleAppointments, grouped, selectedAppointmentIds, neuropsicoDecisions,
  sessionLimitMap, selectedCountMap, duplicateKeys,
  isDraftMode, editingDraftBatch, uniquePatients, totalSelectedAmount, sessionWarnings,
  psychologistMap, getAppPrice, getTussCode, getNeuropsicoStatus,
  getAmsNeuropsicoSessionIndex, getPlanProcedures,
  onPatientFilterChange, onSelectAll, onToggleSelection,
  onConfirmAppointment, onIgnoreAppointment, onUnignoreAppointment, onToggleNeuropsico, onQuickAddToDraft,
  onOverrideProcedureCode,
}) => (
  <div className="border-t border-zinc-100 pt-3">
    {/* Filtro por paciente + Selecionar todos */}
    <div className="flex flex-col sm:flex-row gap-2 mb-3">
      <input
        type="text"
        placeholder="Filtrar por paciente..."
        value={patientFilter}
        onChange={e => onPatientFilterChange(e.target.value)}
        className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy"
      />
      <div className="flex items-center gap-4 text-sm justify-between sm:justify-end">
        <span className="text-zinc-500 font-medium">{selectedAppointmentIds.length} selecionados</span>
        {eligibleAppointments.length > 0 && (
          <button onClick={onSelectAll} className="text-priori-navy hover:text-priori-navy/80 hover:underline font-semibold">
            {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
          </button>
        )}
      </div>
    </div>

    {/* Lista agrupada por paciente */}
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
          const patientTotal = selectedForThisPatient.reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;
          const hasWarning   = appTypes.some(type => {
            const key   = `${customer?.id}-${type}`;
            const limit = sessionLimitMap.get(key);
            return limit ? (selectedCountMap.get(key) || 0) > limit : false;
          });

          return (
            <div key={customer?.id} className="divide-y divide-zinc-50">
              {/* Cabeçalho do paciente */}
              <div className="bg-zinc-50 px-4 py-2 flex items-center justify-between border-b border-zinc-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <Users size={13} className="text-zinc-400 flex-shrink-0" />
                  <span className={cn('font-semibold text-sm', hasWarning ? 'text-amber-700' : 'text-priori-navy')}>
                    {customer?.name}
                  </span>
                  {appTypes.map(type => {
                    const key     = `${customer?.id}-${type}`;
                    const count   = selectedCountMap.get(key) || 0;
                    if (count === 0) return null;
                    const limit    = sessionLimitMap.get(key);
                    const exceeded = limit ? count > limit : false;
                    return (
                      <span
                        key={type}
                        title={`${type}: ${count}${limit ? `/${limit}` : ''} sessões selecionadas`}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full font-semibold border',
                          exceeded ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
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

              {/* Linhas de atendimento */}
              {apps.map(app => (
                <AppointmentRow
                  key={app.id}
                  app={app}
                  psychologistName={psychologistMap.get(app.psychologistId)?.name || ''}
                  tussCode={getTussCode(app)}
                  neuropsicoStatus={getNeuropsicoStatus(app)}
                  neuropsicoDecision={neuropsicoDecisions[app.id] ?? false}
                  basePrice={getAppPrice(app)}
                  isSelected={selectedAppointmentIds.includes(app.id)}
                  isDuplicate={(duplicateKeys.get(`${app.customerId}-${app.date}`) || 0) > 1}
                  isAlreadyInDraft={isDraftMode && editingDraftBatch ? editingDraftBatch.appointmentIds.includes(app.id) : false}
                  isDraftMode={isDraftMode}
                  monthFilter={monthFilter}
                  includePrevMonth={includePrevMonth}
                  includeNextMonth={includeNextMonth}
                  amsSessionIndex={getAmsNeuropsicoSessionIndex(app)}
                  planProcedures={getPlanProcedures(app)}
                  onToggleSelection={onToggleSelection}
                  onConfirmAppointment={onConfirmAppointment}
                  onIgnoreAppointment={onIgnoreAppointment}
                  onUnignoreAppointment={onUnignoreAppointment}
                  onToggleNeuropsico={onToggleNeuropsico}
                  onQuickAddToDraft={onQuickAddToDraft}
                  onOverrideProcedureCode={onOverrideProcedureCode}
                />
              ))}
            </div>
          );
        })
      )}
    </div>

    {/* Total corrente */}
    {selectedAppointmentIds.length > 0 && (
      <div className="mt-3 flex items-center justify-between px-4 py-3 bg-priori-navy/5 rounded-xl border border-priori-navy/10">
        <div className="flex items-center gap-3 text-sm text-priori-navy">
          <span className="font-medium">
            {selectedAppointmentIds.length} {selectedAppointmentIds.length === 1 ? 'atendimento' : 'atendimentos'}
          </span>
          <span className="text-zinc-400">•</span>
          <span className="text-zinc-500">{uniquePatients} {uniquePatients === 1 ? 'paciente' : 'pacientes'}</span>
        </div>
        <span className="text-lg font-bold text-priori-navy">{formatCurrency(totalSelectedAmount)}</span>
      </div>
    )}

    {/* Alertas de limite de sessões */}
    {sessionWarnings.length > 0 && selectedAppointmentIds.length > 0 && (
      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={15} />
        <div className="text-xs text-amber-700 space-y-0.5">
          {sessionWarnings.map((w, i) => (
            <p key={i}><strong>{w.customerName}</strong>: {w.count}/{w.limit} sessões de {w.type} — excede o limite do plano</p>
          ))}
        </div>
      </div>
    )}
  </div>
);
