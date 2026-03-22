export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export enum InactivationReason {
  DESISTENCIA = 'Desistência',
  PERDA_PLANO = 'Perda do Plano',
  ALTA_PSICOLOGO = 'Liberação / Alta por psicólogo'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export enum RepasseStatus {
  PENDING = 'pending',
  PAID = 'paid'
}

export enum HealthPlan {
  AMS_PETROBRAS = 'AMS Petrobras',
  PAE = 'PAE',
  PORTO_SAUDE = 'Porto Saude',
  MEDSENIOR = 'Medsenior',
  REAL_GRANDEZA = 'Real Grandeza',
  SAUDE_BLUE = 'Saude Blue',
  GAMA = 'Gama Saude',
  SAUDE_CAIXA = 'Saude Caixa',
  FUNDACAO_SAUDE = 'Fundação Saúde Itaú',
  PARTICULAR = 'Particular'
}

export enum RecurrenceFrequency {
  SEMANAL = 'Semanal',
  QUINZENAL = 'Quinzenal'
}

export enum AppointmentType {
  INFANTIL = 'Psicoterapia Infantil',
  ADULTO = 'Psicoterapia Adulto',
  CASAL = 'Terapia de Casal',
  NEUROPSICOLOGICA = 'Avaliação Neuropsicológica'
}

export interface PsychologistAvailability {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  mode?: 'Presencial' | 'On-line' | 'Ambos'; // attendance mode for this slot
}


export interface Psychologist {
  id: string;
  name: string;
  email: string;
  specialties: string[];
  phone: string;
  active: boolean;
  availability: PsychologistAvailability[];
  repassRate?: number;
  repassFixedAmount?: number;
}

export interface Room {
  id: string;
  name: string;
  active: boolean;
}

export enum ParticularBillingType {
  SESSION = 'Por Consulta',
  PACKAGE = 'Por Pacote'
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  healthPlan: HealthPlan;
  psychologistId: string;
  status: CustomerStatus;
  inactivationReason?: InactivationReason;
  notes?: string;
  customPrice?: number;
  customRepassAmount?: number;
  particularBillingType?: ParticularBillingType;
  birthDate?: string;
  amsPassword?: string;
  amsPasswordExpiry?: string;
  createdAt: string;
  // Metrics
  totalAppointmentsPerformed?: number;
  nextAppointmentDate?: string;
  lastAppointmentDate?: string;
  firstAppointmentDate?: string;
}

export enum AttendanceMode {
  PRESENCIAL = 'Presencial',
  ONLINE = 'On-line'
}

export enum AppointmentStatus {
  ACTIVE = 'active',
  RELEASED = 'released',
  CANCELED = 'canceled'
}

export interface Appointment {
  id: string;
  customerId: string;
  psychologistId: string;
  roomId?: string; // Optional for Online
  mode: AttendanceMode;
  type: AppointmentType;
  procedureCode?: string;
  date: string; // Start date (YYYY-MM-DD)
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: AppointmentStatus;
  confirmedPatient: boolean;
  confirmedPsychologist: boolean;
  confirmationStatus?: 'pending' | 'confirmed' | 'declined';
  reminderSentAt?: string;
  patientNotes?: string;
  isRecurring: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceGroupId?: string;
  needsRenewal?: boolean;
  customPrice?: number;
  customRepassAmount?: number;
  billingBatchId?: string;
  billingStatus?: 'paid' | 'denied';
  denialReason?: string;
  denialResolution?: 'accepted' | 'appealed';
  createdAt: string;
  cancellationBilling?: 'none' | 'plan' | 'particular';
}

export enum BillingBatchStatus {
  SENT = 'sent',
  PAID = 'paid'
}

export interface BillingBatch {
  id: string;
  batchNumber: string;
  sentAt: string;
  paidAt?: string;
  status: BillingBatchStatus;
  healthPlan: HealthPlan;
  totalAmount: number;
  appointmentIds: string[];
  createdAt: string;
}

export interface PlanProcedure {
  type: AppointmentType;
  code: string;
  description: string;
  price: number;
  repassAmount: number;
  isOneTimeCharge: boolean;
}

export interface Plan {
  id: string;
  name: string;
  procedures: PlanProcedure[];
  active: boolean;
  createdAt: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  startDate: string;
  nextRenewal: string;
  status: SubscriptionStatus;
  createdAt: string;
}

export interface Payment {
  id: string;
  subscriptionId: string;
  amount: number;
  repassAmount: number;
  paidAt: string;
  createdAt: string;
}

export enum ExpenseCategory {
  SALARY = 'Salários',
  LOAN = 'Empréstimos',
  TAX = 'Impostos',
  RENT = 'Aluguel',
  UTILITIES = 'Contas (Água/Luz/Internet)',
  MARKETING = 'Marketing',
  SUPPLIES = 'Suprimentos',
  OTHER = 'Outros'
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  isRecurring: boolean;
  createdAt: string;
}

export interface DashboardStats {
  totalCustomers: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  mrr: number;
}

export interface Repasse {
  id: string;
  psychologistId: string;
  billingBatchId: string;
  appointmentIds: string[];
  totalAmount: number;
  status: RepasseStatus;
  paidAt?: string;
  notes?: string;
  createdAt: string;
}

export interface Settings {
  id: string;
  zapiUrl?: string;
  zapiToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WaitingListEntry {
  id: string;
  customerName: string;
  phone?: string;
  preferredDays: number[];
  preferredHours: string[];
  psychologistId?: string;
  notes?: string;
  status: 'pending' | 'called' | 'resolved' | 'canceled';
  createdAt: string;
}

export enum UserRole {
  ADMIN = 'admin',
  SECRETARIA = 'secretaria'
}

export interface User {
  email: string;
  role: UserRole;
}

export interface AppService {
  // ... outros métodos
  createInvoice: (data: {
    issueDate: string;
    payer: string;
    payerCNPJ: string;
    totalAmount: number;
    description?: string;
  }) => Promise<{ success: boolean }>;

  getInvoices: (params?: { limit?: number }) => Promise<
    Array<{
      id: string;
      issueDate: string;
      status: string;
      payer: { nome: string; cpf_cnpj: string };
      totalAmount: number;
      description?: string | null;
      createdAt?: string;
    }>
  >;
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
  
  // Rooms
  getRooms: () => Promise<Room[]>;

  // Appointments
  getAppointments: (date?: string) => Promise<Appointment[]>;
  getAppointmentsByRange: (startDate: string, endDate: string) => Promise<Appointment[]>;
  getAppointmentsNeedingRenewal: () => Promise<Appointment[]>;
  createAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt' | 'confirmedPatient' | 'confirmedPsychologist'>) => Promise<Appointment>;
  updateAppointment: (id: string, appointment: Partial<Appointment>) => Promise<Appointment>;
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
}
