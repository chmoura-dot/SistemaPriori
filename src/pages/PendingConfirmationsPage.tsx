import React, { useState, useEffect, useMemo } from 'react';
import { Filter, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { Appointment, Psychologist, Customer, AppointmentStatus } from '../services/types';
import { cn } from '../lib/utils';
import { PsychologistConfirmationGroup } from './pendingConfirmations/PsychologistConfirmationGroup';
import { CancellationBillingModal } from './pendingConfirmations/CancellationBillingModal';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const PendingConfirmationsPage = () => {
  const [appointments, setAppointments]   = useState<Appointment[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [isLoading, setIsLoading]         = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'canceled'>('pending');
  const [monthFilter, setMonthFilter]   = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const [sendingEmail, setSendingEmail]   = useState<string | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<{ psyId: string; message: string; type: 'success' | 'error' } | null>(null);
  const [cancellationModalAppId, setCancellationModalAppId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let startDate: string, endDate: string;
      if (monthFilter === 'all') {
        const today = new Date();
        const past  = new Date(today.getFullYear() - 1, today.getMonth(), 1);
        startDate   = past.toISOString().split('T')[0];
        endDate     = today.toISOString().split('T')[0];
      } else {
        const [year, month] = monthFilter.split('-').map(Number);
        startDate = `${monthFilter}-01`;
        endDate   = `${monthFilter}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      }
      const [apps, psys, custs] = await Promise.all([
        api.getAppointmentsByRange(startDate, endDate),
        api.getPsychologists(),
        api.getCustomers(),
      ]);
      setAppointments(apps);
      setPsychologists(psys);
      setCustomers(custs);
    } catch (error) {
      console.error('Erro ao carregar validações:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [monthFilter]);

  const handleConfirmToggle = async (app: Appointment) => {
    try {
      await api.updateAppointment(app.id, { confirmedPsychologist: !app.confirmedPsychologist });
      await loadData();
    } catch { alert('Erro ao alterar confirmação.'); }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.updateAppointment(id, { status: AppointmentStatus.ACTIVE, cancellationBilling: null, confirmedPsychologist: false });
      await loadData();
    } catch { alert('Erro ao reativar agendamento.'); }
  };

  const handleCancelBillingChoice = async (billingMode: 'none' | 'plan' | 'particular') => {
    if (!cancellationModalAppId) return;
    try {
      await api.updateAppointment(cancellationModalAppId, { status: AppointmentStatus.CANCELED, cancellationBilling: billingMode });
      await loadData();
    } catch { alert('Erro ao registrar falta.'); }
    finally { setCancellationModalAppId(null); }
  };

  const sendWhatsAppNag = (psy: Psychologist, count: number) => {
    if (!psy.phone) { alert('Psicólogo sem telefone cadastrado.'); return; }
    const msg = `Olá ${psy.name}, aqui é da coordenação do Núcleo Priori. Notamos que você possui ${count} atendimentos pendentes de confirmação no sistema. Por favor, poderia regularizar sua agenda? Isso é fundamental para nosso faturamento. Obrigado!`;
    window.open(`https://wa.me/55${psy.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const sendEmailReminder = async (psy: Psychologist) => {
    setSendingEmail(psy.id);
    setEmailFeedback(null);
    try {
      const res  = await fetch(`${SUPABASE_URL}/functions/v1/resend-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ psychologist_id: psy.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar e-mail.');
      const msg = data.message?.includes('Nenhuma pendência')
        ? 'Nenhuma pendência encontrada para este psicólogo.'
        : `✅ E-mail enviado para ${psy.name}!`;
      setEmailFeedback({ psyId: psy.id, message: msg, type: data.message?.includes('Nenhuma pendência') ? 'error' : 'success' });
    } catch (err: any) {
      setEmailFeedback({ psyId: psy.id, message: `❌ Erro: ${err.message}`, type: 'error' });
    } finally {
      setSendingEmail(null);
      setTimeout(() => setEmailFeedback(null), 5000);
    }
  };

  const groupedAppointments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filtered = appointments.filter(a => {
      if (monthFilter !== 'all' && !a.date.startsWith(monthFilter)) return false;
      if (new Date(a.date + 'T12:00:00') > today) return false;
      const isCanceled  = a.status === AppointmentStatus.CANCELED;
      const isConfirmed = a.confirmedPsychologist;
      const isPending   = (a.status === AppointmentStatus.ACTIVE || a.status === AppointmentStatus.RELEASED) && !a.confirmedPsychologist;
      if (statusFilter === 'pending'   && !isPending)   return false;
      if (statusFilter === 'confirmed' && !isConfirmed) return false;
      if (statusFilter === 'canceled'  && !isCanceled)  return false;
      return true;
    });
    const map = new Map<string, { psy: Psychologist; apps: Appointment[] }>();
    filtered.forEach(app => {
      if (!map.has(app.psychologistId)) {
        const psy = psychologists.find(p => p.id === app.psychologistId);
        if (psy) map.set(app.psychologistId, { psy, apps: [] });
      }
      map.get(app.psychologistId)?.apps.push(app);
    });
    return Array.from(map.values()).sort((a, b) => b.apps.length - a.apps.length);
  }, [appointments, psychologists, statusFilter, monthFilter]);

  const totalFiltered = groupedAppointments.reduce((acc, curr) => acc + curr.apps.length, 0);

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const d     = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
  }, []);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Painel de Validações</h2>
          <p className="text-zinc-500">Controle, confirme e corrija as presenças e faltas lançadas.</p>
        </div>
        <div className="flex bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm items-center gap-6">
          <div className="flex flex-col items-center border-r border-zinc-100 pr-6">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sessões</span>
            <span className="text-xl font-bold text-priori-navy">{totalFiltered}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Psicólogos</span>
            <span className="text-xl font-bold text-amber-600">{groupedAppointments.length}</span>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-zinc-100 p-4 rounded-2xl flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2 text-zinc-400 border-r border-zinc-100 pr-4">
          <Filter size={16} />
          <span className="text-xs font-bold uppercase tracking-widest">Filtros:</span>
        </div>
        <select
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          className="bg-zinc-50 border border-zinc-200 text-priori-navy text-sm rounded-xl px-3 py-2 outline-none focus:border-priori-navy"
        >
          <option value="all">Todos os Meses</option>
          {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="flex bg-zinc-50 rounded-xl p-1 border border-zinc-200">
          {(['all', 'pending', 'confirmed', 'canceled'] as const).map((f, i) => {
            const labels  = ['Todas', 'Pendentes', 'Confirmadas', 'Faltas'];
            const active  = ['text-priori-navy', 'text-amber-600', 'text-emerald-600', 'text-red-500'];
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn('px-3 py-1.5 text-xs font-bold rounded-lg transition-all',
                  statusFilter === f ? `bg-white ${active[i]} shadow-sm` : 'text-zinc-500')}
              >
                {labels[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <Loader2 size={32} className="animate-spin text-priori-navy" />
          <p className="text-sm font-medium">Carregando validações...</p>
        </div>
      ) : groupedAppointments.length > 0 ? (
        <div className="grid grid-cols-1 gap-8">
          {groupedAppointments.map(({ psy, apps }) => (
            <PsychologistConfirmationGroup
              key={psy.id}
              psy={psy}
              apps={apps}
              customers={customers}
              statusFilter={statusFilter}
              sendingEmail={sendingEmail}
              emailFeedback={emailFeedback}
              onConfirmToggle={handleConfirmToggle}
              onReactivate={handleReactivate}
              onSetCancellationModalAppId={setCancellationModalAppId}
              onSendEmailReminder={sendEmailReminder}
              onSendWhatsApp={sendWhatsAppNag}
            />
          ))}
        </div>
      ) : (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <CheckCircle2 size={32} className="text-emerald-400" />
          <p className="text-sm font-medium">Nenhuma sessão encontrada para os filtros selecionados.</p>
        </div>
      )}

      {/* Modal de registro de falta */}
      <CancellationBillingModal
        app={appointments.find(a => a.id === cancellationModalAppId)}
        onClose={() => setCancellationModalAppId(null)}
        onConfirm={handleCancelBillingChoice}
      />
    </div>
  );
};
