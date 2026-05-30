import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_EMAIL = "nucleopriorirj@gmail.com";
const HORIZON_DAYS = 60; // Manter sempre 60 dias de agenda à frente

const resend = new Resend(RESEND_API_KEY);

function getTodayBR(): string {
  const brDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [day, month, year] = brDate.split("/");
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function buildDates(startDate: string, endDate: string, intervalDays: number): string[] {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const end = new Date(endDate + "T23:59:59");
  const dates: string[] = [];
  let i = 0;
  while (i < 52) {
    const cur = new Date(sy, sm - 1, sd + i * intervalDays);
    if (cur > end) break;
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    i++;
  }
  return dates;
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const todayStr = getTodayBR();
  const horizonDate = addDays(todayStr, HORIZON_DAYS);
  console.log(`[AutoRenew] Rolling horizon: ${todayStr} → ${horizonDate}`);

  const renewed: string[] = [];
  const skippedConflict: string[] = [];
  const skippedExisting: string[] = [];
  const errors: string[] = [];

  try {
    // 1. Encontrar todos os grupos de recorrência ativos
    //    Para cada grupo, buscar o último agendamento ativo futuro
    const { data: activeGroups, error: groupErr } = await supabase
      .from("appointments")
      .select("recurrence_group_id, psychologist_id, customer_id, room_id, mode, type, procedure_code, recurrence_frequency, start_time, end_time, custom_price, custom_repass_amount, is_internal, internal_type, internal_title, internal_notes, customer:customers(name), psychologist:psychologists(name)")
      .eq("status", "active")
      .eq("is_recurring", true)
      .not("recurrence_group_id", "is", null)
      .gte("date", todayStr)
      .order("date", { ascending: false });

    if (groupErr) throw groupErr;
    if (!activeGroups || activeGroups.length === 0) {
      console.log("[AutoRenew] Nenhum grupo recorrente ativo encontrado.");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum grupo recorrente.", renewed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Agrupar por recurrence_group_id - pegar o template do grupo
    const groupMap = new Map<string, typeof activeGroups[0]>();
    for (const app of activeGroups) {
      if (app.recurrence_group_id && !groupMap.has(app.recurrence_group_id)) {
        groupMap.set(app.recurrence_group_id, app);
      }
    }

    console.log(`[AutoRenew] ${groupMap.size} grupo(s) recorrente(s) encontrados.`);

    // 2. Para cada grupo, verificar se tem agendamentos cobrindo até horizonDate
    for (const [groupId, template] of groupMap) {
      const customerName = (Array.isArray(template.customer) ? template.customer[0]?.name : (template.customer as any)?.name) || "—";
      const psychName = (Array.isArray(template.psychologist) ? template.psychologist[0]?.name : (template.psychologist as any)?.name) || "—";
      const label = `${customerName} (${psychName})`;

      try {
        // Buscar a última data agendada neste grupo
        const { data: lastApp } = await supabase
          .from("appointments")
          .select("date")
          .eq("recurrence_group_id", groupId)
          .neq("status", "canceled")
          .order("date", { ascending: false })
          .limit(1);

        const lastDate = lastApp?.[0]?.date;
        if (!lastDate) continue;

        // Se já cobre o horizonte, pular
        if (lastDate >= horizonDate) {
          skippedExisting.push(`${label} — coberto até ${lastDate}`);
          continue;
        }

        // Calcular próximas datas a criar
        const intervalDays = template.recurrence_frequency === "QUINZENAL" ? 14 : 7;
        const nextStart = addDays(lastDate, intervalDays);
        const newDates = buildDates(nextStart, horizonDate, intervalDays);

        if (newDates.length === 0) {
          continue;
        }

        // Filtrar datas que já existem
        const { data: existingApps } = await supabase
          .from("appointments")
          .select("date")
          .eq("recurrence_group_id", groupId)
          .in("date", newDates)
          .neq("status", "canceled");

        const existingDates = new Set((existingApps || []).map((a: any) => a.date));
        const datesToCreate = newDates.filter(d => !existingDates.has(d));

        if (datesToCreate.length === 0) {
          skippedExisting.push(`${label} — datas já existentes`);
          continue;
        }

        // Verificar conflitos de horário do psicólogo
        const { data: conflicts } = await supabase
          .from("appointments")
          .select("date, start_time, end_time")
          .eq("psychologist_id", template.psychologist_id)
          .in("date", datesToCreate)
          .neq("status", "canceled");

        const conflictDates: string[] = [];
        const safeDates: string[] = [];
        for (const d of datesToCreate) {
          const hasConflict = (conflicts || []).some(
            (c: any) =>
              c.date === d &&
              ((c.start_time >= template.start_time && c.start_time < template.end_time) ||
                (c.end_time > template.start_time && c.end_time <= template.end_time) ||
                (c.start_time <= template.start_time && c.end_time >= template.end_time))
          );
          if (hasConflict) conflictDates.push(d);
          else safeDates.push(d);
        }

        if (conflictDates.length > 0) {
          skippedConflict.push(`${label} — conflito em: ${conflictDates.join(", ")}`);
        }

        if (safeDates.length === 0) continue;

        // Criar novos agendamentos
        const rows = safeDates.map((dateStr) => {
          const dateObj = new Date(dateStr + "T12:00:00");
          return {
            customer_id: template.is_internal ? null : (template.customer_id || null),
            psychologist_id: template.psychologist_id,
            room_id: template.room_id ?? null,
            mode: template.mode,
            type: template.type,
            procedure_code: template.procedure_code ?? null,
            date: dateStr,
            day_of_week: dateObj.getDay(),
            start_time: template.start_time,
            end_time: template.end_time,
            status: "active",
            is_recurring: true,
            recurrence_frequency: template.recurrence_frequency ?? "SEMANAL",
            recurrence_group_id: groupId,
            needs_renewal: false,
            custom_price: template.custom_price ?? null,
            custom_repass_amount: template.custom_repass_amount ?? null,
            confirmation_status: "pending",
            is_internal: template.is_internal ?? false,
            internal_type: template.is_internal ? (template.internal_type ?? null) : null,
            internal_title: template.is_internal ? (template.internal_title ?? null) : null,
            internal_notes: template.is_internal ? (template.internal_notes ?? null) : null,
          };
        });

        const { error: insertErr } = await supabase.from("appointments").insert(rows);
        if (insertErr) {
          errors.push(`${label}: ${insertErr.message}`);
          continue;
        }

        console.log(`[AutoRenew] OK: ${label} → ${safeDates.length} sessões criadas (${safeDates[0]} a ${safeDates[safeDates.length - 1]})`);
        renewed.push(`${label} → ${safeDates.length} sessões (${safeDates[0]} a ${safeDates[safeDates.length - 1]})`);
      } catch (err: any) {
        errors.push(`${label}: ${err.message}`);
      }
    }

    // 3. Enviar e-mail de resumo para o admin
    if (renewed.length > 0 || skippedConflict.length > 0 || errors.length > 0) {
      const renewedHtml = renewed.length > 0
        ? `<h3 style="color:#16a34a;">✅ Estendidos automaticamente (${renewed.length})</h3><ul>${renewed.map(r => `<li>${r}</li>`).join("")}</ul>`
        : "";

      const conflictHtml = skippedConflict.length > 0
        ? `<h3 style="color:#f59e0b;">⚠️ Pulados por conflito de horário (${skippedConflict.length})</h3><ul>${skippedConflict.map(r => `<li>${r}</li>`).join("")}</ul><p style="color:#92400e;font-size:13px;">Estes precisam de ajuste manual na agenda.</p>`
        : "";

      const errorHtml = errors.length > 0
        ? `<h3 style="color:#ef4444;">❌ Erros (${errors.length})</h3><ul>${errors.map(r => `<li>${r}</li>`).join("")}</ul>`
        : "";

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
          <div style="background-color:#1a365d;color:white;padding:25px;text-align:center;">
            <h1 style="margin:0;font-size:20px;">🔄 Extensão Automática de Agenda (Rolling 60 dias)</h1>
            <p style="margin:5px 0 0;opacity:0.8;">Resumo da execução de ${todayStr}</p>
          </div>
          <div style="padding:30px;font-size:14px;">
            ${renewedHtml}
            ${conflictHtml}
            ${errorHtml}
            ${renewed.length === 0 && skippedConflict.length === 0 && errors.length === 0 ? "<p>Nenhuma ação necessária hoje. Todos os grupos já cobrem o horizonte de 60 dias.</p>" : ""}
          </div>
          <div style="background-color:#f8fafc;padding:15px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
            <p><strong>Sistema Priori - Renovação Automática</strong></p>
          </div>
        </div>
      `;

      await resend.emails.send({
        from: "Núcleo Priori <agenda@nucleopriori.com.br>",
        to: ADMIN_EMAIL,
        subject: `🔄 Extensão automática: ${renewed.length} estendido(s), ${skippedConflict.length} com conflito - Núcleo Priori`,
        html: emailHtml,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        renewed: renewed.length,
        skippedConflict: skippedConflict.length,
        skippedExisting: skippedExisting.length,
        errors: errors.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[AutoRenew] Erro fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
