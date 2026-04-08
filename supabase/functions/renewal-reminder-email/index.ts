import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_EMAIL = "nucleopriorirj@gmail.com";

const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Calcular data de hoje e limite de 7 dias (horário de Brasília)
    const brDate = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const [day, month, year] = brDate.split('/');
    const todayStr = `${year}-${month}-${day}`;

    // Calcular data limite: hoje + 3 dias
    const limitDate = new Date(`${todayStr}T12:00:00`);
    limitDate.setDate(limitDate.getDate() + 3);
    const limitStr = limitDate.toISOString().split('T')[0];

    console.log(`[RenewalReminder] Buscando renovações entre hoje (${todayStr}) e ${limitStr}`);

    // Buscar agendamentos que precisam de renovação e vencem em até 3 dias
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        date,
        start_time,
        end_time,
        customer:customers (name, health_plan),
        psychologist:psychologists (name)
      `)
      .eq('needs_renewal', true)
      .eq('status', 'active')
      .lte('date', limitStr)
      .order('date', { ascending: true });

    if (error) throw error;

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Nenhuma renovação pendente nos próximos 3 dias." }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Montar tabela HTML
    let rowsHtml = '';
    appointments.forEach((app: any, idx: number) => {
      const customer = Array.isArray(app.customer) ? app.customer[0] : app.customer;
      const psychologist = Array.isArray(app.psychologist) ? app.psychologist[0] : app.psychologist;
      const appDate = new Date(app.date + 'T12:00:00');
      const formattedDate = appDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

      const today = new Date(`${todayStr}T12:00:00`);
      const daysUntil = Math.ceil((appDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysUntil < 0;
      const isToday = daysUntil === 0;
      const urgencyColor = isOverdue ? '#ef4444' : isToday ? '#f59e0b' : '#3b82f6';
      const urgencyText = isOverdue ? `Vencido há ${Math.abs(daysUntil)} dia(s)` : isToday ? 'Vence HOJE' : `Vence em ${daysUntil} dia(s)`;
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';

      rowsHtml += `
        <tr style="background-color: ${bgColor}; border-bottom: 1px solid #eee;">
          <td style="padding: 12px 10px;">
            <strong>${customer?.name || '—'}</strong>
            <br><small style="color: #666;">${customer?.health_plan || 'Particular'}</small>
          </td>
          <td style="padding: 12px 10px; font-size: 13px; color: #555;">${psychologist?.name || '—'}</td>
          <td style="padding: 12px 10px; font-size: 13px; color: #555;">${formattedDate} às ${app.start_time}</td>
          <td style="padding: 12px 10px; text-align: right;">
            <span style="color: ${urgencyColor}; font-weight: bold; font-size: 12px;">${urgencyText}</span>
          </td>
        </tr>
      `;
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 750px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #1a365d; color: white; padding: 25px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">🔔 Lembrete de Renovação de Agenda</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.8;">Agendamentos que precisam ser renovados nos próximos dias</p>
        </div>
        <div style="padding: 30px;">
          <p>Olá, Coordenador(a)!</p>
          <p>Identificamos <strong>${appointments.length} agendamento(s)</strong> que precisam de renovação nos próximos 3 dias. Por favor, acesse o sistema para renovar ou liberar os horários:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 14px;">
            <thead>
              <tr style="text-align: left; background-color: #f1f5f9; color: #475569;">
                <th style="padding: 10px; border-bottom: 2px solid #1a365d;">Paciente</th>
                <th style="padding: 10px; border-bottom: 2px solid #1a365d;">Psicólogo</th>
                <th style="padding: 10px; border-bottom: 2px solid #1a365d;">Data / Horário</th>
                <th style="padding: 10px; border-bottom: 2px solid #1a365d; text-align: right;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #1a365d; font-size: 13px; color: #1e40af;">
            <strong>Ação Necessária:</strong><br>
            Acesse o sistema Núcleo Priori e, ao abrir a Agenda, o alerta de renovação aparecerá automaticamente para cada paciente pendente.
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          <p><strong>Sistema Priori - Gestão Inteligente</strong></p>
          <p>Este lembrete é enviado automaticamente 3 dias antes do vencimento de cada ciclo de sessões.</p>
        </div>
      </div>
    `;

    const mailResponse = await resend.emails.send({
      from: "Núcleo Priori <agenda@nucleopriori.com.br>",
      to: ADMIN_EMAIL,
      subject: `🔔 ${appointments.length} renovação(ões) de agenda pendente(s) - Núcleo Priori`,
      html: emailHtml,
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Email enviado para ${ADMIN_EMAIL}`,
      count: appointments.length,
      id: mailResponse.data?.id
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
