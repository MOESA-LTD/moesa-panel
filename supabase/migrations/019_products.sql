-- Products (M3): the product master, the single source every purchase order, shipment and listing
-- refers to. A product belongs to one customer, and its SKU is unique within that customer.
--
-- product           The product card: identity (SKU, GTIN), supplier, status, compliance,
--                   dimensions and weights from unit to pallet, and prices. Products are archived
--                   (status), never deleted: there is no delete permission. parent_id groups a
--                   variant under its parent product.
-- product_evidence  Per product, the evidence behind it: whether it has a signed or approved spec
--                   sheet (the highest such version among its documents), and whether its
--                   compliance is complete.
--
-- A GTIN is checked against its GS1 check digit (private.gtin_valid), and is unique among the
-- products that are not archived, across all tenants: a GTIN identifies one product in the world.
--
-- Now that public.product exists, documents with entity_type 'product' are checked against it
-- (private.document_check_entity, 016_documents.sql).
--
-- Every reference to a tenant-scoped table includes tenant_id (see 018_customers.sql). Customers,
-- suppliers and products are never deleted, so the references are ON DELETE RESTRICT.

CREATE TYPE public.product_status AS ENUM ('concept', 'development', 'approved', 'ordering', 'on_sale', 'paused', 'archived');

CREATE TYPE public.compliance_status AS ENUM ('none', 'partial', 'complete');

-- GTIN-8, -12, -13 or -14: digits only, and the last digit is the GS1 mod-10 check digit (the
-- other digits weighted 3, 1, 3, … from the right).
CREATE OR REPLACE FUNCTION private.gtin_valid (gtin TEXT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE STRICT
SET
   search_path = '' AS $$
    SELECT CASE
        WHEN gtin !~ '^([0-9]{8}|[0-9]{12,14})$' THEN FALSE
        ELSE (
            SELECT (10 - sum(substr(gtin, length(gtin) - i, 1)::INT * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END) % 10) % 10
            FROM generate_series(1, length(gtin) - 1) AS i
        ) = substr(gtin, length(gtin), 1)::INT
    END;
$$;

GRANT EXECUTE ON FUNCTION private.gtin_valid (TEXT) TO authenticated;

CREATE TABLE IF NOT EXISTS public.product (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   parent_id UUID,
   sku TEXT NOT NULL,
   display_name TEXT,
   variant_label TEXT,
   category TEXT,
   brand TEXT,
   gtin TEXT CHECK (gtin IS NULL OR private.gtin_valid (gtin)),
   gs1_prefix_owner TEXT,
   supplier_id UUID,
   supplier_product_code TEXT,
   manufacturer_art_no TEXT,
   status public.product_status NOT NULL DEFAULT 'concept',
   golden_sample_on DATE,
   golden_sample_locations TEXT,
   is_hazmat BOOLEAN NOT NULL DEFAULT FALSE,
   compliance_status public.compliance_status NOT NULL DEFAULT 'none',
   eu_responsible_person TEXT,
   hs_code TEXT,
   origin_country TEXT,
   unit_dims_mm TEXT,
   unit_net_g NUMERIC,
   pack_qty INT,
   pack_dims_mm TEXT,
   pack_gross_g NUMERIC,
   carton_pack_qty INT,
   carton_dims_mm TEXT,
   carton_net_kg NUMERIC,
   carton_gross_kg NUMERIC,
   pallet_carton_qty INT,
   pallet_type TEXT,
   lot_rule TEXT,
   purchase_price NUMERIC(12, 4),
   purchase_currency valid_currency_code,
   purchase_incoterm TEXT,
   landed_cost_eur NUMERIC(12, 4),
   landed_cost_on DATE,
   target_price_eur NUMERIC(12, 2),
   moesa_price_eur NUMERIC(12, 4),
   price_list_version TEXT,
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT product_customer_id_sku_key UNIQUE (customer_id, sku),
   -- Target of the tenant-scoped foreign keys of the rows that refer to a product.
   CONSTRAINT product_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT product_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT product_supplier_fkey FOREIGN KEY (supplier_id, tenant_id) REFERENCES public.supplier (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT product_parent_fkey FOREIGN KEY (parent_id, tenant_id) REFERENCES public.product (id, tenant_id) ON DELETE RESTRICT
);

-- Global on purpose: a GTIN is unique in the world, whichever tenant holds the product.
CREATE UNIQUE INDEX IF NOT EXISTS product_gtin_active ON public.product (gtin)
WHERE
   gtin IS NOT NULL
   AND status <> 'archived';

CREATE INDEX IF NOT EXISTS idx_product_customer ON public.product (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_product_supplier ON public.product (tenant_id, supplier_id);

CREATE INDEX IF NOT EXISTS idx_product_tenant_status ON public.product (tenant_id, status);

-- Products are archived, not deleted.
REVOKE DELETE ON public.product FROM anon, authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.product FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

SELECT
   private.enable_tenant_level_security ('product');

SELECT
   private.audit_enable ('public.product'::REGCLASS);

-- The evidence behind each product. security_invoker: the caller's own rights on product and
-- document apply, so a tenant sees only its own products and documents.
CREATE OR REPLACE VIEW public.product_evidence
WITH
   (security_invoker = TRUE) AS
SELECT
   p.id AS product_id,
   p.customer_id,
   p.tenant_id,
   p.sku,
   p.status,
   spec.id IS NOT NULL AS has_signed_spec,
   spec.version AS spec_version,
   spec.id AS spec_document_id,
   p.compliance_status,
   p.compliance_status = 'complete' AS compliance_complete,
   NULL::TEXT AS last_po_code,
   0::INT AS live_cell_count
FROM
   public.product p
   LEFT JOIN LATERAL (
      SELECT
         d.id,
         d.version
      FROM
         public.document d
      WHERE
         d.tenant_id = p.tenant_id
         AND d.entity_type = 'product'
         AND d.entity_id = p.id
         AND d.type = 'spec_sheet'
         AND d.status IN ('signed', 'approved')
      ORDER BY
         d.version DESC
      LIMIT
         1
   ) spec ON TRUE;

COMMENT ON VIEW public.product_evidence IS 'Per product: its highest signed or approved spec sheet and whether its compliance is complete. last_po_code (always NULL) and live_cell_count (always 0) are placeholders until the Phase 2 purchase order and listing tables exist.';

GRANT SELECT ON public.product_evidence TO authenticated;

-- Module row (from 015_ops_core.sql), kept here should this migration run alone.
INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('product', TRUE, 140)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete on products: they are archived.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.product', 'product', 'select', 'read', FALSE, FALSE, NULL),
   ('public.product', 'product', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.product', 'product', 'update', 'modify', FALSE, TRUE, NULL)
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
   AND p.resource_name = 'public.product'
ON CONFLICT DO NOTHING;
