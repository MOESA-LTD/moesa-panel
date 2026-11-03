-- Operations core: what the business modules (customers, suppliers, products, documents,
-- projects) build on.
--
-- setting        Numbers management has yet to settle (deposit %, safety stock days, …) kept as
--                data rather than written into rules: once the answer comes, the setting changes,
--                not the code. One row per key and company (root tenant); new companies get the
--                defaults (private.default_settings) from a trigger on public.tenant, and the
--                companies that exist when this migration runs get them below. Its primary key is
--                a surrogate `id UUID`, with (tenant_id, key) unique: the audit trail
--                (private.audit_statement) identifies every audited row by a UUID `id`.
-- platform       The marketplaces (amazon, ebay, …): global reference data like public.module and
--                public.plan, the same for every tenant, so it has no tenant_id. Its id is the
--                code other tables refer to (customer_platform_account.platform_id). Read by every
--                signed-in user and written only by migrations, so it has no permissions and is
--                not audited (its TEXT id is not a UUID the audit trail could record).
-- code_sequence  The counters behind the business codes (K5): per tenant, kind, customer code and
--                year. Written only by public.next_code; no permissions, so no direct access.
--
-- public.next_code is SECURITY DEFINER: code_sequence has RLS with only the restrictive tenant
-- policies and no permissive one, so the caller could neither read nor write it. It writes the
-- active tenant's row only (private.tenant_id(), checked against the user's tenants), and fails
-- without one.

-- Modules of the business modules, part of every plan. Their permissions come with the tasks that
-- add their tables; ops_setting has the settings'.
INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('ops_setting', TRUE, 100),
   ('document', TRUE, 110),
   ('supplier', TRUE, 120),
   ('customer', TRUE, 130),
   ('product', TRUE, 140),
   ('project', TRUE, 150)
ON CONFLICT (id) DO NOTHING;

-- Settings
CREATE TABLE IF NOT EXISTS public.setting (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   key TEXT NOT NULL CHECK (key ~ '^[a-z0-9_]+$'),
   value JSONB NOT NULL,
   description TEXT,
   -- The open question (acik_sorular.md) the value answers, until management decides it.
   source_question TEXT,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   CONSTRAINT unique_setting_key UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_setting_tenant_id ON public.setting (tenant_id);

-- Only a setting's value is changed through the API; which settings there are comes from here. (A
-- column REVOKE does not undo the table-level GRANT Supabase gives by default, so the table's
-- UPDATE is taken and given back for that column.)
REVOKE UPDATE ON public.setting FROM anon, authenticated;

GRANT UPDATE (value) ON public.setting TO authenticated;

-- The settings every company starts with, in one place for the migration and the trigger.
CREATE OR REPLACE FUNCTION private.default_settings () RETURNS TABLE (key TEXT, value JSONB, description TEXT, source_question TEXT) LANGUAGE sql IMMUTABLE
SET
   search_path = '' AS $$
    VALUES
        ('deposit_rate_default', '30'::JSONB, 'Default deposit rate on purchase orders (%)', NULL),
        ('safety_stock_days', '30'::JSONB, 'Safety stock added to the reorder point (days of sales)', NULL),
        ('document_request_days', '5'::JSONB, 'Time given to answer a document request (business days)', NULL),
        ('s1_customer_notify_hours', '4'::JSONB, 'Time to notify the customer of an S1 incident (hours)', NULL),
        ('spec_sheet_required_from', '"2026-12-31"'::JSONB, 'Date from which every purchase order needs an approved spec sheet', NULL),
        ('wip_limit_per_role', '5'::JSONB, 'Work in progress allowed per role', NULL),
        ('gate_evidence_blocking', 'true'::JSONB, 'Whether missing gate evidence blocks the gate (else a warning)', NULL);
$$;

-- Gives a company the default settings it does not have yet.
CREATE OR REPLACE FUNCTION private.copy_default_settings (tenant_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    INSERT INTO public.setting (tenant_id, key, value, description, source_question)
    SELECT copy_default_settings.tenant_id, d.key, d.value, d.description, d.source_question
    FROM private.default_settings() d
    ON CONFLICT ON CONSTRAINT unique_setting_key DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION private.copy_default_settings (UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.handle_new_company_settings () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    PERFORM private.copy_default_settings(NEW.id);
    RETURN NULL;
END;
$$;

-- Branches use their company's settings, so only companies (root tenants) get rows.
CREATE OR REPLACE TRIGGER copy_default_settings
AFTER INSERT ON public.tenant FOR EACH ROW WHEN (NEW.parent_id IS NULL)
EXECUTE FUNCTION private.handle_new_company_settings ();

SELECT
   private.copy_default_settings (t.id)
FROM
   public.tenant t
WHERE
   t.parent_id IS NULL;

-- Platforms
CREATE TABLE IF NOT EXISTS public.platform (
   id TEXT PRIMARY KEY CHECK (id ~ '^[a-z_]+$'),
   display_name TEXT NOT NULL,
   -- ISO 3166-1 alpha-2 codes of the marketplace's countries.
   countries TEXT[] NOT NULL DEFAULT '{}',
   -- What the platform calls its product identifier (ASIN, …).
   product_id_label TEXT,
   position INT NOT NULL DEFAULT 0,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.platform ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_select ON public.platform FOR
SELECT
   TO authenticated USING (TRUE);

INSERT INTO
   public.platform (id, display_name, countries, product_id_label, position)
VALUES
   ('amazon', 'Amazon', ARRAY['DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'SE', 'BE', 'GB', 'US'], 'ASIN', 10),
   ('ebay', 'eBay', ARRAY['DE', 'FR', 'IT', 'ES', 'GB', 'US'], 'Item ID', 20),
   ('kaufland', 'Kaufland', ARRAY['DE', 'AT', 'CZ', 'SK', 'PL'], 'EAN', 30),
   ('allegro', 'Allegro', ARRAY['PL', 'CZ', 'SK'], 'Offer ID', 40),
   ('bol', 'bol.', ARRAY['NL', 'BE'], 'EAN', 50),
   ('cdiscount', 'Cdiscount', ARRAY['FR'], 'EAN', 60),
   ('otto', 'OTTO', ARRAY['DE'], 'EAN', 70),
   ('emag', 'eMAG', ARRAY['RO', 'BG', 'HU'], 'PNK', 80),
   ('temu', 'Temu', ARRAY['DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'US'], 'Goods ID', 90),
   ('walmart', 'Walmart', ARRAY['US'], 'Item ID', 100)
ON CONFLICT (id) DO NOTHING;

-- Code sequences
CREATE TABLE IF NOT EXISTS public.code_sequence (
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   kind TEXT NOT NULL,
   -- The customer code the codes are numbered under.
   scope TEXT NOT NULL,
   year INT NOT NULL,
   last_no INT NOT NULL DEFAULT 0,
   CONSTRAINT code_sequence_pkey PRIMARY KEY (tenant_id, kind, scope, year)
);

-- The next code of `kind` for the customer `scope` in the active tenant, this year:
-- project → <SCOPE>-<YYYY>-<NNN>; po, shp, cr → <KIND>-<SCOPE>-<YYYY>-<NNN>. The upsert locks the
-- counter row, so concurrent calls wait for each other and never get the same number.
CREATE OR REPLACE FUNCTION public.next_code (kind TEXT, scope TEXT) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    active UUID := private.tenant_id();
    current_year INT := extract(year FROM now())::INT;
    number INT;
    formatted TEXT;
BEGIN
    IF active IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'tenant_required')::TEXT,
            DETAIL = json_build_object('status', 403, 'headers', json_build_object())::TEXT;
    END IF;

    IF next_code.kind IS NULL OR next_code.kind NOT IN ('project', 'po', 'shp', 'cr')
       OR next_code.scope IS NULL OR next_code.scope !~ '^[A-Z0-9]+$' THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'invalid_code_kind_or_scope')::TEXT,
            DETAIL = json_build_object('status', 400, 'headers', json_build_object())::TEXT;
    END IF;

    INSERT INTO public.code_sequence AS cs (tenant_id, kind, scope, year, last_no)
    VALUES (active, next_code.kind, next_code.scope, current_year, 1)
    ON CONFLICT ON CONSTRAINT code_sequence_pkey DO UPDATE SET last_no = cs.last_no + 1
    RETURNING cs.last_no INTO number;

    -- At least three digits; a 1000th code still gets its full number.
    formatted := next_code.scope || '-' || current_year || '-' || lpad(number::TEXT, greatest(3, length(number::TEXT)), '0');

    IF next_code.kind = 'project' THEN
        RETURN formatted;
    END IF;
    RETURN upper(next_code.kind) || '-' || formatted;
END;
$$;

REVOKE ALL ON FUNCTION public.next_code (TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.next_code (TEXT, TEXT) TO authenticated;

-- Tenant policies (006_init_permissions.sql covers only the tables that existed then).
SELECT
   private.enable_tenant_level_security (t_name)
FROM
   unnest(ARRAY['setting', 'code_sequence']) AS t_name;

SELECT
   private.audit_enable ('public.setting'::REGCLASS);

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies).
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.setting', 'ops_setting', 'select', 'read', FALSE, FALSE, NULL),
   ('public.setting', 'ops_setting', 'update', 'modify', FALSE, TRUE, NULL)
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
   AND p.resource_name = 'public.setting'
ON CONFLICT DO NOTHING;

-- Tests (supabase/tests/database): runs the rest of the transaction as `user_id` signed in, working
-- in `tenant_id`, the way PostgREST sets up a request (role, JWT claims, x-tenant-id/-ids headers
-- read by private.tenant_id and private.tenant_scope). Transaction-local; not for the API. No
-- `SET search_path` clause: a function's SET clause would undo the role change when it returns, so
-- every name is schema-qualified instead.
CREATE OR REPLACE FUNCTION private.impersonate (user_id UUID, tenant_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_catalog.set_config(
        'request.jwt.claims',
        pg_catalog.json_build_object('sub', impersonate.user_id, 'role', 'authenticated')::TEXT,
        true
    );
    PERFORM pg_catalog.set_config(
        'request.headers',
        pg_catalog.json_build_object('x-tenant-id', impersonate.tenant_id, 'x-tenant-ids', impersonate.tenant_id)::TEXT,
        true
    );
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
END;
$$;

REVOKE ALL ON FUNCTION private.impersonate (UUID, UUID) FROM PUBLIC, anon, authenticated;
