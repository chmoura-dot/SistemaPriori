/**
 * expenseUtils.ts
 * Utilitários de extração de dados de despesas a partir de PDFs e IA.
 */
import { supabase } from '../../lib/supabase';

/** Formato normalizado retornado pela Edge Function `extract-expense-ai`. */
export interface AiExtractedExpense {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  descricaoServico: string;
  emissao: string;
  vencimento: string;
  valor: number;
}

interface ExtractExpenseAiResponse {
  data?: AiExtractedExpense;
  error?: string;
}

/** Chama a Edge Function Gemini para extrair dados do boleto/NF. */
export const extractWithAI = async (text: string): Promise<AiExtractedExpense | null> => {
  try {
    const { data, error } = await supabase.functions.invoke<ExtractExpenseAiResponse>(
      'extract-expense-ai',
      { body: { text } }
    );
    if (error || !data?.data) return null;
    return data.data;
  } catch (error) {
    console.error('Erro na extração com IA (Edge Function):', error);
    return null;
  }
};

export interface ParsedExpense {
  date: string;
  amount: number;
  description: string;
  beneficiary: string;
  razaoSocial: string;
  nomeFantasia: string;
  productDescription: string;
}

/** Valida se uma string está no formato de data ISO (AAAA-MM-DD) e é uma data real. */
const isValidIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !isNaN(d.getTime());
};

/** Converte um valor numérico ou string (pt-BR "1.234,56" ou "1234.56") para number seguro. */
const toSafeAmount = (value: unknown): number => {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
};

/**
 * Tenta extrair dados de um PDF de boleto/NF.
 * Prioridade: Edge Function IA → regex (fallback).
 */
export const parsePdfContent = async (text: string): Promise<ParsedExpense> => {
  // ── Tentativa 1: IA via Edge Function ────────────────────────────────────
  const aiData = await extractWithAI(text);
  if (aiData) {
    // Nome real do fornecedor: prioriza Nome Fantasia, depois Razão Social, depois CNPJ como último recurso.
    const nomeFantasia = (aiData.nomeFantasia || '').trim();
    const razaoSocial = (aiData.razaoSocial || '').trim();
    const cnpj = (aiData.cnpj || '').trim();
    const supplierName = nomeFantasia || razaoSocial || cnpj || 'Nova Despesa (PDF)';

    const descricaoServico = (aiData.descricaoServico || '').trim();
    const emissao = (aiData.emissao || '').trim();
    const emissaoInfo = emissao ? `Emissão: ${emissao}` : '';
    const productDescription = [descricaoServico, emissaoInfo].filter(Boolean).join(' — ');

    return {
      date: isValidIsoDate(aiData.vencimento) ? aiData.vencimento : new Date().toISOString().split('T')[0],
      amount: toSafeAmount(aiData.valor),
      description: supplierName,
      beneficiary: supplierName,
      razaoSocial,
      nomeFantasia,
      productDescription,
    };
  }

  // ── Tentativa 2: Regex (Plano B) ─────────────────────────────────────────
  const dateRegex = /(\d{2})[/-|\.](\d{2})[/-|\.](\d{2,4})/g;
  const dateMatches = Array.from(text.matchAll(dateRegex));
  let extractedDate = new Date().toISOString().split('T')[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dateMatches.length > 0) {
    const vencPos = text.toLowerCase().search(/vencimento|venc|pago até|pagamento/);
    let bestDate: Date | null = null;
    let minDiff = Infinity;

    for (const match of dateMatches) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, day, month, yearRaw] = match;
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const dateObj = new Date(`${year}-${month}-${day}T12:00:00`);
      if (!isNaN(dateObj.getTime())) {
        if (vencPos !== -1 && Math.abs(match.index! - vencPos) < 100) {
          bestDate = dateObj;
          break;
        }
        const diff = dateObj.getTime() - today.getTime();
        if (diff >= 0 && diff < minDiff) {
          minDiff = diff;
          bestDate = dateObj;
        } else if (!bestDate) {
          bestDate = dateObj;
        }
      }
    }
    if (bestDate) extractedDate = bestDate.toISOString().split('T')[0];
  }

  // Prioriza rótulos de valor total explícitos (evita capturar juros/multa/linha digitável).
  const priorityAmountRegex = /(?:valor\s+do\s+documento|valor\s+cobrado|valor\s+total|total\s+a\s+pagar|valor\s+a\s+pagar)[:\s]*R?\$?\s?(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
  let priorityAmount = 0;
  let priorityMatch;
  while ((priorityMatch = priorityAmountRegex.exec(text)) !== null) {
    const value = parseFloat(priorityMatch[1].replace(/\./g, '').replace(',', '.'));
    if (value > priorityAmount && value < 1_000_000) priorityAmount = value;
  }

  const amountRegex = /(?:R\$\s?|TOTAL\s?|VALOR\s?|PAGAR\s?|VALOR DO DOCUMENTO\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
  let maxAmount = 0;
  let amountMatch;
  while ((amountMatch = amountRegex.exec(text)) !== null) {
    const value = parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.'));
    if (value > maxAmount && value < 1_000_000) maxAmount = value;
  }

  // Se encontrou um valor rotulado explicitamente como total, usa-o em vez do "maior valor cru".
  const finalAmount = priorityAmount > 0 ? priorityAmount : maxAmount;

  const cleanText = text.replace(/\s+/g, ' ');
  const beneficiaryRegex = /(?:Beneficiário|Nome|Razão Social|Prestador|Cedente|Emissor|Recebedor)[:\s]+([^|0-9]{5,60})/i;
  const issuerName = cleanText.match(beneficiaryRegex)?.[1]?.trim() || 'Nova Despesa (PDF)';

  return {
    date: extractedDate,
    amount: finalAmount,
    description: issuerName,
    beneficiary: issuerName,
    razaoSocial: '',
    nomeFantasia: '',
    productDescription: '',
  };
};
