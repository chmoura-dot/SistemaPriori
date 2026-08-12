import { supabaseService } from './supabaseService';
import { supabase } from '../lib/supabase';
import { apiCache, CACHE_TTL } from './apiCache';

// Toggle this to switch between mock and real service
// export const api = mockService; // ← use this line to revert to mock data

/**
 * Envelopa `fn` para invalidar `tags` do cache assim que a escrita for
 * concluída com sucesso. Se `fn` lançar, nenhuma tag é invalidada (o dado
 * em cache continua válido, já que nada mudou no banco).
 */
function invalidateAfter<Args extends any[], R>(
  fn: (...args: Args) => Promise<R>,
  tags: string[],
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const result = await fn(...args);
    tags.forEach(tag => apiCache.invalidate(tag));
    return result;
  };
}

// ── Leituras cacheadas ───────────────────────────────────────────────────────
// Ver `apiCache.ts` para o racional completo. Resumo: navegação entre páginas
// hoje refaz do zero o download de listas que mudam pouco (psicólogos, planos,
// feriados) e até de coleções pesadas (agendamentos). Este bloco intercepta os
// métodos `get*` do supabaseService e devolve dado fresco em memória quando
// disponível, sem alterar assinatura, tipo de retorno ou tratamento de erro.
const cachedReads = {
  getPsychologists: () =>
    apiCache.get('psychologists', CACHE_TTL.MEDIUM, supabaseService.getPsychologists),

  getRooms: () =>
    apiCache.get('rooms', CACHE_TTL.LONG, supabaseService.getRooms),

  getCustomers: () =>
    apiCache.get('customers', CACHE_TTL.MEDIUM, supabaseService.getCustomers),

  getPlans: () =>
    apiCache.get('plans', CACHE_TTL.MEDIUM, supabaseService.getPlans),

  getSubscriptions: () =>
    apiCache.get('subscriptions', CACHE_TTL.MEDIUM, supabaseService.getSubscriptions),

  getPayments: () =>
    apiCache.get('payments', CACHE_TTL.SHORT, supabaseService.getPayments),

  listPaymentsBySubscription: (subscriptionId: string) =>
    apiCache.get(`payments:bySubscription:${subscriptionId}`, CACHE_TTL.SHORT, () =>
      supabaseService.listPaymentsBySubscription(subscriptionId)),

  getExpenses: () =>
    apiCache.get('expenses', CACHE_TTL.MEDIUM, supabaseService.getExpenses),

  getBillingBatches: () =>
    apiCache.get('billingBatches', CACHE_TTL.SHORT, supabaseService.getBillingBatches),

  getRepasses: () =>
    apiCache.get('repasses', CACHE_TTL.SHORT, supabaseService.getRepasses),

  getSettings: () =>
    apiCache.get('settings', CACHE_TTL.LONG, supabaseService.getSettings),

  getWaitingList: () =>
    apiCache.get('waitingList', CACHE_TTL.SHORT, supabaseService.getWaitingList),

  getHolidays: () =>
    apiCache.get('holidays', CACHE_TTL.LONG, supabaseService.getHolidays),

  getClinicClosures: () =>
    apiCache.get('clinicClosures', CACHE_TTL.LONG, supabaseService.getClinicClosures),

  getInvoices: (params?: { limit?: number }) =>
    apiCache.get(`invoices:${params?.limit ?? 20}`, CACHE_TTL.SHORT, () =>
      supabaseService.getInvoices(params)),

  // Agendamentos: TTL curto (30s) preserva o auto-refresh de 5min do Dashboard
  // e o forceRefresh da Agenda, apenas evitando refetch redundante entre eles.
  getAppointments: (date?: string) =>
    apiCache.get(`appointments:single:${date ?? 'wide-range'}`, CACHE_TTL.SHORT, () =>
      supabaseService.getAppointments(date)),

  getAppointmentsForBilling: () =>
    apiCache.get('appointments:billing', CACHE_TTL.SHORT, supabaseService.getAppointmentsForBilling),

  getAppointmentsByRange: (startDate: string, endDate: string) =>
    apiCache.get(`appointments:range:${startDate}:${endDate}`, CACHE_TTL.SHORT, () =>
      supabaseService.getAppointmentsByRange(startDate, endDate)),

  getAppointmentsByCustomer: (customerId: string) =>
    apiCache.get(`appointments:byCustomer:${customerId}`, CACHE_TTL.SHORT, () =>
      supabaseService.getAppointmentsByCustomer(customerId)),

  getAppointmentsNeedingRenewal: () =>
    apiCache.get('appointments:needingRenewal', CACHE_TTL.SHORT, supabaseService.getAppointmentsNeedingRenewal),

  getNeuroAppointments: () =>
    apiCache.get('appointments:neuro', CACHE_TTL.SHORT, supabaseService.getNeuroAppointments),
};

// ── Escritas com invalidação automática ──────────────────────────────────────
// Toda operação de criação/edição/exclusão invalida as chaves de cache que ela
// pode ter afetado, garantindo que o próximo `get*` (mesmo dentro do TTL) volte
// a bater no banco. `customers` é invalidado também por escritas em agendamentos
// porque `getCustomers()` deriva `lastAppointmentDate`/`nextAppointmentDate` a
// partir da tabela `appointments` (ver services/supabase/customerService.ts).
const writes = {
  createAppointment: invalidateAfter(supabaseService.createAppointment, ['appointments', 'customers']),
  updateAppointment: invalidateAfter(supabaseService.updateAppointment, ['appointments', 'customers']),
  rescheduleAppointmentSwap: invalidateAfter(supabaseService.rescheduleAppointmentSwap, ['appointments', 'customers']),
  deleteAppointment: invalidateAfter(supabaseService.deleteAppointment, ['appointments', 'customers']),
  deleteFutureAppointments: invalidateAfter(supabaseService.deleteFutureAppointments, ['appointments', 'customers']),

  createCustomer: invalidateAfter(supabaseService.createCustomer, ['customers']),
  updateCustomer: invalidateAfter(supabaseService.updateCustomer, ['customers']),
  deleteCustomer: invalidateAfter(supabaseService.deleteCustomer, ['customers']),

  createPsychologist: invalidateAfter(supabaseService.createPsychologist, ['psychologists']),
  updatePsychologist: invalidateAfter(supabaseService.updatePsychologist, ['psychologists']),
  deletePsychologist: invalidateAfter(supabaseService.deletePsychologist, ['psychologists']),

  createPlan: invalidateAfter(supabaseService.createPlan, ['plans']),
  updatePlan: invalidateAfter(supabaseService.updatePlan, ['plans']),
  deletePlan: invalidateAfter(supabaseService.deletePlan, ['plans']),

  createSubscription: invalidateAfter(supabaseService.createSubscription, ['subscriptions']),
  updateSubscription: invalidateAfter(supabaseService.updateSubscription, ['subscriptions']),
  deleteSubscription: invalidateAfter(supabaseService.deleteSubscription, ['subscriptions']),

  createPayment: invalidateAfter(supabaseService.createPayment, ['payments']),

  createExpense: invalidateAfter(supabaseService.createExpense, ['expenses']),
  updateExpense: invalidateAfter(supabaseService.updateExpense, ['expenses']),
  deleteExpense: invalidateAfter(supabaseService.deleteExpense, ['expenses']),

  createBillingBatch: invalidateAfter(supabaseService.createBillingBatch, ['billingBatches']),
  updateBillingBatch: invalidateAfter(supabaseService.updateBillingBatch, ['billingBatches']),
  deleteBillingBatch: invalidateAfter(supabaseService.deleteBillingBatch, ['billingBatches', 'appointments']),

  createRepasse: invalidateAfter(supabaseService.createRepasse, ['repasses']),
  updateRepasse: invalidateAfter(supabaseService.updateRepasse, ['repasses']),
  deleteRepasse: invalidateAfter(supabaseService.deleteRepasse, ['repasses']),

  createHoliday: invalidateAfter(supabaseService.createHoliday, ['holidays']),
  updateHoliday: invalidateAfter(supabaseService.updateHoliday, ['holidays']),
  deleteHoliday: invalidateAfter(supabaseService.deleteHoliday, ['holidays']),

  createClinicClosure: invalidateAfter(supabaseService.createClinicClosure, ['clinicClosures']),
  updateClinicClosure: invalidateAfter(supabaseService.updateClinicClosure, ['clinicClosures']),
  deleteClinicClosure: invalidateAfter(supabaseService.deleteClinicClosure, ['clinicClosures']),

  createWaitingListEntry: invalidateAfter(supabaseService.createWaitingListEntry, ['waitingList']),
  updateWaitingListEntry: invalidateAfter(supabaseService.updateWaitingListEntry, ['waitingList']),
  deleteWaitingListEntry: invalidateAfter(supabaseService.deleteWaitingListEntry, ['waitingList']),

  updateSettings: invalidateAfter(supabaseService.updateSettings, ['settings']),

  importInvoices: invalidateAfter(supabaseService.importInvoices, ['invoices']),
  deleteInvoice: invalidateAfter(supabaseService.deleteInvoice, ['invoices']),

  // Login/Logout: fronteira de sessão. Limpa TUDO para nunca vazar dado em
  // cache de um usuário para a sessão seguinte no mesmo navegador.
  login: async (email: string, password: string) => {
    const result = await supabaseService.login(email, password);
    apiCache.invalidate();
    return result;
  },
  logout: async () => {
    apiCache.invalidate();
    await supabaseService.logout();
  },
};

export const api = {
  ...supabaseService,
  ...cachedReads,
  ...writes,
  updateUserPassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },
};
