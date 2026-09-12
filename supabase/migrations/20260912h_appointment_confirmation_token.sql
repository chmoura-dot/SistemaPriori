-- ============================================================================
-- Migration: Token de confirmacao do PACIENTE, com expiracao
-- Data: 2026-09-12
-- Causa: o link de confirmacao enviado ao paciente por WhatsApp
--        (`whatsapp-reminder`) usava o UUID real do agendamento na URL
--        (`/#/confirmacao/{appointment.id}`), e a Edge Function
--        `confirm-appointment` aceitava esse ID diretamente, sem checar
--        posse ou expiracao — ao contrario do fluxo do psicologo, que ja
--        usa `appointment_tokens` com `expires_at`. Isso expunha nome,
--        telefone e convenio do paciente, e permitia confirmar/cancelar a
--        sessao indefinidamente para quem obtivesse esse ID por qualquer
--        meio (link reencaminhado, historico do navegador, etc.).
-- Correcao: cada agendamento passa a ter seu proprio token de confirmacao
--        (aleatorio, distinto do ID real) e uma data de expiracao. O link
--        enviado ao paciente passa a usar esse token; a Edge Function
--        exige que o token exista e nao tenha expirado.
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS confirmation_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS confirmation_token_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_confirmation_token
  ON appointments (confirmation_token);
