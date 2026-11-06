-- The Amazon schedules (047): pg_net is installed; pg_cron holds two jobs, the status poll every
-- ten minutes and the product type schema refresh on Mondays at 04:00, each running
-- private.amazon_cron_call with its function path; the helper is SECURITY DEFINER with an empty
-- search_path and neither anon nor authenticated can run it; with the Vault secrets
-- edge_function_url / edge_service_key missing it returns NULL and does not raise; with them set
-- it queues one POST to <url>/<path> carrying the service key as a Bearer token. What it writes
-- is rolled back.
BEGIN;

SELECT plan(12);

SELECT has_extension('pg_net', 'pg_net is installed');

SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'amazon-poll'), '*/10 * * * *', 'the poll runs every ten minutes');
SELECT is((SELECT command FROM cron.job WHERE jobname = 'amazon-poll'), $$SELECT private.amazon_cron_call('amazon-poll')$$, 'the poll job calls the poll function');
SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'amazon-schema-refresh'), '0 4 * * 1', 'the schema refresh runs on Mondays at 04:00');
SELECT is((SELECT command FROM cron.job WHERE jobname = 'amazon-schema-refresh'), $$SELECT private.amazon_cron_call('amazon-schema/refresh')$$, 'the refresh job calls the schema refresh route');

SELECT is((SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'private.amazon_cron_call(text)'::regprocedure), TRUE, 'the helper is SECURITY DEFINER');
SELECT ok((SELECT p.proconfig @> ARRAY['search_path=""'] FROM pg_proc p WHERE p.oid = 'private.amazon_cron_call(text)'::regprocedure), 'the helper has an empty search_path');
SELECT is(has_function_privilege('authenticated', 'private.amazon_cron_call(text)', 'EXECUTE'), FALSE, 'authenticated cannot run the helper');
SELECT is(has_function_privilege('anon', 'private.amazon_cron_call(text)', 'EXECUTE'), FALSE, 'anon cannot run the helper');

DELETE FROM vault.secrets WHERE name IN ('edge_function_url', 'edge_service_key');
SELECT is(private.amazon_cron_call('amazon-poll'), NULL, 'no secrets, no call and no error');

SELECT vault.create_secret('http://example.invalid/functions/v1', 'edge_function_url');
SELECT vault.create_secret('test-key', 'edge_service_key');
SELECT set_config('test.request', private.amazon_cron_call('amazon-schema/refresh')::TEXT, TRUE);
SELECT is((SELECT q.url FROM net.http_request_queue q WHERE q.id = current_setting('test.request')::BIGINT),
          'http://example.invalid/functions/v1/amazon-schema/refresh', 'with the secrets set the call is queued at the function URL');
SELECT is((SELECT q.headers ->> 'Authorization' FROM net.http_request_queue q WHERE q.id = current_setting('test.request')::BIGINT), 'Bearer test-key', 'it carries the service key');

SELECT * FROM finish();

ROLLBACK;
