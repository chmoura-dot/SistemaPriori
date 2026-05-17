import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { exportToExcel } from '../lib/excel';
import {
  BillingBatch,
  BillingBatchStatus,
  Appointment,
  AppointmentType,
  AppointmentStatus,
  HealthPlan,
  Customer,
  Plan,
  Psychologist
} from '../services/types';
import { format, differenceInMonths, differenceInDays } from 'date-fns';
import { toastSuccess, toastError } from '../lib/toast';

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export interface AppointmentPaymentStatus {
  status: 'paid' | 'denied';
  reason?: string;
  resolution?: 'accepted' | 'appealed';
}

export function useBillingData() {
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create/Edit Batch Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingDraftBatch, setEditingDraftBatch] = useState<BillingBatch | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<HealthPlan>(HealthPlan.AMS_PETROBRAS);
  const [batchNumber, setBatchNumber] = useState('');
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<string[]>([]);
  const [neuropsicoDecisions, setNeuropsicoDecisions] = useState<Record<string, boolean>>({});
  const [patientFilter, setPatientFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [includePrevMonth, setIncludePrevMonth] = useState(false);
  const [includeNextMonth, setIncludeNextMonth] = useState(false);

  // Details Modal state
  const [selectedBatch, setSelectedBatch] = useState<BillingBatch | null>(null);

  // Payment Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [batchToPay, setBatchToPay] = useState<BillingBatch | null>(null);
  const [appointmentStatuses, setAppointmentStatuses] = useState<Record<string, AppointmentPaymentStatus>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [batchesData, appsData, customersData, plansData, psyData] = await Promise.all([
        api.getBillingBatches(),
        api.getAppointmentsForBilling(),
        api.getCustomers(),
        api.getPlans(),
        api.getPsychologists()
      ]);
      setBatches(batchesData.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setAppointments(appsData);
      setCustomers(customersData);
      setPlans(plansData);
      setPsychologists(psyData);
    } catch (error) {
      console.error('Error fetching billing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getNeuropsicoStatus = (app: Appointment) => {
    if (app.type !== AppointmentType.NEUROPSICOLOGICA) return { type: 'regular' as const };

    const pastApps = appointments
      .filter(a =>
        a.customerId === app.customerId &&
        a.type === AppointmentType.NEUROPSICOLOGICA &&
        a.date < app.date &&
        a.id !== app.id
      )
      .sort((a, b) => b.date.localeCompare(a.date));

    if (pastApps.length === 0) return { type: 'billable' as const };

    const lastAppDate = new Date(pastApps[0].date + 'T12:00:00');
    const currentAppDate = new Date(app.date + 'T12:00:00');

    const diffMonths = differenceInMonths(currentAppDate, lastAppDate);
    const diffDays = differenceInDays(currentAppDate, lastAppDate);

    if (diffMonths >= 11) return { type: 'billable' as const, diffDays };
    if (diffDays <= 90) return { type: 'blocked' as const, diffDays };
    return { type: 'ask' as const, diffDays };
  };

  const getAppPrice = (app: Appointment): number => {
    // Atendimento cancelado pelo psicólogo e classificado como isento → R$ 0
    if (app.status === AppointmentStatus.CANCELED && app.cancellationBilling === 'none') return 0;
    const status = getNeuropsicoStatus(app);
    if (status.type === 'blocked') return 0;
    if (status.type === 'ask' && !neuropsicoDecisions[app.id]) return 0;

    const customer = customers.find(c => c.id === app.customerId);
    const plan = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
    const procedure = plan?.procedures?.find(proc => proc.type === app.type);
    return app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
  };

  /**
   * Gera número de lote.
   * isDraft = true → prefixo RASCUNHO- (não conta como lote enviado)
   */
  const generateBatchNumber = (plan: HealthPlan, month: string, isDraft = false): string => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return '';
    const planSiglas: Record<HealthPlan, string> = {
      [HealthPlan.AMS_PETROBRAS]: 'AMS',
      [HealthPlan.PAE]: 'PAE',
      [HealthPlan.PORTO_SAUDE]: 'PORTO',
      [HealthPlan.MEDSENIOR]: 'MEDSN',
      [HealthPlan.REAL_GRANDEZA]: 'RG',
      [HealthPlan.SAUDE_BLUE]: 'SBLUE',
      [HealthPlan.GAMA]: 'GAMA',
      [HealthPlan.SAUDE_CAIXA]: 'SCAIXA',
      [HealthPlan.FUNDACAO_SAUDE]: 'FSI',
      [HealthPlan.PARTICULAR]: 'PART',
    };
    const sigla = planSiglas[plan] || 'LOTE';
    const monthFormatted = month.replace('-', '');
    if (isDraft) return `RASCUNHO-${sigla}-${monthFormatted}`;
    // Conta apenas lotes SENT/PAID (não conta rascunhos)
    const existing = batches.filter(
      b => b.healthPlan === plan &&
        b.sentAt.startsWith(month) &&
        b.status !== BillingBatchStatus.DRAFT
    );
    const seq = String(existing.length + 1).padStart(3, '0');
    return `${sigla}-${monthFormatted}-${seq}`;
  };

  /**
   * Retorna os meses elegíveis para filtro.
   * Se includePrevMonth = true, inclui também o mês anterior.
   * Se includeNextMonth = true, inclui também o mês seguinte.
   */
  const getMonthsToInclude = (): string[] => {
    if (!monthFilter) return [];
    const months = [monthFilter];
    if (includePrevMonth) {
      const [y, m] = monthFilter.split('-').map(Number);
      const d = new Date(y, m - 2, 1); // m-2: mês é 1-indexed, -1 pra anterior
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    if (includeNextMonth) {
      const [y, m] = monthFilter.split('-').map(Number);
      const d = new Date(y, m, 1); // m: mês é 1-indexed, sem -1 = próximo mês
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  };

  /**
   * Retorna um Map dos planos que possuem rascunho com competência anterior ao mês alvo.
   * Chave: HealthPlan, Valor: label do mês do rascunho (ex: "Abril/2026")
   */
  const getPlansWithEarlierDrafts = (targetMonth: string): Map<HealthPlan, string> => {
    const blocked = new Map<HealthPlan, string>();
    if (!targetMonth) return blocked;
    batches.forEach(b => {
      if (b.status === BillingBatchStatus.DRAFT && b.sentAt.substring(0, 7) < targetMonth) {
        if (!blocked.has(b.healthPlan)) {
          const dm = parseInt(b.sentAt.substring(5, 7)) - 1;
          const dy = b.sentAt.substring(0, 4);
          blocked.set(b.healthPlan, `${MONTH_NAMES_PT[dm]}/${dy}`);
        }
      }
    });
    return blocked;
  };

  /**
   * Retorna atendimentos elegíveis para o modal.
   * Quando editando um rascunho: inclui appointments do próprio rascunho (já vinculados)
   * além dos novos disponíveis.
   */
  const getEligibleAppointments = (): Appointment[] => {
    const today = new Date().toISOString().split('T')[0];
    const monthsToInclude = getMonthsToInclude();
    const editingDraftId = editingDraftBatch?.id;

    return appointments.filter(a => {
      const customer = customers.find(c => c.id === a.customerId);
      const matchesMonth =
        monthsToInclude.length === 0 || monthsToInclude.some(m => a.date.startsWith(m));
      // Inclui appointment se: está no rascunho sendo editado OU é novo e não está em lote
      const isInCurrentDraft = editingDraftId ? a.billingBatchId === editingDraftId : false;
      const isAvailable = !a.billingBatchId && !a.billingIgnored;
      return (
        customer?.healthPlan === selectedPlan &&
        (isInCurrentDraft || isAvailable) &&
        a.date <= today &&
        matchesMonth
      );
    }).sort((a, b) => a.date.localeCompare(b.date));
  };

  const calculateTotalSelectedAmount = (): number => {
    return appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);
  };

  const toggleAppointmentSelection = (id: string) => {
    // Impede seleção de atendimentos cancelados e isentos
    const app = appointments.find(a => a.id === id);
    if (app?.status === AppointmentStatus.CANCELED && app?.cancellationBilling === 'none') return;
    setSelectedAppointmentIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleNeuropsicoDecision = (id: string, value: boolean) => {
    setNeuropsicoDecisions(prev => ({ ...prev, [id]: value }));
  };

  // ── Batch Persistence Helpers ─────────────────────────────────────────────

  /**
   * Sincroniza quais appointments estão vinculados a um lote.
   * Compara lista anterior com nova e só atualiza o diff.
   */
  const syncAppointmentsBatch = async (
    batchId: string,
    prevIds: string[],
    nextIds: string[]
  ) => {
    const toAdd = nextIds.filter(id => !prevIds.includes(id));
    const toRemove = prevIds.filter(id => !nextIds.includes(id));
    await Promise.all([
      ...toAdd.map(id => api.updateAppointment(id, { billingBatchId: batchId })),
      ...toRemove.map(id => api.updateAppointment(id, { billingBatchId: null as any })),
    ]);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  /**
   * Cria o lote diretamente como ENVIADO (via "Revisar e Gerar Lote").
   */
  const handleCreateBatch = async () => {
    if (!batchNumber || selectedAppointmentIds.length === 0) return;

    const totalAmount = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);

    try {
      const batch = await api.createBillingBatch({
        batchNumber,
        sentAt: new Date().toISOString(),
        status: BillingBatchStatus.SENT,
        healthPlan: selectedPlan,
        totalAmount,
        appointmentIds: selectedAppointmentIds
      });

      await syncAppointmentsBatch(batch.id, [], selectedAppointmentIds);

      setIsCreateModalOpen(false);
      setBatchNumber('');
      setSelectedAppointmentIds([]);
      setEditingDraftBatch(null);
      toastSuccess('Lote criado e enviado com sucesso!');
      fetchData();
    } catch (error) {
      console.error('Error creating batch:', error);
      toastError('Erro ao criar lote.');
    }
  };

  /**
   * Salva atendimentos selecionados como Rascunho (DRAFT).
   * Se já existe rascunho para a operadora/competência, mescla com ele.
   */
  const handleSaveAsDraft = async () => {
    if (selectedAppointmentIds.length === 0) return;

    const totalAmount = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);

    try {
      if (editingDraftBatch) {
        // Atualizar rascunho existente
        await syncAppointmentsBatch(
          editingDraftBatch.id,
          editingDraftBatch.appointmentIds,
          selectedAppointmentIds
        );
        await api.updateBillingBatch(editingDraftBatch.id, {
          appointmentIds: selectedAppointmentIds,
          totalAmount,
        });
        toastSuccess('Rascunho atualizado!');
      } else {
        // Verificar se já existe rascunho para esta operadora+competência
        const existingDraft = batches.find(
          b =>
            b.status === BillingBatchStatus.DRAFT &&
            b.healthPlan === selectedPlan &&
            b.sentAt.startsWith(monthFilter)
        );

        if (existingDraft) {
          // Mesclar com rascunho existente (evita duplicados)
          const mergedIds = [...new Set([...existingDraft.appointmentIds, ...selectedAppointmentIds])];
          const mergedTotal = appointments
            .filter(a => mergedIds.includes(a.id))
            .reduce((sum, a) => sum + getAppPrice(a), 0);
          await syncAppointmentsBatch(existingDraft.id, existingDraft.appointmentIds, mergedIds);
          await api.updateBillingBatch(existingDraft.id, {
            appointmentIds: mergedIds,
            totalAmount: mergedTotal,
          });
          toastSuccess('Atendimentos adicionados ao rascunho existente!');
        } else {
          // Criar novo rascunho
          const draftBatchNumber = generateBatchNumber(selectedPlan, monthFilter, true);
          const batch = await api.createBillingBatch({
            batchNumber: draftBatchNumber,
            sentAt: monthFilter + '-01T00:00:00.000Z', // Competência no sentAt
            status: BillingBatchStatus.DRAFT,
            healthPlan: selectedPlan,
            totalAmount,
            appointmentIds: selectedAppointmentIds,
          });
          await syncAppointmentsBatch(batch.id, [], selectedAppointmentIds);
          toastSuccess('Rascunho salvo! Continue adicionando atendimentos quando quiser.');
        }
      }

      setIsCreateModalOpen(false);
      setSelectedAppointmentIds([]);
      setEditingDraftBatch(null);
      fetchData();
    } catch (error) {
      console.error('Error saving draft:', error);
      toastError('Erro ao salvar rascunho.');
    }
  };

  /**
   * Adiciona UM atendimento rapidamente ao rascunho ativo da operadora/competência.
   * Cria o rascunho automaticamente se não existir.
   * Botão 📋 por linha no modal.
   */
  const handleQuickAddToDraft = async (appId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const app = appointments.find(a => a.id === appId);
    if (!app) return;
    const appPrice = getAppPrice(app);

    // Procura rascunho existente para esta operadora + competência
    const existingDraft = batches.find(
      b =>
        b.status === BillingBatchStatus.DRAFT &&
        b.healthPlan === selectedPlan &&
        b.sentAt.startsWith(monthFilter)
    );

    try {
      if (existingDraft) {
        if (existingDraft.appointmentIds.includes(appId)) {
          toastError('Este atendimento já está no rascunho!');
          return;
        }
        const newIds = [...existingDraft.appointmentIds, appId];
        await api.updateBillingBatch(existingDraft.id, {
          appointmentIds: newIds,
          totalAmount: existingDraft.totalAmount + appPrice,
        });
        await api.updateAppointment(appId, { billingBatchId: existingDraft.id });
        toastSuccess('Adicionado ao rascunho existente!');
      } else {
        // Criar novo rascunho com este atendimento
        const draftBatchNumber = generateBatchNumber(selectedPlan, monthFilter, true);
        const batch = await api.createBillingBatch({
          batchNumber: draftBatchNumber,
          sentAt: monthFilter + '-01T00:00:00.000Z',
          status: BillingBatchStatus.DRAFT,
          healthPlan: selectedPlan,
          totalAmount: appPrice,
          appointmentIds: [appId],
        });
        await api.updateAppointment(appId, { billingBatchId: batch.id });
        toastSuccess('Rascunho criado! Atendimento adicionado.');
      }

      // Atualiza estado local imediatamente para dar feedback visual
      setAppointments(prev =>
        prev.map(a =>
          a.id === appId
            ? { ...a, billingBatchId: existingDraft?.id || 'pending-refresh' }
            : a
        )
      );
      fetchData();
    } catch (error) {
      console.error('Error quick-adding to draft:', error);
      toastError('Erro ao adicionar ao rascunho.');
    }
  };

  /**
   * Finaliza um rascunho: status DRAFT → SENT.
   * Atualiza o batch number para o formato final e define sentAt como agora.
   */
  const handleFinalizeBatch = async () => {
    if (!editingDraftBatch || !batchNumber || selectedAppointmentIds.length === 0) return;

    const totalAmount = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);

    // Gera número de lote final (sem prefixo RASCUNHO-)
    const finalBatchNumber = batchNumber.startsWith('RASCUNHO-')
      ? generateBatchNumber(selectedPlan, monthFilter, false)
      : batchNumber;

    try {
      // Sync: add/remove appointments conforme seleção final
      await syncAppointmentsBatch(
        editingDraftBatch.id,
        editingDraftBatch.appointmentIds,
        selectedAppointmentIds
      );

      // Finalizar lote
      await api.updateBillingBatch(editingDraftBatch.id, {
        batchNumber: finalBatchNumber,
        sentAt: new Date().toISOString(),
        status: BillingBatchStatus.SENT,
        appointmentIds: selectedAppointmentIds,
        totalAmount,
      });

      setIsCreateModalOpen(false);
      setSelectedAppointmentIds([]);
      setEditingDraftBatch(null);
      toastSuccess(`Lote ${finalBatchNumber} finalizado e enviado!`);
      fetchData();
    } catch (error) {
      console.error('Error finalizing batch:', error);
      toastError('Erro ao finalizar lote.');
    }
  };

  const handleMarkAsPaid = (batch: BillingBatch) => {
    setBatchToPay(batch);
    const initialStatuses: Record<string, AppointmentPaymentStatus> = {};
    batch.appointmentIds.forEach(id => {
      initialStatuses[id] = { status: 'paid' };
    });
    setAppointmentStatuses(initialStatuses);
    setIsPaymentModalOpen(true);
  };

  const submitPayment = async () => {
    if (!batchToPay) return;
    try {
      await Promise.all(batchToPay.appointmentIds.map(id => {
        const statusData = appointmentStatuses[id];
        return api.updateAppointment(id, {
          billingStatus: statusData.status,
          denialReason: statusData.reason,
          denialResolution: statusData.resolution
        });
      }));

      await api.updateBillingBatch(batchToPay.id, {
        status: BillingBatchStatus.PAID,
        paidAt: new Date().toISOString()
      });

      setIsPaymentModalOpen(false);
      setBatchToPay(null);
      fetchData();
    } catch (error) {
      console.error('Error processing payment:', error);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    const batch = batches.find(b => b.id === id);
    const isDraft = batch?.status === BillingBatchStatus.DRAFT;
    const msg = isDraft
      ? 'Deseja excluir este rascunho? Os atendimentos voltarão a ficar disponíveis.'
      : 'Deseja realmente excluir este lote? Os atendimentos voltarão a ficar disponíveis para faturamento.';
    if (!confirm(msg)) return;
    try {
      await api.deleteBillingBatch(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting batch:', error);
    }
  };

  const handleExportBatch = (batch: BillingBatch) => {
    const batchAppointments = appointments.filter(a => batch.appointmentIds.includes(a.id));

    const exportData = batchAppointments.map(app => {
      const customer = customers.find(c => c.id === app.customerId);
      const psychologist = psychologists.find(p => p.id === app.psychologistId);
      return {
        'Lote': `#${batch.batchNumber}`,
        'Operadora': batch.healthPlan,
        'Paciente': customer?.name || '---',
        'Profissional': psychologist?.name || '---',
        'Data da Sessão': format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy'),
        'Horário': app.startTime,
        'Valor (R$)': getAppPrice(app),
        'Status de Faturamento': app.billingStatus === 'paid' ? 'Pago' : app.billingStatus === 'denied' ? 'Glosa' : 'Pendente',
        'Motivo Glosa': app.denialReason || '',
        'Resolução Glosa': app.denialResolution === 'appealed' ? 'Recursada' : app.denialResolution === 'accepted' ? 'Aceite' : ''
      };
    });

    exportToExcel(
      exportData,
      `Lote_${batch.batchNumber}_${batch.healthPlan}_${format(new Date(), 'yyyyMMdd')}`,
      'Atendimentos'
    );
  };

  const handleConfirmAppointment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Apenas confirma o psicólogo — não altera status para evitar trigger de sobreposição
      await api.updateAppointment(id, { confirmedPsychologist: true });
      setAppointments(prev =>
        prev.map(a => a.id === id ? { ...a, confirmedPsychologist: true } : a)
      );
    } catch (error) {
      console.error('Error confirming appointment:', error);
      toastError('Não foi possível confirmar o atendimento. Tente novamente.');
    }
  };

  const handleIgnoreAppointment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Marcar este atendimento como "Ignorado para Faturamento"? Ele não aparecerá mais na lista de disponíveis, mas o histórico será mantido.')) return;
    try {
      await api.updateAppointment(id, { billingIgnored: true });
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, billingIgnored: true } : a));
      setSelectedAppointmentIds(prev => prev.filter(i => i !== id));
    } catch (error) {
      console.error('Error ignoring appointment:', error);
    }
  };

  const updateAppointmentPaymentStatus = (id: string, update: Partial<AppointmentPaymentStatus>) => {
    setAppointmentStatuses(prev => ({ ...prev, [id]: { ...prev[id], ...update } }));
  };

  /**
   * Abre o modal de criação/edição.
   * Se draftBatch for passado, abre em modo de edição do rascunho.
   */
  const openCreateModal = (draftBatch?: BillingBatch) => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (draftBatch) {
      // Modo: Editar rascunho existente
      const draftMonth = draftBatch.sentAt.substring(0, 7); // YYYY-MM
      setEditingDraftBatch(draftBatch);
      setSelectedPlan(draftBatch.healthPlan);
      setMonthFilter(draftMonth);
      setBatchNumber(draftBatch.batchNumber);
      setSelectedAppointmentIds([...draftBatch.appointmentIds]);
    } else {
      // Modo: Novo lote/rascunho — auto-selecionar primeiro plano sem rascunho anterior
      const blockedPlans = getPlansWithEarlierDrafts(month);
      let planToUse = selectedPlan;
      if (blockedPlans.has(planToUse)) {
        const firstAvailable = Object.values(HealthPlan).find(p => !blockedPlans.has(p));
        if (firstAvailable) planToUse = firstAvailable;
      }
      setSelectedPlan(planToUse);
      setEditingDraftBatch(null);
      setMonthFilter(month);
      setBatchNumber(generateBatchNumber(planToUse, month));
      setSelectedAppointmentIds([]);
    }
    setIncludePrevMonth(false);
    setIncludeNextMonth(false);
    setPatientFilter('');
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setPatientFilter('');
    setMonthFilter('');
    setEditingDraftBatch(null);
    setIncludePrevMonth(false);
    setIncludeNextMonth(false);
    setSelectedAppointmentIds([]);
  };

  const handlePlanChange = (plan: HealthPlan) => {
    setSelectedPlan(plan);
    setSelectedAppointmentIds([]);
    setPatientFilter('');
    setBatchNumber(generateBatchNumber(plan, monthFilter, editingDraftBatch !== null));
  };

  const handleMonthFilterChange = (month: string) => {
    setMonthFilter(month);
    setSelectedAppointmentIds([]);
    setBatchNumber(generateBatchNumber(selectedPlan, month, editingDraftBatch !== null));
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const draftBatches = batches.filter(b => b.status === BillingBatchStatus.DRAFT);
  const pendingBatches = batches.filter(b => b.status === BillingBatchStatus.SENT);
  const totalPendingAmount = pendingBatches.reduce((acc, b) => acc + b.totalAmount, 0);
  const paidBatches = batches.filter(b => b.status === BillingBatchStatus.PAID);
  const totalPaidAmount = paidBatches.reduce((acc, b) => acc + b.totalAmount, 0);
  const totalDenied = appointments.filter(a => a.billingStatus === 'denied').length;
  const totalDraftAmount = draftBatches.reduce((acc, b) => acc + b.totalAmount, 0);

  return {
    // Data
    batches,
    appointments,
    customers,
    psychologists,
    plans,
    isLoading,

    // Derived
    draftBatches,
    pendingBatches,
    totalPendingAmount,
    totalPaidAmount,
    totalDenied,
    totalDraftAmount,

    // Create/Edit Modal
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
    editingDraftBatch,
    selectedPlan,
    setSelectedPlan,
    batchNumber,
    setBatchNumber,
    selectedAppointmentIds,
    setSelectedAppointmentIds,
    neuropsicoDecisions,
    toggleNeuropsicoDecision,
    patientFilter,
    setPatientFilter,
    monthFilter,
    setMonthFilter,
    includePrevMonth,
    setIncludePrevMonth,
    includeNextMonth,
    setIncludeNextMonth,

    // Details Modal
    selectedBatch,
    setSelectedBatch,

    // Payment Modal
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    batchToPay,
    appointmentStatuses,
    updateAppointmentPaymentStatus,

    // Helpers
    getNeuropsicoStatus,
    getAppPrice,
    getEligibleAppointments,
    getPlansWithEarlierDrafts,
    calculateTotalSelectedAmount,
    toggleAppointmentSelection,

    // Handlers
    handleCreateBatch,
    handleSaveAsDraft,
    handleQuickAddToDraft,
    handleFinalizeBatch,
    handleMarkAsPaid,
    submitPayment,
    handleDeleteBatch,
    handleExportBatch,
    handleConfirmAppointment,
    handleIgnoreAppointment,
    handlePlanChange,
    handleMonthFilterChange,
  };
}
