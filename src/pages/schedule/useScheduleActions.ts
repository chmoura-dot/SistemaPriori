import { api } from '../../services/api';
import { apiCache } from '../../services/apiCache';
import {
  Appointment, AppointmentStatus, AppointmentType, AttendanceMode, HealthPlan, RecurrenceFrequency,
} from '../../services/types';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import { hasTimeOverlap } from '../../lib/timeUtils';
import { resolvePsychologistAbsenceBilling, amsNeuropsicoCycleNeedsAttention } from '../../lib/pricing';
import { toastInfo } from '../../lib/toast';
import { findWaitingListMatches, MATCH_HORIZON_DAYS } from '../../lib/waitingListMatch';

import { useScheduleData, makeDefaultForm } from './useScheduleData';
import { ScheduleFormData } from './scheduleUtils';

type ScheduleData = ReturnType<typeof useScheduleData>;

/**
 * Checa, após um cancelamento ESTRUTURAL (fim de tratamento — toda a série
 * futura foi cancelada, não apenas uma ocorrência isolada), se a vaga que
 * sobrou é compatível com algum interessado 'pending' da Fila de Espera.
 * Dispara um toast informativo para quem estiver com o sistema aberto.
 *
 * IMPORTANTE: nunca deve ser chamada em cancelamento de uma única sessão
 * (scope 'single'), pois a próxima ocorrência da série ainda existe como
 * linha ATIVA no banco — não é uma vaga real.
 */
async function notifyIfWaitingListMatch(psychologistId: string, fromDate: string): Promise<void> {
  try {
    const horizonEnd = new Date(fromDate + 'T12:00:00');
    horizonEnd.setDate(horizonEnd.getDate() + MATCH_HORIZON_DAYS);
    const [waitingList, psychologists, appointments, holidays, closures] = await Promise.all([
      api.getWaitingList(),
      api.getPsychologists(),
      api.getAppointmentsByRange(fromDate, horizonEnd.toISOString().split('T')[0]),
      api.getHolidays(),
      api.getClinicClosures(),
    ]);
    const matches = findWaitingListMatches(waitingList, psychologists, appointments, holidays, closures)
      .filter(m => m.slots.some(sl => sl.psychologistId === psychologistId));
    if (matches.length > 0) {
      const psychName = psychologists.find(p => p.id === psychologistId)?.name ?? 'o profissional';
      toastInfo(`🔔 Vaga aberta com ${psychName} — compatível com ${matches.length} interessado${matches.length > 1 ? 's' : ''} na Fila de Espera.`);
      window.dispatchEvent(new CustomEvent('waiting-match-updated'));
    }
  } catch (e) {
    logger.warn('[WaitingMatch] Falha ao checar vagas compatíveis', e);
  }
}

export const useScheduleActions = (s: ScheduleData) => {
  const resetForm = () => s.setFormData(makeDefaultForm(s.date));

  const handleCloseModal = () => {
    s.setIsModalOpen(false);
    s.setEditingId(null);
    s.setRescheduleFromId(null);
    s.setAmsAlertCustomerId(null);
    s.setAmsAlertAcknowledged(false);
    resetForm();
  };

  // Abre o formulário em modo "Remanejar": pré-preenche o mesmo horário/sala
  // do atendimento cancelado, mas zera o paciente para escolha do substituto.
  const handleReschedule = (appointment: Appointment) => {
    s.setFormData({
      customerId: '',
      psychologistId: appointment.psychologistId,
      roomId: appointment.roomId || '',
      mode: appointment.mode,
      type: appointment.type,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      procedureCode: '',
      customPrice: undefined,
      customRepassAmount: undefined,
      isRecurring: false,
      recurrenceFrequency: RecurrenceFrequency.SEMANAL,
      isInternal: false,
      internalType: 'SUPERVISAO',
      internalTitle: '',
      internalNotes: '',
    });
    s.setEditingId(null);
    s.setUpdateFuture(false);
    s.setRescheduleFromId(appointment.id);
    s.setIsModalOpen(true);
  };

  const doSubmit = async () => {
    s.setIsSaving(true);
    try {
      const { formData, appointments, editingId, date } = s;
      const conflicts = appointments.filter(
        a => a.id !== editingId && a.date === formData.date &&
          a.status !== AppointmentStatus.CANCELED &&
          hasTimeOverlap(formData.startTime, formData.endTime, a.startTime, a.endTime)
      );
      if (conflicts.some(a => formData.mode === AttendanceMode.PRESENCIAL && a.mode === AttendanceMode.PRESENCIAL && a.roomId === formData.roomId))
        throw new Error('Já existe um agendamento para esta sala neste horário.');
      if (conflicts.some(a => a.psychologistId === formData.psychologistId))
        throw new Error('O psicólogo selecionado já possui um agendamento neste horário.');

      if (formData.isRecurring && !editingId) {
        const intervalDays = formData.recurrenceFrequency === RecurrenceFrequency.QUINZENAL ? 14 : 7;
        const [sy, sm, sd] = formData.date.split('-').map(Number);
        // Corte = 2 meses à frente da data de início
        const endDate = new Date(sy, sm - 1 + 2, sd);
        let i = 1;
        while (i < 52) {
          const cur = new Date(sy, sm - 1, sd + i * intervalDays);
          if (cur > endDate) break;
          const targetDate = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
          const hasConflict = appointments.some(
            a => a.psychologistId === formData.psychologistId && a.date === targetDate &&
              a.status !== AppointmentStatus.CANCELED &&
              hasTimeOverlap(formData.startTime, formData.endTime, a.startTime, a.endTime)
          );
          if (hasConflict) throw new Error(`O psicólogo já possui agendamento conflitante em ${targetDate}.`);
          i++;
        }
      }

      // Snapshot do plano vigente do paciente no momento da criação/edição
      const selectedCustomer = s.customers.find(c => c.id === formData.customerId);
      const payload: Partial<ScheduleFormData> & { healthPlanAtTime?: string } = {
        ...formData,
        roomId: formData.mode === AttendanceMode.ONLINE ? undefined : formData.roomId,
        isInternal: formData.isInternal,
        internalType: formData.isInternal ? (formData.internalType as any) : undefined,
        internalTitle: formData.isInternal ? formData.internalTitle : undefined,
        healthPlanAtTime: selectedCustomer?.healthPlan ?? undefined,
      };

      if (s.rescheduleFromId) {
        // Remanejamento atômico: cancela o original como 'reschedule' e cria o
        // novo já vinculado, numa única transação (evita vaga órfã/duplicada).
        await api.rescheduleAppointmentSwap({
          originalAppointmentId: s.rescheduleFromId,
          newAppointment: {
            ...(payload as any),
            date: formData.date,
            dayOfWeek: new Date(formData.date + 'T12:00:00').getDay(),
          },
        });
      } else if (editingId) {
        const appt = appointments.find(a => a.id === editingId);
        if (appt?.isRecurring && appt.recurrenceGroupId && s.updateFuture) {
          await api.deleteFutureAppointments(appt.recurrenceGroupId, appt.date);
          await api.createAppointment({ ...payload as any, date: formData.date, dayOfWeek: new Date(formData.date + 'T12:00:00').getDay(), status: AppointmentStatus.ACTIVE });
        } else {
          await api.updateAppointment(editingId, payload as any);
        }
      } else {
        await api.createAppointment({ ...payload as any, date: formData.date, dayOfWeek: new Date(formData.date + 'T12:00:00').getDay(), status: AppointmentStatus.ACTIVE });
      }

      await s.loadData(date, true);
      s.setIsModalOpen(false);
      s.setEditingId(null);
      s.setUpdateFuture(false);
      s.setRescheduleFromId(null);
      s.setAmsAlertCustomerId(null);
      s.setAmsAlertAcknowledged(false);
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('conflitante') || msg.includes('já possui') || msg.includes('overlap') || msg.includes('duplicate')) {
        alert('O psicólogo selecionado já possui um agendamento neste horário.');
      } else {
        alert(msg || 'Erro ao salvar agendamento');
      }
    } finally {
      s.setIsSaving(false);
    }
  };

  // Antes de marcar um NOVO atendimento (não edição/remanejamento) de
  // Avaliação Neuropsicológica para um paciente AMS Petrobras cujo ciclo
  // atual já esgotou as 3 tentativas sem nenhum comparecimento real, avisa a
  // secretária (a avaliação nunca foi entregue, mas o agendamento sozinho não
  // resolve a autorização/cobrança). É só um aviso — ao confirmar, o
  // agendamento segue normalmente.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s.editingId && !s.rescheduleFromId && !s.amsAlertAcknowledged) {
      const selectedCustomer = s.customers.find(c => c.id === s.formData.customerId);
      if (
        s.formData.type === AppointmentType.NEUROPSICOLOGICA &&
        selectedCustomer?.healthPlan === HealthPlan.AMS_PETROBRAS &&
        amsNeuropsicoCycleNeedsAttention(selectedCustomer.id, {
          customers: s.customers, plans: s.plans, appointments: s.appointments,
        })
      ) {
        s.setAmsAlertCustomerId(selectedCustomer.id);
        return;
      }
    }
    await doSubmit();
  };

  const handleAcknowledgeAmsAlert = async () => {
    s.setAmsAlertCustomerId(null);
    s.setAmsAlertAcknowledged(true);
    await doSubmit();
  };

  // `overrideDate`: usado pelo alerta de renovação para abrir a edição já
  // apontando para a PRÓXIMA ocorrência conflitante (nextDate calculado no
  // banner), em vez da data da última sessão gravada em `appointment.date`.
  const handleEdit = (appointment: Appointment, overrideDate?: string) => {
    const effectiveDate = overrideDate || appointment.date;
    s.setFormData({
      customerId: appointment.customerId,
      psychologistId: appointment.psychologistId,
      roomId: appointment.roomId || '',
      mode: appointment.mode,
      type: appointment.type,
      date: effectiveDate,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      procedureCode: appointment.procedureCode || '',
      customPrice: appointment.customPrice,
      customRepassAmount: appointment.customRepassAmount,
      isRecurring: appointment.isRecurring,
      recurrenceFrequency: appointment.recurrenceFrequency || RecurrenceFrequency.SEMANAL,
      isInternal: appointment.isInternal ?? false,
      internalType: appointment.internalType ?? 'SUPERVISAO',
      internalTitle: appointment.internalTitle ?? '',
      internalNotes: appointment.internalNotes ?? '',
    });
    s.setEditingId(appointment.id);
    s.setUpdateFuture(appointment.isRecurring);
    if (overrideDate) s.setDate(overrideDate);
    s.setIsModalOpen(true);
  };

  const handleDelete = async (appointment: Appointment) => {
    s.setDeleteModalAppId(appointment.id);
    s.setCancellationReason('');
    if (appointment.isRecurring && appointment.recurrenceGroupId) {
      const choice = confirm('Excluir TODOS os agendamentos FUTUROS deste grupo?\n\nOK = todos futuros | Cancelar = apenas este');
      s.setUpdateFuture(choice);
    } else {
      s.setUpdateFuture(false);
    }
  };

  const confirmDelete = async () => {
    if (!s.deleteModalAppId || !s.cancellationReason) return;
    s.setIsSaving(true);
    try {
      const appointment = s.appointments.find(a => a.id === s.deleteModalAppId);
      if (!appointment) return;
      try {
        const customer = s.customers.find(c => c.id === appointment.customerId);
        const psychologist = s.psychologists.find(p => p.id === appointment.psychologistId);
        await supabase.functions.invoke('cancel-appointment-notify', {
          body: { reason: s.cancellationReason, appointmentData: { ...appointment, customer, psychologist } },
        });
      } catch { logger.error('Erro ao notificar cancelamento'); }
      if (appointment.isRecurring && appointment.recurrenceGroupId && s.updateFuture) {
        await api.deleteFutureAppointments(appointment.recurrenceGroupId, appointment.date);
        // Exclusão de "todos os futuros" libera a vaga estruturalmente —
        // checa a Fila de Espera.
        notifyIfWaitingListMatch(appointment.psychologistId, appointment.date);
      } else {
        await api.deleteAppointment(appointment.id);
      }
      await s.loadData(s.date, true);
    } catch { alert('Erro ao excluir agendamento'); }
    finally {
      s.setIsSaving(false);
      s.setDeleteModalAppId(null);
      s.setCancellationReason('');
    }
  };

  const handleConfirm = async (id: string, type: 'patient' | 'psychologist') => {
    try {
      const app = s.appointments.find(a => a.id === id);
      if (!app) return;
      const val = type === 'patient' ? app.confirmedPatient : app.confirmedPsychologist;
      await api.updateAppointment(id, { [type === 'patient' ? 'confirmedPatient' : 'confirmedPsychologist']: !val });
      await s.loadData(s.date, true);
    } catch { alert('Erro ao confirmar'); }
  };

  const handleCancelBillingChoice = async (billingMode: 'none' | 'plan' | 'psychologist_absence') => {
    if (!s.cancellationModalAppId) return;
    s.setIsSaving(true);
    try {
      const appointment = s.appointments.find(a => a.id === s.cancellationModalAppId);
      try {
        await supabase.functions.invoke('cancel-appointment-notify', {
          body: { appointmentId: s.cancellationModalAppId, reason: s.cancellationReason },
        });
      } catch { logger.error('Erro ao notificar'); }

      if (s.cancellationScope === 'stop_treatment' && appointment) {
        // Encerramento de tratamento — RPC atômica cancela a sessão atual + todas
        // as futuras do paciente+psicólogo e registra o evento de alta.
        const { error } = await supabase.rpc('discharge_customer', {
          p_customer_id: appointment.customerId,
          p_psychologist_id: appointment.psychologistId,
          p_current_appointment_id: s.cancellationModalAppId,
        });
        if (error) throw new Error(error.message);
        // discharge_customer cancela a sessão atual + todas as futuras do
        // paciente+psicólogo (appointments) e pausa assinaturas (subscriptions).
        apiCache.invalidate('appointments');
        apiCache.invalidate('customers');
        apiCache.invalidate('subscriptions');
        // Encerramento de tratamento libera a vaga estruturalmente (nenhuma
        // sessão futura reivindica mais o horário) — checa a Fila de Espera.
        notifyIfWaitingListMatch(appointment.psychologistId, appointment.date);
      } else if (billingMode === 'psychologist_absence') {
        // Falta do psicólogo → NUNCA repassa. A cobrança depende do plano:
        // AMS/Particular isentam ('none'); demais convênios cobram ('plan'),
        // pois a autorização por sessão já foi consumida. Ver resolvePsychologistAbsenceBilling.
        const customer = s.customers.find(c => c.id === appointment?.customerId);
        const effectiveHealthPlan = appointment?.healthPlanAtTime ?? customer?.healthPlan;
        await api.updateAppointment(s.cancellationModalAppId, {
          status: AppointmentStatus.CANCELED,
          cancellationBilling: resolvePsychologistAbsenceBilling(effectiveHealthPlan),
          cancellationFault: 'psychologist',
        });

      } else {
        // Falta/cancelamento do paciente:
        //  • 'plan'  → cobra do convênio normalmente e mantém repasse ('patient').
        //  • 'none'  → "Isento": convênio é cobrado normalmente (getAppPrice trata
        //    o caso 'patient_exempt' de convênio como faturável), mas o repasse ao
        //    psicólogo é bloqueado (isRepassBlocked). Distinto de 'patient' para
        //    não colidir com a RPC discharge_customer (Alta), que também grava
        //    cancellationBilling='none' e NUNCA deve passar a cobrar o convênio.
        await api.updateAppointment(s.cancellationModalAppId, {
          status: AppointmentStatus.CANCELED,
          cancellationBilling: billingMode,
          cancellationFault: billingMode === 'none' ? 'patient_exempt' : 'patient',
        });
      }
      await s.loadData(s.date, true);
    } catch { alert('Erro ao cancelar agendamento'); }
    finally {
      s.setIsSaving(false);
      s.setCancellationModalAppId(null);
      s.setCancellationStep('reason');
      s.setCancellationReason('');
      s.setCancellationScope('single');
    }
  };

  const sendWhatsApp = (appointment: Appointment, target: 'patient' | 'psychologist') => {
    const customer = s.customers.find(c => c.id === appointment.customerId);
    const psychologist = s.psychologists.find(p => p.id === appointment.psychologistId);
    const phone = target === 'patient' ? customer?.phone : psychologist?.phone;
    if (!phone) { alert('Telefone não cadastrado'); return; }
    const name = target === 'patient' ? customer?.name : psychologist?.name;
    const message = `Olá ${name}, confirmamos seu atendimento (${appointment.mode}) no dia ${new Date(appointment.date).toLocaleDateString()} às ${appointment.startTime}. Podemos confirmar?`;
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleReminder = async (appointment: Appointment) => {
    const customer = s.customers.find(c => c.id === appointment.customerId);
    if (!customer?.phone) { alert('Paciente sem telefone cadastrado.'); return; }
    const confirmationUrl = `${window.location.origin}/#/confirmacao/${appointment.id}`;
    const message = `Olá ${customer.name}, aqui é do Núcleo Priori. Confirme sua consulta para ${new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR')} às ${appointment.startTime}.\n\n${confirmationUrl}`;
    try {
      await api.updateAppointment(appointment.id, { reminderSentAt: new Date().toISOString() });
      window.open(`https://wa.me/55${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
      await s.loadData(s.date, true);
    } catch { alert('Erro ao registrar envio do lembrete'); }
  };

  return {
    resetForm, handleCloseModal, handleSubmit, handleEdit,
    handleDelete, confirmDelete, handleConfirm, handleReschedule,
    handleCancelBillingChoice, handleAcknowledgeAmsAlert,
    sendWhatsApp, handleReminder,
  };
};
