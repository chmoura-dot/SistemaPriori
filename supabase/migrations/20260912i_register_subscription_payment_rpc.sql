-- ============================================================================
-- Migration: RPC atomica para registrar pagamento de assinatura
-- Data: 2026-09-12
-- Causa: `SubscriptionsPage.handleRegisterPayment` diz ao usuario "isso
--        renovara por mais 30 dias", mas o backend real (customerService.
--        createPayment) so fazia um INSERT em `payments` — nunca avançava
--        `next_renewal`/`status` da assinatura. A logica correta (avancar
--        30 dias a partir do vencimento atual e reativar o status) so
--        existia no MOCK (mockEntityHandlers.createPayment), nunca foi
--        portada para o Supabase real. Resultado: toda assinatura ficava
--        com `next_renewal` congelado na data original para sempre.
-- Correcao: RPC que insere o pagamento E avanca a assinatura na mesma
--        transacao (mesmo padrao ja usado em `inactivate_customer`), para
--        nunca deixar pagamento registrado sem a assinatura renovada (ou
--        vice-versa) em caso de falha parcial.
-- Observacao: assume que `subscriptions.next_renewal` e' coluna `date`
--        (mesmo padrao das demais colunas de data do sistema, ex.
--        `appointments.date`).
-- ============================================================================

CREATE OR REPLACE FUNCTION register_subscription_payment(
  p_subscription_id uuid,
  p_amount numeric,
  p_repass_amount numeric,
  p_paid_at date
)
RETURNS payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_next    date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT next_renewal INTO v_next FROM subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;

  INSERT INTO payments (subscription_id, amount, repass_amount, paid_at)
  VALUES (p_subscription_id, p_amount, p_repass_amount, p_paid_at)
  RETURNING * INTO v_payment;

  UPDATE subscriptions
     SET next_renewal = v_next + 30,
         status = 'active'
   WHERE id = p_subscription_id;

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION register_subscription_payment(uuid, numeric, numeric, date) TO authenticated;
