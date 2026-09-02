/**
 * waitingListMatch.ts
 *
 * Encontra vagas de horário estruturalmente livres que sejam compatíveis com
 * registros 'pending' da Fila de Espera (dia da semana + horário + psicólogo
 * + convênio).
 *
 * Regra-chave (evita falso-positivo): um slot (psicólogo + dia da semana +
 * horário) só é considerado LIVRE se NENHUMA linha ATIVA de `appointments`
 * (semanal ou quinzenal) o reivindicar em qualquer data dentro do horizonte
 * de checagem. Isso é diferente de "a próxima ocorrência está livre", pois:
 *  - Cancelamento de UMA única sessão (scope 'single') não libera o horário
 *    — a próxima semana já existe como linha ATIVA própria no banco
 *    (buildRecurringRows cria uma linha física por ocorrência).
 *  - Pacientes QUINZENAIS têm uma semana "de folga" que não deve ser
 *    confundida com vaga livre — a checagem cobre o horizonte inteiro, não
 *    apenas a próxima data literal.
 *  - Só é vaga real quando o tratamento é encerrado por completo (RPC
 *    discharge_customer ou exclusão "todos os futuros"), ou quando o
 *    horário nunca teve ninguém alocado.
 */
import {
  WaitingListEntry, Psychologist, Appointment, AppointmentStatus,
  Holiday, ClinicClosure,
} from '../services/types';
import { hasTimeOverlap, toMinutes } from './timeUtils';
import { addMinutes } from '../pages/schedule/scheduleUtils';

/** Horizonte de checagem: mesmo teto usado em buildRecurringRows (~2 meses de séries recorrentes). */
export const MATCH_HORIZON_DAYS = 60;

export interface WaitingListMatchSlot {
  psychologistId: string;
  psychologistName: string;
  dayOfWeek: number;     // 0-6 (Dom-Sáb)
  startTime: string;     // "HH:00" — grade de hora cheia, igual à Fila/Agenda
  endTime: string;       // startTime + duração da sessão
  nextDate: string;      // próxima data concreta (YYYY-MM-DD), pulando feriados/fechamentos
}

export interface WaitingListMatch {
  entry: WaitingListEntry;
  slots: WaitingListMatchSlot[];
}

function isClinicOpen(dateStr: string, holidays: Holiday[], closures: ClinicClosure[]): boolean {
  const holiday = holidays.find(h => h.date === dateStr);
  if (holiday && !holiday.clinicOpen) return false;
  const closed = closures.some(c => dateStr >= c.startDate && dateStr <= c.endDate);
  return !closed;
}

function getNextOpenDateForDayOfWeek(
  dayOfWeek: number,
  reference: Date,
  holidays: Holiday[],
  closures: ClinicClosure[],
): string {
  const d = new Date(reference);
  for (let i = 0; i < 45; i++) {
    if (d.getDay() === dayOfWeek) {
      const dateStr = d.toISOString().split('T')[0];
      if (isClinicOpen(dateStr, holidays, closures)) return dateStr;
    }
    d.setDate(d.getDate() + 1);
  }
  return reference.toISOString().split('T')[0]; // fallback improvável (45 dias sem abertura)
}

/** Gera marcas de hora cheia dentro do bloco de disponibilidade que caibam a duração informada. */
function enumerateHourlySlots(blockStart: string, blockEnd: string, durationMinutes: number): string[] {
  const slots: string[] = [];
  let cursor = blockStart;
  let guard = 0;
  while (toMinutes(cursor) + durationMinutes <= toMinutes(blockEnd) && guard < 48) {
    slots.push(cursor);
    cursor = addMinutes(cursor, 60);
    guard++;
  }
  return slots;
}

/**
 * Encontra vagas estruturais compatíveis com registros 'pending' da Fila de Espera.
 */
export function findWaitingListMatches(
  entries: WaitingListEntry[],
  psychologists: Psychologist[],
  appointments: Appointment[],
  holidays: Holiday[],
  closures: ClinicClosure[],
  referenceDate: Date = new Date(),
): WaitingListMatch[] {
  const today = referenceDate.toISOString().split('T')[0];
  const horizonEnd = new Date(referenceDate);
  horizonEnd.setDate(horizonEnd.getDate() + MATCH_HORIZON_DAYS);
  const horizonEndStr = horizonEnd.toISOString().split('T')[0];

  // Índice O(1): apenas linhas ATIVAS dentro do horizonte, por psicólogo.
  const activeByPsy = new Map<string, Appointment[]>();
  for (const a of appointments) {
    if (a.status === AppointmentStatus.CANCELED) continue;
    if (a.date < today || a.date > horizonEndStr) continue;
    const list = activeByPsy.get(a.psychologistId) ?? [];
    list.push(a);
    activeByPsy.set(a.psychologistId, list);
  }

  const isSlotClaimed = (psyId: string, dayOfWeek: number, start: string, end: string): boolean => {
    const relevant = activeByPsy.get(psyId) ?? [];
    return relevant.some(a =>
      new Date(a.date + 'T12:00:00').getDay() === dayOfWeek &&
      hasTimeOverlap(start, end, a.startTime, a.endTime)
    );
  };

  const matches: WaitingListMatch[] = [];

  for (const entry of entries.filter(e => e.status === 'pending')) {
    const duration = entry.sessionDurationMinutes ?? 60;

    const candidatePsys = entry.psychologistId
      ? psychologists.filter(p => p.id === entry.psychologistId && p.active)
      : psychologists.filter(p => {
          if (!p.active) return false;
          const accepted = p.acceptedHealthPlans ?? [];
          // Array vazio = atende todos. Se a fila não especificou convênio, também não filtra.
          if (!entry.healthPlan || accepted.length === 0) return true;
          return accepted.includes(entry.healthPlan);
        });

    const foundSlots: WaitingListMatchSlot[] = [];
    const seen = new Set<string>();

    for (const psy of candidatePsys) {
      const days = entry.preferredDays.length
        ? entry.preferredDays
        : [...new Set(psy.availability.map(b => b.dayOfWeek))];

      for (const day of days) {
        const blocks = psy.availability.filter(b => b.dayOfWeek === day);

        for (const block of blocks) {
          const candidateHours = entry.preferredHours.length
            ? entry.preferredHours.filter(h =>
                toMinutes(h) >= toMinutes(block.startTime) &&
                toMinutes(h) + duration <= toMinutes(block.endTime))
            : enumerateHourlySlots(block.startTime, block.endTime, duration);

          for (const hour of candidateHours) {
            const end = addMinutes(hour, duration);
            const key = `${psy.id}|${day}|${hour}`;
            if (seen.has(key)) continue;
            if (isSlotClaimed(psy.id, day, hour, end)) continue;

            seen.add(key);
            foundSlots.push({
              psychologistId: psy.id,
              psychologistName: psy.name,
              dayOfWeek: day,
              startTime: hour,
              endTime: end,
              nextDate: getNextOpenDateForDayOfWeek(day, referenceDate, holidays, closures),
            });
          }
        }
      }
    }

    if (foundSlots.length > 0) matches.push({ entry, slots: foundSlots });
  }

  return matches;
}
