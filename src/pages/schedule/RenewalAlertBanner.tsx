import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Eye, XCircle, RefreshCw, UserX, Clock } from 'lucide-react';
import { api } from '../../services/api';
import { Appointment, Customer, Psychologist, RecurrenceFrequency } from '../../services/types';
import { cn } from '../../lib/utils';

interface RenewalAlertBannerProps {
  customers: Customer[];
  psychologists: Psychologist[];
  allAppointments: Appointment[];
  onNavigateToDate: (date: string) => void;
}

interface ConflictInfo {
  conflictName: string; // nome do paciente ou bloqueio conflitante
  conflictTime: string; // ex: "14:00–15:00"
  conflictDate: string; // data formatada
}

interface RenewalItem {
  appointment: Appointment;
  customer: Customer | undefined;
  psychologistName: string;
  reason: 'inactive' | 'conflict';
  daysUntil: number;
  conflict?: ConflictInfo;
  nextDate?: string; // YYYY-MM-DD da próxima ocorrência
}

/** Calcula a próxima data de ocorrência a partir da data base + frequência */
function getNextOccurrenceDate(dateStr: string, frequency?: RecurrenceFrequency): string {
  const d = new Date(dateStr + 'T12:00:00');
  const interval = frequency === RecurrenceFrequency.QUINZENAL ? 14 : 7;
  d.setDate(d.getDate() + interval);
  return d.toISOString().split('T')[0];
}

/** Verifica se dois intervalos de tempo se sobrepõem */
function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && s2 < e1;
}

export const RenewalAlertBanner: React.FC<RenewalAlertBannerProps> = ({
  customers,
  psychologists,
  allAppointments,
  onNavigateToDate,
}) => {
  const [items, setItems] = useState<RenewalItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRenewals = useCallback(async () => {
    try {
      setIsLoading(true);
      const renewalApps = await api.getAppointmentsNeedingRenewal();
      if (renewalApps.length === 0) { setItems([]); return; }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mapped: RenewalItem[] = renewalApps.map(app => {
        const customer = customers.find(c => c.id === app.customerId);
        const psych = psychologists.find(p => p.id === app.psychologistId);
        const appDate = new Date(app.date + 'T12:00:00');
        appDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((appDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Detectar motivo: se paciente não está na lista de ativos, é inativo
        const isInactive = !customer;

        // Para conflitos: calcular a próxima data e encontrar quem está no horário
        let conflict: ConflictInfo | undefined;
        let nextDate: string | undefined;
        if (!isInactive) {
          nextDate = getNextOccurrenceDate(app.date, app.recurrenceFrequency);
          // Buscar agendamento conflitante na próxima data
          const conflicting = allAppointments.find(other =>
            other.id !== app.id &&
            other.psychologistId === app.psychologistId &&
            other.date === nextDate &&
            other.status !== 'canceled' &&
            timesOverlap(app.startTime, app.endTime, other.startTime, other.endTime)
          );
          if (conflicting) {
            const conflictCustomer = customers.find(c => c.id === conflicting.customerId);
            const conflictName = conflicting.isInternal
              ? (conflicting.internalTitle || 'Bloqueio Interno')
              : (conflictCustomer?.name || 'Outro paciente');
            conflict = {
              conflictName,
              conflictTime: `${conflicting.startTime}–${conflicting.endTime}`,
              conflictDate: new Date(nextDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
            };
          }
        }

        return {
          appointment: app,
          customer,
          psychologistName: psych?.name || '—',
          reason: isInactive ? 'inactive' as const : 'conflict' as const,
          daysUntil,
          conflict,
          nextDate,
        };
      });

      // Ordenar: vencidos primeiro, depois por proximidade
      mapped.sort((a, b) => a.daysUntil - b.daysUntil);
      setItems(mapped);
    } catch {
      // silencioso
    } finally {
      setIsLoading(false);
    }
  }, [customers, psychologists, allAppointments]);

  useEffect(() => {
    if (customers.length > 0) loadRenewals();
  }, [customers.length, loadRenewals]);

  const handleDismiss = async (appointmentId: string) => {
    setDismissing(appointmentId);
    try {
      await api.updateAppointment(appointmentId, { needsRenewal: false });
      setItems(prev => prev.filter(i => i.appointment.id !== appointmentId));
    } catch {
      // silencioso
    } finally {
      setDismissing(null);
    }
  };

  if (isLoading || items.length === 0) return null;

  const urgencyLabel = (daysUntil: number) => {
    if (daysUntil < 0) return { text: `Vencido há ${Math.abs(daysUntil)}d`, color: 'text-red-600' };
    if (daysUntil === 0) return { text: 'Vence HOJE', color: 'text-amber-600' };
    return { text: `Vence em ${daysUntil}d`, color: 'text-blue-600' };
  };

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600" />
          <span className="text-sm font-bold text-amber-800">
            {items.length} agendamento(s) com renovação pendente
          </span>
          <span className="text-xs text-amber-600">
            — o sistema automático não conseguiu renovar
          </span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-amber-600" /> : <ChevronDown size={16} className="text-amber-600" />}
      </button>

      {/* List */}
      {isExpanded && (
        <div className="border-t border-amber-200">
          {items.map(item => {
            const urgency = urgencyLabel(item.daysUntil);
            const isInactive = item.reason === 'inactive';
            return (
              <div
                key={item.appointment.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-amber-100 last:border-b-0 hover:bg-amber-50/80"
              >
                {/* Ícone do motivo */}
                <div className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full shrink-0',
                  isInactive ? 'bg-red-100' : 'bg-yellow-100'
                )}>
                  {isInactive
                    ? <UserX size={14} className="text-red-500" />
                    : <Clock size={14} className="text-yellow-600" />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-priori-navy truncate">
                      {item.customer?.name || 'Paciente não encontrado'}
                    </span>
                    <span className="text-[10px] text-zinc-400">({item.psychologistName})</span>
                    <span className={cn('text-[10px] font-bold', urgency.color)}>
                      {urgency.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-zinc-500">
                      Última sessão: {new Date(item.appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às {item.appointment.startTime}
                    </span>
                    <span className="text-[10px] text-zinc-300">•</span>
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded',
                      isInactive
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    )}>
                      {isInactive ? '⛔ Paciente inativo' : '⚠️ Conflito de horário'}
                    </span>
                  </div>
                  {/* Detalhe do conflito */}
                  {!isInactive && item.conflict && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-orange-700 font-bold">
                        → Próxima data ({item.conflict.conflictDate}) ocupada por: <strong>{item.conflict.conflictName}</strong> ({item.conflict.conflictTime})
                      </span>
                    </div>
                  )}
                  {!isInactive && !item.conflict && item.nextDate && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-zinc-500">
                        → Próxima data: {new Date(item.nextDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} — ver na agenda para detalhes
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isInactive && (
                    <button
                      onClick={() => onNavigateToDate(item.appointment.date)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold bg-priori-navy text-white rounded-lg hover:bg-priori-navy/90 transition-colors"
                      title="Ir para a data na agenda para resolver o conflito"
                    >
                      <Eye size={12} />
                      Ver na Agenda
                    </button>
                  )}
                  <button
                    onClick={() => handleDismiss(item.appointment.id)}
                    disabled={dismissing === item.appointment.id}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors',
                      dismissing === item.appointment.id
                        ? 'bg-zinc-100 text-zinc-400'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    )}
                    title={isInactive ? 'Encerrar alerta (série já parada)' : 'Dispensar alerta'}
                  >
                    {dismissing === item.appointment.id
                      ? <RefreshCw size={12} className="animate-spin" />
                      : <XCircle size={12} />
                    }
                    Dispensar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
