import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

// ─── Fase 1 da Auditoria — Confirmação de resolução ──────────────────────────
// Contraparte do critical-failure-alert: quando alguém revisa e corrige uma
// falha crítica no Painel de Diagnóstico, marca `resolved` (distinto de
// `acknowledged`, que só indica "já entrou num e-mail de alerta") e avisa por
// e-mail que aquele problema específico foi solucionado.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const ALERT_TO = "nucleopriorirj@gmail.com";

const resend = new Resend(RESEND_API_KEY);

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

    // Exige usuário autenticado (mesma exigência da RLS que já protegia o
    // update direto que esta função substitui).
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: 'id é obrigatório.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: failure, error: fetchError } = await supabase
      .from('operation_failures')
      .select('id, context, message, severity, created_at, resolved')
      .eq('id', id)
      .single();

    if (fetchError || !failure) {
      return new Response(JSON.stringify({ error: 'Registro não encontrado.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (failure.resolved) {
      return new Response(JSON.stringify({ success: true, message: 'Já estava marcado como resolvido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { error: updateError } = await supabase
      .from('operation_failures')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userData.user.id,
        acknowledged: true,
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Só falhas críticas geraram e-mail de alerta — só essas geram e-mail de
    // resolução. Falha ao enviar o e-mail não desfaz a marcação de resolvido.
    if (failure.severity === 'critical') {
      try {
        const when = new Date(failure.created_at).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        });
        const resolvedWhen = new Date().toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        });

        await resend.emails.send({
          from: "Núcleo Priori <agenda@nucleopriori.com.br>",
          to: ALERT_TO,
          subject: `✅ Falha resolvida: ${failure.context}`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #15803d; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0; font-size: 18px;">✅ Falha Resolvida</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.85;">Sistema Núcleo Priori — Observabilidade</p>
              </div>
              <div style="padding: 25px; font-size: 13px;">
                <p>A falha crítica abaixo, reportada anteriormente, foi marcada como resolvida no Painel de Diagnóstico:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                  <tr><td style="padding: 6px 0; color: #666; width: 120px;">Contexto</td><td style="padding: 6px 0; font-weight: bold;">${escapeHtml(failure.context)}</td></tr>
                  <tr><td style="padding: 6px 0; color: #666;">Mensagem</td><td style="padding: 6px 0;">${escapeHtml(failure.message)}</td></tr>
                  <tr><td style="padding: 6px 0; color: #666;">Detectada em</td><td style="padding: 6px 0;">${when}</td></tr>
                  <tr><td style="padding: 6px 0; color: #666;">Resolvida em</td><td style="padding: 6px 0;">${resolvedWhen}</td></tr>
                </table>
              </div>
              <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
                <p>Alerta gerado automaticamente pelo monitor de falhas.</p>
              </div>
            </div>
          `,
        });
      } catch (mailErr: any) {
        console.error('[ResolveOperationFailure] Erro ao enviar e-mail de resolução:', mailErr.message);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[ResolveOperationFailure] Erro:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
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
