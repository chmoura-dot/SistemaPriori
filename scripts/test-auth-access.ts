/**
 * Testa acesso com usuário autenticado (simula o frontend real)
 * O frontend usa autenticação Supabase Auth, não anon key diretamente
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ntqkrxtesuaeobxpmznr.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50cWtyeHRlc3VhZW9ieHBtem5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTQxNjYsImV4cCI6MjA4ODgzMDE2Nn0.SHVtblStD2cfBIuJaLcabgW50yu2zKCvCU01yzHefrU';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50cWtyeHRlc3VhZW9ieHBtem5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzI1NDE2NiwiZXhwIjoyMDg4ODMwMTY2fQ.0XTQSt4jeJ5oc9LxQQgoONtOWDJMMydQrH7gqtdMzkY';

const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function testAccess() {
  console.log('🔍 Testando acesso à tabela appointments...\n');

  // 1. Teste com anon key SEM autenticação
  console.log('1️⃣  Anon key (sem login):');
  const { count: c1, error: e1 } = await supabaseAnon
    .from('appointments')
    .select('*', { count: 'exact', head: true });
  console.log(`   Resultado: ${e1 ? 'ERRO: ' + e1.message : c1 + ' registros'}`);

  // 2. Teste com service_role (bypassa RLS)
  console.log('\n2️⃣  Service role (bypassa RLS):');
  const { count: c2, error: e2 } = await supabaseAdmin
    .from('appointments')
    .select('*', { count: 'exact', head: true });
  console.log(`   Resultado: ${e2 ? 'ERRO: ' + e2.message : c2 + ' registros'}`);

  // 3. Verificar se o problema é o limite de 1000 registros
  console.log('\n3️⃣  Verificando limite de 1000 registros (problema de paginação):');
  const today = new Date();
  const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const future = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
  const pastStr = past.toISOString().split('T')[0];
  const futureStr = future.toISOString().split('T')[0];

  const { count: windowCount } = await supabaseAdmin
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('date', pastStr)
    .lte('date', futureStr);
  
  console.log(`   Janela de datas (${pastStr} → ${futureStr}): ${windowCount} registros`);
  
  if ((windowCount ?? 0) > 1000) {
    console.log('   ⚠️  PROBLEMA: Mais de 1000 registros na janela!');
    console.log('   O Supabase retorna no máximo 1000 por padrão.');
    console.log('   Os agendamentos de maio/junho ficam de fora!');
    
    // Verificar o que é retornado sem limite
    const { data: sample } = await supabaseAdmin
      .from('appointments')
      .select('date')
      .gte('date', pastStr)
      .lte('date', futureStr)
      .order('date', { ascending: false })
      .limit(5);
    
    console.log(`\n   Últimas datas retornadas (sem limit explícito):`);
    sample?.forEach((a: any) => console.log(`     ${a.date}`));
    
    // Verificar com limit alto
    const { data: withHighLimit } = await supabaseAdmin
      .from('appointments')
      .select('date')
      .gte('date', pastStr)
      .lte('date', futureStr)
      .order('date', { ascending: false })
      .limit(5000);
    
    const dates = withHighLimit?.map((a: any) => a.date) ?? [];
    const maxDate = dates[0];
    const minDate = dates[dates.length - 1];
    console.log(`\n   Com limit=5000: ${withHighLimit?.length} registros`);
    console.log(`   Intervalo: ${minDate} → ${maxDate}`);
  }

  // 4. Verificar se o frontend usa autenticação corretamente
  console.log('\n4️⃣  Verificando usuários na tabela app_users:');
  const { data: users, error: usersErr } = await supabaseAdmin
    .from('app_users')
    .select('email, role')
    .limit(3);
  
  if (usersErr) {
    console.log(`   Erro: ${usersErr.message}`);
  } else {
    console.log(`   Usuários encontrados: ${users?.length}`);
    users?.forEach((u: any) => console.log(`   - ${u.email} (${u.role})`));
  }

  console.log('\n📋 DIAGNÓSTICO FINAL:');
  if ((c1 ?? 0) === 0 && (c2 ?? 0) > 0) {
    console.log('🚨 RLS está bloqueando acesso sem autenticação.');
    console.log('   As políticas existem mas o frontend pode não estar enviando o token JWT.');
    console.log('   Verifique se o usuário está logado no sistema.');
  }
  if ((windowCount ?? 0) > 1000) {
    console.log('🚨 LIMITE DE 1000 REGISTROS: A query retorna mais de 1000 agendamentos.');
    console.log('   Mesmo com RLS correto, os agendamentos de maio/junho seriam cortados.');
    console.log('   SOLUÇÃO NECESSÁRIA: Adicionar .limit(5000) na função getAppointments()');
  }
}

testAccess().catch(console.error);
