/**
 * Edge Function: extract-expense-ai
 * Processa texto de PDF (boleto/NF) e extrai dados estruturados via Gemini API.
 * A chave da API fica segura no servidor — nunca exposta no bundle do cliente.
 *
 * Deploy: supabase functions deploy extract-expense-ai
 * Secret: supabase secrets set GEMINI_API_KEY=sua-chave-aqui
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Campo "text" é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY não configurada. Use: supabase secrets set GEMINI_API_KEY=...' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = `Analise o texto extraído de um PDF de boleto ou nota fiscal e extraia exatamente estas informações em formato JSON (não inclua marcações de markdown, apenas o json puro):
    {
      "cnpj": "CNPJ do emissor/prestador formatado (ex: 00.000.000/0000-00), ou \"\" se não encontrado",
      "razaoSocial": "Razão social completa da empresa emissora/prestadora do serviço, ou \"\" se não encontrado",
      "nomeFantasia": "Nome fantasia da empresa emissora/prestadora (se diferente da razão social), ou \"\" se não encontrado",
      "descricaoServico": "Descrição resumida do produto ou serviço prestado (ex: Mensalidade Software X, Aluguel Sala 2), ou \"\" se não encontrado",
      "emissao": "Data de emissão no formato DD/MM/AAAA, ou \"\" se não encontrado",
      "vencimento": "Data de vencimento no formato AAAA-MM-DD, ou \"\" se não encontrado",
      "valor": número decimal representando o valor total a pagar (ex: 150.00), sem separador de milhar e usando ponto como separador decimal
    }

    Regras importantes:
    - Nunca invente dados. Se não encontrar uma informação, retorne string vazia "" (ou 0 para valor).
    - "valor" deve ser o valor total do documento (procure por termos como "Valor Total", "Valor do Documento", "Valor Cobrado", "Total a Pagar"), nunca valores de multa, juros ou linha digitável.
    - "razaoSocial" e "nomeFantasia" referem-se a quem EMITE/PRESTA o serviço (beneficiário/cedente/prestador), nunca ao pagador/sacado.

    Texto extraído:
    ${text}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini API error:', errBody);
      return new Response(
        JSON.stringify({ error: 'Erro na API Gemini', detail: errBody }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    // Blindagem: extrai apenas o bloco { ... } caso a IA retorne texto extra ao redor do JSON
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonText = jsonMatch[0];

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('Falha ao parsear JSON da Gemini:', jsonText, parseErr);
      return new Response(
        JSON.stringify({ error: 'Resposta da IA em formato inválido', detail: jsonText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalização defensiva dos campos (evita undefined/null propagando para o front)
    const normalized = {
      cnpj: typeof extracted.cnpj === 'string' ? extracted.cnpj : '',
      razaoSocial: typeof extracted.razaoSocial === 'string' ? extracted.razaoSocial : '',
      nomeFantasia: typeof extracted.nomeFantasia === 'string' ? extracted.nomeFantasia : '',
      descricaoServico: typeof extracted.descricaoServico === 'string' ? extracted.descricaoServico : '',
      emissao: typeof extracted.emissao === 'string' ? extracted.emissao : '',
      vencimento: typeof extracted.vencimento === 'string' ? extracted.vencimento : '',
      valor: typeof extracted.valor === 'number'
        ? extracted.valor
        : parseFloat(String(extracted.valor ?? '0').replace(/\./g, '').replace(',', '.')) || 0,
    };

    return new Response(
      JSON.stringify({ data: normalized }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('extract-expense-ai error:', err);
    return new Response(
      JSON.stringify({ error: 'Erro interno', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
