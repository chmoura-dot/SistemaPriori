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
  cardNumber?: string;
  reminderDismissedAt?: string;
  reminderJustification?: string;
  acquisitionSource?: string | null;
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
  roomId?: string | null;
  mode: AttendanceMode;
  type: AppointmentType;
  procedureCode?: string | null;
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: AppointmentStatus;
  confirmedPatient: boolean;
  confirmedPsychologist: boolean;
  confirmationStatus?: 'pending' | 'confirmed' | 'declined' | null;
  reminderSentAt?: string | null;
  patientNotes?: string | null;
  isRecurring: boolean;
  recurrenceFrequency?: RecurrenceFrequency | null;
  recurrenceGroupId?: string | null;
  needsRenewal?: boolean;
  renewedAt?: string | null;
  renewedBy?: string | null;
  customPrice?: number | null;
  customRepassAmount?: number | null;
  billingBatchId?: string | null;
  billingStatus?: 'paid' | 'denied' | null;
  billingIgnored?: boolean;
  // Justificativa registrada ao desconsiderar definitivamente um atendimento
  // de faturamento futuro (fluxo "Remover do lote" > "Desconsiderar").
  billingIgnoredReason?: string | null;
  billingIgnoredAt?: string | null;
  paidAt?: string | null;

  // Split de repasse da Avaliação Neuropsicológica (2 fases de 50%)
  reportDeliveredAt?: string | null;      // laudo entregue (ISO)
  reportDeliveredBy?: string | null;      // quem registrou a entrega
  repassPhase1RepasseId?: string | null;  // repasse que pagou a 1ª parcela (sessão)
  repassPhase2RepasseId?: string | null;  // repasse que pagou a 2ª parcela (laudo)

  healthPlanAtTime?: string | null;

  denialReason?: string | null;
  denialResolution?: 'accepted' | 'appealed' | null;
  createdAt: string;
  cancellationBilling?: 'none' | 'plan' | 'particular' | null;
  // 'patient_exempt': falta do paciente marcada como "Não Cobrar (Isento)" —
  // convênio é cobrado normalmente (getAppPrice), mas o repasse ao psicólogo
  // é bloqueado (isRepassBlocked). Distinto de 'patient' para não colidir com
  // a RPC discharge_customer (Alta/Encerramento), que também grava
  // cancellationBilling='none' e NUNCA deve passar a cobrar o convênio.
  cancellationFault?: 'patient' | 'patient_exempt' | 'psychologist' | null;
  // Motivo do cancelamento (separado de "quem faltou" e "como cobra").
  // 'reschedule' = remanejamento: vaga reaproveitada, NÃO é falta/no-show real.
  cancellationType?: 'no_show' | 'psychologist_absence' | 'discharge' | 'reschedule' | 'other' | null;
  // Vínculo de remanejamento (bidirecional):
  replacedByAppointmentId?: string | null;  // no cancelado → novo atendimento que ocupou a vaga
  replacesAppointmentId?: string | null;    // no novo → atendimento original substituído
  // Campos para horário interno
  isInternal?: boolean;
  internalType?: 'SUPERVISAO' | 'RESPONSAVEIS' | 'REUNIAO' | 'ADMIN' | 'OUTRO' | null;
  internalTitle?: string | null;
  internalNotes?: string | null;
}

export interface BillingBatch {
  id: string;
  batchNumber: string;
  sentAt: string;
  paidAt?: string | null;
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

export interface PortfolioItem {
  psychologistId: string;
  psychologistName: string;
  customerId: string;
  customerName: string;
  modality: 'Neuropsicologia' | 'Psicoterapia';
  lastSessionDate?: string | null;
  nextSessionDate?: string | null;
  frequency?: string | null;
  cycleStartDate?: string | null;
  cycleDays?: number | null;
  neuroStatus?: 'A iniciar' | 'Em andamento' | 'Finalizado' | 'Cancelado' | null;
}
