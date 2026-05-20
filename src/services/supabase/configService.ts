// WaitingList, Holidays, ClinicClosures e NFS-e Invoices
import { supabase, throwOnError } from './helpers';
import { WaitingListEntry, Holiday, ClinicClosure } from '../types';

export const configService = {
  // ── Waiting List ───────────────────────────────────────────────────────────
  getWaitingList: async (): Promise<WaitingListEntry[]> => {
    const { data, error } = await supabase
      .from('waiting_list').select('*').order('created_at', { ascending: false });
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

  createWaitingListEntry: async (e: Omit<WaitingListEntry, 'id' | 'createdAt'>): Promise<WaitingListEntry> => {
    const row: any = await throwOnError(
      supabase.from('waiting_list').insert({
        customer_name: e.customerName,
        phone: e.phone,
        preferred_days: e.preferredDays,
        preferred_hours: e.preferredHours,
        psychologist_id: e.psychologistId,
        notes: e.notes,
        status: e.status,
      }).select().single()
    );
    return { id: row.id, customerName: row.customer_name, phone: row.phone, preferredDays: row.preferred_days ?? [], preferredHours: row.preferred_hours ?? [], psychologistId: row.psychologist_id, notes: row.notes, status: row.status, createdAt: row.created_at };
  },

  updateWaitingListEntry: async (id: string, e: Partial<WaitingListEntry>): Promise<WaitingListEntry> => {
    const updates: Record<string, any> = {};
    if (e.customerName !== undefined) updates.customer_name = e.customerName;
    if (e.phone !== undefined) updates.phone = e.phone;
    if (e.preferredDays !== undefined) updates.preferred_days = e.preferredDays;
    if (e.preferredHours !== undefined) updates.preferred_hours = e.preferredHours;
    if (e.psychologistId !== undefined) updates.psychologist_id = e.psychologistId;
    if (e.notes !== undefined) updates.notes = e.notes;
    if (e.status !== undefined) updates.status = e.status;
    const row: any = await throwOnError(supabase.from('waiting_list').update(updates).eq('id', id).select().single());
    return { id: row.id, customerName: row.customer_name, phone: row.phone, preferredDays: row.preferred_days ?? [], preferredHours: row.preferred_hours ?? [], psychologistId: row.psychologist_id, notes: row.notes, status: row.status, createdAt: row.created_at };
  },

  deleteWaitingListEntry: async (id: string): Promise<void> => {
    const { error } = await supabase.from('waiting_list').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Holidays ───────────────────────────────────────────────────────────────
  getHolidays: async (): Promise<Holiday[]> => {
    const { data, error } = await supabase.from('holidays').select('*').order('date');
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id, date: row.date, name: row.name, type: row.type,
      recurring: row.recurring, clinicOpen: row.clinic_open, createdAt: row.created_at,
    }));
  },

  createHoliday: async (h: Omit<Holiday, 'id' | 'createdAt'>): Promise<Holiday> => {
    const row: any = await throwOnError(
      supabase.from('holidays').insert({
        date: h.date, name: h.name, type: h.type,
        recurring: h.recurring, clinic_open: h.clinicOpen,
      }).select().single()
    );
    return { id: row.id, date: row.date, name: row.name, type: row.type, recurring: row.recurring, clinicOpen: row.clinic_open, createdAt: row.created_at };
  },

  updateHoliday: async (id: string, h: Partial<Holiday>): Promise<Holiday> => {
    const updates: Record<string, any> = {};
    if (h.date !== undefined) updates.date = h.date;
    if (h.name !== undefined) updates.name = h.name;
    if (h.type !== undefined) updates.type = h.type;
    if (h.recurring !== undefined) updates.recurring = h.recurring;
    if (h.clinicOpen !== undefined) updates.clinic_open = h.clinicOpen;
    const row: any = await throwOnError(supabase.from('holidays').update(updates).eq('id', id).select().single());
    return { id: row.id, date: row.date, name: row.name, type: row.type, recurring: row.recurring, clinicOpen: row.clinic_open, createdAt: row.created_at };
  },

  deleteHoliday: async (id: string): Promise<void> => {
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Clinic Closures ────────────────────────────────────────────────────────
  getClinicClosures: async (): Promise<ClinicClosure[]> => {
    const { data, error } = await supabase.from('clinic_closures').select('*').order('start_date');
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id, startDate: row.start_date, endDate: row.end_date,
      reason: row.reason, createdAt: row.created_at,
    }));
  },

  createClinicClosure: async (c: Omit<ClinicClosure, 'id' | 'createdAt'>): Promise<ClinicClosure> => {
    const row: any = await throwOnError(
      supabase.from('clinic_closures').insert({
        start_date: c.startDate, end_date: c.endDate, reason: c.reason,
      }).select().single()
    );
    return { id: row.id, startDate: row.start_date, endDate: row.end_date, reason: row.reason, createdAt: row.created_at };
  },

  updateClinicClosure: async (id: string, c: Partial<ClinicClosure>): Promise<ClinicClosure> => {
    const updates: Record<string, any> = {};
    if (c.startDate !== undefined) updates.start_date = c.startDate;
    if (c.endDate !== undefined) updates.end_date = c.endDate;
    if (c.reason !== undefined) updates.reason = c.reason;
    const row: any = await throwOnError(supabase.from('clinic_closures').update(updates).eq('id', id).select().single());
    return { id: row.id, startDate: row.start_date, endDate: row.end_date, reason: row.reason, createdAt: row.created_at };
  },

  deleteClinicClosure: async (id: string): Promise<void> => {
    const { error } = await supabase.from('clinic_closures').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── NFS-e Invoices ─────────────────────────────────────────────────────────
  getInvoices: async (params?: { limit?: number }) => {
    const limit = params?.limit ?? 20;
    const { data, error } = await supabase
      .from('nfse_invoices').select('*').order('created_at', { ascending: false }).limit(limit);
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

  importInvoices: async (invoices: Array<{ invoiceNumber: string; issueDate: string; payerName: string; payerCNPJ: string; totalAmount: number; description?: string }>) => {
    const rows = invoices.map(inv => ({
      invoice_number: inv.invoiceNumber,
      issue_date: inv.issueDate,
      status: 'emitida',
      payer: { nome: inv.payerName, cpf_cnpj: inv.payerCNPJ },
      total_amount: inv.totalAmount,
      description: inv.description || '',
    }));
    const { error } = await supabase.from('nfse_invoices').upsert(rows, { onConflict: 'invoice_number' });
    if (error) throw new Error(error.message);
    return { success: true, importedCount: rows.length };
  },

  deleteInvoice: async (id: string): Promise<void> => {
    const { error } = await supabase.from('nfse_invoices').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
