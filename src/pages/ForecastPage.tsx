import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Printer, Loader2, CalendarSearch, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { Appointment, Customer, Plan, HealthPlan, AppointmentStatus } from '../services/types';
import { cn } from '../lib/utils';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface ForecastDate {
  date: string;
  /** Sessão originada de cancelamento faturável (falta do paciente, cobrança mantida) */
  isCanceledBillable: boolean;
  /** Atendimento de mês anterior ao navegado, ainda não faturado (nunca entrou em lote) */
  isOverdue: boolean;
}

interface ForecastRow {
  customerName: string;
  procedureCode: string;
  procedureDescription: string;
  count: number;
  /** Quantidade de atendimentos atrasados (meses anteriores, não faturados) */
  overdueCount: number;
  dates: ForecastDate[];
}

interface PlanGroup {
  planName: string;
  rows: ForecastRow[];
  total: number;
  overdueTotal: number;
}


export const ForecastPage = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [year, setYear] = useState(now.getFullYear());
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [lookbackMonths, setLookbackMonths] = useState<number>(3); // meses anteriores vasculhados p/ pendências
  const [isLoading, setIsLoading] = useState(true);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Início da janela: dia 1 do mês navegado, recuado `lookbackMonths` meses.
      // Aritmética explícita ano/mês evita overflow de dia (ex.: 31 - 1 mês).
      let startYear = year;
      let startMonth = month - lookbackMonths;
      while (startMonth < 0) { startMonth += 12; startYear -= 1; }
      const firstDay = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-01`;

      // Fim da janela: último dia do mês navegado.
      const pad = (n: number) => String(n).padStart(2, '0');
      const lastDate = new Date(year, month + 1, 0);
      const lastDay = `${lastDate.getFullYear()}-${pad(lastDate.getMonth() + 1)}-${pad(lastDate.getDate())}`;

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
  }, [month, year, lookbackMonths]);


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

    // Determina se um cancelamento é ISENTO de cobrança.
    // Mesma regra de negócio usada no Faturamento (AppointmentRow.tsx / pricing.ts):
    //   cancellationBilling 'none' ou vazio → isento (falta do psicólogo / encerramento sem cobrança)
    //   cancellationBilling 'plan' | 'particular' → cobrança mantida (falta do paciente, horário reservado)
    const isCanceledExempt = (a: Appointment) =>
      a.status === AppointmentStatus.CANCELED &&
      (!a.cancellationBilling || a.cancellationBilling === 'none');

    // Uma sessão faturável originada de cancelamento (falta do paciente) permanece na relação.
    const isCanceledBillable = (a: Appointment) =>
      a.status === AppointmentStatus.CANCELED && !isCanceledExempt(a);

    // Regra de faturamento (conforme negócio):
    //   • Atendimento é considerado "já faturado" assim que vinculado a QUALQUER lote
    //     (rascunho ou enviado), i.e. billingBatchId preenchido. Ao ser retirado do lote,
    //     o campo volta a null e ele reaparece aqui automaticamente.
    //
    // Filtro por competência:
    //   • Mês navegado (== prefix): mostra TODOS os atendimentos previstos (comportamento
    //     original preservado — visão de previsão do mês corrente).
    //   • Meses anteriores (< prefix, dentro da janela de lookback): mostra APENAS os
    //     ainda não faturados (billingBatchId vazio) e NÃO marcados para ignorar
    //     faturamento (billingIgnored) — pendências a incluir no convênio. Atendimentos
    //     marcados como "Ignorar" no Faturamento são exclusões intencionais e não devem
    //     reaparecer como pendência atrasada.
    const monthApps = appointments.filter(a => {
      if (a.isInternal || isCanceledExempt(a)) return false;
      const appMonth = a.date.substring(0, 7);
      if (appMonth === prefix) return true;                          // mês navegado: tudo
      if (appMonth < prefix) return !a.billingBatchId && !a.billingIgnored; // anteriores: só não faturados e não ignorados
      return false;                                                  // meses futuros: ignora
    });


    // Mapas rápidos
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const planMap = new Map(plans.map(p => [p.name.toUpperCase(), p]));

    // Agrupar por plano → paciente+tipo
    const grouped = new Map<string, Map<string, { app: Appointment; dates: ForecastDate[]; customer: Customer }>>();

    for (const app of monthApps) {
      const cust = customerMap.get(app.customerId);
      if (!cust) continue;

      const hp = cust.healthPlan;

      if (!grouped.has(hp)) grouped.set(hp, new Map());
      const planBucket = grouped.get(hp)!;

      const forecastDate: ForecastDate = {
        date: app.date,
        isCanceledBillable: isCanceledBillable(app),
        isOverdue: app.date.substring(0, 7) < prefix,
      };

      const key = `${cust.id}::${app.type}`;
      if (!planBucket.has(key)) {
        planBucket.set(key, { app, dates: [forecastDate], customer: cust });
      } else {
        planBucket.get(key)!.dates.push(forecastDate);
      }
    }


    // Converter para array de PlanGroup
    const result: PlanGroup[] = [];

    for (const [planName, patientMap] of grouped) {
      const plan = planMap.get(planName.toUpperCase());

      const rows: ForecastRow[] = [];
      for (const [, data] of patientMap) {
        const sortedDates = [...data.dates].sort((a, b) => a.date.localeCompare(b.date));
        const proc = plan?.procedures?.find(p => p.type === data.app.type);
        const overdueCount = sortedDates.filter(d => d.isOverdue).length;


        rows.push({
          customerName: data.customer.name,
          procedureCode: proc?.code || data.app.procedureCode || '—',
          procedureDescription: proc?.description || data.app.type,
          count: data.dates.length,
          overdueCount,
          dates: sortedDates,
        });
      }

      // Ordenar por nome do paciente
      rows.sort((a, b) => a.customerName.localeCompare(b.customerName, 'pt-BR'));

      result.push({
        planName,
        rows,
        total: rows.reduce((s, r) => s + r.count, 0),
        overdueTotal: rows.reduce((s, r) => s + r.overdueCount, 0),
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
  const totalGeralOverdue = visibleGroups.reduce((s, g) => s + g.overdueTotal, 0);


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
          <p className="text-xs text-zinc-400 mt-1">
            <span className="font-semibold text-amber-600">*</span> Falta do paciente com cobrança mantida (passível de faturamento)
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            <span className="font-semibold text-red-600">●</span> Atendimento de mês anterior ainda não faturado (incluir na solicitação)
          </p>
        </div>
      </div>

      {/* Banner de alerta de pendências atrasadas */}
      {totalGeralOverdue > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 print:border-red-300">
          <AlertTriangle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">
            <span className="font-bold">
              {totalGeralOverdue} atendimento{totalGeralOverdue !== 1 ? 's' : ''} de meses anteriores
            </span>{' '}
            ainda {totalGeralOverdue !== 1 ? 'não foram faturados' : 'não foi faturado'}. Inclua
            {totalGeralOverdue !== 1 ? '-os' : '-o'} na próxima solicitação ao convênio.
          </p>
        </div>
      )}


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

        {/* Janela de pendências (lookback) */}
        <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-2 shadow-sm">
          <span className="text-xs font-medium text-zinc-500">Pendências desde:</span>
          <select
            value={lookbackMonths}
            onChange={e => setLookbackMonths(Number(e.target.value))}
            className="text-sm font-medium text-priori-navy bg-transparent focus:ring-2 focus:ring-priori-navy/20 outline-none"
          >
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
        </div>

        {/* Botão atualizar */}
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-zinc-200 text-priori-navy rounded-xl text-sm font-semibold hover:bg-zinc-50 transition-colors shadow-sm"
          title="Atualizar dados"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>

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
                <div className="flex items-center gap-2">
                  {group.overdueTotal > 0 && (
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-full border border-red-200">
                      {group.overdueTotal} atrasado{group.overdueTotal !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="text-xs font-bold text-priori-gold bg-priori-gold/10 px-3 py-1.5 rounded-full border border-priori-gold/20">
                    {group.total} atendimento{group.total !== 1 ? 's' : ''}
                  </span>
                </div>
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
                          {row.dates.map((d, i) => (
                            <React.Fragment key={d.date + i}>
                              {i > 0 && ', '}
                              <span
                                title={cn(
                                  d.isOverdue && 'Mês anterior — ainda não faturado (incluir na solicitação)',
                                  d.isCanceledBillable && 'Falta do paciente — cobrança mantida (passível de faturamento)'
                                ) || undefined}
                                className={cn(
                                  d.isOverdue && 'font-semibold text-red-600',
                                  !d.isOverdue && d.isCanceledBillable && 'font-semibold text-amber-600'
                                )}
                              >
                                {fmtDate(d.date)}{d.isCanceledBillable ? '*' : ''}
                              </span>
                            </React.Fragment>
                          ))}
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
              {totalGeralOverdue > 0 && (
                <span className="ml-2 text-red-300">
                  ({totalGeralOverdue} atrasado{totalGeralOverdue !== 1 ? 's' : ''})
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
