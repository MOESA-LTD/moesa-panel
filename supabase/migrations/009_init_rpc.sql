-- Writes that span several tables, each in one transaction: either all of it is saved or nothing.
--
-- SECURITY INVOKER: they run as the caller, so RLS and the permission policies apply exactly as
-- for direct table writes. A new row's tenant_id comes from the caller like any table insert, and
-- the tenant policies check it.
--
-- Link tables are synced by writing only the links that changed, so the audit log shows what was
-- added or removed.

-- A product and its categories.
CREATE OR REPLACE FUNCTION public.save_product (product_data JSONB, category_ids UUID[] DEFAULT '{}') RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER
SET
    search_path = '' AS $$
DECLARE
    saved_id UUID := (product_data ->> 'id')::UUID;
BEGIN
    IF saved_id IS NULL THEN
        INSERT INTO public.product (tenant_id, display_name, brand, details)
        VALUES ((product_data ->> 'tenant_id')::UUID, product_data ->> 'display_name', product_data ->> 'brand', product_data ->> 'details')
        RETURNING id INTO saved_id;
    ELSE
        UPDATE public.product
        SET display_name = product_data ->> 'display_name', brand = product_data ->> 'brand', details = product_data ->> 'details'
        WHERE id = saved_id;

        IF NOT FOUND THEN
            -- PostgREST's own error format, so the client gets a 404 rather than a 500.
            RAISE SQLSTATE 'PGRST' USING
                MESSAGE = json_build_object('code', 'P0002', 'message', 'product not found')::TEXT,
                DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
        END IF;
    END IF;

    DELETE FROM public.product_categories
    WHERE product_id = saved_id AND NOT (category_id = ANY (category_ids));

    INSERT INTO public.product_categories (product_id, category_id)
    SELECT saved_id, item.id
    FROM unnest(category_ids) AS item (id)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.product_categories pc WHERE pc.product_id = saved_id AND pc.category_id = item.id
    );

    RETURN saved_id;
END;
$$;

-- A role and its permissions.
CREATE OR REPLACE FUNCTION public.save_role (role_data JSONB, permission_ids UUID[] DEFAULT '{}') RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER
SET
    search_path = '' AS $$
DECLARE
    saved_id UUID := (role_data ->> 'id')::UUID;
BEGIN
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

    RETURN saved_id;
END;
$$;

-- The addresses linked to a client.
CREATE OR REPLACE FUNCTION public.set_client_addresses (client_id UUID, address_ids UUID[] DEFAULT '{}') RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER
SET
    search_path = '' AS $$
BEGIN
    DELETE FROM public.client_address ca
    WHERE ca.client_id = set_client_addresses.client_id AND NOT (ca.address_id = ANY (address_ids));

    INSERT INTO public.client_address (client_id, address_id)
    SELECT set_client_addresses.client_id, item.id
    FROM unnest(address_ids) AS item (id)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.client_address ca
        WHERE ca.client_id = set_client_addresses.client_id AND ca.address_id = item.id
    );
END;
$$;

-- A member's roles in the current tenant. user_role has no tenant of its own, so only the roles
-- the caller can see (RLS: shared roles and the current tenant's) are replaced; the member's roles
-- in other tenants are left alone.
CREATE OR REPLACE FUNCTION public.set_user_roles (user_id UUID, role_ids UUID[] DEFAULT '{}') RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER
SET
    search_path = '' AS $$
DECLARE
    removed UUID[];
BEGIN
    -- Collected first: the delete policy raises an error (rather than skipping) for rows it does
    -- not allow, so the delete must only see the rows that are meant to go.
    SELECT array_agg(ur.role_id) INTO removed
    FROM public.user_role ur
    JOIN public.role r ON r.id = ur.role_id
    WHERE ur.user_id = set_user_roles.user_id AND NOT (ur.role_id = ANY (role_ids));

    DELETE FROM public.user_role ur
    WHERE ur.user_id = set_user_roles.user_id AND ur.role_id = ANY (removed);

    INSERT INTO public.user_role (user_id, role_id)
    SELECT set_user_roles.user_id, item.id
    FROM unnest(role_ids) AS item (id)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.user_role ur WHERE ur.user_id = set_user_roles.user_id AND ur.role_id = item.id
    );
END;
$$;

-- A new company with its first user as owner and member (registration). The user is created
-- through the Auth API first, which a database transaction cannot include; the create-account
-- function deletes that user again when this fails.
CREATE OR REPLACE FUNCTION public.register_tenant (owner_id UUID, company JSONB) RETURNS public.tenant LANGUAGE plpgsql SECURITY INVOKER
SET
    search_path = '' AS $$
DECLARE
    created public.tenant;
BEGIN
    INSERT INTO public.tenant (display_name, email, phone)
    VALUES (company ->> 'display_name', company ->> 'email', NULLIF(company ->> 'phone', ''))
    RETURNING * INTO created;

    INSERT INTO public.tenant_owner (tenant_id, user_id) VALUES (created.id, owner_id);
    INSERT INTO public.tenant_user (tenant_id, user_id) VALUES (created.id, owner_id);

    RETURN created;
END;
$$;

-- Registration runs with the service role only (from the create-account edge function).
REVOKE ALL ON FUNCTION public.register_tenant (UUID, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_tenant (UUID, JSONB) TO service_role;
