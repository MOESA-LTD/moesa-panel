CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 063: pg_graphql is off (it exposed the base tables unmasked and ran multi-statement mutations), and no
-- business table is in the Realtime publication (the app only uses Broadcast, through realtime.send).
BEGIN;

SELECT plan(2);

SELECT hasnt_extension('pg_graphql', 'pg_graphql is disabled');
SELECT is_empty($$ SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname IN ('public','api') $$, 'no business table is in the Realtime publication');

SELECT * FROM finish();
ROLLBACK;
