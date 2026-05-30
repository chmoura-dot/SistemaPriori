import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_EMAIL = "nucleopriorirj@gmail.com";

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

function buildDates(
  startDate: string,
  intervalDays: number
): string[] {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  // Corte = último dia do mês seguinte ao mês de início
  const endM = sm === 12 ? 1 : sm + 1;
  const endY = sm === 12 ? sy + 1 : sy;
  const endDate = new Date(endY, endM, 0); // último dia do mês seguinte

  const dates: string[] = [];
  let i = 0;
  while (i < 52) {
    const cur = new Date(sy, sm - 1, sd + i * intervalDays);
    if (cur > endDate) break;
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
  console.log(`[AutoRenew] Executando em ${todayStr}`);

  const renewed: string[] = [];
  const skippedConflict: string[] = [];
  const skippedExisting: string[] = [];
  const errors: string[] = [];

  try {
    // 1. Buscar agendamentos que precisam de renovação (data <= hoje)
    const { data: pendingApps, error: fetchErr } = await supabase
      .from("appointments")
      .select(
        "id, date, start_time, end_time, customer_id, psychologist_id, room_id, mode, type, procedure_code, recurrence_frequency, recurrence_group_id, custom_price, custom_repass_amount, is_internal, internal_type, internal_title, internal_notes, customer:customers(name), psychologist:psychologists(name)"
      )
      .eq("needs_renewal", true)
      .eq("status", "active")
      .lte("date", todayStr)
      .order("date", { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!pendingApps || pendingApps.length === 0) {
      console.log("[AutoRenew] Nenhuma renovação pendente.");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma renovação pendente.", renewed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[AutoRenew] Encontrados ${pendingApps.length} agendamento(s) para renovar.`);

    // 2. Processar cada agendamento
    for (const app of pendingApps) {
      const customerName = (Array.isArray(app.customer) ? app.customer[0]?.name : (app.customer as any)?.name) || "—";
      const psychName = (Array.isArray(app.psychologist) ? app.psychologist[0]?.name : (app.psychologist as any)?.name) || "—";
      const label = `${customerName} (${psychName}) - ${app.date}`;

      try {
        const intervalDays = app.recurrence_frequency === "QUINZENAL" ? 14 : 7;

        // Calcular próxima data (dia seguinte ao último agendamento do ciclo)
        const lastDate = new Date(app.date + "T12:00:00");
        lastDate.setDate(lastDate.getDate() + intervalDays);
        const nextDateStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;

        // Idempotência: verificar se já existe agendamento futuro neste grupo
        if (app.recurrence_group_id) {
          const { data: futureApps } = await supabase
            .from("appointments")
            .select("id")
            .eq("recurrence_group_id", app.recurrence_group_id)
            .gt("date", app.date)
            .neq("status", "canceled")
            .limit(1);

          if (futureApps && futureApps.length > 0) {
            console.log(`[AutoRenew] SKIP (já renovado): ${label}`);
            // Limpar flag e seguir
            await supabase.from("appointments").update({ needs_renewal: false }).eq("id", app.id);
            skippedExisting.push(label);
            continue;
          }
        }

        // Gerar datas do novo ciclo
        const newDates = buildDates(nextDateStr, intervalDays);
        if (newDates.length === 0) {
          errors.push(`${label}: nenhuma data gerada`);
          continue;
        }

        // Verificar conflitos
        const { data: conflicts } = await supabase
          .from("appointments")
          .select("date, start_time, end_time")
          .eq("psychologist_id", app.psychologist_id)
          .in("date", newDates)
          .neq("status", "canceled");

        const conflictDates: string[] = [];
        for (const d of newDates) {
          const hasConflict = (conflicts || []).some(
            (c: any) =>
              c.date === d &&
              ((c.start_time >= app.start_time && c.start_time < app.end_time) ||
                (c.end_time > app.start_time && c.end_time <= app.end_time) ||
                (c.start_time <= app.start_time && c.end_time >= app.end_time))
          );
          if (hasConflict) conflictDates.push(d);
        }

        if (conflictDates.length > 0) {
          console.log(`[AutoRenew] SKIP (conflito em ${conflictDates.join(", ")}): ${label}`);
          skippedConflict.push(`${label} — conflito em: ${conflictDates.join(", ")}`);
          continue;
        }

        // Gerar novo group_id
        const newGroupId = crypto.randomUUID();

        // Montar rows
        const rows = newDates.map((dateStr, idx) => {
          const dateObj = new Date(dateStr + "T12:00:00");
          return {
            customer_id: app.is_internal ? null : (app.customer_id || null),
            psychologist_id: app.psychologist_id,
            room_id: app.room_id ?? null,
            mode: app.mode,
            type: app.type,
            procedure_code: app.procedure_code ?? null,
            date: dateStr,
            day_of_week: dateObj.getDay(),
            start_time: app.start_time,
            end_time: app.end_time,
            status: "active",
            is_recurring: true,
            recurrence_frequency: app.recurrence_frequency ?? "SEMANAL",
            recurrence_group_id: newGroupId,
            needs_renewal: idx === newDates.length - 1, // último = true
            custom_price: app.custom_price ?? null,
            custom_repass_amount: app.custom_repass_amount ?? null,
            confirmation_status: "pending",
            is_internal: app.is_internal ?? false,
            internal_type: app.is_internal ? (app.internal_type ?? null) : null,
            internal_title: app.is_internal ? (app.internal_title ?? null) : null,
            internal_notes: app.is_internal ? (app.internal_notes ?? null) : null,
          };
        });

        // Inserir novo lote
        const { error: insertErr } = await supabase.from("appointments").insert(rows);
        if (insertErr) {
          errors.push(`${label}: ${insertErr.message}`);
          continue;
        }

        // Marcar o agendamento antigo como renovado
        await supabase.from("appointments").update({ needs_renewal: false }).eq("id", app.id);

        console.log(`[AutoRenew] OK: ${label} → ${newDates.length} sessões criadas (${newDates[0]} a ${newDates[newDates.length - 1]})`);
        renewed.push(`${label} → ${newDates.length} sessões (${newDates[0]} a ${newDates[newDates.length - 1]})`);
      } catch (err: any) {
        errors.push(`${label}: ${err.message}`);
      }
    }

    // 3. Enviar e-mail de resumo para o admin
    if (renewed.length > 0 || skippedConflict.length > 0 || errors.length > 0) {
      const renewedHtml = renewed.length > 0
        ? `<h3 style="color:#16a34a;">✅ Renovados automaticamente (${renewed.length})</h3><ul>${renewed.map(r => `<li>${r}</li>`).join("")}</ul>`
        : "";

      const conflictHtml = skippedConflict.length > 0
        ? `<h3 style="color:#f59e0b;">⚠️ Pulados por conflito de horário (${skippedConflict.length})</h3><ul>${skippedConflict.map(r => `<li>${r}</li>`).join("")}</ul><p style="color:#92400e;font-size:13px;">Estes precisam de renovação manual na agenda.</p>`
        : "";

      const errorHtml = errors.length > 0
        ? `<h3 style="color:#ef4444;">❌ Erros (${errors.length})</h3><ul>${errors.map(r => `<li>${r}</li>`).join("")}</ul>`
        : "";

      const existingHtml = skippedExisting.length > 0
        ? `<h3 style="color:#6b7280;">ℹ️ Já renovados anteriormente (${skippedExisting.length})</h3><ul>${skippedExisting.map(r => `<li>${r}</li>`).join("")}</ul>`
        : "";

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
          <div style="background-color:#1a365d;color:white;padding:25px;text-align:center;">
            <h1 style="margin:0;font-size:20px;">🔄 Renovação Automática de Agenda</h1>
            <p style="margin:5px 0 0;opacity:0.8;">Resumo da execução de ${todayStr}</p>
          </div>
          <div style="padding:30px;font-size:14px;">
            ${renewedHtml}
            ${conflictHtml}
            ${errorHtml}
            ${existingHtml}
            ${renewed.length === 0 && skippedConflict.length === 0 && errors.length === 0 ? "<p>Nenhuma ação necessária hoje.</p>" : ""}
          </div>
          <div style="background-color:#f8fafc;padding:15px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
            <p><strong>Sistema Priori - Renovação Automática</strong></p>
          </div>
        </div>
      `;

      await resend.emails.send({
        from: "Núcleo Priori <agenda@nucleopriori.com.br>",
        to: ADMIN_EMAIL,
        subject: `🔄 Renovação automática: ${renewed.length} renovado(s), ${skippedConflict.length} com conflito - Núcleo Priori`,
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
