import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Calcular a data de hoje para buscar a agenda (Horário de Brasília)
    const today = new Date();
    today.setHours(today.getHours() - 3);
    const todayStr = today.toISOString().split('T')[0];
    const displayDate = todayStr.split('-').reverse().join('/');

    // 2. Buscar psicólogos ativos que têm e-mail configurado
    const { data: psychologists, error: psychError } = await supabase
      .from('psychologists')
      .select('id, name, email')
      .eq('active', true)
      .neq('email', '');

    if (psychError) throw psychError;

    const results = [];

    // 3. Para cada psicólogo, buscar a sua agenda de hoje
    for (const psy of (psychologists || [])) {
      if (!psy.email || psy.email.trim() === '') continue;

      const { data: appointments, error: appError } = await supabase
        .from('appointments')
        .select(`
          start_time,
          end_time,
          mode,
          type,
          customer:customers (name, health_plan),
          room:rooms (name)
        `)
        .eq('psychologist_id', psy.id)
        .eq('date', todayStr)
        .eq('status', 'active')
        .order('start_time');

      if (appError) {
        results.push({ psychologist: psy.name, status: "error", error: appError.message });
        continue;
      }

      if (!appointments || appointments.length === 0) {
        results.push({ psychologist: psy.name, status: "no_appointments" });
        continue;
      }

      // 4. Montar a Tabela HTML para o corpo do E-mail
      let emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a365d;">Sua Agenda do Dia: ${displayDate}</h2>
          <p>Olá, <strong>${psy.name}</strong>!</p>
          <p>Você possui <strong>${appointments.length}</strong> sessão(ões) agendada(s) para hoje no Núcleo Priori. Confira os detalhes abaixo:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
            <thead style="background-color: #f3f4f6; text-align: left;">
              <tr>
                <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Horário</th>
                <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Paciente</th>
                <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Modo/Local</th>
              </tr>
            </thead>
            <tbody>
      `;

      appointments.forEach((app, index) => {
        const customerObj = Array.isArray(app.customer) ? app.customer[0] : app.customer;
        const roomObj = Array.isArray(app.room) ? app.room[0] : app.room;
        
        const patientName = customerObj?.name || "Paciente sem nome";
        const patientPlan = customerObj?.health_plan && customerObj?.health_plan !== 'PARTICULAR' 
          ? `<br><small style="color: #666;">(${customerObj.health_plan} - ${app.type})</small>` 
          : `<br><small style="color: #666;">(Particular - ${app.type})</small>`;
          
        const modeAndRoom = app.mode === 'Presencial' 
          ? `Presencial<br><small style="color: #666;">${roomObj?.name || "Sem sala"}</small>`
          : `On-line`;

        const bgColor = index % 2 === 0 ? '#ffffff' : '#f9fafb';

        emailHtml += `
          <tr style="background-color: ${bgColor};">
            <td style="padding: 12px 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">
              <strong>${app.start_time}</strong> às ${app.end_time}
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e5e7eb;">
              <strong>${patientName}</strong>${patientPlan}
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e5e7eb;">
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
            <p>Se tiver dúvidas, verifique o painel do sistema.</p>
          </div>
        </div>
      `;

      // 5. Enviar o e-mail via Resend
      try {
        const mailResponse = await resend.emails.send({
          from: "Núcleo Priori <agenda@nucleopriori.com.br>",
          to: psy.email,
          subject: `Sua Agenda de Hoje (${displayDate}) - Núcleo Priori`,
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
