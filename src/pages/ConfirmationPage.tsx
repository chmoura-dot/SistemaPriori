import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle, MessageCircle } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { Appointment, Customer, Psychologist } from '../services/types';
import { Button } from '../components/Button';
import { cn } from '../lib/utils';

export const ConfirmationPage = () => {
  // Extração do ID via Query Param, Hash ou Path (suporte a todos os formatos)
  const getAppointmentId = () => {
    // 1. Tentar via Query Param (?confirmacao=ID)
    const params = new URLSearchParams(window.location.search);
    if (params.get('confirmacao')) return params.get('confirmacao');

    // 2. Tentar via Hash (#/confirmacao/ID)
    if (window.location.hash.includes('/confirmacao/')) {
      return window.location.hash.split('/confirmacao/').pop()?.split('?')[0];
    }

    // 3. Tentar via Path (/confirmacao/ID)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length > 1) return pathParts[pathParts.length - 1];

    return null;
  };

  const id = getAppointmentId();
  
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [psychologist, setPsychologist] = useState<Psychologist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'pending' | 'success' | 'error' | 'already_processed'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        // Chamada para a Edge Function que permite acesso sem login via ID
        const response = await fetch(`https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/confirm-appointment?appointmentId=${id}`);
        
        let data;
        try {
          data = await response.json();
        } catch (e) {
          throw new Error('A API retornou uma resposta inválida.');
        }

        if (!response.ok || !data.appointment) {
          setErrorMessage(data.error || `Erro da API (${response.status}): Agendamento não encontrado.`);
          setStatus('error');
          setIsLoading(false);
          return;
        }

        const app = data.appointment;

        if (app.confirmation_status !== 'pending') {
          setStatus('already_processed');
        }

        // Mapear snake_case da função para camelCase do componente
        setAppointment({
          ...app,
          confirmationStatus: app.confirmation_status,
          psychologistId: app.psychologist?.id,
          customerId: app.customer?.id,
          startTime: app.start_time
        });

        setCustomer(app.customer);
        setPsychologist(app.psychologist);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        setStatus('error');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id]);

  const handleResponse = async (response: 'confirmed' | 'declined') => {
    if (!id || !appointment || !psychologist) return;
    setIsSubmitting(true);
    try {
      // Enviar resposta via Edge Function (evita problemas de RLS)
      const res = await fetch('https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/confirm-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: id,
          patientResponse: response,
          notes: notes || undefined
        })
      });

      if (!res.ok) throw new Error('Falha ao salvar resposta');

      if (response === 'declined') {
        const message = `Olá ${psychologist.name}, o paciente ${customer?.name} informou que não poderá comparecer à consulta de ${new Date(appointment.date + 'T12:00:00').toLocaleDateString()} às ${appointment.startTime}. Motivo: ${notes || 'Não informado'}.`;
        const phone = psychologist.phone.replace(/\D/g, '');
        const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
      }

      setStatus('success');
    } catch (error) {
      console.error('Erro ao salvar resposta:', error);
      alert('Ocorreu um erro ao processar sua resposta. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-priori-navy border-t-transparent" />
      </div>
    );
  }

  if (status === 'error' || !appointment) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-zinc-100 max-w-md w-full">
          <AlertCircle size={64} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-priori-navy mb-2">Ops! Link Inválido</h1>
          <p className="text-zinc-500 mb-6">{errorMessage || 'Não conseguimos encontrar este agendamento. Por favor, entre em contato com a clínica.'}</p>
          <Button onClick={() => window.location.href = 'https://nucleopriori.com.br'} className="w-full bg-priori-navy text-white">
            Voltar para o Site
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'already_processed') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-zinc-100 max-w-md w-full">
          <CheckCircle2 size={64} className="text-priori-gold mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-priori-navy mb-2">Já Recebemos sua Resposta!</h1>
          <p className="text-zinc-500 mb-6">Este agendamento já foi processado anteriormente. Obrigado!</p>
          <Button onClick={() => window.location.href = 'https://nucleopriori.com.br'} className="w-full bg-priori-navy text-white">
            Voltar para o Site
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-zinc-100 max-w-md w-full animate-in fade-in zoom-in duration-300">
          <CheckCircle2 size={64} className="text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-priori-navy mb-2">Resposta Enviada!</h1>
          <p className="text-zinc-500 mb-6">Muito obrigado por nos informar. Sua resposta foi registrada com sucesso.</p>
          <Button onClick={() => window.location.href = 'https://nucleopriori.com.br'} className="w-full bg-priori-navy text-white">
            Finalizar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-zinc-100 max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-priori-navy/5 rounded-2xl">
            <Clock size={32} className="text-priori-navy" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-priori-navy text-center mb-2">Confirmação de Consulta</h1>
        <p className="text-zinc-500 text-center mb-8">
          Olá <span className="font-bold text-priori-navy">{customer?.name}</span>, você confirma sua presença para a consulta abaixo?
        </p>

        <div className="bg-zinc-50 rounded-2xl p-6 mb-8 border border-zinc-100 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Clock size={16} className="text-priori-navy" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Data e Hora</p>
              <p className="text-sm font-bold text-priori-navy">
                {new Date(appointment.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {appointment.startTime}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <MessageCircle size={16} className="text-priori-navy" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Psicólogo(a)</p>
              <p className="text-sm font-bold text-priori-navy">{psychologist?.name}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Button 
            onClick={() => handleResponse('confirmed')}
            className="w-full py-6 text-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
            isLoading={isSubmitting}
          >
            <CheckCircle2 size={24} className="mr-2" />
            Sim, eu irei!
          </Button>

          <div className="pt-4 border-t border-zinc-100">
            <p className="text-center text-xs text-zinc-400 mb-4 uppercase font-bold tracking-widest">Não poderá comparecer?</p>
            
            <textarea
              className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 text-sm text-priori-navy focus:outline-none focus:ring-2 focus:ring-priori-navy/5 mb-3"
              placeholder="Gostaria de nos dizer o motivo ou deixar um recado? (Opcional)"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <button 
              onClick={() => handleResponse('declined')}
              disabled={isSubmitting}
              className="w-full py-3 flex items-center justify-center gap-2 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-all"
            >
              <XCircle size={18} />
              Infelizmente não poderei ir
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] text-zinc-400 uppercase font-bold tracking-[0.2em]">
          Núcleo Priori • Bem-estar e Saúde
        </p>
      </div>
    </div>
  );
};
