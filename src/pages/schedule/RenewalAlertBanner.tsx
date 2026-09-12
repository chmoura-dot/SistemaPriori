import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, CalendarClock, XCircle, RefreshCw, UserX, Clock } from 'lucide-react';
import { api } from '../../services/api';
import { Appointment, Customer, Psychologist } from '../../services/types';
import { cn } from '../../lib/utils';
import { toastError } from '../../lib/toast';
import { classifyRenewalAppointment, getNextOccurrenceDate, RenewalConflictInfo } from '../../lib/renewalAlerts';

interface RenewalAlertBannerProps {
  psychologists: Psychologist[];
  /** Abre o formulário de edição do agendamento já na data que precisa de ajuste. */
  onResolveConflict: (appointment: Appointment, targetDate: string) => void;
  /** Leva o usuário até o cadastro do paciente para reativá-lo ou encerrar a série. */
  onViewCustomer: (customerId: string) => void;
}

interface RenewalItem {
  appointment: Appointment;
  customer: Customer | undefined;
  psychologistName: string;
  reason: 'inactive' | 'conflict' | 'pending';
  daysUntil: number;
  conflict?: RenewalConflictInfo;
  nextDate?: string; // YYYY-MM-DD da próxima ocorrência
}

export const RenewalAlertBanner: React.FC<RenewalAlertBannerProps> = ({
  psychologists,
  onResolveConflict,
  onViewCustomer,
}) => {
  const [items, setItems] = useState<RenewalItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRenewals = useCallback(async () => {
    try {
      setIsLoading(true);
      const candidates = await api.getAppointmentsNeedingRenewal();
      if (candidates.length === 0) { setItems([]); return; }

      // Busca a janela de datas que cobre a PRÓXIMA ocorrência de cada
      // candidato (não a data exibida na Agenda) — mesmo critério usado pelo
      // badge do Sidebar, para os dois nunca discordarem sobre o que é
      // "acionável" (ver Sidebar.tsx).
      const nextDates = candidates.map(c => getNextOccurrenceDate(c.date, c.recurrenceFrequency));
      const minDate = nextDates.reduce((min, d) => (d < min ? d : min), nextDates[0]);
      const maxDate = nextDates.reduce((max, d) => (d > max ? d : max), nextDates[0]);
      const [allCustomers, nearbyAppointments] = await Promise.all([
        api.getCustomers(), // não filtrado — precisamos achar paciente mesmo se inativo
        api.getAppointmentsByRange(minDate, maxDate),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mapped: RenewalItem[] = candidates.map(app => {
        const customer = allCustomers.find(c => c.id === app.customerId);
        const psych = psychologists.find(p => p.id === app.psychologistId);
        const appDate = new Date(app.date + 'T12:00:00');
        appDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((appDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        const { reason, conflict, nextDate } = classifyRenewalAppointment(app, allCustomers, nearbyAppointments);

        return {
          appointment: app,
          customer,
          psychologistName: psych?.name || '—',
          reason,
          daysUntil,
          conflict,
          nextDate,
        };
      });

      // Filtrar: só mostrar itens que precisam de ação humana (inactive + conflict)
      // "pending" = o auto-renew vai resolver, não precisa mostrar no banner
      const actionable = mapped.filter(i => i.reason !== 'pending');

      // Ordenar: vencidos primeiro, depois por proximidade
      actionable.sort((a, b) => a.daysUntil - b.daysUntil);
      setItems(actionable);
    } catch {
      toastError('Não foi possível carregar os agendamentos com renovação pendente.');
    } finally {
      setIsLoading(false);
    }
  }, [psychologists]);

  useEffect(() => { loadRenewals(); }, [loadRenewals]);

  const handleDismiss = async (appointmentId: string) => {
    setDismissing(appointmentId);
    try {
      await api.updateAppointment(appointmentId, { needsRenewal: false });
      setItems(prev => prev.filter(i => i.appointment.id !== appointmentId));
      // Notifica Sidebar para atualizar badge imediatamente
      window.dispatchEvent(new CustomEvent('renewal-updated'));
    } catch {
      toastError('Não foi possível ignorar este aviso. Tente novamente.');
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
        aria-expanded={isExpanded}
        aria-controls="renewal-alert-list"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600" />
          <span className="text-sm font-bold text-amber-800">
            {items.length} agendamento(s) com renovação pendente
          </span>
          <span className="text-xs text-amber-600">
            — o sistema automático não conseguiu renovar, resolva abaixo
          </span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-amber-600" /> : <ChevronDown size={16} className="text-amber-600" />}
      </button>

      {/* List */}
      {isExpanded && (
        <div id="renewal-alert-list" className="border-t border-amber-200">
          {items.map(item => {
            const urgency = urgencyLabel(item.daysUntil);
            const isInactive = item.reason === 'inactive';

            const primaryAction = () => {
              if (isInactive) onViewCustomer(item.appointment.customerId);
              else onResolveConflict(item.appointment, item.nextDate ?? item.appointment.date);
            };

            return (
              <div
                key={item.appointment.id}
                onClick={primaryAction}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); primaryAction(); } }}
                role="button"
                tabIndex={0}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-amber-100 last:border-b-0 hover:bg-amber-100/60 cursor-pointer transition-colors"
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
                      {item.customer?.name || 'Paciente não encontrado no cadastro'}
                    </span>
                    <span className="text-[10px] text-zinc-400">({item.psychologistName})</span>
                    <span className={cn('text-[10px] font-bold', urgency.color)}>
                      {urgency.text}
                    </span>
                  </div>
                  {/* Frase de ação em destaque: o que aconteceu e o que fazer */}
                  <div className="mt-0.5">
                    {isInactive ? (
                      <span className="text-[11px] font-bold text-red-700">
                        ⛔ Paciente inativo no cadastro — clique para reativar ou encerrar a série.
                      </span>
                    ) : item.conflict ? (
                      <span className="text-[11px] font-bold text-orange-700">
                        ⚠️ Próxima sessão ({item.conflict.conflictDate}) colide com <strong>{item.conflict.conflictName}</strong> ({item.conflict.conflictTime}) — clique para reagendar.
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-yellow-700">
                        ⚠️ Conflito de horário na próxima sessão — clique para reagendar.
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5">
                    <span className="text-[10px] text-zinc-500">
                      Última sessão: {new Date(item.appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às {item.appointment.startTime}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  {isInactive ? (
                    <button
                      onClick={() => onViewCustomer(item.appointment.customerId)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold bg-priori-navy text-white rounded-lg hover:bg-priori-navy/90 transition-colors"
                      title="Abrir o cadastro deste paciente para reativar ou encerrar a série"
                    >
                      <UserX size={12} />
                      Ver Paciente
                    </button>
                  ) : (
                    <button
                      onClick={() => onResolveConflict(item.appointment, item.nextDate ?? item.appointment.date)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold bg-priori-navy text-white rounded-lg hover:bg-priori-navy/90 transition-colors"
                      title="Abrir a edição deste agendamento já na data do conflito"
                    >
                      <CalendarClock size={12} />
                      Reagendar
                    </button>
                  )}
                  <button
                    onClick={() => handleDismiss(item.appointment.id)}
                    disabled={dismissing === item.appointment.id}
                    aria-label={isInactive ? 'Encerrar alerta, a série já parou' : 'Ignorar aviso sem resolver'}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors',
                      dismissing === item.appointment.id
                        ? 'bg-zinc-100 text-zinc-400'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    )}
                    title={isInactive ? 'Encerrar alerta (série já parada) — não reativa o paciente' : 'Apenas oculta o aviso — não resolve o conflito'}
                  >
                    {dismissing === item.appointment.id
                      ? <RefreshCw size={12} className="animate-spin" />
                      : <XCircle size={12} />
                    }
                    Ignorar
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
