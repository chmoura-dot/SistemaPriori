/**
 * Logger seguro.
 * - log/warn/error: só imprimem no console em DEV (evita vazamento de PII no DevTools).
 * - critical: SEMPRE persiste a falha no banco (tabela operation_failures via RPC),
 *   inclusive em produção, para que erros de fluxos críticos (faturamento, repasse,
 *   inativação) não desapareçam silenciosamente.
 */
import { supabase } from './supabase';

const isDev = import.meta.env.DEV;

type Severity = 'warn' | 'error' | 'critical';

/**
 * Registra uma falha de operação de negócio de forma persistente.
 * Nunca lança — falha de logging não deve quebrar o fluxo do usuário.
 *
 * @param context  Identificador do ponto de falha (ex: 'billing.handleCreateBatch')
 * @param error    Erro capturado (Error, string ou objeto)
 * @param details  Contexto adicional serializável (IDs envolvidos, etapa que falhou)
 * @param severity Nível de gravidade (default 'error')
 */
async function logFailure(
  context: string,
  error: unknown,
  details?: Record<string, unknown>,
  severity: Severity = 'error',
): Promise<void> {
  const message =
    error instanceof Error ? error.message :
    typeof error === 'string' ? error :
    JSON.stringify(error);

  if (isDev) console.error(`[${severity}] ${context}:`, error, details ?? '');

  try {
    await supabase.rpc('log_operation_failure', {
      p_context: context,
      p_message: message?.slice(0, 2000) ?? 'unknown error',
      p_details: details ? (details as unknown as object) : null,
      p_severity: severity,
    });
  } catch {
    // Silencioso: se nem o logging funcionar, ao menos não derruba o fluxo.
    if (isDev) console.error('[logger] Falha ao persistir operation_failure');
  }
}

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args); },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]) => { if (isDev) console.error(...args); },

  /** Persiste a falha no banco (produção inclusive). Use em catches de fluxos críticos. */
  critical: (context: string, error: unknown, details?: Record<string, unknown>) =>
    logFailure(context, error, details, 'critical'),

  /** Persiste a falha no banco com severidade 'error'. */
  failure: (context: string, error: unknown, details?: Record<string, unknown>) =>
    logFailure(context, error, details, 'error'),
};
