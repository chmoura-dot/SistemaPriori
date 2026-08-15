import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Calendar as CalendarIcon, 
  Users, 
  Home, 
  AlertTriangle, 
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  Info
} from 'lucide-react';
import { api } from '../services/api';
import { 
  Appointment, 
  Room, 
  Psychologist, 
  AttendanceMode,
  AppointmentStatus
} from '../services/types';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';

const DAYS_OF_WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface DailyStats {
  date: string;
  label: string;
  total: number;
  occupied: number;
  available: number;
  bottleneck: number;
  rate: number;
}

type SlotStatus = 'occupied' | 'available' | 'bottleneck';
type SlotStatusMap = Record<string, Record<string, Record<string, SlotStatus>>>;

export const CapacityPage = () => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getWeekRange = (currentDate: string) => {
    const d = new Date(currentDate + 'T12:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    return {
      start: monday.toISOString().split('T')[0],
      end: saturday.toISOString().split('T')[0]
    };
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const psysPromise = api.getPsychologists();
      const roomsPromise = api.getRooms();
      
      let apptsPromise;
      if (viewMode === 'daily') {
        apptsPromise = api.getAppointments(date);
      } else {
        const { start, end } = getWeekRange(date);
        apptsPromise = api.getAppointmentsByRange(start, end);
      }

      const [apptsData, roomsData, psysData] = await Promise.all([
        apptsPromise,
        roomsPromise,
        psysPromise
      ]);
      
      setAppointments(apptsData);
      setRooms(roomsData.filter(r => r.active));
      setPsychologists(psysData.filter(p => p.active));
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [date, viewMode]);

  const getTimeSlotsForDate = (targetDate: string) => {
    const d = new Date(targetDate + 'T12:00:00');
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0) return []; // Sunday closed
    const limitHour = dayOfWeek === 6 ? 14 : 20;

    return Array.from({ length: 13 }, (_, i) => {
      const hour = 8 + i;
      return `${hour.toString().padStart(2, '0')}:00`;
    }).filter(slot => {
      const h = parseInt(slot.split(':')[0]);
      return h <= limitHour;
    });
  };

  const timeSlots = useMemo(() => getTimeSlotsForDate(date), [date]);

  const { resolvedStatuses, stats } = useMemo<{
    resolvedStatuses: SlotStatusMap;
    stats: {
      totalSlots: number;
      occupiedCount: number;
      availableCount: number;
      bottleneckCount: number;
      occupancyRate: number;
      dailyBreakdown?: DailyStats[];
    };
  }>(() => {
    const datesToProcess: string[] = [];
    if (viewMode === 'daily') {
      datesToProcess.push(date);
    } else {
      const { start } = getWeekRange(date);
      for (let i = 0; i < 6; i++) {
        const d = new Date(start + 'T12:00:00');
        d.setDate(d.getDate() + i);
        datesToProcess.push(d.toISOString().split('T')[0]);
      }
    }

    const statuses: SlotStatusMap = {};
    let totalSlots = 0;
    let occupiedCount = 0;
    let availableCount = 0;
    let bottleneckCount = 0;
    const dailyBreakdown: DailyStats[] = [];

    datesToProcess.forEach(targetDate => {
      statuses[targetDate] = {};
      const targetTimeSlots = getTimeSlotsForDate(targetDate);
      const dayAppointments = appointments.filter(
        a => a.date === targetDate && a.status !== AppointmentStatus.CANCELED
      );

      const d = new Date(targetDate + 'T12:00:00');
      const dayOfWeek = d.getDay();

      const dTotal = targetTimeSlots.length * rooms.length;
      let dOccupied = 0;
      let dAvailable = 0;
      let dBottleneck = 0;

      targetTimeSlots.forEach(slot => {
        statuses[targetDate][slot] = {};
        const slotStart = slot;
        const [h] = slot.split(':').map(Number);
        const slotEnd = `${(h + 1).toString().padStart(2, '0')}:00`;

        // 1. Identify which rooms are occupied in this slot
        const occupiedRoomIds = new Set<string>();
        dayAppointments.forEach(a => {
          if (
            (slotStart >= a.startTime && slotStart < a.endTime) ||
            (slotEnd > a.startTime && slotEnd <= a.endTime)
          ) {
            occupiedRoomIds.add(a.roomId);
          }
        });

        // 2. Identify available psychologists in this slot
        const availablePsys = psychologists.filter(psy => {
          const hasAvailability = psy.availability.some(s => 
            s.dayOfWeek === dayOfWeek && 
            slotStart >= s.startTime && 
            slotEnd <= s.endTime &&
            (s.mode === 'Presencial' || s.mode === 'Ambos' || !s.mode)
          );

          if (!hasAvailability) return false;

          const isPsyBusy = dayAppointments.some(a => 
            a.psychologistId === psy.id && 
            ((slotStart >= a.startTime && slotStart < a.endTime) ||
             (slotEnd > a.startTime && slotEnd <= a.endTime))
          );

          return !isPsyBusy;
        });

        let availablePsyCount = availablePsys.length;

        // 3. Assign statuses to each room
        rooms.forEach(room => {
          if (occupiedRoomIds.has(room.id)) {
            statuses[targetDate][slot][room.id] = 'occupied';
            dOccupied++;
          } else {
            if (availablePsyCount > 0) {
              statuses[targetDate][slot][room.id] = 'available';
              dAvailable++;
              availablePsyCount--;
            } else {
              statuses[targetDate][slot][room.id] = 'bottleneck';
              dBottleneck++;
            }
          }
        });
      });

      totalSlots += dTotal;
      occupiedCount += dOccupied;
      availableCount += dAvailable;
      bottleneckCount += dBottleneck;

      if (viewMode === 'weekly') {
        dailyBreakdown.push({
          date: targetDate,
          label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
          total: dTotal,
          occupied: dOccupied,
          available: dAvailable,
          bottleneck: dBottleneck,
          rate: dTotal > 0 ? (dOccupied / dTotal) * 100 : 0
        });
      }
    });

    const occupancyRate = totalSlots > 0 ? (occupiedCount / totalSlots) * 100 : 0;

    return {
      resolvedStatuses: statuses,
      stats: {
        totalSlots,
        occupiedCount,
        availableCount,
        bottleneckCount,
        occupancyRate,
        dailyBreakdown: viewMode === 'weekly' ? dailyBreakdown : undefined
      }
    };
  }, [appointments, rooms, psychologists, date, viewMode]);

  const changeDate = (days: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Análise de Capacidade</h2>
          <p className="text-zinc-500 text-sm">Otimize o uso das salas e visualize a necessidade de expansão da equipe.</p>
        </div>
        
        <div className="flex gap-2">
          <div className="flex items-center bg-white border border-zinc-100 rounded-xl p-1 shadow-sm">
            <button 
              onClick={() => setViewMode('daily')}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                viewMode === 'daily' ? "bg-priori-navy text-white shadow-md" : "text-zinc-400 hover:text-priori-navy"
              )}
            >
              Diário
            </button>
            <button 
              onClick={() => setViewMode('weekly')}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                viewMode === 'weekly' ? "bg-priori-navy text-white shadow-md" : "text-zinc-400 hover:text-priori-navy"
              )}
            >
              Semanal
            </button>
          </div>

          <div className="flex items-center bg-white border border-zinc-100 rounded-xl p-1 shadow-sm">
            <button onClick={() => changeDate(viewMode === 'daily' ? -1 : -7)} className="p-2 hover:bg-zinc-50 rounded-lg transition-colors text-priori-navy">
              <ChevronLeft size={20} />
            </button>
            <div className="px-4 text-sm font-bold text-priori-navy flex items-center gap-2 whitespace-nowrap">
              <CalendarIcon size={16} className="text-priori-gold" />
              {viewMode === 'daily' ? (
                new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { 
                  weekday: 'short', 
                  day: '2-digit', 
                  month: 'long' 
                })
              ) : (
                (() => {
                  const { start, end } = getWeekRange(date);
                  const startD = new Date(start + 'T12:00:00');
                  const endD = new Date(end + 'T12:00:00');
                  return `${startD.getDate().toString().padStart(2, '0')}/${(startD.getMonth() + 1).toString().padStart(2, '0')} - ${endD.getDate().toString().padStart(2, '0')}/${(endD.getMonth() + 1).toString().padStart(2, '0')}`;
                })()
              )}
            </div>
            <button onClick={() => changeDate(viewMode === 'daily' ? 1 : 7)} className="p-2 hover:bg-zinc-50 rounded-lg transition-colors text-priori-navy">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-zinc-100 rounded-lg" />
                <div className="h-3 bg-zinc-200 rounded w-24" />
              </div>
              <div className="h-8 bg-zinc-200 rounded w-16 mb-2" />
              <div className="h-2 bg-zinc-100 rounded w-full overflow-hidden" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-priori-navy/5 rounded-lg text-priori-navy">
                <TrendingUp size={20} />
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ocupação Atual</span>
            </div>
            <div className="text-2xl font-black text-priori-navy">{stats.occupancyRate.toFixed(1)}%</div>
            <div className="mt-2 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-priori-navy transition-all duration-500" 
                style={{ width: `${stats.occupancyRate}%` }}
              />
            </div>
          </div>

          <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <CheckCircle2 size={20} />
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Horários Livres</span>
            </div>
            <div className="text-2xl font-black text-emerald-600">{stats.availableCount}</div>
            <p className="text-[10px] text-zinc-500 mt-1">Salas com profissionais disponíveis</p>
          </div>

          <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm border-l-4 border-l-priori-gold">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-50 rounded-lg text-priori-gold">
                <AlertTriangle size={20} />
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Gargalos de Equipe</span>
            </div>
            <div className="text-2xl font-black text-priori-gold">{stats.bottleneckCount}</div>
            <p className="text-[10px] text-zinc-500 mt-1">Sala livre mas sem psicólogo no turno</p>
          </div>

          <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-zinc-50 rounded-lg text-zinc-500">
                <Users size={20} />
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Capacidade Total</span>
            </div>
            <div className="text-2xl font-black text-zinc-700">{stats.totalSlots}h</div>
            <p className="text-[10px] text-zinc-500 mt-1">Somatório de salas no período</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden animate-pulse">
          <div className="p-4 border-b border-zinc-50 bg-zinc-50/30 flex items-center justify-between">
            <div className="h-4 bg-zinc-200 rounded w-48" />
            <div className="flex gap-4">
              <div className="w-12 h-3 bg-zinc-200 rounded" />
              <div className="w-12 h-3 bg-zinc-200 rounded" />
              <div className="w-12 h-3 bg-zinc-200 rounded" />
            </div>
          </div>
          <div className="p-6 border-b border-zinc-50 bg-white">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-zinc-50/50 border border-zinc-100 rounded-xl p-3 h-28 flex flex-col justify-between">
                  <div className="h-3 bg-zinc-200 rounded w-16 animate-pulse" />
                  <div className="h-6 bg-zinc-200 rounded w-12 animate-pulse" />
                  <div className="h-1 bg-zinc-200 rounded-full w-full animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="flex gap-4 items-center">
                <div className="w-16 h-10 bg-zinc-50 rounded animate-pulse" />
                <div className="flex-1 h-10 bg-zinc-50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-50 bg-zinc-50/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-priori-navy" />
            <h3 className="font-bold text-priori-navy">
              {viewMode === 'daily' ? 'Mapa de Utilização de Salas' : 'Resumo de Ocupação da Semana'}
            </h3>
          </div>
          
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-priori-navy/10 border border-priori-navy/20" />
              <span className="text-[10px] font-medium text-zinc-500">Ocupado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />
              <span className="text-[10px] font-medium text-zinc-500">Livre + Equipe</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-amber-50 border border-amber-200 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.2)]" />
              <span className="text-[10px] font-medium text-zinc-500">Gargalo (Precisa contratar)</span>
            </div>
          </div>
        </div>

        {viewMode === 'weekly' && stats.dailyBreakdown && (
          <div className="p-6 border-b border-zinc-50 bg-white">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {stats.dailyBreakdown.map((day: DailyStats) => (
                <div 
                  key={day.date} 
                  onClick={() => {
                    setDate(day.date);
                    setViewMode('daily');
                  }}
                  className="bg-zinc-50/50 border border-zinc-100 rounded-xl p-3 cursor-pointer hover:border-priori-navy/20 transition-all group"
                >
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 group-hover:text-priori-navy">
                    {day.label}
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-lg font-black text-priori-navy">{day.rate.toFixed(0)}%</div>
                    <div className="text-[10px] text-zinc-400 font-medium">Ocupação</div>
                  </div>
                  <div className="mt-2 h-1 bg-zinc-200 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all",
                        day.rate > 80 ? "bg-rose-500" : day.rate > 50 ? "bg-amber-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${day.rate}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-2">
                    <div>
                      <div className="text-[8px] font-bold text-zinc-400 uppercase">Livres</div>
                      <div className="text-xs font-bold text-emerald-600">{day.available}h</div>
                    </div>
                    <div>
                      <div className="text-[8px] font-bold text-zinc-400 uppercase">Gargalo</div>
                      <div className="text-xs font-bold text-amber-600">{day.bottleneck}h</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-white border-b border-zinc-100">
                <th className="p-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-r border-zinc-100 w-24">
                  Hora
                </th>
                {rooms.map(room => (
                  <th key={room.id} className="p-3 text-[10px] font-bold text-priori-navy uppercase tracking-widest border-r border-zinc-100 last:border-r-0">
                    {room.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map(slot => (
                <tr key={slot} className="border-b border-zinc-50 last:border-b-0">
                  <td className="p-3 text-xs font-bold text-zinc-500 bg-zinc-50/30 border-r border-zinc-100 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Clock size={12} className="text-zinc-300" />
                      {slot}
                    </div>
                  </td>
                  {rooms.map(room => {
                    const status = resolvedStatuses[date]?.[slot]?.[room.id] || 'bottleneck';
                    return (
                      <td key={`${slot}-${room.id}`} className="p-1 border-r border-zinc-100 last:border-r-0">
                        <div className={cn(
                          "h-12 rounded-xl flex items-center justify-center transition-all",
                          status === 'occupied' && "bg-priori-navy/5 border border-priori-navy/10 text-priori-navy/40",
                          status === 'available' && "bg-emerald-50 border border-emerald-200 text-emerald-600 shadow-sm",
                          status === 'bottleneck' && "bg-amber-50 border border-amber-200 text-priori-gold shadow-sm animate-pulse-slow"
                        )}>
                          {status === 'available' && (
                            <div className="flex flex-col items-center">
                              <CheckCircle2 size={14} />
                              <span className="text-[8px] font-black uppercase mt-0.5">Disponível</span>
                            </div>
                          )}
                          {status === 'bottleneck' && (
                            <div className="flex flex-col items-center">
                              <AlertTriangle size={14} />
                              <span className="text-[8px] font-black uppercase mt-0.5 text-center px-1">Gargalo</span>
                            </div>
                          )}
                          {status === 'occupied' && (
                            <span className="text-[8px] font-bold uppercase opacity-50">Ocupado</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 bg-zinc-50/50 border-t border-zinc-100">
          <div className="flex items-start gap-3 text-zinc-500 max-w-2xl px-2">
            <div className="p-1.5 bg-white rounded-lg border border-zinc-100 shadow-sm mt-0.5">
              <Info size={14} className="text-priori-navy" />
            </div>
            <div>
              <p className="text-xs font-medium text-priori-navy">Como ler este mapa?</p>
              <p className="text-[11px] leading-relaxed mt-1">
                Os blocos <strong className="text-amber-600">Amarelos (Gargalo)</strong> indicam que a sala está vazia mas você não tem nenhum psicólogo disponível na equipe para este horário. Estes são os momentos ideais para contratar novos profissionais.
                Os blocos <strong className="text-emerald-600">Verdes</strong> mostram horários que já poderiam ter pacientes sendo atendidos com sua equipe atual.
              </p>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
