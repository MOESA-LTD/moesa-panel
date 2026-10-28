-- Subscriptions: a company (a top-level tenant) subscribes to a plan, and its branches share it.
-- A plan is a set of modules (public.module, which permissions belong to) with limits; the users
-- of a company use only the permissions of its plan's modules and of the core modules
-- (private.tenants_permitting, private.permissions). Once the subscription ends or is canceled the
-- company is read-only: only reads are left. Subscriptions are managed by the super admin.

-- Plans
CREATE TABLE IF NOT EXISTS public.plan (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   display_name TEXT NOT NULL UNIQUE,
   description TEXT,
   price NUMERIC(12, 2) CHECK (price >= 0),
   currency valid_currency_code,
   billing_period TEXT CHECK (billing_period IN ('month', 'year')),
   -- A new company starts on the default plan, for trial_days as a trial (0: no end).
   trial_days INT NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
   is_default BOOLEAN NOT NULL DEFAULT FALSE,
   -- Inactive plans are kept for the companies on them, but no longer offered.
   is_active BOOLEAN NOT NULL DEFAULT TRUE,
   position INT NOT NULL DEFAULT 0,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_is_default ON public.plan (is_default)
WHERE
   is_default;

-- The modules of a plan, besides the core modules every plan has.
CREATE TABLE IF NOT EXISTS public.plan_module (
   plan_id UUID NOT NULL REFERENCES public.plan (id) ON DELETE CASCADE,
   module_id TEXT NOT NULL REFERENCES public.module (id) ON DELETE CASCADE ON UPDATE CASCADE,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   PRIMARY KEY (plan_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_module_module_id ON public.plan_module (module_id);

-- The limits of a plan, counted over the whole company; a limit without a row is unlimited.
-- max_branches: tenants below the company; max_users: distinct members of the company's tenants.
CREATE TABLE IF NOT EXISTS public.plan_limit (
   plan_id UUID NOT NULL REFERENCES public.plan (id) ON DELETE CASCADE,
   limit_key TEXT NOT NULL CHECK (limit_key IN ('max_branches', 'max_users')),
   value INT NOT NULL CHECK (value >= 0),
   created_at TIMESTAMPTZ DEFAULT NOW(),
   PRIMARY KEY (plan_id, limit_key)
);

-- Subscriptions of a company, kept as its history. The one in force is the latest that has
-- started; it ends at ends_at (NULL: no end) or when canceled. A payment provider would add its
-- own ids here.
CREATE TABLE IF NOT EXISTS public.subscription (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   plan_id UUID NOT NULL REFERENCES public.plan (id) ON DELETE RESTRICT,
   starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   ends_at TIMESTAMPTZ,
   canceled_at TIMESTAMPTZ,
   is_trial BOOLEAN NOT NULL DEFAULT FALSE,
   note TEXT,
   created_by UUID DEFAULT auth.uid () REFERENCES public.user (id) ON DELETE SET NULL,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   CONSTRAINT subscription_ends_after_start CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_subscription_tenant_id ON public.subscription (tenant_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_id ON public.subscription (plan_id);

-- Only a company subscribes; its branches use its subscription.
CREATE OR REPLACE FUNCTION private.check_subscription_company () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = NEW.tenant_id AND t.parent_id IS NOT NULL) THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'subscription_company_only')::TEXT,
            DETAIL = json_build_object('status', 422, 'headers', json_build_object())::TEXT;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER check_subscription_company BEFORE INSERT
OR
UPDATE OF tenant_id ON public.subscription FOR EACH ROW
EXECUTE FUNCTION private.check_subscription_company ();

-- Where a subscription stands (a computed field): scheduled, trialing, active, expired or canceled.
CREATE OR REPLACE FUNCTION public.status (public.subscription) RETURNS TEXT LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT CASE
        WHEN $1.starts_at > now() THEN 'scheduled'
        WHEN $1.canceled_at <= now() THEN 'canceled'
        WHEN $1.ends_at <= now() THEN 'expired'
        WHEN $1.is_trial THEN 'trialing'
        ELSE 'active'
    END
$$;

-- What the plan of each of `tenant_ids` allows: the company above it (or itself), the
-- subscription in force and its plan, the modules (the core ones and the plan's) and whether it
-- may be written to. Without a subscription: the core modules, read-only.
CREATE OR REPLACE FUNCTION private.entitlements (tenant_ids UUID[]) RETURNS TABLE (
   tenant_id UUID,
   company_id UUID,
   subscription_id UUID,
   plan_id UUID,
   modules TEXT[],
   writable BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    -- UNION (not UNION ALL) also stops at a cycle, should one ever get in.
    WITH RECURSIVE up (origin, id, parent_id) AS (
        SELECT t.id, t.id, t.parent_id FROM public.tenant t WHERE t.id = ANY (tenant_ids)
        UNION
        SELECT up.origin, t.id, t.parent_id FROM public.tenant t JOIN up ON t.id = up.parent_id
    )
    SELECT
        up.origin,
        up.id,
        s.id,
        s.plan_id,
        ARRAY(
            SELECT m.id FROM public.module m WHERE m.is_core
            UNION
            SELECT pm.module_id FROM public.plan_module pm WHERE pm.plan_id = s.plan_id
        ),
        coalesce(
            s.id IS NOT NULL
            AND (s.ends_at IS NULL OR s.ends_at > now())
            AND (s.canceled_at IS NULL OR s.canceled_at > now()),
            FALSE
        )
    FROM up
    LEFT JOIN LATERAL (
        SELECT * FROM public.subscription sub
        WHERE sub.tenant_id = up.id AND sub.starts_at <= now()
        ORDER BY sub.starts_at DESC, sub.created_at DESC
        LIMIT 1
    ) s ON TRUE
    WHERE up.parent_id IS NULL;
END;
$$;

-- Of `tenants`, those whose plan allows the permission: its module is in the plan, and a write
-- only while the subscription is in force.
CREATE OR REPLACE FUNCTION private.tenants_entitled (tenants UUID[], p_resource_name TEXT, p_command TEXT) RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    module_id TEXT;
BEGIN
    SELECT p.group_name INTO module_id
    FROM public.permission p
    WHERE p.resource_name = p_resource_name AND p.command = p_command::public.type_permission_command;

    RETURN ARRAY(
        SELECT e.tenant_id FROM private.entitlements(tenants) e
        WHERE (module_id IS NULL OR module_id = ANY (e.modules))
          AND (p_command = 'select' OR e.writable)
    );
END;
$$;

-- A company's tenants: itself and every branch below it.
CREATE OR REPLACE FUNCTION private.company_tenants (company_id UUID) RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
BEGIN
    RETURN ARRAY(
        -- UNION (not UNION ALL) also stops at a cycle, should one ever get in.
        WITH RECURSIVE tree (id) AS (
            SELECT company_tenants.company_id
            UNION
            SELECT t.id FROM public.tenant t JOIN tree ON t.parent_id = tree.id
        )
        SELECT tree.id FROM tree
    );
END;
$$;

-- The members and owners of a company's tenants: whom a change of its subscription concerns.
CREATE OR REPLACE FUNCTION private.company_users (company_id UUID) RETURNS SETOF UUID LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    tenants UUID[] := private.company_tenants(company_users.company_id);
BEGIN
    RETURN QUERY
    SELECT tu.user_id FROM public.tenant_user tu WHERE tu.tenant_id = ANY (tenants)
    UNION
    SELECT o.user_id FROM public.tenant_owner o WHERE o.tenant_id = ANY (tenants);
END;
$$;

-- A new company starts on the default plan (as a trial when the plan has trial days).
CREATE OR REPLACE FUNCTION private.subscribe_new_company () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    INSERT INTO public.subscription (tenant_id, plan_id, is_trial, ends_at, created_by)
    SELECT
        NEW.id,
        p.id,
        p.trial_days > 0,
        CASE WHEN p.trial_days > 0 THEN now() + make_interval(days => p.trial_days) END,
        NULL
    FROM public.plan p
    WHERE p.is_default;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER subscribe_new_company
AFTER INSERT ON public.tenant FOR EACH ROW WHEN (NEW.parent_id IS NULL)
EXECUTE FUNCTION private.subscribe_new_company ();

-- Plans and modules are read by everyone signed in (the app shows what a module needs) and
-- written by the super admin only; a subscription is read by the company's owners too.
REVOKE ALL ON public.module, public.plan, public.plan_module, public.plan_limit, public.subscription FROM anon;

ALTER TABLE public.module ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_module ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_limit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    target TEXT;
BEGIN
    FOREACH target IN ARRAY ARRAY['module', 'plan', 'plan_module', 'plan_limit'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS read_%1$s ON public.%1$I', target);
        EXECUTE format('CREATE POLICY read_%1$s ON public.%1$I FOR SELECT TO authenticated USING (TRUE)', target);
        EXECUTE format('DROP POLICY IF EXISTS manage_%1$s ON public.%1$I', target);
        EXECUTE format(
            'CREATE POLICY manage_%1$s ON public.%1$I FOR ALL TO authenticated USING ((SELECT private.check_super_admin())) WITH CHECK ((SELECT private.check_super_admin()))',
            target
        );
    END LOOP;
END;
$$;

DROP POLICY IF EXISTS read_subscription ON public.subscription;

CREATE POLICY read_subscription ON public.subscription FOR
SELECT
   TO authenticated USING (
      (
         SELECT
            private.check_super_admin ()
      )
      OR tenant_id = ANY (
         (
            SELECT
               private.owned_tenants (auth.uid ())
         )::UUID[]
      )
   );

DROP POLICY IF EXISTS manage_subscription ON public.subscription;

CREATE POLICY manage_subscription ON public.subscription FOR ALL TO authenticated USING (
   (
      SELECT
         private.check_super_admin ()
   )
)
WITH
   CHECK (
      (
         SELECT
            private.check_super_admin ()
      )
   );

REVOKE ALL ON FUNCTION public.status (public.subscription) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.status (public.subscription) TO authenticated;

-- A change of a subscription, or of the modules or limits of a plan, changes what the users of
-- the companies concerned may do (see private.notify_access_changed).
DO $$
DECLARE
    target TEXT;
BEGIN
    FOREACH target IN ARRAY ARRAY['subscription', 'plan_module', 'plan_limit'] LOOP
        EXECUTE format('CREATE OR REPLACE TRIGGER notify_access_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()', target);
        EXECUTE format('CREATE OR REPLACE TRIGGER notify_access_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()', target);
        EXECUTE format('CREATE OR REPLACE TRIGGER notify_access_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()', target);
    END LOOP;
END;
$$;

-- Reference plans (re-runnable: existing plans are kept). Pro is the default, with a trial. Records
-- are made of stock (the pages need both), so every plan with records has stock too.
INSERT INTO
   public.plan (display_name, description, trial_days, is_default, position)
VALUES
   ('Basic', 'Clients, records, products and stock for a single location.', 0, FALSE, 10),
   ('Pro', 'Basic with the change history, for a few branches.', 14, TRUE, 20),
   ('Enterprise', 'Every module, without limits.', 0, FALSE, 30)
ON CONFLICT (display_name) DO NOTHING;

INSERT INTO
   public.plan_module (plan_id, module_id)
SELECT
   p.id,
   pm.module_id
FROM
   (
      VALUES
         ('Basic', 'client'),
         ('Basic', 'address'),
         ('Basic', 'record'),
         ('Basic', 'product'),
         ('Basic', 'stock'),
         ('Pro', 'client'),
         ('Pro', 'address'),
         ('Pro', 'record'),
         ('Pro', 'product'),
         ('Pro', 'stock'),
         ('Pro', 'audit_log'),
         ('Enterprise', 'client'),
         ('Enterprise', 'address'),
         ('Enterprise', 'record'),
         ('Enterprise', 'product'),
         ('Enterprise', 'stock'),
         ('Enterprise', 'audit_log')
   ) AS pm (plan_name, module_id)
   JOIN public.plan p ON p.display_name = pm.plan_name
ON CONFLICT DO NOTHING;

INSERT INTO
   public.plan_limit (plan_id, limit_key, value)
SELECT
   p.id,
   pl.limit_key,
   pl.value
FROM
   (
      VALUES
         ('Basic', 'max_branches', 0),
         ('Basic', 'max_users', 3),
         ('Pro', 'max_branches', 3),
         ('Pro', 'max_users', 15)
   ) AS pl (plan_name, limit_key, value)
   JOIN public.plan p ON p.display_name = pl.plan_name
ON CONFLICT DO NOTHING;

-- Companies from before subscriptions keep working: on the default plan, without an end.
INSERT INTO
   public.subscription (tenant_id, plan_id, created_by)
SELECT
   t.id,
   p.id,
   NULL
FROM
   public.tenant t
   JOIN public.plan p ON p.is_default
WHERE
   t.parent_id IS NULL
   AND NOT EXISTS (
      SELECT
         1
      FROM
         public.subscription s
      WHERE
         s.tenant_id = t.id
   );

-- How much of its plan's limits a company uses: its branches (the tenants below it) and its users
-- (the distinct members of its tenants).
CREATE OR REPLACE FUNCTION private.company_usage (company_id UUID) RETURNS TABLE (branches INT, users INT) LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
#variable_conflict use_column
DECLARE
    tenants UUID[] := private.company_tenants(company_usage.company_id);
BEGIN
    RETURN QUERY
    SELECT
        cardinality(tenants) - 1,
        (SELECT count(DISTINCT tu.user_id)::INT FROM public.tenant_user tu WHERE tu.tenant_id = ANY (tenants));
END;
$$;

-- The subscription of a tenant's company as the app shows it (public.my_access): the plan, where
-- the subscription stands, the modules and whether the company may write, the resources of the
-- modules outside the plan by their module (as the app's permission subjects: their pages are
-- shown locked), and the limits with their usage.
CREATE OR REPLACE FUNCTION private.subscription_summary (tenant_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    e RECORD;
    s public.subscription;
    usage RECORD;
BEGIN
    IF tenant_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT * INTO e FROM private.entitlements(ARRAY[subscription_summary.tenant_id]);
    SELECT * INTO s FROM public.subscription sub WHERE sub.id = e.subscription_id;
    SELECT * INTO usage FROM private.company_usage(e.company_id);

    RETURN jsonb_build_object(
        'company_id', e.company_id,
        'plan', (SELECT jsonb_build_object('id', p.id, 'display_name', p.display_name) FROM public.plan p WHERE p.id = e.plan_id),
        'status', CASE WHEN s.id IS NULL THEN 'none' ELSE public.status(s) END,
        'starts_at', s.starts_at,
        'ends_at', coalesce(least(s.ends_at, s.canceled_at), s.ends_at, s.canceled_at),
        'writable', e.writable,
        'modules', to_jsonb(e.modules),
        'locked', coalesce(
            (SELECT jsonb_object_agg(locked.subject, locked.module_id)
             FROM (
                SELECT DISTINCT split_part(p.resource_name, '.', 2) AS subject, p.group_name AS module_id
                FROM public.permission p
                WHERE p.group_name IS NOT NULL AND NOT p.group_name = ANY (e.modules)
             ) locked),
            '{}'::JSONB
        ),
        'limits', coalesce(
            (SELECT jsonb_object_agg(pl.limit_key, pl.value) FROM public.plan_limit pl WHERE pl.plan_id = e.plan_id),
            '{}'::JSONB
        ),
        'usage', jsonb_build_object('branches', usage.branches, 'users', usage.users)
    );
END;
$$;

-- Whether the company of `tenant_id` may take a change: its subscription is in force (else
-- subscription_read_only) and, for something a limit counts, `adding` more stays within it (else
-- plan_limit_branches, plan_limit_users). Raises the reason; the super admin is not limited.
CREATE OR REPLACE FUNCTION private.check_plan_allows (tenant_id UUID, limit_key TEXT DEFAULT NULL, adding INT DEFAULT 1) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    e RECORD;
    usage RECORD;
    allowed INT;
    used INT;
BEGIN
    IF private.check_super_admin() THEN
        RETURN;
    END IF;

    SELECT * INTO e FROM private.entitlements(ARRAY[check_plan_allows.tenant_id]);
    IF NOT coalesce(e.writable, FALSE) THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'subscription_read_only')::TEXT,
            DETAIL = json_build_object('status', 403, 'headers', json_build_object())::TEXT;
    END IF;

    IF check_plan_allows.limit_key IS NULL THEN
        RETURN;
    END IF;
    SELECT pl.value INTO allowed FROM public.plan_limit pl
    WHERE pl.plan_id = e.plan_id AND pl.limit_key = check_plan_allows.limit_key;
    IF allowed IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO usage FROM private.company_usage(e.company_id);
    used := CASE check_plan_allows.limit_key WHEN 'max_branches' THEN usage.branches ELSE usage.users END;
    IF used + adding > allowed THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'plan_limit_' || substr(check_plan_allows.limit_key, 5))::TEXT,
            DETAIL = json_build_object('status', 403, 'headers', json_build_object())::TEXT;
    END IF;
END;
$$;

-- A branch is opened only within the plan's branches (create_branch, or any other way in).
CREATE OR REPLACE FUNCTION private.check_branch_limit () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    PERFORM private.check_plan_allows(NEW.parent_id, 'max_branches');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER check_branch_limit BEFORE INSERT ON public.tenant FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
EXECUTE FUNCTION private.check_branch_limit ();

-- A member is added only within the plan's users; one already in another of the company's
-- tenants is not counted again.
CREATE OR REPLACE FUNCTION private.check_user_limit () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    company UUID := (SELECT e.company_id FROM private.entitlements(ARRAY[NEW.tenant_id]) e);
BEGIN
    PERFORM private.check_plan_allows(
        NEW.tenant_id,
        CASE WHEN EXISTS (
            SELECT 1 FROM public.tenant_user tu
            WHERE tu.user_id = NEW.user_id AND tu.tenant_id = ANY (private.company_tenants(company))
        ) THEN NULL ELSE 'max_users' END
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER check_user_limit BEFORE INSERT ON public.tenant_user FOR EACH ROW
EXECUTE FUNCTION private.check_user_limit ();

-- The super admin's panel.

-- A plan with its modules and limits, in one transaction (the policies allow it to the super admin
-- only). `limits` maps a limit to its value; a limit left out or null is unlimited. Making a plan
-- the default takes it from the previous default.
CREATE OR REPLACE FUNCTION public.save_plan (plan_data JSONB, module_ids TEXT[] DEFAULT '{}', limits JSONB DEFAULT '{}') RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER
SET
   search_path = '' AS $$
DECLARE
    saved_id UUID := (plan_data ->> 'id')::UUID;
    make_default BOOLEAN := coalesce((plan_data ->> 'is_default')::BOOLEAN, FALSE);
BEGIN
    IF make_default THEN
        UPDATE public.plan p SET is_default = FALSE WHERE p.is_default AND p.id IS DISTINCT FROM saved_id;
    END IF;

    IF saved_id IS NULL THEN
        INSERT INTO public.plan (display_name, description, price, currency, billing_period, trial_days, is_default, is_active, position)
        VALUES (
            plan_data ->> 'display_name',
            plan_data ->> 'description',
            (plan_data ->> 'price')::NUMERIC,
            plan_data ->> 'currency',
            plan_data ->> 'billing_period',
            coalesce((plan_data ->> 'trial_days')::INT, 0),
            make_default,
            coalesce((plan_data ->> 'is_active')::BOOLEAN, TRUE),
            coalesce((plan_data ->> 'position')::INT, 0)
        )
        RETURNING id INTO saved_id;
    ELSE
        UPDATE public.plan p SET
            display_name = plan_data ->> 'display_name',
            description = plan_data ->> 'description',
            price = (plan_data ->> 'price')::NUMERIC,
            currency = plan_data ->> 'currency',
            billing_period = plan_data ->> 'billing_period',
            trial_days = coalesce((plan_data ->> 'trial_days')::INT, 0),
            is_default = make_default,
            is_active = coalesce((plan_data ->> 'is_active')::BOOLEAN, TRUE),
            position = coalesce((plan_data ->> 'position')::INT, 0)
        WHERE p.id = saved_id;

        IF NOT FOUND THEN
            RAISE SQLSTATE 'PGRST' USING
                MESSAGE = json_build_object('code', 'P0002', 'message', 'plan_not_found')::TEXT,
                DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
        END IF;
    END IF;

    DELETE FROM public.plan_module pm WHERE pm.plan_id = saved_id AND NOT (pm.module_id = ANY (module_ids));
    INSERT INTO public.plan_module (plan_id, module_id)
    SELECT saved_id, item.id FROM unnest(module_ids) AS item (id)
    ON CONFLICT DO NOTHING;

    DELETE FROM public.plan_limit pl
    WHERE pl.plan_id = saved_id AND (limits -> pl.limit_key IS NULL OR jsonb_typeof(limits -> pl.limit_key) = 'null');
    INSERT INTO public.plan_limit (plan_id, limit_key, value)
    SELECT saved_id, item.key, item.value::INT
    FROM jsonb_each_text(limits) AS item
    WHERE item.value IS NOT NULL
    ON CONFLICT (plan_id, limit_key) DO UPDATE SET value = EXCLUDED.value;

    RETURN saved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_plan (JSONB, TEXT[], JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_plan (JSONB, TEXT[], JSONB) TO authenticated;

-- Every company with the subscription in force, its plan and its usage, for the super admin (no
-- rows for anyone else).
CREATE OR REPLACE VIEW public.company_subscription
WITH
   (security_invoker = TRUE) AS
SELECT
   t.id,
   t.display_name,
   t.email,
   t.created_at,
   s.id AS subscription_id,
   s.plan_id,
   p.display_name AS plan_name,
   CASE
      WHEN s.id IS NULL THEN 'none'
      ELSE public.status (s)
   END AS status,
   s.starts_at,
   s.ends_at,
   s.canceled_at,
   s.is_trial,
   u.branches,
   u.users
FROM
   public.tenant t
   CROSS JOIN LATERAL private.entitlements (ARRAY[t.id]) e
   LEFT JOIN public.subscription s ON s.id = e.subscription_id
   LEFT JOIN public.plan p ON p.id = e.plan_id
   CROSS JOIN LATERAL private.company_usage (t.id) u
WHERE
   t.parent_id IS NULL
   AND (
      SELECT
         private.check_super_admin ()
   );

REVOKE ALL ON public.company_subscription FROM anon;

GRANT SELECT ON public.company_subscription TO authenticated;
