-- ============================================================
-- PASSO 0 — Verificação de migrations da "Operação Integridade"
-- ============================================================
-- Rode este script no SQL Editor do Supabase (produção) e me envie
-- o resultado. Ele APENAS CONSULTA o catálogo — não altera dados.
--
-- Objetivo: confirmar se as migrations 20260716_* já foram aplicadas
-- no banco remoto (a tabela operation_failures e as funções RPC).

-- 1. A tabela operation_failures existe?
--    Retorna 'operation_failures' se existir, ou NULL se não existir.
SELECT to_regclass('public.operation_failures') AS operation_failures_table;

-- 2. As funções RPC existem?
--    Deve retornar 3 linhas: inactivate_customer, log_operation_failure
--    (e qualquer outra que já exista).
SELECT proname AS function_name,
       pg_get_function_identity_arguments(oid) AS arguments
  FROM pg_proc
 WHERE proname IN ('inactivate_customer', 'log_operation_failure')
 ORDER BY proname;

-- 3. RLS habilitado em operation_failures?
--    Espera-se rowsecurity = true.
SELECT relname, relrowsecurity AS rls_enabled
  FROM pg_class
 WHERE relname = 'operation_failures';

-- 4. Políticas RLS existentes em operation_failures?
SELECT policyname, cmd
  FROM pg_policies
 WHERE tablename = 'operation_failures'
 ORDER BY policyname;
