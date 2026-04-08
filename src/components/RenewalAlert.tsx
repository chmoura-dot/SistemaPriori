import React, { useState, useEffect } from 'react';
import { AlertCircle, Calendar, User, RefreshCw, XCircle, Clock } from 'lucide-react';
import { api } from '../services/api';
import { Appointment, AppointmentStatus, RecurrenceFrequency } from '../services/types';
import { Modal } from './Modal';
import { Button } from './Button';

export const RenewalAlert = () => {
  const [needingRenewal, setNeedingRenewal] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [psychologists, setPsychologists] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDismissedSession, setIsDismissedSession] = useState(false);
  const user = api.getCurrentUser();

  const getDismissalCount = (appointmentId: string): number => {
    const today = new Date().toISOString().split('T')[0];
    const key = `renewal_dismissal_${appointmentId}_${today}`;
    return parseInt(localStorage.getItem(key) || '0');
  };

  const incrementDismissalCount = (appointmentId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const key = `renewal_dismissal_${appointmentId}_${today}`;
    const count = getDismissalCount(appointmentId);
    localStorage.setItem(key, (count + 1).toString());
    setIsDismissedSession(true);
  };

  // Calcula quantos dias faltam para o vencimento (negativo = já venceu)
  const getDaysUntilDue = (dateStr: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T12:00:00');
    due.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const loadData = async () => {
    if (!api.isAuthenticated()) return;
    try {
      setIsLoading(true);
      const [appointmentsData, customersData, psychologistsData] = await Promise.all([
        api.getAppointmentsNeedingRenewal(),
        api.getCustomers(),
        api.getPsychologists()
      ]);
      
      const customerMap = customersData.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {});
      const psychologistMap = psychologistsData.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});
      
      // Filtro: mostrar se vence em até 7 dias (incluindo já vencidos)
      // E ignorado menos de 3 vezes hoje
      const filtered = appointmentsData.filter(app => {
        const daysUntilDue = getDaysUntilDue(app.date);
        const isDue = daysUntilDue <= 7; // Alerta antecipado: 7 dias antes
        const dismissalCount = getDismissalCount(app.id);
        return isDue && dismissalCount < 3;
      });
      
      // Ordenar: vencidos primeiro, depois por data mais próxima
      filtered.sort((a, b) => a.date.localeCompare(b.date));
      
      setCustomers(customerMap);
      setPsychologists(psychologistMap);
      setNeedingRenewal(filtered);
    } catch (error) {
      console.error('Erro ao carregar dados de renovação:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh every 5 minutes to catch new ones
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRenew = async (appointment: Appointment) => {
    setIsProcessing(true);
    try {
      // Criar próximo agendamento +7 dias a partir da data do atual
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
        isRecurring: true,
        recurrenceFrequency: appointment.recurrenceFrequency || RecurrenceFrequency.SEMANAL
      });

      // Marcar atual como renovado com histórico
      await api.updateAppointment(appointment.id, {
        needsRenewal: false,
        renewedAt: new Date().toISOString(),
        renewedBy: user?.email ?? 'sistema',
      });
      
      await loadData();
    } catch (error: any) {
      alert(error.message || 'Erro ao renovar agendamento');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePermanentDismiss = async (appointment: Appointment) => {
    setIsProcessing(true);
    try {
      await api.updateAppointment(appointment.id, { needsRenewal: false });
      await loadData();
    } catch (error) {
      alert('Erro ao liberar horário');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLater = (appointment: Appointment) => {
    incrementDismissalCount(appointment.id);
  };

  if (needingRenewal.length === 0 || isDismissedSession) return null;

  // Mostrar um de cada vez
  const current = needingRenewal[0];
  const daysUntilDue = getDaysUntilDue(current.date);
  const isOverdue = daysUntilDue < 0;
  const isToday = daysUntilDue === 0;
  const isUpcoming = daysUntilDue > 0;

  const urgencyColor = isOverdue
    ? { bg: 'bg-red-50', border: 'border-red-100', icon: 'bg-red-100', iconText: 'text-red-600', title: 'text-red-900', text: 'text-red-800' }
    : isToday
    ? { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'bg-amber-100', iconText: 'text-amber-600', title: 'text-amber-900', text: 'text-amber-800' }
    : { bg: 'bg-blue-50', border: 'border-blue-100', icon: 'bg-blue-100', iconText: 'text-blue-600', title: 'text-blue-900', text: 'text-blue-800' };

  const urgencyLabel = isOverdue
    ? `Vencido há ${Math.abs(daysUntilDue)} dia(s)`
    : isToday
    ? 'Vence hoje!'
    : `Vence em ${daysUntilDue} dia(s)`;

  const modalTitle = isOverdue
    ? 'Atenção: Renovação Atrasada 🚨'
    : isToday
    ? 'Atenção: Renovação Necessária 🔔'
    : 'Aviso: Renovação Próxima ⏰';

  return (
    <Modal
      isOpen={true}
      onClose={() => handleLater(current)}
      title={modalTitle}
      className="max-w-md"
    >
      <div className="space-y-6">
        <div className={`flex items-start gap-4 p-4 ${urgencyColor.bg} border ${urgencyColor.border} rounded-2xl`}>
          <div className={`p-2 ${urgencyColor.icon} rounded-lg shrink-0`}>
            {isUpcoming ? (
              <Clock className={urgencyColor.iconText} size={24} />
            ) : (
              <AlertCircle className={urgencyColor.iconText} size={24} />
            )}
          </div>
          <div className="space-y-1">
            <h4 className={`font-bold ${urgencyColor.title}`}>
              {isOverdue ? 'Ciclo de Sessões Encerrado' : isToday ? 'Agendamento Finalizado' : 'Renovação em Breve'}
            </h4>
            <p className={`text-sm ${urgencyColor.text} leading-relaxed`}>
              {isOverdue
                ? 'O ciclo de sessões deste paciente já encerrou. Renove o horário ou libere o espaço na agenda.'
                : isToday
                ? 'O ciclo de sessões deste paciente chega ao fim hoje. Renove o horário para as próximas 4 semanas ou libere o espaço.'
                : `O ciclo de sessões deste paciente encerrará em ${daysUntilDue} dia(s). Prepare-se para renovar.`}
            </p>
            <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${urgencyColor.icon} ${urgencyColor.iconText}`}>
              {urgencyLabel}
            </span>
          </div>
        </div>

        <div className="space-y-3 p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
          <div className="flex items-center gap-3 text-priori-navy">
            <User size={18} className="text-zinc-400" />
            <span className="font-semibold">{customers[current.customerId] || 'Paciente'}</span>
          </div>
          <div className="flex items-center gap-3 text-zinc-600 text-sm">
            <div className="w-[18px] flex justify-center">
              <div className="w-2 h-2 rounded-full bg-priori-gold" />
            </div>
            <span>Psicólogo: <span className="font-medium">{psychologists[current.psychologistId] || 'Não identificado'}</span></span>
          </div>
          <div className="flex items-center gap-3 text-zinc-600 text-sm">
            <Calendar size={18} className="text-zinc-400" />
            <span>Última sessão: {new Date(current.date + 'T12:00:00').toLocaleDateString('pt-BR')} às {current.startTime}</span>
          </div>
          {needingRenewal.length > 1 && (
            <div className="flex items-center gap-3 text-zinc-500 text-xs">
              <div className="w-[18px] flex justify-center">
                <div className="w-2 h-2 rounded-full bg-zinc-300" />
              </div>
              <span>+{needingRenewal.length - 1} outro(s) agendamento(s) pendente(s)</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Button
            onClick={() => handleRenew(current)}
            className="w-full bg-priori-navy hover:bg-priori-navy/90 text-white h-12 rounded-xl flex items-center justify-center gap-2"
            isLoading={isProcessing}
          >
            <RefreshCw size={18} />
            Renovar por +4 Semanas
          </Button>
          
          <Button
            variant="outline"
            onClick={() => handlePermanentDismiss(current)}
            className="w-full border-zinc-200 text-zinc-600 hover:bg-zinc-100 h-12 rounded-xl flex items-center justify-center gap-2"
            isLoading={isProcessing}
          >
            <XCircle size={18} />
            Liberar Horário (Não Renovar)
          </Button>

          <Button
            variant="ghost"
            onClick={() => handleLater(current)}
            className="w-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 h-10 rounded-xl flex items-center justify-center gap-2 text-xs"
            isLoading={isProcessing}
          >
            Lembrar mais tarde (Ignorar {getDismissalCount(current.id) + 1}/3 hoje)
          </Button>
        </div>

        <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest font-bold">
          Este alerta reaparecerá até 3 vezes ao dia se não for resolvido.
        </p>
      </div>
    </Modal>
  );
};
