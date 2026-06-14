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

    // Calcular data de hoje (horário de Brasília)
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

    // Calcular data limite inferior: hoje - 7 dias
    const minDateObj = new Date(todayStr + 'T12:00:00');
    minDateObj.setDate(minDateObj.getDate() - 7);
    const minStr = minDateObj.toISOString().split('T')[0];

    console.log(`[RenewalReminder] Buscando renovações entre ${minStr} e ${limitStr}`);

    // Buscar agendamentos que precisam de renovação
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        date,
        start_time,
        end_time,
        customer_id,
        psychologist_id,
        recurrence_group_id,
        recurrence_frequency,
        customer:customers (name, health_plan, status, inactivation_reason),
        psychologist:psychologists (name)
      `)
      .eq('needs_renewal', true)
      .eq('status', 'active')
      .lte('date', limitStr)
      .gte('date', minStr)
      .order('date', { ascending: true });

    if (error) throw error;

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Nenhuma renovação pendente nos próximos 3 dias." }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Para cada agendamento, verificar se já há sessões futuras (auto-renew já resolveu)
    const customerIds = [...new Set(appointments.map((a: any) => a.customer_id).filter(Boolean))];
    const { data: futureApps } = await supabase
      .from('appointments')
      .select('customer_id, psychologist_id, start_time, date')
      .in('customer_id', customerIds as string[])
      .eq('status', 'active')
      .gte('date', minStr);

    // Filtrar: só incluir os que NÃO têm sessões futuras (genuínos)
    const genuineAlerts: any[] = [];
    for (const app of appointments) {
      const hasFuture = (futureApps ?? []).some(
        (fa: any) => fa.customer_id === app.customer_id &&
                     fa.psychologist_id === app.psychologist_id &&
                     fa.start_time === app.start_time &&
                     fa.date > app.date
      );
      if (!hasFuture) {
        genuineAlerts.push(app);
      }
    }

    if (genuineAlerts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Todas as renovações já foram resolvidas automaticamente." }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Para detectar conflitos: buscar agendamentos futuros dos psicólogos envolvidos
    const psychIds = [...new Set(genuineAlerts.map((a: any) => a.psychologist_id).filter(Boolean))];
    const { data: psychApps } = await supabase
      .from('appointments')
      .select('date, start_time, end_time, psychologist_id, customer_id, is_internal, internal_title, customer:customers(name)')
      .in('psychologist_id', psychIds as string[])
      .neq('status', 'canceled')
      .gte('date', todayStr);

    // Diagnosticar motivo de cada pendência
    const diagnosed = genuineAlerts.map((app: any) => {
      const customer = Array.isArray(app.customer) ? app.customer[0] : app.customer;
      const isInactive = customer?.status === 'inactive';

      let conflictDetail = '';
      if (!isInactive) {
        // Calcular próxima data
        const freq = app.recurrence_frequency;
        const interval = freq === 'QUINZENAL' ? 14 : 7;
        const nextD = new Date(app.date + 'T12:00:00');
        nextD.setDate(nextD.getDate() + interval);
        const nextDateStr = nextD.toISOString().split('T')[0];
        const nextDateFmt = nextD.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

        // Buscar conflito
        const conflicting = (psychApps ?? []).find((o: any) =>
          o.psychologist_id === app.psychologist_id &&
          o.date === nextDateStr &&
          o.start_time < app.end_time &&
          o.end_time > app.start_time
        );
        if (conflicting) {
          const cName = conflicting.is_internal
            ? (conflicting.internal_title || 'Bloqueio Interno')
            : ((Array.isArray(conflicting.customer) ? conflicting.customer[0]?.name : conflicting.customer?.name) || 'Outro paciente');
          conflictDetail = `Ocupado por <strong>${cName}</strong> (${conflicting.start_time}–${conflicting.end_time}) em ${nextDateFmt}`;
        } else {
          conflictDetail = `Próxima data: ${nextDateFmt}`;
        }
      }

      return {
        ...app,
        _customer: customer,
        _reason: isInactive ? 'inactive' : 'conflict',
        _reasonLabel: isInactive
          ? `⛔ Paciente inativo (${customer?.inactivation_reason || 'motivo não informado'})`
          : '⚠️ Conflito de horário',
        _conflictDetail: conflictDetail,
      };
    });

    // Montar tabela HTML
    let rowsHtml = '';
    diagnosed.forEach((app: any, idx: number) => {
      const customer = app._customer;
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
      const reasonColor = app._reason === 'inactive' ? '#dc2626' : '#d97706';

      rowsHtml += `
        <tr style="background-color: ${bgColor}; border-bottom: 1px solid #eee;">
          <td style="padding: 12px 10px;">
            <strong>${customer?.name || '—'}</strong>
            <br><small style="color: #666;">${customer?.health_plan || 'Particular'}</small>
          </td>
          <td style="padding: 12px 10px; font-size: 13px; color: #555;">${psychologist?.name || '—'}</td>
          <td style="padding: 12px 10px; font-size: 13px; color: #555;">${formattedDate} às ${app.start_time}</td>
          <td style="padding: 12px 10px;">
            <span style="color: ${urgencyColor}; font-weight: bold; font-size: 12px;">${urgencyText}</span>
          </td>
          <td style="padding: 12px 10px;">
            <span style="color: ${reasonColor}; font-weight: bold; font-size: 11px;">${app._reasonLabel}</span>
            ${app._conflictDetail ? `<br><small style="color: #b45309; font-size: 11px;">→ ${app._conflictDetail}</small>` : ''}
          </td>
        </tr>
      `;
    });

    // Contar por motivo
    const inactiveCount = diagnosed.filter((d: any) => d._reason === 'inactive').length;
    const conflictCount = diagnosed.filter((d: any) => d._reason === 'conflict').length;

    let summaryHtml = '';
    if (inactiveCount > 0) {
      summaryHtml += `<li><strong>${inactiveCount}</strong> paciente(s) inativo(s) — a série foi interrompida automaticamente. Dispense o alerta na Agenda ou reative o paciente.</li>`;
    }
    if (conflictCount > 0) {
      summaryHtml += `<li><strong>${conflictCount}</strong> com conflito de horário — o psicólogo já possui outro atendimento nesse horário. Acesse a Agenda na data indicada para resolver manualmente.</li>`;
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #1a365d; color: white; padding: 25px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">⚠️ Renovações que Precisam de Atenção Manual</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.8;">O sistema automático não conseguiu renovar os agendamentos abaixo</p>
        </div>
        <div style="padding: 30px;">
          <p>Olá, Coordenador(a)!</p>
          <p>O sistema de renovação automática tentou estender os agendamentos abaixo, mas encontrou <strong>${genuineAlerts.length} caso(s)</strong> que precisam de intervenção manual:</p>
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; font-size: 13px; color: #92400e; margin: 15px 0;">
            <strong>Motivos encontrados:</strong>
            <ul style="margin: 8px 0 0 0; padding-left: 20px;">
              ${summaryHtml}
            </ul>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 14px;">
            <thead>
              <tr style="text-align: left; background-color: #f1f5f9; color: #475569;">
                <th style="padding: 10px; border-bottom: 2px solid #1a365d;">Paciente</th>
                <th style="padding: 10px; border-bottom: 2px solid #1a365d;">Psicólogo</th>
                <th style="padding: 10px; border-bottom: 2px solid #1a365d;">Data / Horário</th>
                <th style="padding: 10px; border-bottom: 2px solid #1a365d;">Urgência</th>
                <th style="padding: 10px; border-bottom: 2px solid #1a365d;">Motivo</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #1a365d; font-size: 13px; color: #1e40af;">
            <strong>Como resolver:</strong><br>
            Acesse a <strong>Agenda</strong> no sistema Núcleo Priori. Um banner amarelo no topo da página mostrará cada caso pendente com o motivo e as ações disponíveis (Ver na Agenda / Dispensar).
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          <p><strong>Sistema Priori - Gestão Inteligente</strong></p>
          <p>Este alerta é enviado apenas quando a renovação automática não consegue resolver sozinha.</p>
        </div>
      </div>
    `;

    const mailResponse = await resend.emails.send({
      from: "Núcleo Priori <agenda@nucleopriori.com.br>",
      to: ADMIN_EMAIL,
      subject: `⚠️ ${genuineAlerts.length} renovação(ões) precisa(m) de atenção manual - Núcleo Priori`,
      html: emailHtml,
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Email enviado para ${ADMIN_EMAIL}`,
      count: genuineAlerts.length,
      filtered: appointments.length - genuineAlerts.length,
      id: mailResponse.data?.id
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
