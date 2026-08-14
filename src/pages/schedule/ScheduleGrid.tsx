import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Appointment, Room, Psychologist, Customer, AttendanceMode, AppointmentStatus } from '../../services/types';
import { cn } from '../../lib/utils';
import { addMinutes } from './scheduleUtils';
import { AppointmentCard } from './AppointmentCard';
import { toMinutes, hasTimeOverlap } from '../../lib/timeUtils';

interface ScheduleGridProps {
  appointments: Appointment[];
  rooms: Room[];
  psychologists: Psychologist[];
  customers: Customer[];
  viewMode: 'daily' | 'weekly' | 'psychologist';
  selectedRoom: string;
  selectedPsychologistId: string;
  date: string;
  weekDays: string[];
  timeSlots: string[];
  editingId: string | null;
  formMode: AttendanceMode;
  onEdit: (app: Appointment) => void;
  onDelete: (app: Appointment) => void;
  onReminder: (app: Appointment) => void;
  onCancelBilling: (id: string) => void;
  onReschedule: (app: Appointment) => void;
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = React.memo(({
  appointments,
  rooms,
  psychologists,
  customers,
  viewMode,
  selectedRoom,
  selectedPsychologistId,
  date,
  weekDays,
  timeSlots,
  formMode,
  onEdit,
  onDelete,
  onReminder,
  onCancelBilling,
  onReschedule,
}) => {
  const cardHandlers = { onEdit, onDelete, onReminder, onCancelBilling, onReschedule };

  // Quando um horário foi cancelado E remanejado, dois registros (cancelado +
  // ativo) ocupam o mesmo slot. O agendamento ATIVO deve sempre ter prioridade
  // de exibição — caso contrário o .find() poderia retornar o cancelado de forma
  // não-determinística (a ordenação por date+start_time é idêntica p/ ambos).
  const pickSlotAppointment = (matches: Appointment[]): Appointment | undefined => {
    if (matches.length <= 1) return matches[0];
    return matches.find(a => a.status !== AppointmentStatus.CANCELED) ?? matches[0];
  };

  // ── OTIMIZAÇÃO: Indexação O(1) de agendamentos por slot/célula do grid ──
  const appointmentByCell = useMemo(() => {
    const map: Record<string, Appointment[]> = {};

    appointments.forEach(a => {
      // Varremos os slots e checamos overlaps
      timeSlots.forEach(slot => {
        const slotEnd = addMinutes(slot, 30);
        const overlaps = a.startTime < slotEnd && a.endTime > slot;
        if (!overlaps) return;

        if (viewMode === 'daily') {
          if (a.date === date && a.mode === AttendanceMode.PRESENCIAL) {
            const key = `${slot}-${a.roomId}`;
            if (!map[key]) map[key] = [];
            map[key].push(a);
          }
        } else if (viewMode === 'weekly') {
          if (a.roomId === selectedRoom && a.mode === AttendanceMode.PRESENCIAL) {
            const key = `${slot}-${a.date}`;
            if (!map[key]) map[key] = [];
            map[key].push(a);
          }
        } else if (viewMode === 'psychologist') {
          if (a.psychologistId === selectedPsychologistId) {
            const key = `${slot}-${a.date}`;
            if (!map[key]) map[key] = [];
            map[key].push(a);
          }
        }
      });
    });

    return map;
  }, [appointments, viewMode, date, selectedRoom, selectedPsychologistId, timeSlots]);

  // ── OTIMIZAÇÃO: Cache e Indexação rápida de conflitos para hasMinSpaceFast ──
  const conflictsMap = useMemo(() => {
    const activeAppsByRoom: Record<string, Appointment[]> = {};
    const activeAppsByPsy: Record<string, Appointment[]> = {};

    appointments.forEach(a => {
      if (a.status === AppointmentStatus.CANCELED) return;

      const rKey = `${a.date}-${a.roomId}`;
      if (!activeAppsByRoom[rKey]) activeAppsByRoom[rKey] = [];
      activeAppsByRoom[rKey].push(a);

      const pKey = `${a.date}-${a.psychologistId}`;
      if (!activeAppsByPsy[pKey]) activeAppsByPsy[pKey] = [];
      activeAppsByPsy[pKey].push(a);
    });

    return { activeAppsByRoom, activeAppsByPsy };
  }, [appointments]);

  // ── OTIMIZAÇÃO: Versão ultraveloz do hasMinSpace em O(1) usando o cache local ──
  const hasMinSpaceFast = (
    slot: string,
    dateStr: string,
    roomId: string | undefined,
    psyId: string | undefined,
  ): boolean => {
    const minEndTime = addMinutes(slot, 10);
    const isOnline = formMode === AttendanceMode.ONLINE;
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
    const isSaturday = dayOfWeek === 6;
    const limit = isSaturday ? '14:00' : '20:00';

    if (!isOnline && minEndTime > limit) return false;
    if (dayOfWeek === 0) return false;

    if (roomId) {
      const key = `${dateStr}-${roomId}`;
      const relevantApps = conflictsMap.activeAppsByRoom[key] ?? [];
      const hasConflict = relevantApps.some(a =>
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

      const key = `${dateStr}-${psyId}`;
      const relevantApps = conflictsMap.activeAppsByPsy[key] ?? [];
      const hasPsyConflict = relevantApps.some(a =>
        hasTimeOverlap(slot, minEndTime, a.startTime, a.endTime)
      );
      if (hasPsyConflict) return false;
    }

    return true;
  };


  return (
    <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[1200px]">
          {/* Header Row */}
          <div className="grid grid-cols-[80px_repeat(6,1fr)] border-b border-zinc-100 bg-zinc-50/50">
            <div className="p-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-r border-zinc-100 flex items-center justify-center">
              Hora
            </div>
            {viewMode === 'daily'
              ? rooms.map(room => (
                  <div
                    key={room.id}
                    className="p-2 text-[10px] font-bold text-priori-navy uppercase tracking-widest text-center border-r border-zinc-100 last:border-r-0"
                  >
                    {room.name}
                  </div>
                ))
              : weekDays.map(day => (
                  <div
                    key={day}
                    className="p-2 text-[10px] font-bold text-priori-navy uppercase tracking-widest text-center border-r border-zinc-100 last:border-r-0"
                  >
                    {new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    })}
                  </div>
                ))}
          </div>

          {/* Time Slots */}
          {timeSlots.map(slot => {
            const isHour = slot.endsWith(':00');
            return (
              <div
                key={slot}
                className={cn(
                  'grid grid-cols-[80px_repeat(6,1fr)] border-b border-zinc-100 last:border-b-0',
                  !isHour && 'border-zinc-50/10'
                )}
              >
                <div
                  className={cn(
                    'p-1.5 text-[10px] font-medium border-r border-zinc-100 flex items-center justify-center bg-zinc-50/20',
                    isHour ? 'text-zinc-500 font-bold' : 'text-zinc-300'
                  )}
                >
                  {slot}
                </div>

                {viewMode === 'daily'
                  ? rooms.map(room => {
                      const key = `${slot}-${room.id}`;
                      const appointment = pickSlotAppointment(appointmentByCell[key] ?? []);
                      const isFirstSlot =
                        !!appointment &&
                        appointment.startTime >= slot &&
                        appointment.startTime < addMinutes(slot, 30);
                      const customer = customers.find(c => c.id === appointment?.customerId);
                      const psychologist = psychologists.find(p => p.id === appointment?.psychologistId);

                      return (
                        <div
                          key={`${slot}-${room.id}`}
                          className="p-0.5 border-r border-zinc-100 last:border-r-0 min-h-[80px] relative group"
                        >
                          {appointment ? (
                            isFirstSlot ? (
                              <AppointmentCard
                                appointment={appointment}
                                customer={customer}
                                subtitle={psychologist?.name || ''}
                                slot={slot}
                                {...cardHandlers}
                              />
                            ) : (
                              <div className="h-full w-full" />
                            )
                          ) : hasMinSpaceFast(
                              slot,
                              date,
                              room.id,
                              undefined
                            ) ? (
                            <div className="h-full w-full rounded-md border border-dashed border-zinc-100 flex items-center justify-center text-zinc-200">
                              <Plus size={10} />
                            </div>
                          ) : (
                            <div className="h-full w-full bg-zinc-50/30" />
                          )}
                        </div>
                      );
                    })
                  : weekDays.map(day => {
                      const key = `${slot}-${day}`;
                      const appointment = pickSlotAppointment(appointmentByCell[key] ?? []);
                      const isFirstSlot =
                        !!appointment &&
                        appointment.startTime >= slot &&
                        appointment.startTime < addMinutes(slot, 30);
                      const customer = customers.find(c => c.id === appointment?.customerId);
                      const psychologist = psychologists.find(p => p.id === appointment?.psychologistId);
                      const subtitle =
                        viewMode === 'psychologist'
                          ? rooms.find(r => r.id === appointment?.roomId)?.name || 'Online'
                          : psychologist?.name || '';

                      return (
                        <div
                          key={`${slot}-${day}`}
                          className="p-0.5 border-r border-zinc-100 last:border-r-0 min-h-[80px] relative group"
                        >
                          {appointment ? (
                            isFirstSlot ? (
                              <AppointmentCard
                                appointment={appointment}
                                customer={customer}
                                subtitle={subtitle}
                                slot={slot}
                                {...cardHandlers}
                              />
                            ) : (
                              <div className="h-full w-full" />
                            )
                          ) : hasMinSpaceFast(
                              slot,
                              day,
                              viewMode === 'psychologist' ? undefined : selectedRoom,
                              viewMode === 'psychologist' ? selectedPsychologistId : undefined
                            ) ? (
                            <div className="h-full w-full rounded-md border border-dashed border-zinc-100 flex items-center justify-center text-zinc-200">
                              <Plus size={10} />
                            </div>
                          ) : (
                            <div className="h-full w-full bg-zinc-50/30" />
                          )}
                        </div>
                      );
                    })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

ScheduleGrid.displayName = 'ScheduleGrid';
