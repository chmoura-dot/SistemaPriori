import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('psychologists')
    .select('id')
    .limit(1);

  if (error) {
    console.error('Erro ao buscar psicólogo:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.error('Nenhum psicólogo encontrado.');
    return;
  }

  console.log('ID do psicólogo encontrado:', data[0].id);
}

main();