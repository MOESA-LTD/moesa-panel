-- 057: masked api views for the core, files and catalog tables, personal data of users (S5), the
-- read-only catalog views (S7) and the computed fields the app selects on the api views.
SELECT private.enable_field_security (t)
FROM unnest(ARRAY['document', 'media', 'media_link', 'transfer', 'setting', 'tenant', 'tenant_user', 'tenant_owner', 'user',
                  'role', 'user_role', 'role_permission', 'permission', 'module', 'plan', 'plan_limit', 'plan_module',
                  'platform', 'subscription', 'task_template', 'amazon_product_type_definition', 'code_sequence']) AS t;

SELECT private.enable_field_security (t, TRUE)
FROM unnest(ARRAY['role_field_permission', 'field_class', 'field_group']) AS t;

-- api.document now exists: the R4 relationships to it (contract_document, pi_document and their
-- reverses) are created by re-running the generator for their owners.
SELECT private.enable_field_security (t)
FROM unnest(ARRAY['customer', 'purchase_order']) AS t;

-- Computed fields. Each wraps the public function of the same name, which stays the single place of
-- the rule and already limits itself to the caller (owned_via by private.scope_and_above(),
-- managed_in by private.tenant_scope(), status is a pure function of the subscription's own dates).
-- The wrappers are definer only to read the base row by id; they return nothing but what the public
-- function returns, and the id comes from an api row the caller could already see.
CREATE OR REPLACE FUNCTION api.owned_via (api.user) RETURNS TEXT[] LANGUAGE sql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
    SELECT public.owned_via (u) FROM public.user u WHERE u.id = $1.id
$$;

CREATE OR REPLACE FUNCTION api.managed_in (api.user) RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
    SELECT public.managed_in (u) FROM public.user u WHERE u.id = $1.id
$$;

CREATE OR REPLACE FUNCTION api.status (api.subscription) RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
    SELECT public.status (s) FROM public.subscription s WHERE s.id = $1.id
$$;

-- Changing a function's owner needs the new owner's CREATE on its schema (as in 053).
GRANT CREATE ON SCHEMA api TO api_owner;

ALTER FUNCTION api.owned_via (api.user) OWNER TO api_owner;

ALTER FUNCTION api.managed_in (api.user) OWNER TO api_owner;

ALTER FUNCTION api.status (api.subscription) OWNER TO api_owner;

REVOKE CREATE ON SCHEMA api FROM api_owner;

REVOKE ALL ON FUNCTION api.owned_via (api.user) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION api.managed_in (api.user) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION api.status (api.subscription) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION api.owned_via (api.user) TO authenticated;

GRANT EXECUTE ON FUNCTION api.managed_in (api.user) TO authenticated;

GRANT EXECUTE ON FUNCTION api.status (api.subscription) TO authenticated;
