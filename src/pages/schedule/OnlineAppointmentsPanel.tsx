import React from 'react';
import { Globe, Calendar as CalendarIcon, Bell, MessageCircle, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { Appointment, AppointmentStatus, Customer, Psychologist } from '../../services/types';
import { PLAN_COLORS } from './scheduleUtils';
import { StatusIcons } from './AppointmentCard';
import { cn } from '../../lib/utils';

interface OnlineAppointmentsPanelProps {
  appointments: Appointment[];
  viewMode: 'daily' | 'weekly' | 'psychologist';
  selectedPsychologistId: string;
  customers: Customer[];
  psychologists: Psychologist[];
  onReminder: (app: Appointment) => void;
  onEdit: (app: Appointment) => void;
  onDelete: (app: Appointment) => void;
  onConfirm: (id: string, type: 'patient' | 'psychologist') => void;
  onCancelBilling: (id: string) => void;
  onRenew: (app: Appointment) => void;
  onDismissRenewal: (id: string) => void;
  sendWhatsApp: (app: Appointment, target: 'patient' | 'psychologist') => void;
}

export const OnlineAppointmentsPanel: React.FC<OnlineAppointmentsPanelProps> = ({
  appointments, viewMode, selectedPsychologistId,
  customers, psychologists, onReminder, onEdit, onDelete, onConfirm,
  onCancelBilling, onRenew, onDismissRenewal, sendWhatsApp,
}) => {
  const visible = appointments.filter(a =>
    viewMode !== 'psychologist' || a.psychologistId === selectedPsychologistId
  );
  if (visible.length === 0) return null;

  const statusColors = (app: Appointment, customer?: Customer) => {
    if (app.status === AppointmentStatus.CANCELED) return 'bg-zinc-100 border-zinc-200 border-l-zinc-400 opacity-60';
    if (app.confirmationStatus === 'confirmed') return 'bg-emerald-50/50 border-emerald-100 border-l-emerald-500';
    if (app.confirmationStatus === 'declined') return 'bg-red-50/50 border-red-100 border-l-red-500';
    if (app.reminderSentAt) return 'bg-amber-50/50 border-amber-100 border-l-amber-500';
    return cn('bg-priori-navy/5 border-priori-navy/10', customer ? PLAN_COLORS[customer.healthPlan] || 'border-l-priori-navy' : 'border-l-priori-navy');
  };

  return (
    <div className="bg-white border border-priori-navy/10 rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2 text-priori-navy">
        <Globe size={16} />
        <h3 className="font-bold uppercase tracking-widest text-[10px]">
          {viewMode === 'daily' ? 'Atendimentos On-line de Hoje' : 'Atendimentos On-line da Semana'}
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {visible.map(app => {
          const customer = customers.find(c => c.id === app.customerId);
          const psychologist = psychologists.find(p => p.id === app.psychologistId);
          const isCanceled = app.status === AppointmentStatus.CANCELED;
          return (
            <div key={app.id} className={cn('p-3 rounded-xl relative group transition-all border-l-4 shadow-sm hover:shadow-md', statusColors(app, customer))}>
              <div className="flex justify-between items-start mb-1.5">
                <div className="flex flex-col">
                  <span className="text-[9px] font-extrabold text-priori-navy uppercase tracking-tight">{app.startTime} - {app.endTime}</span>
                  {viewMode !== 'daily' && <span className="text-[8px] text-zinc-500 font-medium">{new Date(app.date + 'T12:00:00').toLocaleDateString()}</span>}
                </div>
                <div className="flex gap-1">
                  {app.isRecurring && <CalendarIcon size={12} className="p-0.5 text-priori-gold" />}
                  <button onClick={() => onReminder(app)} className={cn('p-0.5 transition-colors', app.reminderSentAt ? 'text-amber-600' : 'text-zinc-400 hover:text-priori-navy')}><Bell size={12} /></button>
                  <button onClick={() => sendWhatsApp(app, 'psychologist')} className="p-0.5 text-zinc-400 hover:text-priori-navy"><MessageCircle size={12} /></button>
                  <button onClick={() => onEdit(app)} className="p-0.5 text-zinc-400 hover:text-priori-navy"><Edit2 size={12} /></button>
                  <button onClick={() => onDelete(app)} className="p-0.5 text-zinc-400 hover:text-red-500" title="Excluir"><Trash2 size={12} /></button>
                </div>
              </div>
              <p className={cn('text-xs font-black truncate leading-tight', isCanceled ? 'text-zinc-500 line-through' : 'text-priori-navy')}>{customer?.name}</p>
              {viewMode !== 'psychologist' && <p className="text-[10px] text-zinc-600 font-medium truncate">{psychologist?.name}</p>}
              <StatusIcons appointment={app} />
              {app.needsRenewal && (
                <div className="mt-1.5 p-1.5 bg-white/60 border border-amber-200 rounded-lg flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 text-amber-600"><AlertCircle size={10} /><span className="text-[8px] font-bold uppercase whitespace-nowrap">Ciclo encerrado</span></div>
                  <div className="flex gap-1">
                    <button onClick={() => onRenew(app)} className="flex-1 text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold hover:bg-amber-600">Renovar +4</button>
                    <button onClick={() => onDismissRenewal(app.id)} className="flex-1 text-[8px] bg-white border border-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded font-bold hover:bg-zinc-50">Ignorar</button>
                  </div>
                </div>
              )}
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => onConfirm(app.id, 'patient')} className={cn('text-[8px] px-1.5 py-0.5 rounded border font-bold transition-all shadow-sm', app.confirmedPatient ? 'bg-white border-emerald-200 text-emerald-600' : 'bg-white border-zinc-200 text-zinc-400 hover:border-priori-navy/30')}>Pac {app.confirmedPatient ? '✓' : '?'}</button>
                <button onClick={() => onConfirm(app.id, 'psychologist')} className={cn('text-[8px] px-1.5 py-0.5 rounded border font-bold transition-all shadow-sm', app.confirmedPsychologist ? 'bg-white border-emerald-200 text-emerald-600' : 'bg-white border-zinc-200 text-zinc-400 hover:border-priori-navy/30')}>Psi {app.confirmedPsychologist ? '✓' : '?'}</button>
                {!isCanceled && (
                  <button onClick={() => onCancelBilling(app.id)} className="text-[8px] px-1.5 py-0.5 rounded border border-red-100 bg-red-50 text-red-500 font-bold hover:bg-red-100">Psi ✕</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
