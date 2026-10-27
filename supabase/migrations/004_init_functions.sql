CREATE OR REPLACE FUNCTION "public"."throw_rls_policy_error" ("message" TEXT) RETURNS "pg_catalog"."bool"
SET
    "search_path" = '' AS $$
DECLARE
  error_message text;
BEGIN
    error_message := 'access_denied';
    IF message IS NOT NULL THEN
      error_message := message;
    END IF;
    RAISE EXCEPTION '%', error_message USING ERRCODE = '42501';
    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE COST 100;

-- Create or replace the handle_new_user function
CREATE OR REPLACE FUNCTION private.handle_new_user () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = '' AS $$
DECLARE
    tenant_id UUID;
    user_id UUID;
BEGIN
    BEGIN
        -- Insert into the user table
        INSERT INTO public.user (id, user_metadata, email, phone)
        VALUES (
            NEW.id
          , NEW.raw_user_meta_data
          , NEW.email
          , NEW.phone
        ) RETURNING id INTO user_id;

    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Failed to insert new user: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- Create or replace the handle_update_user function
CREATE OR REPLACE FUNCTION private.handle_update_user () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = '' AS $$
DECLARE
    user_id UUID;
BEGIN
    BEGIN
        -- Update the user table
        UPDATE public.user
        SET
            user_metadata = NEW.raw_user_meta_data
          , email = NEW.email
          , phone = NEW.phone
        WHERE id = NEW.id
        RETURNING id INTO user_id;

        -- Check if the user ID was updated
        IF NOT FOUND THEN
            RAISE EXCEPTION 'User with id % does not exist in public.user', NEW.id;
        END IF;

    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Failed to update user: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- Create or replace the handle_user_delete function
CREATE OR REPLACE FUNCTION private.handle_user_delete () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = '' AS $$BEGIN
    BEGIN
        -- Delete the profile from the user table
        DELETE FROM public.user
        WHERE id = OLD.id;

    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Failed to delete user: %', SQLERRM;
    END;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.manage_policies () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = '' AS $$
DECLARE
    permission_record RECORD;
    target_resource TEXT;
    target_table TEXT;
    target_schema TEXT;
    kind TEXT;
    command TEXT;
    policy_name TEXT;
    policy_clause TEXT;
    policy_error_message TEXT;
    permission_check TEXT;
BEGIN
    -- Determine command based on trigger type
    IF TG_OP = 'INSERT' THEN
        -- Handle policy creation for new role_permission
        permission_record := NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle policy update for existing role_permission
        permission_record := NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Handle policy deletion for removed role_permission
        permission_record := OLD;
    END IF;

    target_resource := permission_record.resource_name;

    -- Extract the schema and table name (e.g., 'public.user')
    target_schema := split_part(target_resource, '.', 1);
    target_table := split_part(target_resource, '.', 2);

    EXECUTE format($f$ ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY $f$, target_schema, target_table);


    -- Check if the table exists
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = target_schema
        AND table_name = target_table
    ) THEN

        -- Ensure condition is not NULL or empty
        IF permission_record.resource_condition IS NULL OR trim(permission_record.resource_condition) = '' THEN
            permission_record.resource_condition := 'TRUE'; -- Default condition
        END IF;

        IF permission_record.condition IS NULL OR trim(permission_record.condition) = '' THEN
            permission_record.condition := 'TRUE'; -- Default condition
        END IF;

        -- Construct a dynamic policy name based on the resource and command
        command := permission_record.command;
        kind := permission_record.kind;
        policy_name := command || '_' || target_schema || '_' || target_table;

        -- Handle DELETE operation (drop policy)
        IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
            -- Drop the policy if the permission is deleted
            EXECUTE format($f$ DROP POLICY IF EXISTS %I ON %s $f$, policy_name, target_resource);
            RAISE LOG 'Policy "%" dropped for % on command %', policy_name, target_resource, command;
        END IF;

        -- A table with a tenant_id takes each row's own tenant: the rows of the request's tenants
        -- where the user has the permission. Others need it in the active tenant.
        IF private.has_table_tenant_id(target_table) THEN
            permission_check := format(
                'tenant_id = ANY ((SELECT private.permitted_tenants(%L, %L))::UUID[])', target_resource, command
            );
        ELSE
            permission_check := format('(SELECT private.check_permission(%L, %L))', target_resource, command);
        END IF;

        -- Extract policy error message
        policy_error_message := COALESCE(permission_record.error_message, format('You don''t have permission to %I on %I', COALESCE(kind, command), COALESCE(permission_record.group_name, target_table)));

        -- Handle INSERT operation (create policy)
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN


            -- Special case for UPDATE: using both USING and WITH CHECK clauses
            IF command = 'update' THEN
               IF permission_record.bypass = TRUE THEN
                  EXECUTE format(
                    $f$
                        CREATE POLICY %I ON %I.%I FOR %s TO authenticated
                        USING(true) WITH CHECK (TRUE)
                    $f$
                  , policy_name
                  , target_schema
                  , target_table
                  , command
                  );
               ELSE
                  EXECUTE format(
                     $f$
                        CREATE POLICY %I ON %I.%I FOR %s TO authenticated USING (
                        CASE
                            WHEN (%s AND %s)
                            THEN true
                            WHEN (%L = TRUE) THEN
                                public.throw_rls_policy_error(%L)
                        END
                        ) WITH CHECK (
                        CASE
                            WHEN (%s AND %s)
                            THEN true
                            WHEN (%L = TRUE) THEN
                                public.throw_rls_policy_error(%L)
                        END
                        )
                    $f$
                  , policy_name
                  , target_schema
                  , target_table
                  , command
                  , permission_record.resource_condition
                  , permission_check
                  , permission_record.throws_error
                  , policy_error_message
                  , permission_record.resource_condition
                  , permission_check
                  , permission_record.throws_error
                  , policy_error_message
                  );
                  RAISE LOG 'Policy "%" created for % on %', policy_name, command, target_table;
               END IF;
            ELSE
               -- Determine the appropriate clause (USING or WITH CHECK) based on the command
               IF command IN ('select', 'delete') THEN
                  policy_clause := 'USING';
               ELSE
                  policy_clause := 'WITH CHECK';
               END IF;

               IF permission_record.bypass = TRUE THEN
                  EXECUTE format(
                    $f$
                        CREATE POLICY %I ON %I.%I FOR %s TO authenticated
                        %s (TRUE)
                    $f$
                    , policy_name
                    , target_schema
                    , target_table
                    , command
                    , policy_clause
                  );
               ELSE
                  -- Default for SELECT and DELETE
                  EXECUTE format(
                    $f$
                        CREATE POLICY %I ON %I.%I FOR %s TO authenticated %s (
                        CASE
                            WHEN (%s AND %s)
                            THEN true
                            WHEN (%L = TRUE) THEN
                                public.throw_rls_policy_error(%L)
                        END
                        )
                    $f$
                  , policy_name
                  , target_schema
                  , target_table
                  , command
                  , policy_clause
                  , permission_record.resource_condition
                  , permission_check
                  , permission_record.throws_error
                  , policy_error_message
                  );
                  RAISE LOG 'Policy "%" created for % on %', policy_name, command, target_table;
               END IF;
            END IF;

        END IF;
    ELSE
        RAISE LOG 'Table "%" does not exist. Skipping policy operation.', target_table;
    END IF;
    RETURN NULL;
END;
$$;

-- Access: who may use which tenants, with which permissions. Everything is read from the tables on
-- each request, so a change (a role, a permission, a membership, a branch) applies to the next
-- request; the access token only identifies the user. RLS policies call these through
-- `(SELECT …)`, which runs them once per statement rather than once per row. They are plpgsql:
-- a SECURITY DEFINER SQL function is planned again on every call, plpgsql keeps its plans.
--
-- Tenants form a tree (tenant.parent_id). Owning a tenant makes one the owner of every branch below
-- it, computed here rather than copied, so it ends with the ownership. A request works on a set
-- of the user's tenants (x-tenant-ids) and adds new rows to one of them, the active tenant
-- (x-tenant-id).
CREATE OR REPLACE FUNCTION private.check_super_admin (user_id UUID DEFAULT NULL) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = coalesce(check_super_admin.user_id, auth.uid()) AND u.is_super_admin = TRUE
    );
END;
$$;

-- The tenants `user_id` owns: those in tenant_owner and every branch below them.
CREATE OR REPLACE FUNCTION private.owned_tenants (user_id UUID) RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
BEGIN
    RETURN ARRAY(
        -- UNION (not UNION ALL) also stops at a cycle, should one ever get in.
        WITH RECURSIVE owned (id) AS (
            SELECT o.tenant_id FROM public.tenant_owner o WHERE o.user_id = owned_tenants.user_id
            UNION
            SELECT t.id FROM public.tenant t JOIN owned ON t.parent_id = owned.id
        )
        SELECT owned.id FROM owned
    );
END;
$$;

-- The tenants the user may use: those they belong to and those they own (every tenant for a super
-- admin).
CREATE OR REPLACE FUNCTION private.allowed_tenant () RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
DECLARE
    uid UUID := auth.uid();
BEGIN
    IF private.check_super_admin() THEN
        RETURN ARRAY(SELECT t.id FROM public.tenant t);
    END IF;
    RETURN ARRAY(
        SELECT tu.tenant_id FROM public.tenant_user tu WHERE tu.user_id = uid
        UNION
        SELECT unnest(private.owned_tenants(uid))
    );
END;
$$;

-- The tenant the request names as active, not yet checked against the user's tenants.
CREATE OR REPLACE FUNCTION private.requested_tenant () RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
BEGIN
    RETURN coalesce(
        nullif(nullif(current_setting('request.headers', true), '')::JSONB ->> 'x-tenant-id', '')::UUID,
        (nullif(current_setting('request.jwt.claims', true), '')::JSONB -> 'user_metadata' ->> 'current_tenant_id')::UUID
    );
EXCEPTION
    -- A malformed header or claim names no tenant.
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- The active tenant, where new rows go: the `x-tenant-id` header, else the user's current tenant
-- (the token's user_metadata.current_tenant_id); only if the user may use it, else NULL.
CREATE OR REPLACE FUNCTION private.tenant_id () RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
DECLARE
    requested UUID := private.requested_tenant();
BEGIN
    IF requested = ANY (private.allowed_tenant()) THEN
        RETURN requested;
    END IF;
    RETURN NULL;
END;
$$;

-- The tenants a request reads from: those listed in `x-tenant-ids` (comma separated) that the user
-- may use, and the active tenant. Without the header, the active tenant alone.
CREATE OR REPLACE FUNCTION private.tenant_scope () RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
DECLARE
    header TEXT := nullif(current_setting('request.headers', true), '')::JSONB ->> 'x-tenant-ids';
    requested UUID[];
    scope UUID[];
    -- Policies of every table in a statement ask for it; the transaction keeps it, and
    -- private.notify_access_changed drops it when memberships or ownerships change.
    cache_key TEXT := concat_ws('|', auth.uid(), private.requested_tenant(), header);
    cached TEXT := current_setting('access.tenant_scope', true);
BEGIN
    IF cached LIKE cache_key || '=%' THEN
        RETURN substr(cached, length(cache_key) + 2)::UUID[];
    END IF;

    BEGIN
        requested := string_to_array(header, ',')::UUID[];
    EXCEPTION
        WHEN OTHERS THEN
            requested := NULL;
    END;

    -- The allowed tenants once: the active one is in them exactly when tenant_id() would accept it.
    scope := ARRAY(
        SELECT id FROM unnest(coalesce(requested, '{}') || private.requested_tenant()) AS id
        WHERE id IS NOT NULL
        INTERSECT
        SELECT unnest(private.allowed_tenant())
    );
    PERFORM set_config('access.tenant_scope', cache_key || '=' || scope::TEXT, true);
    RETURN scope;
END;
$$;

-- Of `tenants`, those where `user_id` has the permission: through their roles in that tenant, or
-- through owning it (the built-in owner role's permissions). The one rule for policies and the app.
CREATE OR REPLACE FUNCTION private.tenants_permitting (user_id UUID, tenants UUID[], p_resource_name TEXT, p_command TEXT) RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
DECLARE
    cmd public.type_permission_command := p_command::public.type_permission_command;
    by_role UUID[];
    owners_have_it BOOLEAN;
BEGIN
    IF user_id IS NULL OR cardinality(tenants) IS NULL OR cardinality(tenants) = 0 THEN
        RETURN '{}';
    END IF;
    IF private.check_super_admin(user_id) THEN
        RETURN tenants;
    END IF;

    -- Two narrow lookups rather than one query with an OR, which plans poorly.
    by_role := ARRAY(
        SELECT DISTINCT r.tenant_id
        FROM public.user_role ur
        JOIN public.role r ON r.id = ur.role_id
        JOIN public.role_permission rp ON rp.role_id = r.id
        JOIN public.permission p ON p.id = rp.permission_id
        WHERE ur.user_id = tenants_permitting.user_id
          AND r.tenant_id = ANY (tenants)
          AND p.resource_name = p_resource_name AND p.command = cmd
    );

    owners_have_it := EXISTS (
        SELECT 1
        FROM public.role r
        JOIN public.role_permission rp ON rp.role_id = r.id
        JOIN public.permission p ON p.id = rp.permission_id
        WHERE r.tenant_id IS NULL AND r.display_name = 'owner'
          AND p.resource_name = p_resource_name AND p.command = cmd
    );

    IF NOT owners_have_it THEN
        RETURN by_role;
    END IF;
    RETURN ARRAY(
        SELECT id FROM unnest(by_role) AS id
        UNION
        SELECT id FROM unnest(tenants) AS id WHERE id = ANY (private.owned_tenants(tenants_permitting.user_id))
    );
END;
$$;

-- The tenants of the request's scope where the user has the permission. Policies of tables with a
-- tenant_id test `tenant_id = ANY (…)` against it, which the tenant_id index serves.
CREATE OR REPLACE FUNCTION private.permitted_tenants (p_resource_name TEXT, p_command TEXT) RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
BEGIN
    RETURN private.tenants_permitting(auth.uid(), private.tenant_scope(), p_resource_name, p_command);
END;
$$;

-- Whether the user has the permission in the active tenant (tables without a tenant_id).
CREATE OR REPLACE FUNCTION private.check_permission (p_resource_name TEXT, p_command TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
DECLARE
    active UUID := private.tenant_id();
BEGIN
    IF active IS NULL THEN
        RETURN private.check_super_admin();
    END IF;
    RETURN cardinality(private.tenants_permitting(auth.uid(), ARRAY[active], p_resource_name, p_command)) > 0;
END;
$$;

-- The permissions `user_id` has in `tenant_id` (the same rules as tenants_permitting), for the app.
CREATE OR REPLACE FUNCTION private.permissions (user_id UUID, tenant_id UUID) RETURNS TABLE (resource_name TEXT, command TEXT) LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
BEGIN
    IF private.check_super_admin(permissions.user_id) THEN
        RETURN QUERY SELECT p.resource_name::TEXT, p.command::TEXT FROM public.permission p;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT DISTINCT p.resource_name::TEXT, p.command::TEXT
    FROM public.permission p
    JOIN public.role_permission rp ON rp.permission_id = p.id
    JOIN public.role r ON r.id = rp.role_id
    WHERE (
        r.tenant_id = permissions.tenant_id
        AND EXISTS (SELECT 1 FROM public.user_role ur WHERE ur.role_id = r.id AND ur.user_id = permissions.user_id)
    ) OR (
        r.tenant_id IS NULL AND r.display_name = 'owner'
        AND permissions.tenant_id = ANY (private.owned_tenants(permissions.user_id))
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.check_tenant_id (tenant_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
BEGIN
    RETURN check_tenant_id.tenant_id = private.tenant_id();
END;
$$;

CREATE OR REPLACE FUNCTION private.check_allowed_tenant (tenant_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
BEGIN
    RETURN check_allowed_tenant.tenant_id = ANY (private.allowed_tenant());
END;
$$;

-- The access token carries the user's current tenant only (user_metadata.current_tenant_id, the
-- first of their tenants when unset or no longer theirs). Tenants and permissions are not in the
-- token: they are read per request (above), and the app gets them from public.my_access.
CREATE OR REPLACE FUNCTION private.custom_access_token_hook (e JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
DECLARE
    u_id UUID := (e ->> 'user_id')::UUID;
    claims JSONB := e -> 'claims';
    current_tenant_id UUID;
BEGIN
    IF NOT claims ? 'user_metadata' THEN
        claims := jsonb_set(claims, '{user_metadata}', '{}'::JSONB);
    END IF;

    current_tenant_id := (claims -> 'user_metadata' ->> 'current_tenant_id')::UUID;

    IF current_tenant_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.tenant_user tu WHERE tu.user_id = u_id AND tu.tenant_id = current_tenant_id
    ) THEN
        SELECT tu.tenant_id INTO current_tenant_id
        FROM public.tenant_user tu
        JOIN public.tenant t ON t.id = tu.tenant_id
        WHERE tu.user_id = u_id
        ORDER BY t.created_at, t.id
        LIMIT 1;
    END IF;

    IF current_tenant_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{user_metadata,current_tenant_id}', to_jsonb(current_tenant_id), true);
    END IF;

    RETURN jsonb_set(e, '{claims}', claims, true);
END;
$$;

CREATE OR REPLACE FUNCTION validate_record_quantity () RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql
SET
    "search_path" = '' AS $$
BEGIN
    IF OLD.stock_id = NEW.stock_id AND TG_OP = 'UPDATE' THEN
        IF NEW.quantity > OLD.quantity + (SELECT available_quantity FROM public.stock_view WHERE id = NEW.stock_id) THEN
            RAISE EXCEPTION 'Amount cannot be greater than available quantity';
        END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM public.record WHERE id = NEW.id) AND NEW.quantity > (SELECT available_quantity FROM public.stock_view WHERE id = NEW.stock_id) THEN
        RAISE EXCEPTION 'Amount cannot be greater than available quantity';
    END IF;
   
    RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION private.has_table_tenant_id (p_table_name TEXT) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER
SET
    "search_path" = '' AS $$
    SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = p_table_name
        AND table_schema = 'public'
        AND column_name = 'tenant_id'
    );
$$;

-- Whether the table may have shared rows (tenant_id NULL), visible in every tenant.
CREATE OR REPLACE FUNCTION private.is_tenant_id_nullable (p_table_name TEXT) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER
SET
    "search_path" = '' AS $$
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = p_table_name AND column_name = 'tenant_id' AND is_nullable = 'YES'
    );
$$;

CREATE OR REPLACE FUNCTION private.enable_tenant_level_security (p_table_name TEXT) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
    "search_path" = '' AS $$
DECLARE
  t_name text := p_table_name;
  t_schema text := 'public';
  in_scope text;
BEGIN
  IF NOT private.has_table_tenant_id(t_name) THEN
    RAISE NOTICE 'Table "%" does not have tenant_id column. Skipping.', t_name;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t_schema, t_name);

  -- The request's tenants (private.tenant_scope): rows outside them are neither read nor written.
  -- Shared rows (tenant_id NULL) only where the column allows them: an OR keeps the index from
  -- narrowing the scan to the tenants, so every tenant's rows would be read and filtered.
  in_scope := 'tenant_id = ANY ((SELECT private.tenant_scope())::UUID[])';

  EXECUTE format(
    $f$CREATE POLICY restrict_selects_to_current_tenant ON %I.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)$f$,
    t_schema, t_name,
    CASE WHEN private.is_tenant_id_nullable(t_name) THEN format('(tenant_id IS NULL OR %s)', in_scope) ELSE in_scope END
  );

  EXECUTE format(
    $f$CREATE POLICY restrict_inserts_to_allowed_tenants ON %I.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)$f$,
    t_schema, t_name, in_scope
  );

  EXECUTE format(
    $f$CREATE POLICY restrict_updates_to_current_tenant ON %I.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%3$s) WITH CHECK (%3$s)$f$,
    t_schema, t_name, in_scope
  );

  EXECUTE format(
    $f$CREATE POLICY restrict_deletes_to_current_tenant ON %I.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)$f$,
    t_schema, t_name, in_scope
  );

  RAISE NOTICE 'RLS enabled and policies created for table: %', t_name;
END;
$$;

CREATE OR REPLACE FUNCTION private.disable_tenant_level_security (p_table_name TEXT) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
    "search_path" = '' AS $$
DECLARE
  t_name text := p_table_name;
  t_schema text := 'public';
BEGIN
  IF NOT private.has_table_tenant_id(t_name) THEN
    RAISE NOTICE 'Table "%" does not have tenant_id column. Skipping.', t_name;
    RETURN;
  END IF;

  -- DROP policies (RLS stays enabled)
  EXECUTE format('DROP POLICY IF EXISTS restrict_selects_to_current_tenant ON %I.%I', t_schema, t_name);
  EXECUTE format('DROP POLICY IF EXISTS restrict_inserts_to_allowed_tenants ON %I.%I', t_schema, t_name);
  EXECUTE format('DROP POLICY IF EXISTS restrict_updates_to_current_tenant ON %I.%I', t_schema, t_name);
  EXECUTE format('DROP POLICY IF EXISTS restrict_deletes_to_current_tenant ON %I.%I', t_schema, t_name);

  RAISE NOTICE 'Policies dropped (RLS still enabled) for table: %', t_name;
END;
$$;