/**
 * Corrige o RLS da tabela appointments
 * Cria política para permitir acesso a usuários autenticados
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

async function fixRLS() {
  console.log('🔧 Corrigindo RLS da tabela appointments...\n');

  // Executar SQL via REST API do Supabase (usando fetch direto)
  const sqlStatements = [
    // Garantir que RLS está habilitado
    `ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;`,
    
    // Remover políticas antigas se existirem
    `DROP POLICY IF EXISTS "Allow all for authenticated" ON appointments;`,
    `DROP POLICY IF EXISTS "appointments_authenticated_all" ON appointments;`,
    `DROP POLICY IF EXISTS "Enable all access for authenticated users" ON appointments;`,
    
    // Criar política que permite TUDO para usuários autenticados
    `CREATE POLICY "Allow all for authenticated" ON appointments
     FOR ALL
     TO authenticated
     USING (true)
     WITH CHECK (true);`,
  ];

  for (const sql of sqlStatements) {
    console.log(`Executando: ${sql.substring(0, 60)}...`);
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ sql }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`  ⚠️  RPC não disponível (${response.status}): ${text.substring(0, 100)}`);
      console.log('  Tentando via query direta...');
      
      // Tentar via Supabase query
      const { error } = await supabaseAdmin.rpc('exec_sql', { sql }).single();
      if (error) {
        console.log(`  ❌ Erro: ${error.message}`);
      } else {
        console.log('  ✅ OK');
      }
    } else {
      console.log('  ✅ OK');
    }
  }

  // Verificar resultado
  console.log('\n📊 Verificando resultado...');
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  if (anonKey) {
    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { count, error } = await supabaseAnon
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('date', '2026-05-01')
      .lte('date', '2026-05-31');
    
    if (error) {
      console.log(`Anon key: ERRO - ${error.message}`);
    } else {
      console.log(`Anon key agora vê: ${count} agendamentos em maio`);
      if ((count ?? 0) > 0) {
        console.log('✅ RLS corrigido com sucesso!');
      } else {
        console.log('⚠️  Ainda sem acesso. Pode ser necessário aplicar via painel do Supabase.');
      }
    }
  }
}

fixRLS().catch(console.error);
