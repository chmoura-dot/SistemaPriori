import React from 'react';
import { 
  DollarSign, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Filter,
  Loader2,
  Receipt,
  CreditCard,
  Layers,
  Check,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { Button } from '../components/Button';
import { MonthSelector } from '../components/MonthSelector';
import { useFinancialData } from '../hooks/useFinancialData';

export const FinancialPage = () => {
  const {
    isLoading,
    isFiltersOpen,
    setIsFiltersOpen,
    filterMonth,
    setFilterMonth,
    filterStatus,
    setFilterStatus,
    filterOrigin,
    setFilterOrigin,
    uniqueOrigins,
    filteredTransactions,
    stats,
    handleMarkParticularPaid,
    resetFilters,
  } = useFinancialData();

  const renderStatusBadge = (status: 'paid' | 'partial' | 'pending') => {
    const classes = {
      paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      partial: 'bg-amber-50 text-amber-700 border-amber-200',
      pending: 'bg-priori-navy/10 text-priori-navy border-priori-navy/20',
    };
    const labels = {
      paid: 'Liquidado',
      partial: 'Parcial',
      pending: 'Pendente',
    };

    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
        classes[status]
      )}>
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === 'paid' ? 'bg-emerald-500 animate-pulse' : status === 'partial' ? 'bg-amber-500 animate-pulse' : 'bg-priori-navy'
        )} />
        {labels[status]}
      </span>
    );
  };

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
          <h1 className="text-3xl font-bold text-priori-navy tracking-tight">Financeiro</h1>
          <p className="text-zinc-500 mt-1">Visão unificada do fluxo de caixa operacional, lotes e repasses da clínica</p>
        </div>
        <Button
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
          variant="outline"
          className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 shadow-sm"
        >
          <Filter size={16} />
          {isFiltersOpen ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          {(filterMonth || filterStatus !== 'all' || filterOrigin !== 'all') && (
            <span className="w-2 h-2 rounded-full bg-priori-navy animate-pulse" />
          )}
        </Button>
      </div>

      {/* Barra de Filtros Retrátil */}
      {isFiltersOpen && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Competência / Mês */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Mês de Referência</label>
              <MonthSelector
                value={filterMonth}
                onChange={setFilterMonth}
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Status Financeiro</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy transition-all"
              >
                <option value="all">Todos os status</option>
                <option value="pending">Pendente</option>
                <option value="partial">Parcial</option>
                <option value="paid">Liquidado</option>
              </select>
            </div>

            {/* Convênio ou Origem */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Origem / Convênio</label>
              <select
                value={filterOrigin}
                onChange={(e) => setFilterOrigin(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 text-sm px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-priori-navy/30 focus:border-priori-navy transition-all"
              >
                <option value="all">Todas as origens</option>
                <option value="Particular">Particular</option>
                {uniqueOrigins.filter(o => o !== 'Particular').map(origin => (
                  <option key={origin} value={origin}>{origin}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard de Cartões de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Entradas */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <ArrowUpRight size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-500 mb-1">Entradas (Faturamento)</p>
            <h3 className="text-2xl font-bold text-priori-navy">
              {formatCurrency(stats.entradasRealizado)}
            </h3>
            <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
              <span>Previsto: {formatCurrency(stats.entradasPrevisto)}</span>
              <span className="font-semibold text-emerald-600">
                {stats.entradasPrevisto > 0 ? `${Math.round((stats.entradasRealizado / stats.entradasPrevisto) * 100)}%` : '0%'} realizado
              </span>
            </div>
          </div>
        </div>

        {/* Saídas */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <ArrowDownRight size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-500 mb-1">Repasses (Saídas)</p>
            <h3 className="text-2xl font-bold text-priori-navy">
              {formatCurrency(stats.saidasPago)}
            </h3>
            <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
              <span>Comprometido: {formatCurrency(stats.saidasComprometido)}</span>
              <span className="font-semibold text-red-600">
                {stats.saidasComprometido > 0 ? `${Math.round((stats.saidasPago / stats.saidasComprometido) * 100)}%` : '0%'} pago
              </span>
            </div>
          </div>
        </div>

        {/* Lucro Líquido */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <DollarSign size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-500 mb-1">Resultado Operacional</p>
            <h3 className={cn(
              "text-2xl font-bold",
              stats.lucroRealizado >= 0 ? 'text-priori-navy' : 'text-red-600'
            )}>
              {formatCurrency(stats.lucroRealizado)}
            </h3>
            <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
              <span>Previsto: {formatCurrency(stats.lucroPrevisto)}</span>
              <span className={cn(
                "font-semibold",
                stats.lucroRealizado >= 0 ? 'text-emerald-600' : 'text-red-600'
              )}>
                Líquido Realizado
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Lançamentos */}
      <div className="bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-priori-navy uppercase tracking-wider flex items-center gap-2">
            <Calendar size={18} className="text-priori-navy" />
            Fluxo de Lançamentos
          </h3>
          <span className="text-xs text-zinc-500">
            {filteredTransactions.length} {filteredTransactions.length === 1 ? 'registro encontrado' : 'registros encontrados'}
          </span>
        </div>

        <div className="overflow-x-auto">

          {filteredTransactions.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 text-sm flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 border border-zinc-200">
                <AlertCircle size={24} />
              </div>
              <div>
                <p className="font-semibold text-zinc-700">Nenhum lançamento encontrado</p>
                <p className="text-xs text-zinc-400 mt-0.5">Não há lançamentos financeiros com os filtros selecionados para esta competência.</p>
              </div>
              {(filterMonth || filterStatus !== 'all' || filterOrigin !== 'all') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetFilters}
                  className="mt-2 text-xs border-zinc-200 hover:bg-zinc-50 text-priori-navy flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  Limpar Filtros
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/70">
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lançamento / Origem</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data do Registro</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Competência</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTransactions.map(t => {
                  const isOutflow = t.amount < 0;
                  
                  let icon = <Layers size={14} />;
                  let iconBg = 'bg-blue-50 text-blue-600';
                  
                  if (t.type === 'entrada_particular') {
                    icon = <CreditCard size={14} />;
                    iconBg = 'bg-emerald-50 text-emerald-600';
                  } else if (t.type === 'saida_repasse') {
                    icon = <Users size={14} />;
                    iconBg = 'bg-amber-50 text-amber-600';
                  } else if (t.type === 'saida_despesa') {
                    icon = <Receipt size={14} />;
                    iconBg = 'bg-red-50 text-red-600';
                  }

                  return (
                    <tr key={t.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg", iconBg)}>
                            {icon}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-priori-navy">{t.description}</p>
                            <p className="text-xs text-zinc-400 uppercase tracking-wide">
                              {t.type === 'entrada_convenio' ? 'Faturamento Convênio' :
                               t.type === 'entrada_particular' ? 'Faturamento Particular' :
                               t.type === 'saida_repasse' ? 'Saída de Repasse' : 'Despesa Geral'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-600">
                        {new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-600 font-medium">
                        {(() => {
                          const [y, m] = t.competence.split('-');
                          const monthNames = [
                            'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                            'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
                          ];
                          return `${monthNames[parseInt(m) - 1]}/${y}`;
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "text-sm font-bold",
                          isOutflow ? 'text-red-600' : 'text-emerald-600'
                        )}>
                          {isOutflow ? '-' : '+'}{' '}{formatCurrency(Math.abs(t.amount))}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {renderStatusBadge(t.status)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {t.type === 'entrada_particular' && t.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleMarkParticularPaid(t.originalEntity.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-xs text-white"
                          >
                            <Check size={12} className="mr-1" />
                            Receber
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};


