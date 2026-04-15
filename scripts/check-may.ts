import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMay() {
  const today = new Date();
  const past = new Date(today);
  past.setDate(today.getDate() - 30);
  const future = new Date(today);
  future.setDate(today.getDate() + 180);

  const pastStr = past.toISOString().split('T')[0];
  const futureStr = future.toISOString().split('T')[0];

  console.log(`Hoje: ${today.toISOString().split('T')[0]}`);
  console.log(`Janela de busca: ${pastStr} até ${futureStr}`);
  console.log('');

  // Simular exatamente o que o frontend faz
  const { data, error } = await supabase
    .from('appointments')
    .select('id, date, start_time, status')
    .gte('date', pastStr)
    .lte('date', futureStr)
    .order('date')
    .order('start_time');

  if (error) {
    console.error('Erro:', error.message);
    return;
  }

  console.log(`Total de agendamentos na janela: ${data?.length ?? 0}`);

  // Contar por mês
  const byMonth: Record<string, number> = {};
  data?.forEach((a: any) => {
    const month = a.date.substring(0, 7);
    byMonth[month] = (byMonth[month] || 0) + 1;
  });

  console.log('\nAgendamentos por mês:');
  Object.entries(byMonth).sort().forEach(([month, count]) => {
    console.log(`  ${month}: ${count} agendamentos`);
  });

  // Verificar especificamente maio
  const mayApps = data?.filter((a: any) => a.date.startsWith('2026-05')) ?? [];
  console.log(`\nAgendamentos em maio/2026: ${mayApps.length}`);
  if (mayApps.length > 0) {
    console.log('Primeiros 5 de maio:');
    mayApps.slice(0, 5).forEach((a: any) => {
      console.log(`  ${a.date} ${a.start_time} - status: ${a.status}`);
    });
  }

  // Verificar se há agendamentos de maio sem filtro de data
  console.log('\n--- Verificando maio SEM filtro de data ---');
  const { data: mayDirect, error: mayErr } = await supabase
    .from('appointments')
    .select('id, date, start_time, status')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31')
    .neq('status', 'canceled')
    .order('date')
    .order('start_time');

  if (mayErr) {
    console.error('Erro:', mayErr.message);
  } else {
    console.log(`Agendamentos ativos em maio (query direta): ${mayDirect?.length ?? 0}`);
    mayDirect?.slice(0, 5).forEach((a: any) => {
      console.log(`  ${a.date} ${a.start_time} - status: ${a.status}`);
    });
  }
}

checkMay().catch(console.error);
