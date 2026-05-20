import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Customer } from '../../services/types';
import { cn } from '../../lib/utils';

interface CustomerSearchDropdownProps {
  customers: Customer[];
  selectedCustomerId: string;
  onSelect: (customerId: string) => void;
}

export const CustomerSearchDropdown: React.FC<CustomerSearchDropdownProps> = ({
  customers, selectedCustomerId, onSelect,
}) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!search) return customers;
    return customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [customers, search]);

  const selected = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="space-y-2 relative" ref={dropdownRef}>
      <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Selecionar Paciente</label>
      <div className="relative">
        <div
          className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy flex items-center justify-between cursor-pointer focus-within:ring-2 focus-within:ring-priori-navy/10 transition-all"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className={cn('font-medium', !selectedCustomerId && 'text-zinc-400 font-normal')}>
            {selected?.name || 'Selecione um paciente...'}
          </span>
          <ChevronDown size={16} className={cn('text-zinc-400 transition-transform', isOpen && 'rotate-180')} />
        </div>

        {isOpen && (
          <div className="absolute top-full left-0 w-full mt-2 bg-white border border-zinc-200 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-3 border-b border-zinc-100 bg-zinc-50/50">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  autoFocus
                  className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
                  placeholder="Digite o nome do paciente para buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
              {filtered.length > 0 ? filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={cn('w-full text-left px-5 py-4 text-base border-b border-zinc-50 last:border-0 hover:bg-priori-navy/5 hover:text-priori-navy transition-colors flex items-center justify-between group',
                    selectedCustomerId === c.id && 'bg-priori-navy/5 text-priori-navy font-bold')}
                  onClick={() => { onSelect(c.id); setIsOpen(false); setSearch(''); }}
                >
                  <div className="flex flex-col">
                    <span className="text-base font-bold uppercase tracking-tight">{c.name}</span>
                    <span className="text-[11px] text-zinc-400 font-black uppercase tracking-widest mt-0.5 group-hover:text-priori-gold transition-colors">{c.healthPlan}</span>
                  </div>
                  {selectedCustomerId === c.id && <CheckCircle2 size={18} className="text-priori-navy shrink-0" />}
                </button>
              )) : (
                <div className="px-4 py-8 text-center"><p className="text-xs text-zinc-400">Nenhum paciente encontrado</p></div>
              )}
            </div>
          </div>
        )}
      </div>
      <input type="hidden" value={selectedCustomerId} required />
    </div>
  );
};
