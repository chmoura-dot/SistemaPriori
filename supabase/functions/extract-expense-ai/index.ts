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

    const prompt = `Analise o texto extraído de um PDF de boleto ou nota fiscal e extraia exatamente estas 4 informações em formato JSON (não inclua marcações de markdown, apenas o json puro):
    {
      "cnpj": "CNPJ do emissor formatado (ex: 00.000.000/0000-00)",
      "emissao": "Data de emissão no formato DD/MM/AAAA",
      "vencimento": "Data de vencimento no formato AAAA-MM-DD",
      "valor": número decimal representando o valor total (ex: 150.00)
    }

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
    const jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    const extracted = JSON.parse(jsonText);

    return new Response(
      JSON.stringify({ data: extracted }),
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
