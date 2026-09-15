-- Adiciona a quantidade de atendimentos acumulados até a data de referência
-- (sessões não canceladas com data <= referência) ao retorno de
-- get_portfolio_by_psychologist, para exibição na aba Gestão de Carteira.
-- DROP necessário: CREATE OR REPLACE não permite alterar a lista de colunas
-- retornadas (RETURNS TABLE) de uma função já existente.
DROP FUNCTION IF EXISTS public.get_portfolio_by_psychologist(date);

CREATE OR REPLACE FUNCTION public.get_portfolio_by_psychologist(p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(psychologist_id uuid, psychologist_name text, customer_id uuid, customer_name text, modality text, last_session_date date, next_session_date date, frequency text, cycle_start_date date, cycle_days integer, neuro_status text, total_sessions bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH patient_apps AS (
    SELECT
      a.customer_id,
      a.psychologist_id,
      CASE WHEN a.type = 'Avaliação Neuropsicológica' THEN 'Neuropsicologia' ELSE 'Psicoterapia' END as modality,
      MAX(a.date) FILTER (WHERE a.date <= p_reference_date AND a.status != 'canceled') as last_session_date,
      MIN(a.date) FILTER (WHERE a.date > p_reference_date AND a.status != 'canceled') as next_session_date,
      MIN(a.date) FILTER (WHERE a.status != 'canceled') as cycle_start_date,
      MAX(a.date) FILTER (WHERE a.status != 'canceled') as max_active_date,
      COUNT(*) FILTER (WHERE a.status != 'canceled') as total_active_sessions,
      COUNT(*) FILTER (WHERE a.date <= p_reference_date AND a.status != 'canceled') as total_sessions_to_date,
      (MODE() WITHIN GROUP (ORDER BY a.recurrence_frequency)) as frequency
    FROM appointments a
    WHERE a.is_internal = false OR a.is_internal IS NULL
    GROUP BY
      a.customer_id,
      a.psychologist_id,
      CASE WHEN a.type = 'Avaliação Neuropsicológica' THEN 'Neuropsicologia' ELSE 'Psicoterapia' END
  )
  SELECT
    p.id as psychologist_id,
    p.name as psychologist_name,
    c.id as customer_id,
    c.name as customer_name,
    pa.modality,
    pa.last_session_date,
    pa.next_session_date,
    pa.frequency::text,
    pa.cycle_start_date,
    CASE
      WHEN pa.modality = 'Neuropsicologia' THEN
        (p_reference_date - pa.cycle_start_date)::integer
      ELSE NULL
    END as cycle_days,
    CASE
      WHEN pa.modality = 'Neuropsicologia' THEN
        CASE
          WHEN pa.total_active_sessions = 0 THEN 'Cancelado'
          WHEN pa.cycle_start_date > p_reference_date THEN 'A iniciar'
          WHEN pa.max_active_date >= p_reference_date THEN 'Em andamento'
          ELSE 'Finalizado'
        END
      ELSE NULL
    END as neuro_status,
    pa.total_sessions_to_date as total_sessions
  FROM patient_apps pa
  JOIN customers c ON c.id = pa.customer_id
  JOIN psychologists p ON p.id = pa.psychologist_id
  WHERE c.status = 'active'
  ORDER BY p.name, pa.modality, c.name;
END;
$function$
