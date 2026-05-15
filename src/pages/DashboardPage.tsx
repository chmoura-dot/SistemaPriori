import React, { useState } from 'react';
import {
  Users,
  Activity,
  TrendingUp,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  Calendar,
  Clock,
  Target,
  UserMinus,
  ListOrdered,
  DollarSign,
  Zap,
  BarChart2,
  ArrowUp,
  ArrowDown,
  Minus,
  Bell,
  AlertCircle,
  Flame,
  RefreshCw,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid, AreaChart, Area,
  BarChart, Bar, ComposedChart,
} from 'recharts';
import { useDashboardData } from '../hooks/useDashboardData';
import { ExpenseCategory } from '../services/types';
import { cn } from '../lib/utils';

// ─── Helpers de formatação ───────────────────────────────────────────────────

const fmt      = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtShort = (v: number) => v.toLocaleString('pt-BR');

function getTrendIcon(current: number, previous: number) {
  if (previous === 0) return <Minus size={12} className="text-zinc-400" />;
  const pct = ((current - previous) / previous) * 100;
  if (pct > 0) return <ArrowUp   size={12} className="text-emerald-500" />;
  if (pct < 0) return <ArrowDown size={12} className="text-red-500" />;
  return <Minus size={12} className="text-zinc-400" />;
}

function getTrendText(current: number, previous: number) {
  if (previous === 0) return null;
  const pct   = ((current - previous) / previous) * 100;
  const color = pct > 0 ? 'text-emerald-500' : pct < 0 ? 'text-red-500' : 'text-zinc-400';
  return (
    <span className={cn('text-[10px] font-bold', color)}>
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}% vs mês ant.
    </span>
  );
}

// ─── Constantes de cores ──────────────────────────────────────────────────────

const MODALITY_COLORS = ['#1a365d', '#d4af37'];
const CHART_COLORS    = ['#1a365d', '#d4af37', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'];

// ─── Tipos de abas ────────────────────────────────────────────────────────────

type TabId = 'resumo' | 'clinico' | 'financeiro' | 'equipe';

const TABS: { id: TabId; label: string }[] = [
  { id: 'resumo',     label: 'Resumo'     },
  { id: 'clinico',    label: 'Clínico'    },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'equipe',     label: 'Equipe'     },
];

// ─── Componente Principal ────────────────────────────────────────────────────

export const DashboardPage = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');

  const {
    // Estado
    isLoading, error,
    // Dados brutos (ainda necessários no render)
    customers, plans, appointments, expenses, psychologists,
    // Filtro de período
    filterMode, setFilterMode, selectedMonth, setSelectedMonth, selectedYear, setSelectedYear,
    availableMonths, availableYears, selectedMonthLabel,
    // Agendamentos e despesas filtrados
    expensesFiltered,
    // KPIs
    appsRealizados, appsNaoCancelados,
    totalAppsScheduled,
    cancelationRate, attendanceRate, cancelationRatePrev, attendanceRatePrev,
    revenueRealizado, revenuePrevisto, revenueRealizadoPrev,
    totalRepasseRealizado, totalExpenses, totalExpensesPrev, netProfit,
    // Ticket médio
    ticketMedioConsulta, ticketMedioPaciente, ticketMedioConsultaPrev,
    // Pacientes
    activeCustomersCount, newPatientsCount, newPatientsCountPrev,
    // Métricas clínicas
    avgSessionsPerPatient, noShowApps, noShowRate, avgTherapyDurationDays, returnRate,
    // Churn
    inactivatedThisMonth, churnByReason, retentionRate,
    // Forecast
    forecastRevenue, forecastProgress,
    // Agenda
    today, todayApps, todayConfirmed, todayCanceled, upcomingToday,
    // Ocupação
    estimatedCapacity, occupancyRate,
    // Gráficos
    heatmapData, maxHeatmapValue,
    psychologistRanking,
    revenueVsExpensesData,
    revenueByPlan, revenueByPsychologist, monthlyData, modalityData,
    genderProfileData, ageProfileData,
    growthData, planGrowthData, typeGrowthData, roomUsageData,
    // Alertas
    expiringSubscriptions, pendingConfirmationsToday, inactivePatients, waitingListPending,
  } = useDashboardData();

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="p-4 bg-red-50 rounded-2xl">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <p className="text-sm font-bold text-zinc-700">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-priori-navy text-white text-sm font-bold rounded-xl hover:opacity-90 transition"
        >
          <RefreshCw size={14} /> Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-[400px]">

      {/* ── Header + Filtro de Período ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Visão Geral</h2>
          <p className="text-zinc-500">Acompanhe o desempenho da clínica em tempo real.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Toggle de modo */}
          <div className="flex bg-zinc-100 p-1 rounded-xl">
            {(['month', 'year', 'all'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  'px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap',
                  filterMode === mode ? 'bg-white text-priori-navy shadow-sm' : 'text-zinc-500 hover:text-priori-navy'
                )}
              >
                {mode === 'month' ? 'Mês' : mode === 'year' ? 'Ano' : 'Todo Período'}
              </button>
            ))}
          </div>

          {/* Seletor de Mês */}
          {filterMode === 'month' && (
            <div className="flex items-center gap-2 bg-white border border-zinc-100 rounded-xl px-4 py-2.5 shadow-sm">
              <Calendar size={16} className="text-priori-navy" />
              <select
                className="text-sm font-bold text-priori-navy bg-transparent focus:outline-none cursor-pointer"
                value={`${selectedYear}-${selectedMonth}`}
                onChange={e => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  setSelectedYear(y);
                  setSelectedMonth(m);
                }}
              >
                {availableMonths.map(m => (
                  <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Seletor de Ano */}
          {filterMode === 'year' && (
            <div className="flex items-center gap-2 bg-white border border-zinc-100 rounded-xl px-4 py-2.5 shadow-sm">
              <Calendar size={16} className="text-priori-navy" />
              <select
                className="text-sm font-bold text-priori-navy bg-transparent focus:outline-none cursor-pointer"
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
              >
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Alertas Consolidados (sempre visíveis) ── */}
      {(pendingConfirmationsToday.length > 0 || expiringSubscriptions.length > 0 || inactivePatients.length > 0 || waitingListPending.length > 0) && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-amber-50 rounded-xl"><Bell size={16} className="text-amber-500" /></div>
            <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Alertas e Notificações</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pendingConfirmationsToday.length > 0 && (
              <button onClick={() => onNavigate('/pendentes')} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl hover:border-amber-300 transition-all text-left">
                <AlertCircle size={18} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-700">{pendingConfirmationsToday.length} confirmação{pendingConfirmationsToday.length > 1 ? 'ões' : ''} pendente{pendingConfirmationsToday.length > 1 ? 's' : ''} hoje</p>
                  <p className="text-[10px] text-amber-500">Ver pendentes →</p>
                </div>
              </button>
            )}
            {expiringSubscriptions.length > 0 && (
              <button onClick={() => onNavigate('/planos')} className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl hover:border-blue-300 transition-all text-left">
                <Clock size={18} className="text-blue-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-blue-700">{expiringSubscriptions.length} assinatura{expiringSubscriptions.length > 1 ? 's' : ''} vencendo em 30 dias</p>
                  <p className="text-[10px] text-blue-500">Ver planos →</p>
                </div>
              </button>
            )}
            {inactivePatients.length > 0 && (
              <button onClick={() => { localStorage.setItem('customers_filter', 'sem-consulta-30d'); onNavigate('/clientes'); }} className="flex items-center gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl hover:border-zinc-300 transition-all text-left">
                <UserMinus size={18} className="text-zinc-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-zinc-700">{inactivePatients.length} paciente{inactivePatients.length > 1 ? 's' : ''} sem consulta há +30 dias</p>
                  <p className="text-[10px] text-zinc-500">Ver pacientes →</p>
                </div>
              </button>
            )}
            {waitingListPending.length > 0 && (
              <button onClick={() => onNavigate('/lista-espera')} className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-100 rounded-xl hover:border-purple-300 transition-all text-left">
                <ListOrdered size={18} className="text-purple-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-purple-700">{waitingListPending.length} pessoa{waitingListPending.length > 1 ? 's' : ''} na fila de espera</p>
                  <p className="text-[10px] text-purple-500">Ver fila →</p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Navegação por Abas ── */}
      <div className="flex bg-zinc-100 p-1 rounded-2xl">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all',
              activeTab === tab.id
                ? 'bg-white text-priori-navy shadow-sm'
                : 'text-zinc-500 hover:text-priori-navy'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          ABA 1: RESUMO
          Agenda do Dia + KPIs Principais + KPIs Secundários + Forecast + DRE
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'resumo' && (
        <div className="space-y-6">

          {/* ── Agenda do Dia ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-priori-navy rounded-xl text-white"><Calendar size={18} /></div>
                <div>
                  <h3 className="text-sm font-bold text-priori-navy">Agenda de Hoje</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                    {today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>
              <button onClick={() => onNavigate('/agenda')} className="text-xs font-bold text-priori-gold hover:text-priori-navy transition-colors flex items-center gap-1">
                Ver agenda completa <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="p-4 bg-priori-navy/5 rounded-xl text-center">
                <p className="text-2xl font-black text-priori-navy">{todayApps.length}</p>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Agendados</p>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl text-center">
                <p className="text-2xl font-black text-emerald-600">{todayConfirmed.length}</p>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Confirmados</p>
              </div>
              <div className="p-4 bg-red-50 rounded-xl text-center">
                <p className="text-2xl font-black text-red-500">{todayCanceled.length}</p>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Cancelados</p>
              </div>
            </div>

            {upcomingToday.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Próximos atendimentos</p>
                {upcomingToday.map(app => {
                  const customer   = customers.find(c => c.id === app.customerId);
                  const psy        = psychologists.find(p => p.id === app.psychologistId);
                  const isConfirmed = app.confirmedPsychologist || app.confirmedPatient;
                  return (
                    <div key={app.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <div className="text-center min-w-[48px]">
                        <p className="text-sm font-black text-priori-navy">{app.startTime}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-priori-navy truncate">{customer?.name || 'Paciente'}</p>
                        <p className="text-[10px] text-zinc-400">{psy?.name} · {app.type}</p>
                      </div>
                      <div className={cn('px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider',
                        isConfirmed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                      )}>
                        {isConfirmed ? 'Confirmado' : 'Pendente'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-400">
                <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum atendimento agendado para hoje</p>
              </div>
            )}
          </div>

          {/* ── KPIs Principais ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                label: 'Pacientes Ativos', value: activeCustomersCount,
                prevValue: activeCustomersCount, currentNum: activeCustomersCount,
                icon: Users, color: 'text-priori-navy', bg: 'bg-priori-navy/10', path: '/clientes',
                extra: null,
              },
              {
                label: 'Faturamento Realizado', value: `R$ ${fmt(revenueRealizado)}`,
                prevValue: revenueRealizadoPrev, currentNum: revenueRealizado,
                icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', path: '/financeiro',
                extra: getTrendText(revenueRealizado, revenueRealizadoPrev),
              },
              {
                label: 'Taxa de Comparecimento', value: `${attendanceRate.toFixed(1)}%`,
                prevValue: attendanceRatePrev, currentNum: attendanceRate,
                icon: ShieldCheck, color: 'text-priori-gold', bg: 'bg-priori-gold/10', path: '/agenda',
                extra: getTrendText(attendanceRate, attendanceRatePrev),
              },
              {
                label: 'Taxa de Cancelamentos', value: `${cancelationRate.toFixed(1)}%`,
                prevValue: cancelationRatePrev, currentNum: cancelationRate,
                icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', path: '/agenda',
                extra: getTrendText(cancelationRate, cancelationRatePrev),
              },
            ].map(stat => (
              <div
                key={stat.label}
                className="bg-white border border-zinc-100 p-6 rounded-2xl relative overflow-hidden group shadow-sm cursor-pointer hover:border-priori-gold/30 transition-all"
                onClick={() => stat.path && onNavigate(stat.path)}
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <stat.icon size={80} className={stat.color} />
                </div>
                <div className="flex items-center justify-between mb-4">
                  <div className={cn('p-3 rounded-xl', stat.bg)}><stat.icon size={20} className={stat.color} /></div>
                  <ArrowUpRight size={16} className="text-zinc-300 group-hover:text-priori-gold transition-colors" />
                </div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
                <h3 className="text-2xl font-bold text-priori-navy">{stat.value}</h3>
                {stat.extra && <div className="mt-1 flex items-center gap-1">{stat.extra}</div>}
              </div>
            ))}
          </div>

          {/* ── KPIs Secundários ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-priori-gold/10 rounded-xl"><DollarSign size={18} className="text-priori-gold" /></div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ticket Médio / Consulta</p>
              </div>
              <p className="text-2xl font-black text-priori-navy">R$ {fmt(ticketMedioConsulta)}</p>
              <div className="mt-1">{getTrendText(ticketMedioConsulta, ticketMedioConsultaPrev)}</div>
            </div>

            <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-emerald-50 rounded-xl"><Users size={18} className="text-emerald-500" /></div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ticket Médio / Paciente</p>
              </div>
              <p className="text-2xl font-black text-priori-navy">R$ {fmt(ticketMedioPaciente)}</p>
              <p className="text-[10px] text-zinc-400 mt-1">{activeCustomersCount} pacientes ativos</p>
            </div>

            <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-blue-50 rounded-xl"><Zap size={18} className="text-blue-500" /></div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Taxa de Ocupação</p>
              </div>
              <p className="text-2xl font-black text-priori-navy">{occupancyRate.toFixed(1)}%</p>
              <div className="mt-2 h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${occupancyRate}%` }} />
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">{appsRealizados.length} de ~{estimatedCapacity} slots</p>
            </div>

            <div className="bg-white border border-zinc-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-purple-50 rounded-xl"><ShieldCheck size={18} className="text-purple-500" /></div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Retenção de Pacientes</p>
              </div>
              <p className="text-2xl font-black text-priori-navy">{retentionRate.toFixed(1)}%</p>
              <div className="mt-2 h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-400 rounded-full transition-all" style={{ width: `${retentionRate}%` }} />
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">{inactivatedThisMonth.length} inativado{inactivatedThisMonth.length !== 1 ? 's' : ''} no período</p>
            </div>
          </div>

          {/* ── Forecast de Receita ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 rounded-xl"><Target size={18} className="text-emerald-500" /></div>
                <div>
                  <h3 className="text-sm font-bold text-priori-navy">Forecast de Receita — {selectedMonthLabel}</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Realizado + Previsto (agendamentos futuros)</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400">Projeção total</p>
                <p className="text-lg font-black text-priori-navy">R$ {fmt(forecastRevenue)}</p>
              </div>
            </div>
            <div className="h-3 w-full bg-zinc-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700"
                style={{ width: `${forecastProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                <span className="text-zinc-600">Realizado: <strong className="text-emerald-600">R$ {fmt(revenueRealizado)}</strong></span>
              </div>
              <span className="font-bold text-zinc-400">{forecastProgress.toFixed(1)}% concluído</span>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-zinc-200 inline-block" />
                <span className="text-zinc-600">Previsto: <strong className="text-priori-gold">R$ {fmt(revenuePrevisto)}</strong></span>
              </div>
            </div>
          </div>

          {/* ── DRE Gerencial ── */}
          <div className="bg-white border border-zinc-100 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
              <TrendingUp size={200} className="text-priori-navy" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-priori-navy rounded-2xl text-white shadow-lg shadow-priori-navy/20"><Activity size={24} /></div>
                <div>
                  <h3 className="text-xl font-bold text-priori-navy">Margem Líquida Real (DRE)</h3>
                  <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Resultado Financeiro Consolidado — {selectedMonthLabel}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Faturamento Bruto</p>
                  <p className="text-2xl font-black text-emerald-600">R$ {fmt(revenueRealizado)}</p>
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 w-full" /></div>
                </div>
                <div className="space-y-2 text-red-500">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Total de Repasses</p>
                  <p className="text-2xl font-black">- R$ {fmt(totalRepasseRealizado)}</p>
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400" style={{ width: `${revenueRealizado > 0 ? (totalRepasseRealizado / revenueRealizado) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[9px] font-bold uppercase">
                    Representa {revenueRealizado > 0 ? ((totalRepasseRealizado / revenueRealizado) * 100).toFixed(1) : 0}% da receita
                  </p>
                </div>
                <div className="space-y-2 text-amber-600">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Despesas Clínica</p>
                  <p className="text-2xl font-black">- R$ {fmt(totalExpenses)}</p>
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${revenueRealizado > 0 ? (totalExpenses / revenueRealizado) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[9px] font-bold uppercase">Custos fixos e operacionais</p>
                </div>
                <div className="p-6 bg-priori-navy rounded-3xl text-white shadow-xl shadow-priori-navy/20 flex flex-col justify-center">
                  <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-1">Lucro Líquido Real</p>
                  <p className="text-3xl font-black text-priori-gold">R$ {fmt(netProfit)}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="px-2 py-0.5 bg-white/10 rounded-full">
                      <span className="text-[10px] font-bold">
                        MARGEM: {revenueRealizado > 0 ? ((netProfit / revenueRealizado) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ABA 2: CLÍNICO
          Métricas Clínicas + Perfil Demográfico + Churn + Heatmap
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'clinico' && (
        <div className="space-y-6">

          {/* ── Métricas Clínicas (NOVO) ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-teal-50 rounded-xl"><Activity size={18} className="text-teal-500" /></div>
              <div>
                <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Métricas Clínicas</h3>
                <p className="text-[10px] text-zinc-400">Indicadores de saúde terapêutica — {selectedMonthLabel}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

              {/* Novos Pacientes */}
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Novos Pacientes</p>
                <p className="text-2xl font-black text-priori-navy">{newPatientsCount}</p>
                <div className="mt-1 flex items-center gap-1">
                  {getTrendIcon(newPatientsCount, newPatientsCountPrev)}
                  {getTrendText(newPatientsCount, newPatientsCountPrev)}
                </div>
              </div>

              {/* Sessões Médias por Paciente */}
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Sessões Médias / Paciente</p>
                <p className="text-2xl font-black text-priori-navy">{avgSessionsPerPatient.toFixed(1)}</p>
                <p className="text-[10px] text-zinc-400 mt-1">consultas realizadas</p>
              </div>

              {/* Taxa de No-show */}
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">Taxa de No-show</p>
                <p className="text-2xl font-black text-amber-600">{noShowRate.toFixed(1)}%</p>
                <p className="text-[10px] text-zinc-400 mt-1">
                  {noShowApps.length} {noShowApps.length === 1 ? 'ausência' : 'ausências'} sem aviso
                </p>
              </div>

              {/* Tempo Médio em Terapia */}
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Tempo Médio em Terapia</p>
                {avgTherapyDurationDays > 0 ? (
                  <>
                    <p className="text-2xl font-black text-priori-navy">
                      {avgTherapyDurationDays >= 30
                        ? `${(avgTherapyDurationDays / 30).toFixed(0)}m`
                        : `${Math.round(avgTherapyDurationDays)}d`}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1">{Math.round(avgTherapyDurationDays)} dias (média)</p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-400 mt-2">Sem dados</p>
                )}
              </div>

              {/* Taxa de Retorno */}
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">Taxa de Retorno</p>
                <p className="text-2xl font-black text-emerald-600">{returnRate.toFixed(1)}%</p>
                <p className="text-[10px] text-zinc-400 mt-1">voltaram após 1ª sessão</p>
              </div>
            </div>

            {/* Nota explicativa */}
            <p className="text-[10px] text-zinc-400 mt-4 text-center">
              * No-show = consultas passadas não canceladas e não confirmadas pelo psicólogo.
              Taxa de Retorno calculada sobre o histórico completo.
            </p>
          </div>

          {/* ── Perfil Demográfico ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Perfil de Idade */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-blue-50 rounded-xl"><Users size={18} className="text-blue-500" /></div>
                <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Perfil de Idade</h3>
              </div>
              {ageProfileData.totalComIdade > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="h-[200px] w-full sm:w-[200px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={ageProfileData.data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                          {ageProfileData.data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          formatter={(value: any) => {
                            const num = Number(value);
                            return [`${num} paciente${num !== 1 ? 's' : ''} (${((num / ageProfileData.totalComIdade) * 100).toFixed(1)}%)`, ''];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-3 w-full">
                    {ageProfileData.data.map(item => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-sm font-bold text-priori-navy">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-priori-navy">{item.value}</span>
                          <span className="text-[10px] text-zinc-400 ml-2">{((item.value / ageProfileData.totalComIdade) * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                    {ageProfileData.semIdade > 0 && (
                      <div className="pt-3 mt-3 border-t border-zinc-100">
                        <p className="text-[10px] text-zinc-400 text-center">
                          * {ageProfileData.semIdade} paciente{ageProfileData.semIdade !== 1 ? 's' : ''} sem data de nascimento cadastrada.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-zinc-400">
                  <Users size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum paciente com data de nascimento preenchida.</p>
                </div>
              )}
            </div>

            {/* Perfil de Gênero */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-pink-50 rounded-xl"><Users size={18} className="text-pink-500" /></div>
                <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Perfil de Gênero</h3>
              </div>
              {genderProfileData.totalIdentificado > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="h-[200px] w-full sm:w-[200px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={genderProfileData.data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                          {genderProfileData.data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          formatter={(value: any) => {
                            const num = Number(value);
                            return [`${num} paciente${num !== 1 ? 's' : ''} (${((num / genderProfileData.totalIdentificado) * 100).toFixed(1)}%)`, ''];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-3 w-full">
                    {genderProfileData.data.map(item => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-sm font-bold text-priori-navy">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-priori-navy">{item.value}</span>
                          <span className="text-[10px] text-zinc-400 ml-2">{((item.value / genderProfileData.totalIdentificado) * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                    {genderProfileData.naoIdentificado > 0 && (
                      <div className="pt-3 mt-3 border-t border-zinc-100">
                        <p className="text-[10px] text-zinc-400 text-center">
                          * {genderProfileData.naoIdentificado} paciente{genderProfileData.naoIdentificado !== 1 ? 's' : ''} sem gênero preenchido no cadastro.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-zinc-400">
                  <Users size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum paciente com gênero preenchido no cadastro.</p>
                  <p className="text-xs mt-1">Acesse Pacientes e preencha o campo Gênero.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Churn / Retenção ── */}
          {inactivatedThisMonth.length > 0 && (
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-red-50 rounded-xl"><UserMinus size={18} className="text-red-500" /></div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Churn — Pacientes Inativados</h3>
                  <p className="text-[10px] text-zinc-400">{selectedMonthLabel}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="p-4 bg-red-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-red-500">{inactivatedThisMonth.length}</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Inativados</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-emerald-600">{activeCustomersCount}</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Ativos</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-purple-600">{retentionRate.toFixed(1)}%</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Retenção</p>
                </div>
              </div>
              {churnByReason.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Motivos de Inativação</p>
                  {churnByReason.map(r => (
                    <div key={r.reason} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <span className="text-sm text-zinc-600">{r.reason}</span>
                      <span className="text-sm font-bold text-red-500">{r.count} paciente{r.count > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Heatmap de Horários (filtrado pelo período selecionado) ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-priori-navy/10 rounded-xl"><BarChart2 size={18} className="text-priori-navy" /></div>
              <div>
                <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Mapa de Calor — Horários Mais Ocupados</h3>
                <p className="text-[10px] text-zinc-400">{selectedMonthLabel}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs mt-4">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-3 pr-4 w-16">Hora</th>
                    {heatmapData.dayNames.map(d => (
                      <th key={d} className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-3 px-1">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.hours.map(hour => (
                    <tr key={hour}>
                      <td className="text-[10px] font-bold text-zinc-400 pr-4 py-1">{hour}</td>
                      {heatmapData.dayNames.map(day => {
                        const value     = heatmapData.grid[hour]?.[day] || 0;
                        const intensity = value / maxHeatmapValue;
                        const bg        = intensity === 0 ? 'bg-zinc-50' : intensity < 0.33 ? 'bg-priori-navy/10' : intensity < 0.66 ? 'bg-priori-navy/30' : 'bg-priori-navy/70';
                        const textColor = intensity >= 0.66 ? 'text-white' : 'text-priori-navy';
                        return (
                          <td key={day} className="px-1 py-1">
                            <div className={cn('w-full h-8 rounded-lg flex items-center justify-center font-bold transition-all', bg, textColor)}>
                              {value > 0 ? value : ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-3 mt-4 justify-end">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Intensidade:</span>
                {[
                  { label: 'Vazio', bg: 'bg-zinc-50 border border-zinc-200' },
                  { label: 'Baixo', bg: 'bg-priori-navy/10' },
                  { label: 'Médio', bg: 'bg-priori-navy/30' },
                  { label: 'Alto',  bg: 'bg-priori-navy/70' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div className={cn('w-4 h-4 rounded', l.bg)} />
                    <span className="text-[10px] text-zinc-400">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ABA 3: FINANCEIRO
          Receita vs Despesas + Breakdowns + Modalidade + Despesas
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'financeiro' && (
        <div className="space-y-6">

          {/* ── Gráfico Receita vs Despesas ── */}
          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
            <div className="mb-2">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center">Receita vs Despesas ao Longo do Tempo</h3>
              <p className="text-[10px] text-zinc-400 text-center mt-1">Receita baseada em consultas realizadas (histórico completo)</p>
            </div>
            <div className="h-[300px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueVsExpensesData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(v: any) => `R$ ${fmt(Number(v))}`} />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area type="monotone" dataKey="receita"  name="Receita"       fill="#10b981" stroke="#10b981" fillOpacity={0.15} strokeWidth={2} animationDuration={1500} />
                  <Area type="monotone" dataKey="despesas" name="Despesas"      fill="#ef4444" stroke="#ef4444" fillOpacity={0.15} strokeWidth={2} animationDuration={1500} />
                  <Line type="monotone" dataKey="lucro"    name="Lucro Líquido" stroke="#d4af37" strokeWidth={3} dot={{ r: 4, fill: '#d4af37' }} activeDot={{ r: 6 }} animationDuration={1500} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Faturamento por Plano / Psicólogo / Mensal ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento por Plano</h3>
              <div className="space-y-4">
                {revenueByPlan.length > 0 ? revenueByPlan.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm text-priori-navy">{item.name}</span>
                    <span className="text-sm font-bold text-priori-gold">R$ {fmtShort(item.total)}</span>
                  </div>
                )) : <p className="text-sm text-zinc-400 text-center py-4">Sem dados no período</p>}
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento por Psicólogo</h3>
              <div className="space-y-4">
                {revenueByPsychologist.length > 0 ? revenueByPsychologist.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm text-priori-navy">{item.name}</span>
                    <span className="text-sm font-bold text-priori-gold">R$ {fmtShort(item.total)}</span>
                  </div>
                )) : <p className="text-sm text-zinc-400 text-center py-4">Sem dados no período</p>}
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Faturamento Mensal (Consultas)</h3>
              <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {monthlyData.map(item => (
                  <div key={item.month} className="flex flex-col gap-1 py-1 border-b border-zinc-50 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-priori-navy capitalize">{item.month}</span>
                      <span className="text-sm font-bold text-priori-navy">Total: R$ {fmtShort(item.total)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-600">Realizado: R$ {fmtShort(item.realizado)}</span>
                      <span className="text-priori-gold">Previsto: R$ {fmtShort(item.previsto)}</span>
                    </div>
                  </div>
                ))}
                {monthlyData.length === 0 && <p className="text-sm text-zinc-400 text-center py-4">Nenhum dado financeiro</p>}
              </div>
            </div>
          </div>

          {/* ── Modalidade + Despesas ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Modalidade */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-2 text-center">Distribuição por Modalidade</h3>
              <div className="h-[220px] w-full">
                {modalityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={modalityData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" animationBegin={0} animationDuration={1500}>
                        {modalityData.map((_entry, index) => <Cell key={`cell-${index}`} fill={MODALITY_COLORS[index % MODALITY_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value: any) => [`${Number(value)} atendimentos`, 'Quantidade']} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic">Nenhum atendimento realizado</div>
                )}
              </div>
              {modalityData.length > 0 && (
                <div className="mt-4 flex justify-around text-[10px] font-bold uppercase tracking-tight text-zinc-400">
                  {modalityData.map((d, i) => {
                    const total   = modalityData.reduce((acc, curr) => acc + curr.value, 0);
                    const percent = Math.round((d.value / total) * 100);
                    return (
                      <div key={d.name} className="flex flex-col items-center">
                        <span style={{ color: MODALITY_COLORS[i] }}>{d.name}</span>
                        <span className="text-lg text-priori-navy">{percent}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Despesas por Categoria */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Resumo de Despesas por Categoria</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-red-500">Total: R$ {fmtShort(totalExpenses)}</span>
                  {getTrendText(totalExpenses, totalExpensesPrev)}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.values(ExpenseCategory).map(cat => {
                  const catTotal = expensesFiltered.filter(e => e.category === cat).reduce((acc, e) => acc + e.amount, 0);
                  if (catTotal === 0) return null;
                  return (
                    <div key={cat} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">{cat}</p>
                      <p className="text-lg font-bold text-priori-navy">R$ {fmtShort(catTotal)}</p>
                    </div>
                  );
                })}
                {expensesFiltered.length === 0 && (
                  <p className="col-span-4 text-sm text-zinc-400 text-center py-4">Sem despesas no período</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          ABA 4: EQUIPE
          Ranking Psicólogos + Crescimento + Evolução + Tipos + Ocupação por Dia
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'equipe' && (
        <div className="space-y-6">

          {/* ── Ranking de Psicólogos (com receita bruta e líquida) ── */}
          {psychologistRanking.length > 0 && (
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-priori-gold/10 rounded-xl"><Flame size={18} className="text-priori-gold" /></div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-widest">Ranking de Produtividade — Psicólogos</h3>
                  <p className="text-[10px] text-zinc-400">{selectedMonthLabel} · Bruto = total gerado · Líquido = o que fica para a clínica</p>
                </div>
              </div>
              <div className="space-y-4">
                {psychologistRanking.map((psy, idx) => {
                  const maxRevenue = psychologistRanking[0].grossRevenue || 1;
                  return (
                    <div key={psy.name} className="flex items-center gap-4">
                      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0',
                        idx === 0 ? 'bg-priori-gold text-white' : idx === 1 ? 'bg-zinc-300 text-zinc-700' : idx === 2 ? 'bg-amber-700/20 text-amber-700' : 'bg-zinc-100 text-zinc-500'
                      )}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                          <span className="text-sm font-bold text-priori-navy truncate">{psy.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-zinc-400">Bruto: <strong className="text-priori-gold">R$ {fmtShort(psy.grossRevenue)}</strong></span>
                            <span className="text-[10px] text-zinc-400">Líquido: <strong className="text-emerald-600">R$ {fmtShort(psy.netRevenue)}</strong></span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-priori-gold rounded-full transition-all" style={{ width: `${(psy.grossRevenue / maxRevenue) * 100}%` }} />
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-zinc-400">{psy.appointments} atendimentos</span>
                          <span className="text-[10px] text-zinc-400">·</span>
                          <span className="text-[10px] text-zinc-400">{psy.confirmationRate.toFixed(0)}% confirmação</span>
                          <span className="text-[10px] text-zinc-400">·</span>
                          <span className="text-[10px] text-zinc-400">Repasse: R$ {fmtShort(psy.repasseTotal)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Gráficos de Evolução ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Crescimento da Clínica (Acumulado)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line type="monotone" dataKey="patients"      name="Pacientes"   stroke="#1a365d" strokeWidth={3} dot={{ r: 4, fill: '#1a365d' }} activeDot={{ r: 6 }} animationDuration={1500} />
                    <Line type="monotone" dataKey="psychologists" name="Psicólogos"  stroke="#d4af37" strokeWidth={3} dot={{ r: 4, fill: '#d4af37' }} activeDot={{ r: 6 }} animationDuration={1500} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Evolução por Plano (Volume)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={planGrowthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {Array.from(new Set(plans.map(p => p.name))).map((name, i) => (
                      <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.6} animationDuration={1500} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6 text-center">Distribuição por Tipo (TUSS)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeGrowthData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {Array.from(new Set(appointments.map(a => a.type))).map((type, i) => (
                      <Bar key={type} dataKey={type as string} stackId="a" fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} radius={i === 0 ? [0, 0, 4, 4] : [0, 0, 0, 0]} animationDuration={1500} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ocupação por Dia da Semana (FIX: filtrado por período) */}
            <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
              <div className="mb-2">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest text-center">Ocupação das Salas (Por Dia)</h3>
                <p className="text-[10px] text-zinc-400 text-center mt-1">{selectedMonthLabel}</p>
              </div>
              <div className="h-[300px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roomUsageData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="day" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="count" name="Atendimentos" fill="#1a365d" radius={[8, 8, 0, 0]} animationDuration={1500} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-priori-gold/10 flex items-center justify-center">
          <Activity size={32} className="text-priori-gold" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-priori-navy">Núcleo Priori</h3>
          <p className="text-zinc-500 text-sm max-w-xs">Neuropsicologia e Psicoterapia. Use o menu lateral para gerenciar seus pacientes e agenda.</p>
        </div>
      </div>

    </div>
  );
};
