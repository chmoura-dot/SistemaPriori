/**
 * Regras especiais de repasse por psicólogo.
 *
 * Michelly Monteiro: repasse = valor bruto × 94% (desconto de 6%)
 * Demais psicólogos: repasse = valor bruto × 50%
 */

/** Percentual retido da clínica sobre o valor bruto para Michelly */
const MICHELLY_REPASS_RATE = 0.94; // bruto - 6%

/** Percentual retido da clínica para os demais psicólogos */
const DEFAULT_REPASS_RATE = 0.50; // 50%

/**
 * Retorna o valor de repasse correto para um atendimento.
 *
 * @param grossAmount  Valor bruto do atendimento
 * @param psychologistName  Nome do psicólogo responsável
 * @param fixedRepass  (Opcional) Valor de repasse fixo - se fornecido e não houver regra especial, pode ser usado
 */
export function calcRepass(
  grossAmount: number,
  psychologistName: string | undefined,
  fixedRepass?: number
): number {
  if (psychologistName?.toLowerCase().includes('michelly')) {
    return grossAmount * MICHELLY_REPASS_RATE;
  }
  
  // Regra padrão de 50% para todos os outros
  return grossAmount * DEFAULT_REPASS_RATE;
}
