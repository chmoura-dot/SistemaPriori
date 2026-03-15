import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://nucleopriori.com.br";

const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Horário atual (Brasília) para pegar a data de hoje
    const today = new Date();
    today.setHours(today.getHours() - 3);
    const todayStr = today.toISOString().split('T')[0];
    const displayDate = todayStr.split('-').reverse().join('/');

    // 2. Buscar psicólogos ativos com e-mail configurado
    const { data: psychologists, error: psychError } = await supabase
      .from('psychologists')
      .select('id, name, email')
      .eq('active', true)
      .neq('email', '');

    if (psychError) throw psychError;

    const results = [];

    // 3. Para cada psicólogo, buscar consultas de hoje que NÃO estão canceladas
    for (const psy of (psychologists || [])) {
      if (!psy.email || psy.email.trim() === '') continue;

      const { data: appointments, error: appError } = await supabase
        .from('appointments')
        .select(`
          id,
          start_time,
          end_time,
          mode,
          type,
          status,
          confirmed_psychologist,
          customer:customers (name, health_plan),
          room:rooms (name)
        `)
        .eq('psychologist_id', psy.id)
        .eq('date', todayStr)
        .neq('status', 'canceled') // Ignora os cancelados
        .order('start_time');

      if (appError) {
        results.push({ psychologist: psy.name, status: "error", error: appError.message });
        continue;
      }

      // Filtrar APENAS os que ainda não foram confirmados pelo profissional
      const pendingAppointments = appointments?.filter(app => app.confirmed_psychologist === false) || [];

      // Se não houver pendências para confirmar, não envia e-mail para não gerar SPAM
      if (pendingAppointments.length === 0) {
        results.push({ psychologist: psy.name, status: "no_pending_confirmations" });
        continue;
      }

      // 4. Gerar Token de Confirmação
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48); // Link válido por 48h

      const { data: tokenRecord, error: tokenError } = await supabase
        .from('appointment_tokens')
        .insert({
          psychologist_id: psy.id,
          date: todayStr,
          expires_at: expiresAt.toISOString()
        })
        .select()
        .single();
      
      if (tokenError) {
        results.push({ psychologist: psy.name, status: "token_error", error: tokenError.message });
        continue;
      }

      const magicLink = `${SITE_URL}/confirmacao?token=${tokenRecord.id}`;

      // 5. Montar a Tabela HTML para as pendências
      let emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a365d;">Confirmação de Atendimentos: ${displayDate}</h2>
          <p>Olá, <strong>${psy.name}</strong>!</p>
          <p>Você realizou sessões hoje e notamos que <strong>${pendingAppointments.length}</strong> delas ainda não tiveram a presença confirmada no Sistema Priori.</p>
          <p>Por favor, use o botão abaixo para confirmar as presenças ou eventuais faltas (não é necessário login):.</p>
          
          <div style="margin: 25px 0; text-align: center;">
            <a href="${magicLink}" style="background-color: #9d174d; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Confirmar Minha Agenda</a>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
            <thead style="background-color: #fce7f3; text-align: left;">
              <tr>
                <th style="padding: 10px; border-bottom: 2px solid #fbcfe8; color: #9d174d;">Horário</th>
                <th style="padding: 10px; border-bottom: 2px solid #fbcfe8; color: #9d174d;">Paciente</th>
                <th style="padding: 10px; border-bottom: 2px solid #fbcfe8; color: #9d174d;">Modo/Local</th>
              </tr>
            </thead>
            <tbody>
      `;

      pendingAppointments.forEach((app, index) => {
        const customerObj = Array.isArray(app.customer) ? app.customer[0] : app.customer;
        const roomObj = Array.isArray(app.room) ? app.room[0] : app.room;
        
        const patientName = customerObj?.name || "Paciente sem nome";
        const patientPlan = customerObj?.health_plan && customerObj?.health_plan !== 'PARTICULAR' 
          ? `<br><small style="color: #666;">(${customerObj.health_plan} - ${app.type})</small>` 
          : `<br><small style="color: #666;">(Particular - ${app.type})</small>`;
          
        const modeAndRoom = app.mode === 'Presencial' 
          ? `Presencial<br><small style="color: #666;">${roomObj?.name || "Sem sala"}</small>`
          : `On-line`;

        const bgColor = index % 2 === 0 ? '#ffffff' : '#fff5f7';

        emailHtml += `
          <tr style="background-color: ${bgColor};">
            <td style="padding: 12px 10px; border-bottom: 1px solid #fbcfe8; white-space: nowrap;">
              <strong>${app.start_time}</strong> às ${app.end_time}
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #fbcfe8;">
              <strong>${patientName}</strong>${patientPlan}
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #fbcfe8;">
              ${modeAndRoom}
            </td>
          </tr>
        `;
      });

      emailHtml += `
            </tbody>
          </table>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
            <p>Sistema Priori &copy; ${new Date().getFullYear()}</p>
            <p>Este link é seguro e exclusivo para você. Validade: 48 horas.</p>
          </div>
        </div>
      `;

      // 6. Enviar o e-mail via Resend
      try {
        const mailResponse = await resend.emails.send({
          from: "Núcleo Priori <agenda@nucleopriori.com.br>",
          to: psy.email,
          subject: `Ação Necessária: Confirmações Pendentes de Hoje (${displayDate})`,
          html: emailHtml,
        });

        results.push({ psychologist: psy.name, status: "sent", id: mailResponse.data?.id });
      } catch (sendError) {
        results.push({ psychologist: psy.name, status: "mail_error", error: sendError.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
