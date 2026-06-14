import React, { useEffect, useRef, useMemo } from 'react';
import { Trash2, Wifi, Building2, Lock, User, AlertTriangle } from 'lucide-react';
import {
  Appointment, Psychologist, Customer, Plan, Room,
  AttendanceMode, AppointmentStatus, RecurrenceFrequency,
} from '../../services/types';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { cn } from '../../lib/utils';
import { matchPlanByHealthPlan } from '../../services/supabase/helpers';
import { calcRepass } from '../../lib/repassRules';
import { ScheduleFormData } from './scheduleUtils';
import { CustomerSearchDropdown } from './CustomerSearchDropdown';
import { DateTimePicker } from './DateTimePicker';
import { ProcedureSelector } from './ProcedureSelector';
import { RecurrenceSection } from './RecurrenceSection';
import { InternalBlockForm } from './InternalBlockForm';

interface ScheduleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
  formData: ScheduleFormData;
  setFormData: React.Dispatch<React.SetStateAction<ScheduleFormData>>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
  updateFuture: boolean;
  setUpdateFuture: React.Dispatch<React.SetStateAction<boolean>>;
  customers: Customer[];
  psychologists: Psychologist[];
  rooms: Room[];
  appointments: Appointment[];
  plans: Plan[];
  onDeleteFromModal: () => Promise<void>;
}

export const ScheduleFormModal: React.FC<ScheduleFormModalProps> = ({
  isOpen, onClose, editingId, formData, setFormData, handleSubmit, isSaving,
  updateFuture, setUpdateFuture, customers, psychologists, rooms, appointments, plans,
  onDeleteFromModal,
}) => {
  const prevCustomerIdRef = useRef('');
  const prevStartTimeRef = useRef('');

  // Auto-populate endTime and preços ao trocar paciente/horário
  useEffect(() => {
    const customerChanged = formData.customerId !== prevCustomerIdRef.current;
    const startChanged = formData.startTime !== prevStartTimeRef.current;
    prevCustomerIdRef.current = formData.customerId;
    prevStartTimeRef.current = formData.startTime;

    const customer = customers.find(c => c.id === formData.customerId);
    const plan = matchPlanByHealthPlan(plans, customer?.healthPlan);
    const procedure = plan?.procedures.find(proc => proc.type === formData.type || proc.code === formData.procedureCode);

    if (customerChanged && customer) {
      const price = customer.customPrice ?? procedure?.price;
      const repass = customer.customRepassAmount
        ?? (customer.customPrice !== undefined && customer.customPrice > 0
          ? calcRepass(customer.customPrice, psychologists.find(p => p.id === formData.psychologistId))
          : procedure?.repassAmount);
      if (price !== undefined) setFormData(prev => ({ ...prev, customPrice: price, customRepassAmount: repass }));
    }

    if (startChanged && formData.startTime) {
      const [h, m] = formData.startTime.split(':').map(Number);
      const endTotal = h * 60 + m + 60;
      const endH = Math.floor(endTotal / 60);
      const endM = endTotal % 60;
      const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      setFormData(prev => ({ ...prev, endTime }));
    }
  }, [formData.customerId, formData.startTime]);

  // Clear psychologist/room when date/time changes
  useEffect(() => {
    if (formData.date && formData.startTime && formData.endTime && !editingId) {
      setFormData(prev => ({ ...prev, psychologistId: '', roomId: '' }));
    }
  }, [formData.date, formData.startTime, formData.endTime]);

  const currentCustomer = customers.find(c => c.id === formData.customerId);
  const currentPlan = matchPlanByHealthPlan(plans, currentCustomer?.healthPlan);

  // Available psychologists (no conflict on date+time)
  const availablePsychologists = psychologists.filter(p => {
    if (!p.active) return false;
    if (!formData.date || !formData.startTime || !formData.endTime) return true;
    const conflict = appointments.find(a =>
      a.id !== editingId && a.psychologistId === p.id && a.date === formData.date &&
      a.status !== AppointmentStatus.CANCELED &&
      ((formData.startTime >= a.startTime && formData.startTime < a.endTime) ||
        (formData.endTime > a.startTime && formData.endTime <= a.endTime) ||
        (formData.startTime <= a.startTime && formData.endTime >= a.endTime))
    );
    return !conflict;
  });

  // Count hidden psychologists (for warning)
  const hiddenPsychCount = psychologists.filter(p => p.active).length - availablePsychologists.length;

  // Psicólogos ocultos: detalhar quem e com qual conflito
  const hiddenPsychDetails = useMemo(() => {
    if (!formData.date || !formData.startTime || !formData.endTime || hiddenPsychCount <= 0) return [];
    return psychologists.filter(p => p.active && !availablePsychologists.some(ap => ap.id === p.id)).map(p => {
      const conflicting = appointments.find(a =>
        a.psychologistId === p.id && a.date === formData.date && a.id !== editingId &&
        a.status !== AppointmentStatus.CANCELED &&
        ((formData.startTime >= a.startTime && formData.startTime < a.endTime) ||
          (formData.endTime > a.startTime && formData.endTime <= a.endTime) ||
          (formData.startTime <= a.startTime && formData.endTime >= a.endTime))
      );
      const conflictCustomer = conflicting ? customers.find(c => c.id === conflicting.customerId) : undefined;
      const conflictName = conflicting?.isInternal
        ? (conflicting.internalTitle || 'Bloqueio Interno')
        : (conflictCustomer?.name || 'Outro paciente');
      return { psychName: p.name, conflictName, conflictTime: conflicting ? `${conflicting.startTime}–${conflicting.endTime}` : '' };
    });
  }, [formData.date, formData.startTime, formData.endTime, hiddenPsychCount]);

  // Recurring series conflict detection
  const seriesConflicts = useMemo(() => {
    if (!formData.isRecurring || !formData.psychologistId || !formData.date || !formData.startTime || !formData.endTime) return [];
    const [startYear, startMonth, startDay] = formData.date.split('-').map(Number);
    const interval = formData.recurrenceFrequency === RecurrenceFrequency.QUINZENAL ? 14 : 7;
    const endMonth = startMonth === 12 ? 1 : startMonth + 1;
    const endYear = startMonth === 12 ? startYear + 1 : startYear;
    const endDate = new Date(endYear, endMonth, 0);

    const conflicts: { date: string; formatted: string; conflictName: string; conflictTime: string }[] = [];
    let i = 1; // skip first date (already checked by dropdown filter)
    while (i < 52) {
      const cur = new Date(startYear, startMonth - 1, startDay + i * interval);
      if (cur > endDate) break;
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const conflicting = appointments.find(a =>
        a.id !== editingId && a.psychologistId === formData.psychologistId && a.date === dateStr &&
        a.status !== AppointmentStatus.CANCELED &&
        ((formData.startTime >= a.startTime && formData.startTime < a.endTime) ||
          (formData.endTime > a.startTime && formData.endTime <= a.endTime) ||
          (formData.startTime <= a.startTime && formData.endTime >= a.endTime))
      );

      if (conflicting) {
        const cc = customers.find(c => c.id === conflicting.customerId);
        const cName = conflicting.isInternal
          ? (conflicting.internalTitle || 'Bloqueio Interno')
          : (cc?.name || 'Outro paciente');
        conflicts.push({
          date: dateStr,
          formatted: cur.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
          conflictName: cName,
          conflictTime: `${conflicting.startTime}–${conflicting.endTime}`,
        });
      }
      i++;
    }
    return conflicts;
  }, [formData.isRecurring, formData.psychologistId, formData.date, formData.startTime, formData.endTime, formData.recurrenceFrequency, appointments]);

  // Available rooms (no conflict)
  const availableRooms = rooms.filter(room => {
    if (!formData.date || !formData.startTime || !formData.endTime) return true;
    const conflict = appointments.find(a =>
      a.id !== editingId && a.roomId === room.id && a.date === formData.date &&
      a.mode === AttendanceMode.PRESENCIAL && a.status !== AppointmentStatus.CANCELED &&
      ((formData.startTime >= a.startTime && formData.startTime < a.endTime) ||
        (formData.endTime > a.startTime && formData.endTime <= a.endTime) ||
        (formData.startTime <= a.startTime && formData.endTime >= a.endTime))
    );
    return !conflict;
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingId ? 'Editar Agendamento' : 'Novo Agendamento'}>
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Tab: Paciente / Bloqueio Interno */}
        <div className="flex bg-zinc-100/80 rounded-xl p-1">
          {([
            { label: 'Paciente', val: false, icon: User },
            { label: 'Bloqueio Interno', val: true, icon: Lock },
          ] as const).map(({ label, val, icon: Icon }) => (
            <button
              key={label} type="button"
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all',
                formData.isInternal === val ? 'bg-white text-priori-navy shadow-sm' : 'text-zinc-400 hover:text-zinc-600')}
              onClick={() => setFormData(prev => ({ ...prev, isInternal: val, customerId: '' }))}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Mode Selector */}
        <div className="flex gap-3">
          {([
            { mode: AttendanceMode.PRESENCIAL, label: 'Presencial', icon: Building2 },
            { mode: AttendanceMode.ONLINE, label: 'On-line', icon: Wifi },
          ] as const).map(({ mode, label, icon: Icon }) => (
            <button
              key={mode} type="button"
              className={cn('flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-bold transition-all',
                formData.mode === mode ? 'border-priori-navy bg-priori-navy/5 text-priori-navy' : 'border-zinc-200 text-zinc-400 hover:border-zinc-300')}
              onClick={() => setFormData(prev => ({ ...prev, mode, roomId: '' }))}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {/* Patient or Internal Block */}
        {formData.isInternal ? (
          <InternalBlockForm formData={formData} setFormData={setFormData} />
        ) : (
          <CustomerSearchDropdown
            customers={customers}
            selectedCustomerId={formData.customerId}
            onSelect={customerId => setFormData(prev => ({ ...prev, customerId, procedureCode: '', type: prev.type }))}
          />
        )}

        {/* Date / Time */}
        <DateTimePicker formData={formData} setFormData={setFormData} />

        {/* Procedure Selector (only for patient appointments) */}
        {!formData.isInternal && (
          <ProcedureSelector
            currentCustomer={currentCustomer}
            currentPlan={currentPlan}
            formData={formData}
            setFormData={setFormData}
          />
        )}

        {/* Psychologist Selector */}
        {(formData.date && formData.startTime && formData.endTime) && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Psicólogo</label>
            <select
              className="w-full rounded-xl bg-white border border-zinc-200 px-4 py-3 text-base text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 transition-all"
              value={formData.psychologistId}
              onChange={e => setFormData(prev => ({ ...prev, psychologistId: e.target.value, roomId: '' }))}
              required
            >
              <option value="">Selecione o psicólogo...</option>
              {availablePsychologists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              {availablePsychologists.length === 0 && <option disabled>Nenhum psicólogo disponível neste horário</option>}
            </select>
            {/* Aviso de psicólogos ocultos por conflito */}
            {hiddenPsychCount > 0 && (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle size={13} />
                  <span className="text-[11px] font-bold">
                    {hiddenPsychCount} psicólogo(s) indisponível(is) neste horário:
                  </span>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  {hiddenPsychDetails.map((d, i) => (
                    <p key={i} className="text-[10px] text-amber-800">
                      • <strong>{d.psychName}</strong> — ocupado por {d.conflictName} ({d.conflictTime})
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Room Selector (presencial only) */}
        {formData.mode === AttendanceMode.PRESENCIAL && formData.psychologistId && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Sala</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {availableRooms.map(room => (
                <button
                  key={room.id} type="button"
                  className={cn('py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all',
                    formData.roomId === room.id ? 'border-priori-navy bg-priori-navy text-white shadow-md' : 'border-zinc-200 text-zinc-500 hover:border-priori-navy/40 hover:text-priori-navy')}
                  onClick={() => setFormData(prev => ({ ...prev, roomId: room.id }))}
                >
                  {room.name}
                </button>
              ))}
              {availableRooms.length === 0 && <p className="text-xs text-red-500 col-span-4 py-2">Todas as salas estão ocupadas neste horário.</p>}
            </div>
          </div>
        )}

        {/* Recurrence */}
        <RecurrenceSection
          formData={formData}
          setFormData={setFormData}
          editingId={editingId}
          appointments={appointments}
          updateFuture={updateFuture}
          setUpdateFuture={setUpdateFuture}
        />

        {/* Alerta de conflitos na série recorrente */}
        {seriesConflicts.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl animate-in fade-in duration-300">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle size={16} />
              <span className="text-xs font-bold">
                ⚠️ Atenção: esta série terá conflito em {seriesConflicts.length} data(s) futura(s)
              </span>
            </div>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {seriesConflicts.map((c, i) => (
                <p key={i} className="text-[11px] text-red-800">
                  • <strong>{c.formatted}</strong> — ocupado por <strong>{c.conflictName}</strong> ({c.conflictTime})
                </p>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-red-600 italic">
              As sessões nessas datas não serão criadas automaticamente. Será necessário ajuste manual.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t border-zinc-100">
          {editingId && (
            <button type="button" onClick={onDeleteFromModal}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors">
              <Trash2 size={15} /> Excluir
            </button>
          )}
          <div className={cn('flex gap-3', !editingId && 'ml-auto')}>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSaving} className="bg-priori-navy text-white hover:bg-priori-navy/90">
              {isSaving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Agendamento'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
