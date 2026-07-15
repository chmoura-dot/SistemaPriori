-- Fase 3 da Auditoria — Transação atômica para inativação de paciente.
--
-- Substitui as 4 chamadas independentes que o frontend fazia (update customer +
-- update appointments + insert discharge_events + update subscriptions) por uma
-- única função plpgsql. Como o corpo roda dentro de uma transação implícita, se
-- qualquer etapa falhar o Postgres desfaz automaticamente TODAS as anteriores,
-- eliminando o cenário de "paciente inativo com agenda/assinatura ainda ativa".
--
-- Observação: mantém-se o comportamento atual (status literal 'inactive' em
-- subscriptions) para não alterar regra de negócio nesta fase.

CREATE OR REPLACE FUNCTION inactivate_customer(p_customer_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer        customers%ROWTYPE;
  v_psy_name        text;
  v_future_ids      uuid[];
  v_canceled_count  int := 0;
BEGIN
  -- Exige usuário autenticado (mesma garantia mínima do RLS atual)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado';
  END IF;

  SELECT name INTO v_psy_name
    FROM psychologists
   WHERE id = v_customer.psychologist_id;

  -- 1. Inativa o paciente
  UPDATE customers
     SET status = 'inactive',
         inactivation_reason = p_reason
   WHERE id = p_customer_id;

  -- 2. Cancela todas as consultas futuras (active/released)
  SELECT array_agg(id) INTO v_future_ids
    FROM appointments
   WHERE customer_id = p_customer_id
     AND date >= current_date
     AND status IN ('active', 'released');

  IF v_future_ids IS NOT NULL THEN
    UPDATE appointments
       SET status = 'canceled',
           cancellation_billing = 'none'
     WHERE id = ANY(v_future_ids);
    v_canceled_count := array_length(v_future_ids, 1);
  END IF;

  -- 3. Registra evento de alta para notificação ao admin
  INSERT INTO discharge_events (
    customer_id, psychologist_id, customer_name,
    psychologist_name, appointments_canceled
  )
  VALUES (
    p_customer_id,
    v_customer.psychologist_id,
    v_customer.name,
    COALESCE(v_psy_name, 'Psicólogo'),
    v_canceled_count
  );

  -- 4. Pausa assinaturas ativas do paciente
  UPDATE subscriptions
     SET status = 'inactive'
   WHERE customer_id = p_customer_id
     AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'appointments_canceled', v_canceled_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION inactivate_customer(uuid, text) TO authenticated;
