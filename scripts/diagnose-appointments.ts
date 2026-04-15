/**
 * Script de diagnóstico completo para agendamentos
 * Verifica: dados no banco, RLS, e o que o frontend veria
 * 
 * Uso: npx tsx scripts/diagnose-appointments.ts
 * (Requer VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY no ambiente)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Variáveis de ambiente não encontradas!');
  console.error('   Defina VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Cliente com service role (bypassa RLS)
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

// Cliente com anon key (simula o frontend)
const supabaseAnon = anonKey ? createClient(supabaseUrl, anonKey) : null;

async function diagnose() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const future = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
  const pastStr = past.toISOString().split('T')[0];
  const futureStr = future.toISOString().split('T')[0];

  console.log('='.repeat(60));
  console.log('🔍 DIAGNÓSTICO DE AGENDAMENTOS');
  console.log('='.repeat(60));
  console.log(`📅 Hoje: ${todayStr}`);
  console.log(`📅 Janela frontend: ${pastStr} → ${futureStr}`);
  console.log('');

  // ── 1. TOTAL DE REGISTROS (sem filtro, admin) ──────────────
  console.log('1️⃣  TOTAL DE REGISTROS NO BANCO (sem filtro):');
  const { count: totalCount, error: totalErr } = await supabaseAdmin
    .from('appointments')
    .select('*', { count: 'exact', head: true });
  
  if (totalErr) {
    console.error('   ❌ Erro:', totalErr.message);
  } else {
    console.log(`   Total: ${totalCount} agendamentos`);
    if ((totalCount ?? 0) > 1000) {
      console.log('   ⚠️  ATENÇÃO: Mais de 1000 registros! Limite padrão do Supabase.');
    }
  }
  console.log('');

  // ── 2. AGENDAMENTOS POR MÊS (admin, sem filtro) ────────────
  console.log('2️⃣  AGENDAMENTOS POR MÊS (admin, sem filtro de data):');
  const { data: allApps, error: allErr } = await supabaseAdmin
    .from('appointments')
    .select('date, status')
    .order('date');

  if (allErr) {
    console.error('   ❌ Erro:', allErr.message);
  } else {
    const byMonth: Record<string, { total: number; active: number; canceled: number }> = {};
    allApps?.forEach((a: any) => {
      const month = a.date?.substring(0, 7) ?? 'sem-data';
      if (!byMonth[month]) byMonth[month] = { total: 0, active: 0, canceled: 0 };
      byMonth[month].total++;
      if (a.status === 'canceled') byMonth[month].canceled++;
      else byMonth[month].active++;
    });
    Object.entries(byMonth).sort().forEach(([month, counts]) => {
      const flag = month >= '2026-05' ? '🔴' : '✅';
      console.log(`   ${flag} ${month}: ${counts.total} total (${counts.active} ativos, ${counts.canceled} cancelados)`);
    });
  }
  console.log('');

  // ── 3. SIMULAR QUERY DO FRONTEND (admin) ──────────────────
  console.log('3️⃣  SIMULANDO QUERY DO FRONTEND (admin, com janela de datas):');
  const { data: frontendData, error: frontendErr } = await supabaseAdmin
    .from('appointments')
    .select('date, status')
    .gte('date', pastStr)
    .lte('date', futureStr)
    .order('date');

  if (frontendErr) {
    console.error('   ❌ Erro:', frontendErr.message);
  } else {
    console.log(`   Total retornado: ${frontendData?.length ?? 0} agendamentos`);
    const byMonth2: Record<string, number> = {};
    frontendData?.forEach((a: any) => {
      const month = a.date?.substring(0, 7) ?? 'sem-data';
      byMonth2[month] = (byMonth2[month] || 0) + 1;
    });
    Object.entries(byMonth2).sort().forEach(([month, count]) => {
      const flag = month >= '2026-05' ? '🔴' : '✅';
      console.log(`   ${flag} ${month}: ${count} agendamentos`);
    });
  }
  console.log('');

  // ── 4. TESTAR COM ANON KEY (simula usuário logado) ─────────
  if (supabaseAnon) {
    console.log('4️⃣  TESTANDO COM ANON KEY (simula frontend sem login):');
    const { data: anonData, error: anonErr } = await supabaseAnon
      .from('appointments')
      .select('date, status')
      .gte('date', pastStr)
      .lte('date', futureStr)
      .order('date');

    if (anonErr) {
      console.error(`   ❌ Erro com anon key: ${anonErr.message}`);
      console.log('   ⚠️  Isso indica problema de RLS ou autenticação!');
    } else {
      console.log(`   Total retornado (anon): ${anonData?.length ?? 0} agendamentos`);
      if ((anonData?.length ?? 0) === 0) {
        console.log('   ⚠️  ZERO registros com anon key! Possível problema de RLS.');
      }
    }
  } else {
    console.log('4️⃣  ANON KEY não disponível - pulando teste de RLS');
  }
  console.log('');

  // ── 5. VERIFICAR MAIO ESPECIFICAMENTE ─────────────────────
  console.log('5️⃣  AGENDAMENTOS DE MAIO/2026 (admin, direto):');
  const { data: mayData, error: mayErr } = await supabaseAdmin
    .from('appointments')
    .select('id, date, start_time, status, psychologist_id')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31')
    .order('date')
    .order('start_time');

  if (mayErr) {
    console.error('   ❌ Erro:', mayErr.message);
  } else {
    console.log(`   Total em maio: ${mayData?.length ?? 0} agendamentos`);
    if (mayData && mayData.length > 0) {
      console.log('   Primeiros 5:');
      mayData.slice(0, 5).forEach((a: any) => {
        console.log(`     ${a.date} ${a.start_time} - status: ${a.status}`);
      });
    } else {
      console.log('   ⚠️  NENHUM agendamento em maio! Os dados podem não existir no banco.');
    }
  }
  console.log('');

  // ── 6. VERIFICAR ABRIL (para comparar) ────────────────────
  console.log('6️⃣  AGENDAMENTOS DE ABRIL/2026 (admin, para comparar):');
  const { data: aprData, error: aprErr } = await supabaseAdmin
    .from('appointments')
    .select('id, date, start_time, status')
    .gte('date', '2026-04-01')
    .lte('date', '2026-04-30')
    .neq('status', 'canceled')
    .order('date')
    .order('start_time');

  if (aprErr) {
    console.error('   ❌ Erro:', aprErr.message);
  } else {
    console.log(`   Total ativo em abril: ${aprData?.length ?? 0} agendamentos`);
    if (aprData && aprData.length > 0) {
      const lastApril = aprData[aprData.length - 1];
      console.log(`   Último agendamento de abril: ${lastApril.date} ${lastApril.start_time}`);
    }
  }
  console.log('');

  console.log('='.repeat(60));
  console.log('✅ Diagnóstico concluído!');
  console.log('='.repeat(60));
}

diagnose().catch(console.error);
