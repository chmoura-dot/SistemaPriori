import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_EMAIL = "nucleopriorirj@gmail.com";
const HORIZON_DAYS = 60; // Base: 60 dias, depois expande até fim do mês

const resend = new Resend(RESEND_API_KEY);

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface RenewedEntry {
  customerName: string;
  psychName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  count: number;
  firstDate: string;
  lastDate: string;
}

interface ConflictEntry {
  customerName: string;
  psychName: string;
  startTime: string;
  endTime: string;
  dates: string[];
}

interface InactiveEntry {
  customerName: string;
  psychName: string;
  reason: string;
}

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

/** Retorna o último dia do mês contido em dateStr (YYYY-MM-DD) */
function getEndOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  // new Date(year, monthIndex, 0) → último dia do mês anterior ao monthIndex
  // Como m vem 1-indexed (ex: 8 para agosto), Date(y, 8, 0) = 31/08 ✓
  const lastDay = new Date(y, m, 0);
  const year = lastDay.getFullYear();
  const month = String(lastDay.getMonth() + 1).padStart(2, "0");
  const day = String(lastDay.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
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
  const rawHorizon = addDays(todayStr, HORIZON_DAYS);
  const horizonDate = getEndOfMonth(rawHorizon); // Sempre cobre até o fim do mês
  console.log(`[AutoRenew] Rolling horizon: ${todayStr} → ${rawHorizon} (60d) → ${horizonDate} (fim do mês)`);

  const renewed: RenewedEntry[] = [];
  const skippedConflict: ConflictEntry[] = [];
  const skippedInactive: InactiveEntry[] = [];
  const skippedExisting: string[] = [];
  const errors: string[] = [];

  try {
    // 1. Encontrar todos os grupos de recorrência ativos
    const { data: activeGroups, error: groupErr } = await supabase
      .from("appointments")
      .select("recurrence_group_id, psychologist_id, customer_id, room_id, mode, type, procedure_code, recurrence_frequency, start_time, end_time, custom_price, custom_repass_amount, is_internal, internal_type, internal_title, internal_notes, customer:customers(name, status, inactivation_reason), psychologist:psychologists(name)")
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

    console.log(`[AutoRenew] ${groupMap.size} grupo(s) recorrente(s) encontrados. Horizonte até ${horizonDate}.`);

    // 2. Para cada grupo, verificar se tem agendamentos cobrindo até horizonDate
    for (const [groupId, template] of groupMap) {
      const customerObj = Array.isArray(template.customer) ? template.customer[0] : (template.customer as any);
      const customerName = customerObj?.name || "—";
      const psychName = (Array.isArray(template.psychologist) ? template.psychologist[0]?.name : (template.psychologist as any)?.name) || "—";
      const label = `${customerName} (${psychName})`;

      // Pular grupos de pacientes inativos (alta, desistência, perda de plano)
      if (!template.is_internal && customerObj?.status === "inactive") {
        const reason = customerObj?.inactivation_reason || "Motivo não informado";
        skippedInactive.push({ customerName, psychName, reason });
        console.log(`[AutoRenew] SKIP (inativo): ${label} — ${reason}`);
        continue;
      }

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
          skippedExisting.push(`${label} — coberto até ${formatDateBR(lastDate)}`);
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
          skippedConflict.push({
            customerName,
            psychName,
            startTime: template.start_time,
            endTime: template.end_time,
            dates: conflictDates,
          });
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
            renewed_at: new Date().toISOString(),
            renewed_by: "auto-renew-cron",
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

        // Limpar flag needs_renewal dos appointments antigos do grupo
        const { error: clearErr } = await supabase
          .from("appointments")
          .update({ needs_renewal: false })
          .eq("recurrence_group_id", groupId)
          .eq("needs_renewal", true);

        if (clearErr) {
          console.warn(`[AutoRenew] Aviso: falha ao limpar needs_renewal do grupo ${groupId}: ${clearErr.message}`);
        }

        // Derivar dia da semana da primeira data criada
        const dayIndex = new Date(safeDates[0] + "T12:00:00").getDay();
        const dayName = DIAS_SEMANA[dayIndex];

        console.log(`[AutoRenew] OK: ${label} → ${safeDates.length} sessões criadas (${safeDates[0]} a ${safeDates[safeDates.length - 1]})`);
        renewed.push({
          customerName,
          psychName,
          dayOfWeek: dayName,
          startTime: template.start_time,
          endTime: template.end_time,
          count: safeDates.length,
          firstDate: safeDates[0],
          lastDate: safeDates[safeDates.length - 1],
        });
      } catch (err: any) {
        errors.push(`${label}: ${err.message}`);
      }
    }

    // 3. Montar e enviar e-mail de resumo (somente quando houver ação)
    const hasAction = renewed.length > 0 || skippedConflict.length > 0 || skippedInactive.length > 0 || errors.length > 0;

    // --- Tabela de estendidos ---
    let renewedHtml = "";
    if (renewed.length > 0) {
      const rowsHtml = renewed.map((r, i) => {
        const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
        return `<tr style="background:${bg};">
          <td style="padding:10px;border-bottom:1px solid #eee;">${r.customerName}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${r.psychName}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${r.dayOfWeek} ${r.startTime}–${r.endTime}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${r.count}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${formatDateBR(r.firstDate)} → ${formatDateBR(r.lastDate)}</td>
        </tr>`;
      }).join("");

      renewedHtml = `
        <h3 style="color:#16a34a;">✅ Estendidos automaticamente (${renewed.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0 20px;">
          <thead>
            <tr style="background:#f1f5f9;color:#475569;text-align:left;">
              <th style="padding:10px;border-bottom:2px solid #16a34a;">Paciente</th>
              <th style="padding:10px;border-bottom:2px solid #16a34a;">Psicólogo</th>
              <th style="padding:10px;border-bottom:2px solid #16a34a;">Dia / Horário</th>
              <th style="padding:10px;border-bottom:2px solid #16a34a;text-align:center;">Sessões</th>
              <th style="padding:10px;border-bottom:2px solid #16a34a;">Período</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    }

    // --- Tabela de conflitos ---
    let conflictHtml = "";
    if (skippedConflict.length > 0) {
      const rowsHtml = skippedConflict.map((c, i) => {
        const bg = i % 2 === 0 ? "#ffffff" : "#fefce8";
        const datesFormatted = c.dates.map(formatDateBR).join(", ");
        return `<tr style="background:${bg};">
          <td style="padding:10px;border-bottom:1px solid #eee;">${c.customerName}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${c.psychName}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${c.startTime}–${c.endTime}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;color:#b45309;">${datesFormatted}</td>
        </tr>`;
      }).join("");

      conflictHtml = `
        <h3 style="color:#f59e0b;">⚠️ Pulados por conflito de horário (${skippedConflict.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0 10px;">
          <thead>
            <tr style="background:#fef3c7;color:#92400e;text-align:left;">
              <th style="padding:10px;border-bottom:2px solid #f59e0b;">Paciente</th>
              <th style="padding:10px;border-bottom:2px solid #f59e0b;">Psicólogo</th>
              <th style="padding:10px;border-bottom:2px solid #f59e0b;">Horário</th>
              <th style="padding:10px;border-bottom:2px solid #f59e0b;">Datas com conflito</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="color:#92400e;font-size:13px;">Estes precisam de ajuste manual na agenda.</p>`;
    }

    // --- Tabela de pacientes inativos (alta / desistência) ---
    let inactiveHtml = "";
    if (skippedInactive.length > 0) {
      const rowsHtml = skippedInactive.map((p, i) => {
        const bg = i % 2 === 0 ? "#ffffff" : "#fef2f2";
        return `<tr style="background:${bg};">
          <td style="padding:10px;border-bottom:1px solid #eee;">${p.customerName}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;">${p.psychName}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;color:#991b1b;">${p.reason}</td>
        </tr>`;
      }).join("");

      inactiveHtml = `
        <h3 style="color:#dc2626;">⛔ Bloqueados — Paciente inativo (${skippedInactive.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0 10px;">
          <thead>
            <tr style="background:#fee2e2;color:#991b1b;text-align:left;">
              <th style="padding:10px;border-bottom:2px solid #dc2626;">Paciente</th>
              <th style="padding:10px;border-bottom:2px solid #dc2626;">Psicólogo</th>
              <th style="padding:10px;border-bottom:2px solid #dc2626;">Motivo da inativação</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="color:#991b1b;font-size:13px;">⚠️ Secretaria: ajuste manualmente os horários ou reative o paciente no sistema.</p>`;
    }

    // --- Erros ---
    const errorHtml = errors.length > 0
      ? `<h3 style="color:#ef4444;">❌ Erros (${errors.length})</h3><ul>${errors.map(r => `<li>${r}</li>`).join("")}</ul>`
      : "";

    // --- Cobertos (apenas resumo) ---
    const coveredHtml = skippedExisting.length > 0
      ? `<p style="font-size:13px;color:#6b7280;margin-top:15px;">📋 ${skippedExisting.length} grupo(s) já coberto(s) até o fim do mês — nenhuma ação necessária.</p>`
      : "";

    // --- Subject ---
    const subjectEmoji = errors.length > 0 ? "❌" : skippedConflict.length > 0 ? "⚠️" : renewed.length > 0 ? "🔄" : "✅";
    const subjectText = hasAction
      ? `${subjectEmoji} Extensão automática: ${renewed.length} estendido(s), ${skippedConflict.length} com conflito`
      : `✅ Auto-renovação OK — ${skippedExisting.length} grupo(s) cobertos até ${formatDateBR(horizonDate)}`;

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;color:#333;max-width:750px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
        <div style="background-color:#1a365d;color:white;padding:25px;text-align:center;">
          <h1 style="margin:0;font-size:20px;">🔄 Extensão Automática de Agenda</h1>
          <p style="margin:5px 0 0;opacity:0.8;">Horizonte: ${formatDateBR(todayStr)} → ${formatDateBR(horizonDate)} (fim do mês)</p>
        </div>
        <div style="padding:30px;font-size:14px;">
          ${renewedHtml}
          ${conflictHtml}
          ${inactiveHtml}
          ${errorHtml}
          ${coveredHtml}
          ${!hasAction && skippedExisting.length === 0 ? "<p>Nenhum grupo recorrente ativo encontrado na base.</p>" : ""}
          ${!hasAction && skippedExisting.length > 0 ? "<p style='color:#16a34a;font-weight:bold;margin-top:20px;'>✅ Tudo certo — todos os grupos já cobrem o horizonte até o fim do mês.</p>" : ""}
        </div>
        <div style="background-color:#f8fafc;padding:15px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
          <p><strong>Sistema Priori - Renovação Automática</strong></p>
        </div>
      </div>
    `;

    if (hasAction) {
      await resend.emails.send({
        from: "Núcleo Priori <agenda@nucleopriori.com.br>",
        to: ADMIN_EMAIL,
        subject: `${subjectText} - Núcleo Priori`,
        html: emailHtml,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        horizon: horizonDate,
        renewed: renewed.length,
        skippedConflict: skippedConflict.length,
        skippedInactive: skippedInactive.length,
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
