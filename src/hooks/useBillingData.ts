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

  // Create Batch Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<HealthPlan>(HealthPlan.AMS_PETROBRAS);
  const [batchNumber, setBatchNumber] = useState('');
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<string[]>([]);
  const [neuropsicoDecisions, setNeuropsicoDecisions] = useState<Record<string, boolean>>({});
  const [patientFilter, setPatientFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

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
    const status = getNeuropsicoStatus(app);
    if (status.type === 'blocked') return 0;
    if (status.type === 'ask' && !neuropsicoDecisions[app.id]) return 0;

    const customer = customers.find(c => c.id === app.customerId);
    const plan = plans.find(p => p.name.toUpperCase() === (customer?.healthPlan ?? '').toUpperCase());
    const procedure = plan?.procedures?.find(proc => proc.type === app.type);
    return app.customPrice ?? customer?.customPrice ?? procedure?.price ?? 0;
  };

  const getEligibleAppointments = (): Appointment[] => {
    const today = new Date().toISOString().split('T')[0];
    return appointments.filter(a => {
      const customer = customers.find(c => c.id === a.customerId);
      return (
        customer?.healthPlan === selectedPlan &&
        !a.billingBatchId &&
        !a.billingIgnored &&
        a.date <= today
      );
    }).sort((a, b) => a.date.localeCompare(b.date));
  };

  const calculateTotalSelectedAmount = (): number => {
    return appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);
  };

  const toggleAppointmentSelection = (id: string) => {
    setSelectedAppointmentIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleNeuropsicoDecision = (id: string, value: boolean) => {
    setNeuropsicoDecisions(prev => ({ ...prev, [id]: value }));
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

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

      await Promise.all(
        selectedAppointmentIds.map(id =>
          api.updateAppointment(id, { billingBatchId: batch.id })
        )
      );

      setIsCreateModalOpen(false);
      setBatchNumber('');
      setSelectedAppointmentIds([]);
      fetchData();
    } catch (error) {
      console.error('Error creating batch:', error);
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
    if (!confirm('Deseja realmente excluir este lote? Os atendimentos voltarão a ficar disponíveis para faturamento.')) return;
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
      await api.updateAppointment(id, { confirmedPsychologist: true, status: AppointmentStatus.ACTIVE });
      setAppointments(prev =>
        prev.map(a => a.id === id ? { ...a, confirmedPsychologist: true, status: AppointmentStatus.ACTIVE } : a)
      );
    } catch (error) {
      console.error('Error confirming appointment:', error);
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

  const openCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setPatientFilter('');
    setMonthFilter('');
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const pendingBatches = batches.filter(b => b.status === BillingBatchStatus.SENT);
  const totalPendingAmount = pendingBatches.reduce((acc, b) => acc + b.totalAmount, 0);
  const paidBatches = batches.filter(b => b.status === BillingBatchStatus.PAID);
  const totalPaidAmount = paidBatches.reduce((acc, b) => acc + b.totalAmount, 0);
  const totalDenied = appointments.filter(a => a.billingStatus === 'denied').length;

  return {
    // Data
    batches,
    appointments,
    customers,
    psychologists,
    isLoading,

    // Derived
    pendingBatches,
    totalPendingAmount,
    totalPaidAmount,
    totalDenied,

    // Create Modal
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
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
    calculateTotalSelectedAmount,
    toggleAppointmentSelection,

    // Handlers
    handleCreateBatch,
    handleMarkAsPaid,
    submitPayment,
    handleDeleteBatch,
    handleExportBatch,
    handleConfirmAppointment,
    handleIgnoreAppointment,
  };
}
