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
} from './models';

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

  // Psychologists
  getPsychologists: () => Promise<Psychologist[]>;
  createPsychologist: (psychologist: Omit<Psychologist, 'id'>) => Promise<Psychologist>;
  updatePsychologist: (id: string, psychologist: Partial<Psychologist>) => Promise<Psychologist>;
  deletePsychologist: (id: string) => Promise<void>;
  invitePsychologist: (email: string) => Promise<void>;

  // Rooms
  getRooms: () => Promise<Room[]>;

  // Appointments
  getAppointments: (date?: string) => Promise<Appointment[]>;
  getAppointmentsForBilling: () => Promise<Appointment[]>;
  getAppointmentsByRange: (startDate: string, endDate: string) => Promise<Appointment[]>;
  getAppointmentsByCustomer: (customerId: string) => Promise<Appointment[]>;
  getAppointmentsNeedingRenewal: () => Promise<Appointment[]>;
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
  deleteFutureAppointments: (groupId: string, fromDate: string) => Promise<void>;

  // Customers
  getCustomers: () => Promise<Customer[]>;
  createCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>) => Promise<Customer>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<Customer>;
  deleteCustomer: (id: string) => Promise<void>;

  // Plans
  getPlans: () => Promise<Plan[]>;
  createPlan: (plan: Omit<Plan, 'id' | 'createdAt'>) => Promise<Plan>;
  updatePlan: (id: string, plan: Partial<Plan>) => Promise<Plan>;
  deletePlan: (id: string) => Promise<void>;

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
}
