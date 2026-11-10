-- pg_graphql exposes the base tables without the field masking of the `api` views, and its multi-statement
-- mutations defeat per-statement checks. The panel never uses it (it talks to the `api` views through
-- PostgREST), so it is dropped; config.toml no longer exposes graphql_public either.
DROP EXTENSION IF EXISTS pg_graphql CASCADE;

-- Realtime carries no business rows: the app's access_changed channel is a Broadcast (realtime.send),
-- which does not use this publication.
DO $$
DECLARE
   t RECORD;
BEGIN
   IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      FOR t IN SELECT schemaname, tablename FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname IN ('public', 'api') LOOP
         EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', t.schemaname, t.tablename);
      END LOOP;
   END IF;
END $$;
