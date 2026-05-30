/**
 * Logger seguro — desabilitado em produção para evitar vazamento de PII no DevTools.
 * Substitui console.log/console.error em todo o app.
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args); },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]) => { if (isDev) console.error(...args); },
};
