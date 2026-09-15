import { supabase, toCustomer, toPlan, toSubscription, toPayment, throwOnError, CUSTOMER_COLUMNS } from './helpers';
import { getTodayISO } from '../../lib/dateUtils';
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

    const today = getTodayISO();
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
        name: c.name.trim().replace(/\s+/g, ' ').toUpperCase(),
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
        ams_password_expiry: c.amsPasswordExpiry || null,
        card_number: c.cardNumber || null,
        reminder_dismissed_at: c.reminderDismissedAt || null,
        reminder_justification: c.reminderJustification || null,
      }).select().single()
    );
    if (c.amsPassword) {
      await customerService.setAmsPassword(row.id, c.amsPassword);
    }
    return toCustomer(row);
  },

  updateCustomer: async (id: string, c: Partial<Customer>): Promise<Customer> => {
    const updates: Record<string, any> = {};
    if (c.name !== undefined) updates.name = c.name.trim().replace(/\s+/g, ' ').toUpperCase();
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
    if (c.amsPasswordExpiry !== undefined) updates.ams_password_expiry = c.amsPasswordExpiry || null;
    if (c.cardNumber !== undefined) updates.card_number = c.cardNumber || null;
    if (c.reminderDismissedAt !== undefined) updates.reminder_dismissed_at = c.reminderDismissedAt;
    if (c.reminderJustification !== undefined) updates.reminder_justification = c.reminderJustification;

    // Senha AMS: "em branco" significa "não alterar" (o campo nunca é
    // pré-preenchido com o valor real neste formulário genérico — ver a
    // tela dedicada "Senhas AMS / PAE" para consultar/revelar o valor).
    if (c.amsPassword) {
      await customerService.setAmsPassword(id, c.amsPassword);
    }

    const row = await throwOnError(
      supabase.from('customers').update(updates).eq('id', id).select().single()
    );
    return toCustomer(row);
  },

  // Transação atômica: inativa o paciente, cancela consultas futuras, registra
  // evento de alta e pausa assinaturas em uma única chamada (RPC
  // `inactivate_customer`, 20260716_inactivate_customer_rpc.sql). Se qualquer
  // etapa falhar, o Postgres reverte todas as anteriores — nunca deixa um
  // paciente inativo com agenda/assinatura ainda ativa.
  inactivateCustomer: async (customerId: string, reason: string): Promise<void> => {
    const { error } = await supabase.rpc('inactivate_customer', {
      p_customer_id: customerId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
  },

  // Correção retroativa do plano de saúde nos atendimentos não faturados do
  // paciente (RPC `apply_customer_health_plan_retro`,
  // 20260915_audit_operation_grouping_customers.sql). Substitui o antigo
  // padrão de 2 consultas + filtro em JS + update direto do navegador —
  // agora tudo roda numa única transação, já marcada com operation_id para
  // agrupamento na Auditoria Financeira.
  applyCustomerHealthPlanRetro: async (params: {
    customerId: string;
    healthPlan: string;
    futureOnly?: boolean;
    operationId?: string;
  }): Promise<{ updatedCount: number; blockedCount: number }> => {
    const { data, error } = await supabase.rpc('apply_customer_health_plan_retro', {
      p_customer_id: params.customerId,
      p_health_plan: params.healthPlan,
      p_future_only: params.futureOnly ?? false,
      p_today: getTodayISO(),
      p_operation_id: params.operationId ?? null,
    });
    if (error) throw new Error(error.message);
    return { updatedCount: data?.updated_count ?? 0, blockedCount: data?.blocked_count ?? 0 };
  },

  // Propaga o preço customizado para os atendimentos não faturados do
  // paciente (RPC `apply_customer_price_propagation`, mesma migration acima).
  applyCustomerPricePropagation: async (params: {
    customerId: string;
    customPrice: number;
    operationId?: string;
  }): Promise<{ updatedCount: number }> => {
    const { data, error } = await supabase.rpc('apply_customer_price_propagation', {
      p_customer_id: params.customerId,
      p_custom_price: params.customPrice,
      p_operation_id: params.operationId ?? null,
    });
    if (error) throw new Error(error.message);
    return { updatedCount: data?.updated_count ?? 0 };
  },

  // ── Senha AMS/PAE (tabela dedicada, leitura restrita a staff via RLS) ───────
  getAllAmsPasswords: async (): Promise<Record<string, string>> => {
    const { data, error } = await supabase.from('customer_ams_credentials').select('customer_id, ams_password');
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.ams_password) map[row.customer_id] = row.ams_password;
    }
    return map;
  },

  setAmsPassword: async (customerId: string, amsPassword: string): Promise<void> => {
    const { error } = await supabase
      .from('customer_ams_credentials')
      .upsert({ customer_id: customerId, ams_password: amsPassword, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  },

  deleteCustomer: async (id: string): Promise<void> => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Plans ──────────────────────────────────────────────────────────────────
  getPlans: async (): Promise<Plan[]> => {
    const { data, error } = await supabase.from('plans').select('id, name, procedures, active, created_at').order('name');
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

  bulkAdjustPlanPrices: async (params: {
    planIds: string[];
    amount: number;
    adjustPrice: boolean;
    adjustRepass: boolean;
    effectiveDate: string;
    minPrice?: number;
    operationId?: string;
  }): Promise<{ plansUpdated: number; appointmentsUpdated: number; clampedCount: number }> => {
    const { data, error } = await supabase.rpc('bulk_adjust_plan_prices', {
      p_plan_ids: params.planIds,
      p_amount: params.amount,
      p_adjust_price: params.adjustPrice,
      p_adjust_repass: params.adjustRepass,
      p_effective_date: params.effectiveDate,
      p_min_price: params.minPrice ?? 0,
      p_operation_id: params.operationId ?? null,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      plansUpdated: row?.plans_updated ?? 0,
      appointmentsUpdated: row?.appointments_updated ?? 0,
      clampedCount: row?.clamped_count ?? 0,
    };
  },

  deletePlan: async (id: string): Promise<void> => {
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Subscriptions ──────────────────────────────────────────────────────────
  getSubscriptions: async (): Promise<Subscription[]> => {
    const { data, error } = await supabase.from('subscriptions').select('id, customer_id, plan_id, start_date, next_renewal, status, created_at').order('created_at');
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
    const { data, error } = await supabase.from('payments').select('id, subscription_id, amount, repass_amount, paid_at, created_at').order('paid_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPayment);
  },

  // Insere o pagamento E avança `next_renewal`/`status` da assinatura em uma
  // única transação no banco (RPC `register_subscription_payment`), para
  // nunca deixar um pagamento registrado sem a assinatura renovada.
  createPayment: async (p: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> => {
    const { data, error } = await supabase.rpc('register_subscription_payment', {
      p_subscription_id: p.subscriptionId,
      p_amount: p.amount,
      p_repass_amount: p.repassAmount,
      p_paid_at: p.paidAt,
    });
    if (error) throw new Error(error.message);
    return toPayment(data);
  },

  listPaymentsBySubscription: async (subscriptionId: string): Promise<Payment[]> => {
    const { data, error } = await supabase
      .from('payments').select('id, subscription_id, amount, repass_amount, paid_at, created_at')
      .eq('subscription_id', subscriptionId)
      .order('paid_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPayment);
  },
};
