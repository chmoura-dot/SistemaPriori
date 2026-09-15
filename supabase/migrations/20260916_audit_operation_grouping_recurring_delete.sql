-- ============================================================================
-- Migration: Agrupamento de auditoria financeira — exclusão de recorrência
-- Data: 2026-09-16
-- Objetivo: editar/excluir um agendamento recorrente com "aplicar a todos os
--   futuros" chama deleteFutureAppointments, que fazia um DELETE em lote
--   direto do navegador (supabase.from('appointments').delete()...), sem
--   passar por RPC — por isso nunca marcava app.operation_id e cada
--   atendimento excluído virava uma linha solta na Auditoria Financeira.
--   Mesmo padrão de correção já aplicado a sync_billing_batch_appointments,
--   mark_billing_batch_paid, apply_customer_health_plan_retro,
--   apply_customer_price_propagation e bulk_adjust_plan_prices.
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_future_recurring_appointments(
  p_recurrence_group_id text,
  p_from_date           date,
  p_operation_id        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM set_config('app.operation_id', COALESCE(p_operation_id, gen_random_uuid())::text, true);

  -- ::text no lado da coluna evita erro de operador caso recurrence_group_id
  -- seja uuid e o parâmetro chegue como texto simples.
  DELETE FROM appointments
  WHERE recurrence_group_id::text = p_recurrence_group_id
    AND date >= p_from_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_future_recurring_appointments(text, date, uuid) TO authenticated;

-- Verificação
SELECT proname FROM pg_proc WHERE proname = 'delete_future_recurring_appointments';
