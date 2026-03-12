export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export enum HealthPlan {
  AMS_PETROBRAS = 'AMS Petrobras',
  MEDSENIOR = 'Medsenior',
  PORTO_SEGURO = 'Porto Seguro',
  GAMA = 'Gama Saúde',
  SAUDE_CAIXA = 'Saúde Caixa',
  FUNDACAO_SAUDE = 'Fundação Saúde Itaú',
  PARTICULAR = 'Particular'
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
  specialties: string[];
  phone: string;
  active: boolean;
  availability: PsychologistAvailability[];
}

export interface Room {
  id: string;
  name: string;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  healthPlan: HealthPlan;
  psychologistId: string;
  status: CustomerStatus;
  notes?: string;
  customPrice?: number;
  customRepassAmount?: number;
  createdAt: string;
}

export enum AttendanceMode {
  PRESENCIAL = 'Presencial',
  ONLINE = 'On-line'
}

export enum AppointmentStatus {
  ACTIVE = 'active',
  RELEASED = 'released'
}

export interface Appointment {
  id: string;
  customerId: string;
  psychologistId: string;
  roomId?: string; // Optional for Online
  mode: AttendanceMode;
  type: AppointmentType;
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
  recurrenceGroupId?: string;
  needsRenewal?: boolean;
  customPrice?: number;
  customRepassAmount?: number;
  billingBatchId?: string;
  billingStatus?: 'paid' | 'denied';
  denialReason?: string;
  denialResolution?: 'accepted' | 'appealed';
  createdAt: string;
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

export enum UserRole {
  ADMIN = 'admin',
  SECRETARIA = 'secretaria'
}

export interface User {
  email: string;
  role: UserRole;
}

export interface AppService {
  // Auth
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => void;
  isAuthenticated: () => boolean;
  getCurrentUser: () => User | null;

  // Psychologists
  getPsychologists: () => Promise<Psychologist[]>;
  createPsychologist: (psychologist: Omit<Psychologist, 'id'>) => Promise<Psychologist>;
  updatePsychologist: (id: string, psychologist: Partial<Psychologist>) => Promise<Psychologist>;
  deletePsychologist: (id: string) => Promise<void>;
  
  // Rooms
  getRooms: () => Promise<Room[]>;

  // Appointments
  getAppointments: (date?: string) => Promise<Appointment[]>;
  createAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt' | 'confirmedPatient' | 'confirmedPsychologist'>) => Promise<Appointment>;
  updateAppointment: (id: string, appointment: Partial<Appointment>) => Promise<Appointment>;
  deleteAppointment: (id: string) => Promise<void>;

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
}
