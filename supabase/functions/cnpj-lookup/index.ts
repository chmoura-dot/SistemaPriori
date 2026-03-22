// Supabase Edge Function: cnpj-lookup
// Consulta CNPJ em provedor público (BrasilAPI) e retorna dados normalizados.
//
// Observação: este arquivo roda no runtime Deno (Supabase Edge).
// Alguns linters/TS servers no frontend podem não resolver imports remotos.

// @ts-ignore - import remoto do Deno (resolvido no runtime da Edge Function)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type BrasilApiCnpjResponse = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // CORS (ajuste se quiser restringir)
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function normalizeDigits(input: string) {
  return (input ?? "").replace(/\D/g, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true }, 200);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { cnpj } = await req.json();
    const cnpjDigits = normalizeDigits(String(cnpj ?? ""));

    if (cnpjDigits.length !== 14) {
      return jsonResponse({ error: "CNPJ inválido (deve ter 14 dígitos)" }, 400);
    }

    const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`;
    const res = await fetch(url, {
      headers: {
        "user-agent": "SistemaPriori/1.0 (cnpj-lookup)",
      },
    });

    if (res.status === 404) {
      return jsonResponse({ error: "CNPJ não encontrado" }, 404);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return jsonResponse(
        { error: "Falha ao consultar provedor de CNPJ", status: res.status, details: text },
        502,
      );
    }

    const data = (await res.json()) as BrasilApiCnpjResponse;

    // payload normalizado para o frontend
    return jsonResponse({
      cnpj: cnpjDigits,
      razaoSocial: data.razao_social ?? null,
      nomeFantasia: data.nome_fantasia ?? null,
      situacao: data.descricao_situacao_cadastral ?? null,
      endereco: {
        logradouro: data.logradouro ?? null,
        numero: data.numero ?? null,
        complemento: data.complemento ?? null,
        bairro: data.bairro ?? null,
        municipio: data.municipio ?? null,
        uf: data.uf ?? null,
        cep: data.cep ?? null,
      },
      raw: data,
    });
  } catch (err) {
    return jsonResponse({ error: "Erro inesperado", message: String(err) }, 500);
  }
});
