import React, { memo, useState } from 'react';
import { Ban, BookmarkPlus, CheckCircle2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { Appointment, AppointmentStatus } from '../../services/types';
import { Button } from '../Button';
import { cn, formatCurrency } from '../../lib/utils';
import { PlanProcedureInfo } from '../../hooks/billing/billingHelpers';

type NeuropsicoStatus =
  | { type: 'regular' }
  | { type: 'billable'; diffDays?: number }
  | { type: 'blocked'; diffDays: number }
  | { type: 'ask'; diffDays: number };

interface Props {
  app: Appointment;
  psychologistName: string;
  tussCode: string;
  neuropsicoStatus: NeuropsicoStatus;
  neuropsicoDecision: boolean;
  basePrice: number;
  isSelected: boolean;
  isDuplicate: boolean;
  isAlreadyInDraft: boolean;
  isDraftMode: boolean;
  monthFilter: string;
  includePrevMonth: boolean;
  includeNextMonth: boolean;
  /** Índice 0-based da sessão AMS neuropsico (-1 se não aplicável) */
  amsSessionIndex: number;
  /** Procedimentos do plano do paciente para override manual */
  planProcedures: PlanProcedureInfo[];
  onToggleSelection: (id: string) => void;
  onConfirmAppointment: (id: string, e: React.MouseEvent) => void;
  onIgnoreAppointment: (id: string, e: React.MouseEvent) => void;
  onToggleNeuropsico: (id: string, value: boolean) => void;
  onQuickAddToDraft: (id: string, e: React.MouseEvent) => void;
  onOverrideProcedureCode: (id: string, newCode: string) => void;
}

export const AppointmentRow: React.FC<Props> = memo(({
  app,
  psychologistName,
  tussCode,
  neuropsicoStatus,
  neuropsicoDecision,
  basePrice,
  isSelected,
  isDuplicate,
  isAlreadyInDraft,
  isDraftMode,
  monthFilter,
  includePrevMonth,
  includeNextMonth,
  amsSessionIndex,
  planProcedures,
  onToggleSelection,
  onConfirmAppointment,
  onIgnoreAppointment,
  onToggleNeuropsico,
  onQuickAddToDraft,
  onOverrideProcedureCode,
}) => {
  const [showOverride, setShowOverride] = useState(false);

  const isConfirmed = app.confirmedPsychologist === true;
  const isCanceledExempt =
    app.status === AppointmentStatus.CANCELED &&
    app.cancellationBilling === 'none';

  const appMonth = app.date.substring(0, 7);
  const isFromOtherMonth = (includePrevMonth || includeNextMonth) && appMonth !== monthFilter;

  // Flags para regra AMS
  const isAmsNeuropsico   = amsSessionIndex >= 0;
  const isAmsAutoAltCode  = isAmsNeuropsico && (amsSessionIndex === 1 || amsSessionIndex === 2);
  const isAmsBlocked      = isAmsNeuropsico && amsSessionIndex >= 3;

  return (
    <div className="flex flex-col last:border-0">
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-50 transition-colors',
          isSelected && 'bg-priori-navy/5',
          isAlreadyInDraft && !isSelected && 'bg-zinc-50/80',
          isCanceledExempt
            ? 'opacity-60 cursor-not-allowed bg-red-50/30'
            : isConfirmed ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed bg-zinc-50/50'
        )}
        onClick={() => !isCanceledExempt && isConfirmed && onToggleSelection(app.id)}
      >
        <input
          type="checkbox"
          checked={isSelected}
          disabled={!isConfirmed || isCanceledExempt}
          onChange={() => {}}
          className="rounded border-zinc-300 text-priori-navy focus:ring-priori-navy disabled:opacity-50 flex-shrink-0"
        />
        <div className="text-xs font-semibold text-zinc-600 w-20 flex-shrink-0">
          {format(new Date(app.date + 'T12:00:00'), 'dd/MM/yy')} {app.startTime}
        </div>
        <div className="text-xs text-zinc-400 flex-1 truncate min-w-0">
          {psychologistName}
        </div>

        {/* Código TUSS com override manual */}
        {(tussCode || planProcedures.length > 0) && (
          <div className="relative flex-shrink-0 hidden sm:flex items-center gap-0.5">
            <span
              title={`TUSS: ${tussCode} — ${app.type}${isAmsAutoAltCode ? ' (substituído automaticamente: Neuropsico → Psicoterapia)' : ''}`}
              className={cn(
                'text-[10px] font-mono px-1.5 py-0.5 rounded border',
                isAmsAutoAltCode
                  ? 'text-blue-600 bg-blue-50 border-blue-200'
                  : 'text-zinc-400 bg-zinc-100 border-zinc-200'
              )}
            >
              {isAmsAutoAltCode && '⟳ '}{tussCode}
            </span>
            {planProcedures.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowOverride(v => !v); }}
                className="p-0.5 text-zinc-300 hover:text-priori-navy rounded transition-colors"
                title="Alterar código de procedimento manualmente"
              >
                <Pencil size={10} />
              </button>
            )}
            {showOverride && (
              <div
                className="absolute top-full right-0 z-20 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg p-2 min-w-[260px]"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-[10px] text-zinc-400 uppercase font-bold mb-1.5 px-1 tracking-widest">
                  Alterar procedimento
                </p>
                {planProcedures.map(p => (
                  <button
                    key={p.code}
                    onClick={() => {
                      onOverrideProcedureCode(app.id, p.code);
                      setShowOverride(false);
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-zinc-50 transition-colors flex items-center justify-between gap-2',
                      tussCode === p.code ? 'bg-priori-navy/5 font-semibold text-priori-navy' : 'text-zinc-600'
                    )}
                  >
                    <span>
                      <span className="font-mono">{p.code}</span>
                      <span className="text-zinc-400 ml-1">— {p.type}</span>
                    </span>
                    <span className="text-zinc-400 text-[10px]">{formatCurrency(p.price)}</span>
                  </button>
                ))}
                <button
                  onClick={() => { onOverrideProcedureCode(app.id, ''); setShowOverride(false); }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:bg-zinc-50 transition-colors mt-1 border-t border-zinc-100 pt-2"
                >
                  ↩ Restaurar código automático
                </button>
              </div>
            )}
          </div>
        )}

        {/* Badges */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isFromOtherMonth && (
            <span
              title="Atendimento de outro mês"
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold"
            >
              {appMonth.substring(5, 7)}/{appMonth.substring(0, 4)}
            </span>
          )}
          {isAlreadyInDraft && (
            <span
              title="Já estava neste rascunho"
              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-0.5"
            >
              <CheckCircle2 size={9} />
              Rascunho
            </span>
          )}
          {isDuplicate && isSelected && (
            <span
              title="Possível duplicata: mesmo paciente com sessão na mesma data"
              className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200"
            >
              Duplicata ⚠️
            </span>
          )}
          {/* Badge AMS Petrobras */}
          {isAmsBlocked && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
              AMS {amsSessionIndex + 1}ª R$0
            </span>
          )}
          {isAmsAutoAltCode && (
            <span
              title={`AMS: ${amsSessionIndex + 1}ª sessão neuropsico → cobrada como psicoterapia`}
              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200"
            >
              AMS {amsSessionIndex + 1}ª → Psicot.
            </span>
          )}
          {/* Badges neuropsico genérico (para outros planos) */}
          {!isAmsNeuropsico && neuropsicoStatus.type === 'blocked' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
              Neuropsico R$0
            </span>
          )}
          {!isAmsNeuropsico && neuropsicoStatus.type === 'ask' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
              ⚠️ Neuropsico
            </span>
          )}
          {isCanceledExempt && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 border border-red-200 font-semibold">
              Cancelado — Isento
            </span>
          )}
          {!isCanceledExempt && !isConfirmed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
              Ag. confirmação
            </span>
          )}
        </div>

        <div className="text-sm font-semibold text-priori-navy w-20 text-right flex-shrink-0">
          {formatCurrency(basePrice)}
        </div>

        {!isCanceledExempt && !isConfirmed && (
          <Button
            size="sm"
            onClick={(e) => onConfirmAppointment(app.id, e)}
            className="bg-emerald-600 hover:bg-emerald-700 text-xs px-2 h-7 flex-shrink-0"
          >
            Confirmar
          </Button>
        )}
        {!isCanceledExempt && isConfirmed && !isDraftMode && (
          <button
            onClick={(e) => onQuickAddToDraft(app.id, e)}
            className="p-1 text-zinc-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all flex-shrink-0"
            title="Adicionar ao rascunho agora (sem fechar o modal)"
          >
            <BookmarkPlus size={14} />
          </button>
        )}
        {!isCanceledExempt && (
          <button
            onClick={(e) => onIgnoreAppointment(app.id, e)}
            className="p-1 text-zinc-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
            title="Ignorar para faturamento"
          >
            <Ban size={14} />
          </button>
        )}
      </div>

      {/* Painel de decisão neuropsico (apenas para planos genéricos, não AMS) */}
      {!isAmsNeuropsico && neuropsicoStatus.type === 'ask' && (
        <div className="bg-amber-50/50 px-12 py-2 flex items-center gap-3 text-xs border-t border-amber-100/50">
          <span className="text-amber-700 font-medium">Cobrar este atendimento?</span>
          <div className="flex bg-white rounded-lg border border-amber-200 p-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleNeuropsico(app.id, false); }}
              className={cn(
                'px-3 py-1 font-semibold rounded-md transition-all',
                !neuropsicoDecision
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
                neuropsicoDecision
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
});

AppointmentRow.displayName = 'AppointmentRow';
