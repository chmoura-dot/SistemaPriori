import { Appointment, Customer, CustomerStatus, RecurrenceFrequency } from '../services/types';

export interface RenewalConflictInfo {
  conflictName: string; // nome do paciente ou bloqueio conflitante
  conflictTime: string; // ex: "14:00–15:00"
  conflictDate: string; // data formatada
}

export interface RenewalClassification {
  reason: 'inactive' | 'conflict' | 'pending';
  nextDate?: string; // YYYY-MM-DD da próxima ocorrência
  conflict?: RenewalConflictInfo;
}

/** Calcula a próxima data de ocorrência a partir da data base + frequência */
export function getNextOccurrenceDate(dateStr: string, frequency?: RecurrenceFrequency): string {
  const d = new Date(dateStr + 'T12:00:00');
  const interval = frequency === RecurrenceFrequency.QUINZENAL ? 14 : 7;
  d.setDate(d.getDate() + interval);
  return d.toISOString().split('T')[0];
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && s2 < e1;
}

/**
 * Classifica um agendamento com `needs_renewal = true` em:
 * - 'inactive': paciente não encontrado no cadastro ou marcado como inativo — precisa de ação humana.
 * - 'conflict': a próxima ocorrência colide com outro agendamento real — precisa de ação humana.
 * - 'pending': nenhum problema real detectado — o cron de auto-renovação ainda vai resolver sozinho.
 *
 * Usado tanto pelo RenewalAlertBanner (Agenda) quanto pelo contador da Sidebar,
 * para que os dois concordem sobre o que é "acionável" — evita o contador
 * mostrar um número que a Agenda não tem nada pra exibir.
 */
export function classifyRenewalAppointment(
  app: Appointment,
  customers: Customer[],
  allAppointments: Appointment[],
): RenewalClassification {
  const customer = customers.find(c => c.id === app.customerId);
  const isInactive = !customer || customer.status !== CustomerStatus.ACTIVE;
  if (isInactive) return { reason: 'inactive' };

  const nextDate = getNextOccurrenceDate(app.date, app.recurrenceFrequency);
  const conflicting = allAppointments.find(other =>
    other.id !== app.id &&
    other.psychologistId === app.psychologistId &&
    other.date === nextDate &&
    other.status !== 'canceled' &&
    timesOverlap(app.startTime, app.endTime, other.startTime, other.endTime)
  );
  if (!conflicting) return { reason: 'pending', nextDate };

  const conflictCustomer = customers.find(c => c.id === conflicting.customerId);
  const conflictName = conflicting.isInternal
    ? (conflicting.internalTitle || 'Bloqueio Interno')
    : (conflictCustomer?.name || 'Outro paciente');

  return {
    reason: 'conflict',
    nextDate,
    conflict: {
      conflictName,
      conflictTime: `${conflicting.startTime}–${conflicting.endTime}`,
      conflictDate: new Date(nextDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
    },
  };
}
