-- Amazon schedules (M22, R8). pg_cron wakes two Edge Functions through pg_net:
--   amazon-poll             every 10 minutes  -> <functions url>/amazon-poll          (status poll)
--   amazon-schema-refresh   daily at 04:00    -> <functions url>/amazon-schema/refresh (product type schemas)
-- The jobs run private.amazon_cron_call(path), which reads the functions' base URL and the service
-- key from Vault at run time, so rotating the key needs no re-schedule. The two Vault secrets are
-- named edge_function_url and edge_service_key. Locally the story seed sets them. On the hosted
-- project the owner sets them once in the dashboard (Vault); until then every run logs
-- 'amazon_cron_unconfigured' and does nothing.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Queues one POST with an empty JSON body to <edge_function_url>/<p_path>, Bearer-authorised with
-- edge_service_key, with a 120 s timeout (the functions stop starting work after 100 s). Returns
-- the pg_net request id, or NULL when a secret is missing.
CREATE OR REPLACE FUNCTION private.amazon_cron_call (p_path TEXT) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    SELECT s.decrypted_secret INTO v_url FROM vault.decrypted_secrets s WHERE s.name = 'edge_function_url';
    SELECT s.decrypted_secret INTO v_key FROM vault.decrypted_secrets s WHERE s.name = 'edge_service_key';

    IF coalesce(v_url, '') = '' OR coalesce(v_key, '') = '' THEN
        RAISE LOG 'amazon_cron_unconfigured: set the Vault secrets edge_function_url and edge_service_key';
        RETURN NULL;
    END IF;

    RETURN net.http_post(
        url := rtrim(v_url, '/') || '/' || p_path,
        body := '{}'::JSONB,
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
        timeout_milliseconds := 120000
    );
END;
$$;

REVOKE ALL ON FUNCTION private.amazon_cron_call (TEXT) FROM PUBLIC, anon, authenticated;

-- cron.schedule with an existing name replaces that job, so a re-run keeps one job each.
SELECT cron.schedule('amazon-poll', '*/10 * * * *', $$SELECT private.amazon_cron_call('amazon-poll')$$);
SELECT cron.schedule('amazon-schema-refresh', '0 4 * * *', $$SELECT private.amazon_cron_call('amazon-schema/refresh')$$);
