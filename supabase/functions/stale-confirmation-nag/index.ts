import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// Forçamos a URL oficial para evitar redirecionamentos incorretos (ex: n8n)
const SITE_URL = "https://sistema-priori.vercel.app";

const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Calcular data limite (ontem) em Brasília
    // Queremos cobrar tudo o que aconteceu até ontem e ainda não foi confirmado.
    const thresholdDate = new Date();
    thresholdDate.setHours(thresholdDate.getHours() - (3 + 24)); // Brasília - 1 dia
    const thresholdStr = thresholdDate.toISOString().split('T')[0];

    console.log(`[StaleNag] Buscando pendências anteriores a: ${thresholdStr}`);

    // 2. Buscar agendamentos pendentes (desde o passado até ontem)
    const { data: staleAppointments, error: appError } = await supabase
      .from('appointments')
      .select(`
        id,
        date,
        psychologist:psychologists (id, name, email)
      `)
      .lte('date', thresholdStr)
      .eq('confirmed_psychologist', false)
      .neq('status', 'canceled')
      .order('date', { ascending: true });

    if (appError) throw appError;

    if (!staleAppointments || staleAppointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No stale appointments found" }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Agrupar por psicólogo
    const psychologistMap = new Map();
    staleAppointments.forEach((app: any) => {
      const psy = Array.isArray(app.psychologist) ? app.psychologist[0] : app.psychologist;
      if (!psy || !psy.email) return;

      if (!psychologistMap.has(psy.id)) {
        psychologistMap.set(psy.id, {
          info: psy,
          dates: new Set(),
          count: 0
        });
      }
      const data = psychologistMap.get(psy.id);
      data.dates.add(app.date);
      data.count++;
    });

    const results = [];

    // 4. Para cada psicólogo with pendências, enviar o lembrete
    for (const [psyId, data] of psychologistMap.entries()) {
      const psy = data.info;
      const sortedDates = Array.from(data.dates).sort() as string[];
      const firstDate = sortedDates[0].split('-').reverse().join('/');
      const lastDate = sortedDates[sortedDates.length - 1].split('-').reverse().join('/');
      
      const dateSummary = sortedDates.length > 1 
        ? `${firstDate} até ${lastDate}`
        : firstDate;

      // Gerar Token de Confirmação Genérico (sem data específica)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 72); // Nag link válido por 3 dias

      const { data: tokenRecord, error: tokenError } = await supabase
        .from('appointment_tokens')
        .insert({
          psychologist_id: psyId,
          date: null, // Indica que é um resumo de pendências
          expires_at: expiresAt.toISOString()
        })
        .select()
        .single();
      
      if (tokenError) {
        results.push({ psychologist: psy.name, status: "token_error", error: tokenError.message });
        continue;
      }

      const magicLink = `${SITE_URL}/#/confirmacao?token=${tokenRecord.id}`;

      // 5. Montar E-mail
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #9d174d; color: white; padding: 20px; text-align: center;">
            <h2 style="margin: 0;">Pendências de Confirmação</h2>
          </div>
          <div style="padding: 30px;">
            <p>Olá, <strong>${psy.name}</strong>!</p>
            <p>Identificamos que você possui <strong>${data.count} atendimentos pendentes</strong> de confirmação no Sistema Priori, referentes ao período de <strong>${dateSummary}</strong>.</p>
            <p>É fundamental que todos os atendimentos sejam validados para que possamos manter o faturamento e os repasses em dia.</p>
            
            <div style="margin: 35px 0; text-align: center;">
              <a href="${magicLink}" style="background-color: #1e293b; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">Regularizar Minha Agenda</a>
            </div>

            <p style="font-size: 14px; color: #666; background-color: #f8fafc; padding: 15px; border-radius: 8px;">
              <strong>Por que recebi isso?</strong><br>
              Recebemos normas de que todos os atendimentos devem ser validados (presença ou falta) até o final do dia de trabalho. Este lembrete será enviado diariamente até que a agenda esteja em dia.
            </p>
          </div>
          <div style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
            <p>Sistema Priori &copy; ${new Date().getFullYear()}</p>
            <p>Este é um lembrete automático de segurança.</p>
          </div>
        </div>
      `;

      try {
        const mailResponse = await resend.emails.send({
          from: "Núcleo Priori <agenda@nucleopriori.com.br>",
          to: psy.email,
          subject: `Ação Necessária: Regularização de Agenda (${data.count} pendências)`,
          html: emailHtml,
        });

        results.push({ psychologist: psy.name, status: "sent", id: mailResponse.data?.id });
      } catch (sendError: any) {
        results.push({ psychologist: psy.name, status: "mail_error", error: sendError.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
