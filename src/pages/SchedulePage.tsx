import React, { useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Home, User, ChevronDown,
} from 'lucide-react';
import { AttendanceMode } from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';
import { getWeekDays } from './schedule/scheduleUtils';
import { ScheduleGrid } from './schedule/ScheduleGrid';
import { ScheduleFormModal } from './schedule/ScheduleFormModal';
import { CancellationModals } from './schedule/CancellationModals';
import { OnlineAppointmentsPanel } from './schedule/OnlineAppointmentsPanel';
import { useScheduleData } from './schedule/useScheduleData';
import { useScheduleActions } from './schedule/useScheduleActions';

export const SchedulePage = () => {
  const s = useScheduleData();
  const {
    resetForm, handleCloseModal, handleSubmit, handleEdit,
    handleDelete, confirmDelete, handleConfirm,
    handleCancelBillingChoice,
    sendWhatsApp, handleReminder,
  } = useScheduleActions(s);

  const changeDate = (days: number) => {
    const d = new Date(s.date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    s.setDate(d.toISOString().split('T')[0]);
  };

  const weekDays = getWeekDays(s.date);

  const timeSlots = useMemo(() => {
    const dayOfWeek = new Date(s.date + 'T12:00:00').getDay();
    const limitHour = dayOfWeek === 6 ? 14 : 20;
    return Array.from({ length: 13 * 2 + 1 }, (_, i) => {
      const totalMinutes = 7 * 60 + i * 30;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }).filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      if (h > limitHour) return false;
      if (h === limitHour && m > 0) return false;
      return true;
    });
  }, [s.date]);

  const onlineForView = s.appointments.filter(a => {
    if (a.mode !== AttendanceMode.ONLINE) return false;
    return s.viewMode === 'daily' ? a.date === s.date : weekDays.includes(a.date);
  });

  if (s.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
      </div>
    );
  }

  // Holiday / Closure Banner
  const closure = s.closures.find(c => s.date >= c.startDate && s.date <= c.endDate);
  const holiday = s.holidays.find(h => h.date === s.date);

  return (
    <div className="space-y-6 min-h-[600px]">
      {/* Banners de feriado/fechamento */}
      {s.viewMode === 'daily' && closure && (
        <div className="flex items-center gap-3 p-3 bg-zinc-100 border border-zinc-300 rounded-xl text-zinc-700">
          <span className="text-lg">🏖️</span>
          <div>
            <p className="text-sm font-bold">Clínica Fechada — {closure.reason}</p>
            <p className="text-xs text-zinc-500">{new Date(closure.startDate + 'T12:00:00').toLocaleDateString('pt-BR')} até {new Date(closure.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
          </div>
        </div>
      )}
      {s.viewMode === 'daily' && !closure && holiday && !holiday.clinicOpen && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800">
          <span className="text-lg">🎌</span>
          <div><p className="text-sm font-bold">Feriado: {holiday.name}</p><p className="text-xs text-red-600 capitalize">{holiday.type}</p></div>
        </div>
      )}
      {s.viewMode === 'daily' && !closure && holiday?.clinicOpen && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
          <span className="text-lg">⚠️</span>
          <div><p className="text-sm font-bold">Ponto Facultativo: {holiday.name}</p><p className="text-xs text-amber-600">A clínica está aberta normalmente.</p></div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Agenda de Salas</h2>
          <p className="text-zinc-500">Controle de horários e ocupação das salas (Limite 20:00).</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1 rounded-xl border border-zinc-100 shadow-sm">
            {(['daily', 'weekly', 'psychologist'] as const).map((mode, i) => (
              <button key={mode} onClick={() => s.setViewMode(mode)}
                className={cn('px-4 py-1.5 text-xs font-bold rounded-lg transition-all', s.viewMode === mode ? 'bg-priori-navy text-white' : 'text-zinc-400 hover:text-priori-navy')}
              >
                {['Diária', 'Semanal', 'Psicólogo'][i]}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-white border border-zinc-100 rounded-xl p-1 shadow-sm">
            <button onClick={() => changeDate(-1)} className="p-1.5 hover:bg-zinc-50 rounded-lg transition-colors text-priori-navy"><ChevronLeft size={18} /></button>
            <input type="date" value={s.date} onChange={e => s.setDate(e.target.value)}
              className="bg-transparent border-none px-2 py-1 text-sm font-bold text-priori-navy focus:outline-none text-center" />
            <button onClick={() => changeDate(1)} className="p-1.5 hover:bg-zinc-50 rounded-lg transition-colors text-priori-navy"><ChevronRight size={18} /></button>
          </div>
          <div className="min-w-[100px] text-priori-navy text-xs font-bold uppercase tracking-tight">
            {new Date(s.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
          </div>
          <Button onClick={() => { resetForm(); s.setFormData(prev => ({ ...prev, date: s.date, mode: AttendanceMode.PRESENCIAL })); s.setIsModalOpen(true); }}
            className="bg-priori-navy hover:bg-priori-navy/90 text-white">
            <Plus size={20} className="mr-2" /> Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Room Selector (weekly) */}
      {s.viewMode === 'weekly' && (
        <div className="bg-white border border-zinc-100 p-2 rounded-2xl flex items-center gap-3 shadow-sm overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-2 border-r border-zinc-100 pr-3 mr-1">
            <Home size={14} className="text-zinc-400" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">Sala:</span>
          </div>
          <div className="flex gap-1.5">
            {s.rooms.map(r => (
              <button key={r.id} onClick={() => s.setSelectedRoom(r.id)}
                className={cn('px-4 py-2 text-[11px] font-black uppercase tracking-tight rounded-xl transition-all whitespace-nowrap',
                  s.selectedRoom === r.id ? 'bg-priori-navy text-white shadow-md' : 'bg-zinc-50 text-zinc-400 hover:bg-zinc-100 hover:text-priori-navy')}
              >{r.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Psychologist Selector */}
      {s.viewMode === 'psychologist' && (
        <div className="bg-white border border-zinc-100 p-3 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400">
            <User size={14} />
            <label className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Psicólogo:</label>
          </div>
          <div className="relative flex-1 max-w-sm">
            <select className="w-full bg-zinc-50 border border-zinc-100 rounded-xl pl-4 pr-10 py-2.5 text-xs font-bold text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/10 appearance-none cursor-pointer"
              value={s.selectedPsychologistId} onChange={e => s.setSelectedPsychologistId(e.target.value)}>
              {s.psychologists.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-priori-navy pointer-events-none" />
          </div>
        </div>
      )}

      {/* Online Appointments Panel */}
      <OnlineAppointmentsPanel
        appointments={onlineForView}
        viewMode={s.viewMode}
        selectedPsychologistId={s.selectedPsychologistId}
        customers={s.customers}
        psychologists={s.psychologists}
        onReminder={handleReminder}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onConfirm={handleConfirm}
        onCancelBilling={id => s.setCancellationModalAppId(id)}
        sendWhatsApp={sendWhatsApp}
      />

      {/* Main Grid */}
      <ScheduleGrid
        appointments={s.appointments}
        rooms={s.rooms}
        psychologists={s.psychologists}
        customers={s.customers}
        viewMode={s.viewMode}
        selectedRoom={s.selectedRoom}
        selectedPsychologistId={s.selectedPsychologistId}
        date={s.date}
        weekDays={weekDays}
        timeSlots={timeSlots}
        editingId={s.editingId}
        formMode={s.formData.mode}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReminder={handleReminder}
        onCancelBilling={id => s.setCancellationModalAppId(id)}
      />

      {/* Form Modal */}
      <ScheduleFormModal
        isOpen={s.isModalOpen}
        onClose={handleCloseModal}
        editingId={s.editingId}
        formData={s.formData}
        setFormData={s.setFormData}
        handleSubmit={handleSubmit}
        isSaving={s.isSaving}
        updateFuture={s.updateFuture}
        setUpdateFuture={s.setUpdateFuture}
        customers={s.customers}
        psychologists={s.psychologists}
        rooms={s.rooms}
        appointments={s.appointments}
        plans={s.plans}
        onDeleteFromModal={async () => {
          const appt = s.appointments.find(a => a.id === s.editingId);
          if (appt) { await handleDelete(appt); handleCloseModal(); }
        }}
      />

      {/* Cancellation + Delete Modals */}
      <CancellationModals
        cancellationModalAppId={s.cancellationModalAppId}
        setCancellationModalAppId={s.setCancellationModalAppId}
        cancellationReason={s.cancellationReason}
        setCancellationReason={s.setCancellationReason}
        cancellationStep={s.cancellationStep}
        setCancellationStep={s.setCancellationStep}
        cancellationScope={s.cancellationScope}
        setCancellationScope={s.setCancellationScope}
        isRecurring={!!s.appointments.find(a => a.id === s.cancellationModalAppId)?.isRecurring}
        isSaving={s.isSaving}
        handleCancelBillingChoice={handleCancelBillingChoice}
        deleteModalAppId={s.deleteModalAppId}
        setDeleteModalAppId={s.setDeleteModalAppId}
        confirmDelete={confirmDelete}
      />
    </div>
  );
};
