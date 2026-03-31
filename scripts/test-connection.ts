import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log('SUPABASE_URL:', SUPABASE_URL);
  console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY);
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const { data, error } = await supabase.from('customers').select('id').limit(1);
    if (error) {
      console.error('Erro ao consultar tabela customers:', error);
    } else {
      console.log('Conexão e permissão OK. Exemplo de dado:', data);
    }
  } catch (err) {
    console.error('Erro inesperado:', err);
  }
}

main();