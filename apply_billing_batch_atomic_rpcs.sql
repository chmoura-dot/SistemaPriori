-- ============================================================
-- RPCs atômicas para lotes de faturamento
-- ============================================================
-- Rode este script no SQL Editor do Supabase (produção).
-- É idempotente (CREATE OR REPLACE) — seguro reexecutar.
-- Conteúdo idêntico à migration 20260910_billing_batch_atomic_rpcs.sql.
-- ============================================================

-- ─── delete_billing_batch ───────────────────────────────────────────────────
-- Exclui um lote e desvincula os atendimentos numa única transação.
-- Bloqueia a exclusão se já existir repasse gerado para o lote (lacuna que
-- não era checada antes na exclusão de lote inteiro).
CREATE OR REPLACE FUNCTION delete_billing_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_repasse_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT COUNT(*) INTO v_repasse_count
  FROM repasses
  WHERE billing_batch_id = p_batch_id;

  IF v_repasse_count > 0 THEN
    RAISE EXCEPTION 'Não é possível excluir: já existe(m) % repasse(s) gerado(s) para este lote.', v_repasse_count;
  END IF;

  UPDATE appointments SET
    billing_batch_id = NULL,
    billing_status = NULL,
    denial_reason = NULL,
    denial_resolution = NULL,
    paid_at = NULL
  WHERE billing_batch_id = p_batch_id;

  DELETE FROM billing_batches WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_billing_batch(uuid) TO authenticated;

-- ─── sync_billing_batch_appointments ────────────────────────────────────────
-- Atualiza um lote (array de atendimentos + campos escalares opcionais) e
-- sincroniza appointments.billing_batch_id dos IDs que entraram/saíram, tudo
-- numa única transação. Substitui o padrão atual de 2-3 chamadas separadas
-- (updateBillingBatch + N updateAppointment) usado por handleCreateBatch,
-- handleSaveAsDraft, handleQuickAddToDraft, handleFinalizeBatch,
-- releaseFromOtherDrafts, handleRemoveAppointmentFromBatch e
-- handleAddAppointmentToBatch.
CREATE OR REPLACE FUNCTION sync_billing_batch_appointments(
  p_batch_id        uuid,
  p_appointment_ids uuid[],
  p_total_amount    numeric,
  p_status          text DEFAULT NULL,
  p_batch_number    text DEFAULT NULL,
  p_sent_at         timestamptz DEFAULT NULL,
  p_paid_at         timestamptz DEFAULT NULL,
  p_ignored_ids     uuid[] DEFAULT NULL,
  p_ignored_reason  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_ids uuid[];
  v_added   uuid[];
  v_removed uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT appointment_ids INTO v_old_ids
  FROM billing_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de faturamento não encontrado: %', p_batch_id;
  END IF;

  UPDATE billing_batches SET
    appointment_ids = p_appointment_ids,
    total_amount    = p_total_amount,
    status          = COALESCE(p_status, status),
    batch_number    = COALESCE(p_batch_number, batch_number),
    sent_at         = COALESCE(p_sent_at, sent_at),
    paid_at         = COALESCE(p_paid_at, paid_at)
  WHERE id = p_batch_id;

  v_added := ARRAY(
    SELECT unnest(p_appointment_ids)
    EXCEPT
    SELECT unnest(COALESCE(v_old_ids, ARRAY[]::uuid[]))
  );

  v_removed := ARRAY(
    SELECT unnest(COALESCE(v_old_ids, ARRAY[]::uuid[]))
    EXCEPT
    SELECT unnest(p_appointment_ids)
  );

  IF array_length(v_added, 1) > 0 THEN
    UPDATE appointments SET billing_batch_id = p_batch_id
    WHERE id = ANY(v_added);
  END IF;

  IF array_length(v_removed, 1) > 0 THEN
    UPDATE appointments SET
      billing_batch_id = NULL,
      billing_ignored = CASE WHEN id = ANY(COALESCE(p_ignored_ids, ARRAY[]::uuid[])) THEN true ELSE billing_ignored END,
      billing_ignored_reason = CASE WHEN id = ANY(COALESCE(p_ignored_ids, ARRAY[]::uuid[])) THEN p_ignored_reason ELSE billing_ignored_reason END,
      billing_ignored_at = CASE WHEN id = ANY(COALESCE(p_ignored_ids, ARRAY[]::uuid[])) THEN now() ELSE billing_ignored_at END
    WHERE id = ANY(v_removed) AND billing_batch_id = p_batch_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'added', COALESCE(v_added, ARRAY[]::uuid[]),
    'removed', COALESCE(v_removed, ARRAY[]::uuid[])
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_billing_batch_appointments(uuid, uuid[], numeric, text, text, timestamptz, timestamptz, uuid[], text) TO authenticated;

-- Verificação
SELECT proname FROM pg_proc
 WHERE proname IN ('delete_billing_batch', 'sync_billing_batch_appointments')
 ORDER BY proname;
