import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

// Usar o endpoint de SQL direto do Supabase (via pg_net ou via REST com service role)
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

async function applyIndex() {
  console.log('Verificando duplicatas remanescentes...');
  
  // Verificar se ainda há duplicatas
  const { data: allApps } = await supabase
    .from('appointments')
    .select('id, date, psychologist_id, start_time')
    .neq('status', 'canceled')
    .order('date')
    .order('psychologist_id')
    .order('start_time');

  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  
  allApps?.forEach((app: any) => {
    const key = `${app.psychologist_id}|${app.date}|${app.start_time}`;
    if (seen.has(key)) {
      duplicates.push(app.id);
    } else {
      seen.set(key, app.id);
    }
  });

  console.log(`Duplicatas remanescentes: ${duplicates.length}`);
  
  if (duplicates.length > 0) {
    console.log('Removendo duplicatas remanescentes...');
    const { error } = await supabase.from('appointments').delete().in('id', duplicates);
    if (error) console.error('Erro:', error.message);
    else console.log(`✅ ${duplicates.length} duplicatas removidas`);
  }

  // Tentar criar o índice via função SQL personalizada
  // Como não temos exec_sql, vamos usar o endpoint de database diretamente
  const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
  
  // Tentar via Supabase DB API (requer personal access token, não service role)
  // Como alternativa, vamos verificar se o índice já existe consultando pg_indexes
  const { data: indexes, error: idxError } = await supabase
    .from('pg_indexes')
    .select('indexname')
    .eq('tablename', 'appointments')
    .eq('indexname', 'idx_appointments_no_duplicate')
    .maybeSingle();

  if (idxError) {
    console.log('Não foi possível verificar índices via pg_indexes:', idxError.message);
    console.log('\n⚠️  Para aplicar o índice único, execute o seguinte SQL no Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/ntqkrxtesuaeobxpmznr/sql/new');
    console.log('\n--- SQL para executar ---');
    console.log(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_no_duplicate`);
    console.log(`  ON appointments (psychologist_id, date, start_time)`);
    console.log(`  WHERE status != 'canceled';`);
    console.log('--- Fim do SQL ---\n');
  } else if (indexes) {
    console.log('✅ Índice único já existe!');
  } else {
    console.log('\n⚠️  Índice não encontrado. Execute o SQL abaixo no Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/ntqkrxtesuaeobxpmznr/sql/new');
    console.log('\n--- SQL para executar ---');
    console.log(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_no_duplicate`);
    console.log(`  ON appointments (psychologist_id, date, start_time)`);
    console.log(`  WHERE status != 'canceled';`);
    console.log('--- Fim do SQL ---\n');
  }

  console.log('\n✅ Limpeza concluída! Total de agendamentos ativos:', allApps?.length ?? 0);
}

applyIndex().catch(console.error);
