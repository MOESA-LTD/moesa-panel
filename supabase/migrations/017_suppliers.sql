-- Suppliers (M2): the factories and traders goods are bought from, with the commercial terms agreed
-- with them and the people to contact.
--
-- supplier          Shared by every customer of the tenant, so it has no customer_id. Its code
--                   (country + number, e.g. CN1) is unique per tenant and names its documents.
--                   Suppliers are suspended (status), never deleted: there is no delete permission.
-- supplier_contact  The supplier's people; removed with their supplier.
--
-- Now that public.supplier exists, documents with entity_type 'supplier' are checked against it
-- (private.document_check_entity, 016_documents.sql).
--
-- Project rule for every child→parent reference between tenant-scoped tables: the foreign key
-- includes tenant_id (parent UNIQUE (id, tenant_id), child FOREIGN KEY (parent_id, tenant_id)).
-- Referential checks bypass RLS, so a plain FK on the id alone would let a row point at another
-- tenant's parent (and probe which ids exist there), and that tenant's deletes would cascade into
-- this tenant's rows.

CREATE TYPE public.supplier_status AS ENUM ('candidate', 'approved', 'suspended');

CREATE TABLE IF NOT EXISTS public.supplier (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   code TEXT NOT NULL CHECK (code ~ '^[A-Z]{2}[0-9]{1,3}$'),
   display_name TEXT NOT NULL,
   country TEXT NOT NULL,
   city TEXT,
   website TEXT,
   product_groups TEXT[] NOT NULL DEFAULT '{}',
   capacity_note TEXT,
   default_incoterm TEXT,
   deposit_rate NUMERIC(5, 2) CHECK (deposit_rate BETWEEN 0 AND 100),
   payment_terms TEXT,
   damage_notice_hours INT,
   storage_fee_rule TEXT,
   late_payment_penalty TEXT,
   cancellation_rule TEXT,
   rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
   last_audit_on DATE,
   status public.supplier_status NOT NULL DEFAULT 'candidate',
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT unique_supplier_code UNIQUE (tenant_id, code),
   -- Target of the tenant-scoped foreign keys of the supplier's child rows.
   CONSTRAINT supplier_id_tenant_id_key UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_tenant_status ON public.supplier (tenant_id, status);

-- Suppliers are suspended, not deleted.
REVOKE DELETE ON public.supplier FROM anon, authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.supplier FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

CREATE TABLE IF NOT EXISTS public.supplier_contact (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   supplier_id UUID NOT NULL,
   name TEXT NOT NULL,
   role TEXT,
   email TEXT,
   phone TEXT,
   is_primary BOOLEAN NOT NULL DEFAULT FALSE,
   CONSTRAINT supplier_contact_supplier_fkey FOREIGN KEY (supplier_id, tenant_id) REFERENCES public.supplier (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_supplier_contact_supplier ON public.supplier_contact (tenant_id, supplier_id);

SELECT
   private.enable_tenant_level_security (t_name)
FROM
   unnest(ARRAY['supplier', 'supplier_contact']) AS t_name;

SELECT
   private.audit_enable ('public.supplier'::REGCLASS);

SELECT
   private.audit_enable ('public.supplier_contact'::REGCLASS);

-- Module row (from 015_ops_core.sql), kept here should this migration run alone.
INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('supplier', TRUE, 120)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete on suppliers: they are suspended.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.supplier', 'supplier', 'select', 'read', FALSE, FALSE, NULL),
   ('public.supplier', 'supplier', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.supplier', 'supplier', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.supplier_contact', 'supplier', 'select', 'read', FALSE, FALSE, NULL),
   ('public.supplier_contact', 'supplier', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.supplier_contact', 'supplier', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.supplier_contact', 'supplier', 'delete', 'modify', FALSE, TRUE, NULL)
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
   AND p.resource_name IN ('public.supplier', 'public.supplier_contact')
ON CONFLICT DO NOTHING;
