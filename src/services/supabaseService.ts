import { supabase } from '../lib/supabase';
import {
  AppService,
  Appointment,
  BillingBatch,
  Customer,
  Expense,
  Payment,
  Plan,
  Psychologist,
  Room,
  Subscription,
  User,
  UserRole,
} from './types';

// ──────────────────────────────────────────────────────────
// Helpers: convert snake_case DB rows → camelCase app types
// ──────────────────────────────────────────────────────────

function toPsychologist(row: any): Psychologist {
  return {
    id: row.id,
    name: row.name,
    specialties: row.specialties ?? [],
    phone: row.phone ?? '',
    active: row.active,
    availability: row.availability ?? [],
  };
}

function toRoom(row: any): Room {
  return { id: row.id, name: row.name, active: row.active };
}

function toCustomer(row: any): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    healthPlan: row.health_plan,
    psychologistId: row.psychologist_id,
    status: row.status,
    notes: row.notes,
    customPrice: row.custom_price ?? undefined,
    customRepassAmount: row.custom_repass_amount ?? undefined,
    createdAt: row.created_at,
  };
}

function toAppointment(row: any): Appointment {
  return {
    id: row.id,
    customerId: row.customer_id,
    psychologistId: row.psychologist_id,
    roomId: row.room_id ?? undefined,
    mode: row.mode,
    type: row.type,
    date: row.date,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    confirmedPatient: row.confirmed_patient,
    confirmedPsychologist: row.confirmed_psychologist,
    confirmationStatus: row.confirmation_status ?? 'pending',
    reminderSentAt: row.reminder_sent_at ?? undefined,
    patientNotes: row.patient_notes ?? undefined,
    isRecurring: row.is_recurring,
    recurrenceGroupId: row.recurrence_group_id ?? undefined,
    needsRenewal: row.needs_renewal ?? false,
    customPrice: row.custom_price ?? undefined,
    customRepassAmount: row.custom_repass_amount ?? undefined,
    billingBatchId: row.billing_batch_id ?? undefined,
    billingStatus: row.billing_status ?? undefined,
    denialReason: row.denial_reason ?? undefined,
    denialResolution: row.denial_resolution ?? undefined,
    createdAt: row.created_at,
  };
}

function toBillingBatch(row: any): BillingBatch {
  return {
    id: row.id,
    batchNumber: row.batch_number,
    sentAt: row.sent_at,
    paidAt: row.paid_at ?? undefined,
    status: row.status,
    healthPlan: row.health_plan,
    totalAmount: row.total_amount,
    appointmentIds: row.appointment_ids ?? [],
    createdAt: row.created_at,
  };
}

function toPlan(row: any): Plan {
  return {
    id: row.id,
    name: row.name,
    procedures: row.procedures ?? [],
    active: row.active,
    createdAt: row.created_at,
  };
}

function toSubscription(row: any): Subscription {
  return {
    id: row.id,
    customerId: row.customer_id,
    planId: row.plan_id,
    startDate: row.start_date,
    nextRenewal: row.next_renewal,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toPayment(row: any): Payment {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    amount: row.amount,
    repassAmount: row.repass_amount,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

function toExpense(row: any): Expense {
  return {
    id: row.id,
    description: row.description,
    amount: row.amount,
    category: row.category,
    date: row.date,
    isRecurring: row.is_recurring,
    createdAt: row.created_at,
  };
}

async function throwOnError<T>(promise: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('No data returned from Supabase');
  return data;
}

// ──────────────────────────────────────────────────────────
// In-memory auth state (Supabase Auth not required here)
// ──────────────────────────────────────────────────────────
let currentUser: User | null = null;

// ──────────────────────────────────────────────────────────
// Service implementation
// ──────────────────────────────────────────────────────────
export const supabaseService: AppService = {
  // ── Auth ──────────────────────────────────────────────
  login: async (email: string, password: string) => {
    // Simple credential check against app_users table
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) return null;

    // NOTE: In production, use Supabase Auth with real passwords.
    // For now, any password works for existing users.
    currentUser = { email: data.email, role: data.role as UserRole };
    localStorage.setItem('nucleo_user', JSON.stringify(currentUser));
    return currentUser;
  },

  logout: () => {
    currentUser = null;
    localStorage.removeItem('nucleo_user');
  },

  isAuthenticated: () => {
    if (currentUser) return true;
    const stored = localStorage.getItem('nucleo_user');
    if (stored) {
      currentUser = JSON.parse(stored);
      return true;
    }
    return false;
  },

  getCurrentUser: () => {
    if (currentUser) return currentUser;
    const stored = localStorage.getItem('nucleo_user');
    if (stored) {
      currentUser = JSON.parse(stored);
      return currentUser;
    }
    return null;
  },

  // ── Psychologists ─────────────────────────────────────
  getPsychologists: async () => {
    const { data, error } = await supabase.from('psychologists').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPsychologist);
  },

  createPsychologist: async (p) => {
    const row = await throwOnError(
      supabase
        .from('psychologists')
        .insert({
          name: p.name,
          specialties: p.specialties,
          phone: p.phone,
          active: p.active,
          availability: p.availability,
        })
        .select()
        .single()
    );
    return toPsychologist(row);
  },

  updatePsychologist: async (id, p) => {
    const updates: Record<string, any> = {};
    if (p.name !== undefined) updates.name = p.name;
    if (p.specialties !== undefined) updates.specialties = p.specialties;
    if (p.phone !== undefined) updates.phone = p.phone;
    if (p.active !== undefined) updates.active = p.active;
    if (p.availability !== undefined) updates.availability = p.availability;

    const row = await throwOnError(
      supabase.from('psychologists').update(updates).eq('id', id).select().single()
    );
    return toPsychologist(row);
  },

  deletePsychologist: async (id) => {
    const { error } = await supabase.from('psychologists').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Rooms ─────────────────────────────────────────────
  getRooms: async () => {
    const { data, error } = await supabase.from('rooms').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRoom);
  },

  // ── Appointments ──────────────────────────────────────
  getAppointments: async (date?: string) => {
    let query = supabase.from('appointments').select('*').order('date').order('start_time');
    if (date) query = query.eq('date', date);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAppointment);
  },

  createAppointment: async (a) => {
    const row = await throwOnError(
      supabase
        .from('appointments')
        .insert({
          customer_id: a.customerId,
          psychologist_id: a.psychologistId,
          room_id: a.roomId ?? null,
          mode: a.mode,
          type: a.type,
          date: a.date,
          day_of_week: a.dayOfWeek,
          start_time: a.startTime,
          end_time: a.endTime,
          status: a.status,
          is_recurring: a.isRecurring,
          recurrence_group_id: a.recurrenceGroupId ?? null,
          needs_renewal: a.needsRenewal ?? false,
          custom_price: a.customPrice ?? null,
          custom_repass_amount: a.customRepassAmount ?? null,
          billing_batch_id: a.billingBatchId ?? null,
          billing_status: a.billingStatus ?? null,
          denial_reason: a.denialReason ?? null,
          denial_resolution: a.denialResolution ?? null,
          confirmation_status: 'pending',
        })
        .select()
        .single()
    );
    return toAppointment(row);
  },

  updateAppointment: async (id, a) => {
    const updates: Record<string, any> = {};
    if (a.customerId !== undefined) updates.customer_id = a.customerId;
    if (a.psychologistId !== undefined) updates.psychologist_id = a.psychologistId;
    if (a.roomId !== undefined) updates.room_id = a.roomId;
    if (a.mode !== undefined) updates.mode = a.mode;
    if (a.type !== undefined) updates.type = a.type;
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
    if (a.recurrenceGroupId !== undefined) updates.recurrence_group_id = a.recurrenceGroupId;
    if (a.needsRenewal !== undefined) updates.needs_renewal = a.needsRenewal;
    if (a.customPrice !== undefined) updates.custom_price = a.customPrice;
    if (a.customRepassAmount !== undefined) updates.custom_repass_amount = a.customRepassAmount;
    if (a.billingBatchId !== undefined) updates.billing_batch_id = a.billingBatchId;
    if (a.billingStatus !== undefined) updates.billing_status = a.billingStatus;
    if (a.denialReason !== undefined) updates.denial_reason = a.denialReason;
    if (a.denialResolution !== undefined) updates.denial_resolution = a.denialResolution;

    const row = await throwOnError(
      supabase.from('appointments').update(updates).eq('id', id).select().single()
    );
    return toAppointment(row);
  },

  deleteAppointment: async (id) => {
    const { error } = await supabase.from('appointments').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Customers ─────────────────────────────────────────
  getCustomers: async () => {
    const { data, error } = await supabase.from('customers').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toCustomer);
  },

  createCustomer: async (c) => {
    const row = await throwOnError(
      supabase
        .from('customers')
        .insert({
          name: c.name,
          email: c.email,
          phone: c.phone,
          health_plan: c.healthPlan,
          psychologist_id: c.psychologistId,
          status: c.status,
          notes: c.notes ?? null,
          custom_price: c.customPrice ?? null,
          custom_repass_amount: c.customRepassAmount ?? null,
        })
        .select()
        .single()
    );
    return toCustomer(row);
  },

  updateCustomer: async (id, c) => {
    const updates: Record<string, any> = {};
    if (c.name !== undefined) updates.name = c.name;
    if (c.email !== undefined) updates.email = c.email;
    if (c.phone !== undefined) updates.phone = c.phone;
    if (c.healthPlan !== undefined) updates.health_plan = c.healthPlan;
    if (c.psychologistId !== undefined) updates.psychologist_id = c.psychologistId;
    if (c.status !== undefined) updates.status = c.status;
    if (c.notes !== undefined) updates.notes = c.notes;
    if (c.customPrice !== undefined) updates.custom_price = c.customPrice;
    if (c.customRepassAmount !== undefined) updates.custom_repass_amount = c.customRepassAmount;

    const row = await throwOnError(
      supabase.from('customers').update(updates).eq('id', id).select().single()
    );
    return toCustomer(row);
  },

  deleteCustomer: async (id) => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Plans ─────────────────────────────────────────────
  getPlans: async () => {
    const { data, error } = await supabase.from('plans').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPlan);
  },

  createPlan: async (p) => {
    const row = await throwOnError(
      supabase
        .from('plans')
        .insert({ name: p.name, procedures: p.procedures, active: p.active })
        .select()
        .single()
    );
    return toPlan(row);
  },

  updatePlan: async (id, p) => {
    const updates: Record<string, any> = {};
    if (p.name !== undefined) updates.name = p.name;
    if (p.procedures !== undefined) updates.procedures = p.procedures;
    if (p.active !== undefined) updates.active = p.active;

    const row = await throwOnError(
      supabase.from('plans').update(updates).eq('id', id).select().single()
    );
    return toPlan(row);
  },

  deletePlan: async (id) => {
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Subscriptions ─────────────────────────────────────
  getSubscriptions: async () => {
    const { data, error } = await supabase.from('subscriptions').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toSubscription);
  },

  createSubscription: async (s) => {
    const row = await throwOnError(
      supabase
        .from('subscriptions')
        .insert({
          customer_id: s.customerId,
          plan_id: s.planId,
          start_date: s.startDate,
          next_renewal: s.nextRenewal,
          status: s.status,
        })
        .select()
        .single()
    );
    return toSubscription(row);
  },

  updateSubscription: async (id, s) => {
    const updates: Record<string, any> = {};
    if (s.customerId !== undefined) updates.customer_id = s.customerId;
    if (s.planId !== undefined) updates.plan_id = s.planId;
    if (s.startDate !== undefined) updates.start_date = s.startDate;
    if (s.nextRenewal !== undefined) updates.next_renewal = s.nextRenewal;
    if (s.status !== undefined) updates.status = s.status;

    const row = await throwOnError(
      supabase.from('subscriptions').update(updates).eq('id', id).select().single()
    );
    return toSubscription(row);
  },

  deleteSubscription: async (id) => {
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Payments ──────────────────────────────────────────
  getPayments: async () => {
    const { data, error } = await supabase.from('payments').select('*').order('paid_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPayment);
  },

  createPayment: async (p) => {
    const row = await throwOnError(
      supabase
        .from('payments')
        .insert({
          subscription_id: p.subscriptionId,
          amount: p.amount,
          repass_amount: p.repassAmount,
          paid_at: p.paidAt,
        })
        .select()
        .single()
    );
    return toPayment(row);
  },

  listPaymentsBySubscription: async (subscriptionId) => {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .order('paid_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPayment);
  },

  // ── Expenses ──────────────────────────────────────────
  getExpenses: async () => {
    const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toExpense);
  },

  createExpense: async (e) => {
    const row = await throwOnError(
      supabase
        .from('expenses')
        .insert({
          description: e.description,
          amount: e.amount,
          category: e.category,
          date: e.date,
          is_recurring: e.isRecurring,
        })
        .select()
        .single()
    );
    return toExpense(row);
  },

  updateExpense: async (id, e) => {
    const updates: Record<string, any> = {};
    if (e.description !== undefined) updates.description = e.description;
    if (e.amount !== undefined) updates.amount = e.amount;
    if (e.category !== undefined) updates.category = e.category;
    if (e.date !== undefined) updates.date = e.date;
    if (e.isRecurring !== undefined) updates.is_recurring = e.isRecurring;

    const row = await throwOnError(
      supabase.from('expenses').update(updates).eq('id', id).select().single()
    );
    return toExpense(row);
  },

  deleteExpense: async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Billing Batches ───────────────────────────────────
  getBillingBatches: async () => {
    const { data, error } = await supabase
      .from('billing_batches')
      .select('*')
      .order('sent_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toBillingBatch);
  },

  createBillingBatch: async (b) => {
    const row = await throwOnError(
      supabase
        .from('billing_batches')
        .insert({
          batch_number: b.batchNumber,
          sent_at: b.sentAt,
          paid_at: b.paidAt ?? null,
          status: b.status,
          health_plan: b.healthPlan,
          total_amount: b.totalAmount,
          appointment_ids: b.appointmentIds,
        })
        .select()
        .single()
    );
    return toBillingBatch(row);
  },

  updateBillingBatch: async (id, b) => {
    const updates: Record<string, any> = {};
    if (b.batchNumber !== undefined) updates.batch_number = b.batchNumber;
    if (b.sentAt !== undefined) updates.sent_at = b.sentAt;
    if (b.paidAt !== undefined) updates.paid_at = b.paidAt;
    if (b.status !== undefined) updates.status = b.status;
    if (b.healthPlan !== undefined) updates.health_plan = b.healthPlan;
    if (b.totalAmount !== undefined) updates.total_amount = b.totalAmount;
    if (b.appointmentIds !== undefined) updates.appointment_ids = b.appointmentIds;

    const row = await throwOnError(
      supabase.from('billing_batches').update(updates).eq('id', id).select().single()
    );
    return toBillingBatch(row);
  },

  deleteBillingBatch: async (id) => {
    const { error } = await supabase.from('billing_batches').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
