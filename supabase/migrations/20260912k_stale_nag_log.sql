-- ============================================================================
-- Migration: idempotência diária do stale-confirmation-nag
-- Data: 2026-09-12
-- Causa: a edge function `stale-confirmation-nag` não guardava nenhum
--        registro de "já nagueei este psicólogo hoje" — cada execução (ex.
--        um cron disparado 2x por engano, ou reexecução manual) reenviava o
--        e-mail e criava um novo token `appointment_tokens` para todo
--        psicólogo com pendências, sem checagem alguma.
-- Correção: nova tabela `stale_nag_log`, com chave primária composta
--        (psychologist_id, nag_date). A função tenta inserir antes de
--        enviar o e-mail; se o INSERT colidir (ON CONFLICT DO NOTHING não
--        retornar linha), o psicólogo já foi nagueado hoje e o envio é
--        pulado — a checagem e a marcação são atômicas (não há janela entre
--        "checar" e "marcar" como haveria com um SELECT seguido de INSERT).
-- Observação: não reaproveita `appointment_tokens.date`, que já tem
--        semântica própria (marca o dia específico de um lembrete diário;
--        NULL sinaliza "resumo de pendências" para o frontend, ver
--        ConfirmationPage `isNag: !tokenData.date`) — misturar as duas coisas
--        quebraria essa distinção.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stale_nag_log (
  psychologist_id uuid NOT NULL REFERENCES psychologists(id) ON DELETE CASCADE,
  nag_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (psychologist_id, nag_date)
);

ALTER TABLE stale_nag_log ENABLE ROW LEVEL SECURITY;

-- Só a service role (usada pela edge function) precisa acessar esta tabela.
DROP POLICY IF EXISTS "Staff can read stale_nag_log" ON stale_nag_log;
CREATE POLICY "Staff can read stale_nag_log" ON stale_nag_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM app_users u WHERE u.user_id = auth.uid() OR u.email = auth.email())
  );
