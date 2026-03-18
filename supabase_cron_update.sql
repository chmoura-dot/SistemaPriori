-- 1. Agendamento dos Lembretes de WhatsApp (Roda a cada 1 hora)
-- Se der erro no unschedule, apenas ignore e siga para o próximo comando
DO $$ 
BEGIN 
  PERFORM cron.unschedule('whatsapp-reminder'); 
EXCEPTION WHEN OTHERS THEN 
  NULL; 
END $$;

SELECT cron.schedule('whatsapp-reminder', '0 * * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/whatsapp-reminder',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_QmONPqT-RHo6MdVaAqZc8w_nSM_9PR0"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 2. Agendamento da Agenda Individual para Psicólogos (06:00 BRT / 09:00 UTC)
DO $$ 
BEGIN 
  PERFORM cron.unschedule('daily-agenda-email'); 
EXCEPTION WHEN OTHERS THEN 
  NULL; 
END $$;

SELECT cron.schedule('daily-agenda-email', '0 9 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/daily-agenda-email',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_QmONPqT-RHo6MdVaAqZc8w_nSM_9PR0"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);

-- 3. Agendamento do Resumo Geral para Coordenação (07:00 BRT / 10:00 UTC)
DO $$ 
BEGIN 
  PERFORM cron.unschedule('clinic-daily-summary'); 
EXCEPTION WHEN OTHERS THEN 
  NULL; 
END $$;

SELECT cron.schedule('clinic-daily-summary', '0 10 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/clinic-daily-summary',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_QmONPqT-RHo6MdVaAqZc8w_nSM_9PR0"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);
