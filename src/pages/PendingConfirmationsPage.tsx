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
  ClipboardList
} from 'lucide-react';
import { api } from '../services/api';
import { Appointment, Psychologist, Customer, AppointmentStatus } from '../services/types';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const PendingConfirmationsPage = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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
                    <div key={app.id} className="flex items-center justify-between bg-white border border-zinc-100 p-3 rounded-xl hover:border-priori-gold/30 transition-all">
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
                            <Clock size={12} /> {app.time} • {app.type}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-zinc-200 group-hover:text-priori-gold transition-colors" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
