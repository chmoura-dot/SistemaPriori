-- ============================================================================
-- Migration: separa "notificado" de "resolvido" em operation_failures
-- Data: 2026-09-12
-- Causa: `acknowledged` era usado para duas coisas ao mesmo tempo: (1) o cron
--        critical-failure-alert marca acknowledged=true assim que ENVIA o
--        e-mail de alerta (para nao reenviar a cada 5 min), e (2) a tela de
--        Configuracoes usava o mesmo campo para o botao "Marcar como
--        Resolvido". Resultado: o botao sumia (e o item aparecia acinzentado
--        como se estivesse tratado) poucos minutos depois da falha acontecer,
--        so porque o e-mail ja tinha saido — nao porque alguem de fato
--        verificou/corrigiu o problema.
-- Correcao: `acknowledged` volta a significar so "ja entrou num e-mail de
--        alerta" (uso interno do cron). Passa a existir `resolved` para
--        marcar que um humano de fato revisou e corrigiu, e esse campo e o
--        que a tela usa para o botao. Quando marcado, dispara um e-mail de
--        "problema resolvido" (funcao resolve-operation-failure) para quem
--        recebeu o alerta original.
-- ============================================================================

ALTER TABLE operation_failures
  ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

CREATE INDEX IF NOT EXISTS idx_operation_failures_unresolved
  ON operation_failures (resolved) WHERE resolved = false;
