import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Trash2,
  Filter,
  User,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  RotateCcw,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { format, subMonths } from 'date-fns';

import {
  AppointmentType,
  Repasse,
  RepasseStatus,
  UserRole,
} from '../services/types';
import { api } from '../services/api';
import { Button } from '../components/Button';
import { MonthSelector } from '../components/MonthSelector';
import { useRepasseData } from '../hooks/useRepasseData';
import { getRepassValue, getBatchYearMonth } from './repasse/repasseHelpers';

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// ─── Filtro de período do Histórico de Repasses ────────────────────────
// O histórico crescia sem limite quando nenhum filtro de mês estava ativo.
// Por padrão mostra só o último mês (por data de geração do repasse), com
// opção de expandir — mesmo padrão já usado no histórico de lotes pagos
// da aba Faturamento.
type HistoryPeriod = '1m' | '3m' | '6m' | '1y' | 'all';

const HISTORY_PERIOD_OPTIONS: { value: HistoryPeriod; label: string }[] = [
  { value: '1m', label: 'Último mês' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '1y', label: 'Último ano' },
  { value: 'all', label: 'Ver tudo' },
];

export const RepassePage = () => {
  const {
    repasses,
    batches,
    appointments,
    customers,
    plans,
    psychologists,
    isLoading,
    isGenerating,
    filterMonth,
    setFilterMonth,
    filterPsyId,
    setFilterPsyId,
    filterStatus,
    setFilterStatus,
    isFiltersOpen,
    setIsFiltersOpen,
    expandedGroupKeys,
    toggleGroupExpanded,
    expandedRepasseIds,
    toggleRepasseExpanded,
    filteredPendingGroups,
    filteredRepasses,
    summary,
    handleGenerateRepasse,
    handleMarkAsPaid,
    handleDelete,
    handlePDF,
  } = useRepasseData();

  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('1m');

  // Mais recentes primeiro (a fonte não garante ordenação).
  const sortedRepasses = useMemo(
    () => [...filteredRepasses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filteredRepasses]
  );

  // Com um mês específico já selecionado no filtro de topo, o recorte por
  // período fica redundante — mostra tudo o que bate com aquele mês. Sem
  // filtro de mês, aplica o período (padrão: último mês) para não listar o
  // histórico inteiro de uma vez.
  const visibleRepasses = useMemo(() => {
    if (filterMonth || historyPeriod === 'all') return sortedRepasses;
    const monthsBack = historyPeriod === '1m' ? 0 : historyPeriod === '3m' ? 2 : historyPeriod === '6m' ? 5 : 11;
    const cutoffKey = format(subMonths(new Date(), monthsBack), 'yyyy-MM');
    return sortedRepasses.filter(r => r.createdAt.substring(0, 7) >= cutoffKey);
  }, [sortedRepasses, historyPeriod, filterMonth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-priori-navy" size={32} />
      </div>
    );
  }

  // Component handles and loaders are fully managed by useRepasseData hook

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-priori-navy tracking-tight">Repasses</h1>
          <p className="text-zinc-500 mt-1">Gerencie pagamentos aos psicólogos após recebimento dos planos</p>
        </div>
        <div className="flex items-center gap-2">
          {api.getCurrentUser()?.role === UserRole.ADMIN && (
            <Button
              onClick={() => { window.location.hash = '/auditoria'; }}
              variant="outline"
              className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 flex items-center gap-1.5 shadow-sm"
            >
              <ShieldAlert size={16} className="text-priori-navy" />
              Auditar Alterações
            </Button>
          )}
          <Button
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            variant="outline"
            className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 shadow-sm"
          >
            <Filter size={16} />
            {isFiltersOpen ? 'Ocultar Filtros' : 'Mostrar Filtros'}
            {(filterMonth || filterPsyId || filterStatus) && (
              <span className="w-2 h-2 rounded-full bg-priori-navy animate-pulse" />
            )}
          </Button>
        </div>
      </div>

      {/* Barra de Filtros */}
      {isFiltersOpen && (
        <div className="flex flex-col md:flex-row items-end gap-4 bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Psicólogo */}
          <div className="flex-1 w-full">
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">Psicólogo(a)</label>
            <select
              value={filterPsyId}
              onChange={(e) => setFilterPsyId(e.target.value)}
              className="w-full bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-sm text-zinc-800 focus:ring-2 focus:ring-priori-navy/10 focus:border-priori-navy transition-all outline-none font-medium"
            >
              <option value="">Todos os psicólogos</option>
              {psychologists
                .filter(p => p.active)
                .map(psy => (
                  <option key={psy.id} value={psy.id}>{psy.name}</option>
                ))
              }
            </select>
          </div>

          {/* Mês de Referência */}
          <div className="flex-1 w-full">
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">Mês de Referência</label>
            <MonthSelector
              value={filterMonth}
              onChange={setFilterMonth}
            />
          </div>

          {/* Status */}
          <div className="flex-1 w-full">
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">Status do Repasse</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 text-sm text-zinc-800 focus:ring-2 focus:ring-priori-navy/10 focus:border-priori-navy transition-all outline-none font-medium"
            >
              <option value="">Todos os status</option>
              <option value="READY">Repasses Disponíveis</option>
              <option value="PENDING">Repasse Pendente (Histórico)</option>
              <option value="PAID">Repasse Pago (Histórico)</option>
            </select>
          </div>

          {/* Botão de limpar filtros se algum filtro estiver ativo */}
          {(filterMonth || filterPsyId || filterStatus) && (
            <div className="w-full md:w-auto">
              <button
                onClick={() => {
                  setFilterMonth('');
                  setFilterPsyId('');
                  setFilterStatus('');
                }}
                className="w-full md:w-auto text-xs font-semibold text-red-500 hover:text-red-700 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 px-4 py-3 rounded-xl transition-all border border-red-100 shadow-sm whitespace-nowrap"
              >
                <X size={14} />
                Limpar Filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cards de Resumo — mesmo padrão visual dos cartões de Faturamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Card 1: Total a Liberar */}
        <div className="bg-white rounded-2xl border border-amber-100 p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">
              Total a Liberar ({summary.pendingGenerationCount} {summary.pendingGenerationCount === 1 ? 'lote' : 'lotes'})
            </p>
            <h3 className="text-2xl font-bold text-priori-navy">
              {fmt.format(summary.pendingGenerationAmount)}
            </h3>
            <p className="text-xs text-amber-600 mt-0.5">Aguardando geração</p>
          </div>
        </div>

        {/* Card 2: Liberado para Pagamento */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">
              Liberado para Pagamento ({summary.repassesPendingCount} {summary.repassesPendingCount === 1 ? 'pendente' : 'pendentes'})
            </p>
            <h3 className="text-2xl font-bold text-priori-navy">
              {fmt.format(summary.repassesPendingAmount)}
            </h3>
            <p className="text-xs text-red-600 mt-0.5">Pronto para pagar</p>
          </div>
        </div>

        {/* Card 3: Total Pago */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">Total Pago</p>
            <h3 className="text-2xl font-bold text-priori-navy">
              {fmt.format(summary.repassesPaidAmount)}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">{summary.repassesPaidCount} {summary.repassesPaidCount === 1 ? 'repasse pago' : 'repasses pagos'}</p>
          </div>
        </div>
      </div>

      {/* Pendentes de Geração */}
      {(!filterStatus || filterStatus === 'READY') && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-priori-navy flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            Repasses Pendentes de Geração
            <span className="text-xs font-normal text-zinc-400">({filteredPendingGroups.length} lote(s) pronto(s))</span>
          </h2>

          {filteredPendingGroups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center text-zinc-500 text-sm flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 border border-zinc-200">
                <Clock size={24} />
              </div>
              <div>
                <p className="font-semibold text-zinc-700">Nenhum repasse pendente de geração</p>
                <p className="text-xs text-zinc-400 mt-0.5 max-w-md">
                  {filterMonth || filterPsyId
                    ? 'Nenhum lote corresponde aos filtros aplicados nesta competência.'
                    : 'Nenhum lote pago aguarda repasse. Marque um lote como pago em Faturamento para gerar repasses.'}
                </p>
              </div>
              {(filterMonth || filterPsyId) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilterMonth('');
                    setFilterPsyId('');
                  }}
                  className="mt-1 text-xs border-zinc-200 hover:bg-zinc-50 text-priori-navy flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  Limpar Filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Psicólogo(a)</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Plano de Saúde</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Lote</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Data Pagamento Plano</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Sessões</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Repasse</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredPendingGroups.map(group => {
                      const psy = psychologists.find(p => p.id === group.psyId);
                      const key = `${group.psyId}-${group.batch.id}`;
                      const isExpanded = !!expandedGroupKeys[key];
                      const groupApps = appointments.filter(a => group.appIds.includes(a.id));

                      return (
                        <React.Fragment key={key}>
                          <tr className="hover:bg-zinc-50/40 transition-colors">
                            <td className="px-6 py-4 font-medium text-priori-navy">
                              <button
                                onClick={() => toggleGroupExpanded(key)}
                                className="flex items-center gap-2.5 text-left text-priori-navy hover:text-priori-navy/80 focus:outline-none transition-colors"
                              >
                                <div className="w-8 h-8 rounded-xl bg-priori-navy/10 flex items-center justify-center flex-shrink-0 transition-transform">
                                  <User size={14} className="text-priori-navy" />
                                </div>
                                <span className="font-semibold text-zinc-950">{psy?.name ?? '—'}</span>
                                {isExpanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{group.batch.healthPlan}</td>
                            <td className="px-6 py-4 text-sm text-zinc-600">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200/50">
                                #{group.batch.batchNumber}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-600">
                              {group.batch.paidAt ? (
                                <div className="flex items-center gap-1.5 text-zinc-600">
                                  <Calendar size={13} className="text-zinc-400" />
                                  <span>{format(new Date(group.batch.paidAt), 'dd/MM/yyyy')}</span>
                                </div>
                              ) : '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{group.appIds.length}</td>
                            <td className="px-6 py-4 font-semibold text-priori-navy">
                            <div className="flex items-center gap-1.5">
                              {fmt.format(group.total)}
                              {group.divergences.length > 0 && (
                                <span
                                  className="text-amber-500 cursor-help"
                                  title={group.divergences.map(d =>
                                    `${d.customerName}: salvo R$ ${d.actual.toFixed(2)}, esperado R$ ${d.expected.toFixed(2)}`
                                  ).join('\n')}
                                >
                                  <AlertTriangle size={14} />
                                </span>
                              )}
                            </div>
                            {group.divergences.length > 0 && (
                              <div className="text-[10px] text-amber-600 font-normal mt-0.5">
                                {group.divergences.length} valor(es) divergente(s)
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              className="bg-priori-navy hover:bg-priori-navy/90 text-white shadow-sm font-semibold"
                              onClick={() => handleGenerateRepasse(group)}
                              disabled={isGenerating === key}
                            >
                              {isGenerating === key ? (
                                <Loader2 size={14} className="animate-spin mr-1" />
                              ) : (
                                <Plus size={14} className="mr-1" />
                              )}
                              Gerar Repasse
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-6 py-4 bg-zinc-50/50 border-t border-b border-zinc-100">
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-priori-navy uppercase tracking-wider">Atendimentos incluídos neste repasse planejado:</h4>
                                <div className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-500 font-bold text-[10px] uppercase tracking-wider">
                                        <th className="px-4 py-3">Paciente</th>
                                        <th className="px-4 py-3">Data da Sessão</th>
                                        <th className="px-4 py-3">Tipo / Procedimento</th>
                                        <th className="px-4 py-3 text-right">Valor Repasse</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 text-zinc-600">
                                      {groupApps.map(app => {
                                        const customer = customers.find(c => c.id === app.customerId);
                                        const pricingCtx = { customers, plans, appointments };
                                        const repassVal = getRepassValue(app, customers, plans, psy, pricingCtx);
                                        return (
                                          <tr key={app.id} className="hover:bg-zinc-50/50">
                                            <td className="px-4 py-2.5 font-semibold text-priori-navy">{customer?.name ?? '—'}</td>
                                            <td className="px-4 py-2.5">
                                              <div className="flex items-center gap-1.5 text-zinc-600">
                                                <Calendar size={12} className="text-zinc-300" />
                                                <span>{format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                                              </div>
                                            </td>
                                            <td className="px-4 py-2.5 capitalize text-zinc-600">{app.type === AppointmentType.NEUROPSICOLOGICA ? 'Neuropsicologia' : 'Sessão Comum'}</td>
                                            <td className="px-4 py-2.5 text-right font-bold text-priori-navy">{fmt.format(repassVal)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>
      )}


      {/* Histórico de Repasses */}
      {(!filterStatus || filterStatus === 'PENDING' || filterStatus === 'PAID') && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-priori-navy flex items-center gap-2">
              <ArrowRightLeft size={18} className="text-priori-navy" />
              Histórico de Repasses
              <span className="text-xs font-normal text-zinc-400">
                {!filterMonth && visibleRepasses.length !== filteredRepasses.length
                  ? `(${visibleRepasses.length} de ${filteredRepasses.length} repasses)`
                  : `(${filteredRepasses.length} repasses listados)`}
              </span>
            </h2>
            {!filterMonth && filteredRepasses.length > 0 && (
              <select
                value={historyPeriod}
                onChange={(e) => setHistoryPeriod(e.target.value as HistoryPeriod)}
                className="text-xs font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-priori-navy/20"
              >
                {HISTORY_PERIOD_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>

          {filteredRepasses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center text-zinc-500 text-sm flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 border border-zinc-200">
                <ArrowRightLeft size={24} />
              </div>
              <div>
                <p className="font-semibold text-zinc-700">Nenhum repasse no histórico</p>
                <p className="text-xs text-zinc-400 mt-0.5 max-w-md">
                  {filterMonth || filterPsyId || filterStatus
                    ? 'Nenhum repasse do histórico corresponde aos filtros aplicados.'
                    : 'Nenhum repasse gerado ainda.'}
                </p>
              </div>
              {(filterMonth || filterPsyId || filterStatus) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilterMonth('');
                    setFilterPsyId('');
                    setFilterStatus('');
                  }}
                  className="mt-1 text-xs border-zinc-200 hover:bg-zinc-50 text-priori-navy flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  Limpar Filtros
                </Button>
              )}
            </div>
          ) : visibleRepasses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center text-zinc-500 text-sm flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 border border-zinc-200">
                <ArrowRightLeft size={24} />
              </div>
              <div>
                <p className="font-semibold text-zinc-700">Nenhum repasse neste período</p>
                <p className="text-xs text-zinc-400 mt-0.5 max-w-md">Há repasses mais antigos fora do período selecionado.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setHistoryPeriod('all')}
                className="mt-1 text-xs border-zinc-200 hover:bg-zinc-50 text-priori-navy flex items-center gap-1.5"
              >
                Ver todo o histórico
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Psicólogo(a)</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Plano</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Lote</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Data Envio Lote</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Total Repasse</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {visibleRepasses.map(repasse => {
                      const psy = psychologists.find(p => p.id === repasse.psychologistId);
                      const batch = batches.find(b => b.id === repasse.billingBatchId);
                      const isExpanded = !!expandedRepasseIds[repasse.id];
                      const repasseApps = appointments.filter(a => repasse.appointmentIds.includes(a.id));

                      return (
                        <React.Fragment key={repasse.id}>
                          <tr className="hover:bg-zinc-50/40 transition-colors">
                            <td className="px-6 py-4 font-medium text-priori-navy">
                            <button
                              onClick={() => toggleRepasseExpanded(repasse.id)}
                              className="flex items-center gap-2.5 text-left text-priori-navy hover:text-priori-navy/80 focus:outline-none transition-colors font-semibold"
                            >
                              <div className="w-8 h-8 rounded-xl bg-priori-navy/10 flex items-center justify-center flex-shrink-0 transition-transform">
                                <User size={14} className="text-priori-navy" />
                              </div>
                              <span className="font-semibold text-zinc-950">{psy?.name ?? '—'}</span>
                              {isExpanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{batch?.healthPlan ?? '—'}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200/50">
                              #{batch?.batchNumber ?? '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-zinc-600">
                            {batch?.sentAt ? (
                              <div className="flex items-center gap-1.5 text-zinc-600">
                                <Calendar size={13} className="text-zinc-400" />
                                <span>{format(new Date(batch.sentAt), 'dd/MM/yyyy')}</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-6 py-4 font-semibold text-priori-navy">{fmt.format(repasse.totalAmount)}</td>
                          <td className="px-6 py-4">
                            {repasse.status === RepasseStatus.PAID ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                                <CheckCircle2 size={10} />
                                Pago em {repasse.paidAt ? format(new Date(repasse.paidAt), 'dd/MM/yyyy') : '—'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                                <Clock size={10} />
                                Pendente
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePDF(repasse)}
                              className="text-priori-navy border-zinc-200 shadow-sm hover:bg-zinc-50"
                              title="Exportar PDF"
                            >
                              <FileText size={14} />
                            </Button>
                            {repasse.status === RepasseStatus.PENDING && (
                              <Button
                                size="sm"
                                onClick={() => handleMarkAsPaid(repasse)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
                              >
                                <CheckCircle2 size={14} className="mr-1" />
                                Marcar Pago
                              </Button>
                            )}
                            <button
                              onClick={() => handleDelete(repasse.id)}
                              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all inline-block align-middle"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-6 py-4 bg-zinc-50/50 border-t border-b border-zinc-100">
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-priori-navy uppercase tracking-wider">Atendimentos incluídos neste repasse:</h4>
                                <div className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-500 font-bold text-[10px] uppercase tracking-wider">
                                        <th className="px-4 py-3">Paciente</th>
                                        <th className="px-4 py-3">Data da Sessão</th>
                                        <th className="px-4 py-3">Tipo / Procedimento</th>
                                        <th className="px-4 py-3 text-right">Valor Repassado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 text-zinc-600">
                                      {repasseApps.map(app => {
                                        const customer = customers.find(c => c.id === app.customerId);
                                        const pricingCtx = { customers, plans, appointments };
                                        const repassVal = getRepassValue(app, customers, plans, psy, pricingCtx);

                                        return (
                                          <tr key={app.id} className="hover:bg-zinc-50/50">
                                            <td className="px-4 py-2.5 font-semibold text-priori-navy">{customer?.name ?? '—'}</td>
                                            <td className="px-4 py-2.5">
                                              <div className="flex items-center gap-1.5 text-zinc-600">
                                                <Calendar size={12} className="text-zinc-300" />
                                                <span>{format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                                              </div>
                                            </td>
                                            <td className="px-4 py-2.5 capitalize text-zinc-600">{app.type === AppointmentType.NEUROPSICOLOGICA ? 'Neuropsicologia' : 'Sessão Comum'}</td>
                                            <td className="px-4 py-2.5 text-right font-bold text-priori-navy">{fmt.format(repassVal)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
