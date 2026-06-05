import React, { useState } from 'react';
import {
  Activity, AlertCircle, RefreshCw, Calendar, Bell,
  Clock, UserMinus, ListOrdered,
  DollarSign, BarChart3, UserPlus, Stethoscope,
} from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { cn } from '../lib/utils';
import { DashboardFinanceiroV2Tab } from './dashboard/DashboardFinanceiroV2Tab';
import { DashboardOperacionalTab }  from './dashboard/DashboardOperacionalTab';
import { DashboardCaptacaoTab }     from './dashboard/DashboardCaptacaoTab';
import { DashboardQualitativoTab }  from './dashboard/DashboardQualitativoTab';

type TabId = 'financeiro' | 'operacional' | 'captacao' | 'clinico';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'financeiro',  label: 'Financeiro',  icon: <DollarSign size={14} />   },
  { id: 'operacional', label: 'Operacional', icon: <BarChart3 size={14} />    },
  { id: 'captacao',    label: 'Captação',    icon: <UserPlus size={14} />     },
  { id: 'clinico',     label: 'Clínico',     icon: <Stethoscope size={14} />  },
];

export const DashboardPage = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const [activeTab, setActiveTab] = useState<TabId>('financeiro');
  const data = useDashboardData();

  const {
    isLoading, error,
    filterMode, setFilterMode,
    selectedMonth, setSelectedMonth,
    selectedYear, setSelectedYear,
    availableMonths, availableYears,
    pendingConfirmationsToday, expiringSubscriptions,
    inactivePatients, waitingListPending,
  } = data;

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
          <h2 className="text-2xl font-bold text-priori-navy">Dashboard Gerencial</h2>
          <p className="text-zinc-500">Visão completa da operação e saúde financeira da clínica.</p>
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
              'flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all',
              activeTab === tab.id
                ? 'bg-white text-priori-navy shadow-sm'
                : 'text-zinc-500 hover:text-priori-navy'
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Conteúdo das Abas ── */}
      {activeTab === 'financeiro' && (
        <DashboardFinanceiroV2Tab
          {...data.financeiro}
          filterMode={data.filterMode}
        />
      )}
      {activeTab === 'operacional' && (
        <DashboardOperacionalTab
          {...data.operacional}
        />
      )}
      {activeTab === 'captacao' && (
        <DashboardCaptacaoTab
          {...data.captacao}
          filterMode={data.filterMode}
        />
      )}
      {activeTab === 'clinico' && (
        <DashboardQualitativoTab
          appointments={data.appointments}
          appointmentsFiltered={data.appointmentsFiltered}
          appsRealizados={data.appsRealizados}
          customers={data.customers}
          psychologists={data.psychologists}
          activeCustomersCount={data.activeCustomersCount}
        />
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
