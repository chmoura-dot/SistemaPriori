import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { 
  Appointment, 
  BillingBatch, 
  Repasse, 
  Customer, 
  Psychologist, 
  Expense, 
  BillingBatchStatus, 
  RepasseStatus, 
  AppointmentStatus, 
  HealthPlan, 
  Plan 
} from '../services/types';
import { getAppPrice } from '../lib/pricing';

export interface FinancialTransaction {
  id: string;
  type: 'entrada_convenio' | 'entrada_particular' | 'saida_repasse' | 'saida_despesa';
  description: string;
  origin: string;
  date: string;
  competence: string;
  amount: number;
  status: 'pending' | 'partial' | 'paid';
  originalEntity: any;
}

export interface FinancialStats {
  entradasPrevisto: number;
  entradasRealizado: number;
  saidasComprometido: number;
  saidasPago: number;
  despesasTotais: number;
  lucroPrevisto: number;
  lucroRealizado: number;
}

export function useFinancialData() {
  const [isLoading, setIsLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Filtros
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOrigin, setFilterOrigin] = useState<string>('all');

  const loadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pricingCtx = useMemo(() => ({
    customers,
    plans,
    appointments
  }), [customers, plans, appointments]);

  // Lista unificada de todas as movimentações financeiras
  const allTransactions = useMemo(() => {
    const transactions: FinancialTransaction[] = [];

    // 1. Entradas: Lotes de Convênios
    batches.forEach(batch => {
      const batchApps = appointments.filter(a => batch.appointmentIds.includes(a.id));
      const monthCounts: Record<string, number> = {};
      for (const app of batchApps) {
        const month = (app.date || '').substring(0, 7);
        if (/^\d{4}-\d{2}$/.test(month)) {
          monthCounts[month] = (monthCounts[month] || 0) + 1;
        }
      }
      const competence = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || batch.sentAt.substring(0, 7);

      if (filterMonth && competence !== filterMonth) return;

      let status: 'pending' | 'partial' | 'paid' = 'pending';
      if (batch.status === BillingBatchStatus.PAID) status = 'paid';
      else if (batch.status === BillingBatchStatus.PARTIALLY_PAID) status = 'partial';

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

    // 2. Entradas: Consultas Particulares
    const particularApps = appointments.filter(app => {
      const competence = app.date.substring(0, 7);
      if (filterMonth && competence !== filterMonth) return false;

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

      if (filterMonth && competence !== filterMonth) return;

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

      if (filterMonth && competence !== filterMonth) return;

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
  }, [batches, appointments, repasses, customers, psychologists, expenses, pricingCtx, filterMonth]);

  // Lista única das operadoras/origens para o filtro
  const uniqueOrigins = useMemo(() => {
    const plansList = batches.map(b => b.healthPlan);
    return Array.from(new Set(['Particular', ...plansList]));
  }, [batches]);

  // Transações filtradas
  const filteredTransactions = useMemo(() => {
    const filtered = allTransactions.filter(t => {
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

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions, filterMonth, filterStatus, filterOrigin, batches]);

  // Estatísticas e Métricas Executivas
  const stats = useMemo<FinancialStats>(() => {
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

  const handleMarkParticularPaid = useCallback(async (appId: string) => {
    const originalAppointments = [...appointments];

    setAppointments(prev => prev.map(app => {
      if (app.id === appId) {
        return {
          ...app,
          paidAt: new Date().toISOString()
        };
      }
      return app;
    }));

    try {
      await api.updateAppointment(appId, { paidAt: new Date().toISOString() });
    } catch (err) {
      console.error('[Financeiro] Erro ao registrar pagamento particular:', err);
      setAppointments(originalAppointments);
      alert('Erro ao registrar o pagamento do atendimento particular.');
    }
  }, [appointments]);

  const resetFilters = useCallback(() => {
    setFilterMonth('');
    setFilterStatus('all');
    setFilterOrigin('all');
  }, []);

  return {
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
    reload: loadData,
  };
}

