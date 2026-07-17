import React from 'react';
import {
  Bell,
  BellOff,
  UserCheck,
  UserX,
  Edit2,
  Trash2,
  Globe,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Appointment, Customer, AppointmentStatus, AttendanceMode } from '../../services/types';
import { cn } from '../../lib/utils';
import { PLAN_COLORS, PLAN_LABELS, PLAN_BADGE_COLORS, INTERNAL_LABELS, getSlotCount } from './scheduleUtils';

// ─── StatusIcons ──────────────────────────────────────────────────────────────
interface StatusIconsProps {
  appointment: Appointment;
}

export const StatusIcons: React.FC<StatusIconsProps> = ({ appointment }) => (
  <div className="flex items-center gap-1.5 mt-1">
    {appointment.reminderSentAt && appointment.confirmationStatus === 'pending' && (
      <div className="flex items-center gap-1 text-[8px] font-bold text-amber-500 uppercase tracking-tighter animate-pulse">
        <Bell size={10} />
        Aguardando...
      </div>
    )}
    {appointment.confirmationStatus === 'confirmed' && (
      <div className="flex items-center gap-1 text-[8px] font-bold text-emerald-500 uppercase tracking-tighter">
        <UserCheck size={10} />
        Confirmado
      </div>
    )}
    {appointment.confirmationStatus === 'declined' && (
      <div className="flex items-center gap-1 text-[8px] font-bold text-red-500 uppercase tracking-tighter">
        <UserX size={10} />
        Cancelado
      </div>
    )}
    {appointment.confirmationStatus === 'pending' && !appointment.reminderSentAt && (
      <div className="flex items-center gap-1 text-[8px] font-bold text-zinc-300 uppercase tracking-tighter">
        <BellOff size={10} />
        Pendente
      </div>
    )}
  </div>
);

// ─── AppointmentCard (absolutely positioned inside grid cell) ─────────────────
export interface AppointmentCardProps {
  appointment: Appointment;
  customer: Customer | undefined;
  /** Psychologist name (daily/weekly) or room name (psychologist view) */
  subtitle: string;
  /** Current time slot string for vertical offset calculation */
  slot: string;
  onEdit: (app: Appointment) => void;
  onDelete: (app: Appointment) => void;
  onReminder: (app: Appointment) => void;
  onCancelBilling: (id: string) => void;
}

export const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  customer,
  subtitle,
  slot,
  onEdit,
  onDelete,
  onReminder,
  onCancelBilling,
}) => {
  const statusColors = {
    confirmed: 'bg-emerald-50/70 border-emerald-200 border-l-emerald-500',
    declined: 'bg-red-50/70 border-red-200 border-l-red-500',
    pending_sent: 'bg-amber-50/70 border-amber-200 border-l-amber-500',
    canceled: 'bg-zinc-100 border-zinc-200 border-l-zinc-300 opacity-60',
    active: cn(
      'bg-priori-navy/10 border-priori-navy/20',
      customer ? PLAN_COLORS[customer.healthPlan] || 'border-l-priori-navy' : 'border-l-priori-navy'
    ),
  };

  let currentStatus: keyof typeof statusColors = 'active';
  if (appointment.isInternal) currentStatus = 'canceled';
  else if (appointment.status === AppointmentStatus.CANCELED) currentStatus = 'canceled';
  else if (appointment.confirmationStatus === 'confirmed') currentStatus = 'confirmed';
  else if (appointment.confirmationStatus === 'declined') currentStatus = 'declined';
  else if (appointment.reminderSentAt) currentStatus = 'pending_sent';

  const slotCount = getSlotCount(appointment.startTime, appointment.endTime);
  const [hS, mS] = appointment.startTime.split(':').map(Number);
  const [hSlot, mSlot] = slot.split(':').map(Number);
  const minutesOffset = hS * 60 + mS - (hSlot * 60 + mSlot);
  const topOffset = (minutesOffset / 30) * 100;

  const displayTitle = appointment.isInternal
    ? appointment.internalType
      ? INTERNAL_LABELS[appointment.internalType] ?? (appointment.internalTitle || 'Horário Bloqueado')
      : 'Bloqueado'
    : customer?.name;

  return (
    <div
      className={cn(
        'absolute left-0.5 right-0.5 border rounded-md p-1.5 flex flex-col justify-between transition-all z-20 shadow-sm border-l-4 hover:shadow-md',
        appointment.isInternal
          ? 'bg-zinc-100 border-zinc-200 border-l-zinc-500/50 opacity-90'
          : statusColors[currentStatus]
      )}
      style={{
        height: `calc(${slotCount * 100}% + ${Math.floor(slotCount) - 1}px)`,
        top: `calc(${topOffset}% + 2px)`,
      }}
    >
      <div className="flex justify-between items-start gap-1">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p
              className={cn(
                'text-[10px] font-black truncate leading-none',
                appointment.isInternal
                  ? 'text-zinc-600'
                  : currentStatus === 'canceled'
                  ? 'text-zinc-500 line-through'
                  : 'text-priori-navy'
              )}
            >
              {displayTitle}
            </p>
            {appointment.isRecurring && (
              <CalendarIcon
                size={8}
                className={appointment.isInternal ? 'text-zinc-400 shrink-0' : 'text-priori-gold shrink-0'}
              />
            )}
          </div>
          <p className="text-[8px] text-zinc-600 font-bold truncate leading-none mt-1">{subtitle}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[7px] font-black text-priori-navy/70 uppercase tracking-tighter">
              {appointment.startTime}-{appointment.endTime}
            </span>
            {appointment.mode === AttendanceMode.ONLINE && (
              <Globe size={8} className={appointment.isInternal ? 'text-zinc-400' : 'text-emerald-500'} />
            )}
          </div>
          {!appointment.isInternal && customer && (
            <span className={cn(
              'text-[7px] font-black uppercase tracking-tight px-1 py-0.5 rounded-sm mt-0.5 self-start leading-none',
              PLAN_BADGE_COLORS[customer.healthPlan] ?? 'bg-zinc-100 text-zinc-500'
            )}>
              {PLAN_LABELS[customer.healthPlan] ?? customer.healthPlan}
            </span>
          )}
          {!appointment.isInternal && appointment.status === AppointmentStatus.CANCELED && appointment.cancellationFault && (
            <span className={cn(
              'text-[7px] font-black uppercase tracking-tight px-1 py-0.5 rounded-sm mt-0.5 self-start leading-none',
              appointment.cancellationFault === 'psychologist'
                ? 'bg-red-100 text-red-600'
                : 'bg-amber-100 text-amber-700'
            )}>
              {appointment.cancellationFault === 'psychologist' ? 'Falta Psicólogo' : 'Falta Paciente'}
            </span>
          )}
          {!appointment.isInternal && <StatusIcons appointment={appointment} />}
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onReminder(appointment)}
            className={cn(
              'transition-colors',
              appointment.reminderSentAt ? 'text-amber-600' : 'text-zinc-400 hover:text-priori-navy'
            )}
            title="Enviar Lembrete"
          >
            <Bell size={10} />
          </button>
          <button onClick={() => onEdit(appointment)} className="text-zinc-400 hover:text-priori-navy">
            <Edit2 size={10} />
          </button>
          {currentStatus !== 'canceled' && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onCancelBilling(appointment.id);
              }}
              className="text-red-400 hover:text-red-600 font-bold bg-red-50 px-1 rounded text-[10px]"
              title="Cancelar Sessão"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onDelete(appointment);
            }}
            className="text-zinc-400 hover:text-red-500"
            title="Excluir"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

    </div>
  );
};
