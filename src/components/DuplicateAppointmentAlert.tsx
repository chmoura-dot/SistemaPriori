import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Calendar, User, XCircle, Clock, ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react';
import { api } from '../services/api';
import { Appointment, AppointmentStatus, AttendanceMode } from '../services/types';
import { Modal } from './Modal';
import { Button } from './Button';

interface DuplicateAppointmentAlertProps {
  onNavigate: (path: string) => void;
}

type ConflictType = 'psychologist' | 'room';

interface Conflict {
  id: string; // id único para o conflito gerado a partir dos IDs dos agendamentos
  type: ConflictType;
  date: string;
  appointments: Appointment[];
  psychologistId?: string; // Para conflito de psicólogo
  roomId?: string; // Para conflito de sala
}

export const DuplicateAppointmentAlert: React.FC<DuplicateAppointmentAlertProps> = ({ onNavigate }) => {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [psychologists, setPsychologists] = useState<Record<string, string>>({});
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDismissedSession, setIsDismissedSession] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isAlertDismissedForToday = () => {
    const today = new Date().toISOString().split('T')[0];
    const key = `duplicate_alert_dismissed_${today}`;
    return localStorage.getItem(key) === 'true';
  };

  const dismissForToday = () => {
    const today = new Date().toISOString().split('T')[0];
    const key = `duplicate_alert_dismissed_${today}`;
    localStorage.setItem(key, 'true');
    setIsDismissedSession(true);
  };

  // Retorna true se houver sobreposição de horários (HH:mm)
  const isOverlapping = (start1: string, end1: string, start2: string, end2: string) => {
    return start1 < end2 && start2 < end1;
  };

  const loadData = useCallback(async () => {
    if (!api.isAuthenticated() || isAlertDismissedForToday()) return;
    
    try {
      setIsLoading(true);
      
      const today = new Date();
      const end = new Date(today);
      end.setDate(end.getDate() + 14); // Próximas 2 semanas
      
      const startStr = today.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      const [appointmentsData, customersData, psychologistsData, roomsData] = await Promise.all([
        api.getAppointmentsByRange(startStr, endStr),
        api.getCustomers(),
        api.getPsychologists(),
        api.getRooms()
      ]);
      
      const customerMap = customersData.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {});
      const psychologistMap = psychologistsData.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});
      const roomMap = roomsData.reduce((acc, r) => ({ ...acc, [r.id]: r.name }), {});
      
      setCustomers(customerMap);
      setPsychologists(psychologistMap);
      setRooms(roomMap);

      const activeAppointments = appointmentsData.filter(a => a.status !== AppointmentStatus.CANCELED);
      
      const detectedConflicts: Conflict[] = [];
      const processedPairs = new Set<string>();

      // Agrupar por data para otimizar
      const appointmentsByDate = activeAppointments.reduce((acc, app) => {
        if (!acc[app.date]) acc[app.date] = [];
        acc[app.date].push(app);
        return acc;
      }, {} as Record<string, Appointment[]>);

      Object.entries(appointmentsByDate).forEach(([date, dayApps]) => {
        for (let i = 0; i < dayApps.length; i++) {
          for (let j = i + 1; j < dayApps.length; j++) {
            const app1 = dayApps[i];
            const app2 = dayApps[j];
            
            // Garantir ordem consistente para o ID do par
            const pairId = [app1.id, app2.id].sort().join('-');
            if (processedPairs.has(pairId)) continue;

            // Verificar sobreposição de tempo
            if (isOverlapping(app1.startTime, app1.endTime, app2.startTime, app2.endTime)) {
              
              // 1. Conflito de Psicólogo
              if (app1.psychologistId === app2.psychologistId) {
                detectedConflicts.push({
                  id: `psych_${pairId}`,
                  type: 'psychologist',
                  date,
                  appointments: [app1, app2],
                  psychologistId: app1.psychologistId
                });
                processedPairs.add(pairId);
              }
              
              // 2. Conflito de Sala (somente presenciais)
              else if (
                app1.roomId && app2.roomId &&
                app1.roomId === app2.roomId &&
                app1.mode === AttendanceMode.PRESENCIAL && 
                app2.mode === AttendanceMode.PRESENCIAL
              ) {
                detectedConflicts.push({
                  id: `room_${pairId}`,
                  type: 'room',
                  date,
                  appointments: [app1, app2],
                  roomId: app1.roomId
                });
                processedPairs.add(pairId);
              }
            }
          }
        }
      });

      // Ordenar por data
      detectedConflicts.sort((a, b) => a.date.localeCompare(b.date));

      setConflicts(detectedConflicts);
      setCurrentIndex(prev => Math.min(prev, Math.max(0, detectedConflicts.length - 1)));
      
    } catch (error) {
      console.error('Erro ao buscar duplicidades:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Verifica a cada 10 minutos
    const interval = setInterval(loadData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Navegação por teclado (setas esquerda/direita)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (conflicts.length <= 1) return;
      if (e.key === 'ArrowLeft') setCurrentIndex(prev => Math.max(0, prev - 1));
      if (e.key === 'ArrowRight') setCurrentIndex(prev => Math.min(conflicts.length - 1, prev + 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [conflicts.length]);

  if (conflicts.length === 0 || isDismissedSession || isAlertDismissedForToday()) return null;

  const safeIndex = Math.min(currentIndex, conflicts.length - 1);
  const current = conflicts[safeIndex];
  const total = conflicts.length;
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < total - 1;

  const handleNavigateToSchedule = () => {
    onNavigate(`/agenda?date=${current.date}`);
    dismissForToday(); // Fechar após navegar
  };

  return (
    <Modal
      isOpen={true}
      onClose={dismissForToday}
      title="Atenção: Conflito de Agendamentos 🚨"
      className="max-w-md"
    >
      <div className="space-y-5">
        {/* Navegação: contador + setas */}
        {total > 1 && (
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={!hasPrev}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={14} />
              Anterior
            </button>

            <div className="flex items-center gap-2">
              {conflicts.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === safeIndex ? 'bg-red-500 w-4' : 'bg-zinc-300 hover:bg-zinc-400'
                  }`}
                />
              ))}
              <span className="ml-1 text-xs font-bold text-zinc-500">
                {safeIndex + 1}/{total}
              </span>
            </div>

            <button
              onClick={() => setCurrentIndex(prev => Math.min(total - 1, prev + 1))}
              disabled={!hasNext}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Próximo
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Banner */}
        <div className="flex items-start gap-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <div className="p-2 bg-red-100 rounded-lg shrink-0">
            {current.type === 'psychologist' ? (
              <Users className="text-red-600" size={24} />
            ) : (
              <MapPin className="text-red-600" size={24} />
            )}
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-red-900">
              {current.type === 'psychologist' ? 'Conflito de Psicólogo' : 'Conflito de Sala'}
            </h4>
            <p className="text-sm text-red-800 leading-relaxed">
              {current.type === 'psychologist' 
                ? 'Este psicólogo tem mais de um atendimento agendado para o mesmo horário.' 
                : 'Esta sala está agendada para mais de um atendimento presencial no mesmo horário.'}
            </p>
          </div>
        </div>

        {/* Detalhes do Conflito */}
        <div className="space-y-3 p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
          <div className="flex items-center gap-3 text-zinc-600 text-sm border-b border-zinc-200 pb-2 mb-2">
            <Calendar size={18} className="text-zinc-400" />
            <span className="font-semibold text-priori-navy">
              {new Date(current.date + 'T12:00:00').toLocaleDateString('pt-BR')}
            </span>
          </div>

          {current.type === 'psychologist' && current.psychologistId && (
            <div className="flex items-center gap-3 text-priori-navy font-medium mb-3">
              <User size={18} className="text-zinc-400" />
              <span>Psicólogo: {psychologists[current.psychologistId] || 'Desconhecido'}</span>
            </div>
          )}

          {current.type === 'room' && current.roomId && (
            <div className="flex items-center gap-3 text-priori-navy font-medium mb-3">
              <MapPin size={18} className="text-zinc-400" />
              <span>Sala: {rooms[current.roomId] || 'Desconhecida'}</span>
            </div>
          )}

          <div className="space-y-2 mt-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Agendamentos em conflito:</p>
            {current.appointments.map(app => (
              <div key={app.id} className="bg-white p-3 rounded-xl border border-zinc-200 text-sm">
                <div className="flex items-center gap-2 font-medium text-priori-navy mb-1">
                  <Clock size={14} className="text-zinc-400" />
                  {app.startTime} às {app.endTime}
                </div>
                <div className="flex flex-col gap-1 ml-5">
                  <span className="text-zinc-700">
                    <span className="font-semibold">Paciente:</span> {customers[app.customerId] || 'Desconhecido'}
                  </span>
                  {current.type === 'room' && (
                    <span className="text-zinc-500 text-xs">
                      Psicólogo: {psychologists[app.psychologistId] || 'Desconhecido'}
                    </span>
                  )}
                  {current.type === 'psychologist' && app.roomId && app.mode === AttendanceMode.PRESENCIAL && (
                    <span className="text-zinc-500 text-xs">
                      Sala: {rooms[app.roomId] || 'Desconhecida'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Botões de ação */}
        <div className="flex flex-col gap-2 mt-4">
          <Button
            onClick={handleNavigateToSchedule}
            className="w-full bg-priori-navy hover:bg-priori-navy/90 text-white h-12 rounded-xl flex items-center justify-center gap-2"
          >
            Ir para a Agenda
          </Button>
          
          <Button
            variant="ghost"
            onClick={dismissForToday}
            className="w-full text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 h-10 rounded-xl"
          >
            Fechar (ver amanhã)
          </Button>
        </div>

        <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest font-bold mt-2">
          {total > 1 ? `${total} conflitos encontrados · Use ← → para navegar` : 'Este alerta voltará amanhã se não for resolvido.'}
        </p>
      </div>
    </Modal>
  );
};
