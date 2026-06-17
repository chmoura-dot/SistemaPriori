import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Printer, Loader2, CalendarSearch } from 'lucide-react';
import { api } from '../services/api';
import { Appointment, Customer, Plan, HealthPlan, AppointmentStatus } from '../services/types';
import { cn } from '../lib/utils';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface ForecastRow {
  customerName: string;
  procedureCode: string;
  procedureDescription: string;
  count: number;
  dates: string[];
}

interface PlanGroup {
  planName: string;
  rows: ForecastRow[];
  total: number;
}

export const ForecastPage = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [year, setYear] = useState(now.getFullYear());
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Calcula primeiro e último dia do mês selecionado
      const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const [apps, custs, pls] = await Promise.all([
        api.getAppointmentsByRange(firstDay, lastDay),
        api.getCustomers(),
        api.getPlans(),
      ]);
      setAppointments(apps);
      setCustomers(custs);
      setPlans(pls);
    } catch {
      // silencioso
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [month, year]);

  // ---------- Navegação de mês ----------
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // ---------- Dados agrupados ----------
  const planGroups: PlanGroup[] = useMemo(() => {
    // Mês/ano selecionado no formato YYYY-MM
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Filtrar agendamentos do mês, não-cancelados, não-internos
    const monthApps = appointments.filter(a =>
      a.date.startsWith(prefix) &&
      a.status !== AppointmentStatus.CANCELED &&
      !a.isInternal
    );

    // Mapas rápidos
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const planMap = new Map(plans.map(p => [p.name.toUpperCase(), p]));

    // Agrupar por plano → paciente+tipo
    const grouped = new Map<string, Map<string, { app: Appointment; dates: string[]; customer: Customer }>>();

    for (const app of monthApps) {
      const cust = customerMap.get(app.customerId);
      if (!cust) continue;

      const hp = cust.healthPlan;

      if (!grouped.has(hp)) grouped.set(hp, new Map());
      const planBucket = grouped.get(hp)!;

      const key = `${cust.id}::${app.type}`;
      if (!planBucket.has(key)) {
        planBucket.set(key, { app, dates: [app.date], customer: cust });
      } else {
        planBucket.get(key)!.dates.push(app.date);
      }
    }

    // Converter para array de PlanGroup
    const result: PlanGroup[] = [];

    for (const [planName, patientMap] of grouped) {
      const plan = planMap.get(planName.toUpperCase());

      const rows: ForecastRow[] = [];
      for (const [, data] of patientMap) {
        const sortedDates = data.dates.sort();
        const proc = plan?.procedures?.find(p => p.type === data.app.type);

        rows.push({
          customerName: data.customer.name,
          procedureCode: proc?.code || data.app.procedureCode || '—',
          procedureDescription: proc?.description || data.app.type,
          count: data.dates.length,
          dates: sortedDates,
        });
      }

      // Ordenar por nome do paciente
      rows.sort((a, b) => a.customerName.localeCompare(b.customerName, 'pt-BR'));

      result.push({
        planName,
        rows,
        total: rows.reduce((s, r) => s + r.count, 0),
      });
    }

    // Ordenar planos por nome
    result.sort((a, b) => a.planName.localeCompare(b.planName, 'pt-BR'));

    return result;
  }, [appointments, customers, plans, month, year]);

  // Filtro por plano
  const visibleGroups = planFilter === 'all'
    ? planGroups
    : planGroups.filter(g => g.planName === planFilter);

  const totalGeral = visibleGroups.reduce((s, g) => s + g.total, 0);

  // Planos únicos para o dropdown
  const availablePlans = useMemo(() => {
    const set = new Set<string>();
    for (const g of planGroups) set.add(g.planName);
    return Array.from(set).sort();
  }, [planGroups]);

  // ---------- Formata data DD/MM ----------
  const fmtDate = (d: string) => {
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  };

  // ---------- Impressão ----------
  const handlePrint = () => window.print();

  // ---------- Render ----------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-priori-navy" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-priori-navy tracking-tight">Previsão de Atendimentos</h1>
          <p className="text-zinc-500 mt-1">Relação por plano para solicitação de autorização</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 print:hidden">
        {/* Navegação de mês */}
        <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-2 shadow-sm">
          <button onClick={prevMonth} className="p-1 hover:bg-zinc-100 rounded-lg transition-colors">
            <ChevronLeft size={18} className="text-priori-navy" />
          </button>
          <span className="text-sm font-bold text-priori-navy min-w-[140px] text-center">
            {MONTH_NAMES[month]} / {year}
          </span>
          <button onClick={nextMonth} className="p-1 hover:bg-zinc-100 rounded-lg transition-colors">
            <ChevronRight size={18} className="text-priori-navy" />
          </button>
        </div>

        {/* Filtro de plano */}
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium text-priori-navy shadow-sm focus:ring-2 focus:ring-priori-navy/20 outline-none"
        >
          <option value="all">Todos os Planos</option>
          {availablePlans.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Botão imprimir */}
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2.5 bg-priori-navy text-white rounded-xl text-sm font-semibold hover:bg-priori-navy/90 transition-colors shadow-sm"
        >
          <Printer size={16} />
          Imprimir
        </button>
      </div>

      {/* Conteúdo */}
      {visibleGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <CalendarSearch size={48} className="mb-4 text-zinc-300" />
          <p className="text-lg font-medium">Nenhum atendimento previsto</p>
          <p className="text-sm mt-1">para {MONTH_NAMES[month]} / {year}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map(group => (
            <div key={group.planName} className="bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden">
              {/* Header do plano */}
              <div className="flex items-center justify-between px-6 py-4 bg-priori-navy/[0.03] border-b border-zinc-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-priori-navy/10 flex items-center justify-center">
                    <span className="text-sm">🏥</span>
                  </div>
                  <h2 className="text-lg font-bold text-priori-navy">{group.planName}</h2>
                </div>
                <span className="text-xs font-bold text-priori-gold bg-priori-gold/10 px-3 py-1.5 rounded-full border border-priori-gold/20">
                  {group.total} atendimento{group.total !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Tabela */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left">
                      <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Paciente</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cód. TUSS</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Procedimento</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Datas</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Qtd.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, idx) => (
                      <tr
                        key={`${row.customerName}-${row.procedureCode}-${idx}`}
                        className={cn(
                          'border-b border-zinc-50 hover:bg-priori-navy/[0.02] transition-colors',
                          idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'
                        )}
                      >
                        <td className="px-6 py-3 font-medium text-priori-navy">{row.customerName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-600">{row.procedureCode}</td>
                        <td className="px-4 py-3 text-zinc-600">{row.procedureDescription}</td>
                        <td className="px-4 py-3 text-center text-zinc-500 text-xs">
                          {row.dates.map(d => fmtDate(d)).join(', ')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-priori-navy/10 text-priori-navy font-bold text-xs">
                            {row.count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Total geral */}
          <div className="flex justify-end">
            <div className="bg-priori-navy text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm">
              Total Geral: {totalGeral} atendimento{totalGeral !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
