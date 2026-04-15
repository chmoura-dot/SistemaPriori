/**
 * Aplica correção de RLS via Supabase Management API
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

// Extrair project ref da URL
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

async function applyRLSFix() {
  console.log(`🔧 Aplicando correção de RLS no projeto: ${projectRef}\n`);

  const sqls = [
    `ALTER TABLE appointments ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Allow all for authenticated" ON appointments`,
    `CREATE POLICY "Allow all for authenticated" ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true)`,
  ];

  for (const sql of sqls) {
    console.log(`Executando: ${sql.substring(0, 70)}...`);
    
    // Usar Management API do Supabase
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    const text = await res.text();
    if (res.ok) {
      console.log(`  ✅ OK`);
    } else {
      console.log(`  ❌ Erro (${res.status}): ${text.substring(0, 150)}`);
    }
  }

  // Verificar resultado
  console.log('\n📊 Verificando resultado...');
  const supabaseAnon = createClient(supabaseUrl, anonKey);
  const { count, error } = await supabaseAnon
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');

  if (error) {
    console.log(`❌ Erro: ${error.message}`);
  } else {
    console.log(`Anon key agora vê: ${count} agendamentos em maio`);
    if ((count ?? 0) > 0) {
      console.log('✅ RLS corrigido com sucesso!');
    } else {
      console.log('⚠️  Ainda sem acesso. Aplique o SQL manualmente no painel do Supabase.');
      console.log('\nSQL para aplicar no painel (SQL Editor):');
      console.log('─'.repeat(60));
      sqls.forEach(s => console.log(s + ';'));
      console.log('─'.repeat(60));
    }
  }
}

applyRLSFix().catch(console.error);
