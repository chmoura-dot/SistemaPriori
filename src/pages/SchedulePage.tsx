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
  Edit2,
  Bell,
  BellOff,
  UserCheck,
  UserX
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
  UserRole
} from '../services/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';

export const SchedulePage = () => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const user = api.getCurrentUser();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerId: '',
    psychologistId: '',
    roomId: '',
    mode: AttendanceMode.PRESENCIAL,
    type: AppointmentType.ADULTO,
    date: date,
    startTime: '08:00',
    endTime: '09:00',
    customPrice: undefined as number | undefined,
    customRepassAmount: undefined as number | undefined,
    isRecurring: false
  });

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
    const [a, r, p, c] = await Promise.all([
      api.getAppointments(), // Load all for weekly view
      api.getRooms(),
      api.getPsychologists(),
      api.getCustomers()
    ]);
    setAppointments(a);
    setRooms(r);
    if (r.length > 0 && !selectedRoom) setSelectedRoom(r[0].id);
    setPsychologists(p);
    if (p.length > 0 && !selectedPsychologistId) setSelectedPsychologistId(p[0].id);
    setCustomers(c.filter(cust => cust.status === 'active'));
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
      if (editingId) {
        await api.updateAppointment(editingId, {
          ...formData,
          roomId: formData.mode === AttendanceMode.ONLINE ? undefined : formData.roomId
        });
      } else {
        await api.createAppointment({
          ...formData,
          date,
          dayOfWeek: new Date(date + 'T12:00:00').getDay(),
          status: AppointmentStatus.ACTIVE,
          roomId: formData.mode === AttendanceMode.ONLINE ? undefined : formData.roomId
        });
      }
      await loadData();
      setIsModalOpen(false);
      setEditingId(null);
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
      customPrice: appointment.customPrice,
      customRepassAmount: appointment.customRepassAmount,
      isRecurring: appointment.isRecurring
    });
    setEditingId(appointment.id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja desmarcar este horário?')) {
      await api.deleteAppointment(id);
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

      // Mark current as renewed (we can just clear needsRenewal or similar)
      await api.updateAppointment(appointment.id, { needsRenewal: false });
      
      await loadData();
      alert('Agendamento renovado com sucesso!');
    } catch (error: any) {
      alert(error.message || 'Erro ao renovar agendamento');
    } finally {
      setIsSaving(false);
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

    const confirmationUrl = `${window.location.origin}/confirmacao/${appointment.id}`;
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

  const findRemindersNeeded = () => {
    const now = new Date();
    const future36h = new Date(now.getTime() + 36 * 60 * 60 * 1000);
    const future48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const needingReminders = appointments.filter(a => {
      if (a.reminderSentAt || a.confirmationStatus !== 'pending') return false;
      const appDate = new Date(a.date + 'T' + a.startTime);
      return appDate >= future36h && appDate <= future48h;
    });

    if (needingReminders.length === 0) {
      alert('Nenhum agendamento pendente de lembrete (Janela de 36-48h).');
    } else {
      const names = needingReminders.map(a => customers.find(c => c.id === a.customerId)?.name).join('\n');
      if (confirm(`Encontrados ${needingReminders.length} lembretes pendentes:\n\n${names}\n\nDeseja disparar o primeiro agora?`)) {
        handleReminder(needingReminders[0]);
      }
    }
  };

  const getAppointmentDuration = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return 40;
    if (customer.healthPlan === HealthPlan.PORTO_SEGURO || customer.healthPlan === HealthPlan.MEDSENIOR) {
      return 30;
    }
    return 40;
  };

  const addMinutes = (time: string, minutes: number) => {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + minutes, 0, 0);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // Track previous customer ID to know when it changes
  const [prevCustomerId, setPrevCustomerId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (formData.customerId && formData.startTime) {
      const customer = customers.find(c => c.id === formData.customerId);
      const duration = getAppointmentDuration(formData.customerId);
      const endTime = addMinutes(formData.startTime, duration);
      
      const customerChanged = formData.customerId !== prevCustomerId;
      if (customerChanged) setPrevCustomerId(formData.customerId);

      setFormData(prev => {
        const updates: any = { endTime };
        
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
  }, [formData.customerId, formData.startTime, customers, prevCustomerId]);

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

  const timeSlots = Array.from({ length: 12 * 6 + 1 }, (_, i) => {
    const totalMinutes = 8 * 60 + i * 10;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }).filter(slot => {
    const [h] = slot.split(':').map(Number);
    return h <= 20;
  });

  const allTimeSlots = Array.from({ length: 14 * 6 + 1 }, (_, i) => {
    const totalMinutes = 7 * 60 + i * 10; // Start a bit earlier for selection if needed
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }).filter(slot => {
    const [h] = slot.split(':').map(Number);
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
    
    // Exclude self when editing
    const hasConflict = appointments.some(a => 
      a.psychologistId === psyId && 
      a.date === dateStr &&
      a.id !== editingId &&
      ((startTime >= a.startTime && startTime < a.endTime) ||
       (endTime > a.startTime && endTime <= a.endTime) ||
       (startTime <= a.startTime && endTime >= a.endTime))
    );
    
    return !hasConflict;
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
              <input
                type="date"
                className="bg-white border border-zinc-100 rounded-xl px-4 py-2 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 shadow-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Button onClick={findRemindersNeeded} className="bg-white border border-zinc-100 text-priori-navy hover:bg-zinc-50 shadow-sm">
                <Bell size={18} className="mr-2" />
                Lembretes (36h)
              </Button>
              <Button onClick={() => {
                setFormData({ ...formData, date, mode: AttendanceMode.PRESENCIAL });
                setIsModalOpen(true);
              }} className="bg-priori-navy hover:bg-priori-navy/90 text-white">
                <Plus size={20} className="mr-2" />
                Novo Agendamento
              </Button>
            </div>
          </div>

          {viewMode === 'weekly' && (
            <div className="bg-white border border-zinc-100 p-3 rounded-2xl flex items-center gap-4 shadow-sm">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Filtrar por Sala:</label>
              <select 
                className="bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-1.5 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
              >
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}

          {viewMode === 'psychologist' && (
            <div className="bg-white border border-zinc-100 p-3 rounded-2xl flex items-center gap-4 shadow-sm">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Selecionar Psicólogo:</label>
              <select 
                className="bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-1.5 text-xs text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10"
                value={selectedPsychologistId}
                onChange={(e) => setSelectedPsychologistId(e.target.value)}
              >
                {psychologists.filter(p => p.active).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
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
                    
                    const statusColors = {
                      confirmed: "bg-emerald-50/50 border-emerald-100 border-l-emerald-500",
                      declined: "bg-red-50/50 border-red-100 border-l-red-500",
                      pending_sent: "bg-amber-50/50 border-amber-100 border-l-amber-500",
                      active: "bg-priori-navy/5 border-priori-navy/10 border-l-priori-navy"
                    };

                    let currentStatus: keyof typeof statusColors = 'active';
                    if (app.confirmationStatus === 'confirmed') currentStatus = 'confirmed';
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
                            <button onClick={() => handleDelete(app.id)} className="p-0.5 text-zinc-400 hover:text-red-600"><Trash2 size={12} /></button>
                          </div>
                        </div>
                        <p className="text-xs font-black text-priori-navy truncate leading-tight">{customer?.name}</p>
                        {viewMode !== 'psychologist' && <p className="text-[10px] text-zinc-600 font-medium truncate">{psychologist?.name}</p>}
                        
                        <StatusIcons appointment={app} />
                        
                        {app.needsRenewal && (
                          <div className="mt-1.5 p-1.5 bg-white/60 border border-amber-200 rounded-lg flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1 text-amber-600">
                              <AlertCircle size={12} />
                              <span className="text-[8px] font-bold uppercase whitespace-nowrap">Renovação</span>
                            </div>
                            <button 
                              onClick={() => handleRenew(app)}
                              className="text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold hover:bg-amber-600 transition-colors shadow-sm"
                            >
                              Renovar
                            </button>
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
                            slot >= a.startTime && slot < a.endTime
                          );
                          const customer = customers.find(c => c.id === appointment?.customerId);
                          const psychologist = psychologists.find(p => p.id === appointment?.psychologistId);

                          return (
                            <div key={`${slot}-${room.id}`} className="p-0.5 border-r border-zinc-100 last:border-r-0 min-h-[32px] relative group">
                              {appointment ? (
                                appointment.startTime === slot ? (
                                  (() => {
                                    const statusColors = {
                                      confirmed: "bg-emerald-50/70 border-emerald-200 border-l-emerald-500",
                                      declined: "bg-red-50/70 border-red-200 border-l-red-500",
                                      pending_sent: "bg-amber-50/70 border-amber-200 border-l-amber-500",
                                      active: "bg-priori-navy/10 border-priori-navy/20 border-l-priori-navy"
                                    };

                                    let currentStatus: keyof typeof statusColors = 'active';
                                    if (appointment.confirmationStatus === 'confirmed') currentStatus = 'confirmed';
                                    else if (appointment.confirmationStatus === 'declined') currentStatus = 'declined';
                                    else if (appointment.reminderSentAt) currentStatus = 'pending_sent';

                                    return (
                                      <div className={cn(
                                        "h-full w-full border rounded-md p-1.5 flex flex-col justify-between transition-all z-10 shadow-sm overflow-hidden border-l-4 hover:shadow-md",
                                        statusColors[currentStatus]
                                      )}>
                                        <div className="flex justify-between items-start gap-1">
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <div className="flex items-center gap-1">
                                              <p className="text-[10px] font-black text-priori-navy truncate leading-none">{customer?.name}</p>
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
                                            <button onClick={() => handleDelete(appointment.id)} className="text-zinc-400 hover:text-red-500"><Trash2 size={10} /></button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <div className="h-full w-full bg-priori-navy/5 border-x border-priori-navy/5" />
                                )
                              ) : (
                                <button 
                                  onClick={() => {
                                    setFormData({ ...formData, roomId: room.id, startTime: slot, date, mode: AttendanceMode.PRESENCIAL });
                                    setIsModalOpen(true);
                                  }}
                                  className="h-full w-full rounded-md border border-dashed border-zinc-100 hover:border-priori-navy/20 hover:bg-zinc-50 transition-all flex items-center justify-center text-zinc-200 hover:text-priori-navy/30"
                                >
                                  <Plus size={10} />
                                </button>
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
                            slot >= a.startTime && slot < a.endTime
                          );
                          const customer = customers.find(c => c.id === appointment?.customerId);
                          const psychologist = psychologists.find(p => p.id === appointment?.psychologistId);

                          return (
                            <div key={`${slot}-${day}`} className="p-0.5 border-r border-zinc-100 last:border-r-0 min-h-[32px] relative group">
                              {appointment ? (
                                appointment.startTime === slot ? (
                                  (() => {
                                    const statusColors = {
                                      confirmed: "bg-emerald-50/70 border-emerald-200 border-l-emerald-500",
                                      declined: "bg-red-50/70 border-red-200 border-l-red-500",
                                      pending_sent: "bg-amber-50/70 border-amber-200 border-l-amber-500",
                                      active: "bg-priori-navy/10 border-priori-navy/20 border-l-priori-navy"
                                    };

                                    let currentStatus: keyof typeof statusColors = 'active';
                                    if (appointment.confirmationStatus === 'confirmed') currentStatus = 'confirmed';
                                    else if (appointment.confirmationStatus === 'declined') currentStatus = 'declined';
                                    else if (appointment.reminderSentAt) currentStatus = 'pending_sent';

                                    return (
                                      <div className={cn(
                                        "h-full w-full border rounded-md p-1.5 flex flex-col justify-between transition-all z-10 shadow-sm overflow-hidden border-l-4 hover:shadow-md",
                                        statusColors[currentStatus]
                                      )}>
                                        <div className="flex justify-between items-start gap-1">
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <div className="flex items-center gap-1">
                                              <p className="text-[10px] font-black text-priori-navy truncate leading-none">{customer?.name}</p>
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
                                            <button onClick={() => handleDelete(appointment.id)} className="text-zinc-400 hover:text-red-500"><Trash2 size={10} /></button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <div className="h-full w-full bg-priori-navy/5 border-x border-priori-navy/5" />
                                )
                              ) : (
                                <button 
                                  onClick={() => {
                                    const roomToSet = viewMode === 'psychologist' ? '' : selectedRoom;
                                    setFormData({ ...formData, roomId: roomToSet, startTime: slot, date: day, mode: AttendanceMode.PRESENCIAL });
                                    setIsModalOpen(true);
                                  }}
                                  className="h-full w-full rounded-md border border-dashed border-zinc-100 hover:border-priori-navy/20 hover:bg-zinc-50 transition-all flex items-center justify-center text-zinc-200 hover:text-priori-navy/30"
                                >
                                  <Plus size={10} />
                                </button>
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
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Modo</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                value={formData.mode}
                onChange={(e) => setFormData({ ...formData, mode: e.target.value as AttendanceMode })}
                required
              >
                {Object.values(AttendanceMode).map(mode => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </div>
          </div>


          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 relative" ref={dropdownRef}>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Paciente</label>
              <div className="relative">
                <div 
                  className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy flex items-center justify-between cursor-pointer focus-within:ring-2 focus-within:ring-priori-navy/10 transition-all"
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                >
                  <span className={cn(!formData.customerId && "text-zinc-400")}>
                    {customers.find(c => c.id === formData.customerId)?.name || 'Selecione um paciente...'}
                  </span>
                  <ChevronDown size={16} className={cn("text-zinc-400 transition-transform", isCustomerDropdownOpen && "rotate-180")} />
                </div>

                {isCustomerDropdownOpen && (
                  <div className="absolute top-full left-0 w-full mt-2 bg-white border border-zinc-100 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div className="p-2 border-b border-zinc-100">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          autoFocus
                          className="w-full bg-zinc-50 border border-zinc-100 rounded-lg pl-9 pr-4 py-2 text-xs text-priori-navy focus:outline-none focus:ring-1 focus:ring-priori-navy/50"
                          placeholder="Buscar paciente..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className={cn(
                              "w-full text-left px-4 py-2.5 text-sm hover:bg-priori-navy/5 hover:text-priori-navy transition-colors flex items-center justify-between",
                              formData.customerId === c.id && "bg-priori-navy/5 text-priori-navy"
                            )}
                            onClick={() => {
                              setFormData({ ...formData, customerId: c.id });
                              setIsCustomerDropdownOpen(false);
                              setCustomerSearch('');
                            }}
                          >
                            <span>{c.name}</span>
                            {formData.customerId === c.id && <CheckCircle2 size={14} />}
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
              {/* Hidden input for HTML5 validation if needed, though we handle it via state */}
              <input type="hidden" value={formData.customerId} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Tipo de Atendimento</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Psicólogo</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                value={formData.psychologistId}
                onChange={(e) => setFormData({ ...formData, psychologistId: e.target.value })}
                required
              >
                <option value="">Selecione...</option>
                {psychologists
                  .filter(p => p.active)
                  .map(p => {
                    const available = isPsychologistAvailable(p.id, formData.date, formData.startTime, formData.endTime, formData.mode);
                    return (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={!available}
                        style={{ color: available ? 'inherit' : '#a1a1aa' }}
                      >
                        {available ? '✓' : '✗'} {p.name} {available ? '' : '— Indisponível/Conflito'}
                      </option>
                    );
                  })
                }
              </select>
              {formData.psychologistId && !isPsychologistAvailable(formData.psychologistId, formData.date, formData.startTime, formData.endTime, formData.mode) && (
                <div className="flex items-center gap-2 mt-1 p-2 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle size={13} className="text-red-500 shrink-0" />
                  <p className="text-[11px] text-red-600 font-medium">
                    Este psicólogo está indisponível ou tem conflito neste horário.
                  </p>
                </div>
              )}
              {!formData.psychologistId && psychologists.filter(p => p.active && isPsychologistAvailable(p.id, formData.date, formData.startTime, formData.endTime, formData.mode)).length === 0 && psychologists.filter(p => p.active).length > 0 && (
                <div className="flex items-center gap-2 mt-1 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertCircle size={13} className="text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-600 font-medium">
                    Nenhum psicólogo disponível para este horário. Altere a data ou o horário.
                  </p>
                </div>
              )}
            </div>
            {formData.mode === AttendanceMode.PRESENCIAL && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Sala</label>
                <select
                  className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                  value={formData.roomId}
                  onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Hora Início</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              >
                {allTimeSlots.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Hora Fim</label>
              <select
                className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              >
                {allTimeSlots.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const customer = customers.find(c => c.id === formData.customerId);
            const canSeeValues = user?.role === UserRole.ADMIN || customer?.healthPlan === HealthPlan.PARTICULAR;
            
            if (canSeeValues && customer) {
              return (
                <div className="grid grid-cols-2 gap-4 p-4 bg-priori-navy/5 border border-priori-navy/10 rounded-xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Valor da Sessão (R$)</label>
                    <input
                      type="number"
                      className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                      value={formData.customPrice || ''}
                      onChange={(e) => setFormData({ ...formData, customPrice: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Ex: 150"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Valor do Repasse (R$)</label>
                    <input
                      type="number"
                      className="w-full rounded-lg bg-white border border-zinc-200 px-4 py-2.5 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
                      value={formData.customRepassAmount || ''}
                      onChange={(e) => setFormData({ ...formData, customRepassAmount: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Ex: 100"
                    />
                  </div>
                  <p className="col-span-full text-[10px] text-priori-navy/50 font-medium uppercase tracking-wider">
                    * {customer.healthPlan === HealthPlan.PARTICULAR ? 'Valores negociados com o paciente' : 'Sobrescrita de valor do plano (Admin)'}
                  </p>
                </div>
              );
            }
            return null;
          })()}

          <div className="flex items-center gap-2 p-4 bg-zinc-50 border border-zinc-100 rounded-xl">
            <input
              type="checkbox"
              id="isRecurring"
              className="w-4 h-4 rounded border-zinc-200 bg-white text-priori-navy focus:ring-priori-navy/10"
              checked={formData.isRecurring}
              onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
            />
            <label htmlFor="isRecurring" className="text-sm text-zinc-600 font-medium cursor-pointer">
              Agendamento Recorrente (Bloquear horário por 4 semanas)
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1" 
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              isLoading={isSaving}
            >
              {editingId ? 'Salvar Alterações' : 'Agendar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
