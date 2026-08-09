import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthSelectorProps {
  value: string; // Formato "YYYY-MM"
  onChange: (value: string) => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const MonthSelector: React.FC<MonthSelectorProps> = ({ value, onChange }) => {
  // Parsing do valor YYYY-MM
  const [year, month] = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) {
      const now = new Date();
      return [now.getFullYear(), now.getMonth() + 1];
    }
    const [y, m] = value.split('-').map(Number);
    return [y, m];
  }, [value]);

  const handlePrev = () => {
    const prevDate = new Date(year, month - 1 - 1, 1);
    const yStr = prevDate.getFullYear();
    const mStr = String(prevDate.getMonth() + 1).padStart(2, '0');
    onChange(`${yStr}-${mStr}`);
  };

  const handleNext = () => {
    const nextDate = new Date(year, month - 1 + 1, 1);
    const yStr = nextDate.getFullYear();
    const mStr = String(nextDate.getMonth() + 1).padStart(2, '0');
    onChange(`${yStr}-${mStr}`);
  };

  // Formatação por extenso (ex: Agosto de 2026)
  const displayLabel = useMemo(() => {
    if (month < 1 || month > 12) return value;
    return `${MONTH_NAMES[month - 1]} de ${year}`;
  }, [year, month, value]);

  return (
    <div className="flex items-center bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm h-[44px] w-full justify-between">
      {/* Botão de Voltar (seta esquerda) */}
      <button
        type="button"
        onClick={handlePrev}
        className="px-3.5 h-full hover:bg-zinc-50 text-zinc-500 hover:text-priori-navy transition-all flex items-center justify-center border-r border-zinc-100"
        title="Mês Anterior"
      >
        <ChevronLeft size={16} strokeWidth={2.5} />
      </button>

      {/* Nome do Mês e Ano Centralizado */}
      <div className="flex-1 text-center text-sm font-semibold text-priori-navy select-none px-4 capitalize tracking-wide">
        {displayLabel}
      </div>

      {/* Botão de Avançar (seta direita) */}
      <button
        type="button"
        onClick={handleNext}
        className="px-3.5 h-full hover:bg-zinc-50 text-zinc-500 hover:text-priori-navy transition-all flex items-center justify-center border-l border-zinc-100"
        title="Próximo Mês"
      >
        <ChevronRight size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
};


