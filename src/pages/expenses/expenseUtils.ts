/**
 * expenseUtils.ts
 * Utilitários de extração de dados de despesas a partir de PDFs e IA.
 */
import { supabase } from '../../lib/supabase';

/** Chama a Edge Function Gemini para extrair dados do boleto/NF. */
export const extractWithAI = async (text: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('extract-expense-ai', { body: { text } });
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

/**
 * Tenta extrair dados de um PDF de boleto/NF.
 * Prioridade: Edge Function IA → regex (fallback).
 */
export const parsePdfContent = async (text: string): Promise<ParsedExpense> => {
  // ── Tentativa 1: IA via Edge Function ────────────────────────────────────
  const aiData = await extractWithAI(text);
  if (aiData) {
    return {
      date: aiData.vencimento,
      amount: aiData.valor,
      description: `Emissão: ${aiData.emissao}`,
      beneficiary: aiData.cnpj,
      razaoSocial: '',
      nomeFantasia: '',
      productDescription: `Emissão: ${aiData.emissao}`,
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

  const amountRegex = /(?:R\$\s?|TOTAL\s?|VALOR\s?|PAGAR\s?|VALOR DO DOCUMENTO\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
  let maxAmount = 0;
  let amountMatch;
  while ((amountMatch = amountRegex.exec(text)) !== null) {
    const value = parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.'));
    if (value > maxAmount && value < 1_000_000) maxAmount = value;
  }

  const cleanText = text.replace(/\s+/g, ' ');
  const beneficiaryRegex = /(?:Beneficiário|Nome|Razão Social|Prestador|Cedente|Emissor|Recebedor)[:\s]+([^|0-9]{5,60})/i;
  const issuerName = cleanText.match(beneficiaryRegex)?.[1]?.trim() || 'Nova Despesa (PDF)';

  return {
    date: extractedDate,
    amount: maxAmount,
    description: issuerName,
    beneficiary: issuerName,
    razaoSocial: '',
    nomeFantasia: '',
    productDescription: '',
  };
};
