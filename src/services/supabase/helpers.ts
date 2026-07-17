// Funções auxiliares compartilhadas: mappers snake_case → camelCase e utilitários
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import {
  Psychologist, Room, Customer, Appointment, BillingBatch,
  Plan, Subscription, Payment, Expense, Settings, HealthPlan,
} from '../types';

export { supabase };

// ── Column projections (substituem SELECT * para segurança e performance) ────
// Listar explicitamente as colunas protege contra vazamento de campos sensíveis
// que possam ser adicionados no futuro (ex: prontuários, diagnósticos).

export const APPOINTMENT_COLUMNS = [
  'id', 'customer_id', 'psychologist_id', 'room_id',
  'mode', 'type', 'procedure_code',
  'date', 'day_of_week', 'start_time', 'end_time',
  'status', 'confirmed_patient', 'confirmed_psychologist',
  'confirmation_status', 'reminder_sent_at',
  'patient_notes',
  'is_recurring', 'recurrence_frequency', 'recurrence_group_id',
  'needs_renewal', 'renewed_at', 'renewed_by',
  'custom_price', 'custom_repass_amount',
  'billing_batch_id', 'billing_status', 'billing_ignored', 'paid_at',
  'health_plan_at_time',

  'denial_reason', 'denial_resolution',
  'cancellation_billing', 'cancellation_fault',
  'is_internal', 'internal_type', 'internal_title', 'internal_notes',
  'created_at',
].join(', ');

export const CUSTOMER_COLUMNS = [
  'id', 'name', 'email', 'phone',
  'health_plan', 'psychologist_id',
  'status', 'inactivation_reason',
  'notes', 'custom_price', 'custom_repass_amount',
  'birth_date', 'gender',
  'ams_password', 'ams_password_expiry',
  'created_at',
].join(', ');

// ── Mapper functions ─────────────────────────────────────────────────────────

export function toPsychologist(row: any): Psychologist {
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
    repassOverridesPlan: row.repass_overrides_plan ?? false,
    pixKeyType: row.pix_key_type ?? undefined,
    pixKey: row.pix_key ?? undefined,
  };
}

export function toRoom(row: any): Room {
  return { id: row.id, name: row.name, active: row.active };
}

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

export function normalizeHealthPlan(raw?: string): HealthPlan {
  if (!raw) return HealthPlan.PARTICULAR;
  const str = String(raw);
  return (HEALTH_PLAN_MAP[str.toUpperCase()] ?? str) as HealthPlan;
}

/**
 * Encontra o plano cadastrado que corresponde ao healthPlan de um paciente.
 * A comparação é case-insensitive para evitar quebras por diferenças de capitalização.
 */
export function matchPlanByHealthPlan(plans: import('../types').Plan[], healthPlan?: string): import('../types').Plan | undefined {
  if (!healthPlan) return undefined;
  const normalized = healthPlan.toUpperCase();
  return plans.find(p => p.name.toUpperCase() === normalized);
}

export function toCustomer(row: any): Customer {
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
    gender: row.gender ?? undefined,
    amsPassword: row.ams_password ?? undefined,
    amsPasswordExpiry: row.ams_password_expiry ?? undefined,
    createdAt: row.created_at,
  };
}

export function toAppointment(row: any): Appointment {
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
    renewedAt: row.renewed_at ?? undefined,
    renewedBy: row.renewed_by ?? undefined,
    customPrice: row.custom_price ?? undefined,
    customRepassAmount: row.custom_repass_amount ?? undefined,
    billingBatchId: row.billing_batch_id ?? undefined,
    billingStatus: row.billing_status ?? undefined,
    billingIgnored: row.billing_ignored ?? undefined,
    paidAt: row.paid_at ?? undefined,
    healthPlanAtTime: row.health_plan_at_time ?? undefined,

    denialReason: row.denial_reason ?? undefined,
    denialResolution: row.denial_resolution ?? undefined,
    createdAt: row.created_at,
    cancellationBilling: row.cancellation_billing ?? undefined,
    cancellationFault: row.cancellation_fault ?? undefined,
    isInternal: row.is_internal ?? false,
    internalType: row.internal_type ?? undefined,
    internalTitle: row.internal_title ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
  };
}

export function toBillingBatch(row: any): BillingBatch {
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

export function toPlan(row: any): Plan {
  return {
    id: row.id,
    name: row.name,
    procedures: row.procedures ?? [],
    active: row.active,
    createdAt: row.created_at,
  };
}

export function toSubscription(row: any): Subscription {
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

export function toPayment(row: any): Payment {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    amount: row.amount,
    repassAmount: row.repass_amount,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

export function toExpense(row: any): Expense {
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

export const toSettings = (row: any): Settings => ({
  id: row.id,
  zapiUrl: row.zapi_url ?? undefined,
  zapiToken: row.zapi_token ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ── Utility ──────────────────────────────────────────────────────────────────

export async function throwOnError<T>(promise: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    // Sessão expirada ou não autorizada → força logout e redirect
    const status = (error as any)?.status ?? (error as any)?.code;
    if (status === 401 || status === 403 || error.message?.includes('JWT expired')) {
      logger.warn('[Auth] Sessão expirada, redirecionando para login.');
      localStorage.removeItem('nucleo_user_v2');
      await supabase.auth.signOut().catch(() => {});
      window.location.hash = '/login';
    }
    throw new Error(error.message);
  }
  if (data === null) throw new Error('No data returned from Supabase');
  return data;
}

export function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
