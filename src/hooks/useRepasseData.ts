import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import {
  Appointment,
  BillingBatch,
  BillingBatchStatus,
  Customer,
  Plan,
  Psychologist,
  Repasse,
  RepasseStatus,
} from '../services/types';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import {
  RepassDivergence,
  getBatchYearMonth,
  getRepassValue,
  checkDivergence,
  buildRepassItem,
  generateRepassePDF,
} from '../pages/repasse/repasseHelpers';
import { PricingContext } from '../lib/pricing';

export function useRepasseData() {
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  // Estados de Filtro
  const [filterMonth, setFilterMonth] = useState<string>(''); // YYYY-MM
  const [filterPsyId, setFilterPsyId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>(''); // '', 'READY', 'AWAITING_REPORT', 'PENDING', 'PAID'
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(true);

  // Estados de Expansão
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Record<string, boolean>>({});
  const [expandedRepasseIds, setExpandedRepasseIds] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rData, bData, aData, cData, plData, psyData] = await Promise.all([
        api.getRepasses(),
        api.getBillingBatches(),
        api.getAppointmentsForBilling(),
        api.getCustomers(),
        api.getPlans(),
        api.getPsychologists(),
      ]);
      setRepasses(rData);
      setBatches(bData);
      setAppointments(aData);
      setCustomers(cData);
      setPlans(plData);
      setPsychologists(psyData);
    } catch (err) {
      logger.error('Erro ao carregar dados de repasse:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleGroupExpanded = useCallback((key: string) => {
    setExpandedGroupKeys(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleRepasseExpanded = useCallback((id: string) => {
    setExpandedRepasseIds(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const pendingGroups = useMemo(() => {
    const eligibleBatches = batches.filter(
      b => b.status === BillingBatchStatus.PAID || b.status === BillingBatchStatus.PARTIALLY_PAID
    );
    const groups: { psyId: string; batch: BillingBatch; appIds: string[]; total: number; divergences: RepassDivergence[] }[] = [];

    eligibleBatches.forEach(batch => {
      const byPsy: Record<string, string[]> = {};
      batch.appointmentIds.forEach(appId => {
        const app = appointments.find(a => a.id === appId);
        if (!app) return;
        if (!byPsy[app.psychologistId]) byPsy[app.psychologistId] = [];
        byPsy[app.psychologistId].push(appId);
      });

      Object.entries(byPsy).forEach(([psyId, appIds]) => {
        const alreadyRepassed = new Set(
          repasses
            .filter(r => r.psychologistId === psyId && r.billingBatchId === batch.id)
            .flatMap(r => r.appointmentIds)
        );

        const paidAppIds = appIds.filter(appId => {
          const app = appointments.find(a => a.id === appId);
          if (!app) return false;
          if (app.billingStatus !== 'paid') return false;
          if (app.billingIgnored) return false;
          if (app.isInternal) return false;
          if (alreadyRepassed.has(appId)) return false;
          return true;
        });

        if (paidAppIds.length === 0) return;

        const pricingCtx: PricingContext = { customers, plans, appointments };
        const psy = psychologists.find(p => p.id === psyId);
        let totalCents = 0;
        const divergences: RepassDivergence[] = [];
        paidAppIds.forEach(appId => {
          const app = appointments.find(a => a.id === appId);
          if (!app) return;
          totalCents += Math.round(getRepassValue(app, customers, plans, psy, pricingCtx) * 100);
          const div = checkDivergence(app, customers, plans, psy, pricingCtx);
          if (div) divergences.push(div);
        });

        groups.push({ psyId, batch, appIds: paidAppIds, total: totalCents / 100, divergences });
      });
    });

    return groups;
  }, [batches, repasses, appointments, customers, plans, psychologists]);

  const filteredPendingGroups = useMemo(() => {
    if (filterStatus && filterStatus !== 'READY') return [];
    return pendingGroups.filter(group => {
      if (filterPsyId && group.psyId !== filterPsyId) return false;
      if (filterMonth) {
        const batchMonth = getBatchYearMonth(group.batch, appointments);
        if (batchMonth !== filterMonth) return false;
      }
      return true;
    });
  }, [pendingGroups, filterPsyId, filterMonth, filterStatus, appointments]);

  const filteredRepasses = useMemo(() => {
    return repasses.filter(repasse => {
      if (filterPsyId && repasse.psychologistId !== filterPsyId) return false;
      if (filterStatus === 'PENDING' && repasse.status !== RepasseStatus.PENDING) return false;
      if (filterStatus === 'PAID' && repasse.status !== RepasseStatus.PAID) return false;
      if (filterStatus && filterStatus !== 'PENDING' && filterStatus !== 'PAID') return false;
      if (filterMonth) {
        const batch = batches.find(b => b.id === repasse.billingBatchId);
        const repasseMonth = batch ? getBatchYearMonth(batch, appointments) : '';
        if (repasseMonth !== filterMonth) return false;
      }
      return true;
    });
  }, [repasses, filterPsyId, filterMonth, filterStatus, batches, appointments]);

  const summary = useMemo(() => {
    const totalPendingGeneration = pendingGroups.reduce((acc, g) => acc + g.total, 0);
    const repassesPending = repasses.filter(r => r.status === RepasseStatus.PENDING);
    const totalRepassesPending = repassesPending.reduce((acc, r) => acc + r.totalAmount, 0);
    const repassesPaid = repasses.filter(r => r.status === RepasseStatus.PAID);
    const totalRepassesPaid = repassesPaid.reduce((acc, r) => acc + r.totalAmount, 0);

    return {
      pendingGenerationCount: pendingGroups.length,
      pendingGenerationAmount: totalPendingGeneration,
      repassesPendingCount: repassesPending.length,
      repassesPendingAmount: totalRepassesPending,
      repassesPaidCount: repassesPaid.length,
      repassesPaidAmount: totalRepassesPaid,
    };
  }, [pendingGroups, repasses]);

  const handleGenerateRepasse = useCallback(async (group: typeof pendingGroups[0]) => {
    if (group.divergences.length > 0) {
      const lines = group.divergences.map(d =>
        `• ${d.customerName} (${d.date.split('-').reverse().join('/')}): salvo R$ ${d.actual.toFixed(2)}, esperado R$ ${d.expected.toFixed(2)}`
      ).join('\n');
      const msg = `⚠️ ${group.divergences.length} atendimento(s) com valor de repasse manual diferente do calculado automaticamente:\n\n${lines}\n\nDeseja gerar o repasse mesmo assim?`;
      if (!confirm(msg)) {
        return;
      }
    }

    const key = `${group.psyId}-${group.batch.id}`;
    setIsGenerating(key);
    try {
      try {
        const pricingCtx: PricingContext = { customers, plans, appointments };
        const items = group.appIds
          .map(id => appointments.find(a => a.id === id))
          .filter((a): a is Appointment => !!a)
          .map(app => buildRepassItem(app, customers, plans, pricingCtx));

        const { data: parity, error: parityError } = await supabase.rpc('check_repass_integrity', {
          p_psychologist_id: group.psyId,
          p_items: items,
        });

        if (parityError) throw parityError;

        const serverTotal = Number(parity?.expected_total ?? NaN);
        if (!Number.isNaN(serverTotal) && Math.abs(serverTotal - group.total) >= 1) {
          await logger.critical('repasse.parityMismatch', 'Divergência entre repasse do front e do servidor', {
            psychologistId: group.psyId,
            batchId: group.batch.id,
            frontTotal: group.total,
            serverTotal,
            appointmentIds: group.appIds,
          });
          const proceed = confirm(
            `⚠️ Divergência de repasse detectada!\n\n` +
            `Valor calculado no sistema: R$ ${group.total.toFixed(2)}\n` +
            `Valor esperado pelo servidor: R$ ${serverTotal.toFixed(2)}\n\n` +
            `Esta diferença foi registrada para auditoria. Deseja gravar assim mesmo?`,
          );
          if (!proceed) {
            setIsGenerating(null);
            return;
          }
        }
      } catch (parityErr) {
        await logger.failure('repasse.parityCheckFailed', parityErr, {
          psychologistId: group.psyId,
          batchId: group.batch.id,
        });
      }

      const created = await api.createRepasse({
        psychologistId: group.psyId,
        billingBatchId: group.batch.id,
        appointmentIds: group.appIds,
        totalAmount: group.total,
        status: RepasseStatus.PENDING,
      });

      await loadData();

      const psy = psychologists.find(p => p.id === group.psyId);
      generateRepassePDF(created, psy, group.batch, appointments, customers, plans);
    } catch (err) {
      logger.error('Erro ao gerar repasse:', err);
    } finally {
      setIsGenerating(null);
    }
  }, [customers, plans, appointments, psychologists, loadData]);

  const handleMarkAsPaid = useCallback(async (repasse: Repasse) => {
    try {
      await api.updateRepasse(repasse.id, {
        status: RepasseStatus.PAID,
        paidAt: new Date().toISOString(),
      });
      await loadData();
    } catch (err) {
      logger.error('Erro ao marcar repasse como pago:', err);
    }
  }, [loadData]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Deseja excluir este repasse? O lote voltará a ser elegível para novo repasse.')) return;
    try {
      await api.deleteRepasse(id);
      await loadData();
    } catch (err) {
      logger.error('Erro ao excluir repasse:', err);
    }
  }, [loadData]);

  const handlePDF = useCallback((repasse: Repasse) => {
    const psy = psychologists.find(p => p.id === repasse.psychologistId);
    const batch = batches.find(b => b.id === repasse.billingBatchId);
    generateRepassePDF(repasse, psy, batch, appointments, customers, plans);
  }, [psychologists, batches, appointments, customers, plans]);

  return {
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
  };
}