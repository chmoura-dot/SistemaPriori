import {
  Customer, Plan, Subscription, SubscriptionStatus, Payment,
  Psychologist, Room, Expense, User, UserRole,
} from '../types';
import { STORAGE_KEYS, delay, getFromStorage, saveToStorage } from './mockData';

export const mockEntityHandlers = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  login: async (email: string, password: string): Promise<User | null> => {
    await delay(500);
    let role: UserRole | null = null;
    const normalized = email.toLowerCase().trim();
    if ((normalized === 'admin@priori.com' || normalized === 'admin@prioriclinica.com.br') && password === 'admin123')
      role = UserRole.ADMIN;
    else if ((normalized === 'secretaria@priori.com' || normalized === 'secretaria@prioriclinica.com.br') && password === 'sec123')
      role = UserRole.SECRETARIA;
    if (role) {
      const user: User = { email: normalized, role };
      localStorage.setItem(STORAGE_KEYS.AUTH, 'true');
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      return user;
    }
    return null;
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },
  isAuthenticated: (): boolean => localStorage.getItem(STORAGE_KEYS.AUTH) === 'true',
  getCurrentUser: (): User | null => {
    const userData = localStorage.getItem(STORAGE_KEYS.USER);
    return userData ? JSON.parse(userData) : null;
  },

  // ── Psychologists ─────────────────────────────────────────────────────────
  getPsychologists: async (): Promise<Psychologist[]> => {
    await delay(200);
    return getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
  },
  createPsychologist: async (data: Omit<Psychologist, 'id'>): Promise<Psychologist> => {
    await delay(500);
    const list = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    const item: Psychologist = { ...data, id: Math.random().toString(36).substr(2, 9) };
    saveToStorage(STORAGE_KEYS.PSYCHOLOGISTS, [...list, item]);
    return item;
  },
  updatePsychologist: async (id: string, data: Partial<Psychologist>): Promise<Psychologist> => {
    await delay(500);
    const list = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Psychologist not found');
    const updated = { ...list[idx], ...data };
    list[idx] = updated;
    saveToStorage(STORAGE_KEYS.PSYCHOLOGISTS, list);
    return updated;
  },
  deletePsychologist: async (id: string): Promise<void> => {
    await delay(500);
    const list = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    saveToStorage(STORAGE_KEYS.PSYCHOLOGISTS, list.filter(p => p.id !== id));
  },
  invitePsychologist: async (_email: string): Promise<void> => { await delay(300); },

  // ── Rooms ─────────────────────────────────────────────────────────────────
  getRooms: async (): Promise<Room[]> => {
    await delay(200);
    return getFromStorage<Room>(STORAGE_KEYS.ROOMS);
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  getCustomers: async (): Promise<Customer[]> => {
    await delay(300);
    return getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
  },
  createCustomer: async (data: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> => {
    await delay(500);
    const list = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const item: Customer = { ...data, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    saveToStorage(STORAGE_KEYS.CUSTOMERS, [...list, item]);
    return item;
  },
  updateCustomer: async (id: string, data: Partial<Customer>): Promise<Customer> => {
    await delay(500);
    const list = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Customer not found');
    const updated = { ...list[idx], ...data };
    list[idx] = updated;
    saveToStorage(STORAGE_KEYS.CUSTOMERS, list);
    return updated;
  },
  deleteCustomer: async (id: string): Promise<void> => {
    await delay(500);
    const list = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    saveToStorage(STORAGE_KEYS.CUSTOMERS, list.filter(c => c.id !== id));
  },

  // ── Plans ─────────────────────────────────────────────────────────────────
  getPlans: async (): Promise<Plan[]> => {
    await delay(300);
    return getFromStorage<Plan>(STORAGE_KEYS.PLANS);
  },
  createPlan: async (data: Omit<Plan, 'id' | 'createdAt'>): Promise<Plan> => {
    await delay(500);
    const list = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    const item: Plan = { ...data, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    saveToStorage(STORAGE_KEYS.PLANS, [...list, item]);
    return item;
  },
  updatePlan: async (id: string, data: Partial<Plan>): Promise<Plan> => {
    await delay(500);
    const list = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Plan not found');
    const updated = { ...list[idx], ...data };
    list[idx] = updated;
    saveToStorage(STORAGE_KEYS.PLANS, list);
    return updated;
  },
  deletePlan: async (id: string): Promise<void> => {
    await delay(500);
    const list = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    saveToStorage(STORAGE_KEYS.PLANS, list.filter(p => p.id !== id));
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  getSubscriptions: async (): Promise<Subscription[]> => {
    await delay(300);
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const today = new Date().toISOString().split('T')[0];
    let changed = false;
    const updated = subs.map(s => {
      if (s.status === SubscriptionStatus.ACTIVE && today > s.nextRenewal) {
        changed = true;
        return { ...s, status: SubscriptionStatus.EXPIRED };
      }
      return s;
    });
    if (changed) saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, updated);
    return updated;
  },
  createSubscription: async (data: Omit<Subscription, 'id' | 'createdAt'>): Promise<Subscription> => {
    await delay(500);
    const list = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const item: Subscription = { ...data, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, [...list, item]);
    return item;
  },
  updateSubscription: async (id: string, data: Partial<Subscription>): Promise<Subscription> => {
    await delay(500);
    const list = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Subscription not found');
    const updated = { ...list[idx], ...data };
    list[idx] = updated;
    saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, list);
    return updated;
  },
  deleteSubscription: async (id: string): Promise<void> => {
    await delay(500);
    const list = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, list.filter(s => s.id !== id));
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  getPayments: async (): Promise<Payment[]> => {
    await delay(300);
    return getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS);
  },
  createPayment: async (data: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> => {
    await delay(500);
    const payments = getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS);
    const item: Payment = { ...data, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    saveToStorage(STORAGE_KEYS.PAYMENTS, [...payments, item]);
    // Atualiza próximo vencimento da assinatura
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const subIdx = subs.findIndex(s => s.id === data.subscriptionId);
    if (subIdx !== -1) {
      const sub = subs[subIdx];
      const nextDate = new Date(sub.nextRenewal);
      nextDate.setDate(nextDate.getDate() + 30);
      subs[subIdx] = { ...sub, status: SubscriptionStatus.ACTIVE, nextRenewal: nextDate.toISOString().split('T')[0] };
      saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, subs);
    }
    return item;
  },
  listPaymentsBySubscription: async (subscriptionId: string): Promise<Payment[]> => {
    await delay(300);
    const list = getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS);
    return list.filter(p => p.subscriptionId === subscriptionId);
  },

  // ── Expenses ──────────────────────────────────────────────────────────────
  getExpenses: async (): Promise<Expense[]> => {
    await delay(300);
    return getFromStorage<Expense>(STORAGE_KEYS.EXPENSES);
  },
  createExpense: async (data: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
    await delay(500);
    const list = getFromStorage<Expense>(STORAGE_KEYS.EXPENSES);
    const item: Expense = { ...data, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    saveToStorage(STORAGE_KEYS.EXPENSES, [...list, item]);
    return item;
  },
  updateExpense: async (id: string, data: Partial<Expense>): Promise<Expense> => {
    await delay(500);
    const list = getFromStorage<Expense>(STORAGE_KEYS.EXPENSES);
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Expense not found');
    const updated = { ...list[idx], ...data };
    list[idx] = updated;
    saveToStorage(STORAGE_KEYS.EXPENSES, list);
    return updated;
  },
  deleteExpense: async (id: string): Promise<void> => {
    await delay(500);
    const list = getFromStorage<Expense>(STORAGE_KEYS.EXPENSES);
    saveToStorage(STORAGE_KEYS.EXPENSES, list.filter(e => e.id !== id));
  },
};
