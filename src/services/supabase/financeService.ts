// Expenses, BillingBatches, Repasses e Settings
import {
  supabase,
  toExpense,
  toBillingBatch,
  toSettings,
  throwOnError,
  EXPENSE_COLUMNS,
  BILLING_BATCH_COLUMNS,
  REPASSE_COLUMNS,
  SETTINGS_COLUMNS,
} from './helpers';
import { Expense, BillingBatch, Repasse, RepasseStatus, Settings } from '../types';

export const financeService = {
  // ── Expenses ───────────────────────────────────────────────────────────────
  getExpenses: async (): Promise<Expense[]> => {
    const { data, error } = await supabase.from('expenses').select(EXPENSE_COLUMNS).order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toExpense);
  },

  createExpense: async (e: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
    const row = await throwOnError(
      supabase.from('expenses').insert({
        description: e.description,
        beneficiary: e.beneficiary,
        razao_social: e.razaoSocial,
        nome_fantasia: e.nomeFantasia,
        product_description: e.productDescription,
        amount: e.amount,
        category: e.category,
        date: e.date,
        is_recurring: e.isRecurring,
      }).select(EXPENSE_COLUMNS).single()
    );
    return toExpense(row);
  },

  updateExpense: async (id: string, e: Partial<Expense>): Promise<Expense> => {
    const updates: Record<string, unknown> = {};
    if (e.description !== undefined) updates.description = e.description;
    if (e.beneficiary !== undefined) updates.beneficiary = e.beneficiary;
    if (e.razaoSocial !== undefined) updates.razao_social = e.razaoSocial;
    if (e.nomeFantasia !== undefined) updates.nome_fantasia = e.nomeFantasia;
    if (e.productDescription !== undefined) updates.product_description = e.productDescription;
    if (e.amount !== undefined) updates.amount = e.amount;
    if (e.category !== undefined) updates.category = e.category;
    if (e.date !== undefined) updates.date = e.date;
    if (e.isRecurring !== undefined) updates.is_recurring = e.isRecurring;
    const row = await throwOnError(supabase.from('expenses').update(updates).eq('id', id).select(EXPENSE_COLUMNS).single());
    return toExpense(row);
  },

  deleteExpense: async (id: string): Promise<void> => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Billing Batches ────────────────────────────────────────────────────────
  getBillingBatches: async (): Promise<BillingBatch[]> => {
    const { data, error } = await supabase
      .from('billing_batches').select(BILLING_BATCH_COLUMNS).order('sent_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toBillingBatch);
  },

  createBillingBatch: async (b: Omit<BillingBatch, 'id' | 'createdAt'>): Promise<BillingBatch> => {
    const row = await throwOnError(
      supabase.from('billing_batches').insert({
        batch_number: b.batchNumber,
        sent_at: b.sentAt,
        paid_at: b.paidAt ?? null,
        status: b.status,
        health_plan: b.healthPlan,
        total_amount: b.totalAmount,
        appointment_ids: b.appointmentIds,
      }).select(BILLING_BATCH_COLUMNS).single()
    );
    return toBillingBatch(row);
  },

  updateBillingBatch: async (id: string, b: Partial<BillingBatch>): Promise<BillingBatch> => {
    const updates: Record<string, unknown> = {};
    if (b.batchNumber !== undefined) updates.batch_number = b.batchNumber;
    if (b.sentAt !== undefined) updates.sent_at = b.sentAt;
    if (b.paidAt !== undefined) updates.paid_at = b.paidAt;
    if (b.status !== undefined) updates.status = b.status;
    if (b.healthPlan !== undefined) updates.health_plan = b.healthPlan;
    if (b.totalAmount !== undefined) updates.total_amount = b.totalAmount;
    if (b.appointmentIds !== undefined) updates.appointment_ids = b.appointmentIds;
    const row = await throwOnError(supabase.from('billing_batches').update(updates).eq('id', id).select(BILLING_BATCH_COLUMNS).single());
    return toBillingBatch(row);
  },

  deleteBillingBatch: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('delete_billing_batch', { p_batch_id: id });
    if (error) throw new Error(error.message);
  },

  // Sincroniza atomicamente o array appointment_ids de um lote com a coluna
  // appointments.billing_batch_id dos IDs afetados (RPC transacional — ver
  // 20260910_billing_batch_atomic_rpcs.sql). Substitui o padrão anterior de
  // updateBillingBatch + N updateAppointment em chamadas separadas.
  syncBillingBatchAppointments: async (params: {
    batchId: string;
    appointmentIds: string[];
    totalAmount: number;
    status?: BillingBatch['status'];
    batchNumber?: string;
    sentAt?: string;
    paidAt?: string | null;
    ignoredIds?: string[];
    ignoredReason?: string;
    operationId?: string;
  }): Promise<{ added: string[]; removed: string[] }> => {
    const { data, error } = await supabase.rpc('sync_billing_batch_appointments', {
      p_batch_id: params.batchId,
      p_appointment_ids: params.appointmentIds,
      p_total_amount: params.totalAmount,
      p_status: params.status ?? null,
      p_batch_number: params.batchNumber ?? null,
      p_sent_at: params.sentAt ?? null,
      p_paid_at: params.paidAt ?? null,
      p_ignored_ids: params.ignoredIds ?? null,
      p_ignored_reason: params.ignoredReason ?? null,
      p_operation_id: params.operationId ?? null,
    });
    if (error) throw new Error(error.message);
    return { added: data?.added ?? [], removed: data?.removed ?? [] };
  },

  // Marca todos os atendimentos de um lote como pagos/glosados numa única
  // transação (1 UPDATE em lote + 1 UPDATE do lote), em vez do padrão anterior
  // de N updateAppointment em paralelo (ver 20260914_audit_operation_grouping.sql).
  markBillingBatchPaid: async (params: {
    batchId: string;
    statuses: Array<{ id: string; status: 'paid' | 'denied' | null; reason?: string | null; resolution?: string | null }>;
    paidAt: string;
    batchStatus: BillingBatch['status'];
    batchPaidAt: string | null;
    operationId?: string;
  }): Promise<{ success: boolean; updated: number }> => {
    const { data, error } = await supabase.rpc('mark_billing_batch_paid', {
      p_batch_id: params.batchId,
      p_statuses: params.statuses,
      p_paid_at: params.paidAt,
      p_batch_status: params.batchStatus,
      p_batch_paid_at: params.batchPaidAt,
      p_operation_id: params.operationId ?? null,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  // ── Repasses ───────────────────────────────────────────────────────────────
  getRepasses: async (): Promise<Repasse[]> => {
    interface DBRepasse {
      id: string;
      psychologist_id: string;
      billing_batch_id: string | null;
      appointment_ids: string[] | null;
      total_amount: number;
      status: string;
      paid_at: string | null;
      notes: string | null;
      created_at: string;
    }
    const { data, error } = await supabase
      .from('repasses').select(REPASSE_COLUMNS).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DBRepasse[];
    return rows.map((row): Repasse => ({
      id: row.id,
      psychologistId: row.psychologist_id,
      billingBatchId: row.billing_batch_id ?? undefined,
      appointmentIds: row.appointment_ids ?? [],
      totalAmount: row.total_amount,
      status: row.status as RepasseStatus,
      paidAt: row.paid_at ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    }));
  },

  createRepasse: async (r: Omit<Repasse, 'id' | 'createdAt'>): Promise<Repasse> => {
    interface DBRepasse {
      id: string;
      psychologist_id: string;
      billing_batch_id: string | null;
      appointment_ids: string[] | null;
      total_amount: number;
      status: string;
      paid_at: string | null;
      notes: string | null;
      created_at: string;
    }
    const row = await throwOnError(
      supabase.from('repasses').insert({
        psychologist_id: r.psychologistId,
        billing_batch_id: r.billingBatchId ?? null,
        appointment_ids: r.appointmentIds,
        total_amount: r.totalAmount,
        status: r.status,
        paid_at: r.paidAt ?? null,
        notes: r.notes ?? null,
      }).select(REPASSE_COLUMNS).single()
    ) as unknown as DBRepasse;
    return { id: row.id, psychologistId: row.psychologist_id, billingBatchId: row.billing_batch_id ?? undefined, appointmentIds: row.appointment_ids ?? [], totalAmount: row.total_amount, status: row.status as RepasseStatus, paidAt: row.paid_at ?? undefined, notes: row.notes ?? undefined, createdAt: row.created_at };
  },

  updateRepasse: async (id: string, r: Partial<Repasse>): Promise<Repasse> => {
    interface DBRepasse {
      id: string;
      psychologist_id: string;
      billing_batch_id: string | null;
      appointment_ids: string[] | null;
      total_amount: number;
      status: string;
      paid_at: string | null;
      notes: string | null;
      created_at: string;
    }
    const updates: Record<string, unknown> = {};
    if (r.status !== undefined) updates.status = r.status;
    if (r.paidAt !== undefined) updates.paid_at = r.paidAt;
    if (r.notes !== undefined) updates.notes = r.notes;
    if (r.totalAmount !== undefined) updates.total_amount = r.totalAmount;
    const row = await throwOnError(
      supabase.from('repasses').update(updates).eq('id', id).select(REPASSE_COLUMNS).single()
    ) as unknown as DBRepasse;
    return { id: row.id, psychologistId: row.psychologist_id, billingBatchId: row.billing_batch_id ?? undefined, appointmentIds: row.appointment_ids ?? [], totalAmount: row.total_amount, status: row.status as RepasseStatus, paidAt: row.paid_at ?? undefined, notes: row.notes ?? undefined, createdAt: row.created_at };
  },

  deleteRepasse: async (id: string): Promise<void> => {
    const { error } = await supabase.from('repasses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: async (): Promise<Settings> => {
    let { data, error } = await supabase.from('settings').select(SETTINGS_COLUMNS).limit(1).maybeSingle();
    if (!data && !error) {
      const { data: newData, error: newErr } = await supabase.from('settings').insert({}).select(SETTINGS_COLUMNS).single();
      if (newErr) throw new Error(newErr.message);
      data = newData;
    } else if (error) {
      throw new Error(error.message);
    }
    return toSettings(data);
  },

  updateSettings: async (id: string, settings: Partial<Settings>): Promise<Settings> => {
    const updates: Record<string, unknown> = {};
    if (settings.zapiUrl !== undefined) updates.zapi_url = settings.zapiUrl;
    if (settings.zapiToken !== undefined) updates.zapi_token = settings.zapiToken;
    updates.updated_at = new Date().toISOString();
    const row = await throwOnError(supabase.from('settings').update(updates).eq('id', id).select(SETTINGS_COLUMNS).single());
    return toSettings(row);
  },
};
