-- 064: the cutover (R2). Every user-side read and write now goes through the masked views in `api`
-- (owned by api_owner, NOLOGIN, not BYPASSRLS, a member of authenticated). anon and authenticated lose
-- every grant on the public tables and the 18 public views, so `api` is the only data path for a
-- signed-in user: a stale bundle or a hand-made request against `public` gets 42501.
--
-- Kept: service_role's grants (Edge Functions with the service key), api_owner's own grants (053/057:
-- full DML on the bases its writable views forward to, SELECT only on the read-only ones), and every
-- function EXECUTE grant (the converted RPCs, my_access and friends are unchanged).
--
-- Production: expose the `api` schema (Dashboard -> Settings -> API -> Exposed schemas: public, api)
-- before `supabase db push`, push 048-064 in one go, and deploy the app in the same window (README).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Tables created later by postgres in public grant nothing to the client roles either; a new table
-- reaches users only through an api view (private.enable_field_security).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
