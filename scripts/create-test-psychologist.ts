import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const psychologist = {
    name: 'Psicólogo Teste',
    email: 'teste@exemplo.com',
    specialties: ['Teste'],
    phone: '21999999999',
    active: true,
    availability: [],
  };

  const { data, error } = await supabase
    .from('psychologists')
    .insert(psychologist)
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar psicólogo:', error);
    return;
  }

  console.log('Psicólogo criado com sucesso:', data.id);
}

main();