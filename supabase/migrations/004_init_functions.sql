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
                            WHEN (%s AND (SELECT private.check_permission(%L, %L)))
                            THEN true
                            WHEN (%L = TRUE) THEN
                                public.throw_rls_policy_error(%L)
                        END
                        ) WITH CHECK (
                        CASE
                            WHEN (%s AND (SELECT private.check_permission(%L, %L)))
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
                  , target_resource
                  , command
                  , permission_record.throws_error
                  , policy_error_message
                  , permission_record.resource_condition
                  , target_resource
                  , command
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
                            WHEN (%s AND (SELECT private.check_permission(%L, %L)))
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
                  , target_resource
                  , command
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

-- Access: who may use which tenant, with which permissions. Everything is read from the tables on
-- each request, so a change (a role, a permission, a membership) applies to the next request; the
-- access token only identifies the user. RLS policies call these through `(SELECT …)`, which runs
-- them once per statement rather than once per row.
CREATE OR REPLACE FUNCTION private.check_super_admin (user_id UUID DEFAULT NULL) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = coalesce(check_super_admin.user_id, auth.uid()) AND u.is_super_admin = TRUE
    );
$$;

-- The tenants the user belongs to (every tenant for a super admin).
CREATE OR REPLACE FUNCTION private.allowed_tenant () RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
BEGIN
    IF private.check_super_admin() THEN
        RETURN ARRAY(SELECT t.id FROM public.tenant t);
    END IF;
    RETURN ARRAY(SELECT tu.tenant_id FROM public.tenant_user tu WHERE tu.user_id = auth.uid());
END;
$$;

-- The tenant a request acts on: the `x-tenant-id` header, else the user's current tenant (the
-- token's user_metadata.current_tenant_id); only if the user belongs to it, else NULL.
CREATE OR REPLACE FUNCTION private.tenant_id () RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
DECLARE
    requested UUID;
BEGIN
    BEGIN
        requested := coalesce(
            nullif(nullif(current_setting('request.headers', true), '')::JSONB ->> 'x-tenant-id', '')::UUID,
            (nullif(current_setting('request.jwt.claims', true), '')::JSONB -> 'user_metadata' ->> 'current_tenant_id')::UUID
        );
    EXCEPTION
        -- A malformed header or claim names no tenant.
        WHEN OTHERS THEN
            RETURN NULL;
    END;

    IF requested IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.tenant_user tu WHERE tu.tenant_id = requested AND tu.user_id = auth.uid())
        OR private.check_super_admin()
    ) THEN
        RETURN requested;
    END IF;
    RETURN NULL;
END;
$$;

-- The permissions `user_id` has in `tenant_id`: those of their roles in that tenant, plus the
-- built-in owner role's where they own it. Owning a tenant is what makes someone its owner; the
-- owner role (tenant_id NULL) only lists the permissions that come with it.
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
        AND EXISTS (
            SELECT 1 FROM public.tenant_owner o
            WHERE o.user_id = permissions.user_id AND o.tenant_id = permissions.tenant_id
        )
    );
END;
$$;

-- The same rules as private.permissions, as one EXISTS: policies call this once per statement and
-- table, so it is kept to a single cached plan.
CREATE OR REPLACE FUNCTION private.check_permission (p_resource_name TEXT, p_command TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
DECLARE
    uid UUID := auth.uid();
    tid UUID := private.tenant_id();
BEGIN
    IF uid IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.permission p
        JOIN public.role_permission rp ON rp.permission_id = p.id
        JOIN public.role r ON r.id = rp.role_id
        WHERE p.resource_name = p_resource_name AND p.command = p_command::public.type_permission_command
          AND (
            (
                r.tenant_id = tid
                AND EXISTS (SELECT 1 FROM public.user_role ur WHERE ur.role_id = r.id AND ur.user_id = uid)
            ) OR (
                r.tenant_id IS NULL AND r.display_name = 'owner'
                AND EXISTS (SELECT 1 FROM public.tenant_owner o WHERE o.user_id = uid AND o.tenant_id = tid)
            )
          )
    ) OR private.check_super_admin(uid);
END;
$$;

CREATE OR REPLACE FUNCTION private.check_tenant_id (tenant_id UUID) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
    SELECT check_tenant_id.tenant_id = private.tenant_id();
$$;

CREATE OR REPLACE FUNCTION private.check_allowed_tenant (tenant_id UUID) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET
    search_path = '' AS $$
    SELECT check_allowed_tenant.tenant_id = ANY (private.allowed_tenant());
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
BEGIN
  IF NOT private.has_table_tenant_id(t_name) THEN
    RAISE NOTICE 'Table "%" does not have tenant_id column. Skipping.', t_name;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t_schema, t_name);

  -- SELECT
  EXECUTE format(
    $f$CREATE POLICY restrict_selects_to_current_tenant ON %2$I.%3$I AS RESTRICTIVE FOR SELECT TO authenticated USING (%1$s)$f$,
    -- Shared rows (tenant_id NULL) only where the column allows them: an OR keeps the index from
    -- narrowing the scan to the tenant, so every tenant's rows would be read and filtered.
    CASE WHEN private.is_tenant_id_nullable(t_name)
      THEN '(tenant_id IS NULL OR tenant_id = (SELECT private.tenant_id()))'
      ELSE 'tenant_id = (SELECT private.tenant_id())'
    END,
    t_schema, t_name
  );

  -- INSERT
  EXECUTE format(
    $f$CREATE POLICY restrict_inserts_to_allowed_tenants ON %I.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (tenant_id = ANY ((SELECT private.allowed_tenant())::UUID[]))$f$,
    t_schema, t_name
  );

  -- UPDATE
  EXECUTE format(
    $f$CREATE POLICY restrict_updates_to_current_tenant ON %I.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (tenant_id = (SELECT private.tenant_id())) WITH CHECK (tenant_id = ANY ((SELECT private.allowed_tenant())::UUID[]))$f$,
    t_schema, t_name
  );

  -- DELETE
  EXECUTE format(
    $f$CREATE POLICY restrict_deletes_to_current_tenant ON %I.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (tenant_id = (SELECT private.tenant_id()))$f$,
    t_schema, t_name
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