/**
 * billingActions
 * Todos os handlers assíncronos de CRUD de lotes e pagamentos.
 */
import React from 'react';
import { api } from '../../services/api';
import { exportToExcel } from '../../lib/excel';
import { toastSuccess, toastError } from '../../lib/toast';
import { logger } from '../../lib/logger';
import { format } from 'date-fns';

import {
  Appointment, Customer, Psychologist, BillingBatch,
  AppointmentStatus, BillingBatchStatus, HealthPlan, Plan,
} from '../../services/types';
import { AppointmentPaymentStatus, syncAppointmentsBatch, auditPriceParity } from './billingHelpers';

interface BillingActionsContext {
  batches: BillingBatch[];
  appointments: Appointment[];
  customers: Customer[];
  psychologists: Psychologist[];
  plans: Plan[]; // Adicionado
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
  batches, appointments, customers, psychologists, plans, // Adicionado
  selectedPlan, monthFilter, batchNumber, selectedAppointmentIds,
  editingDraftBatch, appointmentStatuses, batchToPay,
  getAppPrice, generateBatchNumber, fetchData,
  setIsCreateModalOpen, setSelectedAppointmentIds, setEditingDraftBatch,
  setAppointments, setBatchToPay, setIsPaymentModalOpen, setAppointmentStatuses,
}: BillingActionsContext) {

  const releaseFromOtherDrafts = async (idsBeingMoved: string[], targetBatchId: string) => {
    const draftBatches = batches.filter(
      b => b.status === BillingBatchStatus.DRAFT && b.id !== targetBatchId
    );
    for (const draft of draftBatches) {
      const toRemove = draft.appointmentIds.filter(id => idsBeingMoved.includes(id));
      if (toRemove.length === 0) continue;
      const remainingIds = draft.appointmentIds.filter(id => !idsBeingMoved.includes(id));
      const remainingTotal = appointments
        .filter(a => remainingIds.includes(a.id))
        .reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;
      await api.updateBillingBatch(draft.id, {
        appointmentIds: remainingIds,
        totalAmount: remainingTotal,
      });
    }
  };

  const snapshotParticularPrices = async (appIds: string[]) => {
    const updates: Promise<any>[] = [];
    for (const id of appIds) {
      const app = appointments.find(a => a.id === id);
      if (!app) continue;
      if (app.customPrice != null) continue;
      const customer = customers.find(c => c.id === app.customerId);
      const effectivePlan = app.healthPlanAtTime ?? customer?.healthPlan;
      if (effectivePlan !== HealthPlan.PARTICULAR) continue;
      const price = getAppPrice(app);
      if (price <= 0) continue;
      updates.push(
        api.updateAppointment(id, { customPrice: price }).then(() => {
          setAppointments(prev =>
            prev.map(a => a.id === id ? { ...a, customPrice: price } : a)
          );
        })
      );
    }
    if (updates.length > 0) await Promise.all(updates);
  };

  const handleCreateBatch = async () => {
    if (!batchNumber || selectedAppointmentIds.length === 0) return;
    const totalAmount = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;
    try {
      await snapshotParticularPrices(selectedAppointmentIds);
      const batch = await api.createBillingBatch({
        batchNumber, sentAt: new Date().toISOString(),
        status: BillingBatchStatus.SENT, healthPlan: selectedPlan,
        totalAmount, appointmentIds: selectedAppointmentIds,
      });
      await releaseFromOtherDrafts(selectedAppointmentIds, batch.id);
      await syncAppointmentsBatch(batch.id, [], selectedAppointmentIds);
      
      // Auditoria de paridade
      auditPriceParity(selectedAppointmentIds, appointments, customers, plans, getAppPrice);
      
      setIsCreateModalOpen(false);
      setSelectedAppointmentIds([]);
      setEditingDraftBatch(null);
      toastSuccess('Lote criado e enviado com sucesso!');
      fetchData();
    } catch (error) {
      logger.critical('billing.handleCreateBatch', error, {
        appointmentIds: selectedAppointmentIds, totalAmount, healthPlan: selectedPlan,
      });
      toastError('Erro ao criar lote.');
    }
  };

  const handleSaveAsDraft = async () => {
    if (selectedAppointmentIds.length === 0) return;
    const totalAmount = appointments
      .filter(a => selectedAppointmentIds.includes(a.id))
      .reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;
    try {
      if (editingDraftBatch) {
        await releaseFromOtherDrafts(selectedAppointmentIds, editingDraftBatch.id);
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
          const mergedTotal = appointments.filter(a => mergedIds.includes(a.id)).reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;
          await releaseFromOtherDrafts(selectedAppointmentIds, existingDraft.id);
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
          await releaseFromOtherDrafts(selectedAppointmentIds, batch.id);
          await syncAppointmentsBatch(batch.id, [], selectedAppointmentIds);
          toastSuccess('Rascunho salvo!');
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
        toastSuccess('Adicionado ao rascunho!');
      } else {
        const draftBatchNumber = generateBatchNumber(selectedPlan, monthFilter, true);
        const batch = await api.createBillingBatch({
          batchNumber: draftBatchNumber, sentAt: monthFilter + '-01T00:00:00.000Z',
          status: BillingBatchStatus.DRAFT, healthPlan: selectedPlan,
          totalAmount: appPrice, appointmentIds: [appId],
        });
        await api.updateAppointment(appId, { billingBatchId: batch.id });
        toastSuccess('Rascunho criado!');
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

  const handleFinalizeBatch = async () => {
    if (!editingDraftBatch || !batchNumber || selectedAppointmentIds.length === 0) return;
    const totalAmount      = appointments.filter(a => selectedAppointmentIds.includes(a.id)).reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;
    const finalBatchNumber = batchNumber.startsWith('RASCUNHO-')
      ? generateBatchNumber(selectedPlan, monthFilter, false) : batchNumber;
    try {
      await snapshotParticularPrices(selectedAppointmentIds);
      await syncAppointmentsBatch(editingDraftBatch.id, editingDraftBatch.appointmentIds, selectedAppointmentIds);
      await api.updateBillingBatch(editingDraftBatch.id, {
        batchNumber: finalBatchNumber, sentAt: new Date().toISOString(),
        status: BillingBatchStatus.SENT, appointmentIds: selectedAppointmentIds, totalAmount,
      });
      
      auditPriceParity(selectedAppointmentIds, appointments, customers, plans, getAppPrice);

      setIsCreateModalOpen(false);
      setSelectedAppointmentIds([]);
      setEditingDraftBatch(null);
      toastSuccess(`Lote ${finalBatchNumber} finalizado!`);
      fetchData();
    } catch (error) {
      logger.critical('billing.handleFinalizeBatch', error, {
        batchId: editingDraftBatch?.id, appointmentIds: selectedAppointmentIds, totalAmount,
      });
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

  /**
   * Recalcula o status de um lote com base no estado de pagamento dos seus
   * atendimentos e persiste a mudança:
   *   - Nenhum atendimento resolvido (paid/denied)  → SENT
   *   - Alguns resolvidos, mas não todos            → PARTIALLY_PAID
   *   - Todos resolvidos                            → PAID (fecha o lote)
   * `appsOverride` permite passar o estado já atualizado dos atendimentos
   * (antes do fetch), garantindo cálculo correto no mesmo ciclo.
   */
  const recalcBatchStatus = async (batchId: string, appsOverride?: Appointment[]) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch || batch.status === BillingBatchStatus.DRAFT) return;
    const source = appsOverride ?? appointments;
    const batchApps = batch.appointmentIds
      .map(id => source.find(a => a.id === id))
      .filter((a): a is Appointment => !!a);
    if (batchApps.length === 0) return;

    const resolvedCount = batchApps.filter(a => a.billingStatus === 'paid' || a.billingStatus === 'denied').length;

    let newStatus: BillingBatchStatus;
    if (resolvedCount === 0) newStatus = BillingBatchStatus.SENT;
    else if (resolvedCount < batchApps.length) newStatus = BillingBatchStatus.PARTIALLY_PAID;
    else newStatus = BillingBatchStatus.PAID;

    if (newStatus === batch.status && newStatus !== BillingBatchStatus.PAID) return;

    const updates: Partial<BillingBatch> = { status: newStatus };
    updates.paidAt = newStatus === BillingBatchStatus.PAID ? new Date().toISOString() : undefined;
    await api.updateBillingBatch(batchId, updates);
  };

  const handleMarkAppointmentPaid = async (appId: string) => {
    const app = appointments.find(a => a.id === appId);
    if (!app || !app.billingBatchId) return;
    const now = new Date().toISOString();
    try {
      await api.updateAppointment(appId, { billingStatus: 'paid', paidAt: now });
      const updatedApps = appointments.map(a =>
        a.id === appId ? { ...a, billingStatus: 'paid' as const, paidAt: now } : a
      );
      setAppointments(updatedApps);
      await recalcBatchStatus(app.billingBatchId, updatedApps);
      toastSuccess('Atendimento marcado como pago!');
      fetchData();
    } catch (error) {
      logger.critical('billing.handleMarkAppointmentPaid', error, { appointmentId: appId });
      toastError('Erro ao marcar atendimento como pago.');
    }
  };

  const handleUnmarkAppointmentPaid = async (appId: string) => {
    const app = appointments.find(a => a.id === appId);
    if (!app || !app.billingBatchId) return;
    try {
      await api.updateAppointment(appId, { billingStatus: null as any, paidAt: null as any, denialReason: null as any, denialResolution: null as any });
      const updatedApps = appointments.map(a =>
        a.id === appId ? { ...a, billingStatus: undefined, paidAt: undefined, denialReason: undefined, denialResolution: undefined } : a
      );
      setAppointments(updatedApps);
      await recalcBatchStatus(app.billingBatchId, updatedApps);
      toastSuccess('Pagamento do atendimento desfeito.');
      fetchData();
    } catch (error) {
      logger.critical('billing.handleUnmarkAppointmentPaid', error, { appointmentId: appId });
      toastError('Erro ao desfazer pagamento.');
    }
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
      logger.critical('billing.submitPayment', error, {
        batchId: batchToPay?.id, appointmentIds: batchToPay?.appointmentIds,
      });
      toastError('Erro ao registrar pagamento.');
    }
  };

  const handleDeleteBatch = async (id: string) => {
    const batch   = batches.find(b => b.id === id);
    const isDraft = batch?.status === BillingBatchStatus.DRAFT;
    const msg     = isDraft ? 'Deseja excluir este rascunho?' : 'Deseja realmente excluir este lote?';
    if (!confirm(msg)) return;
    try {
      await api.deleteBillingBatch(id);
      fetchData();
    } catch (error) {
      logger.failure('billing.handleDeleteBatch', error, { batchId: id });
      toastError('Erro ao excluir lote.');
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
      toastError('Erro ao confirmar.');
    }
  };

  const handleIgnoreAppointment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Ignorar atendimento?')) return;
    try {
      await api.updateAppointment(id, { billingIgnored: true });
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, billingIgnored: true } : a));
      setSelectedAppointmentIds(prev => prev.filter(i => i !== id));
    } catch (error) { console.error(error); }
  };

  const handleUnignoreAppointment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.updateAppointment(id, { billingIgnored: false });
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, billingIgnored: false } : a));
    } catch (error) { console.error(error); }
  };

  return {
    handleCreateBatch, handleSaveAsDraft, handleQuickAddToDraft, handleFinalizeBatch,
    handleMarkAsPaid, submitPayment, handleDeleteBatch, handleExportBatch,
    handleConfirmAppointment, handleIgnoreAppointment, handleUnignoreAppointment,
    handleMarkAppointmentPaid, handleUnmarkAppointmentPaid,
  };

}