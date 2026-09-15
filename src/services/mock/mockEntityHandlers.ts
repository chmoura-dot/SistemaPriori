import {
  Customer, CustomerStatus, Plan, Subscription, SubscriptionStatus, Payment,
  Psychologist, Room, Expense, User, UserRole,
  Appointment, AppointmentStatus,
} from '../types';
import { STORAGE_KEYS, delay, getFromStorage, saveToStorage } from './mockData';
import { getTodayISO, toISODateLocal } from '../../lib/dateUtils';

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
  getAppUsers: async (): Promise<Array<{ email: string; role: UserRole }>> => {
    await delay(200);
    return [
      { email: 'admin@priori.com', role: UserRole.ADMIN },
      { email: 'secretaria@priori.com', role: UserRole.SECRETARIA },
    ];
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
  getAllBankInfo: async (): Promise<Record<string, { pixKeyType?: Psychologist['pixKeyType']; pixKey?: string }>> => {
    await delay(100);
    const list = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    const map: Record<string, { pixKeyType?: Psychologist['pixKeyType']; pixKey?: string }> = {};
    for (const p of list) {
      if (p.pixKey) map[p.id] = { pixKeyType: p.pixKeyType, pixKey: p.pixKey };
    }
    return map;
  },
  setBankInfo: async (psychologistId: string, pixKeyType: Psychologist['pixKeyType'], pixKey: string): Promise<void> => {
    await delay(300);
    const list = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    const idx = list.findIndex(p => p.id === psychologistId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], pixKeyType, pixKey };
    saveToStorage(STORAGE_KEYS.PSYCHOLOGISTS, list);
  },

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
  getAllAmsPasswords: async (): Promise<Record<string, string>> => {
    await delay(100);
    const list = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const map: Record<string, string> = {};
    for (const c of list) {
      if (c.amsPassword) map[c.id] = c.amsPassword;
    }
    return map;
  },
  setAmsPassword: async (customerId: string, amsPassword: string): Promise<void> => {
    await delay(300);
    const list = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const idx = list.findIndex(c => c.id === customerId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], amsPassword };
    saveToStorage(STORAGE_KEYS.CUSTOMERS, list);
  },
  inactivateCustomer: async (customerId: string, reason: string): Promise<void> => {
    await delay(500);
    const customers = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const idx = customers.findIndex(c => c.id === customerId);
    if (idx === -1) throw new Error('Paciente não encontrado');
    customers[idx] = { ...customers[idx], status: CustomerStatus.INACTIVE, inactivationReason: reason };
    saveToStorage(STORAGE_KEYS.CUSTOMERS, customers);

    const today = getTodayISO();
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    const updatedAppointments = appointments.map(a =>
      a.customerId === customerId && a.date >= today && (a.status === AppointmentStatus.ACTIVE || a.status === AppointmentStatus.RELEASED)
        ? { ...a, status: AppointmentStatus.CANCELED, cancellationBilling: 'none' as const }
        : a
    );
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, updatedAppointments);

    // Espelha o RPC real (inactivate_customer), que grava status='inactive'
    // em subscriptions — valor que hoje não existe em SubscriptionStatus
    // (só ACTIVE/EXPIRED/CANCELLED). Mantido igual ao banco de propósito;
    // vale revisitar esse enum numa limpeza futura.
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const updatedSubs = subs.map(s =>
      s.customerId === customerId && s.status === SubscriptionStatus.ACTIVE
        ? { ...s, status: 'inactive' as SubscriptionStatus }
        : s
    );
    saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, updatedSubs);
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
  bulkAdjustPlanPrices: async (params: {
    planIds: string[];
    amount: number;
    adjustPrice: boolean;
    adjustRepass: boolean;
    effectiveDate: string;
    minPrice?: number;
  }): Promise<{ plansUpdated: number; appointmentsUpdated: number; clampedCount: number }> => {
    await delay(500);
    const minPrice = params.minPrice ?? 0;
    const plans = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    const targetPlans = plans.filter(p => params.planIds.includes(p.id));
    if (targetPlans.length === 0) return { plansUpdated: 0, appointmentsUpdated: 0, clampedCount: 0 };

    let clampedCount = 0;
    for (const plan of targetPlans) {
      for (const proc of plan.procedures || []) {
        if (params.adjustPrice && proc.price + params.amount < minPrice) clampedCount++;
        if (params.adjustRepass && proc.repassAmount + params.amount < minPrice) clampedCount++;
      }
    }

    // 1) Agendamentos futuros ainda não faturados (calculado a partir dos
    //    preços originais dos planos, antes de reajustá-los abaixo).
    const customers = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const psychologists = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    const planNames = targetPlans.map(p => p.name.toUpperCase());
    let appointmentsUpdated = 0;
    const updatedAppointments = appointments.map(app => {
      if (app.billingBatchId) return app;
      if (app.date < params.effectiveDate) return app;
      const customer = customers.find(c => c.id === app.customerId);
      if (!customer || !planNames.includes((customer.healthPlan || '').toUpperCase())) return app;
      const plan = targetPlans.find(p => p.name.toUpperCase() === (customer.healthPlan || '').toUpperCase());
      const proc = plan?.procedures?.find(pr => pr.type === app.type);
      if (!proc) return app;
      const psy = psychologists.find(p => p.id === app.psychologistId);
      const updated = { ...app };
      let changed = false;
      if (params.adjustPrice) {
        updated.customPrice = Math.max(minPrice, (app.customPrice ?? proc.price) + params.amount);
        changed = true;
      }
      if (params.adjustRepass && !psy?.repassOverridesPlan) {
        updated.customRepassAmount = Math.max(minPrice, (app.customRepassAmount ?? proc.repassAmount) + params.amount);
        changed = true;
      }
      if (changed) appointmentsUpdated++;
      return updated;
    });
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, updatedAppointments);

    // 2) Planos.
    const updatedPlans = plans.map(plan => {
      if (!params.planIds.includes(plan.id)) return plan;
      return {
        ...plan,
        procedures: (plan.procedures || []).map(proc => ({
          ...proc,
          price: params.adjustPrice ? Math.max(minPrice, proc.price + params.amount) : proc.price,
          repassAmount: params.adjustRepass ? Math.max(minPrice, proc.repassAmount + params.amount) : proc.repassAmount,
        })),
      };
    });
    saveToStorage(STORAGE_KEYS.PLANS, updatedPlans);

    return { plansUpdated: targetPlans.length, appointmentsUpdated, clampedCount };
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  getSubscriptions: async (): Promise<Subscription[]> => {
    await delay(300);
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const today = getTodayISO();
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
      subs[subIdx] = { ...sub, status: SubscriptionStatus.ACTIVE, nextRenewal: toISODateLocal(nextDate) };
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
