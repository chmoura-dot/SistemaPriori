import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Filter,
  CheckCircle2,
  Clock,
  Loader2,
  Receipt,
  CreditCard,
  Layers,
  Check,
  AlertCircle
} from 'lucide-react';
import { api } from '../services/api';
import { 
  Appointment, 
  Customer, 
  Plan, 
  Psychologist, 
  AppointmentStatus, 
  HealthPlan, 
  AppointmentType, 
  BillingBatch, 
  Repasse, 
  Expense,
  BillingBatchStatus,
  RepasseStatus
} from '../services/types';
import { cn, formatCurrency } from '../lib/utils';
import { getAppPrice } from '../lib/pricing';
import { Button } from '../components/Button';
import { MonthSelector } from '../components/MonthSelector';

export const FinancialPage = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOrigin, setFilterOrigin] = useState<string>('all');

  const loadData = async () => {
    try {
      const [apps, bts, rps, cust, pl, psy, exp] = await Promise.all([
        api.getAppointments(),
        api.getBillingBatches(),
        api.getRepasses(),
        api.getCustomers(),
        api.getPlans(),
        api.getPsychologists(),
        api.getExpenses(),
      ]);

      const billed = apps.filter(a => 
        a.confirmedPsychologist || 
        (a.status === AppointmentStatus.CANCELED && (
          a.cancellationBilling === 'plan' ||
          a.cancellationBilling === 'particular' ||
          a.cancellationFault === 'patient_exempt'
        ))
      );

      setAppointments(billed);
      setBatches(bts);
      setRepasses(rps);
      setCustomers(cust);
      setPlans(pl);
      setPsychologists(psy);
      setExpenses(exp);
    } catch (err) {
      console.error('[Financeiro] Erro ao carregar dados:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pricingCtx = useMemo(() => ({
    customers,
    plans,
    appointments
  }), [customers, plans, appointments]);


  // Lista unificada de todas as movimentações financeiras geradas pelas regras de faturamento e repasse
  const allTransactions = useMemo(() => {
    const transactions: {
      id: string;
      type: 'entrada_convenio' | 'entrada_particular' | 'saida_repasse' | 'saida_despesa';
      description: string;
      origin: string;
      date: string;
      competence: string;
      amount: number;
      status: 'pending' | 'partial' | 'paid';
      originalEntity: any;
    }[] = [];

    // 1. Entradas: Lotes de Convênios
    batches.forEach(batch => {
      // Competência com base nos atendimentos majoritários do lote
      const batchApps = appointments.filter(a => batch.appointmentIds.includes(a.id));
      const monthCounts: Record<string, number> = {};
      for (const app of batchApps) {
        const month = (app.date || '').substring(0, 7);
        if (/^\d{4}-\d{2}$/.test(month)) {
          monthCounts[month] = (monthCounts[month] || 0) + 1;
        }
      }
      const competence = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || batch.sentAt.substring(0, 7);

      let status: 'pending' | 'partial' | 'paid' = 'pending';
      if (batch.status === BillingBatchStatus.PAID) status = 'paid';

      transactions.push({
        id: `batch-${batch.id}`,
        type: 'entrada_convenio',
        description: `Lote #${batch.batchNumber} - ${batch.healthPlan}`,
        origin: batch.healthPlan,
        date: batch.sentAt.substring(0, 10),
        competence,
        amount: batch.totalAmount,
        status,
        originalEntity: batch
      });
    });

    // 2. Entradas: Consultas Particulares (não faturadas via lotes)
    const particularApps = appointments.filter(app => {
      const customer = customers.find(c => c.id === app.customerId);
      return !app.billingBatchId && (customer?.healthPlan === HealthPlan.PARTICULAR || !customer?.healthPlan);
    });

    particularApps.forEach(app => {
      const customer = customers.find(c => c.id === app.customerId);
      const price = getAppPrice(app, pricingCtx);
      if (price <= 0) return;

      const competence = app.date.substring(0, 7);
      const status: 'pending' | 'partial' | 'paid' = app.paidAt ? 'paid' : 'pending';

      transactions.push({
        id: `app-${app.id}`,
        type: 'entrada_particular',
        description: `Particular - ${customer?.name || 'Paciente'}`,
        origin: 'Particular',
        date: app.date,
        competence,
        amount: price,
        status,
        originalEntity: app
      });
    });
    // 3. Saídas: Obrigações de Repasse aos Psicólogos
    repasses.forEach(repasse => {
      const psy = psychologists.find(p => p.id === repasse.psychologistId);
      const batch = batches.find(b => b.id === repasse.billingBatchId);
      
      let competence = repasse.createdAt.substring(0, 7);
      if (batch) {
        const batchApps = appointments.filter(a => batch.appointmentIds.includes(a.id));
        const monthCounts: Record<string, number> = {};
        for (const app of batchApps) {
          const month = (app.date || '').substring(0, 7);
          if (/^\d{4}-\d{2}$/.test(month)) {
            monthCounts[month] = (monthCounts[month] || 0) + 1;
          }
        }
        competence = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || batch.sentAt.substring(0, 7);
      }

      const status: 'pending' | 'partial' | 'paid' = repasse.status === RepasseStatus.PAID ? 'paid' : 'pending';

      transactions.push({
        id: `repasse-${repasse.id}`,
        type: 'saida_repasse',
        description: `Repasse - ${psy?.name || 'Psicólogo(a)'}${batch ? ` (Lote #${batch.batchNumber})` : ''}`,
        origin: psy?.name || 'Psicólogo(a)',
        date: repasse.createdAt.substring(0, 10),
        competence,
        amount: -repasse.totalAmount,
        status,
        originalEntity: repasse
      });
    });

    // 4. Saídas: Despesas Gerais da Clínica
    expenses.forEach(expense => {
      const competence = expense.date.substring(0, 7);
      transactions.push({
        id: `expense-${expense.id}`,
        type: 'saida_despesa',
        description: `${expense.description} (${expense.category})`,
        origin: expense.beneficiary || expense.category,
        date: expense.date,
        competence,
        amount: -expense.amount,
        status: 'paid',
        originalEntity: expense
      });
    });

    return transactions;
  }, [batches, appointments, repasses, customers, plans, psychologists, expenses, pricingCtx]);

  // Lista única das operadoras/origens para alimentar o filtro
  const uniqueOrigins = useMemo(() => {
    const plans = batches.map(b => b.healthPlan);
    return Array.from(new Set(['Particular', ...plans]));
  }, [batches]);

  // Aplicação instantânea dos filtros locais via useMemo
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      const matchesMonth = !filterMonth || t.competence === filterMonth;
      const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
      
      let matchesOrigin = true;
      if (filterOrigin !== 'all') {
        if (filterOrigin === 'Particular') {
          matchesOrigin = t.type === 'entrada_particular';
        } else {
          if (t.type === 'entrada_convenio') {
            matchesOrigin = t.origin === filterOrigin;
          } else if (t.type === 'saida_repasse') {
            const rep = t.originalEntity as Repasse;
            const batch = batches.find(b => b.id === rep.billingBatchId);
            matchesOrigin = batch?.healthPlan === filterOrigin;
          } else {
            matchesOrigin = false;
          }
        }
      }

      return matchesMonth && matchesStatus && matchesOrigin;
    });
  }, [allTransactions, filterMonth, filterStatus, filterOrigin, batches]);

  // Estatísticas e Métricas Executivas consolidadas
  const stats = useMemo(() => {
    let entradasPrevisto = 0;
    let entradasRealizado = 0;
    let saidasComprometido = 0;
    let saidasPago = 0;
    let despesasTotais = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'entrada_convenio' || t.type === 'entrada_particular') {
        entradasPrevisto += t.amount;
        if (t.status === 'paid') {
          entradasRealizado += t.amount;
        }
      } else if (t.type === 'saida_repasse') {
        const absVal = Math.abs(t.amount);
        saidasComprometido += absVal;
        if (t.status === 'paid') {
          saidasPago += absVal;
        }
      } else if (t.type === 'saida_despesa') {
        despesasTotais += Math.abs(t.amount);
      }
    });

    const lucroPrevisto = entradasPrevisto - saidasComprometido - despesasTotais;
    const lucroRealizado = entradasRealizado - saidasPago - despesasTotais;

    return {
      entradasPrevisto,
      entradasRealizado,
      saidasComprometido,
      saidasPago,
      despesasTotais,
      lucroPrevisto,
      lucroRealizado
    };
  }, [filteredTransactions]);

  const handleMarkParticularPaid = async (appId: string) => {
    try {
      await api.updateAppointment(appId, { paidAt: new Date().toISOString() });
      await loadData();
    } catch (err) {
      console.error('[Financeiro] Erro ao registrar pagamento particular:', err);
      alert('Erro ao registrar o pagamento do atendimento particular.');
    }
  };

  const renderStatusBadge = (status: 'paid' | 'partial' | 'pending') => {
    const classes = {
      paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      partial: 'bg-amber-50 text-amber-700 border-amber-200',
      pending: 'bg-zinc-50 text-zinc-600 border-zinc-200',
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
          status === 'paid' ? 'bg-emerald-500 animate-pulse' : status === 'partial' ? 'bg-amber-500 animate-pulse' : 'bg-zinc-400'
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
            <div className="p-12 text-center text-zinc-400 text-sm italic flex flex-col items-center justify-center gap-2">
              <AlertCircle size={24} className="text-zinc-300" />
              Nenhum lançamento financeiro registrado com os filtros selecionados para esta competência.
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


