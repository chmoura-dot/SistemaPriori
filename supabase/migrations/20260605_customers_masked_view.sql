-- ============================================================================
-- Migration: View de Pacientes com CPF Mascarado
-- Data: 2026-06-05
-- Objetivo: Minimização de dados (LGPD Art. 6, III) — expor apenas os
--           últimos dígitos do CPF em listagens gerais.
-- ============================================================================

-- View que mascara dados sensíveis para listagens gerais
CREATE OR REPLACE VIEW customers_masked AS
SELECT
  id,
  name,
  email,
  phone,
  health_plan,
  psychologist_id,
  status,
  inactivation_reason,
  notes,
  custom_price,
  custom_repass_amount,
  birth_date,
  gender,
  -- Mascara a senha AMS (nunca exibir em listagens)
  CASE
    WHEN ams_password IS NOT NULL THEN '••••••'
    ELSE NULL
  END AS ams_password_masked,
  ams_password_expiry,
  created_at
FROM customers;

-- Comentário na view para documentação
COMMENT ON VIEW customers_masked IS
  'View com dados sensíveis mascarados para uso em listagens gerais. '
  'Para edição de cadastro individual, acessar a tabela customers diretamente.';
