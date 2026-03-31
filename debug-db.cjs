const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://ntqkrxtesuaeobxpmznr.supabase.co";
const SUPABASE_ANON_KEY = "AIzaSyC341t2WUuLj7SvcB6viIQVPub48KPrn5U";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("Contando agendamentos...");
  const { count, error } = await supabase.from('appointments').select('*', { count: 'exact', head: true });
  if (error) console.error("Erro:", error.message);
  else console.log("Total de agendamentos no banco: " + count);

  const { data: first5 } = await supabase.from('appointments').select('id, status, date').limit(5);
  console.log("Primeiros 5:", first5);
}
main();
