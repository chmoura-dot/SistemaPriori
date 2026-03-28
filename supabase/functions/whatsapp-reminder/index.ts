import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// Forçamos a URL oficial para evitar redirecionamentos incorretos (ex: n8n)
const APP_URL = "https://sistema-priori.vercel.app";

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

    // 1. Calcular a data de hoje para buscar agendamentos (Horário de Brasília)
    // Usamos Intl para garantir o fuso correto de SP independente do servidor
    const brDate = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    
    const [dayStr, monthStr, yearStr] = brDate.split('/');
    const todayStr = `${yearStr}-${monthStr}-${dayStr}`;

    console.log(`[WhatsAppReminder] Processando lembretes para o dia: ${todayStr} (Data local BR)`);

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        date,
        start_time,
        customer:customers (name, phone),
        psychologist:psychologists (name)
      `)
      .eq('date', todayStr)
      .eq('status', 'active')
      .eq('confirmation_status', 'pending')
      .is('reminder_sent_at', null);

    if (error) throw error;

    const results = [];

    for (const app of (appointments || [])) {
      // Como o cron roda às 06:00 BRT, processamos todos agendamentos do dia de hoje
      const [year, month, day] = app.date.split('-').map(Number);
      
      const customer = Array.isArray(app.customer) ? app.customer[0] : app.customer;
      const psychologist = Array.isArray(app.psychologist) ? app.psychologist[0] : app.psychologist;

      if (!customer?.phone) {
        results.push({ id: app.id, status: "skipped", reason: "no_phone" });
        continue;
      }

      const patientName = customer.name || "Paciente";
      
      // Limpa e garante o formato internacional (55 no início para Brasil)
      let patientPhone = customer.phone.replace(/\D/g, "");
      if (patientPhone.length > 0 && !patientPhone.startsWith("55")) {
        patientPhone = "55" + patientPhone;
      }

      const psychName = psychologist?.name || "Psicólogo";
      const formattedDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`;
      // Usar HashRouter para evitar erros 404 no Vercel
      const confirmationLink = `${APP_URL}/#/confirmacao/${app.id}`;

      const message = `Olá *${patientName}*, aqui é da Núcleo Priori. Passando para lembrar da sua consulta com *${psychName}* hoje, dia *${formattedDate}* às *${app.start_time}*.\n\nPor favor, confirme sua presença clicando no link abaixo:\n${confirmationLink}`;

      // 2. Enviar via Z-API
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Só enviamos o Client-Token se ele for diferente do ID da instância (erro comum de configuração)
      // O ID da instância está presente na ZAPI_URL
      const instanceIdMatch = ZAPI_URL.match(/instances\/([^\/]+)/);
      const instanceId = instanceIdMatch ? instanceIdMatch[1] : null;

      if (ZAPI_TOKEN && ZAPI_TOKEN !== instanceId) {
        headers['Client-Token'] = ZAPI_TOKEN;
      }

      try {
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
          const errorText = await response.text();
          console.error(`[WhatsAppReminder] Erro na Z-API (ID: ${app.id}): Status ${response.status} - ${errorText}`);
          
          // Tentar parsear o erro se for JSON
          let errorDetail = errorText;
          try {
            const parsed = JSON.parse(errorText);
            errorDetail = parsed.message || errorText;
          } catch (e) {}
          
          results.push({ id: app.id, status: "error", code: response.status, message: errorDetail });
        }
      } catch (sendError: any) {
        results.push({ id: app.id, status: "fetch_error", error: sendError.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
