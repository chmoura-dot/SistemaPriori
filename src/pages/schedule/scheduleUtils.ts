import {
  HealthPlan,
  AttendanceMode,
  AppointmentType,
  RecurrenceFrequency,
  AppointmentStatus,
  Psychologist,
  Appointment,
} from '../../services/types';
import { hasTimeOverlap, toMinutes } from '../../lib/timeUtils';

// ─── Form data type ───────────────────────────────────────────────────────────
export type ScheduleFormData = {
  customerId: string;
  psychologistId: string;
  roomId: string;
  mode: AttendanceMode;
  type: AppointmentType;
  procedureCode: string;
  date: string;
  startTime: string;
  endTime: string;
  customPrice: number | undefined;
  customRepassAmount: number | undefined;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency;
  isInternal: boolean;
  internalType: 'SUPERVISAO' | 'RESPONSAVEIS' | 'REUNIAO' | 'ADMIN' | 'OUTRO';
  internalTitle: string;
  internalNotes: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
export const CANCELLATION_REASONS = [
  'Solicitação do paciente',
  'Imprevisto / emergência do paciente',
  'Psicólogo indisponível',
  'Necessidade de remarcação pela clínica',
  'Falta sem aviso (no-show)',
  'Outro',
];

export const PLAN_COLORS: Record<string, string> = {
  [HealthPlan.PARTICULAR]: 'border-l-blue-500',
  [HealthPlan.AMS_PETROBRAS]: 'border-l-emerald-600',
  [HealthPlan.PAE]: 'border-l-orange-500',
  [HealthPlan.PORTO_SAUDE]: 'border-l-sky-400',
  [HealthPlan.MEDSENIOR]: 'border-l-indigo-500',
  [HealthPlan.GAMA]: 'border-l-rose-500',
  [HealthPlan.SAUDE_CAIXA]: 'border-l-cyan-600',
};

export const PLAN_LABELS: Record<string, string> = {
  [HealthPlan.PARTICULAR]:     'Particular',
  [HealthPlan.AMS_PETROBRAS]:  'AMS',
  [HealthPlan.PAE]:            'PAE',
  [HealthPlan.PORTO_SAUDE]:    'Porto',
  [HealthPlan.MEDSENIOR]:      'Médsen.',
  [HealthPlan.REAL_GRANDEZA]:  'R. Grandeza',
  [HealthPlan.SAUDE_BLUE]:     'S. Blue',
  [HealthPlan.GAMA]:           'Gama',
  [HealthPlan.SAUDE_CAIXA]:    'S. Caixa',
  [HealthPlan.FUNDACAO_SAUDE]: 'Fund. Itaú',
};

export const PLAN_BADGE_COLORS: Record<string, string> = {
  [HealthPlan.PARTICULAR]:     'bg-blue-100 text-blue-700',
  [HealthPlan.AMS_PETROBRAS]:  'bg-emerald-100 text-emerald-700',
  [HealthPlan.PAE]:            'bg-orange-100 text-orange-700',
  [HealthPlan.PORTO_SAUDE]:    'bg-sky-100 text-sky-700',
  [HealthPlan.MEDSENIOR]:      'bg-indigo-100 text-indigo-700',
  [HealthPlan.REAL_GRANDEZA]:  'bg-purple-100 text-purple-700',
  [HealthPlan.SAUDE_BLUE]:     'bg-teal-100 text-teal-700',
  [HealthPlan.GAMA]:           'bg-rose-100 text-rose-700',
  [HealthPlan.SAUDE_CAIXA]:    'bg-cyan-100 text-cyan-700',
  [HealthPlan.FUNDACAO_SAUDE]: 'bg-amber-100 text-amber-700',
};

export const INTERNAL_LABELS: Record<string, string> = {
  SUPERVISAO: 'Supervisão',
  RESPONSAVEIS: 'Reunião c/ Pais',
  REUNIAO: 'Reunião',
  ADMIN: 'Administrativo',
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────
export const addMinutes = (time: string, minutes: number): string => {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m + minutes, 0, 0);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export const getSlotCount = (start: string, end: string): number => {
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  return Math.max(0.5, (h2 * 60 + m2 - (h1 * 60 + m1)) / 30);
};

export const getWeekDays = (baseDate: string): string[] => {
  const d = new Date(baseDate + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 6 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date.toISOString().split('T')[0];
  });
};

// ─── Availability helpers (need state data as params) ─────────────────────────
export const isPsychologistAvailable = (
  psyId: string,
  dateStr: string,
  startTime: string,
  endTime: string,
  appointmentMode: AttendanceMode | undefined,
  psychologists: Psychologist[],
  appointments: Appointment[],
  editingId: string | null
): boolean => {
  const psy = psychologists.find(p => p.id === psyId);
  if (!psy || !psy.active) return false;

  const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();

  const isWithinAvailability = psy.availability.some(slot => {
    const dayAndTimeMatch =
      slot.dayOfWeek === dayOfWeek && toMinutes(startTime) >= toMinutes(slot.startTime) && toMinutes(endTime) <= toMinutes(slot.endTime);
    if (!dayAndTimeMatch) return false;
    const slotMode = (slot as any).mode ?? 'Ambos';
    if (slotMode === 'Ambos') return true;
    if (appointmentMode === AttendanceMode.PRESENCIAL && slotMode === 'Presencial') return true;
    if (appointmentMode === AttendanceMode.ONLINE && slotMode === 'On-line') return true;
    if (!appointmentMode) return true;
    return false;
  });

  if (!isWithinAvailability) return false;

  const hasConflict = appointments.some(
    a =>
      a.psychologistId === psyId &&
      a.date === dateStr &&
      a.id !== editingId &&
      a.status !== AppointmentStatus.CANCELED &&
      hasTimeOverlap(startTime, endTime, a.startTime, a.endTime)
  );

  return !hasConflict;
};

export const hasMinSpace = (
  slot: string,
  dateStr: string,
  roomId: string | undefined,
  psyId: string | undefined,
  formMode: AttendanceMode,
  appointments: Appointment[],
  psychologists: Psychologist[]
): boolean => {
  const minEndTime = addMinutes(slot, 10);
  const isOnline = formMode === AttendanceMode.ONLINE;
  const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
  const isSaturday = dayOfWeek === 6;
  const limit = isSaturday ? '14:00' : '20:00';

  if (!isOnline && minEndTime > limit) return false;
  if (dayOfWeek === 0) return false;

  if (roomId) {
    const hasConflict = appointments.some(
      a =>
        a.date === dateStr &&
        a.roomId === roomId &&
        a.status !== AppointmentStatus.CANCELED &&
        hasTimeOverlap(slot, minEndTime, a.startTime, a.endTime)
    );
    if (hasConflict) return false;
  }

  if (psyId) {
    const psy = psychologists.find(p => p.id === psyId);
    if (!psy || !psy.active) return false;
    const isWithinAvailability = psy.availability.some(
      s => s.dayOfWeek === dayOfWeek && toMinutes(slot) >= toMinutes(s.startTime) && toMinutes(minEndTime) <= toMinutes(s.endTime)
    );
    if (!isWithinAvailability) return false;
    const hasPsyConflict = appointments.some(
      a =>
        a.date === dateStr &&
        a.psychologistId === psyId &&
        a.status !== AppointmentStatus.CANCELED &&
        hasTimeOverlap(slot, minEndTime, a.startTime, a.endTime)
    );
    if (hasPsyConflict) return false;
  }

  return true;
};
