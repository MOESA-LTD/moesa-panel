-- Market matrix (S05, L-G1): where each product is sold, one cell per product, platform and
-- country, with its S05 status, priority, compliance, listing data and dates.
--
-- market_cell  One product on one platform in one country (an ISO 3166-1 alpha-2 code among the
--              platform's countries). Its customer is the product's, whatever the client sends
--              (the market_cell_customer trigger); its project, when given, is of the same customer
--              (market_cell_project_fkey). The product, platform and country never change: another
--              market is another cell. Only a candidate cell is deleted; the others are removed or
--              stopped (status), with the reason.
--
-- Status flow   (S05 "Sonraki durum") candidate → planned | paused | removed; planned → preparing |
--               paused; preparing → uploaded; uploaded → live | suppressed; live → suppressed |
--               stopped; suppressed → live | stopped; paused → planned; removed → candidate;
--               stopped is final. paused is also reachable from candidate and planned (S05 leaves
--               it unreachable). A new cell is a candidate, whatever the client sends.
-- Live          A live cell has the platform's product ID, the platform SKU, the price, the
--               currency, the stock source and approved content (L-G1), on every write, so a live
--               cell keeps them. Entering live dates the launch today unless a date is given.
-- Reasons       suppressed needs the open issue; stopped and removed need a note.
-- Compliance    yellow and red need a compliance note (S12); a red cell is only a candidate,
--               stopped or removed.
--
-- Each rule is a violation whose message is the rule's code (all check_violation):
--   market_cell_immutable_field           the product, platform or country changed
--   market_cell_delete_candidate_only     deleting a cell that is not a candidate
--   market_cell_country_invalid           the country is not one of the platform's
--   market_cell_status_order              not an allowed transition, or out of stopped
--   market_cell_live_incomplete           live without its listing data or approved content
--   market_cell_reason_required           suppressed without the open issue, stopped or removed
--                                         without a note
--   market_cell_compliance_note_required  yellow or red compliance without a note
--   market_cell_compliance_red            red compliance on a cell that is not a candidate,
--                                         stopped or removed
-- and the constraints the UI names (errors.<code>):
--   unique_market_cell          market_cell_duplicate         the product already has the cell
--   market_cell_country_format  market_cell_country_invalid   not an ISO 3166-1 alpha-2 code
--   market_cell_product_fkey    market_cell_product_customer  the product is not there
--   market_cell_project_fkey    market_cell_project_customer  another customer's project
--   market_cell_price_currency  market_cell_price_currency    a price without its currency
--
-- Every reference to a tenant-scoped table includes tenant_id; the product and the project also
-- include customer_id (product_id_customer_tenant_key, project_id_customer_tenant_key, 029).
-- Products, projects and platforms are not deleted while they have cells (ON DELETE RESTRICT).
--
-- The guard is SECURITY DEFINER (it reads the platform's countries) and sorts after the other
-- BEFORE triggers (market_cell_z_guard). The immutability rule ignores private.rules_bypassed()
-- (030_purchase_order_rules.sql); the other rules return at once when it holds. A delete cascaded
-- from the tenant (pg_trigger_depth() > 1) is not checked.
--
-- public.market_cell_overview: each cell with its customer and project codes, its product's SKU,
-- name and GTIN, the platform's name and the S05 cell key (hucre_id). public.product_evidence now
-- counts the product's live cells. private.entity_customer knows market cells, so their media and
-- documents stay the customer's. document_entity gains market_cell and change_request (035); a new
-- enum value cannot be used by SQL statements of the transaction that adds it, so this file uses
-- them only inside plpgsql bodies.
--
-- Roles: the module is granted to every existing role that may change products
-- (private.grant_group_to_product_editors); private.seed_ops_roles gives it to the demo company's
-- roles.

ALTER TYPE public.document_entity ADD VALUE IF NOT EXISTS 'market_cell';

ALTER TYPE public.document_entity ADD VALUE IF NOT EXISTS 'change_request';

-- S05: Aday, Planlandi, Hazirlaniyor, Yuklendi, Yayinda, Askida, Beklemede, Kapatildi, Cikarildi.
CREATE TYPE public.market_cell_status AS ENUM (
   'candidate',
   'planned',
   'preparing',
   'uploaded',
   'live',
   'suppressed',
   'paused',
   'stopped',
   'removed'
);

-- The cell's compliance in its market (public.compliance_status, 019, is the product's).
CREATE TYPE public.market_compliance AS ENUM ('green', 'yellow', 'red', 'pending');

CREATE TYPE public.stock_source AS ENUM ('customer_warehouse', '3pl', 'platform', 'pan_eu');

CREATE TYPE public.content_status AS ENUM ('none', 'en_master', 'translated', 'approved');

-- Market cells
CREATE TABLE IF NOT EXISTS public.market_cell (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   -- Set by the market_cell_customer trigger to the product's customer.
   customer_id UUID NOT NULL,
   product_id UUID NOT NULL,
   project_id UUID,
   platform_id TEXT NOT NULL,
   -- ISO 3166-1 alpha-2, one of the platform's countries.
   country TEXT NOT NULL,
   status public.market_cell_status NOT NULL DEFAULT 'candidate',
   priority SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
   compliance public.market_compliance NOT NULL DEFAULT 'pending',
   compliance_note TEXT,
   -- Listing: the platform's product ID (ASIN, Item ID, …) and the seller SKU on the platform.
   platform_product_id TEXT,
   platform_sku TEXT,
   price NUMERIC(12, 2) CHECK (price >= 0),
   currency valid_currency_code,
   stock_source public.stock_source,
   content_status public.content_status NOT NULL DEFAULT 'none',
   -- Dates
   target_launch_on DATE,
   launched_on DATE,
   last_checked_on DATE,
   open_issue TEXT,
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT unique_market_cell UNIQUE (tenant_id, product_id, platform_id, country),
   -- Target of the tenant-scoped foreign keys of the cell's child rows.
   CONSTRAINT market_cell_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT market_cell_product_fkey FOREIGN KEY (product_id, customer_id, tenant_id) REFERENCES public.product (id, customer_id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT market_cell_project_fkey FOREIGN KEY (project_id, customer_id, tenant_id) REFERENCES public.project (id, customer_id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT market_cell_platform_fkey FOREIGN KEY (platform_id) REFERENCES public.platform (id) ON DELETE RESTRICT,
   CONSTRAINT market_cell_country_format CHECK (country ~ '^[A-Z]{2}$'),
   CONSTRAINT market_cell_price_currency CHECK (price IS NULL OR currency IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_market_cell_customer ON public.market_cell (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_market_cell_product ON public.market_cell (tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_market_cell_tenant_status ON public.market_cell (tenant_id, status);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.market_cell FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- A cell is the product's customer's, whatever the client sends. SECURITY DEFINER, in the cell's
-- own tenant only; a product that is not there is left to the foreign key.
CREATE OR REPLACE FUNCTION private.market_cell_customer () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    product_customer UUID;
BEGIN
    SELECT p.customer_id INTO product_customer
    FROM public.product p
    WHERE p.id = NEW.product_id AND p.tenant_id = NEW.tenant_id;

    IF product_customer IS NOT NULL THEN
        NEW.customer_id := product_customer;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER market_cell_customer BEFORE INSERT
OR
UPDATE ON public.market_cell FOR EACH ROW
EXECUTE FUNCTION private.market_cell_customer ();

-- The cell's rules (see the header), in this order: the fixed product, platform and country
-- (whatever the bypass flag); deleting candidates only; a new cell's country; the status flow;
-- what live needs; the reasons; the compliance rules.
CREATE OR REPLACE FUNCTION private.market_cell_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    allowed BOOLEAN;
BEGIN
    -- 1. The product, platform and country are fixed.
    IF TG_OP = 'UPDATE' AND (
        NEW.product_id IS DISTINCT FROM OLD.product_id
        OR NEW.platform_id IS DISTINCT FROM OLD.platform_id
        OR NEW.country IS DISTINCT FROM OLD.country
    ) THEN
        RAISE EXCEPTION 'market_cell_immutable_field' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- 2. Only a candidate is deleted; a delete cascaded from the tenant is not checked.
    IF TG_OP = 'DELETE' THEN
        IF pg_trigger_depth() = 1 AND OLD.status <> 'candidate' THEN
            RAISE EXCEPTION 'market_cell_delete_candidate_only' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    -- 3. A new cell: one of the platform's countries; a candidate, whatever the client sends.
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.platform pl WHERE pl.id = NEW.platform_id AND NEW.country = ANY (pl.countries)
        ) THEN
            RAISE EXCEPTION 'market_cell_country_invalid' USING ERRCODE = 'check_violation';
        END IF;
        NEW.status := 'candidate';

    -- 4. The allowed transitions (S05, and paused from candidate and planned); stopped is final.
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        allowed := CASE OLD.status
            WHEN 'candidate' THEN NEW.status IN ('planned', 'paused', 'removed')
            WHEN 'planned' THEN NEW.status IN ('preparing', 'paused')
            WHEN 'preparing' THEN NEW.status = 'uploaded'
            WHEN 'uploaded' THEN NEW.status IN ('live', 'suppressed')
            WHEN 'live' THEN NEW.status IN ('suppressed', 'stopped')
            WHEN 'suppressed' THEN NEW.status IN ('live', 'stopped')
            WHEN 'paused' THEN NEW.status = 'planned'
            WHEN 'removed' THEN NEW.status = 'candidate'
            ELSE FALSE
        END;
        IF NOT allowed THEN
            RAISE EXCEPTION 'market_cell_status_order' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 5. Live, on every write, so a live cell keeps them: the listing data and approved content
    --    (L-G1). Entering live dates the launch today unless a date is given.
    IF NEW.status = 'live' THEN
        IF NEW.platform_product_id IS NULL OR NEW.platform_sku IS NULL OR NEW.price IS NULL
           OR NEW.currency IS NULL OR NEW.stock_source IS NULL OR NEW.content_status <> 'approved' THEN
            RAISE EXCEPTION 'market_cell_live_incomplete' USING ERRCODE = 'check_violation';
        END IF;
        IF TG_OP = 'INSERT' OR OLD.status <> 'live' THEN
            NEW.launched_on := coalesce(NEW.launched_on, current_date);
        END IF;
    END IF;

    -- 6. The reasons: the open issue when suppressed, a note when stopped or removed.
    IF NEW.status = 'suppressed' AND NEW.open_issue IS NULL
       OR NEW.status IN ('stopped', 'removed') AND NEW.notes IS NULL THEN
        RAISE EXCEPTION 'market_cell_reason_required' USING ERRCODE = 'check_violation';
    END IF;

    -- 7. Yellow and red compliance need a note (S12); a red cell is only a candidate, stopped or
    --    removed.
    IF NEW.compliance IN ('yellow', 'red') AND NEW.compliance_note IS NULL THEN
        RAISE EXCEPTION 'market_cell_compliance_note_required' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.compliance = 'red' AND NEW.status NOT IN ('candidate', 'stopped', 'removed') THEN
        RAISE EXCEPTION 'market_cell_compliance_red' USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- BEFORE triggers fire in name order: the z sorts the guard after market_cell_customer.
CREATE OR REPLACE TRIGGER market_cell_z_guard BEFORE INSERT
OR
UPDATE
OR DELETE ON public.market_cell FOR EACH ROW
EXECUTE FUNCTION private.market_cell_guard ();

REVOKE ALL ON FUNCTION private.market_cell_customer () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.market_cell_guard () FROM PUBLIC, anon, authenticated;

-- The customer a record belongs to (025_media_link.sql), now with market cells.
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
        WHEN 'shipment' THEN
            RETURN (SELECT s.customer_id FROM public.shipment s
                    WHERE s.id = entity_customer.entity_id AND s.tenant_id = entity_customer.tenant_id);
        WHEN 'market_cell' THEN
            RETURN (SELECT m.customer_id FROM public.market_cell m
                    WHERE m.id = entity_customer.entity_id AND m.tenant_id = entity_customer.tenant_id);
        ELSE
            RETURN NULL;
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION private.entity_customer (public.document_entity, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The evidence behind each product (029_purchase_orders.sql), now counting its live cells.
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
   (
      SELECT
         count(*)::INT
      FROM
         public.market_cell m
      WHERE
         m.product_id = p.id
         AND m.tenant_id = p.tenant_id
         AND m.status = 'live'
   ) AS live_cell_count
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

COMMENT ON VIEW public.product_evidence IS 'Per product: its highest signed or approved spec sheet, whether its compliance is complete, last_po_code, the code of its newest purchase order (by created_at) that is not cancelled, and live_cell_count, how many of its market cells are live.';

-- The market matrix and the cell list. Runs as the caller (security_invoker), so it shows only the
-- cells, customers, projects and products the caller may read.
CREATE OR REPLACE VIEW public.market_cell_overview
WITH
   (security_invoker = TRUE) AS
SELECT
   m.*,
   c.code::TEXT AS customer_code,
   pj.code AS project_code,
   p.sku,
   p.display_name AS product_name,
   p.gtin,
   pl.display_name AS platform_name,
   m.platform_id || '_' || m.country AS cell_key
FROM
   public.market_cell m
   LEFT JOIN public.customer c ON c.id = m.customer_id
   AND c.tenant_id = m.tenant_id
   LEFT JOIN public.project pj ON pj.id = m.project_id
   AND pj.tenant_id = m.tenant_id
   LEFT JOIN public.product p ON p.id = m.product_id
   AND p.tenant_id = m.tenant_id
   LEFT JOIN public.platform pl ON pl.id = m.platform_id;

COMMENT ON VIEW public.market_cell_overview IS 'Per market cell: every column of the cell, customer_code, project_code, sku, product_name and gtin (its product), platform_name and cell_key (platform_id || ''_'' || country, the S05 hucre_id).';

GRANT SELECT ON public.market_cell_overview TO authenticated;

SELECT
   private.enable_tenant_level_security ('market_cell');

SELECT
   private.audit_enable ('public.market_cell'::REGCLASS);

INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('market_matrix', TRUE, 190)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). The
-- guard lets only a candidate be deleted.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.market_cell', 'market_matrix', 'select', 'read', FALSE, FALSE, NULL),
   ('public.market_cell', 'market_matrix', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.market_cell', 'market_matrix', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.market_cell', 'market_matrix', 'delete', 'modify', FALSE, TRUE, NULL)
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
   AND p.resource_name = 'public.market_cell'
ON CONFLICT DO NOTHING;

-- Every permission of the group to each role that may change products (029_purchase_orders.sql).
SELECT
   private.grant_group_to_product_editors ('market_matrix');
