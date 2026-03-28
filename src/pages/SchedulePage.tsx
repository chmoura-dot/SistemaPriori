import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  Trash2, 
  User, 
  Home, 
  Activity, 
  Globe, 
  MessageCircle, 
  CheckCircle2, 
  AlertCircle,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Bell,
  BellOff,
  UserCheck,
  UserX,
  Check
} from 'lucide-react';
import { api } from '../services/api';
import { 
  Appointment, 
  Room, 
  Psychologist, 
  Customer, 
  AppointmentType,
  AttendanceMode,
  HealthPlan,
  AppointmentStatus,
  UserRole,
  Plan,
  RecurrenceFrequency
} from '../services/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

export const SchedulePage = () => {
  const [date, setDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return dateParam;
    }
    return new Date().toISOString().split('T')[0];
  });
  
  const changeDate = (days: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const user = api.getCurrentUser();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cancellationModalAppId, setCancellationModalAppId] = useState<string | null>(null);
  const [updateFuture, setUpdateFuture] = useState(false);

  const [formData, setFormData] = useState({
    customerId: '',
    psychologistId: '',
    roomId: '',
    mode: AttendanceMode.PRESENCIAL,
    type: AppointmentType.ADULTO,
    procedureCode: '',
    date: date,
    startTime: '08:00',
    endTime: '09:00',
    customPrice: undefined as number | undefined,
    customRepassAmount: undefined as number | undefined,
    isRecurring: false,
    recurrenceFrequency: RecurrenceFrequency.SEMANAL
  });

  const [isManualEndTime, setIsManualEndTime] = useState(false);

  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'psychologist'>('daily');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [selectedPsychologistId, setSelectedPsychologistId] = useState<string>('');

  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };

    if (isCustomerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCustomerDropdownOpen]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    return customers.filter(c => 
      c.name.toLowerCase().includes(customerSearch.toLowerCase())
    );
  }, [customers, customerSearch]);

  const loadData = async () => {
    setIsLoading(true);
    const [a, r, p, c, plansData] = await Promise.all([
      api.getAppointments(), // Load all for weekly view
      api.getRooms(),
      api.getPsychologists(),
      api.getCustomers(),
      api.getPlans()
    ]);
    setAppointments(a);
    setRooms(r);
    if (r.length > 0 && !selectedRoom) setSelectedRoom(r[0].id);
    setPsychologists(p);
    if (p.length > 0 && !selectedPsychologistId) setSelectedPsychologistId(p[0].id);
    setCustomers(c.filter(cust => cust.status === 'active'));
    setPlans(plansData);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const getWeekDays = (baseDate: string) => {
    const date = new Date(baseDate + 'T12:00:00');
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(date.setDate(diff));
    
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  };

  const weekDays = getWeekDays(date);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Validar sobreposição de horários antes de salvar/atualizar
      const conflicts = appointments.filter(a =>
        a.id !== editingId && // Exclui o próprio agendamento se estiver editando
        a.date === formData.date &&
        a.status !== AppointmentStatus.CANCELED &&
        (
          (formData.startTime >= a.startTime && formData.startTime < a.endTime) ||
          (formData.endTime > a.startTime && formData.endTime <= a.endTime) ||
          (formData.startTime <= a.startTime && formData.endTime >= a.endTime)
        )
      );

      const roomConflict = conflicts.some(a =>
        formData.mode === AttendanceMode.PRESENCIAL && a.mode === AttendanceMode.PRESENCIAL && a.roomId === formData.roomId
      );

      const psychologistConflict = conflicts.some(a =>
        a.psychologistId === formData.psychologistId
      );

      if (roomConflict) {
        throw new Error('Já existe um agendamento para esta sala neste horário.');
      }

      if (psychologistConflict) {
        throw new Error('O psicólogo selecionado já possui um agendamento neste horário.');
      }

      if (editingId) {
        const appointmentToEdit = appointments.find(a => a.id === editingId);
        
        if (appointmentToEdit?.isRecurring && appointmentToEdit.recurrenceGroupId && updateFuture) {
          await api.deleteFutureAppointments(appointmentToEdit.recurrenceGroupId, appointmentToEdit.date);
          await api.createAppointment({
            ...formData,
            date: formData.date,
            dayOfWeek: new Date(formData.date + 'T12:00:00').getDay(),
            status: AppointmentStatus.ACTIVE,
            roomId: formData.mode === AttendanceMode.ONLINE ? undefined : formData.roomId
          });
        } else {
          await api.updateAppointment(editingId, {
            ...formData,
            roomId: formData.mode === AttendanceMode.ONLINE ? undefined : formData.roomId
          });
        }
      } else {
        await api.createAppointment({
          ...formData,
          date: formData.date,
          dayOfWeek: new Date(formData.date + 'T12:00:00').getDay(),
          status: AppointmentStatus.ACTIVE,
          roomId: formData.mode === AttendanceMode.ONLINE ? undefined : formData.roomId
        });
      }
      await loadData();
      setIsModalOpen(false);
      setEditingId(null);
      setUpdateFuture(false);
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar agendamento');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (appointment: Appointment) => {
    setFormData({
      customerId: appointment.customerId,
      psychologistId: appointment.psychologistId,
      roomId: appointment.roomId || '',
      mode: appointment.mode,
      type: appointment.type,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      procedureCode: appointment.procedureCode || '',
      customPrice: appointment.customPrice,
      customRepassAmount: appointment.customRepassAmount,
      isRecurring: appointment.isRecurring,
      recurrenceFrequency: appointment.recurrenceFrequency || RecurrenceFrequency.SEMANAL
    });
    setEditingId(appointment.id);
    setUpdateFuture(false);
    setIsManualEndTime(true); // Preserve saved times on edit
    setIsModalOpen(true);
  };

  const handleDelete = async (appointment: Appointment) => {
    if (appointment.isRecurring && appointment.recurrenceGroupId) {
      const choice = confirm('Este é um agendamento recorrente.\n\nClique em OK para excluir TODOS os agendamentos FUTUROS deste grupo.\nClique em CANCELAR para excluir APENAS este horário específico.');
      
      if (choice) {
        // Delete all future
        try {
          await api.deleteFutureAppointments(appointment.recurrenceGroupId, appointment.date);
          await loadData();
          return;
        } catch (error) {
          alert('Erro ao excluir recorrências');
          return;
        }
      }
    }

    // Single delete logic (default or if specifically chosen)
    if (confirm('Deseja realmente desmarcar este horário específico?')) {
      await api.deleteAppointment(appointment.id);
      await loadData();
    }
  };

  const handleConfirm = async (id: string, type: 'patient' | 'psychologist') => {
    try {
      await api.updateAppointment(id, {
        [type === 'patient' ? 'confirmedPatient' : 'confirmedPsychologist']: true
      });
      await loadData();
    } catch (error) {
      alert('Erro ao confirmar');
    }
  };

  const handleCancelBillingChoice = async (billingMode: 'none' | 'plan' | 'particular') => {
    if (!cancellationModalAppId) return;
    try {
      await api.updateAppointment(cancellationModalAppId, {
        status: AppointmentStatus.CANCELED,
        cancellationBilling: billingMode
      });
      await loadData();
    } catch (error) {
      alert('Erro ao cancelar agendamento');
    } finally {
      setCancellationModalAppId(null);
    }
  };

  const handleRenew = async (appointment: Appointment) => {
    if (!confirm('Deseja renovar este agendamento recorrente por mais 4 semanas?')) return;
    
    setIsSaving(true);
    try {
      // Calculate next week's date
      const d = new Date(appointment.date + 'T12:00:00');
      d.setDate(d.getDate() + 7);
      const nextDate = d.toISOString().split('T')[0];

      await api.createAppointment({
        customerId: appointment.customerId,
        psychologistId: appointment.psychologistId,
        roomId: appointment.roomId,
        mode: appointment.mode,
        type: appointment.type,
        date: nextDate,
        dayOfWeek: new Date(nextDate + 'T12:00:00').getDay(),
        status: AppointmentStatus.ACTIVE,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        customPrice: appointment.customPrice,
        customRepassAmount: appointment.customRepassAmount,
        isRecurring: true
      });

      // Mark current as renewed
      await api.updateAppointment(appointment.id, { needsRenewal: false });
      
      await loadData();
      alert('Agendamento renovado com sucesso! Mais 4 semanas foram bloqueadas.');
    } catch (error: any) {
      alert(error.message || 'Erro ao renovar agendamento');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDismissRenewal = async (id: string) => {
    if (!confirm('Deseja apenas desconsiderar este alerta? (O horário não será bloqueado para as próximas semanas)')) return;
    
    try {
      await api.updateAppointment(id, { needsRenewal: false });
      await loadData();
    } catch (error) {
      alert('Erro ao desconsiderar alerta');
    }
  };

  const sendWhatsApp = (appointment: Appointment, target: 'patient' | 'psychologist') => {
    const customer = customers.find(c => c.id === appointment.customerId);
    const psychologist = psychologists.find(p => p.id === appointment.psychologistId);
    const phone = target === 'patient' ? customer?.phone : psychologist?.phone;
    
    if (!phone) {
      alert('Telefone não cadastrado');
      return;
    }

    const message = `Olá ${target === 'patient' ? customer?.name : psychologist?.name}, confirmamos seu atendimento (${appointment.mode}) no dia ${new Date(appointment.date).toLocaleDateString()} às ${appointment.startTime}. Podemos confirmar?`;
    const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleReminder = async (appointment: Appointment) => {
    const customer = customers.find(c => c.id === appointment.customerId);
    if (!customer?.phone) {
      alert('Paciente sem telefone cadastrado.');
      return;
    }

    const confirmationUrl = `${window.location.origin}/#/confirmacao/${appointment.id}`;
    const message = `Olá ${customer.name}, aqui é do Núcleo Priori. Estamos passando para confirmar sua consulta para o dia ${new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR')} às ${appointment.startTime}.\n\nPor favor, confirme ou informe se não poderá comparecer clicando no link abaixo:\n${confirmationUrl}`;
    
    // Update reminder_sent_at in DB
    try {
      await api.updateAppointment(appointment.id, { reminderSentAt: new Date().toISOString() });
      const url = `https://wa.me/55${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      await loadData();
    } catch (error) {
      alert('Erro ao registrar envio do lembrete');
    }
  };

  const addMinutes = (time: string, minutes: number) => {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + minutes, 0, 0);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // Track previous state to know when it changes
  const [prevCustomerId, setPrevCustomerId] = useState<string | undefined>(undefined);
  const [prevStartTime, setPrevStartTime] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (formData.customerId && formData.startTime) {
      const customer = customers.find(c => c.id === formData.customerId);
      
      const customerChanged = formData.customerId !== prevCustomerId;
      const startTimeChanged = formData.startTime !== prevStartTime;

      if (customerChanged) setPrevCustomerId(formData.customerId);
      if (startTimeChanged) setPrevStartTime(formData.startTime);

      // Ao mudar o início, sugerimos 30 minutos de duração por padrão
      const shouldAutoUpdateEndTime = startTimeChanged && !editingId;

      setFormData(prev => {
        const updates: any = {};
        
        if (shouldAutoUpdateEndTime) {
          updates.endTime = addMinutes(formData.startTime, 30);
        }
        
        // Pre-fill custom price/repass if customer is Particular and has them defined
        // We update if the customer changed OR if the values are currently undefined
        if (customer?.healthPlan === HealthPlan.PARTICULAR) {
          if (customerChanged || prev.customPrice === undefined) {
            updates.customPrice = customer.customPrice;
          }
          if (customerChanged || prev.customRepassAmount === undefined) {
            updates.customRepassAmount = customer.customRepassAmount;
          }
        } else {
          // Reset if not Particular
          updates.customPrice = undefined;
          updates.customRepassAmount = undefined;
        }
        
        return { ...prev, ...updates };
      });
    }
  }, [formData.customerId, formData.startTime, customers, prevCustomerId, prevStartTime, editingId]);

  // Clear psychologist selection when they become unavailable due to date/time change
  useEffect(() => {
    if (formData.psychologistId && formData.date && formData.startTime && formData.endTime) {
      const available = isPsychologistAvailable(
        formData.psychologistId,
        formData.date,
        formData.startTime,
        formData.endTime,
        formData.mode
      );
      // If the currently selected psychologist is unavailable and this is not an edit,
      // clear the selection so user must pick again
      if (!available && !editingId) {
        setFormData(prev => ({ ...prev, psychologistId: '' }));
      }
    }
  }, [formData.date, formData.startTime, formData.endTime]);

  const timeSlots = useMemo(() => {
    const d = new Date(date + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const isSaturday = dayOfWeek === 6;
    const limitHour = isSaturday ? 14 : 20;

    return Array.from({ length: 12 * 2 + 1 }, (_, i) => {
      const totalMinutes = 8 * 60 + i * 30;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }).filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      if (h > limitHour) return false;
      if (h === limitHour && m > 0) return false;
      return true;
    });
  }, [date]);

  const allTimeSlots = Array.from({ length: 16 * 6 + 1 }, (_, i) => {
    const totalMinutes = 7 * 60 + i * 10;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }).filter(slot => {
    const [h] = slot.split(':').map(Number);
    // Seletor permite até 22:50 para On-line
    return h <= 22;
  });

  const onlineAppointments = appointments.filter(a => a.mode === AttendanceMode.ONLINE);

  const isPsychologistAvailable = (psyId: string, dateStr: string, startTime: string, endTime: string, appointmentMode?: AttendanceMode) => {
    const psy = psychologists.find(p => p.id === psyId);
    if (!psy || !psy.active) return false;
    
    const dateObj = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();
    
    const isWithinAvailability = psy.availability.some(slot => {
      // Check day and time range
      const dayAndTimeMatch = slot.dayOfWeek === dayOfWeek && 
             startTime >= slot.startTime && 
             endTime <= slot.endTime;
      if (!dayAndTimeMatch) return false;
      
      // Check mode compatibility
      const slotMode = slot.mode ?? 'Ambos';
      if (slotMode === 'Ambos') return true;
      if (appointmentMode === AttendanceMode.PRESENCIAL && slotMode === 'Presencial') return true;
      if (appointmentMode === AttendanceMode.ONLINE && slotMode === 'On-line') return true;
      // If no appointmentMode provided (legacy), accept any slot
      if (!appointmentMode) return true;
      return false;
    });
    
    if (!isWithinAvailability) return false;
    
    // Exclude self when editing and ignore canceled appointments
    const hasConflict = appointments.some(a => 
      a.psychologistId === psyId && 
      a.date === dateStr &&
      a.id !== editingId &&
      a.status !== AppointmentStatus.CANCELED &&
      ((startTime >= a.startTime && startTime < a.endTime) ||
       (endTime > a.startTime && endTime <= a.endTime) ||
       (startTime <= a.startTime && endTime >= a.endTime))
    );
    
    return !hasConflict;
  };

  const hasMinSpace = (slot: string, dateStr: string, roomId?: string, psyId?: string) => {
    // Usamos um espaço mínimo de 10 min para permitir que a secretaria veja disponibilidade em frestas pequenas
    const minDuration = 10;
    const minEndTime = addMinutes(slot, minDuration);
    
    // Check limits for PRESENCIAL
    const isOnline = formData.mode === AttendanceMode.ONLINE;
    const dateObj = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();
    const isSaturday = dayOfWeek === 6;
    const limit = isSaturday ? '14:00' : '20:00';

    if (!isOnline && minEndTime > limit) return false;
    
    // Day of week check (Sunday still blocked)
    if (dayOfWeek === 0) return false;

    if (roomId) {
      const hasConflict = appointments.some(a => 
        a.date === dateStr && 
        a.roomId === roomId && 
        a.status !== AppointmentStatus.CANCELED &&
        ((slot >= a.startTime && slot < a.endTime) ||
         (minEndTime > a.startTime && minEndTime <= a.endTime) ||
         (slot <= a.startTime && minEndTime >= a.endTime))
      );
      if (hasConflict) return false;
    }

    if (psyId) {
      const psy = psychologists.find(p => p.id === psyId);
      if (!psy || !psy.active) return false;
      
      const dateObj = new Date(dateStr + 'T12:00:00');
      const dayOfWeek = dateObj.getDay();
      
      const isWithinAvailability = psy.availability.some(s => 
        s.dayOfWeek === dayOfWeek && slot >= s.startTime && minEndTime <= s.endTime
      );
      if (!isWithinAvailability) return false;

      const hasPsyConflict = appointments.some(a => 
        a.date === dateStr && 
        a.psychologistId === psyId && 
        a.status !== AppointmentStatus.CANCELED &&
        ((slot >= a.startTime && slot < a.endTime) ||
         (minEndTime > a.startTime && minEndTime <= a.endTime) ||
         (slot <= a.startTime && minEndTime >= a.endTime))
      );
      if (hasPsyConflict) return false;
    }

    return true;
  };

  const getSlotCount = (start: string, end: string) => {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    return Math.max(0.5, (h2 * 60 + m2 - (h1 * 60 + m1)) / 30);
  };

  const StatusIcons = ({ appointment }: { appointment: Appointment }) => {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        {appointment.reminderSentAt && appointment.confirmationStatus === 'pending' && (
          <div className="flex items-center gap-1 text-[8px] font-bold text-amber-500 uppercase tracking-tighter animate-pulse" title="Lembrete enviado">
            <Bell size={10} />
            Aguardando...
          </div>
        )}
        {appointment.confirmationStatus === 'confirmed' && (
          <div className="flex items-center gap-1 text-[8px] font-bold text-emerald-500 uppercase tracking-tighter" title="Confirmado pelo paciente">
            <UserCheck size={10} />
            Confirmado
          </div>
        )}
        {appointment.confirmationStatus === 'declined' && (
          <div className="flex items-center gap-1 text-[8px] font-bold text-red-500 uppercase tracking-tighter" title="Cancelado pelo paciente">
            <UserX size={10} />
            Cancelado
          </div>
        )}
        {appointment.confirmationStatus === 'pending' && !appointment.reminderSentAt && (
          <div className="flex items-center gap-1 text-[8px] font-bold text-zinc-300 uppercase tracking-tighter" title="Lembrete pendente">
            <BellOff size={10} />
            Pendente
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-6 min-h-[600px]">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-priori-navy">Agenda de Salas</h2>
              <p className="text-zinc-500">Controle de horários e ocupação das salas (Limite 20:00).</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex bg-white p-1 rounded-xl border border-zinc-100 shadow-sm">
                <button 
                  onClick={() => setViewMode('daily')}
                  className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", viewMode === 'daily' ? "bg-priori-navy text-white" : "text-zinc-400 hover:text-priori-navy")}
                >
                  Diária
                </button>
                <button 
                  onClick={() => setViewMode('weekly')}
                  className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", viewMode === 'weekly' ? "bg-priori-navy text-white" : "text-zinc-400 hover:text-priori-navy")}
                >
                  Semanal
                </button>
                <button 
                  onClick={() => setViewMode('psychologist')}
                  className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", viewMode === 'psychologist' ? "bg-priori-navy text-white" : "text-zinc-400 hover:text-priori-navy")}
                >
                  Psicólogo
                </button>
              </div>
              <div className="flex items-center bg-white border border-zinc-100 rounded-xl p-1 shadow-sm">
                <button 
                  onClick={() => changeDate(-1)}
                  className="p-1.5 hover:bg-zinc-50 rounded-lg transition-colors text-priori-navy"
                  title="Dia anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent border-none px-2 py-1 text-sm font-bold text-priori-navy focus:outline-none text-center"
                />
                <button 
                  onClick={() => changeDate(1)}
                  className="p-1.5 hover:bg-zinc-50 rounded-lg transition-colors text-priori-navy"
                  title="Próximo dia"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="min-w-[100px] text-priori-navy text-xs font-bold uppercase tracking-tight">
                {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
              </div>
              <Button onClick={() => {
                setFormData({ ...formData, date, mode: AttendanceMode.PRESENCIAL });
                setIsManualEndTime(false);
                setIsModalOpen(true);
              }} className="bg-priori-navy hover:bg-priori-navy/90 text-white">
                <Plus size={20} className="mr-2" />
                Novo Agendamento
              </Button>
            </div>
          </div>

          {viewMode === 'weekly' && (
            <div className="bg-white border border-zinc-100 p-2 rounded-2xl flex items-center gap-3 shadow-sm overflow-x-auto custom-scrollbar">
              <div className="flex items-center gap-2 border-r border-zinc-100 pr-3 mr-1">
                <Home size={14} className="text-zinc-400" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">Sala:</span>
              </div>
              <div className="flex gap-1.5">
                {rooms.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoom(r.id)}
                    className={cn(
                      "px-4 py-2 text-[11px] font-black uppercase tracking-tight rounded-xl transition-all whitespace-nowrap",
                      selectedRoom === r.id 
                        ? "bg-priori-navy text-white shadow-md shadow-priori-navy/10" 
                        : "bg-zinc-50 text-zinc-400 hover:bg-zinc-100 hover:text-priori-navy"
                    )}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'psychologist' && (
            <div className="bg-white border border-zinc-100 p-3 rounded-2xl flex items-center gap-4 shadow-sm">
              <div className="flex items-center gap-2 text-zinc-400">
                <User size={14} />
                <label className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Psicólogo:</label>
              </div>
              <div className="relative flex-1 max-w-sm">
                <select 
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-xl pl-4 pr-10 py-2.5 text-xs font-bold text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 appearance-none transition-all cursor-pointer hover:bg-zinc-100/50"
                  value={selectedPsychologistId}
                  onChange={(e) => setSelectedPsychologistId(e.target.value)}
                >
                  {psychologists.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-priori-navy pointer-events-none" />
              </div>
            </div>
          )}

          {/* Online Appointments Section */}
          {onlineAppointments.filter(a => (viewMode === 'weekly' || viewMode === 'psychologist') ? weekDays.includes(a.date) : a.date === date).length > 0 && (
            <div className="bg-white border border-priori-navy/10 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 text-priori-navy">
                <Globe size={16} />
                <h3 className="font-bold uppercase tracking-widest text-[10px]">
                  {viewMode === 'daily' ? 'Atendimentos On-line de Hoje' : 'Atendimentos On-line da Semana'}
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {onlineAppointments
                  .filter(a => {
                    const isCorrectDate = (viewMode === 'weekly' || viewMode === 'psychologist') ? weekDays.includes(a.date) : a.date === date;
                    const isCorrectPsychologist = viewMode === 'psychologist' ? a.psychologistId === selectedPsychologistId : true;
                    return isCorrectDate && isCorrectPsychologist;
                  })
                  .map(app => {
                    const customer = customers.find(c => c.id === app.customerId);
                    const psychologist = psychologists.find(p => p.id === app.psychologistId);
                    
                    const planColors: Record<string, string> = {
                      [HealthPlan.PARTICULAR]: "border-l-blue-500",
                      [HealthPlan.AMS_PETROBRAS]: "border-l-emerald-600",
                      [HealthPlan.PAE]: "border-l-orange-500",
                      [HealthPlan.PORTO_SAUDE]: "border-l-sky-400",
                      [HealthPlan.MEDSENIOR]: "border-l-indigo-500",
                      [HealthPlan.GAMA]: "border-l-rose-500",
                      [HealthPlan.SAUDE_CAIXA]: "border-l-cyan-600",
                    };

                    const statusColors = {
                      confirmed: "bg-emerald-50/50 border-emerald-100 border-l-emerald-500",
                      declined: "bg-red-50/50 border-red-100 border-l-red-500",
                      pending_sent: "bg-amber-50/50 border-amber-100 border-l-amber-500",
                      canceled: "bg-zinc-100 border-zinc-200 border-l-zinc-400 opacity-60",
                      active: cn("bg-priori-navy/5 border-priori-navy/10", customer ? (planColors[customer.healthPlan] || "border-l-priori-navy") : "border-l-priori-navy")
                    };

                    let currentStatus: keyof typeof statusColors = 'active';
                    if (app.status === AppointmentStatus.CANCELED) currentStatus = 'canceled';
                    else if (app.confirmationStatus === 'confirmed') currentStatus = 'confirmed';
                    else if (app.confirmationStatus === 'declined') currentStatus = 'declined';
                    else if (app.reminderSentAt) currentStatus = 'pending_sent';

                    return (
                      <div key={app.id} className={cn(
                        "p-3 rounded-xl relative group transition-all border-l-4 shadow-sm hover:shadow-md",
                        statusColors[currentStatus]
                      )}>
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-extrabold text-priori-navy uppercase tracking-tight">{app.startTime} - {app.endTime}</span>
                            {(viewMode === 'weekly' || viewMode === 'psychologist') && <span className="text-[8px] text-zinc-500 font-medium">{new Date(app.date + 'T12:00:00').toLocaleDateString()}</span>}
                          </div>
                          <div className="flex gap-1">
                            {app.isRecurring && <span className="p-0.5 text-priori-gold" title="Recorrente"><CalendarIcon size={12} /></span>}
                            <button onClick={() => handleReminder(app)} className={cn("p-0.5 transition-colors", app.reminderSentAt ? "text-amber-600" : "text-zinc-400 hover:text-priori-navy")} title="Enviar Lembrete WhatsApp"><Bell size={12} /></button>
                            <button onClick={() => sendWhatsApp(app, 'psychologist')} className="p-0.5 text-zinc-400 hover:text-priori-navy" title="WhatsApp Psicólogo"><MessageCircle size={12} /></button>
                            <button onClick={() => handleEdit(app)} className="p-0.5 text-zinc-400 hover:text-priori-navy" title="Editar"><Edit2 size={12} /></button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(app); }} className="p-0.5 text-zinc-400 hover:text-red-600" title="Excluir"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <p className={cn("text-xs font-black truncate leading-tight", currentStatus === 'canceled' ? "text-zinc-500 line-through" : "text-priori-navy")}>{customer?.name}</p>
                        {viewMode !== 'psychologist' && <p className="text-[10px] text-zinc-600 font-medium truncate">{psychologist?.name}</p>}
                        
                        <StatusIcons appointment={app} />
                        
                        {app.needsRenewal && (
                          <div className="mt-1.5 p-1.5 bg-white/60 border border-amber-200 rounded-lg flex flex-col gap-1.5">
                            <div className="flex items-center gap-1 text-amber-600">
                              <AlertCircle size={10} />
                              <span className="text-[8px] font-bold uppercase whitespace-nowrap">Ciclo de 4 semanas encerrado</span>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleRenew(app)}
                                className="flex-1 text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold hover:bg-amber-600 transition-colors shadow-sm"
                              >
                                Renovar +4 sem
                              </button>
                              <button 
                                onClick={() => handleDismissRenewal(app.id)}
                                className="flex-1 text-[8px] bg-white border border-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded font-bold hover:bg-zinc-50 transition-colors shadow-sm"
                              >
                                Desconsiderar
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="mt-2 flex gap-1.5">
                          <button 
                            onClick={() => handleConfirm(app.id, 'patient')}
                            className={cn("text-[8px] px-1.5 py-0.5 rounded border font-bold transition-all shadow-sm", app.confirmedPatient ? "bg-white border-emerald-200 text-emerald-600" : "bg-white border-zinc-200 text-zinc-400 hover:border-priori-navy/30")}
                          >
                            Pac {app.confirmedPatient ? '✓' : '?'}
                          </button>
                          <button 
                            onClick={() => handleConfirm(app.id, 'psychologist')}
                            className={cn("text-[8px] px-1.5 py-0.5 rounded border font-bold transition-all shadow-sm", app.confirmedPsychologist ? "bg-white border-emerald-200 text-emerald-600" : "bg-white border-zinc-200 text-zinc-400 hover:border-priori-navy/30")}
                          >
                            Psi {app.confirmedPsychologist ? '✓' : '?'}
                          </button>
                          {app.status !== AppointmentStatus.CANCELED && (
                            <button 
                              onClick={() => setCancellationModalAppId(app.id)}
                              className="text-[8px] px-1.5 py-0.5 rounded border border-red-100 bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-all shadow-sm"
                            >
                              Psi ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <div className="min-w-[1200px]">
                {/* Header Row */}
                <div className="grid grid-cols-[80px_repeat(6,1fr)] border-b border-zinc-100 bg-zinc-50/50">
                  <div className="p-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-r border-zinc-100 flex items-center justify-center">
                    Hora
                  </div>
                  {viewMode === 'daily' ? (
                    rooms.map(room => (
                      <div key={room.id} className="p-2 text-[10px] font-bold text-priori-navy uppercase tracking-widest text-center border-r border-zinc-100 last:border-r-0">
                        {room.name}
                      </div>
                    ))
                  ) : (
                    weekDays.map(day => (
                      <div key={day} className="p-2 text-[10px] font-bold text-priori-navy uppercase tracking-widest text-center border-r border-zinc-100 last:border-r-0">
                        {new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </div>
                    ))
                  )}
                </div>

                {/* Time Slots */}
                {timeSlots.map(slot => {
                  const isHour = slot.endsWith(':00');
                  return (
                    <div key={slot} className={cn("grid grid-cols-[80px_repeat(6,1fr)] border-b border-zinc-100 last:border-b-0", !isHour && "border-zinc-50/10")}>
                      <div className={cn(
                        "p-1.5 text-[10px] font-medium border-r border-zinc-100 flex items-center justify-center bg-zinc-50/20",
                        isHour ? "text-zinc-500 font-bold" : "text-zinc-300"
                      )}>
                        {slot}
                      </div>
                      {viewMode === 'daily' ? (
                        rooms.map(room => {
                          const appointment = appointments.find(a => 
                            a.date === date && 
                            a.roomId === room.id && 
                            a.mode === AttendanceMode.PRESENCIAL &&
                            a.startTime < addMinutes(slot, 30) && a.endTime > slot
                          );
                          
                          // Verificamos se este slot é o PRIMEIRO slot que este agendamento ocupa
                          // Para agendamentos que começam entre slots (ex: 08:10), eles serão "reivindicados" pelo slot das 08:00
                          const isFirstSlot = appointment && (
                            (appointment.startTime >= slot && appointment.startTime < addMinutes(slot, 30))
                          );

                          const customer = customers.find(c => c.id === appointment?.customerId);
                          const psychologist = psychologists.find(p => p.id === appointment?.psychologistId);

                          return (
                            <div key={`${slot}-${room.id}`} className="p-0.5 border-r border-zinc-100 last:border-r-0 min-h-[32px] relative group">
                              {appointment ? (
                                isFirstSlot ? (
                                  (() => {
                                    const planColors: Record<string, string> = {
                                      [HealthPlan.PARTICULAR]: "border-l-blue-500",
                                      [HealthPlan.AMS_PETROBRAS]: "border-l-emerald-600",
                                      [HealthPlan.PAE]: "border-l-orange-500",
                                      [HealthPlan.PORTO_SAUDE]: "border-l-sky-400",
                                      [HealthPlan.MEDSENIOR]: "border-l-indigo-500",
                                      [HealthPlan.GAMA]: "border-l-rose-500",
                                      [HealthPlan.SAUDE_CAIXA]: "border-l-cyan-600",
                                    };

                                    const statusColors = {
                                      confirmed: "bg-emerald-50/70 border-emerald-200 border-l-emerald-500",
                                      declined: "bg-red-50/70 border-red-200 border-l-red-500",
                                      pending_sent: "bg-amber-50/70 border-amber-200 border-l-amber-500",
                                      canceled: "bg-zinc-100 border-zinc-200 border-l-zinc-300 opacity-60",
                                      active: cn("bg-priori-navy/10 border-priori-navy/20", customer ? (planColors[customer.healthPlan] || "border-l-priori-navy") : "border-l-priori-navy")
                                    };

                                    let currentStatus: keyof typeof statusColors = 'active';
                                    if (appointment.status === AppointmentStatus.CANCELED) currentStatus = 'canceled';
                                    else if (appointment.confirmationStatus === 'confirmed') currentStatus = 'confirmed';
                                    else if (appointment.confirmationStatus === 'declined') currentStatus = 'declined';
                                    else if (appointment.reminderSentAt) currentStatus = 'pending_sent';

                                    const slotCount = getSlotCount(appointment.startTime, appointment.endTime);
                                    
                                    // Cálculo do deslocamento inicial para agendamentos que não começam no início exato do slot
                                    const [hS, mS] = appointment.startTime.split(':').map(Number);
                                    const [hSlot, mSlot] = slot.split(':').map(Number);
                                    const minutesOffset = (hS * 60 + mS) - (hSlot * 60 + mSlot);
                                    const topOffset = (minutesOffset / 30) * 100;

                                    return (
                                      <div 
                                        className={cn(
                                          "absolute left-0.5 right-0.5 border rounded-md p-1.5 flex flex-col justify-between transition-all z-20 shadow-sm overflow-hidden border-l-4 hover:shadow-md",
                                          statusColors[currentStatus]
                                        )}
                                        style={{ 
                                          height: `calc(${slotCount * 100}% + ${Math.floor(slotCount) - 1}px)`,
                                          top: `calc(${topOffset}% + 2px)`
                                        }}
                                      >
                                        <div className="flex justify-between items-start gap-1">
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <div className="flex items-center gap-1">
                                              <p className={cn("text-[10px] font-black truncate leading-none", currentStatus === 'canceled' ? "text-zinc-500 line-through" : "text-priori-navy")}>{customer?.name}</p>
                                              {appointment.isRecurring && <CalendarIcon size={8} className="text-priori-gold shrink-0" />}
                                            </div>
                                            <p className="text-[8px] text-zinc-600 font-bold truncate leading-none mt-1">
                                              {psychologist?.name}
                                            </p>
                                            <div className="flex items-center gap-1 mt-1">
                                              <span className="text-[7px] font-black text-priori-navy/70 uppercase tracking-tighter">{appointment.startTime}-{appointment.endTime}</span>
                                              {appointment.mode === AttendanceMode.ONLINE && <Globe size={8} className="text-emerald-500" />}
                                            </div>
                                            <StatusIcons appointment={appointment} />
                                          </div>
                                          <div className="flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleReminder(appointment)} className={cn("transition-colors", appointment.reminderSentAt ? "text-amber-600" : "text-zinc-400 hover:text-priori-navy")} title="Enviar Lembrete"><Bell size={10} /></button>
                                            <button onClick={() => handleEdit(appointment)} className="text-zinc-400 hover:text-priori-navy"><Edit2 size={10} /></button>
                                            {currentStatus !== 'canceled' && <button type="button" onClick={(e) => { e.stopPropagation(); setCancellationModalAppId(appointment.id); }} className="text-red-400 hover:text-red-600 font-bold bg-red-50 px-1 rounded transition-colors text-[10px]" title="Cancelar Sessão">✕</button>}
                                            <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(appointment); }} className="text-zinc-400 hover:text-red-500"><Trash2 size={10} /></button>
                                          </div>
                                        </div>
                                        {appointment.needsRenewal && (
                                          <div className="mt-1 p-1 bg-white/60 border border-amber-200 rounded-md flex flex-col gap-1">
                                            <div className="flex items-center gap-1 text-amber-600">
                                              <AlertCircle size={8} />
                                              <span className="text-[7px] font-bold uppercase whitespace-nowrap">Renovar +4 sem?</span>
                                            </div>
                                            <div className="flex gap-1">
                                              <button 
                                                onClick={() => handleRenew(appointment)}
                                                className="flex-1 text-[7px] bg-amber-500 text-white px-1 py-0.5 rounded font-bold hover:bg-amber-600 transition-colors"
                                              >
                                                Sim
                                              </button>
                                              <button 
                                                onClick={() => handleDismissRenewal(appointment.id)}
                                                className="flex-1 text-[7px] bg-white border border-zinc-200 text-zinc-500 px-1 py-0.5 rounded font-bold hover:bg-zinc-50 transition-colors"
                                              >
                                                Não
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <div className="h-full w-full" />
                                )
                              ) : (
                                hasMinSpace(slot, date, room.id) ? (
                                  <div className="h-full w-full rounded-md border border-dashed border-zinc-100 flex items-center justify-center text-zinc-200">
                                    <Plus size={10} />
                                  </div>
                                ) : (
                                  <div className="h-full w-full bg-zinc-50/30" />
                                )
                              )}
                            </div>
                          );
                        })
                      ) : (
                        weekDays.map(day => {
                          const appointment = appointments.find(a => 
                            a.date === day && 
                            (viewMode === 'psychologist' ? a.psychologistId === selectedPsychologistId : a.roomId === selectedRoom) && 
                            (viewMode === 'psychologist' ? true : a.mode === AttendanceMode.PRESENCIAL) &&
                            a.startTime < addMinutes(slot, 30) && a.endTime > slot
                          );

                          // Verificamos se este slot é o PRIMEIRO slot que este agendamento ocupa
                          const isFirstSlot = appointment && (
                            (appointment.startTime >= slot && appointment.startTime < addMinutes(slot, 30))
                          );

                          const customer = customers.find(c => c.id === appointment?.customerId);
                          const psychologist = psychologists.find(p => p.id === appointment?.psychologistId);

                          return (
                            <div key={`${slot}-${day}`} className="p-0.5 border-r border-zinc-100 last:border-r-0 min-h-[32px] relative group">
                              {appointment ? (
                                isFirstSlot ? (
                                  (() => {
                                    const planColors: Record<string, string> = {
                                      [HealthPlan.PARTICULAR]: "border-l-blue-500",
                                      [HealthPlan.AMS_PETROBRAS]: "border-l-emerald-600",
                                      [HealthPlan.PAE]: "border-l-orange-500",
                                      [HealthPlan.PORTO_SAUDE]: "border-l-sky-400",
                                      [HealthPlan.MEDSENIOR]: "border-l-indigo-500",
                                      [HealthPlan.GAMA]: "border-l-rose-500",
                                      [HealthPlan.SAUDE_CAIXA]: "border-l-cyan-600",
                                    };

                                    const statusColors = {
                                      confirmed: "bg-emerald-50/70 border-emerald-200 border-l-emerald-500",
                                      declined: "bg-red-50/70 border-red-200 border-l-red-500",
                                      pending_sent: "bg-amber-50/70 border-amber-200 border-l-amber-500",
                                      canceled: "bg-zinc-100 border-zinc-200 border-l-zinc-300 opacity-60",
                                      active: cn("bg-priori-navy/10 border-priori-navy/20", customer ? (planColors[customer.healthPlan] || "border-l-priori-navy") : "border-l-priori-navy")
                                    };

                                    let currentStatus: keyof typeof statusColors = 'active';
                                    if (appointment.status === AppointmentStatus.CANCELED) currentStatus = 'canceled';
                                    else if (appointment.confirmationStatus === 'confirmed') currentStatus = 'confirmed';
                                    else if (appointment.confirmationStatus === 'declined') currentStatus = 'declined';
                                    else if (appointment.reminderSentAt) currentStatus = 'pending_sent';

                                    const slotCount = getSlotCount(appointment.startTime, appointment.endTime);
                                    
                                    // Cálculo do deslocamento inicial para agendamentos que não começam no início exato do slot
                                    const [hS, mS] = appointment.startTime.split(':').map(Number);
                                    const [hSlot, mSlot] = slot.split(':').map(Number);
                                    const minutesOffset = (hS * 60 + mS) - (hSlot * 60 + mSlot);
                                    const topOffset = (minutesOffset / 30) * 100;

                                    return (
                                      <div 
                                        className={cn(
                                          "absolute left-0.5 right-0.5 border rounded-md p-1.5 flex flex-col justify-between transition-all z-20 shadow-sm overflow-hidden border-l-4 hover:shadow-md",
                                          statusColors[currentStatus]
                                        )}
                                        style={{ 
                                          height: `calc(${slotCount * 100}% + ${Math.floor(slotCount) - 1}px)`,
                                          top: `calc(${topOffset}% + 2px)`
                                        }}
                                      >
                                        <div className="flex justify-between items-start gap-1">
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <div className="flex items-center gap-1">
                                              <p className={cn("text-[10px] font-black truncate leading-none", currentStatus === 'canceled' ? "text-zinc-500 line-through" : "text-priori-navy")}>{customer?.name}</p>
                                              {appointment.isRecurring && <CalendarIcon size={8} className="text-priori-gold shrink-0" />}
                                            </div>
                                            <p className="text-[8px] text-zinc-600 font-bold truncate mt-1">
                                              {viewMode === 'psychologist' ? (rooms.find(r => r.id === appointment.roomId)?.name || 'Online') : psychologist?.name}
                                            </p>
                                            <div className="flex items-center gap-1 mt-1">
                                              <span className="text-[7px] font-black text-priori-navy/70 uppercase tracking-tighter">{appointment.startTime}-{appointment.endTime}</span>
                                              {appointment.mode === AttendanceMode.ONLINE && <Globe size={8} className="text-emerald-500" />}
                                            </div>
                                            <StatusIcons appointment={appointment} />
                                          </div>
                                          <div className="flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleReminder(appointment)} className={cn("transition-colors", appointment.reminderSentAt ? "text-amber-600" : "text-zinc-400 hover:text-priori-navy")} title="Enviar Lembrete"><Bell size={10} /></button>
                                            <button onClick={() => handleEdit(appointment)} className="text-zinc-400 hover:text-priori-navy"><Edit2 size={10} /></button>
                                            {currentStatus !== 'canceled' && <button type="button" onClick={(e) => { e.stopPropagation(); setCancellationModalAppId(appointment.id); }} className="text-red-400 hover:text-red-600 font-bold bg-red-50 px-1 rounded transition-colors text-[10px]" title="Cancelar Sessão">✕</button>}
                                            <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(appointment); }} className="text-zinc-400 hover:text-red-500"><Trash2 size={10} /></button>
                                          </div>
                                        </div>
                                        {appointment.needsRenewal && (
                                          <div className="mt-1 p-1 bg-white/60 border border-amber-200 rounded-md flex flex-col gap-1">
                                            <div className="flex items-center gap-1 text-amber-600">
                                              <AlertCircle size={8} />
                                              <span className="text-[7px] font-bold uppercase whitespace-nowrap">Renovar +4 sem?</span>
                                            </div>
                                            <div className="flex gap-1">
                                              <button 
                                                onClick={() => handleRenew(appointment)}
                                                className="flex-1 text-[7px] bg-amber-500 text-white px-1 py-0.5 rounded font-bold hover:bg-amber-600 transition-colors"
                                              >
                                                Sim
                                              </button>
                                              <button 
                                                onClick={() => handleDismissRenewal(appointment.id)}
                                                className="flex-1 text-[7px] bg-white border border-zinc-200 text-zinc-500 px-1 py-0.5 rounded font-bold hover:bg-zinc-50 transition-colors"
                                              >
                                                Não
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <div className="h-full w-full" />
                                )
                              ) : (
                                hasMinSpace(slot, day, viewMode === 'psychologist' ? undefined : selectedRoom, viewMode === 'psychologist' ? selectedPsychologistId : undefined) ? (
                                  <div className="h-full w-full rounded-md border border-dashed border-zinc-100 flex items-center justify-center text-zinc-200">
                                    <Plus size={10} />
                                  </div>
                                ) : (
                                  <div className="h-full w-full bg-zinc-50/30" />
                                )
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingId(null);
        }}
        title={editingId ? "Editar Agendamento" : "Novo Agendamento"}
        className="max-w-xl h-[65vh]"
        footer={
          <div className="flex gap-3 w-full">
            {editingId && (
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300" 
                onClick={async () => {
                  const appointmentToDelete = appointments.find(a => a.id === editingId);
                  if (appointmentToDelete) {
                    await handleDelete(appointmentToDelete);
                    setIsModalOpen(false);
                  }
                }}
              >
                <Trash2 size={18} className="mr-2" />
                Excluir
              </Button>
            )}
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-zinc-200 text-priori-navy hover:bg-zinc-100" 
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              form="schedule-form"
              className="flex-1 bg-priori-navy hover:bg-priori-navy/90 text-white" 
              isLoading={isSaving}
            >
              {editingId ? 'Salvar' : 'Agendar'}
            </Button>
          </div>
        }
      >
        <form id="schedule-form" onSubmit={handleSubmit} className="space-y-4">
          {/* 1. MODO */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Modo de Atendimento</label>
            <select
              className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
              value={formData.mode}
              onChange={(e) => setFormData({ ...formData, mode: e.target.value as AttendanceMode })}
              required
            >
              {Object.values(AttendanceMode).map(mode => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>

          {/* 2. PACIENTE */}
          <div className="space-y-2 relative" ref={dropdownRef}>
            <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Selecionar Paciente</label>
            <div className="relative">
              <div 
                className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy flex items-center justify-between cursor-pointer focus-within:ring-2 focus-within:ring-priori-navy/10 transition-all"
                onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
              >
                <span className={cn("font-medium", !formData.customerId && "text-zinc-400 font-normal")}>
                  {customers.find(c => c.id === formData.customerId)?.name || 'Selecione um paciente...'}
                </span>
                <ChevronDown size={16} className={cn("text-zinc-400 transition-transform", isCustomerDropdownOpen && "rotate-180")} />
              </div>

              {isCustomerDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-zinc-200 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-3 border-b border-zinc-100 bg-zinc-50/50">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        autoFocus
                        className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
                        placeholder="Digite o nome do paciente para buscar..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className={cn(
                            "w-full text-left px-5 py-4 text-base border-b border-zinc-50 last:border-0 hover:bg-priori-navy/5 hover:text-priori-navy transition-colors flex items-center justify-between group",
                            formData.customerId === c.id && "bg-priori-navy/5 text-priori-navy font-bold"
                          )}
                          onClick={() => {
                            setFormData({ 
                              ...formData, 
                              customerId: c.id, 
                              psychologistId: c.psychologistId || formData.psychologistId,
                              startTime: '',
                              endTime: '',
                              procedureCode: '' 
                            });
                            setIsCustomerDropdownOpen(false);
                            setCustomerSearch('');
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="text-base font-bold uppercase tracking-tight">{c.name}</span>
                            <span className="text-[11px] text-zinc-400 font-black uppercase tracking-widest mt-0.5 group-hover:text-priori-gold transition-colors">{c.healthPlan}</span>
                          </div>
                          {formData.customerId === c.id && <CheckCircle2 size={18} className="text-priori-navy shrink-0" />}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <p className="text-xs text-zinc-400">Nenhum paciente encontrado</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <input type="hidden" value={formData.customerId} required />
          </div>

          {formData.customerId && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              {/* 3. PSICÓLOGO */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Psicólogo Responsável</label>
                <select
                  className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                  value={formData.psychologistId}
                  onChange={(e) => setFormData({ ...formData, psychologistId: e.target.value, startTime: '', endTime: '' })}
                  required
                >
                  <option value="">Selecione um psicólogo...</option>
                  {psychologists
                    .filter(p => p.active)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))
                  }
                </select>
              </div>

              {formData.psychologistId && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* 4. DATA E HORÁRIO */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Data</label>
                      <input
                        type="date"
                        className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value, startTime: '', endTime: '' })}
                        required
                      />
                      {formData.date && (
                        <p className="text-xs text-zinc-500 mt-1">
                          {new Date(formData.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Hora Início</label>
                      <select
                        className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                        required
                      >
                        <option value="">Selecione...</option>
                        {allTimeSlots.filter(t => {
                          // For the start time selection, we allow any time that falls within 
                          // the professional's availability, even if the default duration 
                          // would exceed the shift end. This allows the user to manually 
                          // shorten the session afterwards.
                          // We check if at least 10 minutes are available.
                          const minDuration = 10;
                          const minEndTime = addMinutes(t, minDuration);
                          return isPsychologistAvailable(formData.psychologistId, formData.date, t, minEndTime, formData.mode);
                        }).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Hora Fim</label>
                      <select
                        className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                        required
                      >
                        <option value="">Selecione...</option>
                        {allTimeSlots.filter(t => t > formData.startTime).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {formData.startTime && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      {/* 5. SALA (Preencial apenas) */}
                      {formData.mode === AttendanceMode.PRESENCIAL && (
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Sala de Atendimento</label>
                          <select
                            className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                            value={formData.roomId}
                            onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
                            required
                          >
                            <option value="">Selecione uma sala...</option>
                            {rooms.filter(r => r.active).filter(r => {
                              const hasConflict = appointments.some(a => 
                                a.roomId === r.id && 
                                a.date === formData.date &&
                                a.id !== editingId &&
                                ((formData.startTime >= a.startTime && formData.startTime < a.endTime) ||
                                 (formData.endTime > a.startTime && formData.endTime <= a.endTime) ||
                                 (formData.startTime <= a.startTime && formData.endTime >= a.endTime))
                              );
                              return !hasConflict;
                            }).map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* TIPO DE ATENDIMENTO / TUSS */}
                      <div className="pt-4 border-t border-zinc-100">
                        {(() => {
                          const customer = customers.find(c => c.id === formData.customerId);
                          if (customer?.healthPlan === HealthPlan.PARTICULAR) {
                            return (
                              <div className="space-y-4">
                                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                  <p className="text-xs font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                                     <Check size={14} /> Atendimento Particular
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Tipo de Atendimento</label>
                                  <select
                                    className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value as AppointmentType })}
                                    required
                                  >
                                    {Object.values(AppointmentType).map(type => (
                                      <option key={type} value={type}>{type}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          } else if (customer) {
                            const plan = plans.find(p => p.name.toUpperCase() === customer.healthPlan.toUpperCase());
                            return (
                              <div className="space-y-4">
                                <div className="p-3 bg-priori-navy/5 border border-priori-navy/10 rounded-xl">
                                  <p className="text-xs font-bold text-priori-navy uppercase tracking-widest flex items-center gap-2">
                                     <Globe size={14} /> Convênio: {customer.healthPlan}
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Procedimento / Código TUSS</label>
                                  <select
                                    className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                                    value={formData.procedureCode}
                                    onChange={(e) => {
                                      const proc = plan?.procedures.find(p => p.code === e.target.value);
                                      setFormData({ 
                                        ...formData, 
                                        procedureCode: e.target.value,
                                        type: proc ? proc.type : formData.type
                                      });
                                    }}
                                    required
                                  >
                                    <option value="">Selecione o procedimento...</option>
                                    {plan?.procedures.map(proc => (
                                      <option key={proc.code} value={proc.code}>
                                        {proc.code} - {proc.type} ({proc.description})
                                      </option>
                                    ))}
                                    {!plan && <option disabled>Nenhum procedimento cadastrado para este plano</option>}
                                  </select>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      {/* RECORRÊNCIA */}
                      <div className="space-y-3 p-4 bg-zinc-50 border border-zinc-100 rounded-xl mt-4">
                        {editingId && appointments.find(a => a.id === editingId)?.isRecurring && (
                          <div className="mb-4 pb-4 border-b border-zinc-200/60 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-lg">
                              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                              <div className="flex-1 space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                    checked={updateFuture}
                                    onChange={(e) => setUpdateFuture(e.target.checked)}
                                  />
                                  <span className="text-sm font-bold text-amber-900">Aplicar a todos os futuros</span>
                                </label>
                                <p className="text-[11px] text-amber-700 leading-snug">
                                  Marque esta opção para aplicar a mudança de data/horário a esta sessão e todas as sessões futuras da recorrência. Se desmarcar, apenas esta sessão mudará.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="isRecurring"
                            className="w-4 h-4 rounded border-zinc-200 bg-white text-priori-navy focus:ring-priori-navy/10"
                            checked={formData.isRecurring}
                            onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                          />
                          <label htmlFor="isRecurring" className="text-sm text-zinc-600 font-medium cursor-pointer">
                            Agendamento Recorrente
                          </label>
                        </div>
                        {formData.isRecurring && (
                          <div className="pl-6 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Frequência</label>
                            <select
                              className="w-full rounded-lg bg-white border border-zinc-200 px-3 py-2 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                              value={formData.recurrenceFrequency}
                              onChange={(e) => setFormData({ ...formData, recurrenceFrequency: e.target.value as RecurrenceFrequency })}
                            >
                              <option value={RecurrenceFrequency.SEMANAL}>Semanal (4 sessões seguidas)</option>
                              <option value={RecurrenceFrequency.QUINZENAL}>Quinzenal (1 sessão a cada 15 dias - 4 sessões total)</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>

      <Modal 
        isOpen={!!cancellationModalAppId} 
        onClose={() => setCancellationModalAppId(null)}
        title="Cancelar Sessão"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            O paciente faltou ou cancelou esta sessão. Como deseja registrar o faturamento?
          </p>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => handleCancelBillingChoice('none')}
              className="flex items-center justify-center p-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
            >
              <div className="text-center">
                <span className="block font-bold text-zinc-700 text-sm">Não Cobrar</span>
                <span className="block text-xs text-zinc-500 mt-1">Sessão cancelada sem custo</span>
              </div>
            </button>
            
            <button
              onClick={() => handleCancelBillingChoice('plan')}
              className="flex items-center justify-center p-3 border border-priori-navy/20 bg-priori-navy/5 rounded-xl hover:bg-priori-navy/10 transition-colors"
            >
              <div className="text-center">
                <span className="block font-bold text-priori-navy text-sm">Cobrar no Convênio</span>
                <span className="block text-xs text-priori-navy/70 mt-1">Sessão será faturada via convênio normalmente</span>
              </div>
            </button>
            
            <button
              onClick={() => handleCancelBillingChoice('particular')}
              className="flex items-center justify-center p-3 border border-emerald-200 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors"
            >
              <div className="text-center">
                <span className="block font-bold text-emerald-700 text-sm">Cobrar Particular</span>
                <span className="block text-xs text-emerald-600/70 mt-1">Sessão será faturada do particular</span>
              </div>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
