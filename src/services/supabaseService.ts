import { supabase } from '../lib/supabase';
import {
  AppService,
  Appointment,
  BillingBatch,
  Customer,
  Expense,
  HealthPlan,
  Payment,
  Plan,
  Psychologist,
  Repasse,
  RepasseStatus,
  Room,
  Subscription,
  User,
  UserRole,
  RecurrenceFrequency,
  Settings,
  WaitingListEntry,
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
    email: row.email ?? '',
    active: row.active,
    availability: row.availability ?? [],
    repassRate: row.repass_rate,
    repassFixedAmount: row.repass_fixed_amount,
  };
}

function toRoom(row: any): Room {
  return { id: row.id, name: row.name, active: row.active };
}

// Normaliza o health_plan cru do banco (ex: "AMS PETROBRAS") para o valor do enum (ex: "AMS Petrobras")
// Isso resolve a inconsistência de capitalização entre o banco e o frontend
const HEALTH_PLAN_MAP: Record<string, string> = {
  'AMS PETROBRAS': 'AMS Petrobras',
  'PAE': 'PAE',
  'PORTO SAUDE': 'Porto Saude',
  'MEDSENIOR': 'Medsenior',
  'REAL GRANDEZA': 'Real Grandeza',
  'SAUDE BLUE': 'Saude Blue',
  'GAMA SAUDE': 'Gama Saude',
  'SAUDE CAIXA': 'Saude Caixa',
  'FUNDACAO SAUDE': 'Fundação Saúde Itaú',
  'FUNDAÇÃO SAÚDE ITAÚ': 'Fundação Saúde Itaú',
  'PARTICULAR': 'Particular',
};

function normalizeHealthPlan(raw?: string): HealthPlan {
  if (!raw) return HealthPlan.PARTICULAR as unknown as HealthPlan;
  const str = String(raw);
  return (HEALTH_PLAN_MAP[str.toUpperCase()] ?? str) as unknown as HealthPlan;
}

function toCustomer(row: any): Customer {
  return {
    id: row.id,
    name: row.name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    healthPlan: normalizeHealthPlan(row.health_plan),
    psychologistId: row.psychologist_id,
    status: row.status,
    inactivationReason: row.inactivation_reason,
    notes: row.notes,
    customPrice: row.custom_price ?? undefined,
    customRepassAmount: row.custom_repass_amount ?? undefined,
    birthDate: row.birth_date ?? undefined,
    amsPassword: row.ams_password ?? undefined,
    amsPasswordExpiry: row.ams_password_expiry ?? undefined,
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
    procedureCode: row.procedure_code,
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
    recurrenceFrequency: row.recurrence_frequency ?? undefined,
    recurrenceGroupId: row.recurrence_group_id ?? undefined,
    needsRenewal: row.needs_renewal ?? false,
    customPrice: row.custom_price ?? undefined,
    customRepassAmount: row.custom_repass_amount ?? undefined,
    billingBatchId: row.billing_batch_id ?? undefined,
    billingStatus: row.billing_status ?? undefined,
    denialReason: row.denial_reason ?? undefined,
    denialResolution: row.denial_resolution ?? undefined,
    createdAt: row.created_at,
    cancellationBilling: row.cancellation_billing ?? undefined,
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
    beneficiary: row.beneficiary,
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia,
    productDescription: row.product_description,
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
const toSettings = (row: any): Settings => ({
  id: row.id,
  zapiUrl: row.zapi_url ?? undefined,
  zapiToken: row.zapi_token ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const supabaseService: AppService = {
  // ... outros métodos

  getInvoices: async (params) => {
    const limit = params?.limit ?? 20;
    const { data, error } = await supabase
      .from('nfse_invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      id: String(row.id),
      invoiceNumber: row.invoice_number,
      issueDate: row.issue_date,
      status: row.status,
      payer: row.payer,
      totalAmount: Number(row.total_amount ?? 0),
      description: row.description ?? null,
      createdAt: row.created_at,
    }));
  },

  importInvoices: async (invoices) => {
    const rows = invoices.map(inv => ({
      invoice_number: inv.invoiceNumber,
      issue_date: inv.issueDate,
      status: 'emitida',
      payer: { nome: inv.payerName, cpf_cnpj: inv.payerCNPJ },
      total_amount: inv.totalAmount,
      description: inv.description || '',
    }));

    const { error } = await supabase
      .from('nfse_invoices')
      .upsert(rows, { onConflict: 'invoice_number' });

    if (error) throw new Error(error.message);
    return { success: true, importedCount: rows.length };
  },
  // ── Auth ──────────────────────────────────────────────
  login: async (email: string, password: string) => {
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.error('Auth error:', authError);
      return null;
    }

    // 2. Fetch the user's role from public.app_users
    const { data: profile, error: profileError } = await supabase
      .from('app_users')
      .select('role')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);
      // Fallback to a default role or handle as unauthorized if profile is required
      return null;
    }

    currentUser = { email: authData.user.email!, role: profile.role as UserRole };
    localStorage.setItem('nucleo_user_v2', JSON.stringify(currentUser));
    return currentUser;
  },

  logout: async () => {
    await supabase.auth.signOut();
    currentUser = null;
    localStorage.removeItem('nucleo_user_v2');
    localStorage.removeItem('nucleo_user'); // Clean up old mock key
  },

  isAuthenticated: () => {
    if (currentUser) return true;
    const stored = localStorage.getItem('nucleo_user_v2');
    if (stored) {
      currentUser = JSON.parse(stored);
      return true;
    }
    return false;
  },

  getCurrentUser: () => {
    if (currentUser) return currentUser;
    const stored = localStorage.getItem('nucleo_user_v2');
    if (stored) {
      currentUser = JSON.parse(stored);
      return currentUser;
    }
    return null;
  },

  updatePassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
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
          email: p.email,
          specialties: p.specialties,
          phone: p.phone,
          active: p.active,
          availability: p.availability,
          repass_rate: p.repassRate,
          repass_fixed_amount: p.repassFixedAmount,
        })
        .select()
        .single()
    );
    return toPsychologist(row);
  },

  updatePsychologist: async (id, p) => {
    const updates: Record<string, any> = {};
    if (p.name !== undefined) updates.name = p.name;
    if (p.email !== undefined) updates.email = p.email;
    if (p.specialties !== undefined) updates.specialties = p.specialties;
    if (p.phone !== undefined) updates.phone = p.phone;
    if (p.active !== undefined) updates.active = p.active;
    if (p.availability !== undefined) updates.availability = p.availability;
    if (p.repassRate !== undefined) updates.repass_rate = p.repassRate;
    if (p.repassFixedAmount !== undefined) updates.repass_fixed_amount = p.repassFixedAmount;

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

  getAppointmentsByRange: async (startDate: string, endDate: string) => {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('start_time');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAppointment);
  },

  getAppointmentsNeedingRenewal: async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('needs_renewal', true)
      .eq('status', 'active')
      .order('date');
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAppointment);
  },

  createAppointment: async (a) => {
    const generateUUID = () => {
      try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
        }
      } catch (e) {}
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

      if (a.isRecurring) {
        const groupId = generateUUID();
        const appointmentsToInsert = [];
        const startDate = new Date(a.date + 'T12:00:00');
        const intervalDays = a.recurrenceFrequency === RecurrenceFrequency.QUINZENAL ? 14 : 7;
        
        for (let i = 0; i < 4; i++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(startDate.getDate() + (i * intervalDays));
          const dateStr = currentDate.toISOString().split('T')[0];
        const dateObj = new Date(dateStr + 'T12:00:00');
        
        appointmentsToInsert.push({
          customer_id: a.customerId,
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
        });
      }

      const { data, error } = await supabase.from('appointments').insert(appointmentsToInsert).select();
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error('Falha ao criar agendamentos');
      
      return toAppointment(data[0]);
    } else {
      const dateObj = new Date(a.date + 'T12:00:00');
      const row = await throwOnError(
        supabase
          .from('appointments')
          .insert({
            customer_id: a.customerId,
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
          })
          .select()
          .single()
      );
      return toAppointment(row);
    }
  },

  updateAppointment: async (id, a) => {
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
    if (a.confirmationStatus !== undefined) updates.confirmationStatus = a.confirmationStatus;
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
    if (a.denialReason !== undefined) updates.denial_reason = a.denialReason;
    if (a.denialResolution !== undefined) updates.denial_resolution = a.denialResolution;
    if (a.cancellationBilling !== undefined) updates.cancellation_billing = a.cancellationBilling;

    const row = await throwOnError(
      supabase.from('appointments').update(updates).eq('id', id).select().single()
    );
    return toAppointment(row);
  },

  deleteAppointment: async (id) => {
    const { error } = await supabase.from('appointments').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
  
  deleteFutureAppointments: async (groupId, fromDate) => {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('recurrence_group_id', groupId)
      .gte('date', fromDate);
    if (error) throw new Error(error.message);
  },

  // ── Customers ─────────────────────────────────────────
  getCustomers: async () => {
    // 1. Fetch customers
    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .order('name');

    if (customersError) throw new Error(customersError.message);
    if (!customersData) return [];

    // 2. Fetch all appointments summary (just what's needed for metrics)
    // To be efficient, we only need id, customer_id, date, and status
    const { data: appData, error: appError } = await supabase
      .from('appointments')
      .select('customer_id, date, status')
      .in('status', ['active']); // We only care about active appointments for these metrics

    if (appError) throw new Error(appError.message);

    const today = new Date().toISOString().split('T')[0];

    // 3. Process metrics in memory
    return customersData.map(row => {
      const customer = toCustomer(row);
      const customerApps = (appData || []).filter(a => a.customer_id === customer.id);

      // Quantidade de atendimentos realizados (past active)
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

  createCustomer: async (c) => {
    const row = await throwOnError(
      supabase
        .from('customers')
        .insert({
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
          birth_date: c.birthDate ?? null,
          ams_password: c.amsPassword ?? null,
          ams_password_expiry: c.amsPasswordExpiry ?? null,
        })
        .select()
        .single()
    );
    return toCustomer(row);
  },

  updateCustomer: async (id, c) => {
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
    if (c.birthDate !== undefined) updates.birth_date = c.birthDate;
    if (c.amsPassword !== undefined) updates.ams_password = c.amsPassword;
    if (c.amsPasswordExpiry !== undefined) updates.ams_password_expiry = c.amsPasswordExpiry;

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
          beneficiary: e.beneficiary,
          razao_social: e.razaoSocial,
          nome_fantasia: e.nomeFantasia,
          product_description: e.productDescription,
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
    if (e.beneficiary !== undefined) updates.beneficiary = e.beneficiary;
    if (e.razaoSocial !== undefined) updates.razao_social = e.razaoSocial;
    if (e.nomeFantasia !== undefined) updates.nome_fantasia = e.nomeFantasia;
    if (e.productDescription !== undefined) updates.product_description = e.productDescription;
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
    // 1. Limpar as referências de faturamento nos agendamentos vinculados a este lote
    const { error: appError } = await supabase
      .from('appointments')
      .update({ 
        billing_batch_id: null,
        billing_status: null,
        denial_reason: null,
        denial_resolution: null
      })
      .eq('billing_batch_id', id);

    if (appError) {
      console.error('Error clearing appointments for batch:', appError);
      throw new Error(appError.message);
    }

    // 2. Excluir o lote
    const { error: batchError } = await supabase
      .from('billing_batches')
      .delete()
      .eq('id', id);

    if (batchError) {
      console.error('Error deleting billing batch:', batchError);
      throw new Error(batchError.message);
    }
  },

  // ── Repasses ──────────────────────────────────────────
  getRepasses: async () => {
    const { data, error } = await supabase
      .from('repasses')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any): Repasse => ({
      id: row.id,
      psychologistId: row.psychologist_id,
      billingBatchId: row.billing_batch_id,
      appointmentIds: row.appointment_ids ?? [],
      totalAmount: row.total_amount,
      status: row.status as RepasseStatus,
      paidAt: row.paid_at ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    }));
  },

  createRepasse: async (r) => {
    const row = await throwOnError(
      supabase
        .from('repasses')
        .insert({
          psychologist_id: r.psychologistId,
          billing_batch_id: r.billingBatchId,
          appointment_ids: r.appointmentIds,
          total_amount: r.totalAmount,
          status: r.status,
          paid_at: r.paidAt ?? null,
          notes: r.notes ?? null,
        })
        .select()
        .single()
    );
    return {
      id: row.id,
      psychologistId: row.psychologist_id,
      billingBatchId: row.billing_batch_id,
      appointmentIds: row.appointment_ids ?? [],
      totalAmount: row.total_amount,
      status: row.status as RepasseStatus,
      paidAt: row.paid_at ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    };
  },

  updateRepasse: async (id, r) => {
    const updates: Record<string, any> = {};
    if (r.status !== undefined) updates.status = r.status;
    if (r.paidAt !== undefined) updates.paid_at = r.paidAt;
    if (r.notes !== undefined) updates.notes = r.notes;
    if (r.totalAmount !== undefined) updates.total_amount = r.totalAmount;

    const row = await throwOnError(
      supabase.from('repasses').update(updates).eq('id', id).select().single()
    );
    return {
      id: row.id,
      psychologistId: row.psychologist_id,
      billingBatchId: row.billing_batch_id,
      appointmentIds: row.appointment_ids ?? [],
      totalAmount: row.total_amount,
      status: row.status as RepasseStatus,
      paidAt: row.paid_at ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    };
  },

  deleteRepasse: async (id) => {
    const { error } = await supabase.from('repasses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Settings ──────────────────────────────────────────
  getSettings: async () => {
    let { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    
    // Se não existir nenhuma configuração, criar uma linha vazia padrão
    if (!data && !error) {
      const { data: newData, error: newErr } = await supabase
        .from('settings')
        .insert({})
        .select()
        .single();
      if (newErr) throw new Error(newErr.message);
      data = newData;
    } else if (error) {
      throw new Error(error.message);
    }
    
    return toSettings(data);
  },

  updateSettings: async (id, settings) => {
    const updates: any = {};
    if (settings.zapiUrl !== undefined) updates.zapi_url = settings.zapiUrl;
    if (settings.zapiToken !== undefined) updates.zapi_token = settings.zapiToken;
    updates.updated_at = new Date().toISOString();

    const row = await throwOnError(
      supabase.from('settings').update(updates).eq('id', id).select().single()
    );
    return toSettings(row);
  },

  // ── Waiting List ─────────────────────────────────────
  getWaitingList: async () => {
    const { data, error } = await supabase
      .from('waiting_list')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any): WaitingListEntry => ({
      id: row.id,
      customerName: row.customer_name,
      phone: row.phone,
      preferredDays: row.preferred_days ?? [],
      preferredHours: row.preferred_hours ?? [],
      psychologistId: row.psychologist_id,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  createWaitingListEntry: async (e) => {
    const row = await throwOnError(
      supabase
        .from('waiting_list')
        .insert({
          customer_name: e.customerName,
          phone: e.phone,
          preferred_days: e.preferredDays,
          preferred_hours: e.preferredHours,
          psychologist_id: e.psychologistId,
          notes: e.notes,
          status: e.status,
        })
        .select()
        .single()
    );
    return {
      id: row.id,
      customerName: row.customer_name,
      phone: row.phone,
      preferredDays: row.preferred_days ?? [],
      preferredHours: row.preferred_hours ?? [],
      psychologistId: row.psychologist_id,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
    };
  },

  updateWaitingListEntry: async (id, e) => {
    const updates: Record<string, any> = {};
    if (e.customerName !== undefined) updates.customer_name = e.customerName;
    if (e.phone !== undefined) updates.phone = e.phone;
    if (e.preferredDays !== undefined) updates.preferred_days = e.preferredDays;
    if (e.preferredHours !== undefined) updates.preferred_hours = e.preferredHours;
    if (e.psychologistId !== undefined) updates.psychologist_id = e.psychologistId;
    if (e.notes !== undefined) updates.notes = e.notes;
    if (e.status !== undefined) updates.status = e.status;

    const row = await throwOnError(
      supabase.from('waiting_list').update(updates).eq('id', id).select().single()
    );
    return {
      id: row.id,
      customerName: row.customer_name,
      phone: row.phone,
      preferredDays: row.preferred_days ?? [],
      preferredHours: row.preferred_hours ?? [],
      psychologistId: row.psychologist_id,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
    };
  },

  deleteWaitingListEntry: async (id) => {
    const { error } = await supabase.from('waiting_list').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
