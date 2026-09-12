import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Deno Deploy roda em UTC. new Date().toISOString().split('T')[0] retornaria
// a data de amanhã entre 21h e 23h59 no horário de Brasília, todos os dias.
function toISODateBR(date: Date): string {
  const brDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [day, month, year] = brDate.split("/");
  return `${year}-${month}-${day}`;
}

function getTodayBR(): string {
  return toISODateBR(new Date());
}

// Erros esperados de uso (link expirado, token errado, permissão etc.) não
// são falhas do fluxo de negócio — acontecem o tempo todo em uso normal
// (paciente demora a responder, clica de novo num link antigo). Só erros
// inesperados (DB, exceção não tratada) merecem severidade 'critical' no
// operation_failures e devem acordar alguém.
class ExpectedError extends Error {}

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
        // Busca agendamento específico para o paciente (sem login). Note:
        // apesar do nome do parâmetro (mantido por compatibilidade com o
        // frontend), o valor recebido aqui é o `confirmation_token` do
        // agendamento (aleatório, com expiração) — nunca o ID real — ver
        // 20260912h_appointment_confirmation_token.sql.
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
          .eq('confirmation_token', appointmentId)
          .eq('is_internal', false)
          .gt('confirmation_token_expires_at', new Date().toISOString())
          .single();

        if (appError || !appData) {
          throw new ExpectedError('Link inválido ou expirado.');
        }

        return new Response(JSON.stringify({ success: true, appointment: appData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!token) throw new ExpectedError('Token ou Appointment ID é obrigatório.');

      // Validar token
      const { data: tokenData, error: tokenError } = await supabase
        .from('appointment_tokens')
        .select('*')
        .eq('id', token)
        .single();
      
      if (tokenError || !tokenData) {
        throw new ExpectedError('Token inválido ou não encontrado.');
      }

      // Verificar expiração
      if (new Date(tokenData.expires_at) < new Date()) {
        throw new ExpectedError('Este link de confirmação expirou.');
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
        const today = getTodayBR();
        query = query.lte('date', today).eq('confirmed_psychologist', false).neq('status', 'canceled');
      }

      const { data: appointments, error: appError } = await query.order('date').order('start_time');

      if (appError) throw new Error(appError.message);

      // ── Buscar Pacientes Sem Atendimento Há +60 Dias (Lembrete de Liberação) ──
      let inactivePatients: any[] = [];
      try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const sixtyDaysStr = toISODateBR(sixtyDaysAgo);

        // 1. Buscar todos os pacientes ativos do psicólogo
        const { data: actCustomers, error: actCustErr } = await supabase
          .from('customers')
          .select('id, name, created_at, reminder_dismissed_at, reminder_justification')
          .eq('psychologist_id', tokenData.psychologist_id)
          .eq('status', 'active');

        if (!actCustErr && actCustomers && actCustomers.length > 0) {
          // 2. Buscar agendamentos nos últimos 60 dias ou futuros
          const { data: recApps, error: recAppsErr } = await supabase
            .from('appointments')
            .select('customer_id, date')
            .eq('psychologist_id', tokenData.psychologist_id)
            .gte('date', sixtyDaysStr)
            .neq('status', 'canceled');

          if (!recAppsErr) {
            const activeSet = new Set((recApps || []).map(a => a.customer_id));

            inactivePatients = actCustomers.filter((c: any) => {
              // Já teve agendamento nos últimos 60 dias ou tem futuro
              if (activeSet.has(c.id)) return false;

              // Criado há menos de 60 dias
              const createdAt = new Date(c.created_at);
              if (createdAt > sixtyDaysAgo) return false;

              // Lembrete descartado nos últimos 60 dias
              if (c.reminder_dismissed_at) {
                const dismissedAt = new Date(c.reminder_dismissed_at);
                if (dismissedAt > sixtyDaysAgo) return false;
              }

              return true;
            });
          }
        }
      } catch (err: any) {
        console.error('[confirm-appointment GET] Erro ao buscar inativos:', err.message);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        appointments, 
        inactivePatients,
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
      const { token, action, billing, patientResponse, notes, customerId, subAction, justification } = body;
      let { appointmentId } = body;

      if (action !== 'release_patient' && !appointmentId) {
        throw new ExpectedError('Appointment ID é obrigatório.');
      }

      // CASO A: Resposta do Paciente (WhatsApp)
      if (patientResponse) {
        // `appointmentId`, neste fluxo, é na verdade o `confirmation_token`
        // enviado ao paciente (nunca o ID real) — ver
        // 20260912h_appointment_confirmation_token.sql. Resolve para o ID
        // real só depois de validar que o token existe e não expirou.
        const { data: tokenRow, error: tokenLookupError } = await supabase
          .from('appointments')
          .select('id')
          .eq('confirmation_token', appointmentId)
          .gt('confirmation_token_expires_at', new Date().toISOString())
          .single();

        if (tokenLookupError || !tokenRow) {
          throw new ExpectedError('Link inválido ou expirado.');
        }
        appointmentId = tokenRow.id;

        // Verificar se o agendamento já está cancelado (ex: paciente já recusou antes)
        const { data: currentApp, error: currentAppError } = await supabase
          .from('appointments')
          .select('id, status, confirmation_status')
          .eq('id', appointmentId)
          .single();

        if (currentAppError || !currentApp) {
          throw new ExpectedError('Agendamento não encontrado.');
        }

        // Se o psicólogo já cancelou, não permitir que o paciente reabra
        if (currentApp.status === 'canceled' && patientResponse === 'confirmed') {
          throw new ExpectedError('Este agendamento já foi cancelado e não pode ser reaberto pelo paciente.');
        }

        const { data: updatedApp, error: updateError } = await supabase
          .from('appointments')
          .update({
            confirmation_status: patientResponse,
            patient_notes: notes || null,
            confirmed_patient: patientResponse === 'confirmed',
            status: patientResponse === 'declined' ? 'canceled' : undefined,
            cancellation_billing: patientResponse === 'declined' ? null : undefined
          })
          .eq('id', appointmentId)
          .select()
          .single();

        if (updateError) throw new Error(updateError.message);

        // ── Notificar o psicólogo via WhatsApp (Z-API) ──────────────────────
        try {
          // 1. Buscar dados completos do agendamento (paciente + psicólogo)
          const { data: appFull } = await supabase
            .from('appointments')
            .select(`
              date,
              start_time,
              customer:customers (name),
              psychologist:psychologists (name, phone)
            `)
            .eq('id', appointmentId)
            .single();

          // 2. Buscar configurações da Z-API
          const { data: settings } = await supabase
            .from('settings')
            .select('zapi_url, zapi_token')
            .single();

          if (appFull && settings?.zapi_url) {
            const customer = Array.isArray(appFull.customer) ? appFull.customer[0] : appFull.customer;
            const psychologist = Array.isArray(appFull.psychologist) ? appFull.psychologist[0] : appFull.psychologist;

            if (psychologist?.phone) {
              // Formatar data
              const [year, month, day] = appFull.date.split('-').map(Number);
              const formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;

              // Montar mensagem
              let message = '';
              if (patientResponse === 'confirmed') {
                message = `✅ *Confirmação de Consulta*\n\nOlá *${psychologist.name}*, o(a) paciente *${customer?.name || 'Paciente'}* *confirmou* a presença na consulta do dia *${formattedDate}* às *${appFull.start_time}*.`;
              } else {
                const motivo = notes ? `\n\n📝 *Motivo informado:* ${notes}` : '';
                message = `❌ *Cancelamento de Consulta*\n\nOlá *${psychologist.name}*, o(a) paciente *${customer?.name || 'Paciente'}* informou que *não poderá comparecer* à consulta do dia *${formattedDate}* às *${appFull.start_time}*.${motivo}`;
              }

              // Formatar telefone
              let psychPhone = psychologist.phone.replace(/\D/g, '');
              if (!psychPhone.startsWith('55')) {
                psychPhone = '55' + psychPhone;
              }

              // Montar headers Z-API
              const zapiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
              const instanceIdMatch = settings.zapi_url.match(/instances\/([^\/]+)/);
              const instanceId = instanceIdMatch ? instanceIdMatch[1] : null;
              if (settings.zapi_token && settings.zapi_token !== instanceId) {
                zapiHeaders['Client-Token'] = settings.zapi_token;
              }

              // Enviar mensagem
              await fetch(`${settings.zapi_url}/send-text`, {
                method: 'POST',
                headers: zapiHeaders,
                body: JSON.stringify({ phone: psychPhone, message })
              });

              console.log(`[ConfirmAppointment] Notificação WhatsApp enviada ao psicólogo (appointment ${appointmentId}) — status: ${patientResponse}`);
            }
          }
        } catch (notifyErr: any) {
          // Não falhar a requisição principal por erro na notificação
          console.error(`[ConfirmAppointment] Erro ao notificar psicólogo: ${notifyErr.message}`);
        }
        // ────────────────────────────────────────────────────────────────────

        return new Response(JSON.stringify({ success: true, updated: updatedApp }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // CASO B: Resposta do Psicólogo (via Token de E-mail)
      if (!token || !action) {
        throw new ExpectedError('Token e Ação são obrigatórios para confirmação de profissional.');
      }

      // 1. Validar token
      const { data: tokenData, error: tokenError } = await supabase
        .from('appointment_tokens')
        .select('*')
        .eq('id', token)
        .single();
      
      if (tokenError || !tokenData) throw new ExpectedError('Token inválido.');
      if (new Date(tokenData.expires_at) < new Date()) throw new ExpectedError('Token expirado.');

      // 1.1 Action Release Patient
      if (action === 'release_patient') {
        if (!customerId || !subAction) {
          throw new ExpectedError('Customer ID e subAction são obrigatórios.');
        }

        // Verificar se o paciente pertence a este psicólogo
        const { data: customerCheck, error: custErr } = await supabase
          .from('customers')
          .select('id, psychologist_id')
          .eq('id', customerId)
          .single();

        if (custErr || !customerCheck) throw new ExpectedError('Paciente não encontrado.');
        if (customerCheck.psychologist_id !== tokenData.psychologist_id) {
          throw new ExpectedError('Você não tem permissão para atualizar este paciente.');
        }

        if (subAction === 'alta') {
          await supabase
            .from('customers')
            .update({ status: 'inactive', inactivation_reason: 'Liberação / Alta por psicólogo' })
            .eq('id', customerId);

          // Cancel future appointments
          await supabase
            .from('appointments')
            .update({ status: 'canceled', cancellation_billing: 'none' })
            .eq('customer_id', customerId)
            .gte('date', getTodayBR())
            .in('status', ['active', 'released']);

          // Pause subscriptions
          await supabase
            .from('subscriptions')
            .update({ status: 'inactive' })
            .eq('customer_id', customerId)
            .eq('status', 'active');
            
        } else if (subAction === 'pausa') {
          await supabase
            .from('customers')
            .update({ status: 'inactive', inactivation_reason: 'Pausa no Tratamento' })
            .eq('id', customerId);

          // Cancel future appointments
          await supabase
            .from('appointments')
            .update({ status: 'canceled', cancellation_billing: 'none' })
            .eq('customer_id', customerId)
            .gte('date', getTodayBR())
            .in('status', ['active', 'released']);

          // Pause subscriptions
          await supabase
            .from('subscriptions')
            .update({ status: 'inactive' })
            .eq('customer_id', customerId)
            .eq('status', 'active');

        } else if (subAction === 'keep_active') {
          await supabase
            .from('customers')
            .update({ 
              reminder_dismissed_at: new Date().toISOString(),
              reminder_justification: justification || 'Tratamento em andamento'
            })
            .eq('id', customerId);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Validar se o agendamento pertence a esse psicólogo
      // Removida a trava de data específica no POST para evitar erros de fuso horário,
      // confiando que o token já identifica o psicólogo corretamente.
      const { data: appData, error: appCheckError } = await supabase
        .from('appointments')
        .select('id, psychologist_id')
        .eq('id', appointmentId)
        .single();

      if (appCheckError || !appData) {
        throw new ExpectedError('Agendamento não encontrado.');
      }

      if (appData.psychologist_id !== tokenData.psychologist_id) {
        throw new ExpectedError('Você não tem permissão para confirmar este agendamento.');
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
          status: 'active',
          cancellation_billing: null
        };
      } else if (action === 'discharge') {
        // ── Alta / Interrupção de Tratamento ──────────────────────────────
        // 1. Buscar dados completos do agendamento (customer_id)
        const { data: fullApp, error: fullAppErr } = await supabase
          .from('appointments')
          .select(`
            id, customer_id, psychologist_id,
            customer:customers (name),
            psychologist:psychologists (name)
          `)
          .eq('id', appointmentId)
          .single();

        if (fullAppErr || !fullApp) throw new ExpectedError('Agendamento não encontrado para alta.');

        // 2. Cancelar o agendamento atual
        const { error: cancelErr } = await supabase
          .from('appointments')
          .update({ status: 'canceled', cancellation_billing: 'none', confirmed_psychologist: false })
          .eq('id', appointmentId);

        if (cancelErr) throw new Error(cancelErr.message);

        // 3. Cancelar todos os agendamentos futuros do mesmo paciente+psicólogo
        const today = getTodayBR();
        const { data: futureApps, error: futureErr } = await supabase
          .from('appointments')
          .select('id')
          .eq('customer_id', fullApp.customer_id)
          .eq('psychologist_id', fullApp.psychologist_id)
          .gte('date', today)
          .neq('id', appointmentId)
          .in('status', ['active', 'released']);

        if (futureErr) throw new Error(futureErr.message);

        const futureIds = (futureApps || []).map((a: any) => a.id);
        if (futureIds.length > 0) {
          const { error: batchErr } = await supabase
            .from('appointments')
            .update({ status: 'canceled', cancellation_billing: 'none' })
            .in('id', futureIds);
          if (batchErr) throw new Error(batchErr.message);
        }

        // 4. Registrar evento de alta na tabela discharge_events
        const customerObj = Array.isArray(fullApp.customer) ? fullApp.customer[0] : fullApp.customer;
        const psychObj = Array.isArray(fullApp.psychologist) ? fullApp.psychologist[0] : fullApp.psychologist;

        await supabase.from('discharge_events').insert({
          customer_id: fullApp.customer_id,
          psychologist_id: fullApp.psychologist_id,
          customer_name: customerObj?.name || 'Paciente',
          psychologist_name: psychObj?.name || 'Psicólogo',
          appointments_canceled: futureIds.length,
        });

        console.log(`[ConfirmAppointment] Alta registrada: customer ${fullApp.customer_id}, psychologist ${fullApp.psychologist_id}, ${futureIds.length} agendamentos futuros cancelados`);

        return new Response(JSON.stringify({ success: true, canceledCount: futureIds.length }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        // ──────────────────────────────────────────────────────────────────
      }

      // 4. Executar atualização (confirm, cancel, pendency)
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

    throw new ExpectedError('Método não suportado');

  } catch (err: any) {
    console.error(`[ConfirmAppointment] Erro: ${err.message}`);
    try {
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
      await supabase.rpc('log_operation_failure', {
        p_context: 'confirm-appointment',
        p_message: `Erro ao processar confirmação de atendimento: ${err.message}`,
        // ExpectedError = uso normal (link expirado, permissão, etc.), não
        // falha do sistema — não deve gerar alerta crítico.
        p_severity: err instanceof ExpectedError ? 'warn' : 'critical'
      });
    } catch (dbErr) {
      console.error("Falha ao registrar log no banco:", dbErr);
    }
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
