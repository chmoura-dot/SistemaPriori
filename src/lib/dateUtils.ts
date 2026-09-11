/**
 * dateUtils.ts
 *
 * Formatação de datas ancorada no fuso de Brasília (America/Sao_Paulo).
 * `new Date().toISOString().split('T')[0]` é UTC — entre ~21h e 23h59 BRT
 * isso já retorna a data de amanhã. Use sempre `getTodayISO()`/`toISODateLocal()`
 * em vez disso.
 */

export function toISODateLocal(date: Date): string {
  return date
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .split('/')
    .reverse()
    .join('-');
}

export function getTodayISO(): string {
  return toISODateLocal(new Date());
}
