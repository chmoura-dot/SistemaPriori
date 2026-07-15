import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

// ─── Fase 1 da Auditoria — Alerta ativo de falhas críticas ───────────────────
// Lê operation_failures com severity='critical' e acknowledged=false, envia um
// e-mail consolidado para a coordenação e marca os registros como reconhecidos
// (acknowledged=true) para não reenviar no próximo ciclo do cron.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const ALERT_TO = "nucleopriorirj@gmail.com";

const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Buscar falhas críticas ainda não reconhecidas
    const { data: failures, error } = await supabase
      .from("operation_failures")
      .select("id, context, message, details, severity, created_at")
      .eq("severity", "critical")
      .eq("acknowledged", false)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    if (!failures || failures.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma falha crítica pendente." }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Montar corpo do e-mail
    let rowsHtml = "";
    failures.forEach((f, idx) => {
      const bgColor = idx % 2 === 0 ? "#ffffff" : "#fef2f2";
      const when = new Date(f.created_at).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });
      const detailsStr = f.details
        ? `<pre style="margin:6px 0 0 0; padding:8px; background:#f8fafc; border-radius:6px; font-size:11px; color:#475569; white-space:pre-wrap; word-break:break-word;">${escapeHtml(
            JSON.stringify(f.details, null, 2),
          )}</pre>`
        : "";

      rowsHtml += `
        <tr style="background-color: ${bgColor}; border-bottom: 1px solid #eee;">
          <td style="padding: 12px 10px; font-size: 12px; color: #666; white-space: nowrap;">${when}</td>
          <td style="padding: 12px 10px;">
            <strong style="color:#b91c1c;">${escapeHtml(f.context)}</strong><br>
            <span style="font-size: 13px; color: #333;">${escapeHtml(f.message)}</span>
            ${detailsStr}
          </td>
        </tr>`;
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 720px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #b91c1c; color: white; padding: 25px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">🚨 Alerta de Falhas Críticas</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.85;">Sistema Núcleo Priori — Observabilidade</p>
        </div>
        <div style="padding: 30px;">
          <p>Foram detectadas <strong>${failures.length} falha(s) crítica(s)</strong> em fluxos de negócio (faturamento, repasse, inativação) que exigem verificação:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 14px;">
            <thead>
              <tr style="text-align: left; background-color: #f1f5f9; color: #475569;">
                <th style="padding: 10px; border-bottom: 2px solid #b91c1c;">Quando</th>
                <th style="padding: 10px; border-bottom: 2px solid #b91c1c;">Contexto / Mensagem</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #b91c1c; font-size: 13px; color: #7f1d1d;">
            <strong>Ação Recomendada:</strong><br>
            Verifique a tabela <code>operation_failures</code> no Supabase para reconciliar manualmente
            os dados afetados. Estes registros já foram marcados como reconhecidos e não serão reenviados.
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          <p><strong>Sistema Priori - Gestão Inteligente</strong></p>
          <p>Alerta gerado automaticamente pelo monitor de falhas.</p>
        </div>
      </div>
    `;

    // 3. Enviar e-mail
    const mailResponse = await resend.emails.send({
      from: "Núcleo Priori <agenda@nucleopriori.com.br>",
      to: ALERT_TO,

      subject: `🚨 ${failures.length} falha(s) crítica(s) no Sistema Priori`,
      html: emailHtml,
    });

    // 4. Marcar como reconhecidas apenas se o e-mail foi enviado com sucesso
    if (mailResponse.error) {
      throw new Error(`Resend: ${mailResponse.error.message}`);
    }

    const ids = failures.map((f) => f.id);
    const { error: ackError } = await supabase
      .from("operation_failures")
      .update({ acknowledged: true })
      .in("id", ids);

    if (ackError) throw ackError;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Alerta enviado e falhas reconhecidas.",
        count: failures.length,
        id: mailResponse.data?.id,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
