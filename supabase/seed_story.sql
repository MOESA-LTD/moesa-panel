-- The development story seed: a coherent story for MOESA LTD on top of seed.sql. Development
-- only, never in config.toml. Run by scripts/seed-story.mjs (pnpm dev:seed-story from app/),
-- which uploads the media files first, then pipes this file to psql as postgres with
-- --single-transaction; supabase/seed_story.check.sql then checks the result.
--
-- Each story step is one DO block and one audit transaction:
--   PERFORM private.story_begin('<actor e-mail>', '<tenant>');   -- actor, tenant, fresh audit
--   … the step's writes (private.story_bypass(TRUE) only for backdated PO/shipment moves) …
--   PERFORM private.story_end('<age>');                          -- backdates the step's feed
-- The whole run is one transaction, so set_config(…, TRUE) values last until its end;
-- story_begin resets them, so nothing a step sets reaches the next one.
--
-- Rows are found by fixed UUID 5eed00SS-0000-4000-8000-0000000000NN (SS = step, NN = row);
-- seed.sql rows by code, sku or name. Codes and dates are never hard-coded (they depend on the
-- year and on today).

-- Refuses a second run: the story is loaded on top of a fresh `supabase db reset` only.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.customer WHERE code = 'KRN') THEN
        RAISE EXCEPTION 'seed_story: already loaded (customer KRN exists)';
    END IF;
END;
$$;

-- Starts a step as that user in that tenant: claims and headers (local, no SET ROLE, so the
-- audit actor and auth.uid() are that user), a new audit transaction and the rules bypass off.
-- Returns the tenant id.
CREATE FUNCTION private.story_begin (p_actor_email TEXT, p_tenant_name TEXT) RETURNS UUID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_actor UUID := (SELECT u.id FROM public.user u WHERE u.email = p_actor_email);
    v_tenant UUID := (SELECT t.id FROM public.tenant t WHERE t.display_name = p_tenant_name);
BEGIN
    IF v_actor IS NULL OR v_tenant IS NULL THEN
        RAISE EXCEPTION 'story: unknown user/tenant %', p_actor_email || ' / ' || p_tenant_name;
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::TEXT, TRUE);
    PERFORM set_config('request.headers', json_build_object('x-tenant-id', v_tenant, 'x-tenant-ids', v_tenant)::TEXT, TRUE);
    PERFORM set_config('audit.transaction_id', '', TRUE);
    PERFORM set_config('audit.tenant_id', '', TRUE);
    PERFORM set_config('moesa.rules_bypass', '', TRUE);

    IF private.rules_bypassed() THEN
        RAISE EXCEPTION 'story: the rules bypass is still on';
    END IF;

    RETURN v_tenant;
END;
$$;

-- Switches the rules bypass (private.rules_bypassed, 030) on or off for the rest of the step;
-- only for backdated purchase order and shipment transitions.
CREATE FUNCTION private.story_bypass (p_enabled BOOLEAN) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    PERFORM set_config('moesa.rules_bypass', CASE WHEN p_enabled THEN '1' ELSE '' END, TRUE);

    IF private.rules_bypassed() IS DISTINCT FROM p_enabled THEN
        RAISE EXCEPTION 'story: the rules bypass could not be turned %', CASE WHEN p_enabled THEN 'on' ELSE 'off' END;
    END IF;
END;
$$;

-- Ends a step: its audit transaction and log rows move p_age into the past (both together, the
-- feed joins them on equal created_at). A step that wrote nothing is a bug in the story.
CREATE FUNCTION private.story_end (p_age INTERVAL) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_tx UUID := nullif(current_setting('audit.transaction_id', TRUE), '')::UUID;
BEGIN
    IF v_tx IS NULL THEN
        RAISE EXCEPTION 'story: step wrote nothing';
    END IF;

    UPDATE public.audit_log SET created_at = created_at - p_age WHERE transaction_id = v_tx;
    UPDATE public.audit_transaction SET created_at = created_at - p_age WHERE id = v_tx;

    PERFORM set_config('audit.transaction_id', '', TRUE);
END;
$$;

-- The story steps (02–10) follow here.

DROP FUNCTION private.story_begin (TEXT, TEXT),
private.story_bypass (BOOLEAN),
private.story_end (INTERVAL);

-- The last block: no step may leave the rules bypass on, and no claims outlive the story.
DO $$
BEGIN
    IF coalesce(current_setting('moesa.rules_bypass', TRUE), '') = '1' THEN
        RAISE EXCEPTION 'seed_story: the rules bypass is still on at the end';
    END IF;

    PERFORM set_config('request.jwt.claims', '', TRUE);
    PERFORM set_config('request.headers', '', TRUE);
END;
$$;
