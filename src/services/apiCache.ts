/**
 * Cache leve em memória para as chamadas de leitura (get*) da API.
 *
 * Diagnóstico (lentidão percebida ao navegar entre páginas):
 * Cada página/hook (Dashboard, Agenda, Clientes, Financeiro, Repasse, etc.)
 * carrega seus próprios dados via `useEffect(loadData, [])`, sem nenhuma
 * camada de cache entre eles. Como a navegação troca o componente da página
 * (App.tsx faz um switch de rota), o componente é desmontado/remontado e o
 * `useEffect` dispara de novo — refazendo do zero, a cada clique no menu,
 * o download de listas que mudam pouco (psicólogos, planos, feriados) e até
 * de coleções pesadas (até 10.000 agendamentos por consulta).
 *
 * Este módulo resolve isso com 3 mecanismos, SEM alterar nenhum contrato,
 * assinatura ou regra de negócio dos métodos existentes em `AppService`:
 *
 *  1. TTL (time-to-live): cada leitura fica "fresca" em memória por alguns
 *     segundos/minutos. Dentro da janela, chamadas repetidas retornam
 *     instantaneamente (0ms), sem round-trip ao Supabase.
 *  2. Deduplicação de requisições em voo: se vários hooks pedirem o mesmo
 *     dado ao mesmo tempo (ex: os 6 sub-hooks do Dashboard chamando
 *     `getCustomers()` simultaneamente), apenas UMA requisição de rede é
 *     disparada — todos aguardam a mesma Promise.
 *  3. Invalidação explícita: toda operação de escrita (create/update/delete)
 *     invalidada em `api.ts` remove as chaves afetadas do cache,
 *     garantindo que a autoria local sempre veja o dado que acabou de
 *     gravar no banco.
 *
 * Trade-off consciente: como o TTL é curto (30s–10min conforme a
 * volatilidade de cada coleção) e toda escrita própria invalida o cache na
 * hora, o único cenário de leve desatualização é: usuário A edita um
 * registro e usuário B, em outra sessão, só vê a mudança quando o cache dele
 * expirar (ou navegar novamente após o TTL). Esse é o mesmo tipo de
 * defasagem que já existe hoje nas páginas que não recarregam sozinhas
 * enquanty o usuário permanece nelas — não é uma regressão de comportamento.
 */

interface CacheEntry<T> {
  data?: T;
  expiresAt: number;
  inFlight?: Promise<T>;
}

class ApiCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Retorna o valor em cache (se ainda válido) ou executa `fetcher()`,
   * armazenando o resultado por `ttlMs` milissegundos.
   */
  async get<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    if (entry) {
      // Dado fresco em memória → retorna instantaneamente, sem ir à rede.
      if (entry.data !== undefined && entry.expiresAt > now) return entry.data;
      // Já existe uma requisição em andamento para essa mesma chave → reaproveita.
      if (entry.inFlight) return entry.inFlight;
    }

    const promise = fetcher()
      .then(data => {
        this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
        return data;
      })
      .catch(err => {
        // Falha não deve "grudar" no cache — remove a entrada para permitir retry limpo.
        this.store.delete(key);
        throw err;
      });

    this.store.set(key, { ...(entry ?? { expiresAt: 0 }), inFlight: promise });
    return promise;
  }

  /**
   * Remove todas as chaves que sejam exatamente `prefix` ou comecem com
   * `${prefix}:`. Sem argumento, limpa o cache inteiro (usado no logout).
   */
  invalidate(prefix?: string): void {
    if (!prefix) { this.store.clear(); return; }
    for (const key of this.store.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) this.store.delete(key);
    }
  }
}

export const apiCache = new ApiCache();

/** TTLs padronizados por volatilidade da coleção. */
export const CACHE_TTL = {
  /** Muda com frequência durante o expediente (agenda, faturamento, repasses, fila). */
  SHORT: 30_000,
  /** Muda algumas vezes por dia (clientes, psicólogos, planos, assinaturas, despesas). */
  MEDIUM: 2 * 60_000,
  /** Raramente muda (feriados, fechamentos, configurações). */
  LONG: 10 * 60_000,
} as const;
