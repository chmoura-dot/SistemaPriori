/**
 * Utilitários para comparação segura de horários.
 * Converte strings "HH:MM" para minutos inteiros, evitando bugs
 * de comparação lexicográfica (ex: "9:00" > "10:00" = true no JS).
 */

/** Converte "HH:MM" para total de minutos desde 00:00. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Verifica se dois intervalos de tempo se sobrepõem (overlap). */
export function hasTimeOverlap(
  startA: string, endA: string,
  startB: string, endB: string
): boolean {
  const a0 = toMinutes(startA), a1 = toMinutes(endA);
  const b0 = toMinutes(startB), b1 = toMinutes(endB);
  return a0 < b1 && a1 > b0;
}
