import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Verificar agendamentos em maio por psicólogo e horário
  const { data: mayApps } = await supabase
    .from('appointments')
    .select('date, status, psychologist_id, start_time, end_time')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31')
    .neq('status', 'canceled')
    .order('date')
    .order('start_time');

  // Verificar psicólogos ativos
  const { data: psys } = await supabase
    .from('psychologists')
    .select('id, name, active, availability')
    .eq('active', true);

  // Verificar Nathalia Barreto - tem 26 agendamentos na SEGUNDA
  // mas disponibilidade na segunda vai até 21:30 (08:30-21:30)
  // Verificar se há horários sobrepostos na segunda
  const nathalia = psys?.find((p: any) => p.name === 'Nathalia Barreto');
  const nathaliaMondays = mayApps?.filter((a: any) => {
    if (a.psychologist_id !== nathalia?.id) return false;
    const dow = new Date(a.date + 'T12:00:00').getDay();
    return dow === 1; // Segunda
  }) ?? [];

  console.log('\n=== Nathalia Barreto - Segundas em maio ===');
  const byDate: Record<string, any[]> = {};
  nathaliaMondays.forEach((a: any) => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });
  
  Object.entries(byDate).forEach(([date, apps]) => {
    console.log(`\n${date}:`);
    apps.sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
    apps.forEach((a: any) => console.log(`  ${a.start_time}-${a.end_time}`));
    
    // Verificar se há slots livres
    const avail = nathalia?.availability?.find((s: any) => s.dayOfWeek === 1);
    if (avail) {
      console.log(`  Disponibilidade: ${avail.startTime}-${avail.endTime}`);
      // Calcular slots livres
      let freeSlots = 0;
      for (let h = 8; h < 21; h++) {
        for (let m = 0; m < 60; m += 50) {
          const startTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
          const endH = Math.floor((h * 60 + m + 50) / 60);
          const endM = (h * 60 + m + 50) % 60;
          const endTime = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;
          
          if (startTime < avail.startTime || endTime > avail.endTime) continue;
          
          const hasConflict = apps.some((a: any) => 
            (startTime >= a.start_time && startTime < a.end_time) ||
            (endTime > a.start_time && endTime <= a.end_time) ||
            (startTime <= a.start_time && endTime >= a.end_time)
          );
          if (!hasConflict) freeSlots++;
        }
      }
      console.log(`  Slots livres (~50min): ${freeSlots}`);
    }
  });

  // Verificar o dia 05/05 (segunda) - Nathalia tem 9 agendamentos
  // Verificar se há espaço para mais
  console.log('\n=== Verificando disponibilidade em 05/05 para TODOS os psicólogos ===');
  const day05Apps = mayApps?.filter((a: any) => a.date === '2026-05-05') ?? [];
  
  psys?.forEach((p: any) => {
    if (!Array.isArray(p.availability) || p.availability.length === 0) return;
    
    // Segunda = dayOfWeek 1
    const mondaySlot = p.availability.find((s: any) => s.dayOfWeek === 1);
    if (!mondaySlot) return;
    
    const psyApps = day05Apps.filter((a: any) => a.psychologist_id === p.id);
    
    // Verificar se há algum slot de 50min livre
    let hasSpace = false;
    for (let h = 8; h <= 19; h++) {
      for (let m = 0; m < 60; m += 30) {
        const startTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const endH = Math.floor((h * 60 + m + 50) / 60);
        const endM = (h * 60 + m + 50) % 60;
        const endTime = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;
        
        if (startTime < mondaySlot.startTime || endTime > mondaySlot.endTime) continue;
        
        const hasConflict = psyApps.some((a: any) => 
          (startTime >= a.start_time && startTime < a.end_time) ||
          (endTime > a.start_time && endTime <= a.end_time) ||
          (startTime <= a.start_time && endTime >= a.end_time)
        );
        if (!hasConflict) { hasSpace = true; break; }
      }
      if (hasSpace) break;
    }
    
    console.log(`${p.name}: ${psyApps.length} agendamentos em 05/05 (${mondaySlot.startTime}-${mondaySlot.endTime}) - ${hasSpace ? '✅ TEM ESPAÇO' : '❌ LOTADO'}`);
  });
}

check().catch(console.error);
