-- Documents: the evidence every business record (customer, supplier, product, project, gate and the
-- Phase 2 purchase orders, shipments and incidents) is backed by. A document belongs to one record
-- (entity_type, entity_id) and is versioned per type: a new version supersedes the older ones.
--
-- entity_id is checked by a trigger rather than a foreign key, since it points into a different
-- table per entity_type. A table that does not exist yet (Phase 2) lets any id through; once it
-- exists, the row must. customer_id (whose customer the document concerns, for the customer's
-- document list) has no foreign key yet: public.customer arrives later and adds it.
--
-- Documents are records of what was sent and signed, so they are never deleted: there is no delete
-- permission, and DELETE is revoked so an attempt fails instead of silently removing nothing.
--
-- document_check_entity and document_supersede are SECURITY DEFINER: the check must find a row the
-- caller's RLS hides on the target table (the document's own tenant policies still apply), and
-- superseding older versions is part of adding a version, so it must not depend on the caller's
-- right to update documents.

CREATE TYPE public.document_type AS ENUM (
   'spec_sheet',
   'tech_pack',
   'sample_report',
   'pi',
   'po',
   'psi_report',
   'test_report',
   'sds',
   'doc_of_conformity',
   'technical_file',
   'label_artwork',
   'packing_list',
   'commercial_invoice',
   'bill_of_lading',
   'customs',
   'delivery_receipt',
   'gate_approval',
   'change_request',
   'contract',
   'certificate',
   'other'
);

CREATE TYPE public.document_status AS ENUM ('draft', 'signed', 'approved', 'superseded');

CREATE TYPE public.document_entity AS ENUM (
   'customer',
   'supplier',
   'product',
   'project',
   'project_gate',
   'purchase_order',
   'shipment',
   'incident'
);

CREATE TABLE IF NOT EXISTS public.document (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID,
   entity_type public.document_entity NOT NULL,
   entity_id UUID NOT NULL,
   type public.document_type NOT NULL,
   version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
   issued_on DATE,
   status public.document_status NOT NULL DEFAULT 'draft',
   url TEXT,
   storage_path TEXT,
   file_name TEXT,
   sent_from_official_email BOOLEAN NOT NULL DEFAULT FALSE,
   is_signed BOOLEAN NOT NULL DEFAULT FALSE,
   is_stamped BOOLEAN NOT NULL DEFAULT FALSE,
   notes TEXT,
   created_by UUID DEFAULT auth.uid (),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT unique_document_version UNIQUE (entity_type, entity_id, type, version),
   CONSTRAINT document_has_file CHECK (url IS NOT NULL OR storage_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_document_entity ON public.document (tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_document_customer ON public.document (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_document_type_status ON public.document (tenant_id, type, status);

REVOKE DELETE ON public.document FROM anon, authenticated;

-- Generic: keeps updated_at current; later tables use it too.
CREATE OR REPLACE FUNCTION private.set_updated_at () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.document FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The record a document belongs to must exist, once its table does.
CREATE OR REPLACE FUNCTION private.document_check_entity () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    found BOOLEAN;
BEGIN
    IF to_regclass('public.' || NEW.entity_type::TEXT) IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', NEW.entity_type::TEXT)
    INTO found
    USING NEW.entity_id;

    IF NOT found THEN
        RAISE EXCEPTION 'document_entity_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER document_check_entity BEFORE INSERT
OR
UPDATE ON public.document FOR EACH ROW
EXECUTE FUNCTION private.document_check_entity ();

-- Signed means signed, stamped, sent from the official e-mail and dated.
CREATE OR REPLACE FUNCTION private.document_signed_requires () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF NEW.status = 'signed'
       AND NOT (NEW.is_signed AND NEW.is_stamped AND NEW.sent_from_official_email AND NEW.issued_on IS NOT NULL) THEN
        RAISE EXCEPTION 'document_signed_incomplete' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER document_signed_requires BEFORE INSERT
OR
UPDATE ON public.document FOR EACH ROW
EXECUTE FUNCTION private.document_signed_requires ();

-- A new version supersedes the older versions of the same document.
CREATE OR REPLACE FUNCTION private.document_supersede () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    UPDATE public.document
    SET status = 'superseded'
    WHERE entity_type = NEW.entity_type
      AND entity_id = NEW.entity_id
      AND type = NEW.type
      AND version < NEW.version
      AND status <> 'superseded';
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER document_supersede
AFTER INSERT ON public.document FOR EACH ROW
EXECUTE FUNCTION private.document_supersede ();

REVOKE ALL ON FUNCTION private.set_updated_at () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.document_check_entity () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.document_signed_requires () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.document_supersede () FROM PUBLIC, anon, authenticated;

SELECT
   private.enable_tenant_level_security ('document');

SELECT
   private.audit_enable ('public.document'::REGCLASS);

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete: documents are kept.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.document', 'document', 'select', 'read', FALSE, FALSE, NULL),
   ('public.document', 'document', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.document', 'document', 'update', 'modify', FALSE, TRUE, NULL)
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
   AND p.resource_name = 'public.document'
ON CONFLICT DO NOTHING;
