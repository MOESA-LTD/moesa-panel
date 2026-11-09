-- 061: public.can_write_user_field, the check the `user` Edge Function makes before it writes another
-- user's personal data (email, phone, user_metadata) with the service role or the GoTrue admin API.
-- Those writes bypass the field write guard (051) on purpose, so the function must refuse on its own
-- when the caller lacks the field's write right. The answer concerns the caller only.
--
--   p_user = the caller      TRUE: a user always writes their own fields.
--   p_user = another user    TRUE if private.field_user_ids(p_field, TRUE) holds them.
--   p_user IS NULL           An account that does not exist yet (an invitation): TRUE if the caller
--                            may write the field in every tenant of the request's scope.
--
-- SECURITY DEFINER owned by api_owner: authenticated has no USAGE on schema private, api_owner does.
-- auth.uid() and the tenant scope come from the request, so the definer still answers for the caller.
CREATE OR REPLACE FUNCTION public.can_write_user_field (p_user UUID, p_field TEXT) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    scope UUID[];
    granting UUID[];
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;
    IF p_user = auth.uid() THEN
        RETURN TRUE;
    END IF;
    IF p_user IS NOT NULL THEN
        RETURN p_user = ANY (private.field_user_ids(p_field, TRUE));
    END IF;

    scope := private.tenant_scope();
    granting := private.field_write_tenants('public.user', p_field);
    RETURN coalesce(cardinality(scope), 0) > 0 AND scope <@ granting;
END;
$$;

-- Changing a function's owner needs the new owner's CREATE on its schema; api_owner keeps only USAGE.
GRANT CREATE ON SCHEMA public TO api_owner;

ALTER FUNCTION public.can_write_user_field (UUID, TEXT) OWNER TO api_owner;

REVOKE CREATE ON SCHEMA public FROM api_owner;

REVOKE ALL ON FUNCTION public.can_write_user_field (UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_write_user_field (UUID, TEXT) TO authenticated;
