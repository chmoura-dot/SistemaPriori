/**
 * Regras especiais de repasse por psicólogo.
 *
 * Michelly Monteiro: repasse = valor bruto × 92% (desconto de 8%)
 * Demais psicólogos: valor fixo definido no procedimento do plano
 */

/** Percentual retido da clínica sobre o valor bruto para psicólogos com regra especial */
const MICHELLY_REPASS_RATE = 0.92; // bruto - 8%

/**
 * Retorna o valor de repasse correto para um atendimento.
 *
 * @param grossAmount  Valor bruto do atendimento
 * @param psychologistName  Nome do psicólogo responsável
 * @param fixedRepass  Valor de repasse fixo definido no plano (fallback)
 */
export function calcRepass(
  grossAmount: number,
  psychologistName: string | undefined,
  fixedRepass: number
): number {
  if (psychologistName?.toLowerCase().includes('michelly')) {
    return grossAmount * MICHELLY_REPASS_RATE;
  }
  return fixedRepass;
}
