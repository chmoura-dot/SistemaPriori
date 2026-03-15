SELECT cron.unschedule('whatsapp-reminder');

SELECT cron.unschedule('daily-agenda-email');

SELECT cron.schedule('daily-agenda-email', '0 6 * * *', $$
  SELECT net.http_post(
      url:='https://ntqkrxtesuaeobxpmznr.supabase.co/functions/v1/daily-agenda-email',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer SUA_ANON_KEY_AQUI"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
$$);
