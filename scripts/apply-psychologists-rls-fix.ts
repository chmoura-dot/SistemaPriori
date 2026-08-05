/**
 * Aplica a correção de RLS da tabela `psychologists` via Supabase Management API.
 *
 * Causa: a migration 20260803_security_hardening_rls.sql removeu a política
 * "Allow all for authenticated" de `psychologists` sem criar substituta,
 * deixando a tabela com RLS habilitado e ZERO políticas -> acesso negado
 * silenciosamente (aba Psicólogos e todos os seletores "indicar psicólogo"
 * ficam vazios).
 *
 * Uso: npx tsx scripts/apply-psychologists-rls-fix.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !serviceKey || !anonKey) {
  console.error('❌ Variáveis de ambiente ausentes (VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY).');
  process.exit(1);
}

// Extrair project ref da URL
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

const sqls = [
  `ALTER TABLE psychologists ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "Allow all for authenticated" ON psychologists`,
  `DROP POLICY IF EXISTS "psychologists_authenticated_all" ON psychologists`,
  `DROP POLICY IF EXISTS "Enable all access for authenticated users" ON psychologists`,
  `DROP POLICY IF EXISTS "Allow authenticated users full access" ON psychologists`,
  `CREATE POLICY "Allow all for authenticated" ON psychologists FOR ALL TO authenticated USING (true) WITH CHECK (true)`,
];

async function applyFix() {
  console.log(`🔧 Corrigindo RLS de "psychologists" no projeto: ${projectRef}\n`);

  for (const sql of sqls) {
    console.log(`Executando: ${sql.substring(0, 80)}...`);
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    const text = await res.text();
    if (res.ok) {
      console.log('  ✅ OK');
    } else {
      console.log(`  ❌ Erro (${res.status}): ${text.substring(0, 200)}`);
    }
  }

  console.log('\n📊 Verificando resultado com a anon key (leitura leve, count apenas)...');
  const supabaseAnon = createClient(supabaseUrl, anonKey);
  const { count, error } = await supabaseAnon
    .from('psychologists')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.log(`❌ Erro: ${error.message}`);
    console.log('\nAplique manualmente no SQL Editor do painel Supabase:');
    console.log('─'.repeat(60));
    sqls.forEach((s) => console.log(s + ';'));
    console.log('─'.repeat(60));
  } else {
    console.log(`Anon key agora vê: ${count} psicólogo(s)`);
    if ((count ?? 0) > 0) {
      console.log('✅ RLS de psychologists corrigido com sucesso!');
    } else {
      console.log('⚠️  Ainda sem registros visíveis. Verifique se existem psicólogos ativos cadastrados.');
    }
  }
}

applyFix().catch(console.error);
