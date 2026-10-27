-- What the app needs to know about the signed-in user's access, and a signal when it changes.
-- RLS reads access from the tables on every request (private.permissions, private.tenant_id); the
-- app reads the same through my_access and reloads it when told that it changed.

-- The user's tenants as a tree (parent_id), each with the permissions the user has in it and
-- whether they own it, and the active tenant. The active tenant is `requested` when the user may
-- use it, else the one of the request (x-tenant-id header or the token's current tenant), else the
-- first of their tenants. `permissions` repeats the active tenant's.
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
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.my_access (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.my_access (UUID) TO authenticated;

-- Tells the affected users that their access changed: a broadcast on their private topic
-- `access:<user id>`, sent when the transaction commits. The app then reloads my_access.
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
        -- role_permission: the members holding the role...
        SELECT ur.user_id
        FROM jsonb_array_elements(changed) r
        JOIN public.user_role ur ON ur.role_id = (r ->> 'role_id')::UUID
        WHERE TG_TABLE_NAME = 'role_permission'
        UNION
        -- ...and every owner when it is the built-in owner role.
        SELECT o.user_id
        FROM jsonb_array_elements(changed) r
        JOIN public.role ro ON ro.id = (r ->> 'role_id')::UUID AND ro.tenant_id IS NULL AND ro.display_name = 'owner'
        CROSS JOIN public.tenant_owner o
        WHERE TG_TABLE_NAME = 'role_permission'
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

DO $$
DECLARE
    target TEXT;
BEGIN
    FOREACH target IN ARRAY ARRAY['user_role', 'role_permission', 'tenant_user', 'tenant_owner'] LOOP
        EXECUTE format('CREATE OR REPLACE TRIGGER notify_access_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()', target);
        EXECUTE format('CREATE OR REPLACE TRIGGER notify_access_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()', target);
        EXECUTE format('CREATE OR REPLACE TRIGGER notify_access_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()', target);
    END LOOP;
END;
$$;

-- Each user receives the broadcasts on their own access topic only.
DROP POLICY IF EXISTS receive_own_access_changes ON realtime.messages;

CREATE POLICY receive_own_access_changes ON realtime.messages FOR
SELECT
   TO authenticated USING (
      realtime.messages.extension = 'broadcast'
      AND (
         SELECT
            realtime.topic ()
      ) = 'access:' || (
         SELECT
            auth.uid ()
      )::TEXT
   );
