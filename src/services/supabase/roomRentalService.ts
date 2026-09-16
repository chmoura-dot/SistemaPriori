// Sublocação de sala: psicólogo reserva a sala e paga a clínica (fluxo
// inverso ao repasse). Entidade própria — ver room_rentals nas migrations
// 20260916c/d/e.
import { supabase, toRoomRental, generateUUID, ROOM_RENTAL_COLUMNS } from './helpers';
import { RoomRental, RecurrenceFrequency } from '../types';

function buildRecurringRentalRows(
  date: string,
  startTime: string,
  endTime: string,
  frequency: RecurrenceFrequency,
): Array<{ date: string; start_time: string; end_time: string }> {
  const [startYear, startMonth, startDay] = date.split('-').map(Number);
  const intervalDays = frequency === RecurrenceFrequency.QUINZENAL ? 14 : 7;

  // Mesma regra de corte de buildRecurringRows (appointmentWriteService.ts):
  // último dia do mês seguinte ao mês de início.
  const endMonth = startMonth === 12 ? 1 : startMonth + 1;
  const endYear = startMonth === 12 ? startYear + 1 : startYear;
  const endDate = new Date(endYear, endMonth, 0);

  const rows: Array<{ date: string; start_time: string; end_time: string }> = [];
  let i = 0;
  while (i < 52) { // safety cap
    const currentDate = new Date(startYear, startMonth - 1, startDay + i * intervalDays);
    if (currentDate > endDate) break;

    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getDate()).padStart(2, '0');
    rows.push({ date: `${y}-${m}-${d}`, start_time: startTime, end_time: endTime });
    i++;
  }

  return rows;
}

export const roomRentalService = {
  getRoomRentals: async (): Promise<RoomRental[]> => {
    const { data, error } = await supabase
      .from('room_rentals').select(ROOM_RENTAL_COLUMNS).order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRoomRental);
  },

  getRoomRentalsByRange: async (startDate: string, endDate: string): Promise<RoomRental[]> => {
    const { data, error } = await supabase
      .from('room_rentals')
      .select(ROOM_RENTAL_COLUMNS)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRoomRental);
  },

  createRoomRental: async (params: {
    roomId: string;
    psychologistId: string;
    date: string;
    startTime: string;
    endTime: string;
    amount: number;
    isRecurring: boolean;
    recurrenceFrequency?: RecurrenceFrequency;
    notes?: string;
    operationId?: string;
  }): Promise<{ createdIds: string[]; recurrenceGroupId?: string }> => {
    const groupId = params.isRecurring ? generateUUID() : undefined;
    const rows = params.isRecurring
      ? buildRecurringRentalRows(params.date, params.startTime, params.endTime, params.recurrenceFrequency ?? RecurrenceFrequency.SEMANAL)
      : [{ date: params.date, start_time: params.startTime, end_time: params.endTime }];

    const { data, error } = await supabase.rpc('create_room_rental', {
      p_room_id: params.roomId,
      p_psychologist_id: params.psychologistId,
      p_rows: rows,
      p_amount: params.amount,
      p_is_recurring: params.isRecurring,
      p_recurrence_frequency: params.isRecurring ? (params.recurrenceFrequency ?? RecurrenceFrequency.SEMANAL) : null,
      p_recurrence_group_id: groupId ?? null,
      p_notes: params.notes ?? null,
      p_operation_id: params.operationId ?? null,
    });

    if (error) throw new Error(error.message);

    return { createdIds: data?.created_ids ?? [], recurrenceGroupId: groupId };
  },

  cancelRoomRental: async (id: string, reason: string): Promise<void> => {
    const { error } = await supabase
      .from('room_rentals')
      .update({ status: 'canceled', cancellation_reason: reason })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  cancelFutureRoomRentals: async (groupId: string, fromDate: string, reason: string, operationId?: string): Promise<void> => {
    const { error } = await supabase.rpc('cancel_future_room_rentals', {
      p_recurrence_group_id: groupId,
      p_from_date: fromDate,
      p_reason: reason,
      p_operation_id: operationId ?? null,
    });
    if (error) throw new Error(error.message);
  },

  markRoomRentalsPaid: async (ids: string[], paidAt: string, operationId?: string): Promise<void> => {
    const { error } = await supabase.rpc('mark_room_rentals_paid', {
      p_ids: ids,
      p_paid_at: paidAt,
      p_operation_id: operationId ?? null,
    });
    if (error) throw new Error(error.message);
  },
};
