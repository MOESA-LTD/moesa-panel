-- 064: the cutover (R2). Every user-side read and write now goes through the masked views in `api`
-- (owned by api_owner, NOLOGIN, not BYPASSRLS, a member of authenticated). anon and authenticated lose
-- every grant on the public tables and the 18 public views, so `api` is the only data path for a
-- signed-in user: a stale bundle or a hand-made request against `public` gets 42501.
--
-- Kept: service_role's grants (Edge Functions with the service key), api_owner's own grants (053/057:
-- full DML on the bases its writable views forward to, SELECT only on the read-only ones), and every
-- function EXECUTE grant (the converted RPCs, my_access and friends are unchanged).
--
-- Production order (README): (1) Exposed schemas = `public, api`, in that order (the first is the
-- default profile); (2) `supabase db push` 048-065; (3) `supabase functions deploy` right after the
-- push, never before (the new functions need `api`); (4) deploy the app in the same window, reload tabs.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Tables created later by postgres in public grant nothing to the client roles either; a new table
-- reaches users only through an api view (private.enable_field_security).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- Sequences too (audit_log_id_seq carried rwU): only definers and the service role draw from them.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- supabase_admin's default privileges in public still grant anon and authenticated everything on new
-- tables and sequences. Only a member of supabase_admin may change them, which the migration role is
-- not locally and likely not on the hosted project, so a refusal is skipped. The 064 test asserts on
-- every relation's ACL instead, which catches an object created under those defaults.
DO $$
BEGIN
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'supabase_admin default privileges left as they are: %', SQLERRM;
END;
$$;

-- The 18 public views stay (service_role reads them) but are no longer an API path.
COMMENT ON VIEW public.company_subscription IS 'Deprecated: read api.company_subscription; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_change_request IS 'Deprecated: read api.dashboard_change_request; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_gate_pending IS 'Deprecated: read api.dashboard_gate_pending; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_incident IS 'Deprecated: read api.dashboard_incident; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_market IS 'Deprecated: read api.dashboard_market; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_notification_feed IS 'Deprecated: read api.dashboard_notification_feed; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_product_evidence IS 'Deprecated: read api.dashboard_product_evidence; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_purchase_order IS 'Deprecated: read api.dashboard_purchase_order; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_shipment IS 'Deprecated: read api.dashboard_shipment; revoked from API roles in 064.';
COMMENT ON VIEW public.dashboard_task_due IS 'Deprecated: read api.dashboard_task_due; revoked from API roles in 064.';
COMMENT ON VIEW public.incident_overview IS 'Deprecated: read api.incident_overview; revoked from API roles in 064.';
COMMENT ON VIEW public.market_cell_overview IS 'Deprecated: read api.market_cell_overview; revoked from API roles in 064.';
COMMENT ON VIEW public.media_library IS 'Deprecated: read api.media_library; revoked from API roles in 064.';
COMMENT ON VIEW public.product_evidence IS 'Deprecated: read api.product_evidence; revoked from API roles in 064.';
COMMENT ON VIEW public.product_with_evidence IS 'Deprecated: read api.product_with_evidence; revoked from API roles in 064.';
COMMENT ON VIEW public.purchase_order_overview IS 'Deprecated: read api.purchase_order_overview; revoked from API roles in 064.';
COMMENT ON VIEW public.shipment_overview IS 'Deprecated: read api.shipment_overview; revoked from API roles in 064.';
COMMENT ON VIEW public.tenant_member IS 'Deprecated: read api.tenant_member; revoked from API roles in 064.';
