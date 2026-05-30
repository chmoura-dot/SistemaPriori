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

    if (!psychologist?.phone) {
      console.log(`[AgendaChangeNotify] Psicólogo sem telefone cadastrado. Ignorando.`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_psychologist_phone" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const psychName = psychologist.name || "Psicólogo";
    const [year, month, day] = appData.date.split("-").map(Number);
    const formattedDate = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;

    // Determinar o nome do atendimento (paciente ou título interno)
    let atendimentoDesc: string;
    if (appData.is_internal) {
      atendimentoDesc = appData.internal_title || appData.internal_type || "Compromisso interno";
    } else {
      atendimentoDesc = customer?.name ? `paciente *${customer.name}*` : "novo paciente";
    }

    // 4. Montar mensagem conforme o tipo de alteração
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

    // 5. Enviar via Z-API
    let psychPhone = psychologist.phone.replace(/\D/g, "");
    if (psychPhone.length > 0 && !psychPhone.startsWith("55")) {
      psychPhone = "55" + psychPhone;
    }

    if (psychPhone.length < 12) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "invalid_phone" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const instanceIdMatch = ZAPI_URL.match(/instances\/([^\/]+)/);
    const instanceId = instanceIdMatch ? instanceIdMatch[1] : null;
    if (ZAPI_TOKEN && ZAPI_TOKEN !== instanceId) {
      headers["Client-Token"] = ZAPI_TOKEN;
    }

    console.log(`[AgendaChangeNotify] Enviando notificação (${changeType}) para ${psychName} (${psychPhone})`);

    const response = await fetch(`${ZAPI_URL}/send-text`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: psychPhone, message })
    });

    if (response.ok) {
      console.log(`[AgendaChangeNotify] Mensagem enviada com sucesso.`);
      return new Response(JSON.stringify({ success: true, sent: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      const errorText = await response.text();
      console.error(`[AgendaChangeNotify] Erro na Z-API: ${response.status} - ${errorText}`);
      return new Response(JSON.stringify({ success: false, error: errorText }), {
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
