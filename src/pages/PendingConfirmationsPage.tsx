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
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';
import { Appointment, Psychologist, Customer, AppointmentStatus } from '../services/types';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';

export const PendingConfirmationsPage = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPsyId, setSelectedPsyId] = useState<string>('all');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [apps, psys, custs] = await Promise.all([
        api.getAppointments(),
        api.getPsychologists(),
        api.getCustomers()
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Filtra atendimentos que ocorreram há mais de 3 dias e não foram confirmados pelo psicólogo
      const stale = apps.filter(a => {
        const appDate = new Date(a.date + 'T12:00:00');
        const diffTime = today.getTime() - appDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return (
          diffDays >= 1 && // Consideramos "atrasado" após 24 horas (ajustável)
          a.status === AppointmentStatus.ACTIVE &&
          !a.confirmedPsychologist
        );
      });

      setAppointments(stale);
      setPsychologists(psys.filter(p => p.active));
      setCustomers(custs);
    } catch (error) {
      console.error('Erro ao carregar pendências:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const sendWhatsAppNag = (psy: Psychologist, count: number) => {
    if (!psy.phone) {
      alert('Psicólogo sem telefone cadastrado.');
      return;
    }

    const message = `Olá ${psy.name}, aqui é da coordenação do Núcleo Priori. Notamos que você possui ${count} atendimentos pendentes de confirmação no sistema há mais de 24 horas. Por favor, poderia regularizar sua agenda? Isso é fundamental para nosso faturamento. Obrigado!`;
    const url = `https://wa.me/55${psy.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Agrupar pendências por psicólogo
  const groupedPendencies = useMemo(() => {
    const map = new Map<string, { psy: Psychologist, apps: Appointment[] }>();
    
    appointments.forEach(app => {
      if (selectedPsyId !== 'all' && app.psychologistId !== selectedPsyId) return;
      
      if (!map.has(app.psychologistId)) {
        const psy = psychologists.find(p => p.id === app.psychologistId);
        if (psy) {
          map.set(app.psychologistId, { psy, apps: [] });
        }
      }
      map.get(app.psychologistId)?.apps.push(app);
    });

    return Array.from(map.values()).sort((a, b) => b.apps.length - a.apps.length);
  }, [appointments, psychologists, selectedPsyId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy">Pendências de Confirmação</h2>
          <p className="text-zinc-500">Atendimentos realizados há mais de 24 horas sem check do psicólogo.</p>
        </div>
        <div className="flex bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm items-center gap-6">
          <div className="flex flex-col items-center border-r border-zinc-100 pr-6">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Pendente</span>
            <span className="text-xl font-bold text-priori-navy">{appointments.length}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Psicólogos em Atraso</span>
            <span className="text-xl font-bold text-amber-600">{groupedPendencies.length}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-100 p-3 rounded-2xl flex items-center gap-4 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-2 text-zinc-400 border-r border-zinc-100 pr-4">
          <Filter size={16} />
          <span className="text-xs font-bold uppercase tracking-widest">Filtrar:</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedPsyId('all')}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-xl transition-all",
              selectedPsyId === 'all' ? "bg-priori-navy text-white" : "bg-zinc-50 text-zinc-400 hover:bg-zinc-100"
            )}
          >
            Todos
          </button>
          {psychologists.filter(p => appointments.some(a => a.psychologistId === p.id)).map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPsyId(p.id)}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-xl transition-all",
                selectedPsyId === p.id ? "bg-priori-navy text-white" : "bg-zinc-50 text-zinc-400 hover:bg-zinc-100"
              )}
            >
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <Loader2 size={32} className="animate-spin text-priori-navy" />
          <p className="text-sm font-medium">Analisando agenda...</p>
        </div>
      ) : groupedPendencies.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {groupedPendencies.map(({ psy, apps }) => (
            <div key={psy.id} className="bg-white border border-zinc-100 rounded-[2rem] overflow-hidden shadow-sm">
              <div className="p-6 border-b border-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-priori-navy text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-priori-navy/20">
                    {psy.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-priori-navy uppercase tracking-tight">{psy.name}</h3>
                    <p className="text-xs text-zinc-500 font-medium">{apps.length} sessões pendentes</p>
                  </div>
                </div>
                <Button 
                  onClick={() => sendWhatsAppNag(psy, apps.length)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl px-6"
                >
                  <MessageCircle size={18} className="mr-2" />
                  Cobrar via WhatsApp
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-50">
                      <th className="px-6 py-4">Data/Hora</th>
                      <th className="px-6 py-4">Paciente</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {apps.sort((a, b) => a.date.localeCompare(b.date)).map(app => {
                      const customer = customers.find(c => c.id === app.customerId);
                      return (
                        <tr key={app.id} className="group hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-priori-navy">
                              <Calendar size={14} className="text-zinc-400" />
                              <span className="text-sm font-bold">{new Date(app.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                              <span className="text-xs font-medium text-zinc-400 ml-1">{app.startTime}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-priori-navy uppercase">{customer?.name}</span>
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">{customer?.healthPlan}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => {
                                window.history.pushState({}, '', `/agenda?date=${app.date}`);
                                window.dispatchEvent(new PopStateEvent('popstate'));
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-priori-navy hover:text-priori-gold transition-colors"
                            >
                              Ver na Agenda
                              <ChevronRight size={14} />
                            </button>
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
          <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 size={40} />
          </div>
          <div>
            <p className="text-lg font-bold text-priori-navy">Agenda 100% em dia!</p>
            <p className="text-sm opacity-60">Não há nenhum agendamento pendente de confirmação há mais de 24 horas.</p>
          </div>
        </div>
      )}
    </div>
  );
};
