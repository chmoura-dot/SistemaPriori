import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// Forçamos a URL oficial para evitar redirecionamentos incorretos (ex: n8n)
const APP_URL = "https://sistema-priori.vercel.app";

// Envolve qualquer chamada Supabase com retry, para absorver Gateway Timeouts
// transitórios em QUALQUER consulta da função (não só a de settings).
async function withRetry<T>(
  label: string,
  fn: () => Promise<{ data: T | null; error: any }>,
  attempts = 3,
): Promise<{ data: T | null; error: any }> {
  let result: { data: T | null; error: any } = { data: null, error: null };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = await fn();
    if (!result.error) return result;
    console.error(`[WhatsAppReminder] ${label}: tentativa ${attempt} falhou, tentando novamente...`, result.error);
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  return result;
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 0. Buscar configurações da Z-API (com retry para absorver instabilidades transitórias do DB/rede)
    let settings: { zapi_url: string; zapi_token: string } | null = null;
    let settingsError: any = null;
    const SETTINGS_FETCH_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= SETTINGS_FETCH_ATTEMPTS; attempt++) {
      const { data, error } = await supabase
        .from("settings")
        .select("zapi_url, zapi_token")
        .single();

      settings = data;
      settingsError = error;

      if (!error && data?.zapi_url) break;

      if (attempt < SETTINGS_FETCH_ATTEMPTS) {
        console.error(`[WhatsAppReminder] Tentativa ${attempt} de buscar settings falhou, tentando novamente...`, error);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    if (settingsError || !settings?.zapi_url) {
      const detail = settingsError?.message || "Nenhum registro de settings com zapi_url encontrado.";
      console.error("Configurações da Z-API não encontradas ou incompletas.", detail);
      try {
        await supabase.rpc('log_operation_failure', {
          p_context: 'whatsapp-reminder.config',
          p_message: `Configurações da Z-API não encontradas ou incompletas após ${SETTINGS_FETCH_ATTEMPTS} tentativas: ${detail}`,
          p_severity: 'critical'
        });
      } catch (dbErr) {
        console.error("Falha ao registrar log no banco:", dbErr);
      }
      return new Response(JSON.stringify({ error: "Z-API settings not configured" }), { status: 400 });
    }

    const ZAPI_URL = settings.zapi_url;
    const ZAPI_TOKEN = settings.zapi_token;

    // 1. Calcular a data de hoje para buscar agendamentos (Horário de Brasília)
    // Usamos Intl para garantir o fuso correto de SP independente do servidor
    const brDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    
    const [dayStr, monthStr, yearStr] = brDate.split("/");
    const todayStr = `${yearStr}-${monthStr}-${dayStr}`;

    console.log(`[WhatsAppReminder] Processando lembretes para o dia: ${todayStr} (Data local BR)`);

    const { data: appointments, error } = await withRetry(
      "buscar agendamentos do dia",
      () => supabase
        .from("appointments")
        .select(`
          id,
          date,
          start_time,
          confirmation_token,
          customer:customers (name, phone),
          psychologist:psychologists (name)
        `)
        .eq("date", todayStr)
        .eq("status", "active")
        .eq("confirmation_status", "pending")
        .eq("is_internal", false)
        .is("reminder_sent_at", null),
    );

    if (error) throw error;

    const results = [];
    const missingPhone: Array<{
      appointmentId: string;
      customerName: string;
      psychologistName: string;
      date: string;
      time: string;
      rawPhone: string | null;
    }> = [];

    for (const app of (appointments || [])) {
      // Como o cron roda às 06:00 BRT, processamos todos agendamentos do dia de hoje
      const [year, month, day] = app.date.split("-").map(Number);
      
      const customer = Array.isArray(app.customer) ? app.customer[0] : app.customer;
      const psychologist = Array.isArray(app.psychologist) ? app.psychologist[0] : app.psychologist;

      const patientName = customer?.name || "Paciente sem nome";

      // Modo de Teste: Todas as mensagens serão enviadas para este número.
      // REMOVER ou COMENTAR esta linha para voltar ao envio normal.
      let patientPhone = (customer?.phone || "").replace(/\D/g, "");
      if (patientPhone.length > 0 && !patientPhone.startsWith("55")) {
        patientPhone = "55" + patientPhone;
      }
      //

      // Cobre tanto telefone ausente quanto telefone cadastrado sem nenhum
      // dígito válido (ex: "-", texto) — nos dois casos o strip acima zera a
      // string e o envio para a Z-API falharia com "Phone is empty".
      if (!patientPhone) {
        missingPhone.push({
          appointmentId: app.id,
          customerName: patientName,
          psychologistName: psychologist?.name || "Psicólogo",
          date: app.date,
          time: app.start_time,
          rawPhone: customer?.phone ?? null,
        });
        results.push({ id: app.id, status: "skipped", reason: "missing_or_invalid_phone" });
        continue;
      }

      const psychName = psychologist?.name || "Psicólogo";
      const formattedDate = `${day.toString().padStart(2, "0")}/${month.toString().padStart(2, "0")}`;
      // Usar HashRouter para evitar erros 404 no Vercel. O link usa o token de
      // confirmação (aleatório, com expiração) em vez do ID real do
      // agendamento — ver 20260912h_appointment_confirmation_token.sql.
      const confirmationLink = `${APP_URL}/#/confirmacao/${app.confirmation_token}`;

      const message = `Olá *${patientName}*, aqui é da Núcleo Priori. Passando para lembrar da sua consulta com *${psychName}* hoje, dia *${formattedDate}* às *${app.start_time}*.\n\nPor favor, confirme sua presença clicando no link abaixo:\n${confirmationLink}`;

      // 2. Enviar via Z-API
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      
      // Só enviamos o Client-Token se ele for diferente do ID da instância (erro comum de configuração)
      // O ID da instância está presente na ZAPI_URL
      const instanceIdMatch = ZAPI_URL.match(/instances\/([^\/]+)/);
      const instanceId = instanceIdMatch ? instanceIdMatch[1] : null;

      if (ZAPI_TOKEN && ZAPI_TOKEN !== instanceId) {
        headers["Client-Token"] = ZAPI_TOKEN;
      }

      try {
        console.log(`[WhatsAppReminder] Enviando lembrete (appointment ${app.id})`);
        const response = await fetch(`${ZAPI_URL}/send-text`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            phone: patientPhone,
            message: message
          })
        });

        if (response.ok) {
          // Expiração do link enviado ao paciente: alguns dias após a sessão,
          // margem suficiente para respostas atrasadas sem deixar o link
          // válido indefinidamente.
          const tokenExpiresAt = new Date(Date.UTC(year, month - 1, day + 3, 23, 59, 59));

          await withRetry(
            `marcar lembrete enviado (${app.id})`,
            () => supabase
              .from("appointments")
              .update({
                reminder_sent_at: new Date().toISOString(),
                confirmation_token_expires_at: tokenExpiresAt.toISOString(),
              })
              .eq("id", app.id),
          );

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

    const failedCount = results.filter(r => r.status === "error" || r.status === "fetch_error").length;
    if (failedCount > 0) {
      try {
        await supabase.rpc('log_operation_failure', {
          p_context: 'whatsapp-reminder.execution',
          p_message: `Falha ao enviar ${failedCount} lembretes de WhatsApp para hoje.`,
          p_details: { failures: results.filter(r => r.status === "error" || r.status === "fetch_error") },
          p_severity: 'critical'
        });
      } catch (dbErr) {
        console.error("Falha ao registrar log no banco:", dbErr);
      }
    }

    // Paciente(s) sem telefone válido cadastrado: não é uma falha de envio,
    // é um problema de cadastro que precisa de ação humana. Registrado como
    // 'critical' para cair no alerta por e-mail (critical-failure-alert, a
    // cada 10 min) e aparecer no painel de Falhas do Sistema (Configurações).
    if (missingPhone.length > 0) {
      try {
        await supabase.rpc('log_operation_failure', {
          p_context: 'whatsapp-reminder.missingPhone',
          p_message: `${missingPhone.length} lembrete(s) de WhatsApp não enviado(s) porque o paciente não tem telefone cadastrado (ou o número cadastrado é inválido). É necessário corrigir o cadastro do(s) paciente(s) abaixo.`,
          p_details: { patients: missingPhone },
          p_severity: 'critical'
        });
      } catch (dbErr) {
        console.error("Falha ao registrar log no banco:", dbErr);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    try {
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
      await supabase.rpc('log_operation_failure', {
        p_context: 'whatsapp-reminder.unhandled',
        p_message: `Erro não tratado: ${err.message}`,
        p_severity: 'critical'
      });
    } catch (dbErr) {
      console.error("Falha ao registrar log no banco:", dbErr);
    }
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
