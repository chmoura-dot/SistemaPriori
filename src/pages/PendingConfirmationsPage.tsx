import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  MessageCircle,
  Calendar,
  User,
  Clock,
  Loader2,
  ChevronRight,
  Filter,
  CheckCircle2,
  Mail,
  Send,
  Check,
  X,
  RotateCcw,
  Edit2
} from 'lucide-react';
import { api } from '../services/api';
import { Appointment, Psychologist, Customer, AppointmentStatus } from '../services/types';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const PendingConfirmationsPage = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'canceled'>('pending');
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<{ psyId: string; message: string; type: 'success' | 'error' } | null>(null);

  const [cancellationModalAppId, setCancellationModalAppId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [apps, psys, custs] = await Promise.all([
        api.getAppointments(),
        api.getPsychologists(),
        api.getCustomers()
      ]);

      setAppointments(apps);
      setPsychologists(psys.filter(p => p.active));
      setCustomers(custs);
    } catch (error) {
      console.error('Erro ao carregar validações:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConfirmToggle = async (app: Appointment) => {
    try {
      await api.updateAppointment(app.id, {
        confirmedPsychologist: !app.confirmedPsychologist
      });
      await loadData();
    } catch (error) {
      alert('Erro ao alterar confirmação.');
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.updateAppointment(id, {
        status: AppointmentStatus.ACTIVE,
        cancellationBilling: null,
        confirmedPsychologist: false
      });
      await loadData();
    } catch (error) {
      alert('Erro ao reativar agendamento.');
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
      alert('Erro ao registrar falta.');
    } finally {
      setCancellationModalAppId(null);
    }
  };

  const sendWhatsAppNag = (psy: Psychologist, count: number) => {
    if (!psy.phone) {
      alert('Psicólogo sem telefone cadastrado.');
      return;
    }

    const message = `Olá ${psy.name}, aqui é da coordenação do Núcleo Priori. Notamos que você possui ${count} atendimentos pendentes de confirmação no sistema. Por favor, poderia regularizar sua agenda? Isso é fundamental para nosso faturamento. Obrigado!`;
    const url = `https://wa.me/55${psy.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const sendEmailReminder = async (psy: Psychologist) => {
    setSendingEmail(psy.id);
    setEmailFeedback(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/resend-confirmation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ psychologist_id: psy.id })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar e-mail.');
      }

      if (data.message && data.message.includes('Nenhuma pendência')) {
        setEmailFeedback({ psyId: psy.id, message: 'Nenhuma pendência encontrada para este psicólogo.', type: 'error' });
      } else {
        setEmailFeedback({ psyId: psy.id, message: `✅ E-mail enviado para ${psy.name}!`, type: 'success' });
      }
    } catch (err: any) {
      setEmailFeedback({ psyId: psy.id, message: `❌ Erro: ${err.message}`, type: 'error' });
    } finally {
      setSendingEmail(null);
      setTimeout(() => setEmailFeedback(null), 5000);
    }
  };

  // Filtrar e agrupar
  const groupedAppointments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filtered = appointments.filter(a => {
      // Filtro de mês
      if (monthFilter !== 'all') {
        if (!a.date.startsWith(monthFilter)) return false;
      }

      // Evita mostrar atendimentos futuros como "pendentes" (só passado)
      const appDate = new Date(a.date + 'T12:00:00');
      if (appDate > today) return false;

      // Filtro de status
      const isCanceled = a.status === AppointmentStatus.CANCELED;
      const isConfirmed = a.confirmedPsychologist;
      const isPending = a.status === AppointmentStatus.ACTIVE && !a.confirmedPsychologist;

      if (statusFilter === 'pending' && !isPending) return false;
      if (statusFilter === 'confirmed' && !isConfirmed) return false;
      if (statusFilter === 'canceled' && !isCanceled) return false;

      return true;
    });

    const map = new Map<string, { psy: Psychologist, apps: Appointment[] }>();

    filtered.forEach(app => {
      if (!map.has(app.psychologistId)) {
        const psy = psychologists.find(p => p.id === app.psychologistId);
        if (psy) {
          map.set(app.psychologistId, { psy, apps: [] });
        }
      }
      map.get(app.psychologistId)?.apps.push(app);
    });

    return Array.from(map.values()).sort((a, b) => b.apps.length - a.apps.length);
  }, [appointments, psychologists, statusFilter, monthFilter]);

  const totalFiltered = groupedAppointments.reduce((acc, curr) => acc + curr.apps.length, 0);

  // Geração das opções de meses baseada nos agendamentos existentes
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    appointments.forEach(app => {
      if (app.date) {
        months.add(app.date.substring(0, 7));
      }
    });

    return Array.from(months)
      .sort((a, b) => b.localeCompare(a)) // Mais recentes primeiro
      .map(value => {
        const [year, month] = value.split('-');
        const d = new Date(parseInt(year), parseInt(month) - 1, 1);
        const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return {
          value,
          label: label.charAt(0).toUpperCase() + label.slice(1)
        };
      });
  }, [appointments]);

  return (
    <div className="space-y-6 pb-20">
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

      {/* Barra de Filtros */}
      <div className="bg-white border border-zinc-100 p-4 rounded-2xl flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2 text-zinc-400 border-r border-zinc-100 pr-4">
          <Filter size={16} />
          <span className="text-xs font-bold uppercase tracking-widest">Filtros:</span>
        </div>
        
        {/* Filtro de Mês */}
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="bg-zinc-50 border border-zinc-200 text-priori-navy text-sm rounded-xl px-3 py-2 outline-none focus:border-priori-navy"
        >
          <option value="all">Todos os Meses</option>
          {monthOptions.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* Filtro de Status */}
        <div className="flex bg-zinc-50 rounded-xl p-1 border border-zinc-200">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", statusFilter === 'all' ? "bg-white text-priori-navy shadow-sm" : "text-zinc-500")}
          >
            Todas
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", statusFilter === 'pending' ? "bg-white text-amber-600 shadow-sm" : "text-zinc-500")}
          >
            Pendentes
          </button>
          <button
            onClick={() => setStatusFilter('confirmed')}
            className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", statusFilter === 'confirmed' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500")}
          >
            Confirmadas
          </button>
          <button
            onClick={() => setStatusFilter('canceled')}
            className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", statusFilter === 'canceled' ? "bg-white text-red-500 shadow-sm" : "text-zinc-500")}
          >
            Faltas
          </button>
        </div>

      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <Loader2 size={32} className="animate-spin text-priori-navy" />
          <p className="text-sm font-medium">Carregando validações...</p>
        </div>
      ) : groupedAppointments.length > 0 ? (
        <div className="grid grid-cols-1 gap-8">
          {groupedAppointments.map(({ psy, apps }) => (
            <div key={psy.id} className="bg-white border border-zinc-100 rounded-3xl overflow-hidden shadow-md shadow-zinc-100/50">
              <div className="p-6 sm:p-8 border-b border-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-priori-navy text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-priori-navy/20">
                    {psy.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-priori-navy uppercase tracking-tight">{psy.name}</h3>
                    <p className="text-xs text-zinc-500 font-medium">{apps.length} sessões listadas</p>
                    {emailFeedback?.psyId === psy.id && (
                      <p className={cn(
                        "text-xs font-bold mt-1",
                        emailFeedback.type === 'success' ? "text-emerald-600" : "text-red-500"
                      )}>
                        {emailFeedback.message}
                      </p>
                    )}
                  </div>
                </div>
                
                {statusFilter === 'pending' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={() => sendEmailReminder(psy)}
                      disabled={sendingEmail === psy.id}
                      className="bg-priori-navy hover:bg-priori-navy/90 text-white rounded-2xl px-5 disabled:opacity-60"
                    >
                      {sendingEmail === psy.id ? (
                        <Loader2 size={16} className="mr-2 animate-spin" />
                      ) : (
                        <Mail size={16} className="mr-2" />
                      )}
                      {sendingEmail === psy.id ? 'Enviando...' : 'Reenviar Link por E-mail'}
                    </Button>
                    <Button
                      onClick={() => sendWhatsAppNag(psy, apps.length)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl px-5"
                    >
                      <MessageCircle size={16} className="mr-2" />
                      Cobrar via WhatsApp
                    </Button>
                  </div>
                )}
              </div>
              
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
                      const customer = customers.find(c => c.id === app.customerId);
                      const isCanceled = app.status === AppointmentStatus.CANCELED;
                      const isConfirmed = app.confirmedPsychologist;
                      
                      return (
                        <tr key={app.id} className="group hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-priori-navy">
                              <Calendar size={14} className={isCanceled ? "text-zinc-300" : "text-zinc-400"} />
                              <span className={cn("text-sm font-bold", isCanceled && "text-zinc-400 line-through")}>
                                {new Date(app.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                              <span className="text-xs font-medium text-zinc-400 ml-1">{app.startTime}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className={cn("text-sm font-bold uppercase", isCanceled ? "text-zinc-400" : "text-priori-navy")}>
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
                                    onClick={() => setCancellationModalAppId(app.id)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-600 text-xs font-bold hover:bg-zinc-50 hover:border-priori-navy/30 transition-all shadow-sm"
                                  >
                                    <Edit2 size={12} /> Editar Faturamento
                                  </button>
                                  <button
                                    onClick={() => handleReactivate(app.id)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-500 text-xs font-bold hover:bg-zinc-200 transition-all"
                                  >
                                    <RotateCcw size={12} /> Desfazer
                                  </button>
                                </>
                              ) : isConfirmed ? (
                                <button
                                  onClick={() => handleConfirmToggle(app)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-500 text-xs font-bold hover:bg-zinc-200 transition-all"
                                >
                                  <RotateCcw size={12} /> Desfazer Confirmação
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleConfirmToggle(app)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold hover:bg-emerald-100 transition-all shadow-sm"
                                  >
                                    <Check size={12} /> Confirmar
                                  </button>
                                  <button
                                    onClick={() => setCancellationModalAppId(app.id)}
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
          ))}
        </div>
      ) : (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400 text-center gap-4 bg-white border border-zinc-100 rounded-[2rem] shadow-sm">
          <div className="w-20 h-20 rounded-full bg-priori-navy/5 text-priori-navy flex items-center justify-center">
            <CheckCircle2 size={40} />
          </div>
          <div>
            <p className="text-lg font-bold text-priori-navy">Nenhum registro encontrado</p>
            <p className="text-sm opacity-60">Altere os filtros acima para ver mais resultados.</p>
          </div>
        </div>
      )}

      {/* Modal de Cancelamento/Falta */}
      <Modal
        isOpen={!!cancellationModalAppId}
        onClose={() => setCancellationModalAppId(null)}
        title="Como cobrar esta falta?"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            A sessão será marcada como cancelada/falta. Escolha a opção de faturamento:
          </p>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => handleCancelBillingChoice('none')}
              className="p-4 border border-zinc-200 rounded-xl text-left hover:bg-zinc-50 transition-colors"
            >
              <div className="font-bold text-priori-navy flex items-center gap-2">
                Não Cobrar
                <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full uppercase tracking-wider">Isento</span>
              </div>
            </button>
            <button
              onClick={() => handleCancelBillingChoice('plan')}
              className="p-4 border border-emerald-100 bg-emerald-50/50 rounded-xl text-left hover:bg-emerald-50 transition-colors"
            >
              <div className="font-bold text-priori-navy flex items-center gap-2">
                Cobrar no Plano
                <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-wider">Convênio</span>
              </div>
            </button>
            <button
              onClick={() => handleCancelBillingChoice('particular')}
              className="p-4 border border-priori-gold/20 bg-priori-gold/5 rounded-xl text-left hover:bg-priori-gold/10 transition-colors"
            >
              <div className="font-bold text-priori-navy flex items-center gap-2">
                Cobrar Particular
                <span className="text-[10px] bg-priori-gold/20 text-priori-gold px-2 py-0.5 rounded-full uppercase tracking-wider">Particular</span>
              </div>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
