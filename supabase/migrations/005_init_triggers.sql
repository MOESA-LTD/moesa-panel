-- Create or replace trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW
EXECUTE FUNCTION private.handle_new_user ();

-- Create or replace trigger for updated user
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
AFTER
UPDATE ON auth.users FOR EACH ROW
EXECUTE FUNCTION private.handle_update_user ();

-- Create or replace trigger for user deletions
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
AFTER DELETE ON auth.users FOR EACH ROW
EXECUTE FUNCTION private.handle_user_delete ();

-- Create or replace trigger to watch changes on permission
DROP TRIGGER IF EXISTS permission_trigger ON public.permission;

CREATE TRIGGER permission_trigger
AFTER INSERT
OR
UPDATE
OR DELETE ON public.permission FOR EACH ROW
EXECUTE FUNCTION private.manage_policies ();

CREATE TRIGGER before_record_insert_update BEFORE INSERT
OR
UPDATE ON public.record FOR EACH ROW
EXECUTE FUNCTION validate_record_quantity ();

-- Manage tenant owner roles
CREATE OR REPLACE FUNCTION private.assign_owner_role () RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    -- Check if the role already exists for the user
    IF NOT EXISTS (
        SELECT 1 FROM public.user_role WHERE user_id = NEW.user_id AND role_id = (SELECT id FROM public.role WHERE display_name = 'owner' AND tenant_id IS NULL)
    ) THEN
        INSERT INTO public.user_role (user_id, role_id)
        VALUES (NEW.user_id, (SELECT id FROM public.role WHERE display_name = 'owner' AND tenant_id IS NULL));
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_tenant_owners_insert
AFTER INSERT ON public.tenant_owner FOR EACH ROW
EXECUTE FUNCTION private.assign_owner_role ();

CREATE OR REPLACE FUNCTION private.revoke_owner_role () RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    DELETE FROM public.user_role 
    WHERE user_id = OLD.user_id AND role_id = (SELECT id FROM public.role WHERE display_name = 'owner' AND tenant_id IS NULL);
    
    RETURN OLD;
END;$$;

CREATE TRIGGER trigger_tenant_owners_delete
AFTER DELETE ON public.tenant_owner FOR EACH ROW
EXECUTE FUNCTION private.revoke_owner_role ();