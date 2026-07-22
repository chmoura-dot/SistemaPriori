import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { logger } from '../../lib/logger';
import {
  Appointment, Room, Psychologist, Customer, Plan,
  AttendanceMode, AppointmentType, RecurrenceFrequency,
  Holiday, ClinicClosure,
} from '../../services/types';
import { ScheduleFormData } from './scheduleUtils';

export const makeDefaultForm = (date: string): ScheduleFormData => ({
  customerId: '',
  psychologistId: '',
  roomId: '',
  mode: AttendanceMode.PRESENCIAL,
  type: AppointmentType.ADULTO,
  procedureCode: '',
  date,
  startTime: '08:00',
  endTime: '09:00',
  customPrice: undefined,
  customRepassAmount: undefined,
  isRecurring: false,
  recurrenceFrequency: RecurrenceFrequency.SEMANAL,
  isInternal: false,
  internalType: 'SUPERVISAO',
  internalTitle: '',
  internalNotes: '',
});

export const useScheduleData = () => {
  // ── Data state ─────────────────────────────────────────────────────────
  const [date, setDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('date');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return new Date().toISOString().split('T')[0];
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [closures, setClosures] = useState<ClinicClosure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedRange, setLoadedRange] = useState({ start: '', end: '' });

  // ── UI state ───────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'psychologist'>('daily');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [selectedPsychologistId, setSelectedPsychologistId] = useState('');

  // ── Form / modal state ─────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ScheduleFormData>(makeDefaultForm(date));
  const [updateFuture, setUpdateFuture] = useState(false);
  // Remanejamento: quando preenchido, o submit do formulário executa o swap
  // atômico (cancela este ID como 'reschedule' + cria o novo vinculado).
  const [rescheduleFromId, setRescheduleFromId] = useState<string | null>(null);

  // ── Cancellation / delete state ────────────────────────────────────────
  const [cancellationModalAppId, setCancellationModalAppId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationStep, setCancellationStep] = useState<'reason' | 'scope' | 'billing'>('reason');
  const [cancellationScope, setCancellationScope] = useState<'single' | 'stop_treatment'>('single');
  const [deleteModalAppId, setDeleteModalAppId] = useState<string | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────
  const loadData = async (targetDateStr: string = date, forceRefresh = false) => {
    const d = new Date(targetDateStr + 'T12:00:00');
    const past = new Date(d); past.setDate(d.getDate() - 15);
    const future = new Date(d); future.setDate(d.getDate() + 15);
    const startDate = past.toISOString().split('T')[0];
    const endDate = future.toISOString().split('T')[0];

    if (!forceRefresh && loadedRange.start && targetDateStr >= loadedRange.start && targetDateStr <= loadedRange.end) return;

    setIsLoading(true);
    try {
      const [a, r, p, c, plansData, h, cl] = await Promise.all([
        api.getAppointmentsByRange(startDate, endDate),
        api.getRooms(),
        api.getPsychologists(),
        api.getCustomers(),
        api.getPlans(),
        api.getHolidays(),
        api.getClinicClosures(),
      ]);
      setAppointments(a);
      setLoadedRange({ start: startDate, end: endDate });
      setRooms(r);
      if (r.length > 0 && !selectedRoom) setSelectedRoom(r[0].id);
      setPsychologists(p);
      if (p.length > 0 && !selectedPsychologistId) setSelectedPsychologistId(p[0].id);
      setCustomers(c.filter(cust => cust.status === 'active'));
      setPlans(plansData);
      setHolidays(h);
      setClosures(cl);
    } catch (err) {
      logger.error('[Agenda] Erro ao carregar dados:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Cleanup: cancela setState se o componente desmontar durante o carregamento
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    loadData(date, true);
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (loadedRange.start && (date < loadedRange.start || date > loadedRange.end)) {
      loadData(date, true);
    }
  }, [date, loadedRange]);

  return {
    date, setDate,
    appointments, setAppointments,
    rooms, psychologists, customers, plans, holidays, closures,
    isLoading,
    viewMode, setViewMode,
    selectedRoom, setSelectedRoom,
    selectedPsychologistId, setSelectedPsychologistId,
    isModalOpen, setIsModalOpen,
    isSaving, setIsSaving,
    editingId, setEditingId,
    formData, setFormData,
    updateFuture, setUpdateFuture,
    rescheduleFromId, setRescheduleFromId,
    cancellationModalAppId, setCancellationModalAppId,
    cancellationReason, setCancellationReason,
    cancellationStep, setCancellationStep,
    cancellationScope, setCancellationScope,
    deleteModalAppId, setDeleteModalAppId,
    loadData,
  };
};
