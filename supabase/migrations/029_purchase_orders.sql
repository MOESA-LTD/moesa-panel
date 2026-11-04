-- Purchase orders (M6): what MOESA orders from a supplier for a customer, its lines, payments and
-- production updates.
--
-- purchase_order          One order to one supplier for one customer, optionally within a project
--                         of that customer. Its code (PO-THO-2026-001) comes from public.next_code
--                         and never changes; nor do its customer and supplier. The terms
--                         (currency, Incoterm, deposit rate, ready date, tolerance, penalty, packing
--                         instruction) and the supplier's PI (number, document, amounts, the S09
--                         checklist in pi_check) sit on the order. Orders are cancelled (status),
--                         never deleted.
-- purchase_order_line     The products ordered: quantity × unit price (line_total, computed), and
--                         the PI's own line total. A product is on an order once, and it must be a
--                         product of the order's customer; the line takes the order's customer
--                         whatever the client sends.
-- purchase_order_payment  The deposit, the balance and other payments, planned and paid, and who
--                         paid (MOESA or the customer).
-- purchase_order_update   Dated production notes. Production photos go to the order's Media tab
--                         (media_link role evidence_photo).
--
-- Defaults (private.purchase_order_defaults, before the code trigger by name): an order without an
-- Incoterm takes the supplier's default_incoterm when it is one of the eleven Incoterms 2020 codes
-- (private.incoterm_valid); one without a deposit rate takes the supplier's, else the company's
-- setting deposit_rate_default (private.company_setting, read on the root tenant), else 30. The
-- code trigger (private.purchase_order_set_code) runs as the caller like project_set_code: it reads
-- the customer through RLS and sets the code and the draft status.
--
-- Every reference to a tenant-scoped table includes tenant_id; the order's project and the lines'
-- products also include customer_id, so they stay within the order's customer (the new keys
-- project_id_customer_tenant_key and product_id_customer_tenant_key are their targets). Customers,
-- suppliers, projects, products and documents are never deleted, so the references to them are
-- ON DELETE RESTRICT; the lines, payments and updates go with their order.
--
-- Each rule is a violation whose message is the rule's code:
--   purchase_order_customer_missing  (foreign_key_violation) the customer is not there in the
--                                    order's tenant, or the caller cannot see it
--   purchase_order_immutable_field   (check_violation) the order's code, customer or supplier
--                                    changed
-- and the constraints the UI names (errors.<code>):
--   purchase_order_incoterm_valid       incoterm_invalid           not an Incoterms 2020 code
--   purchase_order_pi_check_valid       pi_check_invalid           an unknown S09 item or answer
--   purchase_order_project_fkey         po_project_customer        another customer's project
--   purchase_order_line_product_fkey    po_line_product_customer   another customer's product
--   unique_purchase_order_line_product  po_line_product_duplicate  the product is already on it
--
-- public.product_evidence's last_po_code is now the code of the product's newest order that is not
-- cancelled; private.entity_customer knows purchase orders, so their media stays the customer's.
--
-- Roles: the module is granted to every existing role that may change products
-- (private.grant_group_to_product_editors, 027_media_roles.sql made generic); private.seed_ops_roles
-- gives it to the demo company's roles.

CREATE TYPE public.purchase_order_status AS ENUM (
   'draft',
   'sent',
   'pi_received',
   'pi_approved',
   'deposit_paid',
   'in_production',
   'ready',
   'balance_paid',
   'closed',
   'cancelled'
);

CREATE TYPE public.payment_kind AS ENUM ('deposit', 'balance', 'other');

CREATE TYPE public.payment_payer AS ENUM ('moesa', 'customer');

-- A company's setting: the root tenant's value, NULL when it is missing or JSON null. SECURITY
-- DEFINER: the rules read it whatever settings the caller may read, and branches have no setting
-- rows of their own.
CREATE OR REPLACE FUNCTION private.company_setting (tenant_id UUID, key TEXT) RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    WITH RECURSIVE chain AS (
        SELECT t.id, t.parent_id, 0 AS depth FROM public.tenant t WHERE t.id = company_setting.tenant_id
        UNION ALL
        SELECT t.id, t.parent_id, c.depth + 1
        FROM public.tenant t
        JOIN chain c ON t.id = c.parent_id
        WHERE c.depth < 32
    )
    SELECT nullif(s.value, 'null'::JSONB)
    FROM chain c
    JOIN public.setting s ON s.tenant_id = c.id AND s.key = company_setting.key
    WHERE c.parent_id IS NULL;
$$;

-- The eleven Incoterms 2020 codes (S09 item 12).
CREATE OR REPLACE FUNCTION private.incoterm_valid (code TEXT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE STRICT
SET
   search_path = '' AS $$
    SELECT incoterm_valid.code IN ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP');
$$;

-- The PI checklist (S09): an object whose keys are the item numbers '1'…'30' and whose answers are
-- "ok", "error" or "missing". Unanswered items are simply absent.
CREATE OR REPLACE FUNCTION private.pi_check_valid (p_check JSONB) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE STRICT
SET
   search_path = '' AS $$
    SELECT jsonb_typeof(pi_check_valid.p_check) = 'object'
       AND NOT EXISTS (
            SELECT 1
            FROM jsonb_each(pi_check_valid.p_check) e
            WHERE e.key NOT IN (SELECT g::TEXT FROM generate_series(1, 30) g)
               OR e.value NOT IN ('"ok"'::JSONB, '"error"'::JSONB, '"missing"'::JSONB)
        );
$$;

REVOKE ALL ON FUNCTION private.company_setting (UUID, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.incoterm_valid (TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.pi_check_valid (JSONB) FROM PUBLIC, anon, authenticated;

-- The CHECK constraints call them as the writing user (like private.gtin_valid).
GRANT EXECUTE ON FUNCTION private.incoterm_valid (TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION private.pi_check_valid (JSONB) TO authenticated;

-- Targets of the references that stay within one customer.
ALTER TABLE public.project
ADD CONSTRAINT project_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id);

ALTER TABLE public.product
ADD CONSTRAINT product_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id);

-- Purchase orders
CREATE TABLE IF NOT EXISTS public.purchase_order (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   supplier_id UUID NOT NULL,
   project_id UUID,
   -- Set by the purchase_order_set_code trigger; whatever the client sends is replaced.
   code TEXT,
   status public.purchase_order_status NOT NULL DEFAULT 'draft',
   -- Terms
   currency valid_currency_code NOT NULL,
   incoterm TEXT NOT NULL,
   incoterm_place TEXT,
   deposit_rate NUMERIC(5, 2) NOT NULL CHECK (deposit_rate BETWEEN 0 AND 100),
   ready_on DATE,
   tolerance_pct NUMERIC(5, 2) CHECK (tolerance_pct BETWEEN 0 AND 100),
   penalty_rule TEXT,
   packing_instruction_document_id UUID,
   -- The supplier's proforma invoice (PI)
   pi_document_id UUID,
   pi_number TEXT,
   pi_subtotal NUMERIC(14, 2),
   pi_total NUMERIC(14, 2),
   pi_deposit_amount NUMERIC(14, 2),
   pi_balance_amount NUMERIC(14, 2),
   pi_extra_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
   pi_discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (pi_discount_amount >= 0),
   pi_check JSONB NOT NULL DEFAULT '{}',
   pi_checked_by UUID REFERENCES public.user (id) ON DELETE SET NULL,
   pi_checked_at TIMESTAMPTZ,
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   -- The counters behind the codes are per tenant (public.code_sequence), so the code is too.
   CONSTRAINT unique_purchase_order_code UNIQUE (tenant_id, code),
   -- Targets of the tenant-scoped (and customer-scoped) foreign keys of the order's child rows.
   CONSTRAINT purchase_order_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT purchase_order_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id),
   CONSTRAINT purchase_order_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT purchase_order_supplier_fkey FOREIGN KEY (supplier_id, tenant_id) REFERENCES public.supplier (id, tenant_id) ON DELETE RESTRICT,
   -- MATCH SIMPLE: an order without a project passes.
   CONSTRAINT purchase_order_project_fkey FOREIGN KEY (project_id, customer_id, tenant_id) REFERENCES public.project (id, customer_id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT purchase_order_pi_document_fkey FOREIGN KEY (pi_document_id, tenant_id) REFERENCES public.document (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT purchase_order_packing_document_fkey FOREIGN KEY (packing_instruction_document_id, tenant_id) REFERENCES public.document (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT purchase_order_incoterm_valid CHECK (private.incoterm_valid (incoterm)),
   CONSTRAINT purchase_order_pi_check_valid CHECK (private.pi_check_valid (pi_check))
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_customer ON public.purchase_order (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_supplier ON public.purchase_order (tenant_id, supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_project ON public.purchase_order (tenant_id, project_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_tenant_status ON public.purchase_order (tenant_id, status);

-- Purchase orders are cancelled, not deleted.
REVOKE DELETE ON public.purchase_order FROM anon, authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.purchase_order FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The order's terms the client left out: the Incoterm from the supplier (only a valid code), the
-- deposit rate from the supplier, else the company's setting deposit_rate_default (a value that is
-- not a number counts as missing), else 30. SECURITY DEFINER: it reads the supplier and the setting
-- whatever the caller may read, in the order's own tenant only.
CREATE OR REPLACE FUNCTION private.purchase_order_defaults () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    supplier_incoterm TEXT;
    supplier_deposit NUMERIC;
    setting_value JSONB;
    company_deposit NUMERIC;
BEGIN
    SELECT s.default_incoterm, s.deposit_rate INTO supplier_incoterm, supplier_deposit
    FROM public.supplier s
    WHERE s.id = NEW.supplier_id AND s.tenant_id = NEW.tenant_id;

    IF NEW.incoterm IS NULL AND private.incoterm_valid(supplier_incoterm) THEN
        NEW.incoterm := supplier_incoterm;
    END IF;

    IF NEW.deposit_rate IS NULL THEN
        IF supplier_deposit IS NULL THEN
            setting_value := private.company_setting(NEW.tenant_id, 'deposit_rate_default');
            IF jsonb_typeof(setting_value) = 'number' THEN
                company_deposit := (setting_value #>> '{}')::NUMERIC;
            ELSIF jsonb_typeof(setting_value) = 'string' AND (setting_value #>> '{}') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' THEN
                company_deposit := (setting_value #>> '{}')::NUMERIC;
            END IF;
        END IF;
        NEW.deposit_rate := coalesce(supplier_deposit, company_deposit, 30);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER purchase_order_defaults BEFORE INSERT ON public.purchase_order FOR EACH ROW
EXECUTE FUNCTION private.purchase_order_defaults ();

-- The order's code: PO, the customer's code, the year and the customer's next number; and the draft
-- status, whatever the client sends. A customer the caller cannot see in the order's tenant is a
-- missing customer (23503), as the foreign key would report it.
CREATE OR REPLACE FUNCTION private.purchase_order_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'purchase_order_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code('po', customer_code);
    NEW.status := 'draft';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER purchase_order_set_code BEFORE INSERT ON public.purchase_order FOR EACH ROW
EXECUTE FUNCTION private.purchase_order_set_code ();

-- The code is the customer's and the supplier is who the order went to: both are fixed.
CREATE OR REPLACE FUNCTION private.purchase_order_immutable () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
        RAISE EXCEPTION 'purchase_order_immutable_field' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER purchase_order_immutable BEFORE
UPDATE ON public.purchase_order FOR EACH ROW
EXECUTE FUNCTION private.purchase_order_immutable ();

-- Purchase order lines
CREATE TABLE IF NOT EXISTS public.purchase_order_line (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   purchase_order_id UUID NOT NULL,
   -- Set by the purchase_order_line_customer trigger to the order's customer.
   customer_id UUID NOT NULL,
   position INT NOT NULL DEFAULT 0,
   product_id UUID NOT NULL,
   quantity INT NOT NULL CHECK (quantity > 0),
   unit_price NUMERIC(12, 4) NOT NULL CHECK (unit_price >= 0),
   line_total NUMERIC(16, 4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
   pi_line_total NUMERIC(14, 2),
   spec_document_id UUID,
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT purchase_order_line_id_po_tenant_key UNIQUE (id, purchase_order_id, tenant_id),
   CONSTRAINT unique_purchase_order_line_product UNIQUE (purchase_order_id, product_id),
   CONSTRAINT purchase_order_line_po_fkey FOREIGN KEY (purchase_order_id, customer_id, tenant_id) REFERENCES public.purchase_order (id, customer_id, tenant_id) ON DELETE CASCADE,
   CONSTRAINT purchase_order_line_product_fkey FOREIGN KEY (product_id, customer_id, tenant_id) REFERENCES public.product (id, customer_id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT purchase_order_line_spec_fkey FOREIGN KEY (spec_document_id, tenant_id) REFERENCES public.document (id, tenant_id) ON DELETE RESTRICT
);

-- The product's orders (public.product_evidence).
CREATE INDEX IF NOT EXISTS idx_purchase_order_line_product ON public.purchase_order_line (tenant_id, product_id);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.purchase_order_line FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- A line is the order's customer's, whatever the client sends. SECURITY DEFINER, in the line's own
-- tenant only; an order that is not there is left to the foreign key.
CREATE OR REPLACE FUNCTION private.purchase_order_line_customer () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    order_customer UUID;
BEGIN
    SELECT po.customer_id INTO order_customer
    FROM public.purchase_order po
    WHERE po.id = NEW.purchase_order_id AND po.tenant_id = NEW.tenant_id;

    IF order_customer IS NOT NULL THEN
        NEW.customer_id := order_customer;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER purchase_order_line_customer BEFORE INSERT
OR
UPDATE ON public.purchase_order_line FOR EACH ROW
EXECUTE FUNCTION private.purchase_order_line_customer ();

-- Payments
CREATE TABLE IF NOT EXISTS public.purchase_order_payment (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   purchase_order_id UUID NOT NULL,
   kind public.payment_kind NOT NULL,
   amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
   currency valid_currency_code NOT NULL,
   planned_on DATE,
   paid_on DATE,
   paid_by public.payment_payer NOT NULL DEFAULT 'moesa',
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT purchase_order_payment_po_fkey FOREIGN KEY (purchase_order_id, tenant_id) REFERENCES public.purchase_order (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_payment_po ON public.purchase_order_payment (tenant_id, purchase_order_id);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.purchase_order_payment FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- Production updates
CREATE TABLE IF NOT EXISTS public.purchase_order_update (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   purchase_order_id UUID NOT NULL,
   happened_on DATE NOT NULL DEFAULT current_date,
   note TEXT NOT NULL,
   created_by UUID DEFAULT auth.uid (),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT purchase_order_update_po_fkey FOREIGN KEY (purchase_order_id, tenant_id) REFERENCES public.purchase_order (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_update_po ON public.purchase_order_update (tenant_id, purchase_order_id);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.purchase_order_update FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

REVOKE ALL ON FUNCTION private.purchase_order_defaults () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.purchase_order_set_code () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.purchase_order_immutable () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.purchase_order_line_customer () FROM PUBLIC, anon, authenticated;

-- The customer a record belongs to (025_media_link.sql), now with purchase orders.
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
        WHEN 'purchase_order' THEN
            RETURN (SELECT po.customer_id FROM public.purchase_order po
                    WHERE po.id = entity_customer.entity_id AND po.tenant_id = entity_customer.tenant_id);
        ELSE
            RETURN NULL;
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION private.entity_customer (public.document_entity, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The evidence behind each product (019_products.sql), now with its last order: the code of the
-- newest purchase order that is not cancelled and has a line for the product.
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
   (
      SELECT
         po.code
      FROM
         public.purchase_order_line l
         JOIN public.purchase_order po ON po.id = l.purchase_order_id AND po.tenant_id = l.tenant_id
      WHERE
         l.tenant_id = p.tenant_id
         AND l.product_id = p.id
         AND po.status <> 'cancelled'
      ORDER BY
         po.created_at DESC,
         po.code DESC
      LIMIT
         1
   ) AS last_po_code,
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

COMMENT ON VIEW public.product_evidence IS 'Per product: its highest signed or approved spec sheet, whether its compliance is complete, and last_po_code, the code of its newest purchase order (by created_at) that is not cancelled. live_cell_count (always 0) is a placeholder until the Phase 2 listing tables exist.';

SELECT
   private.enable_tenant_level_security (t_name)
FROM
   unnest(ARRAY['purchase_order', 'purchase_order_line', 'purchase_order_payment', 'purchase_order_update']) AS t_name;

SELECT
   private.audit_enable ('public.purchase_order'::REGCLASS);

SELECT
   private.audit_enable ('public.purchase_order_line'::REGCLASS);

SELECT
   private.audit_enable ('public.purchase_order_payment'::REGCLASS);

SELECT
   private.audit_enable ('public.purchase_order_update'::REGCLASS);

INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('purchase_order', TRUE, 170)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete on orders (cancelled instead).
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.purchase_order', 'purchase_order', 'select', 'read', FALSE, FALSE, NULL),
   ('public.purchase_order', 'purchase_order', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.purchase_order', 'purchase_order', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.purchase_order_line', 'purchase_order', 'select', 'read', FALSE, FALSE, NULL),
   ('public.purchase_order_line', 'purchase_order', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.purchase_order_line', 'purchase_order', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.purchase_order_line', 'purchase_order', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.purchase_order_payment', 'purchase_order', 'select', 'read', FALSE, FALSE, NULL),
   ('public.purchase_order_payment', 'purchase_order', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.purchase_order_payment', 'purchase_order', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.purchase_order_payment', 'purchase_order', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.purchase_order_update', 'purchase_order', 'select', 'read', FALSE, FALSE, NULL),
   ('public.purchase_order_update', 'purchase_order', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.purchase_order_update', 'purchase_order', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.purchase_order_update', 'purchase_order', 'delete', 'modify', FALSE, TRUE, NULL)
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
      'public.purchase_order',
      'public.purchase_order_line',
      'public.purchase_order_payment',
      'public.purchase_order_update'
   )
ON CONFLICT DO NOTHING;

-- Every permission of a group to each role that may change products (public.product update), as
-- 027_media_roles.sql did for media. It only adds rows, so running it again changes nothing.
CREATE OR REPLACE FUNCTION private.grant_group_to_product_editors (group_name TEXT) RETURNS VOID LANGUAGE sql
SET
   search_path = '' AS $$
    INSERT INTO public.role_permission (role_id, permission_id)
    SELECT r.id, p.id
    FROM public.role r
    JOIN public.permission p ON p.group_name = grant_group_to_product_editors.group_name
    WHERE EXISTS (
            SELECT 1
            FROM public.role_permission rp
            JOIN public.permission held ON held.id = rp.permission_id
            WHERE rp.role_id = r.id AND held.resource_name = 'public.product' AND held.command = 'update'
        )
    ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION private.grant_group_to_product_editors (TEXT) FROM PUBLIC, anon, authenticated;

SELECT
   private.grant_group_to_product_editors ('purchase_order');
