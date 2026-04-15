import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function fixDuplicates() {
  // Buscar TODOS os agendamentos ativos (não cancelados)
  const { data: allApps, error } = await supabase
    .from('appointments')
    .select('id, date, psychologist_id, start_time, end_time, status, customer_id, created_at')
    .neq('status', 'canceled')
    .order('date')
    .order('psychologist_id')
    .order('start_time')
    .order('created_at');

  if (error) {
    console.error('Erro ao buscar agendamentos:', error.message);
    return;
  }

  console.log(`Total de agendamentos ativos: ${allApps?.length ?? 0}`);

  // Encontrar duplicatas: mesmo psicólogo, mesma data, mesmo horário de início
  const seen = new Map<string, string>(); // key -> id do primeiro encontrado
  const duplicateIds: string[] = [];

  allApps?.forEach((app: any) => {
    const key = `${app.psychologist_id}|${app.date}|${app.start_time}`;
    if (seen.has(key)) {
      // Este é uma duplicata - marcar para remoção
      duplicateIds.push(app.id);
      console.log(`DUPLICATA encontrada: ${app.date} ${app.start_time}-${app.end_time} (id: ${app.id}, original: ${seen.get(key)})`);
    } else {
      seen.set(key, app.id);
    }
  });

  console.log(`\nTotal de duplicatas encontradas: ${duplicateIds.length}`);

  if (duplicateIds.length === 0) {
    console.log('Nenhuma duplicata para remover!');
    return;
  }

  // Confirmar antes de deletar
  console.log('\nIDs a serem removidos:');
  duplicateIds.forEach(id => console.log(' -', id));

  // Deletar as duplicatas
  console.log('\nRemovendo duplicatas...');
  const { error: deleteError } = await supabase
    .from('appointments')
    .delete()
    .in('id', duplicateIds);

  if (deleteError) {
    console.error('Erro ao remover duplicatas:', deleteError.message);
    return;
  }

  console.log(`✅ ${duplicateIds.length} duplicatas removidas com sucesso!`);

  // Verificar resultado
  const { data: remaining } = await supabase
    .from('appointments')
    .select('id, date, psychologist_id, start_time, end_time')
    .neq('status', 'canceled')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31')
    .order('date')
    .order('start_time');

  console.log(`\nAgendamentos ativos em maio após limpeza: ${remaining?.length ?? 0}`);
}

fixDuplicates().catch(console.error);
