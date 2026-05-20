import { WaitingListEntry } from '../types';
import { STORAGE_KEYS, delay, getFromStorage, saveToStorage } from './mockData';

export const mockMiscHandlers = {
  // ── Invoices (NFS-e) ──────────────────────────────────────────────────────
  getInvoices: async (_params: any) => { await delay(200); return []; },
  importInvoices: async (_invoices: any[]) => { await delay(500); return { success: true, importedCount: _invoices.length }; },
  deleteInvoice: async (_id: string) => { await delay(300); },

  // ── Repasses ──────────────────────────────────────────────────────────────
  getRepasses: async () => {
    await delay(300);
    return JSON.parse(localStorage.getItem('priori_repasses') || '[]');
  },
  createRepasse: async (data: any) => {
    await delay(500);
    const repasses = JSON.parse(localStorage.getItem('priori_repasses') || '[]');
    const item = { ...data, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    localStorage.setItem('priori_repasses', JSON.stringify([...repasses, item]));
    return item;
  },
  updateRepasse: async (id: string, data: any) => {
    await delay(500);
    const repasses = JSON.parse(localStorage.getItem('priori_repasses') || '[]');
    const idx = repasses.findIndex((r: any) => r.id === id);
    if (idx === -1) throw new Error('Repasse not found');
    const updated = { ...repasses[idx], ...data };
    repasses[idx] = updated;
    localStorage.setItem('priori_repasses', JSON.stringify(repasses));
    return updated;
  },
  deleteRepasse: async (id: string) => {
    await delay(500);
    const repasses = JSON.parse(localStorage.getItem('priori_repasses') || '[]');
    localStorage.setItem('priori_repasses', JSON.stringify(repasses.filter((r: any) => r.id !== id)));
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: async () => {
    await delay(200);
    const stored = localStorage.getItem('priori_settings');
    return stored ? JSON.parse(stored) : { id: 'settings1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  },
  updateSettings: async (id: string, data: any) => {
    await delay(500);
    const stored = localStorage.getItem('priori_settings');
    const current = stored ? JSON.parse(stored) : { id: 'settings1' };
    const updated = { ...current, ...data, updatedAt: new Date().toISOString() };
    localStorage.setItem('priori_settings', JSON.stringify(updated));
    return updated;
  },

  // ── Waiting List ──────────────────────────────────────────────────────────
  getWaitingList: async (): Promise<WaitingListEntry[]> => {
    await delay(250);
    return getFromStorage<WaitingListEntry>(STORAGE_KEYS.WAITING_LIST);
  },
  createWaitingListEntry: async (entry: Omit<WaitingListEntry, 'id' | 'createdAt'>): Promise<WaitingListEntry> => {
    await delay(400);
    const list = getFromStorage<WaitingListEntry>(STORAGE_KEYS.WAITING_LIST);
    const item: WaitingListEntry = { ...entry, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    saveToStorage(STORAGE_KEYS.WAITING_LIST, [...list, item]);
    return item;
  },
  updateWaitingListEntry: async (id: string, entry: Partial<WaitingListEntry>): Promise<WaitingListEntry> => {
    await delay(400);
    const list = getFromStorage<WaitingListEntry>(STORAGE_KEYS.WAITING_LIST);
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Waiting list entry not found');
    const updated = { ...list[idx], ...entry };
    list[idx] = updated;
    saveToStorage(STORAGE_KEYS.WAITING_LIST, list);
    return updated;
  },
  deleteWaitingListEntry: async (id: string): Promise<void> => {
    await delay(400);
    const list = getFromStorage<WaitingListEntry>(STORAGE_KEYS.WAITING_LIST);
    saveToStorage(STORAGE_KEYS.WAITING_LIST, list.filter(e => e.id !== id));
  },

  // ── Holidays (mock — sem persistência) ───────────────────────────────────
  getHolidays: async () => { await delay(200); return []; },
  createHoliday: async (h: any) => {
    await delay(300);
    return { ...h, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
  },
  updateHoliday: async (id: string, h: any) => {
    await delay(300);
    return { id, date: '', name: '', type: 'nacional' as const, recurring: false, clinicOpen: false, createdAt: '', ...h };
  },
  deleteHoliday: async (_id: string) => { await delay(200); },

  // ── Clinic Closures (mock — sem persistência) ─────────────────────────────
  getClinicClosures: async () => { await delay(200); return []; },
  createClinicClosure: async (c: any) => {
    await delay(300);
    return { ...c, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
  },
  updateClinicClosure: async (id: string, c: any) => {
    await delay(300);
    return { id, startDate: '', endDate: '', reason: '', createdAt: '', ...c };
  },
  deleteClinicClosure: async (_id: string) => { await delay(200); },
};
