// Métodos de leitura e exclusão de agendamentos
import { supabase, toAppointment, APPOINTMENT_COLUMNS } from './helpers';
import { Appointment } from '../types';

export const appointmentReadService = {
  getAppointments: async (date?: string): Promise<Appointment[]> => {
    let query = supabase.from('appointments').select(APPOINTMENT_COLUMNS);

    if (date) {
      query = query.eq('date', date);
    } else {
      const pad = (n: number) => String(n).padStart(2, '0');
      const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const future = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
      query = query
        .gte('date', toLocal(past))
        .lte('date', toLocal(future));
    }

    query = (query as any).order('date').order('start_time').limit(10000);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAppointment);
  },

  getAppointmentsForBilling: async (): Promise<Appointment[]> => {
    // Usa componentes LOCAIS (não UTC) — Supabase armazena DATE sem timezone,
    // e o app cria datas com horário local. Misturar UTC aqui causa off-by-one.
    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const now   = new Date();
    const today = toLocal(now);

    // 6 meses atrás — aritmética explícita no nível de ano/mês
    // evita o bug de setMonth() com overflow de dia (ex: 31/mar - 1 mês ≠ 31/fev).
    // Usa dia 01 do mês-alvo para nunca ter overflow e cobrir o mês inteiro.
    let targetYear  = now.getFullYear();
    let targetMonth = now.getMonth() - 6; // 0-indexed, pode ser negativo
    if (targetMonth < 0) {
      targetMonth += 12;
      targetYear  -= 1;
    }
    const minDate = `${targetYear}-${pad(targetMonth + 1)}-01`;

    const [unbilledResult, billedResult] = await Promise.all([
      supabase
        .from('appointments')
        .select(APPOINTMENT_COLUMNS)
        .is('billing_batch_id', null)
        .gte('date', minDate)
        .lte('date', today)
        .order('date', { ascending: false })
        .limit(10000),
      supabase
        .from('appointments')
        .select(APPOINTMENT_COLUMNS)
        .not('billing_batch_id', 'is', null)
        .gte('date', minDate)
        .order('date', { ascending: false })
        .limit(10000),
    ]);

    if (unbilledResult.error) throw new Error(unbilledResult.error.message);
    if (billedResult.error) throw new Error(billedResult.error.message);

    const seen = new Set<string>();
    const combined = [...((unbilledResult.data as any[]) || []), ...((billedResult.data as any[]) || [])].filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    return combined.map(toAppointment);
  },

  getAppointmentsByRange: async (startDate: string, endDate: string): Promise<Appointment[]> => {
    const { data, error } = await supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('start_time')
      .limit(10000);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAppointment);
  },

  getAppointmentsByCustomer: async (customerId: string): Promise<Appointment[]> => {
    const { data, error } = await supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .eq('customer_id', customerId)
      .order('date', { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAppointment);
  },

  getAppointmentsNeedingRenewal: async (): Promise<Appointment[]> => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .eq('needs_renewal', true)
      .in('status', ['active', 'canceled'])
      .gte('date', sixtyDaysAgo)
      .order('date');
    if (error) throw new Error(error.message);

    const candidates = (data ?? []).map(toAppointment);
    if (candidates.length === 0) return [];

    const customerIds = [...new Set(candidates.map(a => a.customerId).filter(Boolean))];
    const minDate = candidates.reduce((min, a) => a.date < min ? a.date : min, candidates[0].date);

    const { data: futureApps, error: futureError } = await supabase
      .from('appointments')
      .select('id, customer_id, psychologist_id, start_time, date')
      .in('customer_id', customerIds as string[])
      .eq('status', 'active')
      .gte('date', minDate);

    if (futureError) throw new Error(futureError.message);

    const validCandidates: Appointment[] = [];
    const toAutoFix: string[] = [];

    for (const app of candidates) {
      if (!app.customerId) continue;
      const hasFuture = (futureApps ?? []).some(
        fa => fa.customer_id === app.customerId &&
              fa.psychologist_id === app.psychologistId &&
              fa.start_time === app.startTime &&
              fa.date > app.date
      );
      if (hasFuture) toAutoFix.push(app.id);
      else validCandidates.push(app);
    }

    if (toAutoFix.length > 0) {
      await supabase.from('appointments').update({ needs_renewal: false }).in('id', toAutoFix);
    }

    return validCandidates;
  },

  deleteAppointment: async (id: string): Promise<void> => {
    const { error } = await supabase.from('appointments').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  deleteFutureAppointments: async (groupId: string, fromDate: string): Promise<void> => {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('recurrence_group_id', groupId)
      .gte('date', fromDate);
    if (error) throw new Error(error.message);
  },
};
