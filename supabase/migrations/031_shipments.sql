-- Shipments (M7, S15, S16): goods of one customer's purchase orders on their way to one of its
-- warehouses, what is on board, the S15 communication log and the acceptance at delivery.
--
-- shipment                 One shipment for one customer to one of its warehouses
--                          (customer_warehouse, the same customer). Its code (SHP-THO-2026-001)
--                          comes from public.next_code and never changes; nor does its customer.
--                          The mode, parties, Incoterms (buy and sell), dates, container, free days,
--                          packed quantities and the acceptance (who, when, whether the quantities
--                          match, damage, the dispute deadline) sit on the shipment. Shipments are
--                          cancelled (status), never deleted.
-- shipment_purchase_order  The orders on the shipment, of the shipment's customer (the link takes
--                          the shipment's customer whatever the client sends).
-- shipment_line            What is shipped of an order line: the line's order must be on the
--                          shipment (shipment_line_link_fkey); shipment_line_shipment_fkey is the
--                          direct parent, for embeds and the cascade.
-- shipment_event           The S15 §B communication log: when, which S15 row (step 1–20, NULL for
--                          "other"), from whom to whom, over which channel, and a note.
--
-- Status flow   planned → booked → loaded → in_transit → (at_customs →) delivered → accepted, or
--               delivered → disputed → accepted. A planned or booked shipment may be cancelled;
--               accepted and cancelled are final. A new shipment is planned (the code trigger).
--               booked needs an order and the booking confirmation date; loaded a line; in_transit
--               ETD and ETA; delivered the delivery time; accepted the signed or approved delivery
--               receipt (G5 evidence) and, straight from delivered, no reservation (the quantities
--               match, no damage: S16 says a delivery with reservations, or a refusal, is
--               disputed); a disputed shipment is accepted with the reservations it records, once
--               the dispute is settled. Entering delivered fills an empty
--               dispute deadline: the delivery time plus the shortest damage-notice time of the
--               orders' suppliers (none when no supplier has one); it stays editable (S16 §F,
--               "sözleşmeye göre"). Entering accepted dates it today unless a date is given.
-- Orders        Only an order whose PI is approved and that is not closed (pi_approved …
--               balance_paid) is linked. An order that still has lines on the shipment is not
--               unlinked.
-- Quantities    The quantity of an order line on the shipments that are not cancelled stays within
--               floor(ordered × (1 + tolerance_pct / 100)).
-- Locks         From loaded on (and once cancelled) the shipment's orders and lines no longer
--               change.
-- PSI           A PSI before the balance and the loading is a warning (shipment_overview's
--               psi_missing_po_codes), not a rule (M7).
--
-- Each rule is a violation whose message is the rule's code:
--   shipment_customer_missing           (foreign_key_violation) the customer is not there in the
--                                       shipment's tenant, or the caller cannot see it
--   shipment_immutable_field            the shipment's code or customer changed
--   shipment_status_order               not an allowed transition, or out of a final status
--   shipment_po_required                booked without an order
--   shipment_booking_date_required      booked without the booking confirmation date
--   shipment_lines_required             loaded without a line
--   shipment_eta_required               in_transit without ETD or ETA
--   shipment_delivery_time_required     delivered without the delivery time
--   shipment_delivery_receipt_required  accepted without a signed or approved delivery receipt
--   shipment_acceptance_issue           accepted from delivered with quantities that differ or
--                                       damage (from disputed it is accepted as it is)
--   shipment_locked                     an order or line of a loaded (or later) or cancelled
--                                       shipment changed
--   shipment_po_not_open                linking an order outside pi_approved … balance_paid
--   shipment_po_has_lines               unlinking an order that still has lines on the shipment
--   shipment_quantity_exceeds_po        more of an order line than ordered, tolerance included
-- (all check_violation but the first) and the constraints the UI names (errors.<code>):
--   shipment_warehouse_fkey          shipment_warehouse_customer  another customer's warehouse
--   shipment_incoterm_buy_valid      incoterm_invalid             not an Incoterms 2020 code
--   shipment_incoterm_sell_valid     incoterm_invalid
--   shipment_purchase_order_po_fkey  shipment_po_customer         another customer's order
--   shipment_line_link_fkey          shipment_line_po_not_linked  the line's order is not on it
--   unique_shipment_line             shipment_line_duplicate      the order line is already on it
--
-- Every reference to a tenant-scoped table includes tenant_id; the warehouse and the orders also
-- include customer_id (the new key customer_warehouse_id_customer_tenant_key is the warehouse's
-- target). Customers, warehouses, orders and order lines are not deleted while shipped, so the
-- references to them are ON DELETE RESTRICT; the links, lines and events go with their shipment.
--
-- The guards are SECURITY DEFINER (they read orders, suppliers, documents and other shipments
-- whatever the caller may read) and filter on the row's tenant. The link and line guards read the
-- shipment FOR SHARE, so a concurrent move to loaded (or cancelled) and a link or line write are
-- serialised; the link guard reads the order FOR SHARE too, and the line guard locks the order line
-- (FOR NO KEY UPDATE), so two shipments' lines of one order line are capped one after the other. A
-- delete cascaded from the shipment or the tenant (pg_trigger_depth() > 1) is not checked. The
-- guards return at once when private.rules_bypassed() (030_purchase_order_rules.sql); the code
-- trigger and the immutability rule ignore it.
--
-- public.shipment_overview: each shipment with its customer code, warehouse name, its orders (ids
-- and codes), the products of its lines and the codes of its orders without an approved PSI report.
-- private.entity_customer knows shipments, so their media stays the customer's.
--
-- Roles: the module is granted to every existing role that may change products
-- (private.grant_group_to_product_editors); private.seed_ops_roles gives it to the demo company's
-- roles.

CREATE TYPE public.shipment_mode AS ENUM ('fcl20', 'fcl40', 'lcl', 'road', 'courier', 'air');

CREATE TYPE public.shipment_status AS ENUM (
   'planned',
   'booked',
   'loaded',
   'in_transit',
   'at_customs',
   'delivered',
   'accepted',
   'disputed',
   'cancelled'
);

-- Target of the reference that keeps a shipment's warehouse within its customer.
ALTER TABLE public.customer_warehouse
ADD CONSTRAINT customer_warehouse_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id);

-- Shipments
CREATE TABLE IF NOT EXISTS public.shipment (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   -- Set by the shipment_set_code trigger; whatever the client sends is replaced.
   code TEXT,
   status public.shipment_status NOT NULL DEFAULT 'planned',
   mode public.shipment_mode NOT NULL,
   delivery_warehouse_id UUID NOT NULL,
   forwarder TEXT,
   customs_broker TEXT,
   carrier TEXT,
   incoterm_buy TEXT,
   incoterm_sell TEXT,
   is_insured BOOLEAN NOT NULL DEFAULT FALSE,
   -- Dates
   ready_on DATE,
   booking_confirmed_on DATE,
   etd DATE,
   eta DATE,
   customs_cleared_on DATE,
   planned_delivery_on DATE,
   delivered_at TIMESTAMPTZ,
   -- Transport
   container_no TEXT,
   seal_no TEXT,
   free_days_port INT CHECK (free_days_port >= 0),
   free_days_detention INT CHECK (free_days_detention >= 0),
   demurrage_note TEXT,
   -- Packed quantities
   carton_count INT CHECK (carton_count >= 0),
   pallet_count INT CHECK (pallet_count >= 0),
   volume_m3 NUMERIC(10, 3) CHECK (volume_m3 >= 0),
   gross_kg NUMERIC(12, 2) CHECK (gross_kg >= 0),
   -- Acceptance (S16)
   accepted_by TEXT,
   accepted_on DATE,
   quantity_matches BOOLEAN,
   has_damage BOOLEAN,
   dispute_deadline_at TIMESTAMPTZ,
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   -- The counters behind the codes are per tenant (public.code_sequence), so the code is too.
   CONSTRAINT unique_shipment_code UNIQUE (tenant_id, code),
   -- Targets of the tenant-scoped (and customer-scoped) foreign keys of the shipment's child rows.
   CONSTRAINT shipment_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT shipment_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id),
   CONSTRAINT shipment_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT shipment_warehouse_fkey FOREIGN KEY (delivery_warehouse_id, customer_id, tenant_id) REFERENCES public.customer_warehouse (id, customer_id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT shipment_incoterm_buy_valid CHECK (incoterm_buy IS NULL OR private.incoterm_valid (incoterm_buy)),
   CONSTRAINT shipment_incoterm_sell_valid CHECK (incoterm_sell IS NULL OR private.incoterm_valid (incoterm_sell))
);

CREATE INDEX IF NOT EXISTS idx_shipment_customer ON public.shipment (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_shipment_warehouse ON public.shipment (tenant_id, delivery_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_shipment_tenant_status ON public.shipment (tenant_id, status);

-- Shipments are cancelled, not deleted.
REVOKE DELETE ON public.shipment FROM anon, authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.shipment FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The shipment's code: SHP, the customer's code, the year and the customer's next number; and the
-- planned status, whatever the client sends. A customer the caller cannot see in the shipment's
-- tenant is a missing customer (23503), as the foreign key would report it.
CREATE OR REPLACE FUNCTION private.shipment_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'shipment_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code('shp', customer_code);
    NEW.status := 'planned';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER shipment_set_code BEFORE INSERT ON public.shipment FOR EACH ROW
EXECUTE FUNCTION private.shipment_set_code ();

-- The shipment's rules (see the header), in this order: the fixed code and customer (whatever the
-- bypass flag), the status flow, then what the status being entered needs.
CREATE OR REPLACE FUNCTION private.shipment_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    allowed BOOLEAN;
    notice_hours INT;
BEGIN
    -- 1. The code and the customer are fixed.
    IF NEW.code IS DISTINCT FROM OLD.code OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
        RAISE EXCEPTION 'shipment_immutable_field' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    -- 2. The allowed transitions; accepted and cancelled are final.
    allowed := CASE OLD.status
        WHEN 'planned' THEN NEW.status IN ('booked', 'cancelled')
        WHEN 'booked' THEN NEW.status IN ('loaded', 'cancelled')
        WHEN 'loaded' THEN NEW.status = 'in_transit'
        WHEN 'in_transit' THEN NEW.status IN ('at_customs', 'delivered')
        WHEN 'at_customs' THEN NEW.status = 'delivered'
        WHEN 'delivered' THEN NEW.status IN ('accepted', 'disputed')
        WHEN 'disputed' THEN NEW.status = 'accepted'
        ELSE FALSE
    END;
    IF NOT allowed THEN
        RAISE EXCEPTION 'shipment_status_order' USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Booked: an order, and the booking confirmation date.
    IF NEW.status = 'booked' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.shipment_purchase_order sp WHERE sp.shipment_id = NEW.id AND sp.tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'shipment_po_required' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.booking_confirmed_on IS NULL THEN
            RAISE EXCEPTION 'shipment_booking_date_required' USING ERRCODE = 'check_violation';
        END IF;

    --    Loaded: at least one line (no goods, nothing to load).
    ELSIF NEW.status = 'loaded' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.shipment_line sl WHERE sl.shipment_id = NEW.id AND sl.tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'shipment_lines_required' USING ERRCODE = 'check_violation';
        END IF;

    -- 4. In transit: ETD and ETA.
    ELSIF NEW.status = 'in_transit' THEN
        IF NEW.etd IS NULL OR NEW.eta IS NULL THEN
            RAISE EXCEPTION 'shipment_eta_required' USING ERRCODE = 'check_violation';
        END IF;

    -- 5. Delivered: the delivery time; an empty dispute deadline from the suppliers' shortest
    --    damage-notice time.
    ELSIF NEW.status = 'delivered' THEN
        IF NEW.delivered_at IS NULL THEN
            RAISE EXCEPTION 'shipment_delivery_time_required' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.dispute_deadline_at IS NULL THEN
            SELECT min(s.damage_notice_hours) INTO notice_hours
            FROM public.shipment_purchase_order sp
            JOIN public.purchase_order po ON po.id = sp.purchase_order_id AND po.tenant_id = sp.tenant_id
            JOIN public.supplier s ON s.id = po.supplier_id AND s.tenant_id = po.tenant_id
            WHERE sp.shipment_id = NEW.id AND sp.tenant_id = NEW.tenant_id;
            NEW.dispute_deadline_at := NEW.delivered_at + notice_hours * INTERVAL '1 hour';
        END IF;

    -- 6. Accepted: the signed or approved delivery receipt and, straight from delivered, no
    --    reservation. A disputed shipment is accepted as it is: the dispute settled the reservation
    --    its quantities and damage record.
    ELSIF NEW.status = 'accepted' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.document d
            WHERE d.tenant_id = NEW.tenant_id
              AND d.entity_type = 'shipment'
              AND d.entity_id = NEW.id
              AND d.type = 'delivery_receipt'
              AND d.status IN ('signed', 'approved')
        ) THEN
            RAISE EXCEPTION 'shipment_delivery_receipt_required' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status = 'delivered' AND (NEW.quantity_matches IS NOT TRUE OR NEW.has_damage IS NOT FALSE) THEN
            RAISE EXCEPTION 'shipment_acceptance_issue' USING ERRCODE = 'check_violation';
        END IF;
        NEW.accepted_on := coalesce(NEW.accepted_on, current_date);
    END IF;

    RETURN NEW;
END;
$$;

-- BEFORE triggers fire in name order: the z sorts the guard last, as purchase_order_z_guard.
CREATE OR REPLACE TRIGGER shipment_z_guard BEFORE
UPDATE ON public.shipment FOR EACH ROW
EXECUTE FUNCTION private.shipment_guard ();

-- Orders on a shipment
CREATE TABLE IF NOT EXISTS public.shipment_purchase_order (
   shipment_id UUID NOT NULL,
   purchase_order_id UUID NOT NULL,
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   -- Set by the shipment_purchase_order_customer trigger to the shipment's customer.
   customer_id UUID NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT shipment_purchase_order_pkey PRIMARY KEY (shipment_id, purchase_order_id),
   CONSTRAINT shipment_purchase_order_link_key UNIQUE (shipment_id, purchase_order_id, tenant_id),
   CONSTRAINT shipment_purchase_order_shipment_fkey FOREIGN KEY (shipment_id, customer_id, tenant_id) REFERENCES public.shipment (id, customer_id, tenant_id) ON DELETE CASCADE,
   CONSTRAINT shipment_purchase_order_po_fkey FOREIGN KEY (purchase_order_id, customer_id, tenant_id) REFERENCES public.purchase_order (id, customer_id, tenant_id) ON DELETE RESTRICT
);

-- An order's shipments (shipment_overview's filter, the order's Shipments tab).
CREATE INDEX IF NOT EXISTS idx_shipment_purchase_order_po ON public.shipment_purchase_order (tenant_id, purchase_order_id);

-- A link is the shipment's customer's, whatever the client sends. SECURITY DEFINER, in the link's
-- own tenant only; a shipment that is not there leaves the customer to the NOT NULL and the
-- foreign key.
CREATE OR REPLACE FUNCTION private.shipment_purchase_order_customer () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    shipment_customer UUID;
BEGIN
    SELECT s.customer_id INTO shipment_customer
    FROM public.shipment s
    WHERE s.id = NEW.shipment_id AND s.tenant_id = NEW.tenant_id;

    IF shipment_customer IS NOT NULL THEN
        NEW.customer_id := shipment_customer;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER shipment_purchase_order_customer BEFORE INSERT ON public.shipment_purchase_order FOR EACH ROW
EXECUTE FUNCTION private.shipment_purchase_order_customer ();

-- Shipment lines
CREATE TABLE IF NOT EXISTS public.shipment_line (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   shipment_id UUID NOT NULL,
   purchase_order_id UUID NOT NULL,
   purchase_order_line_id UUID NOT NULL,
   quantity INT NOT NULL CHECK (quantity > 0),
   carton_count INT CHECK (carton_count >= 0),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT unique_shipment_line UNIQUE (shipment_id, purchase_order_line_id),
   CONSTRAINT shipment_line_shipment_fkey FOREIGN KEY (shipment_id, tenant_id) REFERENCES public.shipment (id, tenant_id) ON DELETE CASCADE,
   CONSTRAINT shipment_line_link_fkey FOREIGN KEY (shipment_id, purchase_order_id, tenant_id) REFERENCES public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT shipment_line_po_line_fkey FOREIGN KEY (purchase_order_line_id, purchase_order_id, tenant_id) REFERENCES public.purchase_order_line (id, purchase_order_id, tenant_id) ON DELETE RESTRICT
);

-- The order line's shipped quantity (the cap), and the link's lines.
CREATE INDEX IF NOT EXISTS idx_shipment_line_po_line ON public.shipment_line (tenant_id, purchase_order_line_id);

CREATE INDEX IF NOT EXISTS idx_shipment_line_link ON public.shipment_line (shipment_id, purchase_order_id, tenant_id);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.shipment_line FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- Shipment events (S15 §B)
CREATE TABLE IF NOT EXISTS public.shipment_event (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   shipment_id UUID NOT NULL,
   happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   -- The S15 §B row; NULL means "other".
   step SMALLINT CHECK (step BETWEEN 1 AND 20),
   from_party TEXT,
   to_party TEXT,
   channel TEXT,
   note TEXT,
   created_by UUID DEFAULT auth.uid (),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT shipment_event_shipment_fkey FOREIGN KEY (shipment_id, tenant_id) REFERENCES public.shipment (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shipment_event_shipment ON public.shipment_event (tenant_id, shipment_id, happened_at);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.shipment_event FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- A link's rules: not on a loaded (or later) or cancelled shipment; only an order whose PI is
-- approved and that is not closed; an order that still has lines on the shipment stays. This BEFORE
-- trigger answers before the line's RESTRICT foreign key, so the user sees the named code.
CREATE OR REPLACE FUNCTION private.shipment_purchase_order_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    link RECORD;
    shipment_status public.shipment_status;
    order_status public.purchase_order_status;
BEGIN
    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- A delete cascaded from the shipment or the tenant.
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        link := NEW;
    ELSE
        link := OLD;
    END IF;

    -- FOR SHARE: a concurrent move to loaded (or cancelled) waits for this write to commit, and
    -- this write waits for one in flight, then sees it; the foreign key's FOR KEY SHARE would not.
    SELECT s.status INTO shipment_status
    FROM public.shipment s
    WHERE s.id = link.shipment_id AND s.tenant_id = link.tenant_id
    FOR SHARE;
    IF shipment_status >= 'loaded' THEN
        RAISE EXCEPTION 'shipment_locked' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- FOR SHARE: the order does not close or cancel while it is being linked.
        SELECT po.status INTO order_status
        FROM public.purchase_order po
        WHERE po.id = NEW.purchase_order_id AND po.tenant_id = NEW.tenant_id
        FOR SHARE;
        IF order_status NOT BETWEEN 'pi_approved' AND 'balance_paid' THEN
            RAISE EXCEPTION 'shipment_po_not_open' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.shipment_line l
        WHERE l.shipment_id = OLD.shipment_id AND l.purchase_order_id = OLD.purchase_order_id AND l.tenant_id = OLD.tenant_id
    ) THEN
        RAISE EXCEPTION 'shipment_po_has_lines' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER shipment_purchase_order_guard BEFORE INSERT
OR DELETE ON public.shipment_purchase_order FOR EACH ROW
EXECUTE FUNCTION private.shipment_purchase_order_guard ();

-- A line's rules: not on a loaded (or later) or cancelled shipment (the shipment before and after
-- an update); the order line's quantity on the shipments that are not cancelled stays within the
-- ordered quantity plus the order's tolerance.
CREATE OR REPLACE FUNCTION private.shipment_line_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    shipment_status public.shipment_status;
    ordered INT;
    tolerance NUMERIC;
    shipped BIGINT;
BEGIN
    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- A delete cascaded from the shipment or the tenant.
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    -- FOR SHARE: a concurrent move to loaded (or cancelled) waits for this write to commit, and
    -- this write waits for one in flight, then sees it; the foreign key's FOR KEY SHARE would not.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT s.status INTO shipment_status
        FROM public.shipment s
        WHERE s.id = OLD.shipment_id AND s.tenant_id = OLD.tenant_id
        FOR SHARE;
        IF shipment_status >= 'loaded' THEN
            RAISE EXCEPTION 'shipment_locked' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        SELECT s.status INTO shipment_status
        FROM public.shipment s
        WHERE s.id = NEW.shipment_id AND s.tenant_id = NEW.tenant_id
        FOR SHARE;
        IF shipment_status >= 'loaded' THEN
            RAISE EXCEPTION 'shipment_locked' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- FOR NO KEY UPDATE on the order line: two lines of it on different shipments are capped one
    -- after the other (it does not conflict with the foreign keys' FOR KEY SHARE). An order line
    -- that is not there is left to the foreign key.
    SELECT pol.quantity, coalesce(po.tolerance_pct, 0) INTO ordered, tolerance
    FROM public.purchase_order_line pol
    JOIN public.purchase_order po ON po.id = pol.purchase_order_id AND po.tenant_id = pol.tenant_id
    WHERE pol.id = NEW.purchase_order_line_id AND pol.tenant_id = NEW.tenant_id
    FOR NO KEY UPDATE OF pol;
    IF ordered IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT coalesce(sum(l.quantity), 0) INTO shipped
    FROM public.shipment_line l
    JOIN public.shipment s ON s.id = l.shipment_id AND s.tenant_id = l.tenant_id
    WHERE l.purchase_order_line_id = NEW.purchase_order_line_id
      AND l.tenant_id = NEW.tenant_id
      AND l.id <> NEW.id
      AND s.status <> 'cancelled';

    IF shipped + NEW.quantity > floor(ordered * (1 + tolerance / 100)) THEN
        RAISE EXCEPTION 'shipment_quantity_exceeds_po' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER shipment_line_guard BEFORE INSERT
OR
UPDATE
OR DELETE ON public.shipment_line FOR EACH ROW
EXECUTE FUNCTION private.shipment_line_guard ();

REVOKE ALL ON FUNCTION private.shipment_set_code () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.shipment_guard () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.shipment_purchase_order_customer () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.shipment_purchase_order_guard () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.shipment_line_guard () FROM PUBLIC, anon, authenticated;

-- The customer a record belongs to (025_media_link.sql), now with shipments.
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
        ELSE
            RETURN NULL;
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION private.entity_customer (public.document_entity, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The shipment screens' list and header. Runs as the caller (security_invoker), so it shows only
-- the shipments, codes, orders, lines and documents the caller may read.
CREATE OR REPLACE VIEW public.shipment_overview
WITH
   (security_invoker = TRUE) AS
SELECT
   s.*,
   c.code::TEXT AS customer_code,
   w.display_name AS warehouse_name,
   o.purchase_order_ids,
   o.purchase_order_codes,
   o.psi_missing_po_codes,
   ln.product_ids
FROM
   public.shipment s
   LEFT JOIN public.customer c ON c.id = s.customer_id
   AND c.tenant_id = s.tenant_id
   LEFT JOIN public.customer_warehouse w ON w.id = s.delivery_warehouse_id
   AND w.tenant_id = s.tenant_id
   LEFT JOIN LATERAL (
      SELECT
         coalesce(array_agg(po.id ORDER BY po.code, po.id), '{}') AS purchase_order_ids,
         coalesce(array_agg(po.code ORDER BY po.code, po.id), '{}') AS purchase_order_codes,
         coalesce(
            array_agg(po.code ORDER BY po.code, po.id) FILTER (
               WHERE
                  NOT EXISTS (
                     SELECT
                        1
                     FROM
                        public.document d
                     WHERE
                        d.tenant_id = po.tenant_id
                        AND d.entity_type = 'purchase_order'
                        AND d.entity_id = po.id
                        AND d.type = 'psi_report'
                        AND d.status = 'approved'
                  )
            ),
            '{}'
         ) AS psi_missing_po_codes
      FROM
         public.shipment_purchase_order sp
         JOIN public.purchase_order po ON po.id = sp.purchase_order_id
         AND po.tenant_id = sp.tenant_id
      WHERE
         sp.shipment_id = s.id
         AND sp.tenant_id = s.tenant_id
   ) o ON TRUE
   LEFT JOIN LATERAL (
      SELECT
         coalesce(array_agg(DISTINCT pol.product_id), '{}') AS product_ids
      FROM
         public.shipment_line l
         JOIN public.purchase_order_line pol ON pol.id = l.purchase_order_line_id
         AND pol.tenant_id = l.tenant_id
      WHERE
         l.shipment_id = s.id
         AND l.tenant_id = s.tenant_id
   ) ln ON TRUE;

COMMENT ON VIEW public.shipment_overview IS 'Per shipment: every column of the shipment, customer_code, warehouse_name (the delivery warehouse), purchase_order_ids and purchase_order_codes (its orders, by code; filter the list with purchase_order_ids), product_ids (the products of its lines; filter with product_ids, not by embedding through the view) and psi_missing_po_codes (its orders without an approved PSI report: a warning before the balance and the loading, M7, not a rule).';

GRANT SELECT ON public.shipment_overview TO authenticated;

SELECT
   private.enable_tenant_level_security (t_name)
FROM
   unnest(ARRAY['shipment', 'shipment_purchase_order', 'shipment_line', 'shipment_event']) AS t_name;

SELECT
   private.audit_enable ('public.shipment'::REGCLASS);

SELECT
   private.audit_enable ('public.shipment_purchase_order'::REGCLASS);

SELECT
   private.audit_enable ('public.shipment_line'::REGCLASS);

SELECT
   private.audit_enable ('public.shipment_event'::REGCLASS);

INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('shipment', TRUE, 180)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete on shipments (cancelled instead); a link is added or removed, never changed.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.shipment', 'shipment', 'select', 'read', FALSE, FALSE, NULL),
   ('public.shipment', 'shipment', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.shipment', 'shipment', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.shipment_purchase_order', 'shipment', 'select', 'read', FALSE, FALSE, NULL),
   ('public.shipment_purchase_order', 'shipment', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.shipment_purchase_order', 'shipment', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.shipment_line', 'shipment', 'select', 'read', FALSE, FALSE, NULL),
   ('public.shipment_line', 'shipment', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.shipment_line', 'shipment', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.shipment_line', 'shipment', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.shipment_event', 'shipment', 'select', 'read', FALSE, FALSE, NULL),
   ('public.shipment_event', 'shipment', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.shipment_event', 'shipment', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.shipment_event', 'shipment', 'delete', 'modify', FALSE, TRUE, NULL)
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
      'public.shipment',
      'public.shipment_purchase_order',
      'public.shipment_line',
      'public.shipment_event'
   )
ON CONFLICT DO NOTHING;

-- Every permission of the group to each role that may change products (029_purchase_orders.sql).
SELECT
   private.grant_group_to_product_editors ('shipment');
