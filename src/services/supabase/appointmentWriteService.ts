// Métodos de criação e atualização de agendamentos
import { supabase, toAppointment, generateUUID } from './helpers';
import { Appointment, RecurrenceFrequency } from '../types';

type AppointmentInput = Omit<Appointment, 'id' | 'createdAt' | 'confirmedPatient' | 'confirmedPsychologist'>;

function buildRecurringRows(a: AppointmentInput, groupId: string): any[] {
  const [startYear, startMonth, startDay] = a.date.split('-').map(Number);
  const intervalDays = a.recurrenceFrequency === RecurrenceFrequency.QUINZENAL ? 14 : 7;
  const rows = [];

  for (let i = 0; i < 4; i++) {
    const currentDate = new Date(startYear, startMonth - 1, startDay + i * intervalDays);
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const dateObj = new Date(dateStr + 'T12:00:00');

    rows.push({
      customer_id: a.isInternal ? null : (a.customerId || null),
      psychologist_id: a.psychologistId,
      room_id: a.roomId ?? null,
      mode: a.mode,
      type: a.type,
      procedure_code: a.procedureCode ?? null,
      date: dateStr,
      day_of_week: dateObj.getDay(),
      start_time: a.startTime,
      end_time: a.endTime,
      status: a.status || 'active',
      is_recurring: true,
      recurrence_frequency: a.recurrenceFrequency ?? RecurrenceFrequency.SEMANAL,
      recurrence_group_id: groupId,
      needs_renewal: i === 3,
      custom_price: a.customPrice ?? null,
      custom_repass_amount: a.customRepassAmount ?? null,
      billing_batch_id: a.billingBatchId ?? null,
      billing_status: a.billingStatus ?? null,
      denial_reason: a.denialReason ?? null,
      denial_resolution: a.denialResolution ?? null,
      confirmation_status: 'pending',
      cancellation_billing: a.cancellationBilling ?? null,
      is_internal: a.isInternal ?? false,
      internal_type: a.isInternal ? (a.internalType ?? null) : null,
      internal_title: a.isInternal ? (a.internalTitle ?? null) : null,
      internal_notes: a.isInternal ? (a.internalNotes ?? null) : null,
    });
  }
  return rows;
}

function getTodayISO(): string {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .split('/').reverse().join('-');
}

export const appointmentWriteService = {
  createAppointment: async (a: AppointmentInput): Promise<Appointment> => {
    if (a.isRecurring) {
      const groupId = generateUUID();
      const appointmentsToInsert = buildRecurringRows(a, groupId);

      const allDates = appointmentsToInsert.map(r => r.date);
      const { data: existingApps } = await supabase
        .from('appointments')
        .select('date, start_time, end_time')
        .eq('psychologist_id', a.psychologistId)
        .in('date', allDates)
        .neq('status', 'canceled');

      for (const row of appointmentsToInsert) {
        const hasConflict = (existingApps || []).some(c =>
          c.date === row.date && (
            (c.start_time >= row.start_time && c.start_time < row.end_time) ||
            (c.end_time > row.start_time && c.end_time <= row.end_time) ||
            (c.start_time <= row.start_time && c.end_time >= row.end_time)
          )
        );
        if (hasConflict) {
          throw new Error(`O psicólogo selecionado já possui um agendamento na data ${row.date} neste horário.`);
        }
      }

      const { data, error } = await supabase.from('appointments').insert(appointmentsToInsert).select();
      if (error) {
        if (error.code === 'P0001' || error.message.includes('conflitante') || error.code === '23505') {
          throw new Error('O psicólogo selecionado já possui um agendamento neste horário.');
        }
        throw new Error(error.message);
      }
      if (!data || data.length === 0) throw new Error('Falha ao criar agendamentos');

      const firstApp = data[0];
      if (firstApp.date === getTodayISO()) {
        supabase.functions.invoke('agenda-change-notify', {
          body: { appointmentId: firstApp.id, changeType: 'new' }
        }).catch((e: any) => console.warn('[AgendaChangeNotify]', e));
      }

      return toAppointment(data[0]);
    } else {
      const { data: conflicts } = await supabase
        .from('appointments')
        .select('id')
        .eq('psychologist_id', a.psychologistId)
        .eq('date', a.date)
        .neq('status', 'canceled')
        .or(`and(start_time.gte.${a.startTime},start_time.lt.${a.endTime}),and(end_time.gt.${a.startTime},end_time.lte.${a.endTime}),and(start_time.lte.${a.startTime},end_time.gte.${a.endTime})`)
        .limit(1);

      if (conflicts && conflicts.length > 0) {
        throw new Error('O psicólogo selecionado já possui um agendamento neste horário.');
      }

      const dateObj = new Date(a.date + 'T12:00:00');
      const { data, error } = await supabase.from('appointments').insert({
        customer_id: a.isInternal ? null : (a.customerId || null),
        psychologist_id: a.psychologistId,
        room_id: a.roomId ?? null,
        mode: a.mode,
        type: a.type,
        procedure_code: a.procedureCode ?? null,
        date: a.date,
        day_of_week: dateObj.getDay(),
        start_time: a.startTime,
        end_time: a.endTime,
        status: a.status || 'active',
        is_recurring: false,
        needs_renewal: false,
        custom_price: a.customPrice ?? null,
        custom_repass_amount: a.customRepassAmount ?? null,
        billing_batch_id: a.billingBatchId ?? null,
        billing_status: a.billingStatus ?? null,
        denial_reason: a.denialReason ?? null,
        denial_resolution: a.denialResolution ?? null,
        confirmation_status: 'pending',
        cancellation_billing: a.cancellationBilling ?? null,
        is_internal: a.isInternal ?? false,
        internal_type: a.isInternal ? (a.internalType ?? null) : null,
        internal_title: a.isInternal ? (a.internalTitle ?? null) : null,
        internal_notes: a.isInternal ? (a.internalNotes ?? null) : null,
      }).select().single();

      if (error) {
        if (error.code === 'P0001' || error.message.includes('conflitante') || error.code === '23505') {
          throw new Error('O psicólogo selecionado já possui um agendamento neste horário.');
        }
        throw new Error(error.message);
      }
      if (!data) throw new Error('No data returned from Supabase');

      if (data.date === getTodayISO()) {
        supabase.functions.invoke('agenda-change-notify', {
          body: { appointmentId: data.id, changeType: 'new' }
        }).catch((e: any) => console.warn('[AgendaChangeNotify]', e));
      }

      return toAppointment(data);
    }
  },

  updateAppointment: async (id: string, a: Partial<Appointment>): Promise<Appointment> => {
    const updates: Record<string, any> = {};
    if (a.customerId !== undefined) updates.customer_id = a.customerId;
    if (a.psychologistId !== undefined) updates.psychologist_id = a.psychologistId;
    if (a.roomId !== undefined) updates.room_id = a.roomId;
    if (a.mode !== undefined) updates.mode = a.mode;
    if (a.type !== undefined) updates.type = a.type;
    if (a.procedureCode !== undefined) updates.procedure_code = a.procedureCode;
    if (a.date !== undefined) updates.date = a.date;
    if (a.dayOfWeek !== undefined) updates.day_of_week = a.dayOfWeek;
    if (a.startTime !== undefined) updates.start_time = a.startTime;
    if (a.endTime !== undefined) updates.end_time = a.endTime;
    if (a.status !== undefined) updates.status = a.status;
    if (a.confirmedPatient !== undefined) updates.confirmed_patient = a.confirmedPatient;
    if (a.confirmedPsychologist !== undefined) updates.confirmed_psychologist = a.confirmedPsychologist;
    if (a.confirmationStatus !== undefined) updates.confirmation_status = a.confirmationStatus;
    if (a.reminderSentAt !== undefined) updates.reminder_sent_at = a.reminderSentAt;
    if (a.patientNotes !== undefined) updates.patient_notes = a.patientNotes;
    if (a.isRecurring !== undefined) updates.is_recurring = a.isRecurring;
    if (a.recurrenceFrequency !== undefined) updates.recurrence_frequency = a.recurrenceFrequency;
    if (a.recurrenceGroupId !== undefined) updates.recurrence_group_id = a.recurrenceGroupId;
    if (a.needsRenewal !== undefined) updates.needs_renewal = a.needsRenewal;
    if (a.customPrice !== undefined) updates.custom_price = a.customPrice;
    if (a.customRepassAmount !== undefined) updates.custom_repass_amount = a.customRepassAmount;
    if (a.billingBatchId !== undefined) updates.billing_batch_id = a.billingBatchId;
    if (a.billingStatus !== undefined) updates.billing_status = a.billingStatus;
    if (a.billingIgnored !== undefined) updates.billing_ignored = a.billingIgnored;
    if (a.denialReason !== undefined) updates.denial_reason = a.denialReason;
    if (a.denialResolution !== undefined) updates.denial_resolution = a.denialResolution;
    if (a.cancellationBilling !== undefined) updates.cancellation_billing = a.cancellationBilling;
    if (a.isInternal !== undefined) {
      updates.is_internal = a.isInternal;
      if (a.isInternal) updates.customer_id = null;
    }
    if (a.internalType !== undefined) updates.internal_type = a.internalType;
    if (a.internalTitle !== undefined) updates.internal_title = a.internalTitle;
    if (a.internalNotes !== undefined) updates.internal_notes = a.internalNotes;

    const { data, error } = await supabase.from('appointments').update(updates).eq('id', id).select().single();

    if (error) {
      if (error.code === 'P0001' || error.message.includes('conflitante') || error.code === '23505') {
        throw new Error('O psicólogo selecionado já possui um agendamento neste horário.');
      }
      throw new Error(error.message);
    }
    if (!data) throw new Error('No data returned from Supabase');

    const relevantFields = ['date', 'start_time', 'end_time', 'status', 'customer_id', 'room_id'];
    const hasRelevantChange = relevantFields.some(f => updates[f] !== undefined);
    if (hasRelevantChange && data.date === getTodayISO()) {
      supabase.functions.invoke('agenda-change-notify', {
        body: { appointmentId: data.id, changeType: 'updated' }
      }).catch((e: any) => console.warn('[AgendaChangeNotify]', e));
    }

    return toAppointment(data);
  },
};
