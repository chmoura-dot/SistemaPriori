import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const COORDINATOR_EMAIL = "nucleopriorirj@gmail.com";

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

    // Body: { appointmentId: string, changeType: "new" | "rescheduled" | "canceled" | "patient_changed" | "updated" }
    const { appointmentId, changeType } = await req.json();

    if (!appointmentId || !changeType) {
      throw new Error("appointmentId e changeType são obrigatórios.");
    }

    // 0. Buscar configurações da Z-API
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("zapi_url, zapi_token")
      .single();

    if (settingsError || !settings?.zapi_url) {
      console.error("Configurações da Z-API não encontradas.");
      return new Response(JSON.stringify({ error: "Z-API settings not configured" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ZAPI_URL = settings.zapi_url;
    const ZAPI_TOKEN = settings.zapi_token;

    // 1. Buscar dados do agendamento
    const { data: appData, error: appError } = await supabase
      .from("appointments")
      .select(`
        id,
        date,
        start_time,
        end_time,
        is_internal,
        internal_title,
        internal_type,
        customer:customers (name),
        psychologist:psychologists (name, phone)
      `)
      .eq("id", appointmentId)
      .single();

    if (appError || !appData) {
      throw new Error(`Agendamento não encontrado: ${appError?.message}`);
    }

    // 2. Verificar se o agendamento é para hoje (horário de Brasília)
    const brDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    const [dayStr, monthStr, yearStr] = brDate.split("/");
    const todayStr = `${yearStr}-${monthStr}-${dayStr}`;

    if (appData.date !== todayStr) {
      console.log(`[AgendaChangeNotify] Agendamento ${appointmentId} é para ${appData.date}, não é hoje (${todayStr}). Ignorando.`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "not_today" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Preparar dados para a mensagem
    const psychologist = Array.isArray(appData.psychologist) ? appData.psychologist[0] : appData.psychologist;
    const customer = Array.isArray(appData.customer) ? appData.customer[0] : appData.customer;

    const psychName = psychologist?.name || "Psicólogo";
    const [year, month, day] = appData.date.split("-").map(Number);
    const formattedDate = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;

    // Determinar o nome do atendimento (paciente ou título interno)
    let atendimentoDesc: string;
    let atendimentoDescPlain: string; // versão sem markdown para o e-mail
    if (appData.is_internal) {
      atendimentoDesc = appData.internal_title || appData.internal_type || "Compromisso interno";
      atendimentoDescPlain = atendimentoDesc;
    } else {
      atendimentoDescPlain = customer?.name || "Novo paciente";
      atendimentoDesc = customer?.name ? `paciente *${customer.name}*` : "novo paciente";
    }

    // ── 4. E-MAIL PARA O COORDENADOR (independente do WhatsApp) ──
    let emailSent = false;
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);

        // Mapear tipo de alteração para ícone + título
        const changeLabels: Record<string, { icon: string; title: string; color: string }> = {
          new:              { icon: "🗓️", title: "Novo Atendimento Adicionado",  color: "#16a34a" },
          rescheduled:      { icon: "⏰", title: "Horário Alterado",             color: "#d97706" },
          canceled:         { icon: "❌", title: "Atendimento Cancelado",        color: "#dc2626" },
          patient_changed:  { icon: "👤", title: "Troca de Paciente",            color: "#7c3aed" },
          updated:          { icon: "🔄", title: "Atendimento Atualizado",       color: "#2563eb" },
        };
        const label = changeLabels[changeType] || changeLabels["updated"];

        const coordEmailHtml = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #1a365d; padding: 20px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 18px;">${label.icon} Alteração na Agenda de Hoje</h2>
              <p style="color: #d4af37; margin: 5px 0 0 0; font-size: 14px;">${brDate}</p>
            </div>
            <div style="padding: 25px;">
              <div style="background-color: ${label.color}15; border-left: 4px solid ${label.color}; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
                <strong style="color: ${label.color}; font-size: 15px;">${label.title}</strong>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 140px;">Psicólogo(a)</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${psychName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${appData.is_internal ? "Compromisso" : "Paciente"}</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${atendimentoDescPlain}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Horário</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${appData.start_time} às ${appData.end_time}</td>
                </tr>
              </table>
              <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Verifique o painel do sistema para mais detalhes.</p>
            </div>
            <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
              Sistema Priori &copy; ${new Date().getFullYear()} — Notificação automática de alteração na agenda
            </div>
          </div>
        `;

        const subjectPrefix = changeType === "canceled" ? "❌" : changeType === "new" ? "🗓️" : "⚠️";
        await resend.emails.send({
          from: "Núcleo Priori <agenda@nucleopriori.com.br>",
          to: COORDINATOR_EMAIL,
          subject: `${subjectPrefix} ${label.title} – Agenda ${brDate} – ${psychName}`,
          html: coordEmailHtml,
        });

        emailSent = true;
        console.log(`[AgendaChangeNotify] E-mail de alteração enviado ao coordenador.`);
      } catch (emailErr: any) {
        console.error(`[AgendaChangeNotify] Erro ao enviar e-mail ao coordenador:`, emailErr.message);
      }
    }

    // ── 5. WHATSAPP PARA O PSICÓLOGO (via Z-API) ──
    if (!psychologist?.phone) {
      console.log(`[AgendaChangeNotify] Psicólogo sem telefone cadastrado. WhatsApp ignorado.`);
      return new Response(JSON.stringify({ success: true, whatsappSkipped: true, emailSent, reason: "no_psychologist_phone" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Montar mensagem WhatsApp conforme o tipo de alteração
    let message: string;
    switch (changeType) {
      case "new":
        message = `🗓️ *Novo Atendimento - Núcleo Priori*\n\nOlá *${psychName}*, um novo atendimento foi adicionado à sua agenda de hoje (${formattedDate}):\n\n👤 ${atendimentoDesc}\n🕐 Horário: *${appData.start_time}* às *${appData.end_time}*\n\nFique atento à sua agenda atualizada. Qualquer dúvida, entre em contato com a secretaria.`;
        break;
      case "rescheduled":
        message = `⏰ *Remarcação na Agenda - Núcleo Priori*\n\nOlá *${psychName}*, houve uma alteração de horário em sua agenda de hoje (${formattedDate}):\n\n👤 ${atendimentoDesc}\n🕐 Novo horário: *${appData.start_time}* às *${appData.end_time}*\n\nVerifique sua agenda atualizada. Qualquer dúvida, entre em contato com a secretaria.`;
        break;
      case "canceled":
        message = `❌ *Cancelamento na Agenda - Núcleo Priori*\n\nOlá *${psychName}*, um atendimento da sua agenda de hoje (${formattedDate}) foi *cancelado*:\n\n👤 ${atendimentoDesc}\n🕐 Horário: *${appData.start_time}* às *${appData.end_time}*\n\nQualquer dúvida, entre em contato com a secretaria.`;
        break;
      case "patient_changed":
        message = `👤 *Troca de Paciente - Núcleo Priori*\n\nOlá *${psychName}*, houve uma troca de paciente em um atendimento da sua agenda de hoje (${formattedDate}):\n\n👤 Novo paciente: ${atendimentoDesc}\n🕐 Horário: *${appData.start_time}* às *${appData.end_time}*\n\nVerifique sua agenda atualizada. Qualquer dúvida, entre em contato com a secretaria.`;
        break;
      default:
        message = `🔄 *Alteração na Agenda - Núcleo Priori*\n\nOlá *${psychName}*, houve uma alteração em um atendimento da sua agenda de hoje (${formattedDate}):\n\n👤 ${atendimentoDesc}\n🕐 Horário: *${appData.start_time}* às *${appData.end_time}*\n\nVerifique sua agenda atualizada. Qualquer dúvida, entre em contato com a secretaria.`;
    }

    let psychPhone = psychologist.phone.replace(/\D/g, "");
    if (psychPhone.length > 0 && !psychPhone.startsWith("55")) {
      psychPhone = "55" + psychPhone;
    }

    if (psychPhone.length < 12) {
      return new Response(JSON.stringify({ success: true, whatsappSkipped: true, emailSent, reason: "invalid_phone" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const instanceIdMatch = ZAPI_URL.match(/instances\/([^\/]+)/);
    const instanceId = instanceIdMatch ? instanceIdMatch[1] : null;
    if (ZAPI_TOKEN && ZAPI_TOKEN !== instanceId) {
      headers["Client-Token"] = ZAPI_TOKEN;
    }

    console.log(`[AgendaChangeNotify] Enviando WhatsApp (${changeType}) para ${psychName} (${psychPhone})`);

    const response = await fetch(`${ZAPI_URL}/send-text`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: psychPhone, message })
    });

    if (response.ok) {
      console.log(`[AgendaChangeNotify] WhatsApp enviado com sucesso.`);
      return new Response(JSON.stringify({ success: true, whatsappSent: true, emailSent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      const errorText = await response.text();
      console.error(`[AgendaChangeNotify] Erro na Z-API: ${response.status} - ${errorText}`);
      return new Response(JSON.stringify({ success: false, whatsappError: errorText, emailSent }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (err: any) {
    console.error("[AgendaChangeNotify] Erro:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
