-- Branches: tenants under a tenant (tenant.parent_id), any number of levels deep. The owners of a
-- tenant own every branch below it (private.owned_tenants) and open or remove branches under it.

CREATE INDEX IF NOT EXISTS idx_tenant_parent_id ON public.tenant (parent_id);

-- A tenant cannot be placed under itself or under one of its own branches.
CREATE OR REPLACE FUNCTION private.prevent_tenant_cycle () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        WITH RECURSIVE ancestors (id, parent_id) AS (
            SELECT t.id, t.parent_id FROM public.tenant t WHERE t.id = NEW.parent_id
            UNION
            SELECT t.id, t.parent_id FROM public.tenant t JOIN ancestors a ON t.id = a.parent_id
        )
        SELECT 1 FROM ancestors WHERE ancestors.id = NEW.id
    ) THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'branch_cycle')::TEXT,
            DETAIL = json_build_object('status', 409, 'headers', json_build_object())::TEXT;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER prevent_tenant_cycle BEFORE INSERT
OR
UPDATE OF parent_id ON public.tenant FOR EACH ROW
EXECUTE FUNCTION private.prevent_tenant_cycle ();

-- Opens a branch under `parent_id`; only its owners (including owners of the tenants above) may.
-- The branch's owners are the parent's, through the tree; others are invited to it.
CREATE OR REPLACE FUNCTION public.create_branch (parent_id UUID, branch JSONB) RETURNS public.tenant LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    created public.tenant;
BEGIN
    IF NOT (create_branch.parent_id = ANY (private.owned_tenants(auth.uid())) OR private.check_super_admin()) THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'branch_owner_required')::TEXT,
            DETAIL = json_build_object('status', 403, 'headers', json_build_object())::TEXT;
    END IF;

    INSERT INTO public.tenant (display_name, email, phone, parent_id)
    VALUES (
        branch ->> 'display_name',
        nullif(branch ->> 'email', ''),
        nullif(branch ->> 'phone', ''),
        create_branch.parent_id
    )
    RETURNING * INTO created;

    RETURN created;
END;
$$;

-- Removes a branch with everything in it. Only a branch without branches of its own, and only by
-- the owners of the tenant above it; a top-level tenant (a company) is not removed this way.
CREATE OR REPLACE FUNCTION public.delete_branch (branch_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    target public.tenant;
BEGIN
    SELECT * INTO target FROM public.tenant t WHERE t.id = branch_id;

    IF NOT FOUND OR target.parent_id IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0002', 'message', 'branch_not_found')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
    END IF;

    IF NOT (target.parent_id = ANY (private.owned_tenants(auth.uid())) OR private.check_super_admin()) THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'branch_owner_required')::TEXT,
            DETAIL = json_build_object('status', 403, 'headers', json_build_object())::TEXT;
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenant t WHERE t.parent_id = branch_id) THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'branch_has_branches')::TEXT,
            DETAIL = json_build_object('status', 409, 'headers', json_build_object())::TEXT;
    END IF;

    DELETE FROM public.tenant t WHERE t.id = branch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_branch (UUID, JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.delete_branch (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_branch (UUID, JSONB) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_branch (UUID) TO authenticated;

-- Opening or removing a branch changes what the owners above it may use.
DO $$
BEGIN
    EXECUTE 'CREATE OR REPLACE TRIGGER notify_access_insert AFTER INSERT ON public.tenant REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()';
    EXECUTE 'CREATE OR REPLACE TRIGGER notify_access_update AFTER UPDATE ON public.tenant REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()';
    EXECUTE 'CREATE OR REPLACE TRIGGER notify_access_delete AFTER DELETE ON public.tenant REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION private.notify_access_changed()';
END;
$$;
