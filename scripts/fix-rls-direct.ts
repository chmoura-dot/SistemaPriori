/**
 * Corrige RLS da tabela appointments via Supabase Edge Function
 * Usa a API REST do Supabase com service_role key
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ntqkrxtesuaeobxpmznr.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50cWtyeHRlc3VhZW9ieHBtem5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzI1NDE2NiwiZXhwIjoyMDg4ODMwMTY2fQ.0XTQSt4jeJ5oc9LxQQgoONtOWDJMMydQrH7gqtdMzkY';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50cWtyeHRlc3VhZW9ieHBtem5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTQxNjYsImV4cCI6MjA4ODgzMDE2Nn0.SHVtblStD2cfBIuJaLcabgW50yu2zKCvCU01yzHefrU';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);

async function fixRLS() {
  console.log('🔧 Corrigindo RLS da tabela appointments...\n');

  // Verificar estado atual: quantos registros o service_role vê
  const { count: adminCount } = await supabaseAdmin
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('date', '2026-04-30');
  
  console.log(`Service role vê ${adminCount} agendamentos a partir de 30/04`);

  // Verificar o que anon key vê
  const { count: anonBefore, error: anonErr } = await supabaseAnon
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('date', '2026-04-30');
  
  if (anonErr) {
    console.log(`Anon key ERRO: ${anonErr.message}`);
  } else {
    console.log(`Anon key vê ${anonBefore} agendamentos a partir de 30/04`);
  }

  if ((anonBefore ?? 0) > 0) {
    console.log('\n✅ RLS já está funcionando! O problema pode ser outro.');
    await diagnoseOtherIssues();
    return;
  }

  console.log('\n🚨 RLS está bloqueando! Tentando corrigir via Supabase Management API...\n');

  // Tentar via Management API (requer Personal Access Token, não service_role)
  // Como não temos PAT, vamos tentar criar uma função RPC temporária
  
  // Método alternativo: usar o endpoint /pg/query do Supabase (disponível em alguns planos)
  const projectRef = 'ntqkrxtesuaeobxpmznr';
  
  const sqls = [
    `ALTER TABLE appointments ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Allow all for authenticated" ON appointments`,
    `CREATE POLICY "Allow all for authenticated" ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true)`,
  ];

  for (const sql of sqls) {
    console.log(`Tentando: ${sql.substring(0, 70)}...`);
    
    // Tentar via endpoint de database direto
    const res = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    
    const text = await res.text();
    if (res.ok) {
      console.log(`  ✅ OK via /pg/query`);
    } else {
      console.log(`  ❌ /pg/query falhou (${res.status}): ${text.substring(0, 100)}`);
      
      // Tentar via REST API com header especial
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Prefer': 'return=minimal',
          'X-Supabase-SQL': sql,
        },
      });
      console.log(`  /rest/v1/ com X-Supabase-SQL: ${res2.status}`);
    }
  }

  // Verificar resultado
  console.log('\n📊 Verificando resultado após tentativa de correção...');
  const { count: anonAfter, error: anonAfterErr } = await supabaseAnon
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('date', '2026-04-30');
  
  if (anonAfterErr) {
    console.log(`Anon key ERRO: ${anonAfterErr.message}`);
  } else {
    console.log(`Anon key agora vê: ${anonAfter} agendamentos a partir de 30/04`);
  }

  if ((anonAfter ?? 0) === 0) {
    console.log('\n⚠️  Não foi possível aplicar via API. Você precisa executar o SQL manualmente.');
    console.log('\n📋 INSTRUÇÕES:');
    console.log('1. Acesse: https://supabase.com/dashboard/project/ntqkrxtesuaeobxpmznr/sql/new');
    console.log('2. Cole e execute o seguinte SQL:\n');
    console.log('─'.repeat(70));
    sqls.forEach(s => console.log(s + ';'));
    console.log('─'.repeat(70));
    console.log('\n3. Após executar, recarregue o sistema e os agendamentos aparecerão.');
  }
}

async function diagnoseOtherIssues() {
  console.log('\n🔍 Investigando outros possíveis problemas...\n');
  
  // Verificar limite de 1000 registros do Supabase
  const { count: totalCount } = await supabaseAdmin
    .from('appointments')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Total de agendamentos no banco: ${totalCount}`);
  
  if ((totalCount ?? 0) > 1000) {
    console.log('⚠️  PROBLEMA ENCONTRADO: Mais de 1000 registros!');
    console.log('   O Supabase retorna no máximo 1000 registros por padrão.');
    console.log('   A query do frontend busca 30 dias passados + 180 futuros.');
    
    // Verificar quantos registros a query do frontend retorna
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
    
    console.log(`\nRegistros na janela do frontend (${pastStr} → ${futureStr}): ${windowCount}`);
    
    if ((windowCount ?? 0) > 1000) {
      console.log('\n🚨 CAUSA RAIZ CONFIRMADA: A janela de datas retorna mais de 1000 registros!');
      console.log('   O Supabase trunca em 1000 e os agendamentos de maio/junho ficam de fora.');
      console.log('\n📋 SOLUÇÃO: Adicionar .limit(5000) ou usar paginação na query getAppointments()');
    }
  }
}

fixRLS().catch(console.error);
