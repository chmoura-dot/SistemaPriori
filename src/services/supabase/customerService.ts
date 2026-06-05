import { supabase, toCustomer, toPlan, toSubscription, toPayment, throwOnError, CUSTOMER_COLUMNS } from './helpers';
import { Customer, Plan, Subscription, Payment } from '../types';

export const customerService = {
  getCustomers: async (): Promise<Customer[]> => {
    const { data: customersData, error: customersError } = await supabase
      .from('customers').select(CUSTOMER_COLUMNS).order('name');
    if (customersError) throw new Error(customersError.message);
    if (!customersData) return [];

    const { data: appData, error: appError } = await supabase
      .from('appointments')
      .select('customer_id, date, status')
      .in('status', ['active']);
    if (appError) throw new Error(appError.message);

    const today = new Date().toISOString().split('T')[0];
    const appsByCustomer = new Map<string, { customer_id: string; date: string; status: string }[]>();
    for (const app of (appData || [])) {
      const list = appsByCustomer.get(app.customer_id);
      if (list) list.push(app);
      else appsByCustomer.set(app.customer_id, [app]);
    }

    return customersData.map(row => {
      const customer = toCustomer(row);
      const customerApps = appsByCustomer.get(customer.id) ?? [];
      const pastApps = customerApps.filter(a => a.date && a.date < today).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const futureApps = customerApps.filter(a => a.date && a.date >= today).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const allSorted = [...customerApps].filter(a => a.date).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      customer.totalAppointmentsPerformed = pastApps.length;
      customer.lastAppointmentDate = pastApps[0]?.date;
      customer.nextAppointmentDate = futureApps[0]?.date;
      customer.firstAppointmentDate = allSorted[0]?.date;
      return customer;
    });
  },

  createCustomer: async (c: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> => {
    const row = await throwOnError(
      supabase.from('customers').insert({
        name: c.name.toUpperCase(),
        email: c.email,
        phone: c.phone,
        health_plan: c.healthPlan,
        psychologist_id: c.psychologistId,
        status: c.status,
        inactivation_reason: c.inactivationReason ?? null,
        notes: c.notes ?? null,
        custom_price: c.customPrice ?? null,
        custom_repass_amount: c.customRepassAmount ?? null,
        birth_date: c.birthDate || null,
        gender: c.gender ?? null,
        ams_password: c.amsPassword || null,
        ams_password_expiry: c.amsPasswordExpiry || null,
      }).select().single()
    );
    return toCustomer(row);
  },

  updateCustomer: async (id: string, c: Partial<Customer>): Promise<Customer> => {
    const updates: Record<string, any> = {};
    if (c.name !== undefined) updates.name = c.name.toUpperCase();
    if (c.email !== undefined) updates.email = c.email;
    if (c.phone !== undefined) updates.phone = c.phone;
    if (c.healthPlan !== undefined) updates.health_plan = c.healthPlan;
    if (c.psychologistId !== undefined) updates.psychologist_id = c.psychologistId;
    if (c.status !== undefined) updates.status = c.status;
    if (c.inactivationReason !== undefined) updates.inactivation_reason = c.inactivationReason;
    if (c.notes !== undefined) updates.notes = c.notes;
    if (c.customPrice !== undefined) updates.custom_price = c.customPrice;
    if (c.customRepassAmount !== undefined) updates.custom_repass_amount = c.customRepassAmount;
    if (c.birthDate !== undefined) updates.birth_date = c.birthDate || null;
    if (c.gender !== undefined) updates.gender = c.gender;
    if (c.amsPassword !== undefined) updates.ams_password = c.amsPassword;
    if (c.amsPasswordExpiry !== undefined) updates.ams_password_expiry = c.amsPasswordExpiry || null;

    const row = await throwOnError(
      supabase.from('customers').update(updates).eq('id', id).select().single()
    );
    return toCustomer(row);
  },

  deleteCustomer: async (id: string): Promise<void> => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Plans ──────────────────────────────────────────────────────────────────
  getPlans: async (): Promise<Plan[]> => {
    const { data, error } = await supabase.from('plans').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPlan);
  },

  createPlan: async (p: Omit<Plan, 'id' | 'createdAt'>): Promise<Plan> => {
    const row = await throwOnError(
      supabase.from('plans').insert({ name: p.name, procedures: p.procedures, active: p.active }).select().single()
    );
    return toPlan(row);
  },

  updatePlan: async (id: string, p: Partial<Plan>): Promise<Plan> => {
    const updates: Record<string, any> = {};
    if (p.name !== undefined) updates.name = p.name;
    if (p.procedures !== undefined) updates.procedures = p.procedures;
    if (p.active !== undefined) updates.active = p.active;
    const row = await throwOnError(supabase.from('plans').update(updates).eq('id', id).select().single());
    return toPlan(row);
  },

  deletePlan: async (id: string): Promise<void> => {
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Subscriptions ──────────────────────────────────────────────────────────
  getSubscriptions: async (): Promise<Subscription[]> => {
    const { data, error } = await supabase.from('subscriptions').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toSubscription);
  },

  createSubscription: async (s: Omit<Subscription, 'id' | 'createdAt'>): Promise<Subscription> => {
    const row = await throwOnError(
      supabase.from('subscriptions').insert({
        customer_id: s.customerId,
        plan_id: s.planId,
        start_date: s.startDate,
        next_renewal: s.nextRenewal,
        status: s.status,
      }).select().single()
    );
    return toSubscription(row);
  },

  updateSubscription: async (id: string, s: Partial<Subscription>): Promise<Subscription> => {
    const updates: Record<string, any> = {};
    if (s.customerId !== undefined) updates.customer_id = s.customerId;
    if (s.planId !== undefined) updates.plan_id = s.planId;
    if (s.startDate !== undefined) updates.start_date = s.startDate;
    if (s.nextRenewal !== undefined) updates.next_renewal = s.nextRenewal;
    if (s.status !== undefined) updates.status = s.status;
    const row = await throwOnError(supabase.from('subscriptions').update(updates).eq('id', id).select().single());
    return toSubscription(row);
  },

  deleteSubscription: async (id: string): Promise<void> => {
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Payments ───────────────────────────────────────────────────────────────
  getPayments: async (): Promise<Payment[]> => {
    const { data, error } = await supabase.from('payments').select('*').order('paid_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPayment);
  },

  createPayment: async (p: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> => {
    const row = await throwOnError(
      supabase.from('payments').insert({
        subscription_id: p.subscriptionId,
        amount: p.amount,
        repass_amount: p.repassAmount,
        paid_at: p.paidAt,
      }).select().single()
    );
    return toPayment(row);
  },

  listPaymentsBySubscription: async (subscriptionId: string): Promise<Payment[]> => {
    const { data, error } = await supabase
      .from('payments').select('*')
      .eq('subscription_id', subscriptionId)
      .order('paid_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPayment);
  },
};
