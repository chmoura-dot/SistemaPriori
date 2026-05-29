// Métodos de leitura e exclusão de agendamentos
import { supabase, toAppointment } from './helpers';
import { Appointment } from '../types';

export const appointmentReadService = {
  getAppointments: async (date?: string): Promise<Appointment[]> => {
    let query = supabase.from('appointments').select('*');

    if (date) {
      query = query.eq('date', date);
    } else {
      const today = new Date();
      const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const future = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
      query = query
        .gte('date', past.toISOString().split('T')[0])
        .lte('date', future.toISOString().split('T')[0]);
    }

    query = (query as any).order('date').order('start_time').limit(10000);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAppointment);
  },

  getAppointmentsForBilling: async (): Promise<Appointment[]> => {
    const today = new Date().toISOString().split('T')[0];

    // Limita a janela de busca a 3 meses atrás para garantir que os atendimentos
    // do mês corrente não sejam cortados pelo limite de registros.
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const minDate = threeMonthsAgo.toISOString().split('T')[0];

    const [unbilledResult, billedResult] = await Promise.all([
      supabase
        .from('appointments')
        .select('*')
        .is('billing_batch_id', null)
        .gte('date', minDate)
        .lte('date', today)
        .order('date', { ascending: false })
        .limit(5000),
      supabase
        .from('appointments')
        .select('*')
        .not('billing_batch_id', 'is', null)
        .gte('date', minDate)
        .order('date', { ascending: false })
        .limit(5000),
    ]);

    if (unbilledResult.error) throw new Error(unbilledResult.error.message);
    if (billedResult.error) throw new Error(billedResult.error.message);

    const seen = new Set<string>();
    const combined = [...(unbilledResult.data || []), ...(billedResult.data || [])].filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    return combined.map(toAppointment);
  },

  getAppointmentsByRange: async (startDate: string, endDate: string): Promise<Appointment[]> => {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
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
      .select('*')
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
      .select('*')
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
