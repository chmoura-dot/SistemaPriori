import React from 'react';
import { Calendar, Clock, Mail, MessageCircle, Check, X, RotateCcw, Edit2, Loader2 } from 'lucide-react';
import { Appointment, Psychologist, Customer, AppointmentStatus } from '../../services/types';
import { cn } from '../../lib/utils';
import { Button } from '../../components/Button';

interface Props {
  psy: Psychologist;
  apps: Appointment[];
  customers: Customer[];
  statusFilter: 'all' | 'pending' | 'confirmed' | 'canceled';
  sendingEmail: string | null;
  emailFeedback: { psyId: string; message: string; type: 'success' | 'error' } | null;
  onConfirmToggle: (app: Appointment) => void;
  onReactivate: (id: string) => void;
  onSetCancellationModalAppId: (id: string) => void;
  onSendEmailReminder: (psy: Psychologist) => void;
  onSendWhatsApp: (psy: Psychologist, count: number) => void;
}

export const PsychologistConfirmationGroup: React.FC<Props> = ({
  psy, apps, customers, statusFilter,
  sendingEmail, emailFeedback,
  onConfirmToggle, onReactivate, onSetCancellationModalAppId,
  onSendEmailReminder, onSendWhatsApp,
}) => (
  <div className="bg-white border border-zinc-100 rounded-3xl overflow-hidden shadow-md shadow-zinc-100/50">
    {/* Cabeçalho do psicólogo */}
    <div className="p-6 sm:p-8 border-b border-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-priori-navy text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-priori-navy/20">
          {psy.name.charAt(0)}
        </div>
        <div>
          <h3 className="font-bold text-priori-navy uppercase tracking-tight">{psy.name}</h3>
          <p className="text-xs text-zinc-500 font-medium">{apps.length} sessões listadas</p>
          {emailFeedback?.psyId === psy.id && (
            <p className={cn('text-xs font-bold mt-1', emailFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-500')}>
              {emailFeedback.message}
            </p>
          )}
        </div>
      </div>

      {statusFilter === 'pending' && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => onSendEmailReminder(psy)}
            disabled={sendingEmail === psy.id}
            className="bg-priori-navy hover:bg-priori-navy/90 text-white rounded-2xl px-5 disabled:opacity-60"
          >
            {sendingEmail === psy.id
              ? <Loader2 size={16} className="mr-2 animate-spin" />
              : <Mail size={16} className="mr-2" />}
            {sendingEmail === psy.id ? 'Enviando...' : 'Reenviar Link por E-mail'}
          </Button>
          <Button
            onClick={() => onSendWhatsApp(psy, apps.length)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl px-5"
          >
            <MessageCircle size={16} className="mr-2" />
            Cobrar via WhatsApp
          </Button>
        </div>
      )}
    </div>

    {/* Tabela de sessões */}
    <div className="overflow-x-auto p-2">
      <table className="w-full text-left border-collapse min-w-[700px]">
        <thead>
          <tr className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 bg-white">
            <th className="px-6 py-4 rounded-tl-xl">Data/Hora</th>
            <th className="px-6 py-4">Paciente</th>
            <th className="px-6 py-4">Status Atual</th>
            <th className="px-6 py-4 text-right rounded-tr-xl">Ações Rápidas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {apps.sort((a, b) => b.date.localeCompare(a.date)).map(app => {
            const customer    = customers.find(c => c.id === app.customerId);
            const isCanceled  = app.status === AppointmentStatus.CANCELED;
            const isConfirmed = app.confirmedPsychologist;

            return (
              <tr key={app.id} className="group hover:bg-zinc-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-priori-navy">
                    <Calendar size={14} className={isCanceled ? 'text-zinc-300' : 'text-zinc-400'} />
                    <span className={cn('text-sm font-bold', isCanceled && 'text-zinc-400 line-through')}>
                      {new Date(app.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                    <span className="text-xs font-medium text-zinc-400 ml-1">{app.startTime}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className={cn('text-sm font-bold uppercase', isCanceled ? 'text-zinc-400' : 'text-priori-navy')}>
                      {customer?.name}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">
                      {customer?.healthPlan}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {isCanceled ? (
                    <div className="flex flex-col items-start gap-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-bold uppercase">
                        <X size={10} /> Faltou
                      </span>
                      <span className="text-[9px] font-black uppercase text-zinc-400">
                        Cobrança: {app.cancellationBilling === 'plan' ? 'Convênio' : app.cancellationBilling === 'particular' ? 'Particular' : 'Isento'}
                      </span>
                    </div>
                  ) : isConfirmed ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase">
                      <Check size={10} /> Confirmado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[10px] font-bold uppercase">
                      <Clock size={10} /> Pendente
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isCanceled ? (
                      <>
                        <button
                          onClick={() => onSetCancellationModalAppId(app.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-600 text-xs font-bold hover:bg-zinc-50 hover:border-priori-navy/30 transition-all shadow-sm"
                        >
                          <Edit2 size={12} /> Editar Faturamento
                        </button>
                        <button
                          onClick={() => onReactivate(app.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-500 text-xs font-bold hover:bg-zinc-200 transition-all"
                        >
                          <RotateCcw size={12} /> Desfazer
                        </button>
                      </>
                    ) : isConfirmed ? (
                      <button
                        onClick={() => onConfirmToggle(app)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-500 text-xs font-bold hover:bg-zinc-200 transition-all"
                      >
                        <RotateCcw size={12} /> Desfazer Confirmação
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onConfirmToggle(app)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold hover:bg-emerald-100 transition-all shadow-sm"
                        >
                          <Check size={12} /> Confirmar
                        </button>
                        <button
                          onClick={() => onSetCancellationModalAppId(app.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-bold hover:bg-red-100 transition-all shadow-sm"
                        >
                          <X size={12} /> Falta
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
