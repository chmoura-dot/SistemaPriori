import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY);
const APP_URL = process.env.APP_URL;
const TEST_PHONE = process.env.TEST_PHONE;
const ZAPI_URL = process.env.ZAPI_URL;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log("Buscando um agendamento real...");
  // Pegar o agendamento mais recente que não esteja cancelado
  const { data: apps, error } = await supabase
    .from('appointments')
    .select('id, date, start_time')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !apps || apps.length === 0) {
    console.error("Não encontrei nenhum agendamento ativo no banco.");
    return;
  }

  const realId = apps[0].id;
  console.log("ID Real encontrado: " + realId);

  const message = "Olá! Este é o TESTE REAL do Sistema Priori.\n\nEste link contém uma consulta de verdade encontrada no banco de dados. Ao clicar, você deve ver os dados reais na tela:\n" + APP_URL + "/#/confirmacao/" + realId;

  console.log("Enviando WhatsApp...");
  try {
    const response = await fetch(ZAPI_URL + "/send-text", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_TOKEN },
      body: JSON.stringify({ phone: TEST_PHONE, message: message })
    });

    if (response.ok) {
      console.log("✅ SUCESSO! Verifique seu celular.");
    } else {
      console.error("❌ Erro na Z-API: " + await response.text());
    }
  } catch (err) {
    console.error("❌ Erro de rede: " + err.message);
  }
}

main();
