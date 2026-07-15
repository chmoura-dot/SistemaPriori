import {
  CustomerStatus,
  InactivationReason,
  HealthPlan,
  AttendanceMode,
  AppointmentType,
  AppointmentStatus,
  RecurrenceFrequency,
  BillingBatchStatus,
  ExpenseCategory,
  SubscriptionStatus,
  RepasseStatus,
  UserRole,
} from './enums';

export interface PsychologistAvailability {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  mode?: 'Presencial' | 'On-line' | 'Ambos';
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
  repassOverridesPlan?: boolean;
  pixKeyType?: 'telefone' | 'email' | 'cpf' | 'aleatoria';
  pixKey?: string;
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
  inactivationReason?: InactivationReason;
  notes?: string;
  customPrice?: number;
  customRepassAmount?: number;
  birthDate?: string;
  gender?: 'M' | 'F' | null;
  amsPassword?: string;
  amsPasswordExpiry?: string;
  createdAt: string;
  // Metrics
  totalAppointmentsPerformed?: number;
  nextAppointmentDate?: string;
  lastAppointmentDate?: string;
  firstAppointmentDate?: string;
}

export interface Appointment {
  id: string;
  customerId: string;
  psychologistId: string;
  roomId?: string;
  mode: AttendanceMode;
  type: AppointmentType;
  procedureCode?: string;
  date: string; // YYYY-MM-DD
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
  renewedAt?: string;
  renewedBy?: string;
  customPrice?: number;
  customRepassAmount?: number;
  billingBatchId?: string;
  billingStatus?: 'paid' | 'denied';
  billingIgnored?: boolean;
  healthPlanAtTime?: string;
  denialReason?: string;
  denialResolution?: 'accepted' | 'appealed';
  createdAt: string;
  cancellationBilling?: 'none' | 'plan' | 'particular' | null;
  // Campos para horário interno
  isInternal?: boolean;
  internalType?: 'SUPERVISAO' | 'RESPONSAVEIS' | 'REUNIAO' | 'ADMIN' | 'OUTRO';
  internalTitle?: string;
  internalNotes?: string;
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
  maxSessionsPerMonth?: number; // 0 = ilimitado
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

export interface Expense {
  id: string;
  description: string;
  beneficiary?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  productDescription?: string;
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

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: 'nacional' | 'estadual' | 'municipal' | 'facultativo';
  recurring: boolean;
  clinicOpen: boolean;
  createdAt: string;
}

export interface ClinicClosure {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
  createdAt: string;
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

export interface User {
  email: string;
  role: UserRole;
}
