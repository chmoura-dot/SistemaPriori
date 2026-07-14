/**
 * Script de limpeza: remove custom_price/custom_repass_amount que foram
 * auto-preenchidos pelo bug do ScheduleFormModal.
 *
 * Lógica: se custom_price bate exatamente com algum procedure.price do plano
 * do paciente, significa que foi copiado automaticamente (redundante).
 * Valores que NÃO batem com nenhum procedimento são overrides legítimos e preservados.
 *
 * Também recalcula o totalAmount de todos os repasses.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ntqkrxtesuaeobxpmznr.supabase.co';
const SERVICE_ROLE_KEY = process.env.SRK!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface Plan {
  id: string;
  name: string;
  procedures: { code: string; type: string; price: number; repassAmount: number }[];
}

interface Customer {
  id: string;
  health_plan: string;
  custom_price: number | null;
  custom_repass_amount: number | null;
}

interface Appointment {
  id: string;
  customer_id: string;
  type: string;
  procedure_code: string | null;
  custom_repass_amount: number | null;
  custom_price: number | null;
  date: string;
  billing_batch_id: string | null;
}

interface Repasse {
  id: string;
  appointment_ids: string[];
  total_amount: number;
  psychologist_id: string;
}

async function main() {
  console.log('🔍 Carregando dados...');

  // 1. Load plans
  const { data: plans } = await supabase.from('plans').select('id,name,procedures');
  if (!plans) { console.error('Erro ao carregar planos'); return; }
  console.log(`  ${plans.length} planos carregados`);

  // 2. Load customers
  const { data: customers } = await supabase.from('customers').select('id,health_plan,custom_price,custom_repass_amount');
  if (!customers) { console.error('Erro ao carregar pacientes'); return; }
  console.log(`  ${customers.length} pacientes carregados`);

  // 3. Load appointments with custom values
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id,customer_id,type,procedure_code,custom_repass_amount,custom_price,date,billing_batch_id')
    .or('custom_repass_amount.not.is.null,custom_price.not.is.null');
  if (!appointments) { console.error('Erro ao carregar atendimentos'); return; }
  console.log(`  ${appointments.length} atendimentos com custom values`);

  // 4. Load repasses
  const { data: repasses } = await supabase.from('repasses').select('id,appointment_ids,total_amount,psychologist_id');
  if (!repasses) { console.error('Erro ao carregar repasses'); return; }
  console.log(`  ${repasses.length} repasses carregados`);

  // Build plan lookup: healthPlan name (uppercase) → plan
  const planMap = new Map<string, Plan>();
  for (const p of plans as Plan[]) {
    planMap.set(p.name.toUpperCase(), p);
  }

  // Build customer lookup
  const customerMap = new Map<string, Customer>();
  for (const c of customers as Customer[]) {
    customerMap.set(c.id, c);
  }

  // --- PHASE 1: Identify appointments to clean ---
  const toClean: string[] = [];
  const preserved: { id: string; reason: string }[] = [];

  for (const app of appointments as Appointment[]) {
    const customer = customerMap.get(app.customer_id);
    if (!customer) {
      preserved.push({ id: app.id, reason: 'paciente não encontrado' });
      continue;
    }

    // Se o PACIENTE tem override explícito (custom_price no cadastro), preservar
    if (customer.custom_price != null && customer.custom_price > 0) {
      preserved.push({ id: app.id, reason: `paciente tem customPrice=${customer.custom_price}` });
      continue;
    }
    if (customer.custom_repass_amount != null && customer.custom_repass_amount > 0) {
      preserved.push({ id: app.id, reason: `paciente tem customRepass=${customer.custom_repass_amount}` });
      continue;
    }

    // Buscar plano do paciente
    const hp = (customer.health_plan || '').toUpperCase();
    const plan = planMap.get(hp);

    if (!plan) {
      // Particular sem plano: se tem custom values, são overrides legítimos
      if (hp === '' || hp === 'PARTICULAR') {
        preserved.push({ id: app.id, reason: `particular com customPrice=${app.custom_price}` });
        continue;
      }
      // Plano não encontrado
      preserved.push({ id: app.id, reason: `plano '${hp}' não encontrado` });
      continue;
    }

    // Verificar se custom_price bate com algum procedimento do plano
    const matchesAnyProcedure = plan.procedures.some(proc => {
      const priceMatch = app.custom_price != null && Math.abs(proc.price - app.custom_price) < 0.01;
      const repassMatch = app.custom_repass_amount != null && Math.abs(proc.repassAmount - app.custom_repass_amount) < 0.01;
      return priceMatch || repassMatch;
    });

    if (matchesAnyProcedure) {
      toClean.push(app.id);
    } else {
      // Verificar se é um calcRepass(price, 50%) — outro padrão do bug
      const matchesCalcRepass = plan.procedures.some(proc => {
        return app.custom_price != null && Math.abs(proc.price - app.custom_price) < 0.01;
      });
      if (matchesCalcRepass) {
        toClean.push(app.id);
      } else {
        preserved.push({ id: app.id, reason: `override legítimo: price=${app.custom_price}, repass=${app.custom_repass_amount}` });
      }
    }
  }

  console.log(`\n📊 Resultado da análise:`);
  console.log(`  ✅ ${toClean.length} atendimentos para limpar (auto-preenchidos pelo bug)`);
  console.log(`  🔒 ${preserved.length} atendimentos preservados (overrides legítimos)`);

  // Print preserved for review
  if (preserved.length > 0 && preserved.length <= 30) {
    console.log('\n  Preservados:');
    for (const p of preserved) {
      console.log(`    - ${p.id.slice(0, 8)}… → ${p.reason}`);
    }
  }

  // --- PHASE 2: Null out custom values in batches ---
  if (toClean.length > 0) {
    console.log(`\n🧹 Limpando ${toClean.length} atendimentos...`);
    const batchSize = 50;
    let cleaned = 0;
    for (let i = 0; i < toClean.length; i += batchSize) {
      const batch = toClean.slice(i, i + batchSize);
      const { error } = await supabase
        .from('appointments')
        .update({ custom_price: null, custom_repass_amount: null })
        .in('id', batch);
      if (error) {
        console.error(`  ❌ Erro no batch ${i}: ${error.message}`);
      } else {
        cleaned += batch.length;
        console.log(`  ✓ ${cleaned}/${toClean.length} limpos`);
      }
    }
    console.log(`  ✅ ${cleaned} atendimentos limpos`);
  }

  // --- PHASE 3: Recalculate repasse totalAmounts ---
  // Load ALL appointments fresh (after cleanup)
  const { data: allApps } = await supabase
    .from('appointments')
    .select('id,customer_id,psychologist_id,type,procedure_code,custom_repass_amount,custom_price,billing_status');
  if (!allApps) { console.error('Erro ao recarregar atendimentos'); return; }
  const appMap = new Map<string, any>();
  for (const a of allApps) appMap.set(a.id, a);

  // Load psychologists
  const { data: psychologists } = await supabase.from('psychologists').select('id,repass_rate,repass_fixed_amount,repass_overrides_plan');
  const psyMap = new Map<string, any>();
  if (psychologists) for (const p of psychologists) psyMap.set(p.id, p);

  console.log(`\n📊 Recalculando ${repasses.length} repasses...`);
  let repassesUpdated = 0;

  for (const rep of repasses as Repasse[]) {
    const psy = psyMap.get(rep.psychologist_id);
    let totalCents = 0;

    for (const appId of rep.appointment_ids) {
      const app = appMap.get(appId);
      if (!app) continue;
      if (app.billing_status === 'denied') continue;

      // Calcular repasse usando a mesma hierarquia do RepassePage
      // 1. Override manual no atendimento
      if (app.custom_repass_amount != null && app.custom_repass_amount > 0) {
        totalCents += Math.round(app.custom_repass_amount * 100);
        continue;
      }

      // 2. Override manual no paciente
      const customer = customerMap.get(app.customer_id);
      if (customer?.custom_repass_amount != null && customer.custom_repass_amount > 0) {
        totalCents += Math.round(customer.custom_repass_amount * 100);
        continue;
      }

      // Calcular preço bruto (gross)
      let gross = 0;
      if (app.custom_price != null && app.custom_price > 0) {
        gross = app.custom_price;
      } else if (customer) {
        const hp = (customer.health_plan || '').toUpperCase();
        const plan = planMap.get(hp);
        if (plan) {
          const procByCode = app.procedure_code
            ? plan.procedures.find((p: any) => p.code === app.procedure_code)
            : undefined;
          const proc = procByCode ?? plan.procedures.find((p: any) => p.type === app.type);
          if (proc) gross = proc.price;
        }
      }
      if (gross <= 0) continue;

      // 3. Contrato pessoal do psicólogo (repassOverridesPlan)
      if (psy?.repass_overrides_plan && (psy.repass_rate != null || (psy.repass_fixed_amount != null && psy.repass_fixed_amount > 0))) {
        if (psy.repass_fixed_amount != null && psy.repass_fixed_amount > 0) {
          totalCents += Math.round(psy.repass_fixed_amount * 100);
        } else {
          totalCents += Math.round(gross * (psy.repass_rate ?? 0.5) * 100);
        }
        continue;
      }

      // 4. Valor do plano (procedure.repassAmount)
      if (customer) {
        const hp = (customer.health_plan || '').toUpperCase();
        const plan = planMap.get(hp);
        if (plan) {
          const procByCode = app.procedure_code
            ? plan.procedures.find((p: any) => p.code === app.procedure_code)
            : undefined;
          const proc = procByCode ?? plan.procedures.find((p: any) => p.type === app.type);
          if (proc?.repassAmount != null && proc.repassAmount > 0) {
            totalCents += Math.round(proc.repassAmount * 100);
            continue;
          }
        }
      }

      // 5. Fallback: regra do psicólogo ou 50%
      if (psy?.repass_fixed_amount != null && psy.repass_fixed_amount > 0) {
        totalCents += Math.round(psy.repass_fixed_amount * 100);
      } else {
        totalCents += Math.round(gross * (psy?.repass_rate ?? 0.5) * 100);
      }
    }

    const newTotal = totalCents / 100;
    if (Math.abs(newTotal - rep.total_amount) >= 0.01) {
      console.log(`  🔄 Repasse ${rep.id.slice(0, 8)}… : R$ ${rep.total_amount.toFixed(2)} → R$ ${newTotal.toFixed(2)}`);
      const { error } = await supabase
        .from('repasses')
        .update({ total_amount: newTotal })
        .eq('id', rep.id);
      if (error) {
        console.error(`    ❌ Erro: ${error.message}`);
      } else {
        repassesUpdated++;
      }
    }
  }

  console.log(`\n✅ Concluído!`);
  console.log(`  ${toClean.length} atendimentos limpos`);
  console.log(`  ${repassesUpdated} repasses atualizados`);
  console.log(`  ${preserved.length} overrides legítimos preservados`);
}

main().catch(console.error);
