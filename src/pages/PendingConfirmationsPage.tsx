import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Calendar, 
  User, 
  Clock, 
  AlertCircle,
  MessageCircle,
  Copy,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { api } from '../services/api';
import { Appointment, Psychologist, Customer, AppointmentStatus } from '../services/types';
import { Modal } from '../components/Modal';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const PendingConfirmationsPage = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [cancellationModalAppId, setCancellationModalAppId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const [allApps, psys, custs] = await Promise.all([
        api.getAppointments(),
        api.getPsychologists(),
        api.getCustomers()
      ]);

      // Filtrar apenas atendimentos passados (data < hoje) que não foram confirmados
      const today = new Date().toISOString().split('T')[0];
      const pending = allApps.filter(app => 
        app.date < today && 
        !app.confirmedPsychologist && 
        app.status !== AppointmentStatus.CANCELED
      ).sort((a, b) => b.date.localeCompare(a.date));

      setAppointments(pending);
      setPsychologists(psys);
      setCustomers(custs);
      setIsLoading(false);
    };

    loadData();
  }, []);

  const getPsychologistName = (id: string) => psychologists.find(p => p.id === id)?.name || 'N/A';
  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'N/A';

  const copyWhatsAppMessage = (psy: Psychologist, apps: Appointment[]) => {
    const appList = apps.map(app => {
      const date = format(new Date(app.date + 'T12:00:00'), "dd/MM", { locale: ptBR });
      const customer = getCustomerName(app.customerId);
      return `• ${date}: ${customer}`;
    }).join('\n');

    const message = `Olá, ${psy.name}! Notamos que alguns atendimentos seus ainda não foram confirmados no sistema:\n\n${appList}\n\nPoderia validar assim que possível? Obrigado!`;
    
    navigator.clipboard.writeText(message);
    alert('Mensagem de cobrança copiada para a área de transferência!');
  };

  const handleConfirm = async (id: string) => {
    setIsProcessing(id);
    try {
      await api.updateAppointment(id, { confirmedPsychologist: true });
      setAppointments(prev => prev.filter(app => app.id !== id));
    } catch (error) {
      alert('Erro ao confirmar atendimento');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleCancelBillingChoice = async (billingMode: 'none' | 'plan' | 'particular') => {
    if (!cancellationModalAppId) return;
    setIsProcessing(cancellationModalAppId);
    try {
      await api.updateAppointment(cancellationModalAppId, {
        status: AppointmentStatus.CANCELED,
        cancellationBilling: billingMode
      });
      setAppointments(prev => prev.filter(app => app.id !== cancellationModalAppId));
    } catch (error) {
      alert('Erro ao cancelar agendamento');
    } finally {
      setCancellationModalAppId(null);
      setIsProcessing(null);
    }
  };

  // Agrupar por psicólogo
  const groupedByPsy = appointments.reduce((acc: Record<string, Appointment[]>, app) => {
    if (!acc[app.psychologistId]) acc[app.psychologistId] = [];
    acc[app.psychologistId].push(app);
    return acc;
  }, {});

  const filteredPsys = psychologists.filter(p => 
    groupedByPsy[p.id] && 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-priori-navy flex items-center gap-2">
            <ClipboardList className="text-priori-gold" />
            Confirmações Pendentes
          </h2>
          <p className="text-zinc-500">Atendimentos passados que ainda não foram validados pelos psicólogos.</p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
          <input
            type="text"
            placeholder="Buscar psicólogo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-2xl w-full md:w-64 focus:ring-2 focus:ring-priori-gold/20 outline-none transition-all"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-priori-navy border-t-transparent" />
        </div>
      ) : Object.keys(groupedByPsy).length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-100 p-12 rounded-[2.5rem] text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <h3 className="text-lg font-bold text-emerald-900">Tudo em dia!</h3>
          <p className="text-emerald-700/70 max-w-sm mx-auto">
            Não existem atendimentos passados pendentes de confirmação neste momento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredPsys.map(psy => {
            const apps = groupedByPsy[psy.id];
            return (
              <div key={psy.id} className="glass-card overflow-hidden group">
                <div className="bg-priori-navy p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white italic font-bold">
                      {psy.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg">{psy.name}</h3>
                      <p className="text-white/60 text-xs flex items-center gap-1 uppercase tracking-widest font-bold">
                        {apps.length} {apps.length === 1 ? 'pendência' : 'pendências'}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => copyWhatsAppMessage(psy, apps)}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                  >
                    <MessageCircle size={18} />
                    Cobrar via WhatsApp
                  </button>
                </div>
                
                <div className="p-4 bg-white/50 space-y-2">
                  {apps.map(app => (
                    <div key={app.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-zinc-100 p-3 rounded-xl hover:border-priori-gold/30 transition-all gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center justify-center bg-zinc-50 rounded-lg p-2 min-w-[60px]">
                          <span className="text-[10px] uppercase font-bold text-zinc-400">
                            {format(new Date(app.date + 'T12:00:00'), 'EEE', { locale: ptBR })}
                          </span>
                          <span className="text-sm font-bold text-priori-navy">
                            {format(new Date(app.date + 'T12:00:00'), 'dd/MM')}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-priori-navy">
                            {getCustomerName(app.customerId)}
                          </p>
                          <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                            <Clock size={12} /> {app.startTime} - {app.endTime} • {app.type}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => handleConfirm(app.id)}
                          disabled={isProcessing === app.id}
                          className={cn(
                            "flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all",
                            isProcessing === app.id && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <CheckCircle2 size={14} />
                          Compareceu
                        </button>
                        <button
                          onClick={() => setCancellationModalAppId(app.id)}
                          disabled={isProcessing === app.id}
                          className={cn(
                            "flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all",
                            isProcessing === app.id && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <XCircle size={14} />
                          Faltou
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal 
        isOpen={!!cancellationModalAppId} 
        onClose={() => setCancellationModalAppId(null)}
        title="Cancelar Sessão"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            Como deseja registrar o faturamento desta falta?
          </p>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => handleCancelBillingChoice('none')}
              className="flex items-center justify-center p-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
            >
              <div className="text-center">
                <span className="block font-bold text-zinc-700 text-sm">Não Cobrar</span>
                <span className="block text-xs text-zinc-500 mt-1">Sessão cancelada sem custo</span>
              </div>
            </button>
            
            <button
              onClick={() => handleCancelBillingChoice('plan')}
              className="flex items-center justify-center p-3 border border-priori-navy/20 bg-priori-navy/5 rounded-xl hover:bg-priori-navy/10 transition-colors"
            >
              <div className="text-center">
                <span className="block font-bold text-priori-navy text-sm">Cobrar no Convênio</span>
                <span className="block text-xs text-priori-navy/70 mt-1">Sessão será faturada via convênio normalmente</span>
              </div>
            </button>
            
            <button
              onClick={() => handleCancelBillingChoice('particular')}
              className="flex items-center justify-center p-3 border border-emerald-200 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors"
            >
              <div className="text-center">
                <span className="block font-bold text-emerald-700 text-sm">Cobrar Particular</span>
                <span className="block text-xs text-emerald-600/70 mt-1">Sessão será faturada do particular</span>
              </div>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
