// Expenses, BillingBatches, Repasses e Settings
import { supabase, toExpense, toBillingBatch, toSettings, throwOnError } from './helpers';
import { Expense, BillingBatch, Repasse, RepasseStatus, Settings } from '../types';

export const financeService = {
  // ── Expenses ───────────────────────────────────────────────────────────────
  getExpenses: async (): Promise<Expense[]> => {
    const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
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
      }).select().single()
    );
    return toExpense(row);
  },

  updateExpense: async (id: string, e: Partial<Expense>): Promise<Expense> => {
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
    const row = await throwOnError(supabase.from('expenses').update(updates).eq('id', id).select().single());
    return toExpense(row);
  },

  deleteExpense: async (id: string): Promise<void> => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Billing Batches ────────────────────────────────────────────────────────
  getBillingBatches: async (): Promise<BillingBatch[]> => {
    const { data, error } = await supabase
      .from('billing_batches').select('*').order('sent_at', { ascending: false });
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
      }).select().single()
    );
    return toBillingBatch(row);
  },

  updateBillingBatch: async (id: string, b: Partial<BillingBatch>): Promise<BillingBatch> => {
    const updates: Record<string, any> = {};
    if (b.batchNumber !== undefined) updates.batch_number = b.batchNumber;
    if (b.sentAt !== undefined) updates.sent_at = b.sentAt;
    if (b.paidAt !== undefined) updates.paid_at = b.paidAt;
    if (b.status !== undefined) updates.status = b.status;
    if (b.healthPlan !== undefined) updates.health_plan = b.healthPlan;
    if (b.totalAmount !== undefined) updates.total_amount = b.totalAmount;
    if (b.appointmentIds !== undefined) updates.appointment_ids = b.appointmentIds;
    const row = await throwOnError(supabase.from('billing_batches').update(updates).eq('id', id).select().single());
    return toBillingBatch(row);
  },

  deleteBillingBatch: async (id: string): Promise<void> => {
    const { error: appError } = await supabase
      .from('appointments')
      .update({ billing_batch_id: null, billing_status: null, denial_reason: null, denial_resolution: null, paid_at: null })

      .eq('billing_batch_id', id);
    if (appError) throw new Error(appError.message);

    const { error: batchError } = await supabase.from('billing_batches').delete().eq('id', id);
    if (batchError) throw new Error(batchError.message);
  },

  // ── Repasses ───────────────────────────────────────────────────────────────
  getRepasses: async (): Promise<Repasse[]> => {
    const { data, error } = await supabase
      .from('repasses').select('*').order('created_at', { ascending: false });
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

  createRepasse: async (r: Omit<Repasse, 'id' | 'createdAt'>): Promise<Repasse> => {
    const row: any = await throwOnError(
      supabase.from('repasses').insert({
        psychologist_id: r.psychologistId,
        billing_batch_id: r.billingBatchId,
        appointment_ids: r.appointmentIds,
        total_amount: r.totalAmount,
        status: r.status,
        paid_at: r.paidAt ?? null,
        notes: r.notes ?? null,
      }).select().single()
    );
    return { id: row.id, psychologistId: row.psychologist_id, billingBatchId: row.billing_batch_id, appointmentIds: row.appointment_ids ?? [], totalAmount: row.total_amount, status: row.status as RepasseStatus, paidAt: row.paid_at ?? undefined, notes: row.notes ?? undefined, createdAt: row.created_at };
  },

  updateRepasse: async (id: string, r: Partial<Repasse>): Promise<Repasse> => {
    const updates: Record<string, any> = {};
    if (r.status !== undefined) updates.status = r.status;
    if (r.paidAt !== undefined) updates.paid_at = r.paidAt;
    if (r.notes !== undefined) updates.notes = r.notes;
    if (r.totalAmount !== undefined) updates.total_amount = r.totalAmount;
    const row: any = await throwOnError(supabase.from('repasses').update(updates).eq('id', id).select().single());
    return { id: row.id, psychologistId: row.psychologist_id, billingBatchId: row.billing_batch_id, appointmentIds: row.appointment_ids ?? [], totalAmount: row.total_amount, status: row.status as RepasseStatus, paidAt: row.paid_at ?? undefined, notes: row.notes ?? undefined, createdAt: row.created_at };
  },

  deleteRepasse: async (id: string): Promise<void> => {
    const { error } = await supabase.from('repasses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: async (): Promise<Settings> => {
    let { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    if (!data && !error) {
      const { data: newData, error: newErr } = await supabase.from('settings').insert({}).select().single();
      if (newErr) throw new Error(newErr.message);
      data = newData;
    } else if (error) {
      throw new Error(error.message);
    }
    return toSettings(data);
  },

  updateSettings: async (id: string, settings: Partial<Settings>): Promise<Settings> => {
    const updates: any = {};
    if (settings.zapiUrl !== undefined) updates.zapi_url = settings.zapiUrl;
    if (settings.zapiToken !== undefined) updates.zapi_token = settings.zapiToken;
    updates.updated_at = new Date().toISOString();
    const row = await throwOnError(supabase.from('settings').update(updates).eq('id', id).select().single());
    return toSettings(row);
  },
};
