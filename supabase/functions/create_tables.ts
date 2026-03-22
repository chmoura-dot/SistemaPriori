import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const createTables = async () => {
  const { error } = await supabase
    .from('nfse_invoices')
    .insert([
      { issue_date: new Date(), status: 'rascunho', payer: { nome: 'Tomador Exemplo', cpf_cnpj: '12345678901' }, total_amount: 0, description: '', pdf_url: '' }
    ]);

  if (error) {
    console.error('Erro ao criar tabela nfse_invoices:', error);
  } else {
    console.log('Tabela nfse_invoices criada com sucesso.');
  }

  // Repetir para as outras tabelas (nfse_invoice_items e nfse_payers)
};

createTables();