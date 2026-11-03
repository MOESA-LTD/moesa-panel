-- Customers (M1): the sellers the tenant runs operations for. Every customer-scoped table
-- (product, project, …) refers to a customer, and the customer filter narrows the lists to one.
--
-- customer                   Its code (three capital letters, e.g. THO) is unique per tenant, names
--                            its documents and numbers its business codes (public.next_code), so it
--                            never changes once given. Customers are closed (status), never
--                            deleted: there is no delete permission.
-- customer_contact           The customer's people, and who of them may approve.
-- customer_warehouse         Where goods are delivered: the customer's own, a third party's or FBA.
-- customer_platform_account  The marketplaces (public.platform) the customer sells on, and whether
--                            the tenant has an authorized user there. No passwords or tokens are
--                            kept.
-- customer_brand             The customer's brands and their registration status.
-- The child rows are removed with their customer.
--
-- Now that public.customer exists, documents with entity_type 'customer' are checked against it
-- (private.document_check_entity, 016_documents.sql), and document.customer_id gets its foreign key.
--
-- Project rule for every child→parent reference between tenant-scoped tables: the foreign key
-- includes tenant_id (parent UNIQUE (id, tenant_id), child FOREIGN KEY (parent_id, tenant_id)).
-- Referential checks bypass RLS, so a plain FK on the id alone would let a row point at another
-- tenant's parent (and probe which ids exist there), and that tenant's deletes would cascade into
-- this tenant's rows. Customers and documents are never deleted, so the references to them that
-- are not ownership (customer.contract_document_id, document.customer_id) are ON DELETE RESTRICT:
-- ON DELETE SET NULL on a composite key would null tenant_id as well.

CREATE TYPE public.commercial_model AS ENUM ('trading_partner', 'commercial_representative', 'operations_partner');

CREATE TYPE public.customer_status AS ENUM ('lead', 'onboarding', 'active', 'paused', 'closed');

CREATE TYPE public.warehouse_type AS ENUM ('own', 'third_party', 'fba');

CREATE TYPE public.platform_access AS ENUM ('authorized_user', 'none');

-- Target of customer.contract_document_id.
ALTER TABLE public.document
ADD CONSTRAINT document_id_tenant_id_key UNIQUE (id, tenant_id);

CREATE TABLE IF NOT EXISTS public.customer (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   code CHAR(3) NOT NULL CHECK (code ~ '^[A-Z]{3}$'),
   display_name TEXT NOT NULL,
   country TEXT,
   website TEXT,
   commercial_model public.commercial_model NOT NULL,
   packages TEXT[] NOT NULL DEFAULT '{}' CHECK (packages <@ ARRAY['A0', 'A1', 'A2', 'B', 'C', 'D', 'E']::TEXT[]),
   status public.customer_status NOT NULL DEFAULT 'lead',
   contract_accepted_on DATE,
   contract_document_id UUID,
   start_on DATE,
   deposit_rate NUMERIC(5, 2) CHECK (deposit_rate BETWEEN 0 AND 100),
   extra_cost_rule TEXT,
   eu_responsible_person TEXT,
   restricted_drive_url TEXT,
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT unique_customer_code UNIQUE (tenant_id, code),
   -- Target of the tenant-scoped foreign keys of the customer's child rows.
   CONSTRAINT customer_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT customer_contract_document_fkey FOREIGN KEY (contract_document_id, tenant_id) REFERENCES public.document (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_customer_tenant_status ON public.customer (tenant_id, status);

-- Customers are closed, not deleted.
REVOKE DELETE ON public.customer FROM anon, authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.customer FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The code names the customer's documents and business codes, so it is fixed once given.
CREATE OR REPLACE FUNCTION private.customer_code_immutable () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'customer_code_immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER customer_code_immutable BEFORE
UPDATE ON public.customer FOR EACH ROW
EXECUTE FUNCTION private.customer_code_immutable ();

REVOKE ALL ON FUNCTION private.customer_code_immutable () FROM PUBLIC, anon, authenticated;

-- The customer a document concerns, in the document's own tenant.
ALTER TABLE public.document
ADD CONSTRAINT document_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.customer_contact (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   name TEXT NOT NULL,
   role TEXT,
   email TEXT,
   phone TEXT,
   can_approve BOOLEAN NOT NULL DEFAULT FALSE,
   CONSTRAINT customer_contact_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_contact_customer ON public.customer_contact (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS public.customer_warehouse (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   display_name TEXT NOT NULL,
   type public.warehouse_type NOT NULL DEFAULT 'own',
   country TEXT,
   city TEXT,
   address TEXT,
   postal_code TEXT,
   dock_hours TEXT,
   appointment_rule TEXT,
   pallet_standard TEXT,
   receiving_person TEXT,
   is_default BOOLEAN NOT NULL DEFAULT FALSE,
   CONSTRAINT customer_warehouse_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_warehouse_customer ON public.customer_warehouse (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS public.customer_platform_account (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   -- Global reference data (no tenant_id), so a plain foreign key.
   platform_id TEXT NOT NULL REFERENCES public.platform (id),
   -- ISO 3166-1 alpha-2 codes of the platform's countries the customer sells in.
   countries TEXT[] NOT NULL DEFAULT '{}',
   account_holder TEXT,
   access public.platform_access NOT NULL DEFAULT 'none',
   notes TEXT,
   CONSTRAINT unique_customer_platform UNIQUE (customer_id, platform_id),
   CONSTRAINT customer_platform_account_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_platform_account_customer ON public.customer_platform_account (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS public.customer_brand (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   name TEXT NOT NULL,
   registration_status TEXT,
   brand_program_status TEXT,
   gs1_prefix_owner TEXT,
   CONSTRAINT customer_brand_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_brand_customer ON public.customer_brand (tenant_id, customer_id);

SELECT
   private.enable_tenant_level_security (t_name)
FROM
   unnest(
      ARRAY['customer', 'customer_contact', 'customer_warehouse', 'customer_platform_account', 'customer_brand']
   ) AS t_name;

SELECT
   private.audit_enable ('public.customer'::REGCLASS);

SELECT
   private.audit_enable ('public.customer_contact'::REGCLASS);

SELECT
   private.audit_enable ('public.customer_warehouse'::REGCLASS);

SELECT
   private.audit_enable ('public.customer_platform_account'::REGCLASS);

SELECT
   private.audit_enable ('public.customer_brand'::REGCLASS);

-- Module row (from 015_ops_core.sql), kept here should this migration run alone.
INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('customer', TRUE, 130)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete on customers: they are closed.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.customer', 'customer', 'select', 'read', FALSE, FALSE, NULL),
   ('public.customer', 'customer', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.customer', 'customer', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.customer_contact', 'customer', 'select', 'read', FALSE, FALSE, NULL),
   ('public.customer_contact', 'customer', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.customer_contact', 'customer', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.customer_contact', 'customer', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.customer_warehouse', 'customer', 'select', 'read', FALSE, FALSE, NULL),
   ('public.customer_warehouse', 'customer', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.customer_warehouse', 'customer', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.customer_warehouse', 'customer', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.customer_platform_account', 'customer', 'select', 'read', FALSE, FALSE, NULL),
   ('public.customer_platform_account', 'customer', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.customer_platform_account', 'customer', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.customer_platform_account', 'customer', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.customer_brand', 'customer', 'select', 'read', FALSE, FALSE, NULL),
   ('public.customer_brand', 'customer', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.customer_brand', 'customer', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.customer_brand', 'customer', 'delete', 'modify', FALSE, TRUE, NULL)
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
   AND p.resource_name IN (
      'public.customer',
      'public.customer_contact',
      'public.customer_warehouse',
      'public.customer_platform_account',
      'public.customer_brand'
   )
ON CONFLICT DO NOTHING;
