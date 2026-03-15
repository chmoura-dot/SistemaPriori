import React, { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Calendar,
  User,
  MapPin,
  RefreshCcw,
  Check
} from 'lucide-react';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';

// Definindo a URL da Edge Function (pode ser configurada via env no futuro)
const EDGE_FUNCTION_URL = 'https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/confirm-appointment';

interface AppointmentData {
  id: string;
  start_time: string;
  end_time: string;
  mode: string;
  type: string;
  status: string;
  confirmed_psychologist: boolean;
  customer: { name: string; health_plan: string };
  room: { name: string };
}

export const MagicConfirmationPage = () => {
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [date, setDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellationModal, setCancellationModal] = useState<{ id: string } | null>(null);

  const token = new URLSearchParams(window.location.search).get('token');

  const loadAppointments = useCallback(async () => {
    if (!token) {
      setError('Token de acesso não fornecido.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${EDGE_FUNCTION_URL}?token=${token}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar agenda.');
      }

      setAppointments(data.appointments || []);
      setDate(data.date);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleAction = async (appointmentId: string, action: 'confirm' | 'cancel' | 'pendency', billing?: string) => {
    if (!token) return;
    setIsProcessing(appointmentId);
    
    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, appointmentId, action, billing })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao processar ação.');

      // Atualizar lista local
      setAppointments(prev => prev.map(app => 
        app.id === appointmentId ? { 
          ...app, 
          confirmed_psychologist: action === 'confirm',
          status: action === 'cancel' ? 'canceled' : 'active'
        } : app
      ));
      
      setCancellationModal(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-priori-bg flex flex-col items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-priori-navy border-t-transparent mb-4" />
        <p className="text-zinc-500 font-medium">Carregando sua agenda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-priori-bg flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-zinc-100 max-w-md w-full">
          <AlertCircle size={64} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-priori-navy mb-2">Ops! Link Inválido</h1>
          <p className="text-zinc-500 mb-6">{error}</p>
          <Button onClick={() => window.location.href = 'https://nucleopriori.com.br'} className="w-full bg-priori-navy text-white">
            Voltar para o Site
          </Button>
        </div>
      </div>
    );
  }

  const displayDate = date.split('-').reverse().join('/');

  return (
    <div className="min-h-screen bg-priori-bg pb-20">
      {/* Header Fixo */}
      <div className="bg-white border-b border-zinc-100 sticky top-0 z-10 p-4 mb-6 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-priori-navy">Confirmação de Agenda</h1>
            <p className="text-sm text-zinc-500 flex items-center gap-1">
              <Calendar size={14} /> {displayDate}
            </p>
          </div>
          <div className="p-2 bg-priori-navy/5 rounded-xl">
             <CheckCircle2 size={24} className="text-priori-navy" />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 space-y-4">
        <p className="text-sm text-zinc-500 font-medium px-1">
          Olá, selecione o status de presença de cada paciente atendido hoje:
        </p>

        {appointments.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-zinc-100 text-center shadow-sm">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4 opacity-20" />
            <p className="text-zinc-400 font-medium">Nenhum agendamento pendente para hoje.</p>
          </div>
        ) : (
          appointments.map((app) => (
            <div 
              key={app.id} 
              className={cn(
                "bg-white rounded-3xl border p-5 transition-all shadow-sm flex flex-col gap-4",
                app.status === 'canceled' ? "border-zinc-100 opacity-60 bg-zinc-50" : "border-zinc-100",
                app.confirmed_psychologist ? "border-emerald-100 bg-emerald-50/30" : ""
              )}
            >
              {/* Info Consulta */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-priori-navy">
                    <Clock size={16} className="text-zinc-400" />
                    <span className="font-bold">{app.start_time} - {app.end_time}</span>
                  </div>
                  <h3 className={cn(
                    "text-lg font-bold text-priori-navy",
                    app.status === 'canceled' && "line-through"
                  )}>
                    {app.customer?.name}
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wider">
                    <span className="text-zinc-400 border border-zinc-200 px-2 py-0.5 rounded-md">
                       {app.type}
                    </span>
                    <span className="text-zinc-400 border border-zinc-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <MapPin size={10} /> {app.mode} {app.mode === 'Presencial' && `(${app.room?.name})`}
                    </span>
                  </div>
                </div>

                {app.confirmed_psychologist && (
                  <div className="bg-emerald-500 text-white p-1.5 rounded-full shadow-lg shadow-emerald-500/20">
                    <Check size={16} strokeWidth={3} />
                  </div>
                )}
                {app.status === 'canceled' && (
                  <div className="bg-zinc-400 text-white p-1.5 rounded-full">
                    <XCircle size={16} strokeWidth={3} />
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex gap-2">
                {!app.confirmed_psychologist && app.status !== 'canceled' ? (
                  <>
                    <button
                      onClick={() => handleAction(app.id, 'confirm')}
                      disabled={isProcessing === app.id}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
                    >
                      Compareceu
                    </button>
                    <button
                      onClick={() => setCancellationModal({ id: app.id })}
                      disabled={isProcessing === app.id}
                      className="flex-1 bg-white border border-red-200 hover:bg-red-50 text-red-500 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all"
                    >
                      Faltou
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleAction(app.id, 'pendency')}
                    disabled={isProcessing === app.id}
                    className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all"
                  >
                    <RefreshCcw size={16} /> Desfazer Status
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Simples de Falta */}
      {cancellationModal && (
        <div className="fixed inset-0 bg-priori-navy/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
            <h2 className="text-xl font-bold text-priori-navy mb-2">Como cobrar esta falta?</h2>
            <p className="text-zinc-500 mb-6 text-sm">A sessão será marcada como cancelada. Escolha a opção de faturamento:</p>

            <div className="space-y-3">
              <button 
                onClick={() => handleAction(cancellationModal.id, 'cancel', 'none')}
                className="w-full p-4 border border-zinc-100 rounded-2xl text-left hover:bg-zinc-50 transition-colors font-bold text-priori-navy flex items-center justify-between"
              >
                Não Cobrar <span className="text-[10px] bg-zinc-100 px-2 py-1 rounded-md text-zinc-400">ISENTO</span>
              </button>
              <button 
                onClick={() => handleAction(cancellationModal.id, 'cancel', 'plan')}
                className="w-full p-4 border border-emerald-100 rounded-2xl text-left hover:bg-emerald-50 transition-colors font-bold text-priori-navy flex items-center justify-between"
              >
                Cobrar no Plano <span className="text-[10px] bg-emerald-100 px-2 py-1 rounded-md text-emerald-600">CONVÊNIO</span>
              </button>
              <button 
                onClick={() => handleAction(cancellationModal.id, 'cancel', 'particular')}
                className="w-full p-4 border border-priori-gold/20 rounded-2xl text-left hover:bg-priori-gold/5 transition-colors font-bold text-priori-navy flex items-center justify-between"
              >
                Cobrar Particular <span className="text-[10px] bg-priori-gold/20 px-2 py-1 rounded-md text-priori-gold">PARTICULAR</span>
              </button>
            </div>

            <Button 
              variant="outline" 
              onClick={() => setCancellationModal(null)}
              className="w-full mt-6 py-4 rounded-2xl text-zinc-400"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <div className="mt-12 text-center text-[10px] text-zinc-400 uppercase font-medium tracking-[0.2em] px-4">
        Sistema Priori • Neuropsicologia e Psicoterapia
      </div>
    </div>
  );
};
