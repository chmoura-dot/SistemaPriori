import {
  Psychologist,
  Room,
  Customer,
  Appointment,
  BillingBatch,
  Plan,
  Subscription,
  Payment,
  Expense,
  Repasse,
  Settings,
  Holiday,
  ClinicClosure,
  WaitingListEntry,
  User,
  PortfolioItem,
  RoomRental,
} from './models';
import { UserRole, RecurrenceFrequency } from './enums';
import { AuditLogEntry } from './audit';

export interface AppService {
  // NFS-e / Invoices
  importInvoices: (invoices: Array<{
    invoiceNumber: string;
    issueDate: string;
    payerName: string;
    payerCNPJ: string;
    totalAmount: number;
    description?: string;
  }>) => Promise<{ success: boolean; importedCount: number }>;

  getInvoices: (params?: { limit?: number }) => Promise<
    Array<{
      id: string;
      invoiceNumber: string;
      issueDate: string;
      status: string;
      payer: { nome: string; cpf_cnpj: string };
      totalAmount: number;
      description?: string | null;
      createdAt?: string;
    }>
  >;

  deleteInvoice: (id: string) => Promise<void>;

  // Auth
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => void;
  isAuthenticated: () => boolean;
  getCurrentUser: () => User | null;
  updatePassword: (newPassword: string) => Promise<void>;
  // Confirma a senha atual antes de permitir a troca (reautenticação).
  verifyCurrentPassword: (password: string) => Promise<boolean>;

  // Psychologists
  getPsychologists: () => Promise<Psychologist[]>;
  createPsychologist: (psychologist: Omit<Psychologist, 'id'>) => Promise<Psychologist>;
  updatePsychologist: (id: string, psychologist: Partial<Psychologist>) => Promise<Psychologist>;
  deletePsychologist: (id: string) => Promise<void>;
  invitePsychologist: (email: string) => Promise<void>;
  // Chave PIX: tabela dedicada, leitura restrita a admin via RLS.
  getAllBankInfo: () => Promise<Record<string, { pixKeyType?: Psychologist['pixKeyType']; pixKey?: string }>>;
  setBankInfo: (psychologistId: string, pixKeyType: Psychologist['pixKeyType'], pixKey: string) => Promise<void>;

  // Rooms
  getRooms: () => Promise<Room[]>;

  // Room Rentals (sublocação de sala) — psicólogo reserva a sala e paga a
  // clínica; fluxo financeiro inverso ao repasse. Ver room_rentals.
  getRoomRentals: () => Promise<RoomRental[]>;
  getRoomRentalsByRange: (startDate: string, endDate: string) => Promise<RoomRental[]>;
  createRoomRental: (params: {
    roomId: string;
    psychologistId: string;
    date: string;
    startTime: string;
    endTime: string;
    amount: number;
    isRecurring: boolean;
    recurrenceFrequency?: RecurrenceFrequency;
    notes?: string;
    operationId?: string;
  }) => Promise<{ createdIds: string[]; recurrenceGroupId?: string }>;
  cancelRoomRental: (id: string, reason: string) => Promise<void>;
  cancelFutureRoomRentals: (groupId: string, fromDate: string, reason: string, operationId?: string) => Promise<void>;
  markRoomRentalsPaid: (ids: string[], paidAt: string, operationId?: string) => Promise<void>;

  // Appointments
  getAppointments: (date?: string) => Promise<Appointment[]>;
  getAppointmentsForBilling: () => Promise<Appointment[]>;
  getAppointmentsByRange: (startDate: string, endDate: string) => Promise<Appointment[]>;
  getAppointmentsByCustomer: (customerId: string) => Promise<Appointment[]>;
  getAppointmentsNeedingRenewal: () => Promise<Appointment[]>;
  getNeuroAppointments: () => Promise<Appointment[]>;
  createAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt' | 'confirmedPatient' | 'confirmedPsychologist'>) => Promise<Appointment>;
  updateAppointment: (id: string, appointment: Partial<Appointment>) => Promise<Appointment>;
  /**
   * Remanejamento atômico: cancela o atendimento original (como 'reschedule')
   * e cria o novo atendimento vinculado, numa única transação no banco.
   */
  rescheduleAppointmentSwap: (params: {
    originalAppointmentId: string;
    newAppointment: Omit<
      Appointment,
      'id' | 'createdAt' | 'confirmedPatient' | 'confirmedPsychologist' | 'status'
    >;
  }) => Promise<{ originalAppointmentId: string; newAppointmentId: string }>;
  deleteAppointment: (id: string) => Promise<void>;
  deleteFutureAppointments: (groupId: string, fromDate: string, operationId?: string) => Promise<void>;

  // Customers
  getCustomers: () => Promise<Customer[]>;
  createCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>) => Promise<Customer>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<Customer>;
  deleteCustomer: (id: string) => Promise<void>;
  // Senha AMS/PAE: tabela dedicada, leitura restrita a admin via RLS.
  getAllAmsPasswords: () => Promise<Record<string, string>>;
  setAmsPassword: (customerId: string, amsPassword: string) => Promise<void>;
  // Transação atômica: inativa paciente, cancela consultas futuras, registra
  // evento de alta e pausa assinaturas em uma única chamada.
  inactivateCustomer: (customerId: string, reason: string) => Promise<void>;
  // Contraparte de inactivateCustomer. Com restoreRelated=true, também
  // restaura consultas/assinaturas/evento de alta gerados pela mesma
  // inativação (via audit_log); com false, só devolve o cadastro a Ativo.
  reactivateCustomer: (customerId: string, restoreRelated: boolean) => Promise<void>;
  // Correção retroativa do plano de saúde / propagação de preço customizado
  // nos atendimentos não faturados do paciente — cada uma roda numa única
  // transação marcada com operationId para agrupamento na Auditoria Financeira.
  applyCustomerHealthPlanRetro: (params: {
    customerId: string;
    healthPlan: string;
    futureOnly?: boolean;
    operationId?: string;
  }) => Promise<{ updatedCount: number; blockedCount: number }>;
  applyCustomerPricePropagation: (params: {
    customerId: string;
    customPrice: number;
    operationId?: string;
  }) => Promise<{ updatedCount: number }>;

  // Plans
  getPlans: () => Promise<Plan[]>;
  createPlan: (plan: Omit<Plan, 'id' | 'createdAt'>) => Promise<Plan>;
  updatePlan: (id: string, plan: Partial<Plan>) => Promise<Plan>;
  deletePlan: (id: string) => Promise<void>;
  // Transação atômica: reajusta planos + agendamentos futuros ainda não
  // faturados numa única operação, travando qualquer valor resultante em
  // minPrice (nunca negativo).
  bulkAdjustPlanPrices: (params: {
    planIds: string[];
    amount: number;
    adjustPrice: boolean;
    adjustRepass: boolean;
    effectiveDate: string;
    minPrice?: number;
    operationId?: string;
  }) => Promise<{ plansUpdated: number; appointmentsUpdated: number; clampedCount: number }>;

  // Subscriptions
  getSubscriptions: () => Promise<Subscription[]>;
  createSubscription: (subscription: Omit<Subscription, 'id' | 'createdAt'>) => Promise<Subscription>;
  updateSubscription: (id: string, subscription: Partial<Subscription>) => Promise<Subscription>;
  deleteSubscription: (id: string) => Promise<void>;

  // Payments
  getPayments: () => Promise<Payment[]>;
  createPayment: (payment: Omit<Payment, 'id' | 'createdAt'>) => Promise<Payment>;
  listPaymentsBySubscription: (subscriptionId: string) => Promise<Payment[]>;

  // Expenses
  getExpenses: () => Promise<Expense[]>;
  createExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<Expense>;
  updateExpense: (id: string, expense: Partial<Expense>) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;

  // Billing
  getBillingBatches: () => Promise<BillingBatch[]>;
  createBillingBatch: (batch: Omit<BillingBatch, 'id' | 'createdAt'>) => Promise<BillingBatch>;
  updateBillingBatch: (id: string, batch: Partial<BillingBatch>) => Promise<BillingBatch>;
  deleteBillingBatch: (id: string) => Promise<void>;
  // Sincroniza atomicamente (via RPC) o array appointment_ids de um lote com a
  // coluna appointments.billing_batch_id dos IDs afetados — ver
  // 20260910_billing_batch_atomic_rpcs.sql.
  syncBillingBatchAppointments: (params: {
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
  }) => Promise<{ added: string[]; removed: string[] }>;
  // Marca todos os atendimentos de um lote como pagos/glosados numa única
  // transação — ver 20260914_audit_operation_grouping.sql.
  markBillingBatchPaid: (params: {
    batchId: string;
    statuses: Array<{ id: string; status: 'paid' | 'denied' | null; reason?: string | null; resolution?: string | null }>;
    paidAt: string;
    batchStatus: BillingBatch['status'];
    batchPaidAt: string | null;
    operationId?: string;
  }) => Promise<{ success: boolean; updated: number }>;

  // Repasses
  getRepasses: () => Promise<Repasse[]>;
  createRepasse: (repasse: Omit<Repasse, 'id' | 'createdAt'>) => Promise<Repasse>;
  updateRepasse: (id: string, repasse: Partial<Repasse>) => Promise<Repasse>;
  deleteRepasse: (id: string) => Promise<void>;

  // Settings
  getSettings: () => Promise<Settings>;
  updateSettings: (id: string, settings: Partial<Settings>) => Promise<Settings>;

  // Waiting List
  getWaitingList: () => Promise<WaitingListEntry[]>;
  createWaitingListEntry: (entry: Omit<WaitingListEntry, 'id' | 'createdAt'>) => Promise<WaitingListEntry>;
  updateWaitingListEntry: (id: string, entry: Partial<WaitingListEntry>) => Promise<WaitingListEntry>;
  deleteWaitingListEntry: (id: string) => Promise<void>;

  // Holidays
  getHolidays: () => Promise<Holiday[]>;
  createHoliday: (holiday: Omit<Holiday, 'id' | 'createdAt'>) => Promise<Holiday>;
  updateHoliday: (id: string, holiday: Partial<Holiday>) => Promise<Holiday>;
  deleteHoliday: (id: string) => Promise<void>;

  // Clinic Closures
  getClinicClosures: () => Promise<ClinicClosure[]>;
  createClinicClosure: (closure: Omit<ClinicClosure, 'id' | 'createdAt'>) => Promise<ClinicClosure>;
  updateClinicClosure: (id: string, closure: Partial<ClinicClosure>) => Promise<ClinicClosure>;
  deleteClinicClosure: (id: string) => Promise<void>;

  // Portfolio Management

  // Audit Logs
  getFinancialAuditLogs: (limit?: number) => Promise<AuditLogEntry[]>;
  revertFinancialAuditLog: (auditId: string) => Promise<{ success: boolean; message: string }>;
  revertFinancialAuditOperation: (operationId: string) => Promise<{ success: boolean; message: string; reverted_count: number }>;
  // Lista de e-mails cadastrados + cargo real (app_users), usada para
  // atribuir corretamente o operador na Auditoria Financeira.
  getAppUsers: () => Promise<Array<{ email: string; role: UserRole }>>;

  getPsychologistPortfolio: (referenceDate?: string) => Promise<PortfolioItem[]>;
}
