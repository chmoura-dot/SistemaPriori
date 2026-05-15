import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ⛔ GUARDRAIL DE SEGURANÇA: Service Role Key NUNCA deve estar no frontend.
// Se estiver presente, significa que foi prefixada com VITE_ por engano,
// o que a expõe no bundle JS para qualquer usuário.
// Remova VITE_SUPABASE_SERVICE_ROLE_KEY do .env imediatamente.
if (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    '[SECURITY] VITE_SUPABASE_SERVICE_ROLE_KEY detectada no bundle do cliente! ' +
    'Esta chave concede acesso irrestrito ao banco de dados (bypass de RLS). ' +
    'Remova-a do .env imediatamente. Use-a apenas em Edge Functions/backend.'
  );
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

// Guardrail: in alguns ambientes, a chave foi configurada incorretamente (ex: chave do Google "AIza...").
// O Supabase exige uma chave do tipo "sb_..." (publishable/anon) ou um JWT (inicia com "eyJ...").
// Se estiver errada, o Supabase retorna 401 em chamadas (incluindo Edge Functions).
if (
  !supabaseAnonKey.startsWith('sb_') &&
  !supabaseAnonKey.startsWith('eyJ')
) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Supabase] VITE_SUPABASE_ANON_KEY parece inválida. Use a chave do Supabase (Settings > API). ' +
      'Formatos esperados: "sb_..." ou JWT "eyJ...".'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
