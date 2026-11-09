-- Field rights: which tenants' values of a sensitive field (049) a user may read or write.
--
-- field_tenants            The one rule. Of the given tenants: all of them for a super admin or a
--                          field that is not sensitive; else those the user owns (directly or above)
--                          and those where one of the user's roles has the right in
--                          role_field_permission. Owning a tenant gives no write on public.user.
-- field_read_tenants,      The rule over the request's scope (private.tenant_scope), per tenant: a
-- field_write_tenants      mixed scope answers each tenant on its own (R9).
-- field_read_all           The whole scope may be read (R10: a view returns the value as is).
-- field_user_ids           S5: the users whose personal data the caller may read (or write): the
--                          members and owners of a scope tenant where the caller holds the right,
--                          never through the active tenant alone.
-- field_group_read_tenants The tenants where every sensitive field of a group may be read.
-- field_rights_map,        For the app: the readable sensitive fields per scope tenant, and every
-- sensitive_fields_map     sensitive field per table.
-- field_rights             Every sensitive field with the user's rights in one tenant (my_access).
-- can_grant_field          C1: whether the caller may hand a right on to a role of a tenant; a role
--                          editor can grant only what they hold there.
-- field_guard_bypassed     S2: a running transfer or the test fixture flag (rules_bypassed), a
--                          service-role request (service_call), or no request at all (migrations,
--                          GoTrue's triggers, pg_cron): a postgres-side session without JWT claims
--                          and without SET ROLE.
-- role_field_permission_save_role_only
--                          S7: role_field_permission is written only by save_role (which sets
--                          moesa.save_role for its own statements), a bypassed session, or the
--                          cascade of a deleted role. Any session can set the flag, so with the
--                          flag alone a granted right must still pass can_grant_field (C1).
-- save_role                Gains `field_rights`: NULL leaves a role's rows alone (a new role has none,
--                          R1), an array becomes exactly its rows. A right beyond the caller's own
--                          raises field_grant_exceeds_own before anything is written.
-- my_access                Gains `fields`: field_rights in the active tenant.
-- select on role_field_permission
--                          Only the rows of roles the caller can see (it was every row).
--
-- Reverting an audit transaction that touched role_field_permission fails with
-- role_field_permission_save_role_only: fail-closed by design until Task 12.
--
-- Test support (supabase/tests/database), executable by nobody but their owner: impersonate_scope,
-- unimpersonate, create_test_helpers (schema t) and field_test_fixtures.
--
--   field_grant_exceeds_own              (42501) save_role was asked for a right the caller lacks
--   role_field_permission_save_role_only (42501) a direct write of role_field_permission

CREATE OR REPLACE FUNCTION private.field_tenants (p_user UUID, p_tenants UUID[], p_resource TEXT, p_field TEXT, p_write BOOLEAN) RETURNS UUID[] LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    by_role UUID[];
    by_owner UUID[] := '{}';
BEGIN
    IF cardinality(p_tenants) IS NULL OR cardinality(p_tenants) = 0 THEN
        RETURN '{}';
    END IF;

    -- Only a field known not to be sensitive passes as is; an unknown one is treated as sensitive.
    IF EXISTS (
        SELECT 1 FROM public.field_class f
        WHERE f.resource_name = p_resource AND f.field = p_field AND f.class <> 'sensitive'
    ) THEN
        RETURN p_tenants;
    END IF;

    IF p_user IS NULL THEN
        RETURN '{}';
    END IF;

    IF private.check_super_admin(p_user) THEN
        RETURN p_tenants;
    END IF;

    -- Two narrow lookups rather than one query with an OR, as private.tenants_granting.
    by_role := ARRAY(
        SELECT DISTINCT r.tenant_id
        FROM public.user_role ur
        JOIN public.role r ON r.id = ur.role_id
        JOIN public.role_field_permission rfp ON rfp.role_id = r.id
        WHERE ur.user_id = p_user
          AND r.tenant_id = ANY (p_tenants)
          -- user_role outlives a membership (removing a member deletes only tenant_user).
          AND EXISTS (SELECT 1 FROM public.tenant_user tu WHERE tu.user_id = p_user AND tu.tenant_id = r.tenant_id)
          AND rfp.resource_name = p_resource AND rfp.field = p_field
          AND CASE WHEN p_write THEN rfp.can_write ELSE rfp.can_read END
    );

    IF NOT (p_write AND p_resource = 'public.user') THEN
        by_owner := ARRAY(
            SELECT id FROM unnest(p_tenants) AS id WHERE id = ANY (private.owned_tenants(p_user))
        );
    END IF;

    -- In the order of p_tenants.
    RETURN ARRAY(
        SELECT u.id
        FROM unnest(p_tenants) WITH ORDINALITY AS u (id, n)
        WHERE u.id = ANY (by_role) OR u.id = ANY (by_owner)
        GROUP BY u.id
        ORDER BY min(u.n)
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.field_read_tenants (p_resource TEXT, p_field TEXT) RETURNS UUID[] LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    RETURN private.field_tenants(auth.uid(), private.tenant_scope(), p_resource, p_field, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION private.field_write_tenants (p_resource TEXT, p_field TEXT) RETURNS UUID[] LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    RETURN private.field_tenants(auth.uid(), private.tenant_scope(), p_resource, p_field, TRUE);
END;
$$;

-- An empty scope reads nothing, so it is not "all".
CREATE OR REPLACE FUNCTION private.field_read_all (p_resource TEXT, p_field TEXT) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    scope UUID[] := private.tenant_scope();
BEGIN
    RETURN coalesce(cardinality(scope), 0) > 0
       AND scope <@ private.field_tenants(auth.uid(), scope, p_resource, p_field, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION private.field_user_ids (p_field TEXT, p_write BOOLEAN) RETURNS UUID[] LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    granting UUID[] := private.field_tenants(auth.uid(), private.tenant_scope(), 'public.user', p_field, p_write);
BEGIN
    IF cardinality(granting) IS NULL OR cardinality(granting) = 0 THEN
        RETURN '{}';
    END IF;
    RETURN ARRAY(
        SELECT tu.user_id FROM public.tenant_user tu WHERE tu.tenant_id = ANY (granting)
        UNION
        SELECT o.user_id FROM public.tenant_owner o WHERE o.tenant_id = ANY (granting)
    );
END;
$$;

-- An unknown group, or one without sensitive fields, is readable nowhere.
CREATE OR REPLACE FUNCTION private.field_group_read_tenants (p_group TEXT) RETURNS UUID[] LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    result UUID[] := private.tenant_scope();
    readable UUID[];
    f RECORD;
    seen BOOLEAN := FALSE;
BEGIN
    FOR f IN
        SELECT c.resource_name, c.field FROM public.field_class c
        WHERE c.class = 'sensitive' AND c.group_name = p_group
    LOOP
        seen := TRUE;
        readable := private.field_tenants(auth.uid(), result, f.resource_name, f.field, FALSE);
        result := ARRAY(
            SELECT u.id FROM unnest(result) WITH ORDINALITY AS u (id, n) WHERE u.id = ANY (readable) ORDER BY u.n
        );
        EXIT WHEN cardinality(result) = 0;
    END LOOP;

    IF NOT seen THEN
        RETURN '{}';
    END IF;
    RETURN result;
END;
$$;

-- {"<tenant id>": ["<table>.<field>", ...]}: the readable sensitive fields of each scope tenant.
CREATE OR REPLACE FUNCTION private.field_rights_map () RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    uid UUID := auth.uid();
    scope UUID[] := private.tenant_scope();
BEGIN
    RETURN coalesce((
        WITH readable AS (
            SELECT split_part(f.resource_name, '.', 2) || '.' || f.field AS name,
                   private.field_tenants(uid, scope, f.resource_name, f.field, FALSE) AS tenants
            FROM public.field_class f
            WHERE f.class = 'sensitive'
        )
        SELECT jsonb_object_agg(s.id::TEXT, coalesce(
            (SELECT jsonb_agg(r.name ORDER BY r.name) FROM readable r WHERE s.id = ANY (r.tenants)),
            '[]'::JSONB
        ))
        FROM unnest(scope) AS s (id)
    ), '{}'::JSONB);
END;
$$;

-- {"<table>": ["<field>", ...]}: every sensitive field.
CREATE OR REPLACE FUNCTION private.sensitive_fields_map () RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    RETURN coalesce((
        SELECT jsonb_object_agg(x.tbl, x.fields)
        FROM (
            SELECT split_part(f.resource_name, '.', 2) AS tbl, jsonb_agg(f.field ORDER BY f.field) AS fields
            FROM public.field_class f
            WHERE f.class = 'sensitive'
            GROUP BY 1
        ) x
    ), '{}'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION private.field_rights (p_user UUID, p_tenant UUID) RETURNS TABLE (resource_name TEXT, field TEXT, can_read BOOLEAN, can_write BOOLEAN) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    RETURN QUERY
    SELECT f.resource_name, f.field,
           coalesce(p_tenant = ANY (private.field_tenants(p_user, ARRAY[p_tenant], f.resource_name, f.field, FALSE)), FALSE),
           coalesce(p_tenant = ANY (private.field_tenants(p_user, ARRAY[p_tenant], f.resource_name, f.field, TRUE)), FALSE)
    FROM public.field_class f
    WHERE f.class = 'sensitive'
    ORDER BY f.resource_name, f.field;
END;
$$;

-- C1. Executable by authenticated, so save_role (invoker here, owned by api_owner from Task 11 on)
-- answers field_grant_exceeds_own rather than permission denied.
CREATE OR REPLACE FUNCTION private.can_grant_field (p_tenant UUID, p_resource TEXT, p_field TEXT, p_write BOOLEAN) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    RETURN coalesce(p_tenant = ANY (private.field_tenants(auth.uid(), ARRAY[p_tenant], p_resource, p_field, p_write)), FALSE);
END;
$$;

-- S2. Not SECURITY DEFINER and never current_user: guards call it from definers, where current_user
-- is the owner; the role setting and session_user still name the request.
CREATE OR REPLACE FUNCTION private.field_guard_bypassed () RETURNS BOOLEAN LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT private.rules_bypassed()
        OR private.service_call()
        OR coalesce(
            nullif(current_setting('request.jwt.claims', TRUE), '') IS NULL
            AND current_setting('role') = 'none'
            AND session_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin'),
            FALSE
        );
$$;

-- VOLATILE: a cascade sees the parent row its own statement deleted.
CREATE OR REPLACE FUNCTION private.parent_gone (p_table REGCLASS, p_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    found_row BOOLEAN;
BEGIN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1)', p_table) INTO found_row USING p_id;
    RETURN NOT found_row;
END;
$$;

-- S7. SECURITY DEFINER: it calls the bypass and parent_gone, which the caller may not execute, and
-- reads the role's tenant whatever the caller may see.
CREATE OR REPLACE FUNCTION private.role_field_permission_save_role_only () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    role_tenant UUID;
    -- An update keeps a flag only on the same row key; moving a row to another role or field is a new grant.
    same_key BOOLEAN := TG_OP = 'UPDATE' AND NEW.role_id = OLD.role_id AND NEW.resource_name = OLD.resource_name
        AND NEW.field = OLD.field;
BEGIN
    IF private.field_guard_bypassed()
       OR (TG_OP = 'DELETE' AND private.parent_gone('public.role', OLD.role_id)) THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    IF coalesce(current_setting('moesa.save_role', TRUE), '') <> '1' THEN
        RAISE EXCEPTION 'role_field_permission_save_role_only' USING ERRCODE = '42501';
    END IF;

    -- The flag alone proves nothing: a right granted must be one the caller holds in the role's
    -- tenant (C1), as save_role checks before writing.
    -- Only a right that is added is checked: on an update, a flag already held stays as it is.
    IF TG_OP <> 'DELETE' AND (NEW.can_read OR NEW.can_write) THEN
        SELECT r.tenant_id INTO role_tenant FROM public.role r WHERE r.id = NEW.role_id;
        IF (NEW.can_read AND NOT (same_key AND OLD.can_read)
               AND NOT private.can_grant_field(role_tenant, NEW.resource_name, NEW.field, FALSE))
           OR (NEW.can_write AND NOT (same_key AND OLD.can_write)
               AND NOT private.can_grant_field(role_tenant, NEW.resource_name, NEW.field, TRUE)) THEN
            RAISE EXCEPTION 'field_grant_exceeds_own' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$$;

-- Fires before role_field_permission_sensitive_only (049): triggers run in name order.
CREATE OR REPLACE TRIGGER role_field_permission_save_role_only BEFORE INSERT
OR
UPDATE
OR DELETE ON public.role_field_permission FOR EACH ROW
EXECUTE FUNCTION private.role_field_permission_save_role_only ();

-- Reading role_field_permission: the rows of the roles the caller can see (public.role's own select
-- policy applies inside the condition), rather than every row. The permission row's trigger
-- (private.manage_policies) rebuilds the policy.
UPDATE public.permission
SET
   bypass = FALSE,
   resource_condition = 'EXISTS (SELECT 1 FROM public.role r WHERE r.id = role_id)'
WHERE
   resource_name = 'public.role_field_permission'
   AND command = 'select';

-- save_role's field-rights sync: the role's rows become exactly `p_field_rights`. It writes as postgres
-- because save_role runs as api_owner (058), whose api view of role_field_permission is read-only and
-- which holds no write on the table (S7), not even after the cutover (064). RLS does not filter
-- postgres, so the table's policies are restated: each command that touches a row needs the caller's
-- role_field_permission permission in the active tenant (check_permission), on a role of a tenant.
-- The policies' role visibility is the caller's own write of the role row just before, under RLS.
-- The S7 trigger still checks every right added against the caller's own (C1). Only api_owner may
-- execute it (058).
CREATE OR REPLACE FUNCTION private.save_role_field_rights (p_role UUID, p_field_rights JSONB) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    -- A field given twice keeps the wider right; a write implies a read.
    wanted JSONB := (
        SELECT coalesce(jsonb_agg(g), '[]'::JSONB)
        FROM (SELECT x.resource_name, x.field,
                     bool_or(coalesce(x.can_read, FALSE) OR coalesce(x.can_write, FALSE)) AS can_read,
                     bool_or(coalesce(x.can_write, FALSE)) AS can_write
              FROM jsonb_to_recordset(p_field_rights) AS x (resource_name TEXT, field TEXT, can_read BOOLEAN, can_write BOOLEAN)
              GROUP BY x.resource_name, x.field) g
    );
    in_tenant BOOLEAN := EXISTS (SELECT 1 FROM public.role r WHERE r.id = p_role AND r.tenant_id IS NOT NULL);
BEGIN
    -- The policies, before any write.
    IF EXISTS (SELECT 1 FROM public.role_field_permission rfp
               WHERE rfp.role_id = p_role
                 AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(wanted) AS n (resource_name TEXT, field TEXT)
                                 WHERE n.resource_name = rfp.resource_name AND n.field = rfp.field))
       AND NOT (in_tenant AND private.check_permission('public.role_field_permission', 'delete')) THEN
        PERFORM public.throw_rls_policy_error('You don''t have permission to modify on role');
    END IF;
    IF EXISTS (SELECT 1 FROM public.role_field_permission rfp
               JOIN jsonb_to_recordset(wanted) AS n (resource_name TEXT, field TEXT, can_read BOOLEAN, can_write BOOLEAN)
                 ON n.resource_name = rfp.resource_name AND n.field = rfp.field
               WHERE rfp.role_id = p_role AND (rfp.can_read, rfp.can_write) IS DISTINCT FROM (n.can_read, n.can_write))
       AND NOT (in_tenant AND private.check_permission('public.role_field_permission', 'update')) THEN
        PERFORM public.throw_rls_policy_error('You don''t have permission to modify on role');
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(wanted) AS n (resource_name TEXT, field TEXT)
               WHERE NOT EXISTS (SELECT 1 FROM public.role_field_permission rfp
                                 WHERE rfp.role_id = p_role AND rfp.resource_name = n.resource_name AND rfp.field = n.field))
       AND NOT (in_tenant AND private.check_permission('public.role_field_permission', 'insert')) THEN
        PERFORM public.throw_rls_policy_error('You don''t have permission to "create" on role');
    END IF;

    PERFORM set_config('moesa.save_role', '1', TRUE);

    DELETE FROM public.role_field_permission rfp
    WHERE rfp.role_id = p_role
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(wanted) AS n (resource_name TEXT, field TEXT)
          WHERE n.resource_name = rfp.resource_name AND n.field = rfp.field
      );

    -- Only rows that change are written (an update, then an insert: an upsert would fire the insert
    -- trigger for a row that exists).
    UPDATE public.role_field_permission rfp
    SET can_read = n.can_read, can_write = n.can_write
    FROM jsonb_to_recordset(wanted) AS n (resource_name TEXT, field TEXT, can_read BOOLEAN, can_write BOOLEAN)
    WHERE rfp.role_id = p_role AND rfp.resource_name = n.resource_name AND rfp.field = n.field
      AND (rfp.can_read, rfp.can_write) IS DISTINCT FROM (n.can_read, n.can_write);

    INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
    SELECT p_role, n.resource_name, n.field, n.can_read, n.can_write
    FROM jsonb_to_recordset(wanted) AS n (resource_name TEXT, field TEXT, can_read BOOLEAN, can_write BOOLEAN)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.role_field_permission rfp
        WHERE rfp.role_id = p_role AND rfp.resource_name = n.resource_name AND rfp.field = n.field
    );

    PERFORM set_config('moesa.save_role', '', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION private.save_role_field_rights (UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- A role, its permissions and (when given) its field rights.
DROP FUNCTION public.save_role (JSONB, UUID[]);

CREATE OR REPLACE FUNCTION public.save_role (role_data JSONB, permission_ids UUID[] DEFAULT '{}', field_rights JSONB DEFAULT NULL) RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER
SET
    search_path = '' AS $$
DECLARE
    saved_id UUID := (role_data ->> 'id')::UUID;
    role_tenant UUID;
    given RECORD;
    old_read BOOLEAN;
    old_write BOOLEAN;
BEGIN
    IF field_rights IS NOT NULL THEN
        IF jsonb_typeof(field_rights) <> 'array' THEN
            RAISE EXCEPTION 'field_rights must be an array' USING ERRCODE = 'invalid_parameter_value';
        END IF;

        IF saved_id IS NULL THEN
            role_tenant := (role_data ->> 'tenant_id')::UUID;
        ELSE
            SELECT r.tenant_id INTO role_tenant FROM public.role r WHERE r.id = saved_id;
        END IF;

        -- C1, before any write: a right the call adds (more than the role holds now for that field) must
        -- be one the caller holds in the role's tenant. A right kept or removed is not checked, so
        -- an editor can still rename a role carrying rights they lack. A field given twice counts
        -- as its wider right (as written below).
        FOR given IN
            SELECT x.resource_name, x.field,
                   bool_or(coalesce(x.can_read, FALSE) OR coalesce(x.can_write, FALSE)) AS can_read,
                   bool_or(coalesce(x.can_write, FALSE)) AS can_write
            FROM jsonb_to_recordset(field_rights) AS x (resource_name TEXT, field TEXT, can_read BOOLEAN, can_write BOOLEAN)
            GROUP BY x.resource_name, x.field
        LOOP
            SELECT coalesce(o.can_read, FALSE), coalesce(o.can_write, FALSE) INTO old_read, old_write
            FROM (SELECT 1) AS one
            LEFT JOIN public.role_field_permission o
                   ON o.role_id = saved_id AND o.resource_name = given.resource_name AND o.field = given.field;

            IF (given.can_read AND NOT old_read AND NOT private.can_grant_field(role_tenant, given.resource_name, given.field, FALSE))
               OR (given.can_write AND NOT old_write AND NOT private.can_grant_field(role_tenant, given.resource_name, given.field, TRUE)) THEN
                RAISE EXCEPTION 'field_grant_exceeds_own' USING ERRCODE = '42501';
            END IF;
        END LOOP;
    END IF;

    IF saved_id IS NULL THEN
        INSERT INTO public.role (tenant_id, display_name)
        VALUES ((role_data ->> 'tenant_id')::UUID, role_data ->> 'display_name')
        RETURNING id INTO saved_id;
    ELSE
        UPDATE public.role SET display_name = role_data ->> 'display_name' WHERE id = saved_id;

        IF NOT FOUND THEN
            -- PostgREST's own error format, so the client gets a 404 rather than a 500.
            RAISE SQLSTATE 'PGRST' USING
                MESSAGE = json_build_object('code', 'P0002', 'message', 'role not found')::TEXT,
                DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
        END IF;
    END IF;

    DELETE FROM public.role_permission
    WHERE role_id = saved_id AND NOT (permission_id = ANY (permission_ids));

    INSERT INTO public.role_permission (role_id, permission_id)
    SELECT saved_id, item.id
    FROM unnest(permission_ids) AS item (id)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.role_permission rp WHERE rp.role_id = saved_id AND rp.permission_id = item.id
    );

    IF field_rights IS NOT NULL THEN
        PERFORM private.save_role_field_rights(saved_id, field_rights);
    END IF;

    RETURN saved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_role (JSONB, UUID[], JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_role (JSONB, UUID[], JSONB) TO authenticated;

-- my_access (011) with `fields`: the user's rights on every sensitive field in the active tenant.
CREATE OR REPLACE FUNCTION public.my_access (requested UUID DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    uid UUID := auth.uid();
    allowed UUID[];
    owned UUID[];
    tenant UUID;
    tenants JSONB;
BEGIN
    IF uid IS NULL THEN
        RETURN NULL;
    END IF;

    allowed := private.allowed_tenant();
    owned := private.owned_tenants(uid);
    tenant := CASE WHEN requested = ANY (allowed) THEN requested END;
    tenant := coalesce(tenant, private.tenant_id());
    IF tenant IS NULL THEN
        SELECT t.id INTO tenant FROM public.tenant t WHERE t.id = ANY (allowed) ORDER BY t.created_at, t.id LIMIT 1;
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'display_name', t.display_name,
        -- Its own logo, else the nearest tenant's above it (branches show the company's), also
        -- when the user may not use that tenant.
        'logo_path', (
            WITH RECURSIVE up (id, parent_id, logo_path, depth) AS (
                SELECT t.id, t.parent_id, t.logo_path, 0
                UNION ALL
                SELECT p.id, p.parent_id, p.logo_path, up.depth + 1
                FROM public.tenant p JOIN up ON p.id = up.parent_id
                WHERE up.logo_path IS NULL AND up.depth < 32
            )
            SELECT up.logo_path FROM up WHERE up.logo_path IS NOT NULL LIMIT 1
        ),
        -- Only a parent the user may use; otherwise the branch is a root for them.
        'parent_id', CASE WHEN t.parent_id = ANY (allowed) THEN t.parent_id END,
        'owned', t.id = ANY (owned),
        'permissions', coalesce(
            (SELECT jsonb_agg(jsonb_build_object('resource_name', p.resource_name, 'command', p.command)
                              ORDER BY p.resource_name, p.command)
             FROM private.permissions(uid, t.id) p),
            '[]'::JSONB
        )
    ) ORDER BY t.created_at, t.id), '[]'::JSONB)
    INTO tenants
    FROM public.tenant t
    WHERE t.id = ANY (allowed);

    RETURN jsonb_build_object(
        'tenant_id', tenant,
        'tenants', tenants,
        'permissions', coalesce(
            (SELECT t -> 'permissions' FROM jsonb_array_elements(tenants) t WHERE (t ->> 'id')::UUID = tenant),
            '[]'::JSONB
        ),
        'fields', coalesce(
            (SELECT jsonb_agg(jsonb_build_object('resource_name', f.resource_name, 'field', f.field,
                                                 'can_read', f.can_read, 'can_write', f.can_write)
                              ORDER BY f.resource_name, f.field)
             FROM private.field_rights(uid, tenant) f),
            '[]'::JSONB
        ),
        'subscription', private.subscription_summary(tenant),
        'is_super_admin', private.check_super_admin(uid)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.my_access (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.my_access (UUID) TO authenticated;

-- Grants. field_tenants and field_rights take any user: only definers call them.
REVOKE ALL ON FUNCTION private.field_tenants (UUID, UUID[], TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.field_rights (UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.parent_gone (REGCLASS, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.role_field_permission_save_role_only () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.field_read_tenants (TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.field_write_tenants (TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.field_read_all (TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.field_user_ids (TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.field_group_read_tenants (TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.field_rights_map () FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.sensitive_fields_map () FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_grant_field (UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.field_guard_bypassed () FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.field_read_tenants (TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.field_write_tenants (TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.field_read_all (TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.field_user_ids (TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION private.field_group_read_tenants (TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.field_rights_map () TO authenticated;
GRANT EXECUTE ON FUNCTION private.sensitive_fields_map () TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_grant_field (UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION private.field_guard_bypassed () TO authenticated;

-- field_guard_bypassed is not a definer, so whoever may call it needs its three parts; each answers
-- only about the caller's own session.
GRANT EXECUTE ON FUNCTION private.rules_bypassed () TO authenticated;
GRANT EXECUTE ON FUNCTION private.transferring () TO authenticated;
GRANT EXECUTE ON FUNCTION private.service_call () TO authenticated;

-- Tests: private.impersonate (015) with a scope of several tenants. No SET clause (it would undo the
-- role change on return), so every name is schema-qualified.
CREATE OR REPLACE FUNCTION private.impersonate_scope (p_user UUID, p_active UUID, p_scope UUID[]) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_catalog.set_config(
        'request.jwt.claims',
        pg_catalog.json_build_object('sub', p_user, 'role', 'authenticated')::TEXT,
        true
    );
    PERFORM pg_catalog.set_config(
        'request.headers',
        pg_catalog.json_build_object('x-tenant-id', p_active, 'x-tenant-ids', pg_catalog.array_to_string(p_scope, ','))::TEXT,
        true
    );
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
END;
$$;

-- Tests: back to postgres without a request (the S2 no-request path).
CREATE OR REPLACE FUNCTION private.unimpersonate () RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_catalog.set_config('role', 'none', true);
    PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
    PERFORM pg_catalog.set_config('request.headers', '', true);
END;
$$;

-- Tests: schema t, created inside the test's transaction.
--   t.peek(table, field, id)  the stored value as text, whatever the caller may read (definer)
--   t.error_of(sql)           'ok', or SQLSTATE:message; the statement is undone either way
--   t.error_detail(sql)       the error's DETAIL, or NULL
--   t.definer_exec(sql)       runs the statement as postgres
-- and, for the transaction, USAGE on schema private for authenticated.
CREATE OR REPLACE FUNCTION private.create_test_helpers () RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    EXECUTE 'CREATE SCHEMA IF NOT EXISTS t';
    EXECUTE 'GRANT USAGE ON SCHEMA t TO authenticated';
    -- Tests call the field functions by name as a signed-in user. Outside tests authenticated has no
    -- USAGE on private: policies and views reach these functions through stored expressions, and
    -- definers through their owner.
    EXECUTE 'GRANT USAGE ON SCHEMA private TO authenticated';
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'api_owner') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA t TO api_owner';
    END IF;

    EXECUTE $f$
        CREATE OR REPLACE FUNCTION t.peek (p_table TEXT, p_field TEXT, p_id UUID) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = '' AS $b$
        DECLARE
            v TEXT;
        BEGIN
            EXECUTE format('SELECT %I::TEXT FROM %s WHERE id = $1', p_field,
                           (CASE WHEN p_table LIKE '%.%' THEN p_table ELSE 'public.' || p_table END)::REGCLASS)
            INTO v USING p_id;
            RETURN v;
        END;
        $b$
    $f$;

    EXECUTE $f$
        CREATE OR REPLACE FUNCTION t.error_of (p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $b$
        BEGIN
            BEGIN
                EXECUTE p_sql;
                RAISE SQLSTATE 'TZ001' USING MESSAGE = 't.error_of: undo';
            EXCEPTION
                WHEN SQLSTATE 'TZ001' THEN
                    RETURN 'ok';
                WHEN OTHERS THEN
                    RETURN SQLSTATE || ':' || SQLERRM;
            END;
        END;
        $b$
    $f$;

    EXECUTE $f$
        CREATE OR REPLACE FUNCTION t.error_detail (p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $b$
        DECLARE
            detail TEXT;
        BEGIN
            BEGIN
                EXECUTE p_sql;
                RAISE SQLSTATE 'TZ001' USING MESSAGE = 't.error_detail: undo';
            EXCEPTION
                WHEN SQLSTATE 'TZ001' THEN
                    RETURN NULL;
                WHEN OTHERS THEN
                    GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
                    RETURN nullif(detail, '');
            END;
        END;
        $b$
    $f$;

    EXECUTE $f$
        CREATE OR REPLACE FUNCTION t.definer_exec (p_sql TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $b$
        BEGIN
            EXECUTE p_sql;
        END;
        $b$
    $f$;

    EXECUTE 'REVOKE ALL ON FUNCTION t.peek (TEXT, TEXT, UUID), t.error_of (TEXT), t.error_detail (TEXT), t.definer_exec (TEXT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION t.peek (TEXT, TEXT, UUID), t.error_of (TEXT), t.error_detail (TEXT), t.definer_exec (TEXT) TO authenticated';
END;
$$;

-- Tests: the field-permission fixtures, as postgres with the rules bypassed. Returns the ids by key
-- and sets test.<key> to each (transaction-local). pi_object is the Storage object's name;
-- shipment_purchase_order has no id, so shp_po has no key. elif leaves Nova Yazılım, so the fixture roles
-- are her only access.
CREATE OR REPLACE FUNCTION private.field_test_fixtures () RETURNS JSONB LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    fx JSONB;
    moesa UUID := (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD');
    europe UUID := (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe');
    nova UUID := (SELECT id FROM public.tenant WHERE display_name = 'Nova Yazılım');
    akif UUID := (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test');
    koordinator UUID := (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test');
    baris UUID := (SELECT id FROM public.user WHERE email = 'baris@moesa-panel.test');
    portal UUID := (SELECT id FROM public.user WHERE email = 'portal@moesa-panel.test');
    elif UUID := (SELECT id FROM public.user WHERE email = 'elif@moesa-panel.test');
    tho UUID;
    tho_contact UUID := gen_random_uuid();
    brand UUID := gen_random_uuid();
    acct UUID;
    wh UUID := gen_random_uuid();
    tsp UUID := gen_random_uuid();
    tsp_contact UUID := gen_random_uuid();
    secret UUID := gen_random_uuid();
    euc UUID := gen_random_uuid();
    spike_eu UUID := gen_random_uuid();
    po_draft UUID := gen_random_uuid();
    line_draft UUID := gen_random_uuid();
    po_approved UUID := gen_random_uuid();
    line_approved UUID := gen_random_uuid();
    payment UUID := gen_random_uuid();
    shp UUID := gen_random_uuid();
    shp_line UUID := gen_random_uuid();
    shp_event UUID := gen_random_uuid();
    project UUID := gen_random_uuid();
    gate UUID;
    cell UUID := gen_random_uuid();
    live_cell UUID := gen_random_uuid();
    inc UUID := gen_random_uuid();
    inc_log UUID := gen_random_uuid();
    cr UUID := gen_random_uuid();
    pi_media UUID := gen_random_uuid();
    pi_object TEXT;
    pi_doc UUID := gen_random_uuid();
    po_doc UUID := gen_random_uuid();
    spec_doc UUID := gen_random_uuid();
    supplier_media UUID := gen_random_uuid();
    t_restricted UUID := gen_random_uuid();
    t_cost UUID := gen_random_uuid();
    ops_groups TEXT[] := ARRAY['customer', 'supplier', 'product', 'purchase_order', 'shipment', 'project', 'incident',
                               'change_request', 'market_matrix', 'document', 'media', 'listing', 'audit_log'];
BEGIN
    PERFORM set_config('moesa.rules_bypass', '1', TRUE);
    -- The code triggers number in the request's tenant: baris (owner) working in MOESA LTD, the role
    -- left unset.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', baris, 'role', 'authenticated')::TEXT, TRUE);
    PERFORM set_config('request.headers', json_build_object('x-tenant-id', moesa)::TEXT, TRUE);

    -- elif: only the fixture roles below.
    DELETE FROM public.user_role ur USING public.role r WHERE r.id = ur.role_id AND ur.user_id = elif AND r.tenant_id = nova;
    DELETE FROM public.tenant_user WHERE user_id = elif AND tenant_id = nova;

    -- Customers.
    SELECT id INTO tho FROM public.customer WHERE tenant_id = moesa AND code = 'THO';
    UPDATE public.customer
    SET deposit_rate = 0.4, restricted_drive_url = 'https://drive.example/THO', notes = 'customer secret'
    WHERE id = tho;
    INSERT INTO public.customer_contact (id, tenant_id, customer_id, name, email)
    VALUES (tho_contact, moesa, tho, 'Ana Buyer', 'buyer@tho.example');
    INSERT INTO public.customer_brand (id, tenant_id, customer_id, name) VALUES (brand, moesa, tho, 'Fixture Brand');
    SELECT id INTO acct FROM public.customer_platform_account WHERE customer_id = tho AND platform_id = 'amazon';
    IF acct IS NULL THEN
        acct := gen_random_uuid();
        INSERT INTO public.customer_platform_account (id, tenant_id, customer_id, platform_id) VALUES (acct, moesa, tho, 'amazon');
    END IF;
    UPDATE public.customer_platform_account SET account_holder = 'Jane Doe', notes = 'acct secret' WHERE id = acct;
    INSERT INTO public.customer_warehouse (id, tenant_id, customer_id, display_name) VALUES (wh, moesa, tho, 'W1');
    INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
    VALUES (euc, europe, 'EUC', 'EU Customer', 'trading_partner');

    -- Supplier (TS1: a supplier code is two letters and a number).
    INSERT INTO public.supplier (id, tenant_id, code, display_name, country, deposit_rate, payment_terms, default_incoterm, notes)
    VALUES (tsp, moesa, 'TS1', 'Test Supplier', 'CN', 0.3, 'net 30', 'FOB', 'supplier secret');
    INSERT INTO public.supplier_contact (id, tenant_id, supplier_id, name, phone) VALUES (tsp_contact, moesa, tsp, 'Li Wei', '+86 100');

    -- Products.
    INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name, supplier_id, purchase_price, purchase_currency,
                                landed_cost_eur, target_price_eur, company_price_eur, supplier_product_code, notes)
    VALUES (secret, moesa, tho, 'SPIKE-SECRET', 'Spike secret', tsp, 12.5, 'USD', 14.25, 20, 25, 'SPC-1', 'secret note');
    INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name, purchase_price)
    VALUES (spike_eu, europe, euc, 'SPIKE-EU', 'Spike EU', 77.7);

    -- Purchase orders.
    INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, incoterm, deposit_rate, pi_total, pi_number, notes)
    VALUES (po_draft, moesa, tho, tsp, 'USD', 'FOB', 0.3, 1000, 'PI-T1', 'po secret'),
           (po_approved, moesa, tho, tsp, 'USD', 'FOB', 0.3, 1000, 'PI-T1', 'po secret');
    INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price, pi_line_total)
    VALUES (line_draft, moesa, po_draft, secret, 10, 12.5, 125);
    INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price)
    VALUES (line_approved, moesa, po_approved, secret, 5, 12.5);
    UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = po_approved;
    INSERT INTO public.purchase_order_payment (id, tenant_id, purchase_order_id, kind, amount, currency)
    VALUES (payment, moesa, po_approved, 'deposit', 300, 'USD');

    -- Shipment.
    INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id, incoterm_buy, notes)
    VALUES (shp, moesa, tho, 'road', wh, 'FOB', 'shipment secret');
    INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES (shp, po_approved, moesa);
    INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity)
    VALUES (shp_line, moesa, shp, po_approved, line_approved, 5);
    INSERT INTO public.shipment_event (id, tenant_id, shipment_id, from_party, to_party, note)
    VALUES (shp_event, moesa, shp, 'Test Supplier', 'Forwarder X', 'event secret');

    -- Project; its gates come with it.
    INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, notes)
    VALUES (project, moesa, tho, 'T project', 'npi', 'a_sourcing', 'project secret');
    SELECT id INTO gate FROM public.project_gate WHERE project_id = project AND code = 'G1';
    UPDATE public.project_gate SET position = 1, needs_customer_approval = FALSE, note = 'gate secret' WHERE id = gate;

    -- Market cells.
    INSERT INTO public.market_cell (id, tenant_id, product_id, platform_id, country, status, notes)
    VALUES (cell, moesa, secret, 'amazon', 'DE', 'candidate', 'cell secret'),
           (live_cell, moesa, secret, 'amazon', 'FR', 'live', NULL);

    -- Incident and change request.
    INSERT INTO public.incident (id, tenant_id, customer_id, family, severity, title, what_happened, root_cause_note, affected_parties)
    VALUES (inc, moesa, tho, 'ol', 's2', 'T', 'visible', 'rc secret', '{supplier}');
    INSERT INTO public.incident_log (id, tenant_id, incident_id, note, cost_amount, cost_currency, cost_payer)
    VALUES (inc_log, moesa, inc, 'log secret', 50, 'EUR', 'supplier');
    INSERT INTO public.change_request (id, tenant_id, customer_id, title, source, change_kinds, current_value, requested_value, reason, cost_impact, decision_note)
    VALUES (cr, moesa, tho, 'T', 'customer', '{price}', 'a', 'b', 'r', '99', 'cr secret');

    -- Files and documents.
    pi_object := moesa || '/' || pi_media || '/pi.pdf';
    INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES ('media', pi_object, '{"mimetype": "application/pdf", "size": 10}'::JSONB);
    INSERT INTO public.media (id, tenant_id, customer_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (pi_media, moesa, tho, pi_object, 'pi.pdf', 'application/pdf', 10);
    INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, media_id, notes)
    VALUES (pi_doc, moesa, tho, 'purchase_order', po_draft, 'pi', pi_media, 'doc secret');
    INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
    VALUES (po_doc, moesa, tho, 'project', project, 'po', 'https://example.test/po.pdf'),
           (spec_doc, moesa, tho, 'product', secret, 'spec_sheet', 'https://example.test/spec.pdf');
    INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES ('media', moesa || '/' || supplier_media || '/s.png', '{"mimetype": "image/png", "size": 10}'::JSONB);
    INSERT INTO public.media (id, tenant_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (supplier_media, moesa, moesa || '/' || supplier_media || '/s.png', 's.png', 'image/png', 10);
    INSERT INTO public.media_link (tenant_id, media_id, entity_type, entity_id) VALUES (moesa, supplier_media, 'supplier', tsp);

    -- t_restricted (MOESA LTD): the business permissions, no field rows.
    INSERT INTO public.role (id, tenant_id, display_name) VALUES (t_restricted, moesa, 't_restricted'), (t_cost, europe, 't_cost');
    INSERT INTO public.role_permission (role_id, permission_id)
    SELECT r.id, p.id FROM unnest(ARRAY[t_restricted, t_cost]) AS r (id) CROSS JOIN public.permission p WHERE p.group_name = ANY (ops_groups);

    -- t_cost (Europe): every cost field, and reading users' personal data.
    INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
    SELECT t_cost, f.resource_name, f.field, TRUE, TRUE FROM public.field_class f WHERE f.class = 'sensitive' AND f.group_name = 'cost'
    UNION ALL
    SELECT t_cost, 'public.user', unnest(ARRAY['user_metadata', 'email', 'phone']), TRUE, FALSE;

    INSERT INTO public.tenant_user (tenant_id, user_id) VALUES (moesa, elif), (europe, elif);
    INSERT INTO public.user_role (user_id, role_id) VALUES (elif, t_restricted), (elif, t_cost);

    PERFORM set_config('moesa.rules_bypass', '', TRUE);
    PERFORM set_config('request.jwt.claims', '', TRUE);
    PERFORM set_config('request.headers', '', TRUE);

    fx := jsonb_build_object(
        'moesa', moesa, 'europe', europe, 'nova', nova,
        'akif', akif, 'koordinator', koordinator, 'baris', baris, 'portal', portal, 'elif', elif,
        'tho', tho, 'tho_contact', tho_contact, 'brand', brand, 'acct', acct, 'wh', wh,
        'tsp', tsp, 'tsp_contact', tsp_contact, 'secret', secret, 'euc', euc, 'spike_eu', spike_eu,
        'po_draft', po_draft, 'line_draft', line_draft, 'po_approved', po_approved, 'line_approved', line_approved,
        'payment', payment, 'shp', shp, 'shp_line', shp_line, 'shp_event', shp_event,
        'project', project, 'gate', gate, 'cell', cell, 'live_cell', live_cell, 'inc', inc, 'inc_log', inc_log,
        'cr', cr, 'pi_media', pi_media, 'pi_object', pi_object, 'pi_doc', pi_doc, 'po_doc', po_doc,
        'spec_doc', spec_doc, 'supplier_media', supplier_media, 't_restricted', t_restricted, 't_cost', t_cost
    );

    PERFORM set_config('test.' || e.key, e.value, TRUE) FROM jsonb_each_text(fx) AS e;

    RETURN fx;
END;
$$;

REVOKE ALL ON FUNCTION private.impersonate_scope (UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.unimpersonate () FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_test_helpers () FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.field_test_fixtures () FROM PUBLIC, anon, authenticated;

-- A role's field rights are part of its members' access (my_access.fields): a change is broadcast
-- like one of its permissions, so open pages reload them (see private.notify_access_changed, 011).
CREATE OR REPLACE FUNCTION private.notify_access_changed () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    changed JSONB := '[]';
    users UUID[];
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT changed || coalesce(jsonb_agg(to_jsonb(n)), '[]') INTO changed FROM new_rows n;
    END IF;
    IF TG_OP IN ('DELETE', 'UPDATE') THEN
        SELECT changed || coalesce(jsonb_agg(to_jsonb(o)), '[]') INTO changed FROM old_rows o;
    END IF;

    SELECT array_agg(DISTINCT affected.user_id) INTO users
    FROM (
        -- user_role, tenant_user, tenant_owner: the user of the row.
        SELECT (r ->> 'user_id')::UUID AS user_id
        FROM jsonb_array_elements(changed) r
        WHERE r ? 'user_id'
        UNION
        -- role_permission, role_field_permission: the members holding the role...
        SELECT ur.user_id
        FROM jsonb_array_elements(changed) r
        JOIN public.user_role ur ON ur.role_id = (r ->> 'role_id')::UUID
        WHERE TG_TABLE_NAME IN ('role_permission', 'role_field_permission')
        UNION
        -- ...and every owner when it is the built-in owner role.
        SELECT o.user_id
        FROM jsonb_array_elements(changed) r
        JOIN public.role ro ON ro.id = (r ->> 'role_id')::UUID AND ro.tenant_id IS NULL AND ro.display_name = 'owner'
        CROSS JOIN public.tenant_owner o
        WHERE TG_TABLE_NAME IN ('role_permission', 'role_field_permission')
        UNION
        -- tenant: the owners above a branch opened or removed, and the tenant's own owners...
        SELECT o.user_id
        FROM jsonb_array_elements(changed) r
        JOIN public.tenant_owner o
          ON o.tenant_id = (r ->> 'id')::UUID
          OR (r ->> 'parent_id')::UUID = ANY (private.owned_tenants(o.user_id))
        WHERE TG_TABLE_NAME = 'tenant'
        UNION
        -- ...and its members (a renamed tenant).
        SELECT tu.user_id
        FROM jsonb_array_elements(changed) r
        JOIN public.tenant_user tu ON tu.tenant_id = (r ->> 'id')::UUID
        WHERE TG_TABLE_NAME = 'tenant'
        UNION
        -- subscription: the users of the company (see 013_init_subscriptions.sql)...
        SELECT cu.user_id
        FROM jsonb_array_elements(changed) r
        CROSS JOIN LATERAL private.company_users((r ->> 'tenant_id')::UUID) cu (user_id)
        WHERE TG_TABLE_NAME = 'subscription'
        UNION
        -- ...plan_module, plan_limit: those of every company on the plan.
        SELECT cu.user_id
        FROM jsonb_array_elements(changed) r
        JOIN public.subscription s ON s.plan_id = (r ->> 'plan_id')::UUID
        CROSS JOIN LATERAL private.company_users(s.tenant_id) cu (user_id)
        WHERE TG_TABLE_NAME IN ('plan_module', 'plan_limit')
    ) affected
    WHERE affected.user_id IS NOT NULL;

    -- What the transaction's later statements may use is no longer what private.tenant_scope kept.
    PERFORM set_config('access.tenant_scope', '', true);

    PERFORM realtime.send(
        jsonb_build_object('table', TG_TABLE_NAME),
        'access_changed',
        'access:' || affected,
        true
    )
    FROM unnest(users) AS affected;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER notify_access_insert AFTER INSERT ON public.role_field_permission REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed();
CREATE OR REPLACE TRIGGER notify_access_update AFTER UPDATE ON public.role_field_permission REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed();
CREATE OR REPLACE TRIGGER notify_access_delete AFTER DELETE ON public.role_field_permission REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed();
