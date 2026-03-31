import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const customer = {
    name: 'Paciente Teste',
    email: 'paciente.teste@example.com',
    phone: '21983040449',
    health_plan: 'Particular',
    psychologist_id: null,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('customers')
    .insert(customer)
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar paciente:', error);
    return;
  }

  console.log('Paciente criado com sucesso:', data.id);
}

main();