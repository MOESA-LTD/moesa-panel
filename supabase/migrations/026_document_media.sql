-- Documents point at media (M19): a document's file is a Drive link (url), a media file
-- (media_id) or both, never neither (document_has_file). The media file replaces the unused
-- storage_path: a path string can be neither checked nor kept in its tenant, while a foreign key
-- to media (id, tenant_id) keeps the file in the document's own tenant, stops it being deleted
-- while cited, and gives the M21 migration one id to remap.
--
-- document.media_id  The document's file in the media library, in the document's tenant
--                    (document_media_fkey, ON DELETE RESTRICT: documents are never deleted, and
--                    the file they cite stays). A customer's file (media.customer_id) is only that
--                    customer's document; a file without a customer is anyone's
--                    (private.document_check_media).
--
-- Task 3's guards on media now count documents too: a file a document cites is not deleted
-- (private.media_guard_delete) and keeps its customer (private.media_customer_lock).
--
-- media_library  Gains document_count, the documents the caller may read that cite the file.
--
-- document_check_media is SECURITY DEFINER, so it filters on the document's tenant itself: the
-- file must be in the document's own tenant whatever media the caller may read (no citing, or
-- probing for, another tenant's file).
--
-- Each rule is a violation whose message is the rule's code:
--   media_missing            (foreign_key_violation) no such file in the document's tenant
--   media_customer_mismatch  (check_violation) a customer's file on another's document
--   media_in_use             (foreign_key_violation) deleting a linked or cited file
--   media_customer_locked    (check_violation) a linked or cited file's customer changed

ALTER TABLE public.document
ADD COLUMN media_id UUID;

ALTER TABLE public.document
ADD CONSTRAINT document_media_fkey FOREIGN KEY (media_id, tenant_id) REFERENCES public.media (id, tenant_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_document_media ON public.document (tenant_id, media_id);

-- Same name, so the app's NAMED_ERRORS entry for document_has_file keeps working.
ALTER TABLE public.document
DROP CONSTRAINT document_has_file;

ALTER TABLE public.document
DROP COLUMN storage_path;

ALTER TABLE public.document
ADD CONSTRAINT document_has_file CHECK (
   url IS NOT NULL
   OR media_id IS NOT NULL
);

-- The file must be in the document's tenant, and a customer's file is only that customer's.
CREATE OR REPLACE FUNCTION private.document_check_media () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    file public.media;
BEGIN
    IF NEW.media_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT m.* INTO file FROM public.media m WHERE m.id = NEW.media_id AND m.tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'media_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF file.customer_id IS NOT NULL AND file.customer_id IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'media_customer_mismatch' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER document_check_media BEFORE INSERT
OR
UPDATE OF media_id,
customer_id ON public.document FOR EACH ROW
EXECUTE FUNCTION private.document_check_media ();

-- A linked or cited file is not deleted. SECURITY DEFINER: every link and document counts,
-- whatever the caller may read.
CREATE OR REPLACE FUNCTION private.media_guard_delete () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- The tenant is being deleted: its media goes with it.
    IF NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF EXISTS (SELECT 1 FROM public.media_link l WHERE l.tenant_id = OLD.tenant_id AND l.media_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.document d WHERE d.tenant_id = OLD.tenant_id AND d.media_id = OLD.id) THEN
        RAISE EXCEPTION 'media_in_use' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN OLD;
END;
$$;

-- A linked or cited file keeps its customer, which its links and documents were checked against.
CREATE OR REPLACE FUNCTION private.media_customer_lock () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       AND (EXISTS (SELECT 1 FROM public.media_link l WHERE l.tenant_id = OLD.tenant_id AND l.media_id = OLD.id)
            OR EXISTS (SELECT 1 FROM public.document d WHERE d.tenant_id = OLD.tenant_id AND d.media_id = OLD.id)) THEN
        RAISE EXCEPTION 'media_customer_locked' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.document_check_media () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.media_guard_delete () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.media_customer_lock () FROM PUBLIC, anon, authenticated;

-- The library: each file, what kind it is, the links and the documents the caller may read.
-- Recreated with document_count appended (m.* keeps the media columns of 025).
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
   l.linked_entities,
   d.document_count
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
   ) l
   CROSS JOIN LATERAL (
      SELECT
         count(*)::INT AS document_count
      FROM
         public.document doc
      WHERE
         doc.media_id = m.id
         AND doc.tenant_id = m.tenant_id
   ) d;

COMMENT ON VIEW public.media_library IS 'Every media column plus its kind (image, pdf or video), the links the caller may read (their count, the distinct record types and the records as entity_type:entity_id) and the number of documents the caller may read that cite the file. Read by the media library.';

GRANT SELECT ON public.media_library TO authenticated;
