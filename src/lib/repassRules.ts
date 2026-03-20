/**
 * Regras de repasse dinâmicas baseadas nas configurações do psicólogo no banco de dados.
 */
import { Psychologist } from '../services/types';

/** Percentual padrão de repasse (50%) caso não esteja definido no banco */
const DEFAULT_REPASS_RATE = 0.50;

/**
 * Retorna o valor de repasse correto para um atendimento.
 *
 * @param grossAmount  Valor bruto do atendimento
 * @param psychologist Objeto do psicólogo com suas regras de repasse
 */
export function calcRepass(
  grossAmount: number,
  psychologist: Psychologist | undefined
): number {
  if (!psychologist) {
    return grossAmount * DEFAULT_REPASS_RATE;
  }

  // Se houver um valor fixo definido, ele tem prioridade
  if (psychologist.repassFixedAmount !== undefined && psychologist.repassFixedAmount !== null && psychologist.repassFixedAmount > 0) {
    return psychologist.repassFixedAmount;
  }

  // Caso contrário, usa o percentual (rate) definido ou o padrão
  const rate = psychologist.repassRate ?? DEFAULT_REPASS_RATE;
  return grossAmount * rate;
}
