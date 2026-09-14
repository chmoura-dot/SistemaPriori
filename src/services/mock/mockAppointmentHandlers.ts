import {
  Appointment, AppointmentStatus, AttendanceMode,
  BillingBatch, Customer, Plan, AppointmentType,
} from '../types';
import { STORAGE_KEYS, delay, getFromStorage, saveToStorage } from './mockData';

export const mockAppointmentHandlers = {
  // ── Appointments ──────────────────────────────────────────────────────────
  getAppointments: async (date?: string): Promise<Appointment[]> => {
    await delay(300);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    return date ? list.filter(a => a.date === date) : list;
  },

  getAppointmentsForBilling: async (): Promise<Appointment[]> => {
    await delay(300);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    return list.sort((a, b) => b.date.localeCompare(a.date));
  },

  createAppointment: async (data: Omit<Appointment, 'id' | 'createdAt'>): Promise<Appointment> => {
    await delay(500);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    const customers = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const plans = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    const customer = customers.find(c => c.id === data.customerId);
    const plan = plans.find(p => p.name === customer?.healthPlan);
    const procedure = plan?.procedures?.find(proc => proc.type === data.type);
    const basePrice = data.customPrice ?? (customer?.customPrice ?? procedure?.price);
    const baseRepass = data.customRepassAmount ?? (customer?.customRepassAmount ?? procedure?.repassAmount);

    const createSingle = (date: string, isRecurring: boolean, groupId?: string, needsRenewal?: boolean): Appointment => {
      if (data.mode === AttendanceMode.PRESENCIAL && data.roomId) {
        const conflict = appointments.find(a => {
          if (a.date !== date || a.roomId !== data.roomId || a.mode !== AttendanceMode.PRESENCIAL) return false;
          return data.startTime < a.endTime && data.endTime > a.startTime;
        });
        if (conflict) throw new Error(`Conflito em ${date}: Sala ocupada (${conflict.startTime} - ${conflict.endTime}).`);
      }
      const dateObj = new Date(date + 'T12:00:00');
      return {
        ...data,
        id: Math.random().toString(36).substr(2, 9),
        date,
        dayOfWeek: dateObj.getDay(),
        status: data.status || AppointmentStatus.ACTIVE,
        isRecurring,
        recurrenceGroupId: groupId,
        needsRenewal,
        customPrice: basePrice,
        customRepassAmount: baseRepass,
        confirmedPatient: false,
        confirmedPsychologist: false,
        createdAt: new Date().toISOString(),
      };
    };

    if (data.isRecurring) {
      const groupId = Math.random().toString(36).substr(2, 9);
      const newApps: Appointment[] = [];
      for (let i = 0; i < 4; i++) {
        const d = new Date(data.date + 'T12:00:00');
        d.setDate(d.getDate() + (i * 7));
        newApps.push(createSingle(d.toISOString().split('T')[0], true, groupId, i === 3));
      }
      saveToStorage(STORAGE_KEYS.APPOINTMENTS, [...appointments, ...newApps]);
      return newApps[0];
    }

    const newApp = createSingle(data.date, false);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, [...appointments, newApp]);
    return newApp;
  },

  updateAppointment: async (id: string, data: Partial<Appointment>): Promise<Appointment> => {
    await delay(300);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Appointment not found');
    const original = list[idx];
    if (data.psychologistId && original.recurrenceGroupId) {
      const updated = list.map(a => {
        if (a.recurrenceGroupId === original.recurrenceGroupId && a.date >= original.date)
          return { ...a, ...data };
        return a.id === id ? { ...a, ...data } : a;
      });
      saveToStorage(STORAGE_KEYS.APPOINTMENTS, updated);
      return updated.find(a => a.id === id)!;
    }
    const updated = list.map(a => a.id === id ? { ...a, ...data } : a);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, updated);
    return updated.find(a => a.id === id)!;
  },

  deleteAppointment: async (id: string): Promise<void> => {
    await delay(500);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, list.filter(a => a.id !== id));
  },

  rescheduleAppointmentSwap: async (
    { originalAppointmentId, newAppointment }: {
      originalAppointmentId: string;
      newAppointment: Omit<Appointment, 'id' | 'createdAt' | 'confirmedPatient' | 'confirmedPsychologist' | 'status'>;
    }
  ): Promise<{ originalAppointmentId: string; newAppointmentId: string }> => {
    await delay(500);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    const newId = Math.random().toString(36).substr(2, 9);
    const dateObj = new Date(newAppointment.date + 'T12:00:00');
    const newApp: Appointment = {
      ...(newAppointment as any),
      id: newId,
      dayOfWeek: dateObj.getDay(),
      status: AppointmentStatus.ACTIVE,
      confirmedPatient: false,
      confirmedPsychologist: false,
      confirmationStatus: 'pending',
      replacesAppointmentId: originalAppointmentId,
      createdAt: new Date().toISOString(),
    };
    const updated = list.map(a =>
      a.id === originalAppointmentId
        ? {
            ...a,
            status: AppointmentStatus.CANCELED,
            cancellationType: 'reschedule' as const,
            cancellationBilling: 'none' as const,
            cancellationFault: null,
            confirmedPsychologist: false,
            replacedByAppointmentId: newId,
          }
        : a
    );
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, [...updated, newApp]);
    return { originalAppointmentId, newAppointmentId: newId };
  },

  getAppointmentsByRange: async (startDate: string, endDate: string): Promise<Appointment[]> => {
    await delay(300);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    return list.filter(a => a.date >= startDate && a.date <= endDate);
  },

  getAppointmentsByCustomer: async (customerId: string): Promise<Appointment[]> => {
    await delay(300);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    return list.filter(a => a.customerId === customerId);
  },

  getNeuroAppointments: async (): Promise<Appointment[]> => {
    await delay(300);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    return list.filter(a => a.type === AppointmentType.NEUROPSICOLOGICA);
  },

  getAppointmentsNeedingRenewal: async (): Promise<Appointment[]> => {
    await delay(300);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    return list.filter(a => a.needsRenewal);
  },

  deleteFutureAppointments: async (groupId: string, fromDate: string): Promise<void> => {
    await delay(500);
    const list = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, list.filter(a =>
      !(a.recurrenceGroupId === groupId && a.date >= fromDate)
    ));
  },

  updatePassword: async (_newPassword: string): Promise<void> => { await delay(500); },
  verifyCurrentPassword: async (_password: string): Promise<boolean> => { await delay(300); return true; },

  // ── Billing Batches ───────────────────────────────────────────────────────
  getBillingBatches: async (): Promise<BillingBatch[]> => {
    await delay(300);
    return getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
  },

  createBillingBatch: async (data: Omit<BillingBatch, 'id' | 'createdAt'>): Promise<BillingBatch> => {
    await delay(500);
    const batches = getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
    const item: BillingBatch = { ...data, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    saveToStorage(STORAGE_KEYS.BILLING_BATCHES, [...batches, item]);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, appointments.map(a =>
      data.appointmentIds.includes(a.id) ? { ...a, billingBatchId: item.id } : a
    ));
    return item;
  },

  updateBillingBatch: async (id: string, data: Partial<BillingBatch>): Promise<BillingBatch> => {
    await delay(500);
    const list = getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
    const idx = list.findIndex(b => b.id === id);
    if (idx === -1) throw new Error('Billing batch not found');
    const updated = { ...list[idx], ...data };
    list[idx] = updated;
    saveToStorage(STORAGE_KEYS.BILLING_BATCHES, list);
    return updated;
  },

  deleteBillingBatch: async (id: string): Promise<void> => {
    await delay(500);
    const batches = getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
    if (!batches.find(b => b.id === id)) return;
    saveToStorage(STORAGE_KEYS.BILLING_BATCHES, batches.filter(b => b.id !== id));
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, appointments.map(a => {
      if (a.billingBatchId === id) { const { billingBatchId, ...rest } = a; return rest as Appointment; }
      return a;
    }));
  },

  // Equivalente mock da RPC sync_billing_batch_appointments (ver
  // 20260910_billing_batch_atomic_rpcs.sql) — aqui é apenas local/síncrono via
  // localStorage, então não há risco real de falha parcial como no Supabase.
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
    await delay(500);
    const batches = getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
    const idx = batches.findIndex(b => b.id === params.batchId);
    if (idx === -1) throw new Error('Billing batch not found');

    const oldIds = batches[idx].appointmentIds ?? [];
    const added = params.appointmentIds.filter(i => !oldIds.includes(i));
    const removed = oldIds.filter(i => !params.appointmentIds.includes(i));
    const ignoredSet = new Set(params.ignoredIds ?? []);

    batches[idx] = {
      ...batches[idx],
      appointmentIds: params.appointmentIds,
      totalAmount: params.totalAmount,
      status: params.status ?? batches[idx].status,
      batchNumber: params.batchNumber ?? batches[idx].batchNumber,
      sentAt: params.sentAt ?? batches[idx].sentAt,
      paidAt: params.paidAt ?? batches[idx].paidAt,
    };
    saveToStorage(STORAGE_KEYS.BILLING_BATCHES, batches);

    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, appointments.map(a => {
      if (added.includes(a.id)) return { ...a, billingBatchId: params.batchId };
      if (removed.includes(a.id) && a.billingBatchId === params.batchId) {
        return {
          ...a,
          billingBatchId: undefined,
          ...(ignoredSet.has(a.id)
            ? { billingIgnored: true, billingIgnoredReason: params.ignoredReason, billingIgnoredAt: new Date().toISOString() }
            : {}),
        };
      }
      return a;
    }));

    return { added, removed };
  },

  // Equivalente mock da RPC mark_billing_batch_paid (ver
  // 20260914_audit_operation_grouping.sql).
  markBillingBatchPaid: async (params: {
    batchId: string;
    statuses: Array<{ id: string; status: 'paid' | 'denied' | null; reason?: string | null; resolution?: string | null }>;
    paidAt: string;
    batchStatus: BillingBatch['status'];
    batchPaidAt: string | null;
    operationId?: string;
  }): Promise<{ success: boolean; updated: number }> => {
    await delay(500);
    const statusesById = new Map(params.statuses.map(s => [s.id, s]));

    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, appointments.map(a => {
      const s = statusesById.get(a.id);
      if (!s || a.billingBatchId !== params.batchId) return a;
      const isPaid = s.status === 'paid';
      const isDenied = s.status === 'denied';
      return {
        ...a,
        billingStatus: isPaid ? 'paid' : (isDenied ? 'denied' : undefined),
        denialReason: isDenied ? (s.reason ?? undefined) : undefined,
        denialResolution: isDenied ? (s.resolution ?? undefined) : undefined,
        paidAt: isPaid ? params.paidAt : undefined,
      } as Appointment;
    }));

    const batches = getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
    const idx = batches.findIndex(b => b.id === params.batchId);
    if (idx !== -1 && batches[idx].status !== params.batchStatus) {
      batches[idx] = { ...batches[idx], status: params.batchStatus, paidAt: params.batchPaidAt ?? undefined };
      saveToStorage(STORAGE_KEYS.BILLING_BATCHES, batches);
    }

    return { success: true, updated: params.statuses.length };
  },
};
