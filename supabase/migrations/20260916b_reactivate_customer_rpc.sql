-- Reativação de paciente — contraparte de inactivate_customer
-- (20260716_inactivate_customer_rpc.sql).
--
-- inactivate_customer não faz só uma troca de status: numa única transação
-- ela cancela as consultas futuras (status='canceled', cancellation_billing
-- ='none'), pausa assinaturas ativas (status='inactive') e insere um evento
-- em discharge_events que dispara a notificação de "alta" para o admin. Um
-- "desfazer" incompleto deixaria consultas/assinaturas erradas ou uma
-- notificação de alta falsa. Por isso reactivate_customer aceita
-- p_restore_related: quando true, usa o audit_log (trigger fn_audit_log,
-- 20260605_audit_log.sql) para localizar exatamente as linhas gravadas pela
-- MESMA transação de inativação — no Postgres, now() é fixo durante toda a
-- transação, então todas as linhas de audit_log de uma mesma inactivate_
-- customer compartilham o mesmo created_at — e reverte apenas essas.
--
-- Cada UPDATE de restauração é guardado por uma condição no estado atual
-- (ex.: "AND status = 'canceled'"), então rodar esta função duas vezes ou
-- chamá-la para um registro que já mudou por outro motivo depois da
-- inativação nunca sobrescreve algo além do que essa inativação específica
-- causou.

CREATE OR REPLACE FUNCTION reactivate_customer(p_customer_id uuid, p_restore_related boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer                  customers%ROWTYPE;
  v_inactivation_log          audit_log%ROWTYPE;
  v_found_inactivation_log    boolean := false;
  v_log                       audit_log%ROWTYPE;
  v_appointments_restored     int := 0;
  v_subscriptions_restored    int := 0;
  v_discharge_events_removed  int := 0;
BEGIN
  -- Exige usuário autenticado (mesma garantia mínima de inactivate_customer)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado';
  END IF;

  IF v_customer.status <> 'inactive' THEN
    RAISE EXCEPTION 'Paciente já está ativo';
  END IF;

  -- 1. Reativa o cadastro
  UPDATE customers
     SET status = 'active',
         inactivation_reason = NULL
   WHERE id = p_customer_id;

  IF p_restore_related THEN
    -- Localiza a inativação (active -> inactive) mais recente deste paciente
    SELECT * INTO v_inactivation_log
      FROM audit_log
     WHERE table_name = 'customers'
       AND action = 'UPDATE'
       AND record_id = p_customer_id::text
       AND old_data->>'status' = 'active'
       AND new_data->>'status' = 'inactive'
     ORDER BY created_at DESC
     LIMIT 1;
    v_found_inactivation_log := FOUND;

    IF v_found_inactivation_log THEN
      -- 2. Restaura consultas canceladas pela mesma transação
      FOR v_log IN
        SELECT * FROM audit_log
         WHERE table_name = 'appointments'
           AND action = 'UPDATE'
           AND created_at = v_inactivation_log.created_at
           AND old_data->>'customer_id' = p_customer_id::text
           AND new_data->>'status' = 'canceled'
      LOOP
        UPDATE appointments
           SET status = v_log.old_data->>'status',
               cancellation_billing = v_log.old_data->>'cancellation_billing'
         WHERE id = (v_log.record_id)::uuid
           AND status = 'canceled';
        IF FOUND THEN
          v_appointments_restored := v_appointments_restored + 1;
        END IF;
      END LOOP;

      -- 3. Restaura assinaturas pausadas pela mesma transação
      FOR v_log IN
        SELECT * FROM audit_log
         WHERE table_name = 'subscriptions'
           AND action = 'UPDATE'
           AND created_at = v_inactivation_log.created_at
           AND old_data->>'customer_id' = p_customer_id::text
           AND old_data->>'status' = 'active'
           AND new_data->>'status' = 'inactive'
      LOOP
        UPDATE subscriptions
           SET status = 'active'
         WHERE id = (v_log.record_id)::uuid
           AND status = 'inactive';
        IF FOUND THEN
          v_subscriptions_restored := v_subscriptions_restored + 1;
        END IF;
      END LOOP;

      -- 4. Remove o evento de alta indevido criado pela mesma transação
      DELETE FROM discharge_events
       WHERE customer_id = p_customer_id
         AND created_at = v_inactivation_log.created_at;
      GET DIAGNOSTICS v_discharge_events_removed = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'restored_related', p_restore_related,
    'appointments_restored', v_appointments_restored,
    'subscriptions_restored', v_subscriptions_restored,
    'discharge_events_removed', v_discharge_events_removed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reactivate_customer(uuid, boolean) TO authenticated;
