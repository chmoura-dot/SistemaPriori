import React from 'react';
import {
  Calendar, Target, DollarSign, Zap, Users, ShieldCheck,
  AlertTriangle, TrendingUp, Activity, ArrowUpRight, ChevronRight, RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { fmt, getTrendText } from './utils';
import { useDashboardData } from '../../hooks/useDashboardData';

type Props = ReturnType<typeof useDashboardData> & {
  onNavigate: (path: string) => void;
};

export const DashboardResumoTab = (props: Props) => {
  const {
    customers, psychologists, isLoading, error, refreshData,
    today, todayApps, todayConfirmed, todayCanceled, upcomingToday,
    activeCustomersCount, revenueRealizado, revenueRealizadoPrev,
    attendanceRate, attendanceRatePrev, cancelationRate, cancelationRatePrev,
    ticketMedioConsulta, ticketMedioConsultaPrev, ticketMedioPaciente,
    occupancyRate, appsRealizados, estimatedCapacity,
    retentionRate, inactivatedThisMonth,
    forecastRevenue, forecastProgress, revenuePrevisto,
    totalRepasseRealizado, totalExpenses, netProfit,
    selectedMonthLabel, filterMode, isPeriodClosed,
    onNavigate,
  } = props;

  const trendOpts = { filterMode };
  const trendOptsInvert = { filterMode, invertColors: true };

  return (
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
          <div className="flex items-center gap-3">
            <button
              onClick={refreshData}
              title="Atualizar agenda"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-priori-navy hover:bg-zinc-100 transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => onNavigate('/agenda')} className="text-xs font-bold text-priori-gold hover:text-priori-navy transition-colors flex items-center gap-1">
              Ver agenda completa <ChevronRight size={14} />
            </button>
          </div>
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

        {error ? (
          <div className="text-center py-6 text-red-400">
            <AlertTriangle size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Falha ao carregar agenda</p>
            <button onClick={refreshData} className="mt-2 text-xs font-bold text-priori-gold hover:text-priori-navy transition-colors">
              Tentar novamente
            </button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-zinc-100 rounded-xl" />
            ))}
          </div>
        ) : upcomingToday.length > 0 ? (
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
            extra: getTrendText(revenueRealizado, revenueRealizadoPrev, trendOpts),
          },
          {
            label: 'Taxa de Comparecimento', value: `${attendanceRate.toFixed(1)}%`,
            prevValue: attendanceRatePrev, currentNum: attendanceRate,
            icon: ShieldCheck, color: 'text-priori-gold', bg: 'bg-priori-gold/10', path: '/agenda',
            extra: getTrendText(attendanceRate, attendanceRatePrev, trendOpts),
          },
          {
            label: 'Taxa de Cancelamentos', value: `${cancelationRate.toFixed(1)}%`,
            prevValue: cancelationRatePrev, currentNum: cancelationRate,
            icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', path: '/agenda',
            extra: getTrendText(cancelationRate, cancelationRatePrev, trendOptsInvert),
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
          <div className="mt-1">{getTrendText(ticketMedioConsulta, ticketMedioConsultaPrev, trendOpts)}</div>
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
              <h3 className="text-sm font-bold text-priori-navy">
                {isPeriodClosed ? 'Resultado Final' : 'Forecast de Receita'} — {selectedMonthLabel}
              </h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                {isPeriodClosed ? 'Período encerrado — somente consultas realizadas' : 'Realizado + Previsto (agendamentos futuros)'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-400">{isPeriodClosed ? 'Total realizado' : 'Projeção total'}</p>
            <p className="text-lg font-black text-priori-navy">R$ {fmt(isPeriodClosed ? revenueRealizado : forecastRevenue)}</p>
          </div>
        </div>
        <div className="h-3 w-full bg-zinc-100 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700"
            style={{ width: `${isPeriodClosed ? 100 : forecastProgress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            <span className="text-zinc-600">Realizado: <strong className="text-emerald-600">R$ {fmt(revenueRealizado)}</strong></span>
          </div>
          <span className="font-bold text-zinc-400">
            {isPeriodClosed ? '100% — encerrado' : `${forecastProgress.toFixed(1)}% concluído`}
          </span>
          {!isPeriodClosed && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-zinc-200 inline-block" />
              <span className="text-zinc-600">Previsto: <strong className="text-priori-gold">R$ {fmt(revenuePrevisto)}</strong></span>
            </div>
          )}
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
  );
};
