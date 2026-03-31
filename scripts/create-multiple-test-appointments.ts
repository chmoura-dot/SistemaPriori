import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Buscar paciente de teste
  const { data: customers } = await supabase
    .from('customers')
    .select('id, phone')
    .eq('phone', '21983040449')
    .limit(1);

  if (!customers || customers.length === 0) {
    console.error('Paciente de teste não encontrado.');
    return;
  }

  const customerId = customers[0].id;

  // Buscar psicólogo de teste
  const { data: psychologists } = await supabase
    .from('psychologists')
    .select('id')
    .eq('phone', '21999999999')
    .limit(1);

  if (!psychologists || psychologists.length === 0) {
    console.error('Psicólogo de teste não encontrado.');
    return;
  }

  const psychologistId = psychologists[0].id;

  // Criar múltiplos agendamentos de teste
  const appointments = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();

    appointments.push({
      customer_id: customerId,
      psychologist_id: psychologistId,
      mode: 'Presencial',
      type: 'Psicoterapia Adulto',
      date: dateStr,
      day_of_week: dayOfWeek,
      start_time: '15:00',
      end_time: '16:00',
      status: 'active',
      confirmed_patient: false,
      confirmed_psychologist: false,
      confirmation_status: 'pending',
      is_recurring: false,
      created_at: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert(appointments)
    .select();

  if (error) {
    console.error('Erro ao criar agendamentos:', error);
    return;
  }

  console.log('Agendamentos criados com sucesso:', data.map(a => a.id));
}

main();