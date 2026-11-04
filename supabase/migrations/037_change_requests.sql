-- Change requests (S08, M10): a change asked of a running product or project, what it changes,
-- what it costs and delays, who decided it and the document it produced.
--
-- change_request          One request of one customer. Its code is CR, the customer's code, the
--                         year and the customer's next request number (CR-THO-2026-001,
--                         public.next_code), whatever the client sends; the code and the customer
--                         never change. It may name the project, the gate it touches
--                         (affected_gate_code), the document it changes (affected_document_id, a
--                         document of the same customer) and the other documents it touches (free
--                         text). The kinds of change are those of M10 and S08 §C (spec, design,
--                         packaging, price, deadline, supplier, content); at least one. Change
--                         requests are never deleted.
-- change_request_product  The products the request touches (S08 A), of the same customer. They go
--                         with their request (ON DELETE CASCADE); their customer is the request's.
--
-- Decision due  decision_due_on, recomputed on every write: urgent the day after the request was
--               made (24 hours), normal five business days later (S08 A "Normal (5 iş günü) / Acil
--               (24 saat)"). Business days are Monday to Friday, with no holiday calendar
--               (public.add_business_days); every date is UTC.
-- Status flow   open → approved | rejected; approved → applied; rejected and applied are final.
--               Approving records MOESA's date and approver (moesa_approved_on, moesa_approved_by:
--               today and the caller, whatever the client sends). When the request names a gate of its project that is already passed
--               and needs the customer's approval, approving needs the customer's approval date and
--               written approval (S08 §4): a signed or approved document of this request.
--               Rejecting needs the reason (decision_note). Applying a request that changes a
--               document needs that document's new version (result_document_id: the same record
--               and type, a higher version; M10 "CR applied olunca ilgili belge yeni sürüm alır").
--               Rejecting or applying closes it (closed_on, today); the client never sets it.
--               Once approved, the customer's approval date and document may still be entered,
--               but an entered one no longer changes or clears.
--
-- Each rule is a violation whose message is the rule's code (check_violation unless stated):
--   change_request_customer_missing            the customer is not there (foreign_key_violation)
--   change_request_immutable_field             the code, the customer or created_at changed, or
--                                              the entered customer's approval of an approved
--                                              request changed or cleared
--   change_request_document_invalid            the affected or resulting document is another
--                                              customer's
--   change_request_approval_document_invalid   the customer's approval is not a signed or approved
--                                              document of this request
--   change_request_status_order                not an allowed transition
--   change_request_customer_approval_required  approving after a passed gate that needs the
--                                              customer's approval, without it
--   change_request_decision_note_required      rejecting without the reason
--   change_request_new_version_required        applying without the changed document's new version
-- and the constraint the UI names: change_request_kinds_required (at least one kind of change).
--
-- Every reference to a tenant-scoped table includes tenant_id; the project and the products also
-- include the customer, so they stay the request's customer's. Customers, projects, products and
-- documents are not deleted while a request names them (ON DELETE RESTRICT); users are (ON DELETE
-- SET NULL).
--
-- The code and decision-due triggers run as the caller and call no private function: the code
-- trigger reads the customer through RLS and gets the code from public.next_code. The guard and the
-- product's customer trigger are SECURITY DEFINER (they read the documents, the gate and the request
-- whatever the caller may read) and filter on the row's own tenant_id. The guard sorts after the
-- other BEFORE triggers (<table>_z_guard); its immutability rule ignores private.rules_bypassed()
-- (030_purchase_order_rules.sql), the other rules return at once when it holds.
--
-- private.entity_customer knows change requests, so their documents and media stay the customer's.
--
-- Roles: the module is granted to every existing role that may change products
-- (private.grant_group_to_product_editors); private.seed_ops_roles gives it to the demo company's
-- roles.

CREATE TYPE public.change_request_status AS ENUM ('open', 'approved', 'rejected', 'applied');

-- S08 A: who asked for the change.
CREATE TYPE public.change_request_source AS ENUM ('customer', 'supplier', 'moesa', 'regulation');

CREATE TYPE public.change_request_urgency AS ENUM ('normal', 'urgent');

-- M10 and S08 §C (supplier and content).
CREATE TYPE public.change_kind AS ENUM ('spec', 'design', 'packaging', 'price', 'deadline', 'supplier', 'content');

-- Change requests
CREATE TABLE IF NOT EXISTS public.change_request (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   -- Set by the change_request_set_code trigger; whatever the client sends is replaced.
   code TEXT,
   project_id UUID,
   -- Identity (S08 A). decision_due_on is set by the change_request_due trigger.
   title TEXT NOT NULL,
   source public.change_request_source NOT NULL,
   urgency public.change_request_urgency NOT NULL DEFAULT 'normal',
   status public.change_request_status NOT NULL DEFAULT 'open',
   decision_due_on DATE,
   -- What changes (S08 B, C).
   change_kinds public.change_kind[] NOT NULL,
   current_value TEXT NOT NULL,
   requested_value TEXT NOT NULL,
   reason TEXT NOT NULL,
   affected_gate_code public.gate_code,
   affected_document_id UUID,
   other_documents TEXT,
   -- Impact (S08 D).
   cost_impact TEXT,
   cost_payer public.cost_payer,
   delay_days INT CHECK (delay_days >= 0),
   quality_impact TEXT,
   listing_impact TEXT,
   -- Decision (S08 E, F). moesa_approved_* and closed_on are set by the guard only.
   decision_note TEXT,
   moesa_approved_by UUID,
   moesa_approved_on DATE,
   customer_approved_on DATE,
   customer_approval_document_id UUID,
   result_document_id UUID,
   closed_on DATE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT unique_change_request_code UNIQUE (tenant_id, code),
   -- Targets of the tenant-scoped foreign keys of the request's child rows.
   CONSTRAINT change_request_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT change_request_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id),
   CONSTRAINT change_request_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT change_request_project_fkey FOREIGN KEY (project_id, customer_id, tenant_id) REFERENCES public.project (id, customer_id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT change_request_affected_document_fkey FOREIGN KEY (affected_document_id, tenant_id) REFERENCES public.document (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT change_request_approval_document_fkey FOREIGN KEY (customer_approval_document_id, tenant_id) REFERENCES public.document (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT change_request_result_document_fkey FOREIGN KEY (result_document_id, tenant_id) REFERENCES public.document (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT change_request_approver_fkey FOREIGN KEY (moesa_approved_by) REFERENCES public.user (id) ON DELETE SET NULL,
   CONSTRAINT change_request_kinds_required CHECK (cardinality(change_kinds) > 0)
);

CREATE INDEX IF NOT EXISTS idx_change_request_customer ON public.change_request (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_change_request_tenant_status ON public.change_request (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_change_request_project ON public.change_request (tenant_id, project_id);

-- Change requests are rejected or applied, never deleted.
REVOKE DELETE ON public.change_request FROM anon, authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.change_request FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The request's code: CR, the customer's code, the year and the customer's next request number; and
-- the open status, whatever the client sends. A customer the caller cannot see in the request's
-- tenant is a missing customer (23503), as the foreign key would report it.
CREATE OR REPLACE FUNCTION private.change_request_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'change_request_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code('cr', customer_code);
    NEW.status := 'open';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER change_request_set_code BEFORE INSERT ON public.change_request FOR EACH ROW
EXECUTE FUNCTION private.change_request_set_code ();

-- When the request is to be decided (see the header), on every write, from when it was made (the
-- stored created_at; now on insert, whatever the client sends), in UTC.
CREATE OR REPLACE FUNCTION private.change_request_due () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    made_on DATE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();
        made_on := (now() AT TIME ZONE 'UTC')::DATE;
    ELSE
        made_on := (OLD.created_at AT TIME ZONE 'UTC')::DATE;
    END IF;

    NEW.decision_due_on := CASE NEW.urgency
        WHEN 'urgent' THEN made_on + 1
        ELSE public.add_business_days(made_on, 5)
    END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER change_request_due BEFORE INSERT
OR
UPDATE ON public.change_request FOR EACH ROW
EXECUTE FUNCTION private.change_request_due ();

-- The request's rules (see the header), in this order: the fixed fields (whatever the bypass
-- flag); the server-set columns; the affected and resulting documents; the customer's written approval; the status flow; what
-- approving, rejecting and applying need; closing.
CREATE OR REPLACE FUNCTION private.change_request_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    affected_entity_type public.document_entity;
    affected_entity_id UUID;
BEGIN
    -- 1. The code, the customer and when it was made are fixed; so is the customer's approval
    --    once the request is approved and it is entered (it may still be entered after MOESA
    --    approves).
    IF TG_OP = 'UPDATE' AND (
        NEW.code IS DISTINCT FROM OLD.code
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR OLD.status IN ('approved', 'applied') AND (
            OLD.customer_approved_on IS NOT NULL AND NEW.customer_approved_on IS DISTINCT FROM OLD.customer_approved_on
            OR OLD.customer_approval_document_id IS NOT NULL
               AND NEW.customer_approval_document_id IS DISTINCT FROM OLD.customer_approval_document_id
        )
    ) THEN
        RAISE EXCEPTION 'change_request_immutable_field' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN NEW;
    END IF;

    -- Server-set: MOESA's approval and the closing date are set below on the transition that sets
    -- them; otherwise whatever the client sends is ignored.
    IF TG_OP = 'INSERT' THEN
        NEW.moesa_approved_on := NULL;
        NEW.moesa_approved_by := NULL;
        NEW.closed_on := NULL;
    ELSE
        NEW.moesa_approved_on := OLD.moesa_approved_on;
        NEW.moesa_approved_by := OLD.moesa_approved_by;
        NEW.closed_on := OLD.closed_on;
    END IF;

    -- 2. The affected document and the resulting document are the customer's.
    IF NEW.affected_document_id IS NOT NULL THEN
        SELECT d.entity_type, d.entity_id INTO affected_entity_type, affected_entity_id
        FROM public.document d
        WHERE d.id = NEW.affected_document_id AND d.tenant_id = NEW.tenant_id;

        IF private.entity_customer(affected_entity_type, affected_entity_id, NEW.tenant_id) IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION 'change_request_document_invalid' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.result_document_id IS NOT NULL THEN
        SELECT d.entity_type, d.entity_id INTO affected_entity_type, affected_entity_id
        FROM public.document d
        WHERE d.id = NEW.result_document_id AND d.tenant_id = NEW.tenant_id;

        IF private.entity_customer(affected_entity_type, affected_entity_id, NEW.tenant_id) IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION 'change_request_document_invalid' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 3. The customer's written approval is a signed or approved document of this request.
    IF NEW.customer_approval_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document d
        WHERE d.id = NEW.customer_approval_document_id
          AND d.tenant_id = NEW.tenant_id
          AND d.entity_type = 'change_request'
          AND d.entity_id = NEW.id
          AND d.status IN ('signed', 'approved')
    ) THEN
        RAISE EXCEPTION 'change_request_approval_document_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        -- 4. open → approved | rejected; approved → applied.
        IF NOT (OLD.status = 'open' AND NEW.status IN ('approved', 'rejected')
                OR OLD.status = 'approved' AND NEW.status = 'applied') THEN
            RAISE EXCEPTION 'change_request_status_order' USING ERRCODE = 'check_violation';
        END IF;

        -- 5. Approving: MOESA's date and approver; the customer's approval after a passed gate of
        --    the project that needs it (S08 §4).
        IF NEW.status = 'approved' THEN
            NEW.moesa_approved_on := (now() AT TIME ZONE 'UTC')::DATE;
            NEW.moesa_approved_by := auth.uid();
            IF NEW.project_id IS NOT NULL AND NEW.affected_gate_code IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM public.project_gate g
                   WHERE g.project_id = NEW.project_id
                     AND g.tenant_id = NEW.tenant_id
                     AND g.code = NEW.affected_gate_code
                     AND g.status = 'passed'
                     AND g.needs_customer_approval
               )
               AND (NEW.customer_approved_on IS NULL OR NEW.customer_approval_document_id IS NULL) THEN
                RAISE EXCEPTION 'change_request_customer_approval_required' USING ERRCODE = 'check_violation';
            END IF;
        END IF;

        -- 6. Rejecting says why.
        IF NEW.status = 'rejected' AND nullif(btrim(NEW.decision_note), '') IS NULL THEN
            RAISE EXCEPTION 'change_request_decision_note_required' USING ERRCODE = 'check_violation';
        END IF;

        -- 7. Applying a request that changes a document needs its new version: the same record and
        --    type, a higher version.
        IF NEW.status = 'applied' AND NEW.affected_document_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
            FROM public.document a
            JOIN public.document r
                ON r.tenant_id = a.tenant_id
               AND r.entity_type = a.entity_type
               AND r.entity_id = a.entity_id
               AND r.type = a.type
               AND r.version > a.version
            WHERE a.id = NEW.affected_document_id
              AND a.tenant_id = NEW.tenant_id
              AND r.id = NEW.result_document_id
        ) THEN
            RAISE EXCEPTION 'change_request_new_version_required' USING ERRCODE = 'check_violation';
        END IF;

        -- 8. Rejecting or applying closes it.
        IF NEW.status IN ('applied', 'rejected') THEN
            NEW.closed_on := (now() AT TIME ZONE 'UTC')::DATE;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- BEFORE triggers fire in name order: the z sorts the guard after change_request_due and
-- change_request_set_code.
CREATE OR REPLACE TRIGGER change_request_z_guard BEFORE INSERT
OR
UPDATE ON public.change_request FOR EACH ROW
EXECUTE FUNCTION private.change_request_guard ();

-- The products a request touches (S08 A), of the request's customer.
CREATE TABLE IF NOT EXISTS public.change_request_product (
   change_request_id UUID NOT NULL,
   product_id UUID NOT NULL,
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   -- Set by the change_request_product_customer trigger: the request's customer.
   customer_id UUID NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY (change_request_id, product_id),
   CONSTRAINT change_request_product_cr_fkey FOREIGN KEY (change_request_id, customer_id, tenant_id) REFERENCES public.change_request (id, customer_id, tenant_id) ON DELETE CASCADE,
   CONSTRAINT change_request_product_product_fkey FOREIGN KEY (product_id, customer_id, tenant_id) REFERENCES public.product (id, customer_id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_change_request_product_product ON public.change_request_product (tenant_id, product_id);

-- The row's customer is its request's, whatever the client sends. SECURITY DEFINER: it reads the
-- request in the row's own tenant. A request that is not there keeps the sent customer, so the
-- foreign key (or NOT NULL) reports it.
CREATE OR REPLACE FUNCTION private.change_request_product_customer () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    NEW.customer_id := coalesce((
        SELECT r.customer_id FROM public.change_request r
        WHERE r.id = NEW.change_request_id AND r.tenant_id = NEW.tenant_id
    ), NEW.customer_id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER change_request_product_customer BEFORE INSERT ON public.change_request_product FOR EACH ROW
EXECUTE FUNCTION private.change_request_product_customer ();

REVOKE ALL ON FUNCTION private.change_request_set_code () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.change_request_due () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.change_request_guard () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.change_request_product_customer () FROM PUBLIC, anon, authenticated;

-- The customer a record belongs to (025_media_link.sql), now with change requests. The
-- 035_incidents.sql body, with the change request branch added.
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
        WHEN 'incident' THEN
            RETURN (SELECT i.customer_id FROM public.incident i WHERE i.id = entity_customer.entity_id AND i.tenant_id = entity_customer.tenant_id);
        WHEN 'change_request' THEN
            RETURN (SELECT r.customer_id FROM public.change_request r WHERE r.id = entity_customer.entity_id AND r.tenant_id = entity_customer.tenant_id);
        ELSE
            RETURN NULL;
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION private.entity_customer (public.document_entity, UUID, UUID) FROM PUBLIC, anon, authenticated;

SELECT
   private.enable_tenant_level_security (t_name)
FROM
   unnest(ARRAY['change_request', 'change_request_product']) AS t_name;

SELECT
   private.audit_enable ('public.change_request'::REGCLASS);

SELECT
   private.audit_enable ('public.change_request_product'::REGCLASS);

INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('change_request', TRUE, 210)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete on change requests (rejected or applied instead); a request's products are removed one
-- by one.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.change_request', 'change_request', 'select', 'read', FALSE, FALSE, NULL),
   ('public.change_request', 'change_request', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.change_request', 'change_request', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.change_request_product', 'change_request', 'select', 'read', FALSE, FALSE, NULL),
   ('public.change_request_product', 'change_request', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.change_request_product', 'change_request', 'delete', 'modify', FALSE, TRUE, NULL)
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
   AND p.resource_name IN ('public.change_request', 'public.change_request_product')
ON CONFLICT DO NOTHING;

-- Every permission of the group to each role that may change products (029_purchase_orders.sql).
SELECT
   private.grant_group_to_product_editors ('change_request');
