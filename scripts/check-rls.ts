/**
 * Verifica e corrige RLS da tabela appointments
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

async function checkRLS() {
  console.log('🔍 Verificando RLS da tabela appointments...\n');

  // Verificar via rpc se RLS está ativo
  const { data: rlsData, error: rlsErr } = await supabaseAdmin.rpc('exec_sql', {
    sql: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'appointments';`
  });

  if (rlsErr) {
    console.log('RPC exec_sql não disponível, tentando query direta...');
    
    // Tentar via query direta na tabela pg_tables
    const { data: pgData, error: pgErr } = await supabaseAdmin
      .from('pg_tables')
      .select('tablename, rowsecurity')
      .eq('tablename', 'appointments');
    
    if (pgErr) {
      console.log('Não foi possível verificar via pg_tables:', pgErr.message);
    } else {
      console.log('pg_tables result:', pgData);
    }
  } else {
    console.log('RLS status:', rlsData);
  }

  // Verificar políticas existentes
  console.log('\n📋 Verificando políticas existentes...');
  const { data: policies, error: polErr } = await supabaseAdmin
    .from('pg_policies')
    .select('*')
    .eq('tablename', 'appointments');

  if (polErr) {
    console.log('Não foi possível verificar políticas:', polErr.message);
  } else {
    console.log(`Políticas encontradas: ${policies?.length ?? 0}`);
    policies?.forEach((p: any) => {
      console.log(`  - ${p.policyname}: ${p.cmd} (${p.permissive})`);
    });
  }

  // Teste simples: contar com service role vs anon
  console.log('\n📊 Comparando acesso service role vs anon key...');
  
  const { count: adminCount } = await supabaseAdmin
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');
  
  console.log(`Service role (bypassa RLS): ${adminCount} agendamentos em maio`);

  const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  if (anonKey) {
    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { count: anonCount, error: anonErr } = await supabaseAnon
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('date', '2026-05-01')
      .lte('date', '2026-05-31');
    
    if (anonErr) {
      console.log(`Anon key: ERRO - ${anonErr.message}`);
    } else {
      console.log(`Anon key (com RLS): ${anonCount} agendamentos em maio`);
      
      if ((anonCount ?? 0) === 0 && (adminCount ?? 0) > 0) {
        console.log('\n🚨 CONFIRMADO: RLS está bloqueando o acesso!');
        console.log('   O frontend usa anon key e não consegue ver os dados.');
        console.log('   Precisa criar política RLS para permitir acesso autenticado.');
      }
    }
  }
}

checkRLS().catch(console.error);
