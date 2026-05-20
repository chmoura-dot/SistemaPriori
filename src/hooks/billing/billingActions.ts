/**
 * billingActions
 * Todos os handlers assíncronos de CRUD de lotes e pagamentos.
 * Recebe estado e setters via contexto — sem useState/useEffect próprios.
 */
import React from 'react';
import { api } from '../../services/api';
import { exportToExcel } from '../../lib/excel';
import { toastSuccess, toastError } from '../../lib/toast';
import { format } from 'date-fns';
import {
  Appointment, Customer, Psychologist, BillingBatch,
  AppointmentStatus, BillingBatchStatus, HealthPlan,
} from '../../services/types';
import { AppointmentPaymentStatus, syncAppointmentsBatch } from './billingHelpers';

interface BillingActionsContext {
  batches: BillingBatch[];
  appointments: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  selectedPlan: HealthPlan;
  monthFilter: string;
  batchNumber: string;
  selectedAppointmentIds: string[];
  editingDraftBatch: BillingBatch | null;
  appointmentStatuses: Record<string, AppointmentPaymentStatus>;
  batchToPay: BillingBatch | null;
  getAppPrice: (app: Appointment) => number;
  generateBatchNumber: (plan: HealthPlan, month: string, isDraft?: boolean) => string;
  fetchData: () => Promise<void>;
  setIsCreateModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAppointmentIds: React.Dispatch<React.SetStateAction<string[]>>;
  setEditingDraftBatch: React.Dispatch<React.SetStateAction<BillingBatch | null>>;
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  setBatchToPay: React.Dispatch<React.SetStateAction<BillingBatch | null>>;
  setIsPaymentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAppointmentStatuses: React.Dispatch<React.SetStateAction<Record<string, AppointmentPaymentStatus>>>;
}

export function createBillingActions({
  batches, appointments, customers, psychologists,
  selectedPlan, monthFilter, batchNumber, selectedAppointmentIds,
  editingDraftBatch, appointmentStatuses, batchToPay,
  getAppPrice, generateBatchNumber, fetchData,
  setIsCreateModalOpen, setSelectedAppointmentIds, setEditingDraftBatch,
  setAppointments, setBatchToPay, setIsPaymentModalOpen, setAppointmentStatuses,
}: BillingActionsContext) {

  /** Cria o lote diretamente como ENVIADO (via "Revisar e Gerar Lote"). */
  const handleCreateBatch = async () => {
    if (!batchNumber || selectedAppointmentIds.length === 0) return;
    const totalAmount = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);
    try {
      const batch = await api.createBillingBatch({
        batchNumber, sentAt: new Date().toISOString(),
        status: BillingBatchStatus.SENT, healthPlan: selectedPlan,
        totalAmount, appointmentIds: selectedAppointmentIds,
      });
      await syncAppointmentsBatch(batch.id, [], selectedAppointmentIds);
      setIsCreateModalOpen(false);
      setSelectedAppointmentIds([]);
      setEditingDraftBatch(null);
      toastSuccess('Lote criado e enviado com sucesso!');
      fetchData();
    } catch (error) {
      console.error('Error creating batch:', error);
      toastError('Erro ao criar lote.');
    }
  };

  /** Salva como Rascunho (DRAFT). Mescla com rascunho existente se houver. */
  const handleSaveAsDraft = async () => {
    if (selectedAppointmentIds.length === 0) return;
    const totalAmount = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + getAppPrice(a), 0);
    try {
      if (editingDraftBatch) {
        await syncAppointmentsBatch(editingDraftBatch.id, editingDraftBatch.appointmentIds, selectedAppointmentIds);
        await api.updateBillingBatch(editingDraftBatch.id, { appointmentIds: selectedAppointmentIds, totalAmount });
        setEditingDraftBatch(prev =>
          prev ? { ...prev, appointmentIds: [...selectedAppointmentIds], totalAmount } : prev
        );
        toastSuccess('Rascunho atualizado!');
        fetchData();
      } else {
        const existingDraft = batches.find(
          b => b.status === BillingBatchStatus.DRAFT && b.healthPlan === selectedPlan && b.sentAt.startsWith(monthFilter)
        );
        if (existingDraft) {
          const mergedIds   = [...new Set([...existingDraft.appointmentIds, ...selectedAppointmentIds])];
          const mergedTotal = appointments.filter(a => mergedIds.includes(a.id)).reduce((sum, a) => sum + getAppPrice(a), 0);
          await syncAppointmentsBatch(existingDraft.id, existingDraft.appointmentIds, mergedIds);
          await api.updateBillingBatch(existingDraft.id, { appointmentIds: mergedIds, totalAmount: mergedTotal });
          toastSuccess('Atendimentos adicionados ao rascunho existente!');
        } else {
          const draftBatchNumber = generateBatchNumber(selectedPlan, monthFilter, true);
          const batch = await api.createBillingBatch({
            batchNumber: draftBatchNumber,
            sentAt: monthFilter + '-01T00:00:00.000Z',
            status: BillingBatchStatus.DRAFT, healthPlan: selectedPlan,
            totalAmount, appointmentIds: selectedAppointmentIds,
          });
          await syncAppointmentsBatch(batch.id, [], selectedAppointmentIds);
          toastSuccess('Rascunho salvo! Continue adicionando atendimentos quando quiser.');
        }
        setIsCreateModalOpen(false);
        setSelectedAppointmentIds([]);
        setEditingDraftBatch(null);
        fetchData();
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      toastError('Erro ao salvar rascunho.');
    }
  };

  /** Adiciona UM atendimento rapidamente ao rascunho ativo. */
  const handleQuickAddToDraft = async (appId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const app = appointments.find(a => a.id === appId);
    if (!app) return;
    const appPrice = getAppPrice(app);
    const existingDraft = batches.find(
      b => b.status === BillingBatchStatus.DRAFT && b.healthPlan === selectedPlan && b.sentAt.startsWith(monthFilter)
    );
    try {
      if (existingDraft) {
        if (existingDraft.appointmentIds.includes(appId)) { toastError('Este atendimento já está no rascunho!'); return; }
        const newIds = [...existingDraft.appointmentIds, appId];
        await api.updateBillingBatch(existingDraft.id, { appointmentIds: newIds, totalAmount: existingDraft.totalAmount + appPrice });
        await api.updateAppointment(appId, { billingBatchId: existingDraft.id });
        toastSuccess('Adicionado ao rascunho existente!');
      } else {
        const draftBatchNumber = generateBatchNumber(selectedPlan, monthFilter, true);
        const batch = await api.createBillingBatch({
          batchNumber: draftBatchNumber, sentAt: monthFilter + '-01T00:00:00.000Z',
          status: BillingBatchStatus.DRAFT, healthPlan: selectedPlan,
          totalAmount: appPrice, appointmentIds: [appId],
        });
        await api.updateAppointment(appId, { billingBatchId: batch.id });
        toastSuccess('Rascunho criado! Atendimento adicionado.');
      }
      setAppointments(prev =>
        prev.map(a => a.id === appId ? { ...a, billingBatchId: existingDraft?.id || 'pending-refresh' } : a)
      );
      fetchData();
    } catch (error) {
      console.error('Error quick-adding to draft:', error);
      toastError('Erro ao adicionar ao rascunho.');
    }
  };

  /** Finaliza um rascunho: status DRAFT → SENT. */
  const handleFinalizeBatch = async () => {
    if (!editingDraftBatch || !batchNumber || selectedAppointmentIds.length === 0) return;
    const totalAmount      = appointments.filter(a => selectedAppointmentIds.includes(a.id)).reduce((sum, a) => sum + getAppPrice(a), 0);
    const finalBatchNumber = batchNumber.startsWith('RASCUNHO-')
      ? generateBatchNumber(selectedPlan, monthFilter, false) : batchNumber;
    try {
      await syncAppointmentsBatch(editingDraftBatch.id, editingDraftBatch.appointmentIds, selectedAppointmentIds);
      await api.updateBillingBatch(editingDraftBatch.id, {
        batchNumber: finalBatchNumber, sentAt: new Date().toISOString(),
        status: BillingBatchStatus.SENT, appointmentIds: selectedAppointmentIds, totalAmount,
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
    batch.appointmentIds.forEach(id => { initialStatuses[id] = { status: 'paid' }; });
    setAppointmentStatuses(initialStatuses);
    setIsPaymentModalOpen(true);
  };

  const submitPayment = async () => {
    if (!batchToPay) return;
    try {
      await Promise.all(batchToPay.appointmentIds.map(id => {
        const statusData = appointmentStatuses[id];
        return api.updateAppointment(id, {
          billingStatus: statusData.status, denialReason: statusData.reason, denialResolution: statusData.resolution
        });
      }));
      await api.updateBillingBatch(batchToPay.id, { status: BillingBatchStatus.PAID, paidAt: new Date().toISOString() });
      setIsPaymentModalOpen(false);
      setBatchToPay(null);
      fetchData();
    } catch (error) {
      console.error('Error processing payment:', error);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    const batch   = batches.find(b => b.id === id);
    const isDraft = batch?.status === BillingBatchStatus.DRAFT;
    const msg     = isDraft
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
      const customer    = customers.find(c => c.id === app.customerId);
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
        'Resolução Glosa': app.denialResolution === 'appealed' ? 'Recursada' : app.denialResolution === 'accepted' ? 'Aceite' : '',
      };
    });
    exportToExcel(exportData, `Lote_${batch.batchNumber}_${batch.healthPlan}_${format(new Date(), 'yyyyMMdd')}`, 'Atendimentos');
  };

  const handleConfirmAppointment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.updateAppointment(id, { confirmedPsychologist: true });
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, confirmedPsychologist: true } : a));
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

  return {
    handleCreateBatch, handleSaveAsDraft, handleQuickAddToDraft, handleFinalizeBatch,
    handleMarkAsPaid, submitPayment, handleDeleteBatch, handleExportBatch,
    handleConfirmAppointment, handleIgnoreAppointment,
  };
}
