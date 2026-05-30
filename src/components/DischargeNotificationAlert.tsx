import React, { useState, useEffect, useCallback } from 'react';
import { UserX, Calendar, User, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';
import { Modal } from './Modal';
import { Button } from './Button';

interface DischargeEvent {
  id: string;
  customer_name: string;
  psychologist_name: string;
  appointments_canceled: number;
  created_at: string;
}

export const DischargeNotificationAlert: React.FC = () => {
  const [events, setEvents] = useState<DischargeEvent[]>([]);

  const loadEvents = useCallback(async () => {
    if (!api.isAuthenticated()) return;

    try {
      const { data, error } = await supabase
        .from('discharge_events')
        .select('id, customer_name, psychologist_name, appointments_canceled, created_at')
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setEvents(data);
      }
    } catch (err) {
      console.error('[DischargeAlert] Erro ao buscar eventos:', err);
    }
  }, []);

  useEffect(() => {
    // Carregar após 5s para não competir com a renderização inicial
    const timeout = setTimeout(loadEvents, 5_000);
    // Re-checar a cada 5 minutos
    const interval = setInterval(loadEvents, 5 * 60 * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [loadEvents]);

  const handleDismiss = async () => {
    // Marcar todos como lidos
    const ids = events.map(e => e.id);
    if (ids.length > 0) {
      await supabase
        .from('discharge_events')
        .update({ acknowledged_at: new Date().toISOString() })
        .in('id', ids);
    }
    setEvents([]);
  };

  if (events.length === 0) return null;

  return (
    <Modal isOpen onClose={handleDismiss} title="Altas / Interrupções de Tratamento 🏥" className="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          {events.length === 1
            ? 'Um paciente recebeu alta ou interrompeu o tratamento:'
            : `${events.length} pacientes receberam alta ou interromperam o tratamento:`}
        </p>

        <div className="space-y-3 max-h-80 overflow-y-auto">
          {events.map(ev => (
            <div
              key={ev.id}
              className="p-4 bg-purple-50 border border-purple-100 rounded-2xl space-y-2"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg shrink-0">
                  <UserX size={20} className="text-purple-600" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-priori-navy text-sm truncate">{ev.customer_name}</h4>
                  <p className="text-xs text-zinc-500 flex items-center gap-1">
                    <User size={12} /> Psi. {ev.psychologist_name}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-purple-100">
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(ev.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                {ev.appointments_canceled > 0 && (
                  <span className="font-bold text-purple-600">
                    {ev.appointments_canceled} sessão(ões) cancelada(s)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={handleDismiss}
          className="w-full bg-priori-navy hover:bg-priori-navy/90 text-white h-12 rounded-xl flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={18} /> Entendido
        </Button>

        <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest font-bold">
          Estas notificações não voltarão a aparecer após confirmação.
        </p>
      </div>
    </Modal>
  );
};
