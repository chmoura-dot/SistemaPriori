import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const url = new URL(req.url);
    
    // ==========================================
    // GET: Recarrega as consultas do token OU pelo ID (para paciente)
    // ==========================================
    if (req.method === 'GET') {
      const token = url.searchParams.get('token');
      const appointmentId = url.searchParams.get('appointmentId');

      if (appointmentId) {
        // Busca agendamento específico para o paciente (sem login)
        const { data: appData, error: appError } = await supabase
          .from('appointments')
          .select(`
            id,
            date,
            start_time,
            end_time,
            mode,
            type,
            status,
            confirmation_status,
            customer:customers (id, name, health_plan, phone),
            psychologist:psychologists (id, name, phone),
            room:rooms (id, name)
          `)
          .eq('id', appointmentId)
          .single();

        if (appError || !appData) {
          throw new Error('Agendamento não encontrado.');
        }

        return new Response(JSON.stringify({ success: true, appointment: appData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!token) throw new Error('Token ou Appointment ID é obrigatório.');

      // Validar token
      const { data: tokenData, error: tokenError } = await supabase
        .from('appointment_tokens')
        .select('*')
        .eq('id', token)
        .single();
      
      if (tokenError || !tokenData) {
        throw new Error('Token inválido ou não encontrado.');
      }

      // Verificar expiração
      if (new Date(tokenData.expires_at) < new Date()) {
        throw new Error('Este link de confirmação expirou.');
      }

      // Buscar agendamentos. 
      // Se o token tiver data, buscamos daquele dia. 
      // Se não tiver (Nag link), buscamos TODOS os pendentes até hoje.
      let query = supabase
        .from('appointments')
        .select(`
          id,
          date,
          start_time,
          end_time,
          mode,
          type,
          status,
          confirmation_status,
          confirmed_psychologist,
          customer:customers (name, health_plan),
          room:rooms (name)
        `)
        .eq('psychologist_id', tokenData.psychologist_id);

      if (tokenData.date) {
        query = query.eq('date', tokenData.date);
      } else {
        // Para links de resumo (Nag), buscamos apenas os NÃO confirmados e NÃO cancelados de qualquer data anterior ou hoje
        const today = new Date().toISOString().split('T')[0];
        query = query.lte('date', today).eq('confirmed_psychologist', false).neq('status', 'canceled');
      }

      const { data: appointments, error: appError } = await query.order('date').order('start_time');

      if (appError) throw new Error(appError.message);

      return new Response(JSON.stringify({ 
        success: true, 
        appointments, 
        date: tokenData.date,
        isNag: !tokenData.date 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==========================================
    // POST: Realiza a confirmação/falta
    // ==========================================
    if (req.method === 'POST') {
      const body = await req.json();
      const { token, appointmentId, action, billing, patientResponse, notes } = body; 

      if (!appointmentId) {
        throw new Error('Appointment ID é obrigatório.');
      }

      // CASO A: Resposta do Paciente (WhatsApp)
      if (patientResponse) {
        const { data: updatedApp, error: updateError } = await supabase
          .from('appointments')
          .update({
            confirmation_status: patientResponse,
            patient_notes: notes || null,
            confirmed_patient: patientResponse === 'confirmed'
          })
          .eq('id', appointmentId)
          .select()
          .single();

        if (updateError) throw new Error(updateError.message);

        return new Response(JSON.stringify({ success: true, updated: updatedApp }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // CASO B: Resposta do Psicólogo (via Token de E-mail)
      if (!token || !action) {
        throw new Error('Token e Ação são obrigatórios para confirmação de profissional.');
      }

      // 1. Validar token
      const { data: tokenData, error: tokenError } = await supabase
        .from('appointment_tokens')
        .select('*')
        .eq('id', token)
        .single();
      
      if (tokenError || !tokenData) throw new Error('Token inválido.');
      if (new Date(tokenData.expires_at) < new Date()) throw new Error('Token expirado.');

      // 2. Validar se o agendamento pertence a esse psicólogo
      // Removida a trava de data específica no POST para evitar erros de fuso horário,
      // confiando que o token já identifica o psicólogo corretamente.
      const { data: appData, error: appCheckError } = await supabase
        .from('appointments')
        .select('id, psychologist_id')
        .eq('id', appointmentId)
        .single();

      if (appCheckError || !appData) {
        throw new Error('Agendamento não encontrado.');
      }

      if (appData.psychologist_id !== tokenData.psychologist_id) {
        throw new Error('Você não tem permissão para confirmar este agendamento.');
      }

      // 3. Preparar atualizações
      let updates: any = {};

      if (action === 'confirm') {
        updates = {
          confirmed_psychologist: true,
          status: 'active'
        };
      } else if (action === 'cancel') {
        updates = {
          confirmed_psychologist: false,
          status: 'canceled',
          cancellation_billing: billing || 'none'
        };
      } else if (action === 'pendency') {
        updates = {
          confirmed_psychologist: false,
          status: 'active'
        };
      }

      // 4. Executar atualização
      const { data: updatedApp, error: updateError } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', appointmentId)
        .select()
        .single();

      if (updateError) throw new Error(updateError.message);

      console.log(`[ConfirmAppointment] Sucesso: App ${appointmentId} atualizado para ${action} por Psy ${tokenData.psychologist_id}`);

      return new Response(JSON.stringify({ success: true, updated: updatedApp }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Método não suportado');

  } catch (err: any) {
    console.error(`[ConfirmAppointment] Erro: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
