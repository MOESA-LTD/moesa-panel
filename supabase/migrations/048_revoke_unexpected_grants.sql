-- Supabase grants ALL on every public table to anon and authenticated. TRUNCATE ignores RLS, so any
-- signed-in user could empty a table; REFERENCES and TRIGGER are no use to the API roles either.
-- Views and materialized views carry the same grants and are covered. SELECT/INSERT/UPDATE/DELETE stay
-- until the field-permissions cutover. supabase_admin defaults are left alone: migrations run as postgres.
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    LOOP
        EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t.relname);
    END LOOP;
END $$;

-- Tables postgres creates from now on do not get them back.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
