import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SITE_URL = "https://sistema-priori.vercel.app";

const resend = new Resend(RESEND_API_KEY);

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

    const body = await req.json();
    const { psychologist_id } = body;

    if (!psychologist_id) {
      return new Response(JSON.stringify({ error: 'psychologist_id é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Buscar dados do psicólogo
    const { data: psy, error: psyError } = await supabase
      .from('psychologists')
      .select('id, name, email')
      .eq('id', psychologist_id)
      .single();

    if (psyError || !psy) {
      return new Response(JSON.stringify({ error: 'Psicólogo não encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!psy.email) {
      return new Response(JSON.stringify({ error: 'Psicólogo sem e-mail cadastrado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Buscar atendimentos pendentes de confirmação (qualquer data passada)
    const today = new Date().toISOString().split('T')[0];

    const { data: staleAppointments, error: appError } = await supabase
      .from('appointments')
      .select('id, date, start_time, end_time, mode, type, customer:customers (name, health_plan), room:rooms (name)')
      .eq('psychologist_id', psychologist_id)
      .lte('date', today)
      .eq('confirmed_psychologist', false)
      .neq('status', 'canceled')
      .eq('is_internal', false)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (appError) throw appError;

    const count = staleAppointments?.length || 0;

    if (count === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Nenhuma pendência encontrada para este psicólogo.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Gerar novo token (sem data específica = nag link) válido por 10 dias
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 240);

    const { data: tokenRecord, error: tokenError } = await supabase
      .from('appointment_tokens')
      .insert({
        psychologist_id: psy.id,
        date: null,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (tokenError) throw tokenError;

    const magicLink = `${SITE_URL}/#/confirmacao?token=${tokenRecord.id}`;

    // 4. Calcular período das pendências
    const dates = (staleAppointments || []).map((a: any) => a.date).sort();
    const firstDate = dates[0]?.split('-').reverse().join('/') || '';
    const lastDate = dates[dates.length - 1]?.split('-').reverse().join('/') || '';
    const dateSummary = dates.length > 1 ? `${firstDate} até ${lastDate}` : firstDate;

    // 5. Montar tabela de pendências no e-mail
    let appointmentsRows = '';
    (staleAppointments || []).forEach((app: any, index: number) => {
      const customerObj = Array.isArray(app.customer) ? app.customer[0] : app.customer;
      const roomObj = Array.isArray(app.room) ? app.room[0] : app.room;
      const patientName = customerObj?.name || 'Paciente sem nome';
      const plan = customerObj?.health_plan && customerObj?.health_plan !== 'PARTICULAR'
        ? `${customerObj.health_plan} - ${app.type}`
        : `Particular - ${app.type}`;
      const modeAndRoom = app.mode === 'Presencial'
        ? `Presencial (${roomObj?.name || 'Sem sala'})`
        : 'On-line';
      const dateDisplay = app.date?.split('-').reverse().join('/');
      const bgColor = index % 2 === 0 ? '#ffffff' : '#fff5f7';

      appointmentsRows += `
        <tr style="background-color: ${bgColor};">
          <td style="padding: 10px; border-bottom: 1px solid #fbcfe8; white-space: nowrap; font-size: 13px;">
            <strong>${dateDisplay}</strong><br><small>${app.start_time} às ${app.end_time}</small>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #fbcfe8; font-size: 13px;">
            <strong>${patientName}</strong><br><small style="color:#666;">${plan}</small>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #fbcfe8; font-size: 13px;">${modeAndRoom}</td>
        </tr>
      `;
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #9d174d; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">⚠️ Pendências de Confirmação</h2>
        </div>
        <div style="padding: 30px;">
          <p>Olá, <strong>${psy.name}</strong>!</p>
          <p>A coordenação do Núcleo Priori identificou que você possui <strong>${count} atendimentos pendentes</strong> de confirmação, referentes ao período de <strong>${dateSummary}</strong>.</p>
          <p>Por favor, use o botão abaixo para regularizar sua agenda (não é necessário login):</p>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${magicLink}" style="background-color: #1e293b; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
              Regularizar Minha Agenda
            </a>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead style="background-color: #fce7f3; text-align: left;">
              <tr>
                <th style="padding: 10px; border-bottom: 2px solid #fbcfe8; color: #9d174d; font-size: 12px;">Data / Horário</th>
                <th style="padding: 10px; border-bottom: 2px solid #fbcfe8; color: #9d174d; font-size: 12px;">Paciente</th>
                <th style="padding: 10px; border-bottom: 2px solid #fbcfe8; color: #9d174d; font-size: 12px;">Modo</th>
              </tr>
            </thead>
            <tbody>
              ${appointmentsRows}
            </tbody>
          </table>

          <p style="font-size: 13px; color: #666; background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <strong>Importante:</strong> Este link é exclusivo para você e tem validade de 10 dias. Após confirmar todos os atendimentos, não receberá mais lembretes sobre estes registros.
          </p>
        </div>
        <div style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          <p>Sistema Priori &copy; ${new Date().getFullYear()} — Lembrete enviado pela coordenação.</p>
        </div>
      </div>
    `;

    // 6. Enviar e-mail
    const mailResponse = await resend.emails.send({
      from: "Núcleo Priori <agenda@nucleopriori.com.br>",
      to: psy.email,
      subject: `Ação Necessária: ${count} atendimento(s) pendente(s) de confirmação (${dateSummary})`,
      html: emailHtml,
    });

    return new Response(JSON.stringify({
      success: true,
      psychologist: psy.name,
      email: psy.email,
      pending_count: count,
      email_id: mailResponse.data?.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[ResendConfirmation] Erro:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
