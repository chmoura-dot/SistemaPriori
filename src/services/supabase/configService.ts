// WaitingList, Holidays, ClinicClosures e NFS-e Invoices
import {
  supabase,
  throwOnError,
  WAITING_LIST_COLUMNS,
  HOLIDAY_COLUMNS,
  CLINIC_CLOSURE_COLUMNS,
  NFSE_INVOICE_COLUMNS,
} from './helpers';
import { WaitingListEntry, Holiday, ClinicClosure } from '../types';

interface DBWaitingList {
  id: string;
  customer_name: string;
  phone: string;
  preferred_days: (string | number)[] | null;
  preferred_hours: string[] | null;
  psychologist_id: string | null;
  notes: string | null;
  status: 'pending' | 'called' | 'resolved' | 'canceled';
  created_at: string;
}

interface DBHoliday {
  id: string;
  date: string;
  name: string;
  type: 'nacional' | 'estadual' | 'municipal' | 'facultativo';
  recurring: boolean;
  clinic_open: boolean;
  created_at: string;
}

interface DBClinicClosure {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_at: string;
}

interface DBNfseInvoice {
  id: number | string;
  invoice_number: string;
  issue_date: string;
  status: string;
  payer: { nome: string; cpf_cnpj: string } | null;
  total_amount: number;
  description: string | null;
  created_at: string;
}

export const configService = {
  // ── Waiting List ───────────────────────────────────────────────────────────
  getWaitingList: async (): Promise<WaitingListEntry[]> => {
    const { data, error } = await supabase
      .from('waiting_list')
      .select(WAITING_LIST_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DBWaitingList[];
    return rows.map((row): WaitingListEntry => ({
      id: row.id,
      customerName: row.customer_name,
      phone: row.phone,
      preferredDays: (row.preferred_days ?? []).map(Number),
      preferredHours: row.preferred_hours ?? [],
      psychologistId: row.psychologist_id,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  createWaitingListEntry: async (e: Omit<WaitingListEntry, 'id' | 'createdAt'>): Promise<WaitingListEntry> => {
    const row = await throwOnError(
      supabase.from('waiting_list').insert({
        customer_name: e.customerName,
        phone: e.phone,
        preferred_days: e.preferredDays,
        preferred_hours: e.preferredHours,
        psychologist_id: e.psychologistId,
        notes: e.notes,
        status: e.status,
      }).select(WAITING_LIST_COLUMNS).single()
    ) as unknown as DBWaitingList;
    return { id: row.id, customerName: row.customer_name, phone: row.phone, preferredDays: (row.preferred_days ?? []).map(Number), preferredHours: row.preferred_hours ?? [], psychologistId: row.psychologist_id, notes: row.notes, status: row.status, createdAt: row.created_at };
  },

  updateWaitingListEntry: async (id: string, e: Partial<WaitingListEntry>): Promise<WaitingListEntry> => {
    const updates: Record<string, unknown> = {};
    if (e.customerName !== undefined) updates.customer_name = e.customerName;
    if (e.phone !== undefined) updates.phone = e.phone;
    if (e.preferredDays !== undefined) updates.preferred_days = e.preferredDays;
    if (e.preferredHours !== undefined) updates.preferred_hours = e.preferredHours;
    if (e.psychologistId !== undefined) updates.psychologist_id = e.psychologistId;
    if (e.notes !== undefined) updates.notes = e.notes;
    if (e.status !== undefined) updates.status = e.status;
    const row = await throwOnError(
      supabase.from('waiting_list').update(updates).eq('id', id).select(WAITING_LIST_COLUMNS).single()
    ) as unknown as DBWaitingList;
    return { id: row.id, customerName: row.customer_name, phone: row.phone, preferredDays: (row.preferred_days ?? []).map(Number), preferredHours: row.preferred_hours ?? [], psychologistId: row.psychologist_id, notes: row.notes, status: row.status, createdAt: row.created_at };
  },

  deleteWaitingListEntry: async (id: string): Promise<void> => {
    const { error } = await supabase.from('waiting_list').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Holidays ───────────────────────────────────────────────────────────────
  getHolidays: async (): Promise<Holiday[]> => {
    const { data, error } = await supabase.from('holidays').select(HOLIDAY_COLUMNS).order('date');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DBHoliday[];
    return rows.map((row) => ({
      id: row.id, date: row.date, name: row.name, type: row.type,
      recurring: row.recurring, clinicOpen: row.clinic_open, createdAt: row.created_at,
    }));
  },

  createHoliday: async (h: Omit<Holiday, 'id' | 'createdAt'>): Promise<Holiday> => {
    const row = await throwOnError(
      supabase.from('holidays').insert({
        date: h.date, name: h.name, type: h.type,
        recurring: h.recurring, clinic_open: h.clinicOpen,
      }).select(HOLIDAY_COLUMNS).single()
    ) as unknown as DBHoliday;
    return { id: row.id, date: row.date, name: row.name, type: row.type, recurring: row.recurring, clinicOpen: row.clinic_open, createdAt: row.created_at };
  },

  updateHoliday: async (id: string, h: Partial<Holiday>): Promise<Holiday> => {
    const updates: Record<string, unknown> = {};
    if (h.date !== undefined) updates.date = h.date;
    if (h.name !== undefined) updates.name = h.name;
    if (h.type !== undefined) updates.type = h.type;
    if (h.recurring !== undefined) updates.recurring = h.recurring;
    if (h.clinicOpen !== undefined) updates.clinic_open = h.clinicOpen;
    const row = await throwOnError(
      supabase.from('holidays').update(updates).eq('id', id).select(HOLIDAY_COLUMNS).single()
    ) as unknown as DBHoliday;
    return { id: row.id, date: row.date, name: row.name, type: row.type, recurring: row.recurring, clinicOpen: row.clinic_open, createdAt: row.created_at };
  },

  deleteHoliday: async (id: string): Promise<void> => {
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Clinic Closures ────────────────────────────────────────────────────────
  getClinicClosures: async (): Promise<ClinicClosure[]> => {
    const { data, error } = await supabase.from('clinic_closures').select(CLINIC_CLOSURE_COLUMNS).order('start_date');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DBClinicClosure[];
    return rows.map((row) => ({
      id: row.id, startDate: row.start_date, endDate: row.end_date,
      reason: row.reason, createdAt: row.created_at,
    }));
  },

  createClinicClosure: async (c: Omit<ClinicClosure, 'id' | 'createdAt'>): Promise<ClinicClosure> => {
    const row = await throwOnError(
      supabase.from('clinic_closures').insert({
        start_date: c.startDate, end_date: c.endDate, reason: c.reason,
      }).select(CLINIC_CLOSURE_COLUMNS).single()
    ) as unknown as DBClinicClosure;
    return { id: row.id, startDate: row.start_date, endDate: row.end_date, reason: row.reason, createdAt: row.created_at };
  },

  updateClinicClosure: async (id: string, c: Partial<ClinicClosure>): Promise<ClinicClosure> => {
    const updates: Record<string, unknown> = {};
    if (c.startDate !== undefined) updates.start_date = c.startDate;
    if (c.endDate !== undefined) updates.end_date = c.endDate;
    if (c.reason !== undefined) updates.reason = c.reason;
    const row = await throwOnError(
      supabase.from('clinic_closures').update(updates).eq('id', id).select(CLINIC_CLOSURE_COLUMNS).single()
    ) as unknown as DBClinicClosure;
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
      .from('nfse_invoices')
      .select(NFSE_INVOICE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DBNfseInvoice[];
    return rows.map((row) => ({
      id: String(row.id),
      invoiceNumber: row.invoice_number,
      issueDate: row.issue_date,
      status: row.status,
      payer: {
        nome: row.payer?.nome || '',
        cpf_cnpj: row.payer?.cpf_cnpj || '',
      },
      totalAmount: Number(row.total_amount ?? 0),
      description: row.description ?? undefined,
      createdAt: row.created_at ?? undefined,
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
