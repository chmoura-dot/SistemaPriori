import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface MonthSelectorProps {
  value: string; // Formato "YYYY-MM"
  onChange: (value: string) => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const MonthSelector: React.FC<MonthSelectorProps> = ({ value, onChange }) => {
  // Garantir fallback caso o valor esteja mal formatado ou vazio
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

  // Gerar opções de meses no dropdown (12 meses anteriores e 12 futuros para navegação livre)
  const options = useMemo(() => {
    const list: { val: string; label: string }[] = [];
    const baseDate = new Date();
    // Gera de -12 a +12 meses em relação ao mês atual
    for (let i = -12; i <= 12; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const val = `${yStr}-${mStr}`;
      const label = `${MONTH_NAMES[d.getMonth()]} de ${yStr}`;
      list.push({ val, label });
    }
    
    // Se o valor selecionado por algum motivo não estiver na lista gerada, adiciona-o
    if (value && !list.some(item => item.val === value)) {
      const label = `${MONTH_NAMES[month - 1]} de ${year}`;
      list.push({ val: value, label });
      list.sort((a, b) => a.val.localeCompare(b.val));
    }

    return list;
  }, [year, month, value]);

  return (
    <div className="flex items-center gap-2">
      {/* Botão de Voltar */}
      <button
        type="button"
        onClick={handlePrev}
        className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 transition-colors shadow-sm flex items-center justify-center hover:text-priori-navy"
        title="Mês Anterior"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Dropdown de Seleção Customizado */}
      <div className="relative flex-1 min-w-[180px] sm:min-w-[200px]">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
          <Calendar size={15} />
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-8 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-priori-navy hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy transition-all shadow-sm cursor-pointer appearance-none text-left"
        >
          {options.map((opt) => (
            <option key={opt.val} value={opt.val}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
          <ChevronRight size={14} className="rotate-90" />
        </span>
      </div>

      {/* Botão de Avançar */}
      <button
        type="button"
        onClick={handleNext}
        className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 transition-colors shadow-sm flex items-center justify-center hover:text-priori-navy"
        title="Próximo Mês"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

