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
    // Usamos Intl para garantir o fuso correto de SP independente do servidor
    const brDateStr = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    
    const [day, month, year] = brDateStr.split('/');
    const todayStr = `${year}-${month}-${day}`;
    const displayDate = brDateStr;

    console.log(`[ClinicSummary] Processando resumo para: ${todayStr} (Data local BR)`);

    // 2. Buscar todos os agendamentos ativos de hoje, incluindo dados de clientes, psicólogos e salas
    const { data: appointments, error: appError } = await supabase
      .from('appointments')
      .select(`
        start_time,
        end_time,
        mode,
        type,
        customer:customers (name, health_plan),
        psychologist:psychologists (name),
        room:rooms (name),
        is_internal,
        internal_type,
        internal_title
      `)
      .eq('date', todayStr)
      .eq('status', 'active')
      //.eq('is_internal', false) // Removido para incluir internos
      .order('start_time');

    if (appError) throw appError;

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Nenhum agendamento para hoje." }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Agrupar agendamentos por psicólogo
    const groupedByPsychologist: Record<string, any[]> = {};
    
      appointments.forEach(app => {
        const psyName = app.psychologist?.name || "Profissional não identificado";
        if (!groupedByPsychologist[psyName]) {
          groupedByPsychologist[psyName] = [];
        }
        groupedByPsychologist[psyName].push(app);
      });

    // 4. Montar o HTML do E-mail
    let emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 700px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #1a365d; padding: 25px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px; text-transform: uppercase;">Agenda Geral da Clínica</h1>
          <p style="color: #d4af37; margin: 5px 0 0 0; font-weight: bold; font-size: 16px;">${displayDate}</p>
        </div>
        
        <div style="padding: 20px; background-color: #ffffff;">
          <p style="font-size: 15px;">Olá, Coordenador(a)! Segue o resumo completo dos atendimentos agendados para hoje na <strong>Núcleo Priori</strong>:</p>
    `;

    // Iterar sobre cada psicólogo e seus atendimentos
    for (const [psyName, apps] of Object.entries(groupedByPsychologist)) {
      emailHtml += `
        <div style="margin-top: 30px; margin-bottom: 10px; border-bottom: 2px solid #d4af37; padding-bottom: 5px;">
          <h2 style="color: #1a365d; font-size: 16px; margin: 0; text-transform: uppercase;">Psicólogo(a): ${psyName}</h2>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
          <thead>
            <tr style="background-color: #f8fafc; text-align: left;">
              <th style="padding: 10px; border: 1px solid #e2e8f0; width: 120px;">Horário</th>
              <th style="padding: 10px; border: 1px solid #e2e8f0;">Paciente</th>
              <th style="padding: 10px; border: 1px solid #e2e8f0; width: 150px;">Local/Sala</th>
            </tr>
          </thead>
          <tbody>
      `;

      apps.forEach((app, idx) => {
        const customer = app.customer;
        const room = app.room;
        const patientInfo = `${customer?.name || "Não identificado"} <br> <small style="color: #64748b;">(${customer?.health_plan || "Particular"})</small>`;
        const location = app.mode === 'On-line' ? '🌐 On-line' : `🏠 ${room?.name || "Sala não definida"}`;
        const bgColor = idx % 2 === 0 ? '#ffffff' : '#f1f5f9';

        emailHtml += `
          <tr style="background-color: ${bgColor};">
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${app.start_time} - ${app.end_time}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${patientInfo}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${location}</td>
        </tr>
      `;
    });

    // Adicionar linhas para horários internos
    appointments.forEach(app => {
      if (app.is_internal) {
        const psyName = app.psychologist?.name || "Profissional não identificado";
        const internalLabel = app.internal_title || app.internal_type || "Horário Interno";
        const bgColor = '#f9fafb';

        emailHtml += `
          <tr style="background-color: ${bgColor}; font-style: italic; color: #6b7280;">
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">${app.start_time} - ${app.end_time}</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;" colspan="2">${internalLabel}</td>
          </tr>
        `;
      }
    });

      emailHtml += `
          </tbody>
        </table>
      `;
    }

    emailHtml += `
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #64748b; font-size: 11px;">
            <p><strong>Relatório Gerencial Automático - Sistema Priori</strong></p>
            <p>Este e-mail é gerado diariamente às 07:00 para suporte à coordenação.</p>
          </div>
        </div>
      </div>
    `;

    // 5. Enviar o e-mail via Resend
    const mailResponse = await resend.emails.send({
      from: "Núcleo Priori <agenda@nucleopriori.com.br>",
      to: "nucleopriorirj@gmail.com",
      subject: `Agenda Geral Núcleo Priori - ${displayDate}`,
      html: emailHtml,
    });

    return new Response(JSON.stringify({ success: true, message: "E-mail enviado com sucesso", id: mailResponse.data?.id }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
