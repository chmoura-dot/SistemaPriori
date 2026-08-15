import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { logger } from '../lib/logger';
import {
  BillingBatch, BillingBatchStatus, Appointment, AppointmentStatus,
  Customer, Plan, Psychologist, HealthPlan,
} from '../services/types';
import { createBillingHelpers, syncAppointmentsBatch, AppointmentPaymentStatus } from './billing/billingHelpers';
import { createBillingActions } from './billing/billingActions';

export type { AppointmentPaymentStatus } from './billing/billingHelpers';

export function useBillingData() {
  // ─── Estado de dados ──────────────────────────────────────────────────────
  const [batches, setBatches]           = useState<BillingBatch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [plans, setPlans]               = useState<Plan[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  // Marca se o primeiro carregamento já ocorreu. A partir daí, os refetch
  // disparados por ações de faturamento (marcar pago, adicionar/remover, etc.)
  // NÃO devem exibir o spinner de tela cheia — isso desmontava/remontava os
  // modais abertos a cada clique, resetando estados locais (busca, edição).
  const hasLoadedOnceRef = useRef(false);


  // ─── Estado do modal de criação/edição ────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen]   = useState(false);
  const [editingDraftBatch, setEditingDraftBatch]   = useState<BillingBatch | null>(null);
  const [selectedPlan, setSelectedPlan]             = useState<HealthPlan>(HealthPlan.AMS_PETROBRAS);
  const [batchNumber, setBatchNumber]               = useState('');
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<string[]>([]);
  const [neuropsicoDecisions, setNeuropsicoDecisions] = useState<Record<string, boolean>>({});
  const [patientFilter, setPatientFilter]           = useState('');
  const [monthFilter, setMonthFilter]               = useState('');
  const [includePrevMonth, setIncludePrevMonth]     = useState(false);
  const [includeNextMonth, setIncludeNextMonth]     = useState(false);

  // ─── Estado do modal de detalhes ──────────────────────────────────────────
  const [selectedBatch, setSelectedBatch] = useState<BillingBatch | null>(null);

  // ─── Estado do auto-save ──────────────────────────────────────────────────
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSaveRef   = useRef(false);

  // ─── Estado do modal de pagamento ─────────────────────────────────────────
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [batchToPay, setBatchToPay]                 = useState<BillingBatch | null>(null);
  const [appointmentStatuses, setAppointmentStatuses] = useState<Record<string, AppointmentPaymentStatus>>({});

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (skipAutoSaveRef.current) { skipAutoSaveRef.current = false; return; }
    if (!editingDraftBatch) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveStatus('saving');

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const { getAppPrice: price } = createBillingHelpers({
          appointments, customers, plans, batches,
          neuropsicoDecisions, selectedPlan, monthFilter,
          includePrevMonth, includeNextMonth, selectedAppointmentIds, editingDraftBatch,
        });
        const totalAmount = appointments
          .filter(a => selectedAppointmentIds.includes(a.id))
          .reduce((sum, a) => sum + Math.round(price(a) * 100), 0) / 100;
        await syncAppointmentsBatch(editingDraftBatch.id, editingDraftBatch.appointmentIds, selectedAppointmentIds);
        await api.updateBillingBatch(editingDraftBatch.id, { appointmentIds: selectedAppointmentIds, totalAmount });
        setEditingDraftBatch(prev => prev ? { ...prev, appointmentIds: [...selectedAppointmentIds] } : prev);
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2500);
      } catch (err) {
        logger.error('Auto-save error:', err);
        setAutoSaveStatus('idle');
      }
    }, 1000);
  }, [selectedAppointmentIds]);

  const fetchData = async () => {
    // Só mostra o spinner de tela cheia no PRIMEIRO carregamento. Refetch de
    // ações (marcar pago, etc.) atualizam os dados em background, sem desmontar
    // os modais abertos.
    if (!hasLoadedOnceRef.current) setIsLoading(true);
    try {
      const [batchesData, appsData, customersData, plansData, psyData] = await Promise.all([
        api.getBillingBatches(), api.getAppointmentsForBilling(),
        api.getCustomers(), api.getPlans(), api.getPsychologists(),
      ]);
      setBatches(batchesData.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setAppointments(appsData); setCustomers(customersData);
      setPlans(plansData); setPsychologists(psyData);
    } catch (error) {
      logger.error('Error fetching billing data:', error);
    } finally {
      hasLoadedOnceRef.current = true;
      setIsLoading(false);
    }
  };


  const helpers = createBillingHelpers({
    appointments, customers, plans, batches,
    neuropsicoDecisions, selectedPlan, monthFilter,
    includePrevMonth, includeNextMonth, selectedAppointmentIds, editingDraftBatch,
  });

  const actions = createBillingActions({
    batches, appointments, customers, psychologists, plans,
    selectedPlan, monthFilter, batchNumber, selectedAppointmentIds,
    editingDraftBatch, appointmentStatuses, batchToPay,
    getAppPrice: helpers.getAppPrice,
    getTussCode: helpers.getTussCode,
    generateBatchNumber: helpers.generateBatchNumber,
    fetchData,
    setIsCreateModalOpen, setSelectedAppointmentIds, setEditingDraftBatch,
    setAppointments, setBatches, setBatchToPay, setIsPaymentModalOpen, setAppointmentStatuses,
    setSelectedBatch,
  });

  /**
   * Abre o modal de detalhes de um lote e, para lotes JÁ ENVIADOS, reconcilia o
   * status imediatamente. Isso corrige lotes cujo campo `status` ficou "preso"
   * num valor desatualizado (ex.: PARTIALLY_PAID mesmo com todos os
   * atendimentos cobráveis já pagos) — situação que o recálculo por-clique não
   * conserta sozinho, pois só roda ao marcar/desmarcar um pagamento.
   */
  const openBatchDetails = async (batch: BillingBatch) => {
    setSelectedBatch(batch);
    if (batch.status === BillingBatchStatus.DRAFT) return;
    try {
      const recalc = await actions.recalcBatchStatus(batch.id);
      if (recalc && (recalc.status !== batch.status || recalc.paidAt !== batch.paidAt)) {
        setBatches(prev => prev.map(b =>
          b.id === batch.id ? { ...b, status: recalc.status, paidAt: recalc.paidAt } : b
        ));
        setSelectedBatch(prev =>
          prev && prev.id === batch.id ? { ...prev, status: recalc.status, paidAt: recalc.paidAt } : prev
        );
      }
    } catch (err) {
      logger.error('Erro ao reconciliar status do lote:', err);
    }
  };

  const toggleNeuropsicoDecision = (id: string, value: boolean) => setNeuropsicoDecisions(prev => ({ ...prev, [id]: value }));

  const updateAppointmentPaymentStatus = (id: string, update: Partial<AppointmentPaymentStatus>) => setAppointmentStatuses(prev => ({ ...prev, [id]: { ...prev[id], ...update } }));

  const openCreateModal = (draftBatch?: BillingBatch) => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (draftBatch) {
      skipAutoSaveRef.current = true;
      setEditingDraftBatch(draftBatch); setSelectedPlan(draftBatch.healthPlan);
      setMonthFilter(draftBatch.sentAt.substring(0, 7)); setBatchNumber(draftBatch.batchNumber);
      setSelectedAppointmentIds([...draftBatch.appointmentIds]);
    } else {
      const planToUse = selectedPlan;
      setEditingDraftBatch(null); setMonthFilter(month);
      setBatchNumber(helpers.generateBatchNumber(planToUse, month)); setSelectedAppointmentIds([]);
    }
    setIncludePrevMonth(false); setIncludeNextMonth(false); setPatientFilter(''); setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => { setIsCreateModalOpen(false); setPatientFilter(''); setMonthFilter(''); setEditingDraftBatch(null); setSelectedAppointmentIds([]); };
  const handlePlanChange = (plan: HealthPlan) => { setSelectedPlan(plan); setSelectedAppointmentIds([]); setBatchNumber(helpers.generateBatchNumber(plan, monthFilter, editingDraftBatch !== null)); };
  const handleMonthFilterChange = (month: string) => { setMonthFilter(month); setSelectedAppointmentIds([]); setBatchNumber(helpers.generateBatchNumber(selectedPlan, month, editingDraftBatch !== null)); };
  // Bloqueia seleção quando ignorado OU quando o preço calculado é R$0 (ex:
  // cancelamento isento tradicional, alta/encerramento, AMS 4ª+ sessão).
  // Delega a decisão a getAppPrice/basePrice em vez de checar
  // cancellationBilling==='none' diretamente — isso permite selecionar o
  // novo caso "Falta do Paciente — Isento" de convênio (cancellationFault=
  // 'patient_exempt'), que agora fatura normalmente embora billing='none'.
  const toggleAppointmentSelection = (id: string) => { const app = appointments.find(a => a.id === id); if (!app || app.billingIgnored || helpers.getAppPrice(app) <= 0) return; setSelectedAppointmentIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };

  const handleUpdateAppointmentPrice = async (id: string, newPrice: number) => {
    await api.updateAppointment(id, { customPrice: newPrice });
    const updatedApps = appointments.map(a => a.id === id ? { ...a, customPrice: newPrice } : a);
    setAppointments(updatedApps);
    // Se o atendimento já pertence a um lote NÃO-rascunho, o totalAmount do lote
    // precisa ser recalculado e persistido — senão a tabela principal e os cards
    // de resumo (que leem batch.totalAmount do banco) ficam divergentes do modal.
    const app = updatedApps.find(a => a.id === id);
    const batch = app?.billingBatchId ? batches.find(b => b.id === app.billingBatchId) : undefined;
    if (batch && batch.status !== BillingBatchStatus.DRAFT) {
      const newTotal = updatedApps
        .filter(a => batch.appointmentIds.includes(a.id))
        .reduce((sum, a) => sum + Math.round(helpers.getAppPrice(a) * 100), 0) / 100;
      await api.updateBillingBatch(batch.id, { totalAmount: newTotal });
      setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, totalAmount: newTotal } : b));
      setSelectedBatch(prev => prev && prev.id === batch.id ? { ...prev, totalAmount: newTotal } : prev);
    }
  };

  const handleOverrideProcedureCode = async (id: string, newCode: string) => { try { await api.updateAppointment(id, { procedureCode: newCode || null, customPrice: null }); setAppointments(p => p.map(a => a.id === id ? { ...a, procedureCode: newCode || undefined, customPrice: undefined } : a)); } catch (err) { logger.error('Erro:', err); } };

  // ─── Valores derivados ────────────────────────────────────────────────────
  const draftBatches = batches.filter(b => b.status === BillingBatchStatus.DRAFT);
  // Lotes ainda não quitados totalmente (enviados ou parcialmente pagos)
  const pendingBatches = batches.filter(
    b => b.status === BillingBatchStatus.SENT || b.status === BillingBatchStatus.PARTIALLY_PAID
  );
  const totalPendingAmount = pendingBatches.reduce((acc, b) => {
    if (b.status === BillingBatchStatus.SENT) {
      return acc + b.totalAmount;
    } else if (b.status === BillingBatchStatus.PARTIALLY_PAID) {
      const batchApps = appointments.filter(a => b.appointmentIds.includes(a.id) && !a.isInternal && !a.billingIgnored);
      const paidSum = batchApps
        .filter(a => a.billingStatus === 'paid')
        .reduce((sum, a) => sum + helpers.getAppPrice(a), 0);
      const remaining = Math.max(0, b.totalAmount - paidSum);
      return acc + remaining;
    }
    return acc;
  }, 0);

  const paidBatches = batches.filter(b => b.status === BillingBatchStatus.PAID);
  const totalPaidAmount = batches.reduce((acc, b) => {
    if (b.status === BillingBatchStatus.PAID) {
      return acc + b.totalAmount;
    } else if (b.status === BillingBatchStatus.PARTIALLY_PAID) {
      const batchApps = appointments.filter(a => b.appointmentIds.includes(a.id) && !a.isInternal && !a.billingIgnored);
      const paidSum = batchApps
        .filter(a => a.billingStatus === 'paid')
        .reduce((sum, a) => sum + helpers.getAppPrice(a), 0);
      return acc + paidSum;
    }
    return acc;
  }, 0);

  const totalDenied = appointments.filter(a => a.billingStatus === 'denied').length;
  const totalDraftAmount = draftBatches.reduce((acc, b) => acc + b.totalAmount, 0);

  return {
    batches, appointments, customers, psychologists, plans, isLoading, autoSaveStatus,
    draftBatches, pendingBatches, totalPendingAmount, totalPaidAmount, totalDenied, totalDraftAmount,
    isCreateModalOpen, openCreateModal, closeCreateModal, editingDraftBatch,
    selectedPlan, setSelectedPlan, batchNumber, setBatchNumber,
    selectedAppointmentIds, setSelectedAppointmentIds, neuropsicoDecisions,
    toggleNeuropsicoDecision, patientFilter, setPatientFilter,
    monthFilter, setMonthFilter, includePrevMonth, setIncludePrevMonth,
    includeNextMonth, setIncludeNextMonth, selectedBatch, setSelectedBatch, openBatchDetails,
    isPaymentModalOpen, setIsPaymentModalOpen, batchToPay, appointmentStatuses,
    updateAppointmentPaymentStatus,
    ...helpers,
    ...actions,
    handlePlanChange, handleMonthFilterChange, toggleAppointmentSelection,
    handleOverrideProcedureCode, handleUpdateAppointmentPrice
  };
}