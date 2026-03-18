import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL") || "https://nucleo-priori.vercel.app";

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 0. Buscar configurações da Z-API
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('zapi_url, zapi_token')
      .single();

    if (settingsError || !settings?.zapi_url) {
      console.error("Configurações da Z-API não encontradas ou incompletas.");
      return new Response(JSON.stringify({ error: "Z-API settings not configured" }), { status: 400 });
    }

    const ZAPI_URL = settings.zapi_url;
    const ZAPI_TOKEN = settings.zapi_token;

    // 1. Buscar agendamentos que precisam de lembrete (Janela de 12h)
    const now = new Date();
    const dateLimit = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        date,
        start_time,
        customer:customers (name, phone),
        psychologist:psychologists (name)
      `)
      .eq('confirmation_status', 'pending')
      .is('reminder_sent_at', null)
      .gte('date', now.toISOString().split('T')[0])
      .lte('date', dateLimit);

    if (error) throw error;

    const results = [];

    for (const app of (appointments || [])) {
      const [year, month, day] = app.date.split('-').map(Number);
      const [hours, minutes] = app.start_time.split(':').map(Number);
      const appDateTime = new Date(year, month - 1, day, hours, minutes);
      
      const diffMs = appDateTime.getTime() - now.getTime();
      const hoursDiff = diffMs / (1000 * 60 * 60);

      // Janela de 11h a 13h (para garantir captura caso o cron demore um pouco)
      if (hoursDiff >= 11 && hoursDiff <= 13) {
        const customer = Array.isArray(app.customer) ? app.customer[0] : app.customer;
        const psychologist = Array.isArray(app.psychologist) ? app.psychologist[0] : app.psychologist;

        if (!customer?.phone) {
          results.push({ id: app.id, status: "skipped", reason: "no_phone" });
          continue;
        }

        const patientName = customer.name || "Paciente";
        const patientPhone = customer.phone.replace(/\D/g, "");
        const psychName = psychologist?.name || "Psicólogo";
        const formattedDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`;
        const confirmationLink = `${APP_URL}/confirmacao/${app.id}`;

        const message = `Olá *${patientName}*, aqui é da Núcleo Priori. Passando para lembrar da sua consulta com *${psychName}* no dia *${formattedDate}* às *${app.start_time}*.\n\nPor favor, confirme sua presença clicando no link abaixo:\n${confirmationLink}`;

        // 2. Enviar via Z-API
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        
        if (ZAPI_TOKEN) {
          headers['Client-Token'] = ZAPI_TOKEN;
        }

        const response = await fetch(`${ZAPI_URL}/send-text`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: patientPhone,
            message: message
          })
        });

        if (response.ok) {
          await supabase
            .from('appointments')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', app.id);
          
          results.push({ id: app.id, status: "sent" });
        } else {
          results.push({ id: app.id, status: "error", code: response.status });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
