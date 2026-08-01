/**
 * billingActions
 * Todos os handlers assíncronos de CRUD de lotes e pagamentos.
 */
import React from 'react';
import { api } from '../../services/api';
import { exportToExcel, exportMultiSheetExcel } from '../../lib/excel';
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
  getTussCode: (app: Appointment) => string;
  generateBatchNumber: (plan: HealthPlan, month: string, isDraft?: boolean) => string;
  fetchData: () => Promise<void>;
  setIsCreateModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAppointmentIds: React.Dispatch<React.SetStateAction<string[]>>;
  setEditingDraftBatch: React.Dispatch<React.SetStateAction<BillingBatch | null>>;
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  setBatchToPay: React.Dispatch<React.SetStateAction<BillingBatch | null>>;
  setIsPaymentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAppointmentStatuses: React.Dispatch<React.SetStateAction<Record<string, AppointmentPaymentStatus>>>;
  setSelectedBatch: React.Dispatch<React.SetStateAction<BillingBatch | null>>;
}

export function createBillingActions({
  batches, appointments, customers, psychologists, plans, // Adicionado
  selectedPlan, monthFilter, batchNumber, selectedAppointmentIds,
  editingDraftBatch, appointmentStatuses, batchToPay,
  getAppPrice, getTussCode, generateBatchNumber, fetchData,
  setIsCreateModalOpen, setSelectedAppointmentIds, setEditingDraftBatch,
  setAppointments, setBatchToPay, setIsPaymentModalOpen, setAppointmentStatuses,
  setSelectedBatch,
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
   *   - Nenhum atendimento resolvido (paid/denied)  -> SENT
   *   - Alguns resolvidos, mas não todos            -> PARTIALLY_PAID
   *   - Todos resolvidos                            -> PAID (fecha o lote)
   * `appsOverride` permite passar o estado já atualizado dos atendimentos
   * (antes do fetch), garantindo cálculo correto no mesmo ciclo.
   */
  const recalcBatchStatus = async (
    batchId: string,
    appsOverride?: Appointment[],
  ): Promise<{ status: BillingBatchStatus; paidAt?: string } | undefined> => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch || batch.status === BillingBatchStatus.DRAFT) return;
    const source = appsOverride ?? appointments;
    // Só atendimentos COBRÁVEIS (valor > 0) contam para o status do lote.
    // Itens de R$0 (4ª+ sessão neuropsico AMS, cancelamento isento) não têm
    // ação de pagamento na UI, então incluí-los travaria o lote em
    // PARTIALLY_PAID para sempre.
    const batchApps = batch.appointmentIds
      .map(id => source.find(a => a.id === id))
      .filter((a): a is Appointment => !!a && getAppPrice(a) > 0);
    if (batchApps.length === 0) return;


    const resolvedCount = batchApps.filter(a => a.billingStatus === 'paid' || a.billingStatus === 'denied').length;

    let newStatus: BillingBatchStatus;
    if (resolvedCount === 0) newStatus = BillingBatchStatus.SENT;
    else if (resolvedCount < batchApps.length) newStatus = BillingBatchStatus.PARTIALLY_PAID;
    else newStatus = BillingBatchStatus.PAID;

    // Se o status não mudou (e não é PAID, que sempre reescreve paidAt), evita
    // um UPDATE redundante — mas ainda devolve o status atual para que o
    // chamador possa sincronizar o estado local (selectedBatch) se precisar.
    if (newStatus === batch.status && newStatus !== BillingBatchStatus.PAID) {
      return { status: newStatus, paidAt: batch.paidAt };
    }

    const paidAt = newStatus === BillingBatchStatus.PAID ? new Date().toISOString() : undefined;
    const updates: Partial<BillingBatch> = { status: newStatus, paidAt };
    await api.updateBillingBatch(batchId, updates);
    return { status: newStatus, paidAt };
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
      const recalc = await recalcBatchStatus(app.billingBatchId, updatedApps);
      // Sincroniza o modal de detalhes na hora (sem esperar o refetch), senão o
      // campo "Status" fica congelado no valor anterior mesmo com o banco já
      // atualizado (ex.: continua "Parcialmente Pago" após quitar o último).
      if (recalc) {
        setSelectedBatch(prev =>
          prev && prev.id === app.billingBatchId
            ? { ...prev, status: recalc.status, paidAt: recalc.paidAt }
            : prev
        );
      }
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
      const recalc = await recalcBatchStatus(app.billingBatchId, updatedApps);
      // Mesma sincronização do modal ao desfazer um pagamento (ex.: de PAID
      // volta para PARTIALLY_PAID/SENT).
      if (recalc) {
        setSelectedBatch(prev =>
          prev && prev.id === app.billingBatchId
            ? { ...prev, status: recalc.status, paidAt: recalc.paidAt }
            : prev
        );
      }
      toastSuccess('Pagamento do atendimento desfeito.');
      fetchData();
    } catch (error) {
      logger.critical('billing.handleUnmarkAppointmentPaid', error, { appointmentId: appId });
      toastError('Erro ao desfazer pagamento.');
    }
  };


  /**
   * Remove um único atendimento de um lote JÁ ENVIADO (não-DRAFT).
   * Uso: atendimento entrou no lote por engano (estava "previsto" no sistema).
   *
   * Salvaguardas financeiras (a operação é abortada se qualquer uma falhar):
   *   1. Nunca opera em lote DRAFT (a edição de rascunho é feita na seleção).
   *   2. Só remove atendimento AINDA NÃO RESOLVIDO (billingStatus vazio). Se já
   *      está pago/glosado, o usuário deve "Desfazer pagamento" antes - evita
   *      remover algo que já pode ter gerado repasse ao psicólogo.
   *   3. Bloqueia se o atendimento constar em algum repasse já gerado (checagem
   *      redundante contra dessincronização de billingStatus).
   *   4. Nunca esvazia o lote: se for o último atendimento, orienta a excluir o
   *      lote inteiro.
   * Efeitos: recalcula totalAmount e status do lote, e libera billingBatchId
   * do atendimento (volta a ficar elegível para novo lote).
   */
  const handleRemoveAppointmentFromBatch = async (batch: BillingBatch, appId: string) => {
    if (batch.status === BillingBatchStatus.DRAFT) return;

    const app = appointments.find(a => a.id === appId);
    if (!app) return;

    // Salvaguarda 2: atendimento já resolvido não pode ser removido diretamente.
    if (app.billingStatus === 'paid' || app.billingStatus === 'denied') {
      toastError('Este atendimento já foi resolvido (pago/glosado). Desfaça o pagamento antes de removê-lo do lote.');
      return;
    }

    // Salvaguarda 4: não deixar o lote vazio.
    const remainingIds = batch.appointmentIds.filter(id => id !== appId);
    if (remainingIds.length === 0) {
      toastError('Este é o único atendimento do lote. Para removê-lo, exclua o lote inteiro.');
      return;
    }

    const customer = customers.find(c => c.id === app.customerId);
    const price = getAppPrice(app);
    const confirmMsg =
      `Remover este atendimento do lote #${batch.batchNumber}?\n\n` +
      `Paciente: ${customer?.name ?? '-'}\n` +
      `Valor: ${price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\n` +
      `O total do lote será recalculado e o atendimento voltará a ficar disponível para faturamento.`;
    if (!confirm(confirmMsg)) return;

    try {
      // Salvaguarda 3: confirma que o atendimento não está em nenhum repasse.
      const repasses = await api.getRepasses();
      const inRepasse = repasses.some(r => r.appointmentIds.includes(appId));
      if (inRepasse) {
        toastError('Este atendimento já consta em um repasse gerado e não pode ser removido do lote.');
        return;
      }

      // Recalcula o total do lote (em centavos) a partir dos atendimentos restantes.
      const newTotal = appointments
        .filter(a => remainingIds.includes(a.id))
        .reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;

      // Recalcula o status do lote com base nos atendimentos restantes.
      // Só atendimentos COBRÁVEIS (valor > 0) contam — itens de R$0 não têm
      // ação de pagamento, então não podem travar o status do lote.
      const remainingApps = remainingIds
        .map(id => appointments.find(a => a.id === id))
        .filter((a): a is Appointment => !!a && getAppPrice(a) > 0);
      const resolvedCount = remainingApps.filter(a => a.billingStatus === 'paid' || a.billingStatus === 'denied').length;

      let newStatus: BillingBatchStatus;
      if (resolvedCount === 0) newStatus = BillingBatchStatus.SENT;
      else if (resolvedCount < remainingApps.length) newStatus = BillingBatchStatus.PARTIALLY_PAID;
      else newStatus = BillingBatchStatus.PAID;

      const batchUpdates: Partial<BillingBatch> = {
        appointmentIds: remainingIds,
        totalAmount: newTotal,
        status: newStatus,
        paidAt: newStatus === BillingBatchStatus.PAID ? new Date().toISOString() : undefined,
      };

      // 1. Solta o atendimento do lote (volta a ser elegível para faturamento).
      await api.updateAppointment(appId, { billingBatchId: null as any });
      // 2. Atualiza o lote (nova lista, total e status).
      await api.updateBillingBatch(batch.id, batchUpdates);

      setAppointments(prev => prev.map(a => a.id === appId ? { ...a, billingBatchId: undefined } : a));
      // Atualiza o modal de detalhes imediatamente (sem esperar o refetch).
      setSelectedBatch(prev =>
        prev && prev.id === batch.id
          ? { ...prev, appointmentIds: remainingIds, totalAmount: newTotal, status: newStatus, paidAt: batchUpdates.paidAt }
          : prev
      );
      toastSuccess('Atendimento removido do lote.');
      fetchData();
    } catch (error) {
      logger.critical('billing.handleRemoveAppointmentFromBatch', error, {
        batchId: batch.id, appointmentId: appId,
      });
      toastError('Erro ao remover atendimento do lote.');
    }
  };

  /**
   * Adiciona um atendimento a um lote JÁ ENVIADO (não-DRAFT).
   * Uso: o atendimento deveria ter entrado no lote mas foi esquecido.
   *
   * Salvaguardas financeiras (a operação é abortada se qualquer uma falhar):
   *   1. Nunca opera em lote DRAFT (a edição de rascunho é feita na seleção).
   *   2. Bloqueia se o lote já possui QUALQUER repasse gerado — a partir daí o
   *      lote está financeiramente "fechado" para edição.
   *   3. Só adiciona atendimento COBRÁVEL (valor > 0) do MESMO plano do lote e
   *      que ainda não pertence a outro lote.
   * Efeitos: vincula billingBatchId, recalcula totalAmount e status do lote.
   */
  const handleAddAppointmentToBatch = async (batch: BillingBatch, appId: string) => {
    if (batch.status === BillingBatchStatus.DRAFT) return;

    const app = appointments.find(a => a.id === appId);
    if (!app) return;

    // Salvaguarda 3a: não duplicar.
    if (batch.appointmentIds.includes(appId)) {
      toastError('Este atendimento já está no lote.');
      return;
    }

    // Salvaguarda 3b: precisa ser cobrável.
    const price = getAppPrice(app);
    if (price <= 0) {
      toastError('Este atendimento não possui valor a faturar e não pode ser adicionado.');
      return;
    }

    // Salvaguarda 3c: não pode já pertencer a outro lote.
    if (app.billingBatchId && app.billingBatchId !== batch.id) {
      toastError('Este atendimento já pertence a outro lote.');
      return;
    }

    try {
      // Salvaguarda 2: bloqueia se o lote já tem repasse gerado.
      const repasses = await api.getRepasses();
      const hasRepasse = repasses.some(r => r.billingBatchId === batch.id);
      if (hasRepasse) {
        toastError('Este lote já possui repasse gerado e não pode mais ser editado.');
        return;
      }

      const newIds = [...batch.appointmentIds, appId];
      const newTotal = appointments
        .filter(a => newIds.includes(a.id))
        .reduce((sum, a) => sum + Math.round(getAppPrice(a) * 100), 0) / 100;

      // Recalcula o status: o atendimento adicionado entra como pendente
      // (billingStatus vazio), então o lote nunca fica "mais pago" do que estava.
      const newApps = newIds
        .map(id => appointments.find(a => a.id === id))
        .filter((a): a is Appointment => !!a && getAppPrice(a) > 0);
      const resolvedCount = newApps.filter(a => a.billingStatus === 'paid' || a.billingStatus === 'denied').length;
      let newStatus: BillingBatchStatus;
      if (resolvedCount === 0) newStatus = BillingBatchStatus.SENT;
      else if (resolvedCount < newApps.length) newStatus = BillingBatchStatus.PARTIALLY_PAID;
      else newStatus = BillingBatchStatus.PAID;

      const batchUpdates: Partial<BillingBatch> = {
        appointmentIds: newIds,
        totalAmount: newTotal,
        status: newStatus,
        paidAt: newStatus === BillingBatchStatus.PAID ? new Date().toISOString() : undefined,
      };

      // Se for particular sem customPrice, congela o valor (mesma regra da criação de lote).
      await snapshotParticularPrices([appId]);
      await api.updateAppointment(appId, { billingBatchId: batch.id });
      await api.updateBillingBatch(batch.id, batchUpdates);

      setAppointments(prev => prev.map(a => a.id === appId ? { ...a, billingBatchId: batch.id } : a));
      setSelectedBatch(prev =>
        prev && prev.id === batch.id
          ? { ...prev, appointmentIds: newIds, totalAmount: newTotal, status: newStatus, paidAt: batchUpdates.paidAt }
          : prev
      );
      toastSuccess('Atendimento adicionado ao lote.');
      fetchData();
    } catch (error) {
      logger.critical('billing.handleAddAppointmentToBatch', error, {
        batchId: batch.id, appointmentId: appId,
      });
      toastError('Erro ao adicionar atendimento ao lote.');
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
    const batchAppointments = appointments
      .filter(a => batch.appointmentIds.includes(a.id))
      // Oculta atendimentos com valor R$0,00 (ex: sessão AMS sem cobrança,
      // cancelamento isento) para não poluir o arquivo exportado.
      .filter(a => getAppPrice(a) > 0);

    // Nome do paciente memoizado por atendimento (usado na ordenação e agrupamento).
    const patientName = (app: Appointment) =>
      customers.find(c => c.id === app.customerId)?.name || '---';

    // ─── Ordenação: Lote → Operadora → Paciente → Data da sessão ────────────
    // (dentro de um único lote, Lote/Operadora são constantes; a ordenação por
    // 3 chaves já deixa o arquivo pronto para um eventual export multi-lote.)
    const sortedAppointments = [...batchAppointments].sort((a, b) => {
      const byLote = `#${batch.batchNumber}`.localeCompare(`#${batch.batchNumber}`);
      if (byLote !== 0) return byLote;
      const byOperadora = batch.healthPlan.localeCompare(batch.healthPlan);
      if (byOperadora !== 0) return byOperadora;
      const byPaciente = patientName(a).localeCompare(patientName(b), 'pt-BR');
      if (byPaciente !== 0) return byPaciente;
      return (a.date || '').localeCompare(b.date || '');
    });

    // ─── Aba 1: Atendimentos (detalhe ordenado) ────────────────────────────
    const detailData = sortedAppointments.map(app => {
      const psychologist = psychologists.find(p => p.id === app.psychologistId);
      return {
        'Lote': `#${batch.batchNumber}`,
        'Operadora': batch.healthPlan,
        'Paciente': patientName(app),
        'Profissional': psychologist?.name || '---',
        'Cód. TUSS': getTussCode(app) || '---',
        'Data da Sessão': format(new Date(app.date + 'T12:00:00'), 'dd/MM/yyyy'),
        'Horário': app.startTime,
        'Valor (R$)': getAppPrice(app),
        'Status de Faturamento': app.billingStatus === 'paid' ? 'Pago' : app.billingStatus === 'denied' ? 'Glosa' : 'Pendente',
      };
    });

    // ─── Aba 2: Resumo por Paciente ────────────────────────────────────────
    // Agrupa por (Paciente, Cód. TUSS) somando quantidade e valor. Para cada
    // paciente adiciona uma linha "TOTAL DO PACIENTE" e, ao final, "TOTAL GERAL".
    // Ordenado por nome do paciente e, dentro dele, por código TUSS.
    type SummaryAcc = { patient: string; tuss: string; count: number; total: number };
    const acc = new Map<string, SummaryAcc>();
    for (const app of sortedAppointments) {
      const patient = patientName(app);
      const tuss = getTussCode(app) || '---';
      const key = `${patient}||${tuss}`;
      const entry = acc.get(key) ?? { patient, tuss, count: 0, total: 0 };
      entry.count += 1;
      entry.total = Math.round((entry.total + getAppPrice(app)) * 100) / 100;
      acc.set(key, entry);
    }

    const groups = Array.from(acc.values()).sort((a, b) => {
      const byPatient = a.patient.localeCompare(b.patient, 'pt-BR');
      if (byPatient !== 0) return byPatient;
      return a.tuss.localeCompare(b.tuss, 'pt-BR');
    });

    const summaryData: Record<string, string | number | null>[] = [];
    let grandCount = 0;
    let grandTotal = 0;
    let currentPatient: string | null = null;
    let patientCount = 0;
    let patientTotal = 0;

    const pushPatientSubtotal = () => {
      if (currentPatient === null) return;
      summaryData.push({
        'Paciente': `TOTAL — ${currentPatient}`,
        'Cód. TUSS': '',
        'Qtd. Atendimentos': patientCount,
        'Valor Total (R$)': Math.round(patientTotal * 100) / 100,
      });
    };

    for (const g of groups) {
      if (g.patient !== currentPatient) {
        pushPatientSubtotal();
        currentPatient = g.patient;
        patientCount = 0;
        patientTotal = 0;
      }
      summaryData.push({
        'Paciente': g.patient,
        'Cód. TUSS': g.tuss,
        'Qtd. Atendimentos': g.count,
        'Valor Total (R$)': g.total,
      });
      patientCount += g.count;
      patientTotal = Math.round((patientTotal + g.total) * 100) / 100;
      grandCount += g.count;
      grandTotal = Math.round((grandTotal + g.total) * 100) / 100;
    }
    // Subtotal do último paciente + total geral.
    pushPatientSubtotal();
    summaryData.push({
      'Paciente': 'TOTAL GERAL',
      'Cód. TUSS': '',
      'Qtd. Atendimentos': grandCount,
      'Valor Total (R$)': grandTotal,
    });

    const summaryNotes = [
      `Resumo do Lote #${batch.batchNumber} — Operadora: ${batch.healthPlan}`,
      'Quantidade de atendimentos e valor total faturado, agrupados por paciente e código TUSS.',
      'As linhas "TOTAL — <paciente>" somam o paciente; a última linha traz o TOTAL GERAL do lote.',
    ];

    exportMultiSheetExcel(
      [
        { sheetName: 'Atendimentos', data: detailData },
        { sheetName: 'Resumo por Paciente', data: summaryData, topNotes: summaryNotes },
      ],
      `Lote_${batch.batchNumber}_${batch.healthPlan}_${format(new Date(), 'yyyyMMdd')}`,
    );
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
    handleRemoveAppointmentFromBatch, handleAddAppointmentToBatch,
    recalcBatchStatus,
  };



}
