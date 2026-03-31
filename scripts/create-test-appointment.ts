import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50cWtyeHRlc3VhZW9ieHBtem5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzI1NDE2NiwiZXhwIjoyMDg4ODMwMTY2fQ.0XTQSt4jeJ5oc9LxQQgoONtOWDJMMydQrH7gqtdMzkY";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Buscar paciente pelo telefone
  const phone = '21983040449';
  const { data: customers, error: customerError } = await supabase
    .from('customers')
    .select('id, phone')
    .eq('phone', phone)
    .limit(1);

  if (customerError || !customers || customers.length === 0) {
    console.error('Paciente não encontrado pelo telefone:', phone);
    return;
  }

  const customerId = customers[0].id;
  console.log('Paciente encontrado:', customerId);

  // Criar agendamento ativo para o paciente
  const appointment = {
    customer_id: customerId,
    psychologist_id: '7e6bc746-8d6f-461c-ad9b-2908edcab431', // Psicólogo de teste criado
    mode: 'Presencial',
    type: 'Psicoterapia Adulto',
    date: new Date().toISOString().split('T')[0],
    day_of_week: new Date().getDay(),
    start_time: '15:00',
    end_time: '16:00',
    status: 'active',
    confirmed_patient: false,
    confirmed_psychologist: false,
    confirmation_status: 'pending',
    is_recurring: false,
    created_at: new Date().toISOString(),
  };

  const { data: newAppointment, error: appointmentError } = await supabase
    .from('appointments')
    .insert(appointment)
    .select()
    .single();

  if (appointmentError) {
    console.error('Erro ao criar agendamento:', appointmentError);
    return;
  }

  console.log('Agendamento criado com sucesso:', newAppointment.id);
}

main();