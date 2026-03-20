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
        psychologist:psychologists (name, email)
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

    const results = [];

    // 3. Agrupar por psicólogo para enviar um único e-mail com todos os seus pacientes em alerta
    const psychologistMap = new Map();
    
    customers.forEach(cust => {
      const psy = Array.isArray(cust.psychologist) ? cust.psychologist[0] : cust.psychologist;
      if (!psy || !psy.email) return;

      if (!psychologistMap.has(psy.email)) {
        psychologistMap.set(psy.email, {
          psyName: psy.name,
          patients: []
        });
      }
      psychologistMap.get(psy.email).patients.push(cust);
    });

    // 4. Enviar alertas para cada psicólogo
    for (const [email, data] of psychologistMap.entries()) {
      let patientsHtml = '';
      
      data.patients.forEach(p => {
        const expiryDate = new Date(p.ams_password_expiry + 'T12:00:00');
        const formattedDate = expiryDate.toLocaleDateString('pt-BR');
        const isExpired = expiryDate < now;
        const color = isExpired ? '#ef4444' : '#f59e0b';
        const statusText = isExpired ? 'VENCIDA' : 'EXPIRANDO';

        patientsHtml += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px 0;"><strong>${p.name}</strong></td>
            <td style="padding: 12px 0; color: ${color}; font-weight: bold;">${formattedDate} (${statusText})</td>
          </tr>
        `;
      });

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #004b32; color: white; padding: 20px; text-align: center;">
            <h2 style="margin: 0;">Alerta: Senhas AMS Petrobras</h2>
          </div>
          <div style="padding: 30px;">
            <p>Olá, <strong>${data.psyName}</strong>!</p>
            <p>Os seguintes pacientes sob sua responsabilidade possuem senhas do portal AMS Petrobras que requerem atenção:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="text-align: left; color: #666; font-size: 12px; text-transform: uppercase;">
                  <th style="padding-bottom: 10px; border-bottom: 2px solid #004b32;">Paciente</th>
                  <th style="padding-bottom: 10px; border-bottom: 2px solid #004b32;">Vencimento</th>
                </tr>
              </thead>
              <tbody>
                ${patientsHtml}
              </tbody>
            </table>

            <p style="font-size: 14px; color: #666; background-color: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #004b32;">
              <strong>Atenção:</strong> A expiração dessas senhas pode impedir o faturamento dos atendimentos. Por favor, solicite ao paciente a renovação o quanto antes.
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
            <p>Sistema Priori &copy; ${new Date().getFullYear()} - Relatório Automático de Gestão AMS</p>
          </div>
        </div>
      `;

      try {
        await resend.emails.send({
          from: "Núcleo Priori <agenda@nucleopriori.com.br>",
          to: email,
          cc: "nucleopriorirj@gmail.com", // Coordenação sempre em cópia
          subject: `⚠️ Alerta de Vencimento: Senhas AMS Petrobras (${data.patients.length} pacientes)`,
          html: emailHtml,
        });
        results.push({ email, status: "sent" });
      } catch (err) {
        results.push({ email, status: "error", error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: psychologistMap.size, details: results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
