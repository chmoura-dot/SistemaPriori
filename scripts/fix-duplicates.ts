import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function fixDuplicates() {
  // O script busca em lotes de 1000 - pode estar perdendo registros
  // Vamos buscar TODOS os agendamentos em múltiplos lotes
  let allApps: any[] = [];
  let from = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, date, psychologist_id, start_time, end_time, status, created_at')
      .neq('status', 'canceled')
      .order('created_at')
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('Erro ao buscar agendamentos:', error.message);
      return;
    }

    if (!data || data.length === 0) break;
    allApps = allApps.concat(data);
    console.log(`Carregados ${allApps.length} agendamentos...`);
    
    if (data.length < batchSize) break;
    from += batchSize;
  }

  console.log(`\nTotal de agendamentos não-cancelados: ${allApps.length}`);

  // Encontrar duplicatas: mesmo psicólogo, mesma data, mesmo horário de início
  const seen = new Map<string, string>();
  const duplicateIds: string[] = [];

  allApps.forEach((app: any) => {
    const key = `${app.psychologist_id}|${app.date}|${app.start_time}`;
    if (seen.has(key)) {
      duplicateIds.push(app.id);
      console.log(`DUPLICATA: ${app.date} ${app.start_time}-${app.end_time} psicólogo=${app.psychologist_id} (id: ${app.id})`);
    } else {
      seen.set(key, app.id);
    }
  });

  console.log(`\nTotal de duplicatas encontradas: ${duplicateIds.length}`);

  if (duplicateIds.length === 0) {
    console.log('✅ Nenhuma duplicata encontrada!');
    
    // Verificar o caso específico reportado
    console.log('\nVerificando caso específico: psicólogo 0d2c504c em 2026-05-18 15:00...');
    const { data: specific } = await supabase
      .from('appointments')
      .select('id, date, start_time, end_time, status, created_at')
      .eq('psychologist_id', '0d2c504c-f3df-4a6c-90a0-03df50290f19')
      .eq('date', '2026-05-18')
      .eq('start_time', '15:00')
      .order('created_at');
    
    console.log(`Agendamentos encontrados: ${specific?.length ?? 0}`);
    specific?.forEach((a: any) => {
      console.log(`  id=${a.id} status=${a.status} created_at=${a.created_at}`);
    });
    
    if (specific && specific.length > 1) {
      const toDelete = specific.slice(1).map((a: any) => a.id);
      console.log(`\nRemovendo ${toDelete.length} duplicatas específicas...`);
      const { error: delErr } = await supabase.from('appointments').delete().in('id', toDelete);
      if (delErr) console.error('Erro:', delErr.message);
      else console.log('✅ Removidas!');
    }
    return;
  }

  // Deletar as duplicatas em lotes
  const batchDelete = 100;
  for (let i = 0; i < duplicateIds.length; i += batchDelete) {
    const batch = duplicateIds.slice(i, i + batchDelete);
    const { error: deleteError } = await supabase
      .from('appointments')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error('Erro ao remover duplicatas:', deleteError.message);
      return;
    }
    console.log(`Removidos ${Math.min(i + batchDelete, duplicateIds.length)}/${duplicateIds.length}...`);
  }

  console.log(`\n✅ ${duplicateIds.length} duplicatas removidas com sucesso!`);
}

fixDuplicates().catch(console.error);
