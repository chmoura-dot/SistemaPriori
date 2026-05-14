import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Tratar CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Obter body da requisição
    const { appointmentId, reason, appointmentData } = await req.json();

    if (!reason) {
      throw new Error("O motivo do cancelamento é obrigatório.");
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

    // 1. Obter dados do agendamento (via parametro se for exclusão fisica ou via banco)
    let appInfo;
    
    if (appointmentData) {
      // Usado no fluxo de exclusão (onde o registro já não existe ou vai ser deletado)
      appInfo = appointmentData;
    } else if (appointmentId) {
      // Usado no fluxo de cancelamento (registro existe no banco)
      const { data: appData, error: appError } = await supabase
        .from("appointments")
        .select(`
          id,
          date,
          start_time,
          is_internal,
          customer:customers (name, phone),
          psychologist:psychologists (name, phone)
        `)
        .eq("id", appointmentId)
        .single();

      if (appError) throw appError;
      appInfo = appData;
    } else {
      throw new Error("appointmentId ou appointmentData devem ser fornecidos.");
    }

    // Se for compromisso interno (ex: reunião), não temos paciente para avisar.
    // Avisamos apenas o psicólogo
    
    // Preparar dados para envio
    const [year, month, day] = appInfo.date.split("-").map(Number);
    const formattedDate = `${day.toString().padStart(2, "0")}/${month.toString().padStart(2, "0")}`;
    const startTime = appInfo.start_time || appInfo.startTime;

    // Lidar com arrays retornados pelo supabase
    const customer = appInfo.customer ? (Array.isArray(appInfo.customer) ? appInfo.customer[0] : appInfo.customer) : null;
    const psychologist = appInfo.psychologist ? (Array.isArray(appInfo.psychologist) ? appInfo.psychologist[0] : appInfo.psychologist) : null;

    const patientName = customer?.name || "Paciente";
    const psychName = psychologist?.name || "Psicólogo";

    const results = [];
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    
    const instanceIdMatch = ZAPI_URL.match(/instances\/([^\/]+)/);
    const instanceId = instanceIdMatch ? instanceIdMatch[1] : null;

    if (ZAPI_TOKEN && ZAPI_TOKEN !== instanceId) {
      headers["Client-Token"] = ZAPI_TOKEN;
    }

    // Função auxiliar para enviar mensagem
    const sendWhatsApp = async (phone: string, message: string, recipientType: string) => {
      let formattedPhone = phone.replace(/\D/g, "");
      if (formattedPhone.length > 0 && !formattedPhone.startsWith("55")) {
        formattedPhone = "55" + formattedPhone;
      }

      if (formattedPhone.length < 10) return { status: "skipped", reason: "invalid_phone" };

      try {
        const response = await fetch(`${ZAPI_URL}/send-text`, {
          method: "POST",
          headers,
          body: JSON.stringify({ phone: formattedPhone, message })
        });

        if (response.ok) {
          return { status: "sent", recipientType };
        } else {
          const errorText = await response.text();
          return { status: "error", recipientType, code: response.status, message: errorText };
        }
      } catch (err: any) {
        return { status: "fetch_error", recipientType, error: err.message };
      }
    };

    // 2. Enviar mensagem para o paciente (se não for compromisso interno)
    if (!appInfo.is_internal && !appInfo.isInternal && customer?.phone) {
      const patientMessage = `Olá *${patientName}*, informamos que sua consulta com *${psychName}* no dia *${formattedDate}* às *${startTime}* precisou ser cancelada.\n\n*Motivo:* ${reason}\n\nEm breve entraremos em contato para remarcar. Qualquer dúvida, estamos à disposição.\nEquipe Núcleo Priori.`;
      
      const res = await sendWhatsApp(customer.phone, patientMessage, "patient");
      results.push(res);
    } else {
      results.push({ status: "skipped", recipientType: "patient", reason: "no_phone_or_internal" });
    }

    // 3. Enviar mensagem para o psicólogo
    if (psychologist?.phone) {
      const psychMessage = !appInfo.is_internal && !appInfo.isInternal
        ? `Olá *${psychName}*, confirmamos o cancelamento da consulta com *${patientName}* no dia *${formattedDate}* às *${startTime}*.\n\n*Motivo:* ${reason}\n\nA secretaria está ciente e providenciando as devidas ações.`
        : `Olá *${psychName}*, confirmamos o cancelamento do seu compromisso no dia *${formattedDate}* às *${startTime}*.\n\n*Motivo:* ${reason}`;
      
      const res = await sendWhatsApp(psychologist.phone, psychMessage, "psychologist");
      results.push(res);
    } else {
      results.push({ status: "skipped", recipientType: "psychologist", reason: "no_phone" });
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Erro na função cancel-appointment-notify:", err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
