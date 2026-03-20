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

    // 1. Calcular data limite (hoje + 15 dias) para alerta prévio
    const now = new Date();
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(now.getDate() + 15);
    
    const thresholdStr = fifteenDaysFromNow.toISOString().split('T')[0];

    console.log(`[AMS-Alert] Buscando senhas que vencem até: ${thresholdStr}`);

    // 2. Buscar pacientes AMS Petrobras com senha vencendo ou já vencida
    const { data: customers, error } = await supabase
      .from('customers')
      .select(`
        id,
        name,
        health_plan,
        ams_password_expiry,
        psychologist:psychologists (name)
      `)
      .eq('status', 'active')
      .not('ams_password_expiry', 'is', null)
      .lte('ams_password_expiry', thresholdStr)
      .order('ams_password_expiry', { ascending: true });

    if (error) throw error;

    if (!customers || customers.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Nenhuma senha AMS expirando." }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Montar Relatório Consolidado para a Coordenação
    let patientsHtml = '';
    
    customers.forEach((p, idx) => {
      const psychologist = Array.isArray(p.psychologist) ? p.psychologist[0] : p.psychologist;
      const expiryDate = new Date(p.ams_password_expiry + 'T12:00:00');
      const formattedDate = expiryDate.toLocaleDateString('pt-BR');
      const isExpired = expiryDate < now;
      const color = isExpired ? '#ef4444' : '#f59e0b';
      const statusText = isExpired ? 'VENCIDA' : 'EXPIRANDO';
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';

      patientsHtml += `
        <tr style="background-color: ${bgColor}; border-bottom: 1px solid #eee;">
          <td style="padding: 12px 10px;"><strong>${p.name}</strong></td>
          <td style="padding: 12px 10px; font-size: 12px; color: #666;">${psychologist?.name || '—'}</td>
          <td style="padding: 12px 10px; color: ${color}; font-weight: bold; text-align: right;">${formattedDate}<br><small>${statusText}</small></td>
        </tr>
      `;
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #004b32; color: white; padding: 25px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">Relatório de Senhas AMS Petrobras</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.8;">Controle de Expiração - Coordenação Clínica</p>
        </div>
        <div style="padding: 30px;">
          <p>Olá, Coordenador(a)!</p>
          <p>Identificamos <strong>${customers.length} paciente(s)</strong> com senhas do portal AMS Petrobras que requerem atenção imediata para evitar problemas no faturamento:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 14px;">
            <thead>
              <tr style="text-align: left; background-color: #f1f5f9; color: #475569;">
                <th style="padding: 10px; border-bottom: 2px solid #004b32;">Paciente</th>
                <th style="padding: 10px; border-bottom: 2px solid #004b32;">Psicólogo</th>
                <th style="padding: 10px; border-bottom: 2px solid #004b32; text-align: right;">Vencimento</th>
              </tr>
            </thead>
            <tbody>
              ${patientsHtml}
            </tbody>
          </table>

          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; border-left: 4px solid #004b32; font-size: 13px; color: #166534;">
            <strong>Ação Recomendada:</strong><br>
            Entrar em contato com os respectivos psicólogos ou diretamente com os pacientes para solicitar a renovação da senha.
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          <p><strong>Sistema Priori - Gestão Inteligente</strong></p>
          <p>Este relatório é gerado automaticamente toda segunda-feira às 07:00.</p>
        </div>
      </div>
    `;

    // 4. Enviar e-mail ÚNICO para a coordenação
    const mailResponse = await resend.emails.send({
      from: "Núcleo Priori <agenda@nucleopriori.com.br>",
      to: "nucleopriorirj@gmail.com",
      subject: `⚠️ Gestão AMS: ${customers.length} senhas expirando ou vencidas`,
      html: emailHtml,
    });

    return new Response(JSON.stringify({ success: true, message: "Relatório enviado para a coordenação", id: mailResponse.data?.id }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
