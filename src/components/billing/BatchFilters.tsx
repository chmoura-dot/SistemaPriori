import React from 'react';
import { Calendar, Info } from 'lucide-react';
import { HealthPlan } from '../../services/types';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

const SELECT_CLS =
  'rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy disabled:opacity-60 disabled:cursor-not-allowed';

interface Props {
  selectedPlan: HealthPlan;
  filterMonth: number;
  filterYear: number;
  monthLabel: string;
  prevMonthLabel: string;
  nextMonthLabel: string;
  includePrevMonth: boolean;
  includeNextMonth: boolean;
  isDraftMode: boolean;
  blockedPlans?: Map<HealthPlan, string>;
  pendingCountByPlan?: Map<HealthPlan, number>;
  onPlanChange: (plan: HealthPlan) => void;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onIncludePrevMonthChange: (value: boolean) => void;
  onIncludeNextMonthChange: (value: boolean) => void;
}

export const BatchFilters: React.FC<Props> = ({
  selectedPlan,
  filterMonth,
  filterYear,
  monthLabel,
  prevMonthLabel,
  nextMonthLabel,
  includePrevMonth,
  includeNextMonth,
  isDraftMode,
  blockedPlans,
  pendingCountByPlan,
  onPlanChange,
  onMonthChange,
  onYearChange,
  onIncludePrevMonthChange,
  onIncludeNextMonthChange,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Operadora */}
      <div>
        <label className="block text-sm font-medium text-priori-navy mb-1">Operadora</label>
        <select
          value={selectedPlan}
          onChange={(e) => onPlanChange(e.target.value as HealthPlan)}
          disabled={isDraftMode}
          className={`w-full ${SELECT_CLS}`}
        >
          {Object.values(HealthPlan).map(plan => {
            const blockLabel = !isDraftMode ? blockedPlans?.get(plan) : undefined;
            const pending = pendingCountByPlan?.get(plan) ?? 0;
            return (
              <option key={plan} value={plan} disabled={!!blockLabel}>
                {plan}{pending > 0 ? ` (${pending} pendente${pending > 1 ? 's' : ''})` : ''}{blockLabel ? ` — ⚠️ rascunho de ${blockLabel} pendente` : ''}
              </option>
            );
          })}
        </select>
      </div>

      {/* Competência */}
      <div>
        <label className="block text-sm font-medium text-priori-navy mb-1 flex items-center gap-1.5">
          <Calendar size={13} />
          Competência
        </label>

        <div className="flex gap-2">
          <select
            value={filterMonth}
            onChange={(e) => onMonthChange(Number(e.target.value))}
            disabled={isDraftMode}
            className={`flex-1 ${SELECT_CLS}`}
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>{name}</option>
            ))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
            disabled={isDraftMode}
            className={`w-28 ${SELECT_CLS}`}
          >
            {YEAR_OPTIONS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Exibição + toggles */}
        <div className="flex items-center justify-between mt-1.5 ml-1">
          <p className="text-xs text-zinc-400">
            Exibindo: <span className="font-medium text-priori-navy capitalize">{monthLabel}</span>
            {includePrevMonth && (
              <span className="ml-1 text-amber-600">+ meses anteriores</span>
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
                Incluir meses anteriores
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

        {includePrevMonth && (
          <div className="mt-1.5 ml-1 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
            <Info size={11} className="flex-shrink-0" />
            Mostrando <strong className="ml-1">todos os atendimentos</strong>
            <span className="mx-1">até</span>
            <strong>{monthLabel}</strong> — garante que nenhum atendimento antigo fique sem faturamento.
          </div>
        )}

        {includeNextMonth && nextMonthLabel && (
          <div className="mt-1.5 ml-1 flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
            <Info size={11} className="flex-shrink-0" />
            Mostrando atendimentos de <strong className="ml-1">{monthLabel}</strong>
            <span className="mx-1">e</span>
            <strong>{nextMonthLabel}</strong> — use para antecipar atendimentos do próximo mês neste lote.
          </div>
        )}
      </div>
    </div>
  );
};
