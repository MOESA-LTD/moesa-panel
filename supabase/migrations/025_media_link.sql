-- Media links (M19): which records a media file shows on, and in what role. A file may be linked to
-- many records and a record may have many files; one link per file and record, the role being an
-- attribute of the link.
--
-- media_link  A file on a record (entity_type, entity_id), the same list of linkable records as
--             document (public.document_entity), so a Phase 2 table is added to it once. The role
--             is primary_image, gallery, evidence_photo or attachment, ordered by position.
--             entity_id is checked by a trigger rather than a foreign key, as for documents, but
--             stricter: a table that does not exist yet (Phase 2) is refused.
--
-- A record has at most one primary image (the partial unique index media_link_one_primary).
-- Making a link primary, by insert or update, first demotes the record's current primary to
-- gallery (private.media_link_demote_primary), so neither raises on the index, which stays as the
-- backstop; public.set_primary_media is that update for the app. Only an image is primary.
--
-- Changing a record's media needs the right to change the record (the tenant-logo rule): adding,
-- changing or removing a link checks the update permission on the record's table in the link's
-- tenant. A file of a customer (media.customer_id) goes only to that customer's records (the
-- customer itself, its products, projects and their gates; private.entity_customer); a file
-- without a customer goes anywhere. A link never moves to another file, record or tenant: a new
-- one is added instead. While a file is linked its customer stays, and it is not deleted
-- (private.media_guard_delete); deleting media is management's (024_media.sql).
--
-- media_library          Every media column plus its kind (image, pdf, video) and links, for the
--                        library page.
-- product_with_evidence  Gains primary_image_path, the product's primary image (its thumbnail
--                        when it has one), for the product list.
--
-- The triggers are SECURITY DEFINER, so they filter on the link's tenant themselves: the record
-- must be in the link's own tenant (no linking to, or probing for, another tenant's rows), and the
-- guards see every link whatever the caller may read. When the tenant itself is being deleted
-- (delete_branch), its links and media go with it unchecked.
--
-- Each rule is a violation whose message is the rule's code:
--   media_link_identity_immutable  (check_violation) a link's file, record or tenant changed
--   media_link_entity_missing      (foreign_key_violation) the record (or its table) is not there
--                                  in the link's tenant, or set_primary_media got an unseen link
--   media_link_forbidden           (insufficient_privilege) no update right on the record
--   media_customer_mismatch        (check_violation) a customer's file on another's record
--   media_primary_not_image        (check_violation) a primary image that is not an image
--   media_in_use                   (foreign_key_violation) deleting a linked file
--   media_customer_locked          (check_violation) a linked file's customer changed

CREATE TYPE public.media_role AS ENUM ('primary_image', 'gallery', 'evidence_photo', 'attachment');

CREATE TABLE IF NOT EXISTS public.media_link (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   media_id UUID NOT NULL,
   entity_type public.document_entity NOT NULL,
   entity_id UUID NOT NULL,
   role public.media_role NOT NULL DEFAULT 'gallery',
   position INT NOT NULL DEFAULT 0,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT media_link_media_fkey FOREIGN KEY (media_id, tenant_id) REFERENCES public.media (id, tenant_id) ON DELETE RESTRICT,
   -- One link per file and record.
   CONSTRAINT unique_media_link UNIQUE (tenant_id, media_id, entity_type, entity_id)
);

-- One primary image per record.
CREATE UNIQUE INDEX IF NOT EXISTS media_link_one_primary ON public.media_link (tenant_id, entity_type, entity_id)
WHERE
   role = 'primary_image';

CREATE INDEX IF NOT EXISTS idx_media_link_entity ON public.media_link (tenant_id, entity_type, entity_id);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.media_link FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The customer a record concerns: a customer itself; a product's or project's customer; a gate's
-- project's customer. NULL for any other record (suppliers, and the Phase 2 tables until they
-- are added here).
CREATE OR REPLACE FUNCTION private.entity_customer (entity_type public.document_entity, entity_id UUID, tenant_id UUID) RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    CASE entity_customer.entity_type
        WHEN 'customer' THEN
            RETURN entity_customer.entity_id;
        WHEN 'product' THEN
            RETURN (SELECT p.customer_id FROM public.product p
                    WHERE p.id = entity_customer.entity_id AND p.tenant_id = entity_customer.tenant_id);
        WHEN 'project' THEN
            RETURN (SELECT p.customer_id FROM public.project p
                    WHERE p.id = entity_customer.entity_id AND p.tenant_id = entity_customer.tenant_id);
        WHEN 'project_gate' THEN
            RETURN (SELECT p.customer_id
                    FROM public.project_gate g
                    JOIN public.project p ON p.id = g.project_id AND p.tenant_id = g.tenant_id
                    WHERE g.id = entity_customer.entity_id AND g.tenant_id = entity_customer.tenant_id);
        ELSE
            RETURN NULL;
    END CASE;
END;
$$;

-- The rules of a link (see the header), in order: identity, record, right, customer, image.
CREATE OR REPLACE FUNCTION private.media_link_check () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    link public.media_link := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    found BOOLEAN;
    file public.media;
BEGIN
    -- The tenant is being deleted: its links go with it.
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE'
       AND (NEW.media_id IS DISTINCT FROM OLD.media_id
            OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
            OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
            OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
        RAISE EXCEPTION 'media_link_identity_immutable' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF to_regclass('public.' || NEW.entity_type::TEXT) IS NULL THEN
            RAISE EXCEPTION 'media_link_entity_missing' USING ERRCODE = 'foreign_key_violation';
        END IF;

        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND tenant_id = $2)', NEW.entity_type::TEXT)
        INTO found
        USING NEW.entity_id, NEW.tenant_id;

        IF NOT found THEN
            RAISE EXCEPTION 'media_link_entity_missing' USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    IF auth.uid() IS NOT NULL
       AND cardinality(private.tenants_permitting(auth.uid(), ARRAY[link.tenant_id], 'public.' || link.entity_type::TEXT, 'update')) = 0 THEN
        RAISE EXCEPTION 'media_link_forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    SELECT m.* INTO file FROM public.media m WHERE m.id = NEW.media_id AND m.tenant_id = NEW.tenant_id;

    -- No such file: the foreign key refuses it.
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF file.customer_id IS NOT NULL
       AND private.entity_customer(NEW.entity_type, NEW.entity_id, NEW.tenant_id) IS DISTINCT FROM file.customer_id THEN
        RAISE EXCEPTION 'media_customer_mismatch' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.role = 'primary_image' AND file.mime_type NOT LIKE 'image/%' THEN
        RAISE EXCEPTION 'media_primary_not_image' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER media_link_check BEFORE INSERT
OR
UPDATE
OR DELETE ON public.media_link FOR EACH ROW
EXECUTE FUNCTION private.media_link_check ();

-- A new primary image demotes the record's current one to gallery. Fires after media_link_check
-- (triggers fire in name order), so only a link that passed the rules demotes another. SECURITY
-- DEFINER: the demotion is part of the change the caller may make, whatever their right to update
-- links; it touches only the same tenant's record.
CREATE OR REPLACE FUNCTION private.media_link_demote_primary () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF NEW.role = 'primary_image' THEN
        UPDATE public.media_link
        SET role = 'gallery'
        WHERE tenant_id = NEW.tenant_id
          AND entity_type = NEW.entity_type
          AND entity_id = NEW.entity_id
          AND role = 'primary_image'
          AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER media_link_demote_primary BEFORE INSERT
OR
UPDATE OF role ON public.media_link FOR EACH ROW
EXECUTE FUNCTION private.media_link_demote_primary ();

-- A linked file is not deleted (Task 4 adds the documents that cite it). SECURITY DEFINER: every
-- link counts, whatever the caller may read.
CREATE OR REPLACE FUNCTION private.media_guard_delete () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- The tenant is being deleted: its media goes with it.
    IF NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF EXISTS (SELECT 1 FROM public.media_link l WHERE l.tenant_id = OLD.tenant_id AND l.media_id = OLD.id) THEN
        RAISE EXCEPTION 'media_in_use' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER media_guard_delete BEFORE DELETE ON public.media FOR EACH ROW
EXECUTE FUNCTION private.media_guard_delete ();

-- A linked file keeps its customer, which its links were checked against (Task 4 adds the
-- documents that cite it).
CREATE OR REPLACE FUNCTION private.media_customer_lock () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       AND EXISTS (SELECT 1 FROM public.media_link l WHERE l.tenant_id = OLD.tenant_id AND l.media_id = OLD.id) THEN
        RAISE EXCEPTION 'media_customer_locked' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER media_customer_lock BEFORE
UPDATE OF customer_id ON public.media FOR EACH ROW
EXECUTE FUNCTION private.media_customer_lock ();

-- Makes a link its record's primary image; the record's current primary becomes gallery (in the
-- same statement, by private.media_link_demote_primary). As the caller: they must see the link
-- and may change it.
CREATE OR REPLACE FUNCTION public.set_primary_media (link_id UUID) RETURNS public.media_link LANGUAGE plpgsql SECURITY INVOKER
SET
   search_path = '' AS $$
DECLARE
    link public.media_link;
BEGIN
    UPDATE public.media_link l
    SET role = 'primary_image'
    WHERE l.id = set_primary_media.link_id
    RETURNING l.* INTO link;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'media_link_entity_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN link;
END;
$$;

REVOKE ALL ON FUNCTION private.entity_customer (public.document_entity, UUID, UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.media_link_check () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.media_link_demote_primary () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.media_guard_delete () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.media_customer_lock () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_primary_media (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_primary_media (UUID) TO authenticated;

-- The library: each file, what kind it is, and the links the caller may read.
CREATE OR REPLACE VIEW public.media_library
WITH
   (security_invoker = TRUE) AS
SELECT
   m.*,
   CASE
      WHEN m.mime_type LIKE 'image/%' THEN 'image'
      WHEN m.mime_type = 'application/pdf' THEN 'pdf'
      ELSE 'video'
   END AS kind,
   l.link_count,
   l.linked_types,
   l.linked_entities
FROM
   public.media m
   CROSS JOIN LATERAL (
      SELECT
         count(*)::INT AS link_count,
         coalesce(array_agg(DISTINCT ml.entity_type), '{}') AS linked_types,
         coalesce(array_agg(ml.entity_type::TEXT || ':' || ml.entity_id::TEXT), '{}') AS linked_entities
      FROM
         public.media_link ml
      WHERE
         ml.media_id = m.id
         AND ml.tenant_id = m.tenant_id
   ) l;

COMMENT ON VIEW public.media_library IS 'Every media column plus its kind (image, pdf or video) and the links the caller may read: their count, the distinct record types and the records as entity_type:entity_id. Read by the media library.';

GRANT SELECT ON public.media_library TO authenticated;

-- The product list: the product, its evidence and its primary image, as the caller may read them.
CREATE OR REPLACE VIEW public.product_with_evidence
WITH
   (security_invoker = TRUE) AS
SELECT
   p.*,
   e.has_signed_spec,
   e.spec_version,
   e.compliance_complete,
   coalesce(m.thumbnail_path, m.storage_path) AS primary_image_path
FROM
   public.product p
   LEFT JOIN public.product_evidence e ON e.product_id = p.id
   LEFT JOIN public.media_link ml ON ml.tenant_id = p.tenant_id
   AND ml.entity_type = 'product'
   AND ml.entity_id = p.id
   AND ml.role = 'primary_image'
   LEFT JOIN public.media m ON m.id = ml.media_id
   AND m.tenant_id = ml.tenant_id;

COMMENT ON VIEW public.product_with_evidence IS 'Every product column plus its evidence (public.product_evidence): whether it has a signed or approved spec sheet, the highest such version, and whether its compliance is complete; and the storage path of its primary image (the thumbnail when there is one), NULL when it has none or the caller cannot read media. Read by the product list, which filters on has_signed_spec.';

GRANT SELECT ON public.product_with_evidence TO authenticated;

SELECT
   private.enable_tenant_level_security ('media_link');

SELECT
   private.audit_enable ('public.media_link'::REGCLASS);

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies).
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.media_link', 'media', 'select', 'read', FALSE, FALSE, NULL),
   ('public.media_link', 'media', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.media_link', 'media', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.media_link', 'media', 'delete', 'modify', FALSE, TRUE, NULL)
ON CONFLICT ON CONSTRAINT unique_permission_resource_command DO NOTHING;

-- The built-in owner role has every permission (see 008_init_reference_data.sql).
INSERT INTO
   public.role_permission (role_id, permission_id)
SELECT
   r.id,
   p.id
FROM
   public.role r,
   public.permission p
WHERE
   r.display_name = 'owner'
   AND r.tenant_id IS NULL
   AND p.resource_name = 'public.media_link'
ON CONFLICT DO NOTHING;
