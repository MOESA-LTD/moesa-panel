-- Amazon listing publishing (M22), its core: what a product's Amazon listing holds, the cache of
-- Amazon's product type schemas, the submissions sent to Amazon, the customer's Amazon connection
-- with its refresh token in Vault, and the derived listing state of a market cell.
--
-- product                         amazon_product_type (Amazon's product type, e.g. LUGGAGE),
--                                 amazon_schema_version (the schema version the content was filled
--                                 against) and listing_attributes (the attribute values, an object
--                                 keyed by attribute name, the panel's whole listing content).
-- customer_platform_account       api_connection (none, connected, revoked), authorized_at and
--                                 seller_id (the selling partner id). Only an Amazon account is
--                                 ever connected (platform_account_api_amazon). One connection per
--                                 customer (R1): UNIQUE (customer_id, platform_id) stays.
-- market_cell                     listing_state (the API journey: draft, ready, submitted, live,
--                                 issues; NULL when the cell is not API-managed), listing_checked_at,
--                                 listing_language (the locale the listing is written in, xx_YY),
--                                 fulfillment_channel (fbm, fba) and listing_match (the catalogue
--                                 check: {asin, restricted, reasons, checked_at}). status stays the
--                                 business state (R2).
-- amazon_product_type_definition  Amazon's product type schema per (marketplace, product type,
--                                 locale), with its version, display name, JSON schema and property
--                                 groups. Tenant-neutral: every user reads it, only the service role
--                                 writes it (no write policy).
-- listing_submission              One submission of a cell's listing to Amazon (create, update or
--                                 delete), with its SKU, marketplace, payload, Amazon's submission id,
--                                 its status and Amazon's issues verbatim. Users read and insert
--                                 them; only the service role changes them.
--
-- Guards (check_violation, the message is the code):
--   market_cell_listing_server_only   a user (current_user authenticated) sets or changes
--                                     listing_state, listing_checked_at or listing_match
--   platform_account_api_server_only  a user writes a non-default api_connection, authorized_at
--                                     or seller_id (on UPDATE: changes one of them)
-- A user's listing_submission INSERT starts processing with no issues and no Amazon id, whatever
-- the client sends. A customer_platform_account inserted by a transfer (private.transferring())
-- starts disconnected: the Vault token is keyed by the source row's id. The guards are SECURITY
-- INVOKER, so current_user is the writer; the service functions below are SECURITY DEFINER and
-- pass them.
--
-- Vault  private.amazon_token(p_account_id) reads the secret named 'amazon:<account id>' (NULL
--        when there is none); private.amazon_token_set(p_account_id, p_refresh_token) creates or
--        updates it, and a NULL token deletes it. The token is never a table column, so it is in
--        no audit row.
--
-- Service RPCs (PostgREST exposes only public; SECURITY DEFINER, executable by service_role only):
--   amazon_account_token       the account's refresh token, NULL when none is stored
--   amazon_account_connect     stores the token (skipped when NULL, as in sandbox) and sets
--                              connected, authorized_at = now() and the seller id
--   amazon_account_disconnect  'none' clears the connection and deletes the token; 'revoked'
--                              (Amazon answered invalid_grant) deletes the token too and keeps
--                              authorized_at and seller_id: no credential lingers
--   listing_set_state          the cell's listing_state, listing_checked_at = now() and, when
--                              given, listing_match; the parent cell then mirrors its children
--   listing_apply_submission   Amazon's answer for a submission, applied to it and to its cell
--   listing_parent_cell        the cell of the product's parent in the same platform and country,
--                              inserted (as a candidate) when missing; NULL without a parent
-- A missing row raises no_data_found (P0002), a NULL listing state invalid_parameter_value (22023),
-- with a plain message: these are server errors, never shown to a user. Deleting a platform
-- account (directly or by cascade) deletes its token (platform_account_forget_token).
--
-- R2's walk (listing_apply_submission). The cell's status moves only through 034's transitions,
-- one UPDATE per step, each passing market_cell_z_guard (the rules are not bypassed):
--   1. the submission gets the status, the Amazon id (kept when none is given) and the issues;
--   2. the cell gets platform_product_id := its own or the ASIN, platform_sku := its own or the
--      submission's SKU, listing_state and listing_checked_at; with issues, open_issue := 'Amazon: '
--      and the first three messages joined with '; '; with any other state, an 'Amazon: ' open
--      issue is cleared unless the cell is suppressed (which needs it);
--   3. accepted, or live, unless the state is issues (issues never move the status): planned → preparing → uploaded; preparing → uploaded; a candidate (or a
--      paused, stopped, removed cell) does not move;
--   4. live: uploaded or suppressed → live, only with the listing data and approved content (L-G1,
--      as the guard asks); otherwise the status stays and listing_state is live anyway;
--   5. the parent's cell in the same platform and country, if any, mirrors the worst state of its
--      children's cells: issues < draft < ready < submitted < live (R7).
--
-- Transfer: listing_submission is carried with its cell (registry position 215, created_by is the
-- actor); the new product and cell columns are copied as plain data. Nothing resets listing_state:
-- the app treats a cell as draft while its customer's account is not connected.
--
-- Module listing (core): select and insert on public.listing_submission, for the owner role and
-- every role that may change products. The CASL subject is listing_submission.
--
-- Bucket listing-images: public (Amazon fetches the images without credentials, R5), PNG and JPEG
-- up to 10 MiB, no user storage policy: only the service role writes it.
--
-- public.market_cell_overview is rebuilt (its m.* was expanded when 034 created it).

-- Enums
CREATE TYPE public.listing_state AS ENUM ('draft', 'ready', 'submitted', 'live', 'issues');

CREATE TYPE public.api_connection AS ENUM ('none', 'connected', 'revoked');

CREATE TYPE public.listing_submission_kind AS ENUM ('create', 'update', 'delete');

CREATE TYPE public.listing_submission_status AS ENUM ('accepted', 'invalid', 'processing', 'done', 'failed');

-- Columns
ALTER TABLE public.product
ADD COLUMN IF NOT EXISTS amazon_product_type TEXT CONSTRAINT product_amazon_product_type_format CHECK (amazon_product_type ~ '^[A-Z0-9_]+$'),
ADD COLUMN IF NOT EXISTS amazon_schema_version TEXT,
ADD COLUMN IF NOT EXISTS listing_attributes JSONB NOT NULL DEFAULT '{}' CONSTRAINT product_listing_attributes_object CHECK (jsonb_typeof(listing_attributes) = 'object');

ALTER TABLE public.customer_platform_account
ADD COLUMN IF NOT EXISTS api_connection public.api_connection NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS seller_id TEXT,
ADD CONSTRAINT platform_account_api_amazon CHECK (api_connection = 'none' OR platform_id = 'amazon');

ALTER TABLE public.market_cell
ADD COLUMN IF NOT EXISTS listing_state public.listing_state,
ADD COLUMN IF NOT EXISTS listing_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS listing_language TEXT CONSTRAINT market_cell_listing_language_format CHECK (listing_language ~ '^[a-z]{2}_[A-Z]{2}$'),
ADD COLUMN IF NOT EXISTS fulfillment_channel TEXT CONSTRAINT market_cell_fulfillment_channel CHECK (fulfillment_channel IN ('fbm', 'fba')),
-- {asin: string|null, restricted: boolean, reasons: string[], checked_at}
ADD COLUMN IF NOT EXISTS listing_match JSONB CONSTRAINT market_cell_listing_match_object CHECK (jsonb_typeof(listing_match) = 'object');

-- The product type schema cache (tenant-neutral, see the header).
CREATE TABLE IF NOT EXISTS public.amazon_product_type_definition (
   marketplace_id TEXT,
   product_type TEXT,
   locale TEXT,
   version TEXT NOT NULL,
   display_name TEXT,
   schema JSONB NOT NULL,
   property_groups JSONB NOT NULL,
   fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   PRIMARY KEY (marketplace_id, product_type, locale)
);

ALTER TABLE public.amazon_product_type_definition ENABLE ROW LEVEL SECURITY;

CREATE POLICY amazon_product_type_definition_select ON public.amazon_product_type_definition FOR
SELECT
   TO authenticated USING (TRUE);

-- The submissions
CREATE TABLE IF NOT EXISTS public.listing_submission (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   cell_id UUID NOT NULL,
   kind public.listing_submission_kind NOT NULL,
   sku TEXT NOT NULL,
   marketplace_id TEXT NOT NULL,
   payload JSONB NOT NULL,
   amazon_submission_id TEXT,
   status public.listing_submission_status NOT NULL DEFAULT 'processing',
   -- Amazon's issues, verbatim: [{code, message, severity, attributeNames?}].
   issues JSONB NOT NULL DEFAULT '[]',
   created_by UUID DEFAULT auth.uid (),
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   -- Deferrable like the other composite keys a transfer carries (041).
   CONSTRAINT listing_submission_cell_fkey FOREIGN KEY (cell_id, tenant_id) REFERENCES public.market_cell (id, tenant_id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS idx_listing_submission_cell ON public.listing_submission (tenant_id, cell_id, created_at DESC);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.listing_submission FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

SELECT
   private.enable_tenant_level_security ('listing_submission');

SELECT
   private.audit_enable ('public.listing_submission'::REGCLASS);

-- Guards (see the header). SECURITY INVOKER: current_user is the writer.
CREATE OR REPLACE FUNCTION private.listing_submission_user_insert () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF current_user = 'authenticated' THEN
        NEW.status := 'processing';
        NEW.issues := '[]'::JSONB;
        NEW.amazon_submission_id := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER listing_submission_user_insert BEFORE INSERT ON public.listing_submission FOR EACH ROW
EXECUTE FUNCTION private.listing_submission_user_insert ();

CREATE OR REPLACE FUNCTION private.market_cell_listing_server_only () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF current_user = 'authenticated' AND (
        TG_OP = 'INSERT' AND (NEW.listing_state IS NOT NULL OR NEW.listing_checked_at IS NOT NULL OR NEW.listing_match IS NOT NULL)
        OR TG_OP = 'UPDATE' AND (
            NEW.listing_state IS DISTINCT FROM OLD.listing_state
            OR NEW.listing_checked_at IS DISTINCT FROM OLD.listing_checked_at
            OR NEW.listing_match IS DISTINCT FROM OLD.listing_match
        )
    ) THEN
        RAISE EXCEPTION 'market_cell_listing_server_only' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER market_cell_listing_server_only BEFORE INSERT
OR
UPDATE ON public.market_cell FOR EACH ROW
EXECUTE FUNCTION private.market_cell_listing_server_only ();

-- A transfer's insert starts disconnected; a user writes none of the connection columns. The
-- transfer exit reads moesa.transfer_id first (041): authenticated cannot call
-- private.transferring().
CREATE OR REPLACE FUNCTION private.platform_account_api_server_only () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF TG_OP = 'INSERT' AND nullif(current_setting('moesa.transfer_id', TRUE), '') IS NOT NULL THEN
        IF private.transferring() THEN
            NEW.api_connection := 'none';
            NEW.authorized_at := NULL;
            NEW.seller_id := NULL;
            RETURN NEW;
        END IF;
    END IF;

    IF current_user = 'authenticated' AND (
        TG_OP = 'INSERT' AND (NEW.api_connection <> 'none' OR NEW.authorized_at IS NOT NULL OR NEW.seller_id IS NOT NULL)
        OR TG_OP = 'UPDATE' AND (
            NEW.api_connection IS DISTINCT FROM OLD.api_connection
            OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
            OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
        )
    ) THEN
        RAISE EXCEPTION 'platform_account_api_server_only' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER platform_account_api_server_only BEFORE INSERT
OR
UPDATE ON public.customer_platform_account FOR EACH ROW
EXECUTE FUNCTION private.platform_account_api_server_only ();

REVOKE ALL ON FUNCTION private.listing_submission_user_insert () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.market_cell_listing_server_only () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.platform_account_api_server_only () FROM PUBLIC, anon, authenticated;

-- Vault (see the header).
CREATE OR REPLACE FUNCTION private.amazon_token (p_account_id UUID) RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'amazon:' || p_account_id::TEXT;
$$;

CREATE OR REPLACE FUNCTION private.amazon_token_set (p_account_id UUID, p_refresh_token TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    v_name TEXT := 'amazon:' || p_account_id::TEXT;
    v_secret_id UUID;
BEGIN
    SELECT s.id INTO v_secret_id FROM vault.secrets s WHERE s.name = v_name;

    IF p_refresh_token IS NULL THEN
        DELETE FROM vault.secrets s WHERE s.id = v_secret_id;
    ELSIF v_secret_id IS NULL THEN
        PERFORM vault.create_secret(p_refresh_token, v_name, 'Amazon SP-API refresh token');
    ELSE
        PERFORM vault.update_secret(v_secret_id, p_refresh_token);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.amazon_token (UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.amazon_token_set (UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- A deleted account (directly or by its customer's cascade) leaves no token in Vault.
CREATE OR REPLACE FUNCTION private.platform_account_forget_token () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    PERFORM private.amazon_token_set(OLD.id, NULL);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER platform_account_forget_token
AFTER DELETE ON public.customer_platform_account FOR EACH ROW
EXECUTE FUNCTION private.platform_account_forget_token ();

REVOKE ALL ON FUNCTION private.platform_account_forget_token () FROM PUBLIC, anon, authenticated;

-- The parent's cell mirrors the worst listing state of its children's cells in the same platform
-- and country (R7): issues < draft < ready < submitted < live. Nothing happens without a parent,
-- a parent cell or a child with a state.
CREATE OR REPLACE FUNCTION private.listing_mirror_parent (p_cell_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    v_cell RECORD;
    v_worst public.listing_state;
BEGIN
    SELECT m.tenant_id, m.platform_id, m.country, p.parent_id INTO v_cell
    FROM public.market_cell m
    JOIN public.product p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
    WHERE m.id = p_cell_id;

    IF v_cell.parent_id IS NULL THEN
        RETURN;
    END IF;

    SELECT m.listing_state INTO v_worst
    FROM public.market_cell m
    JOIN public.product p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
    WHERE p.parent_id = v_cell.parent_id AND p.tenant_id = v_cell.tenant_id
      AND m.platform_id = v_cell.platform_id AND m.country = v_cell.country
      AND m.listing_state IS NOT NULL
    ORDER BY array_position(ARRAY['issues', 'draft', 'ready', 'submitted', 'live']::public.listing_state[], m.listing_state)
    LIMIT 1;

    IF v_worst IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.market_cell m
    SET listing_state = v_worst, listing_checked_at = now()
    WHERE m.tenant_id = v_cell.tenant_id AND m.product_id = v_cell.parent_id
      AND m.platform_id = v_cell.platform_id AND m.country = v_cell.country
      AND m.listing_state IS DISTINCT FROM v_worst;
END;
$$;

REVOKE ALL ON FUNCTION private.listing_mirror_parent (UUID) FROM PUBLIC, anon, authenticated;

-- Service RPCs (see the header).
CREATE OR REPLACE FUNCTION public.amazon_account_token (p_account_id UUID) RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT private.amazon_token(p_account_id);
$$;

CREATE OR REPLACE FUNCTION public.amazon_account_connect (p_account_id UUID, p_refresh_token TEXT, p_seller_id TEXT) RETURNS public.customer_platform_account LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    v_account public.customer_platform_account;
BEGIN
    UPDATE public.customer_platform_account a
    SET api_connection = 'connected', authorized_at = now(), seller_id = p_seller_id
    WHERE a.id = p_account_id
    RETURNING * INTO v_account;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'platform account % not found', p_account_id USING ERRCODE = 'no_data_found';
    END IF;

    IF p_refresh_token IS NOT NULL THEN
        PERFORM private.amazon_token_set(p_account_id, p_refresh_token);
    END IF;

    RETURN v_account;
END;
$$;

CREATE OR REPLACE FUNCTION public.amazon_account_disconnect (p_account_id UUID, p_state public.api_connection) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF p_state IS NULL OR p_state NOT IN ('none', 'revoked') THEN
        RAISE EXCEPTION 'disconnect state must be none or revoked, not %', p_state USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_state = 'none' THEN
        UPDATE public.customer_platform_account a
        SET api_connection = 'none', authorized_at = NULL, seller_id = NULL
        WHERE a.id = p_account_id;
    ELSE
        UPDATE public.customer_platform_account a SET api_connection = 'revoked' WHERE a.id = p_account_id;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'platform account % not found', p_account_id USING ERRCODE = 'no_data_found';
    END IF;

    PERFORM private.amazon_token_set(p_account_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.listing_set_state (p_cell_id UUID, p_listing_state public.listing_state, p_listing_match JSONB) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF p_listing_state IS NULL THEN
        RAISE EXCEPTION 'listing state must not be null' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    UPDATE public.market_cell m
    SET listing_state = p_listing_state,
        listing_checked_at = now(),
        listing_match = coalesce(p_listing_match, m.listing_match)
    WHERE m.id = p_cell_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'market cell % not found', p_cell_id USING ERRCODE = 'no_data_found';
    END IF;

    PERFORM private.listing_mirror_parent(p_cell_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.listing_apply_submission (
   p_submission_id UUID,
   p_status public.listing_submission_status,
   p_amazon_submission_id TEXT,
   p_issues JSONB,
   p_listing_state public.listing_state,
   p_asin TEXT
) RETURNS public.market_cell LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    v_submission public.listing_submission;
    v_cell public.market_cell;
    v_messages TEXT;
BEGIN
    IF p_listing_state IS NULL THEN
        RAISE EXCEPTION 'listing state must not be null' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 1. The submission.
    UPDATE public.listing_submission s
    SET status = p_status,
        amazon_submission_id = coalesce(p_amazon_submission_id, s.amazon_submission_id),
        issues = coalesce(p_issues, '[]'::JSONB)
    WHERE s.id = p_submission_id
    RETURNING * INTO v_submission;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'listing submission % not found', p_submission_id USING ERRCODE = 'no_data_found';
    END IF;

    SELECT * INTO v_cell FROM public.market_cell m
    WHERE m.id = v_submission.cell_id AND m.tenant_id = v_submission.tenant_id
    FOR UPDATE;

    -- 2. The listing data, the state and the open issue.
    IF p_listing_state = 'issues' THEN
        SELECT string_agg(i.message, '; ' ORDER BY i.n) INTO v_messages
        FROM (
            SELECT coalesce(e.value ->> 'message', e.value ->> 'code') AS message, e.n
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_issues) = 'array' THEN p_issues ELSE '[]'::JSONB END)
                WITH ORDINALITY AS e (value, n)
            WHERE coalesce(e.value ->> 'message', e.value ->> 'code') IS NOT NULL
            ORDER BY e.n
            LIMIT 3
        ) i;
        v_cell.open_issue := 'Amazon: ' || coalesce(v_messages, 'the listing has issues');
    ELSIF v_cell.open_issue LIKE 'Amazon: %' AND v_cell.status <> 'suppressed' THEN
        v_cell.open_issue := NULL;
    END IF;

    UPDATE public.market_cell m
    SET platform_product_id = coalesce(nullif(btrim(m.platform_product_id), ''), p_asin),
        platform_sku = coalesce(nullif(btrim(m.platform_sku), ''), v_submission.sku),
        listing_state = p_listing_state,
        listing_checked_at = now(),
        open_issue = v_cell.open_issue
    WHERE m.id = v_cell.id
    RETURNING * INTO v_cell;

    -- 3. Accepted, or live: up to uploaded, one legal step at a time. Issues win over accepted.
    IF (p_status = 'accepted' OR p_listing_state = 'live') AND p_listing_state <> 'issues' THEN
        IF v_cell.status = 'planned' THEN
            UPDATE public.market_cell m SET status = 'preparing' WHERE m.id = v_cell.id RETURNING * INTO v_cell;
        END IF;
        IF v_cell.status = 'preparing' THEN
            UPDATE public.market_cell m SET status = 'uploaded' WHERE m.id = v_cell.id RETURNING * INTO v_cell;
        END IF;
    END IF;

    -- 4. Live, only with what the guard asks of a live cell.
    IF p_listing_state = 'live' AND v_cell.status IN ('uploaded', 'suppressed')
       AND nullif(btrim(v_cell.platform_product_id), '') IS NOT NULL
       AND nullif(btrim(v_cell.platform_sku), '') IS NOT NULL
       AND v_cell.price IS NOT NULL AND v_cell.currency IS NOT NULL
       AND v_cell.stock_source IS NOT NULL AND v_cell.content_status = 'approved' THEN
        UPDATE public.market_cell m SET status = 'live' WHERE m.id = v_cell.id RETURNING * INTO v_cell;
    END IF;

    -- 5. The parent's cell (R7).
    PERFORM private.listing_mirror_parent(v_cell.id);

    RETURN v_cell;
END;
$$;

CREATE OR REPLACE FUNCTION public.listing_parent_cell (p_cell_id UUID) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    v_cell RECORD;
    v_parent_cell UUID;
BEGIN
    SELECT m.tenant_id, m.platform_id, m.country, m.listing_language, m.fulfillment_channel, p.parent_id INTO v_cell
    FROM public.market_cell m
    JOIN public.product p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
    WHERE m.id = p_cell_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'market cell % not found', p_cell_id USING ERRCODE = 'no_data_found';
    END IF;

    IF v_cell.parent_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT m.id INTO v_parent_cell
    FROM public.market_cell m
    WHERE m.tenant_id = v_cell.tenant_id AND m.product_id = v_cell.parent_id
      AND m.platform_id = v_cell.platform_id AND m.country = v_cell.country;

    IF v_parent_cell IS NULL THEN
        -- A candidate (the guard sets it); the customer comes from the parent (market_cell_customer).
        INSERT INTO public.market_cell (tenant_id, customer_id, product_id, platform_id, country, listing_language, fulfillment_channel)
        SELECT v_cell.tenant_id, p.customer_id, p.id, v_cell.platform_id, v_cell.country, v_cell.listing_language, v_cell.fulfillment_channel
        FROM public.product p
        WHERE p.id = v_cell.parent_id AND p.tenant_id = v_cell.tenant_id
        ON CONFLICT ON CONSTRAINT unique_market_cell DO NOTHING
        RETURNING id INTO v_parent_cell;

        IF v_parent_cell IS NULL THEN
            SELECT m.id INTO v_parent_cell
            FROM public.market_cell m
            WHERE m.tenant_id = v_cell.tenant_id AND m.product_id = v_cell.parent_id
              AND m.platform_id = v_cell.platform_id AND m.country = v_cell.country;
        END IF;
    END IF;

    PERFORM private.listing_mirror_parent(p_cell_id);

    RETURN v_parent_cell;
END;
$$;

REVOKE ALL ON FUNCTION public.amazon_account_token (UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.amazon_account_connect (UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.amazon_account_disconnect (UUID, public.api_connection) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.listing_set_state (UUID, public.listing_state, JSONB) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.listing_apply_submission (UUID, public.listing_submission_status, TEXT, JSONB, public.listing_state, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.listing_parent_cell (UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.amazon_account_token (UUID) TO service_role;

GRANT EXECUTE ON FUNCTION public.amazon_account_connect (UUID, TEXT, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.amazon_account_disconnect (UUID, public.api_connection) TO service_role;

GRANT EXECUTE ON FUNCTION public.listing_set_state (UUID, public.listing_state, JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION public.listing_apply_submission (UUID, public.listing_submission_status, TEXT, JSONB, public.listing_state, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.listing_parent_cell (UUID) TO service_role;

-- The images Amazon fetches (R5).
INSERT INTO
   storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
   ('listing-images', 'listing-images', TRUE, 10485760, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- The market matrix view, rebuilt with the new cell columns (034's definition).
DROP VIEW IF EXISTS public.market_cell_overview;

CREATE VIEW public.market_cell_overview
WITH
   (security_invoker = TRUE) AS
SELECT
   m.*,
   c.code::TEXT AS customer_code,
   pj.code AS project_code,
   p.sku,
   p.display_name AS product_name,
   p.gtin,
   pl.display_name AS platform_name,
   m.platform_id || '_' || m.country AS cell_key
FROM
   public.market_cell m
   LEFT JOIN public.customer c ON c.id = m.customer_id
   AND c.tenant_id = m.tenant_id
   LEFT JOIN public.project pj ON pj.id = m.project_id
   AND pj.tenant_id = m.tenant_id
   LEFT JOIN public.product p ON p.id = m.product_id
   AND p.tenant_id = m.tenant_id
   LEFT JOIN public.platform pl ON pl.id = m.platform_id;

COMMENT ON VIEW public.market_cell_overview IS 'Per market cell: every column of the cell, customer_code, project_code, sku, product_name and gtin (its product), platform_name and cell_key (platform_id || ''_'' || country, the S05 hucre_id).';

GRANT SELECT ON public.market_cell_overview TO authenticated;

-- The transfer carries the submissions with their cell.
INSERT INTO
   private.transfer_registry (
      table_name,
      position,
      root,
      parent_table,
      parent_column,
      key_columns,
      entity,
      late_columns,
      array_columns,
      user_columns,
      code_kind,
      copy_only
   )
VALUES
   ('listing_submission', 215, 'product', 'market_cell', 'cell_id', NULL, NULL, '{}', '{}', '{"created_by": "actor"}', NULL, FALSE)
ON CONFLICT (table_name) DO NOTHING;

-- Module and permissions. Inserting a permission creates its RLS policies (see
-- private.manage_policies); users never update or delete a submission.
INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('listing', TRUE, 195)
ON CONFLICT (id) DO NOTHING;

INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.listing_submission', 'listing', 'select', 'read', FALSE, FALSE, NULL),
   ('public.listing_submission', 'listing', 'insert', 'create', FALSE, TRUE, NULL)
ON CONFLICT ON CONSTRAINT unique_permission_resource_command DO NOTHING;

-- The built-in owner role has every permission (see 008_init_reference_data.sql).
INSERT INTO
   public.role_permission (role_id, permission_id)
SELECT
   r.id,
   p.id
FROM
   public.role r,
   public.permission p
WHERE
   r.display_name = 'owner'
   AND r.tenant_id IS NULL
   AND p.resource_name = 'public.listing_submission'
ON CONFLICT DO NOTHING;

-- Every permission of the group to each role that may change products (029_purchase_orders.sql).
SELECT
   private.grant_group_to_product_editors ('listing');
