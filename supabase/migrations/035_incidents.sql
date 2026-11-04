-- Incidents (S17, Y10): what went wrong, for which customer, how bad, who was told, what was
-- logged and paid, the deadlines it runs against, and how it closed.
--
-- incident           One incident of one customer. Its code is the family, the customer's code,
--                    the year and the customer's next number of that family (OL-THO-2026-001,
--                    public.next_code), whatever the client sends; the code, the customer and the
--                    family never change. incident_type is the Y10 card (OL-09, …) of the same
--                    family, NULL while not yet classified. It may name one linked record of the
--                    same customer (a project, purchase order, shipment, product or market cell).
--                    Incidents are never deleted.
-- incident_log       The running log (S17 C): what was done, with whom, what was decided and what
--                    it cost, who pays and whether the customer approved it.
-- incident_deadline  The time limits the incident runs against (S17 B "süre sınırları", Y10 §4).
--                    The log and the deadlines go with their incident (ON DELETE CASCADE).
--
-- Severity     s1 critical, s2 major, s3 minor (S17 B). The customer is due to be told
--              (customer_notice_due_at, recomputed on every write): s1 within the company setting
--              s1_customer_notify_hours of the opening (4; a non-numeric setting counts as
--              missing), s2 by the end (23:59:59 UTC) of the same business day, the next one when
--              opened on a weekend; s3 in the weekly summary (NULL).
-- Status flow  open → contained | closed; contained → closed; closed is final. An s1 or s2 leaves
--              open only once management was told (management_notified_at). Closing needs the
--              outcome, the root cause and the preventive action (S17 D); an s1 is closed only by
--              someone who may change the company (update on public.tenant: management). Closing
--              dates it (closed_on, today) and names who closed it (closed_by).
-- Deadlines    An empty due time is calculated from the incident's opening: supplier_damage and
--              platform_escalation 48 hours, carrier_claim 7 days (CMR, road), document_request
--              the end (23:59:59 UTC) of the company setting document_request_days business days
--              later (5). Other kinds need their due time.
-- Closed       A closed incident's log and deadlines no longer change.
-- Business days are Monday to Friday, with no holiday calendar (public.add_business_days); every
-- time is UTC.
--
-- Each rule is a violation whose message is the rule's code (check_violation unless stated):
--   incident_customer_missing            the customer is not there (foreign_key_violation)
--   incident_immutable_field             the code, customer or family changed
--   incident_type_family                 the Y10 card is of another family
--   incident_entity_invalid              the linked record is missing or another customer's
--   incident_status_order                not an allowed transition, or out of closed
--   incident_management_notice_required  an s1 or s2 leaves open before management was told
--   incident_closure_incomplete          closing without the outcome, root cause or preventive
--                                        action
--   incident_close_management            closing an s1 without the right to change the company
--                                        (insufficient_privilege)
--   incident_closed                      writing the log or deadlines of a closed incident
-- and the constraints the UI names: incident_type_format (a Y10 card code), incident_entity_pair
-- and incident_entity_kind (the linked record), incident_log_cost_complete (a cost with its
-- currency and payer).
--
-- Every reference to a tenant-scoped table includes tenant_id. Customers are not deleted while
-- they have incidents (ON DELETE RESTRICT); users are (ON DELETE SET NULL).
--
-- The code trigger runs as the caller: it reads the customer through RLS and gets the code from
-- public.next_code. The notice, deadline and guard triggers are SECURITY DEFINER (they read the
-- settings, the incident and the linked record whatever the caller may read) and filter on the
-- row's own tenant_id. The guards sort after the other BEFORE triggers (<table>_z_guard). The
-- immutability rule ignores private.rules_bypassed() (030_purchase_order_rules.sql); the other
-- rules return at once when it holds. A delete cascaded from the incident or the tenant
-- (pg_trigger_depth() > 1) is not checked.
--
-- public.incident_overview: each incident with its customer's code, the linked record's label,
-- its next unmet deadline, how many are overdue and whether it repeats (S17 D "Tekrar mı").
-- public.next_code knows the incident families; private.entity_customer knows incidents, so their
-- media and documents stay the customer's.
--
-- Roles: the module is granted to every existing role that may change products
-- (private.grant_group_to_product_editors); private.seed_ops_roles gives it to the demo company's
-- roles.

-- The next code of `kind` for the customer `scope` in the active tenant, this year:
-- project → <SCOPE>-<YYYY>-<NNN>; po, shp, cr and the incident families (ol, oa, ou, ot, om) →
-- <KIND>-<SCOPE>-<YYYY>-<NNN>. The 015_ops_core.sql body, with the incident families added to the
-- kinds. The upsert locks the counter row, so concurrent calls wait for each other and never get
-- the same number.
CREATE OR REPLACE FUNCTION public.next_code (kind TEXT, scope TEXT) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    active UUID := private.tenant_id();
    current_year INT := extract(year FROM now())::INT;
    number INT;
    formatted TEXT;
BEGIN
    IF active IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'tenant_required')::TEXT,
            DETAIL = json_build_object('status', 403, 'headers', json_build_object())::TEXT;
    END IF;

    IF next_code.kind IS NULL OR next_code.kind NOT IN ('project', 'po', 'shp', 'cr', 'ol', 'oa', 'ou', 'ot', 'om')
       OR next_code.scope IS NULL OR next_code.scope !~ '^[A-Z0-9]+$' THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'invalid_code_kind_or_scope')::TEXT,
            DETAIL = json_build_object('status', 400, 'headers', json_build_object())::TEXT;
    END IF;

    INSERT INTO public.code_sequence AS cs (tenant_id, kind, scope, year, last_no)
    VALUES (active, next_code.kind, next_code.scope, current_year, 1)
    ON CONFLICT ON CONSTRAINT code_sequence_pkey DO UPDATE SET last_no = cs.last_no + 1
    RETURNING cs.last_no INTO number;

    -- At least three digits; a 1000th code still gets its full number.
    formatted := next_code.scope || '-' || current_year || '-' || lpad(number::TEXT, greatest(3, length(number::TEXT)), '0');

    IF next_code.kind = 'project' THEN
        RETURN formatted;
    END IF;
    RETURN upper(next_code.kind) || '-' || formatted;
END;
$$;

REVOKE ALL ON FUNCTION public.next_code (TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.next_code (TEXT, TEXT) TO authenticated;

-- The `days`-th business day (Monday to Friday) after `start_on`; for 0, the first business day on
-- or after it. A negative count counts as 0. No holiday calendar.
CREATE OR REPLACE FUNCTION public.add_business_days (start_on DATE, days INT) RETURNS DATE LANGUAGE plpgsql IMMUTABLE STRICT
SET
   search_path = '' AS $$
DECLARE
    d DATE := add_business_days.start_on;
    remaining INT := greatest(add_business_days.days, 0);
BEGIN
    IF remaining = 0 THEN
        WHILE extract(isodow FROM d) > 5 LOOP
            d := d + 1;
        END LOOP;
        RETURN d;
    END IF;

    -- The business days after a Saturday or a Sunday are those after the Friday before it.
    WHILE extract(isodow FROM d) > 5 LOOP
        d := d - 1;
    END LOOP;

    -- From a business day, five business days are a week.
    d := d + (remaining / 5) * 7;
    remaining := remaining % 5;
    WHILE remaining > 0 LOOP
        d := d + 1;
        IF extract(isodow FROM d) <= 5 THEN
            remaining := remaining - 1;
        END IF;
    END LOOP;
    RETURN d;
END;
$$;

REVOKE ALL ON FUNCTION public.add_business_days (DATE, INT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.add_business_days (DATE, INT) TO authenticated;

-- Y10 §5–§7: OL shipment and delivery, OA platform and Amazon, OU product and compliance, OT
-- supplier, OM customer.
CREATE TYPE public.incident_family AS ENUM ('ol', 'oa', 'ou', 'ot', 'om');

CREATE TYPE public.incident_severity AS ENUM ('s1', 's2', 's3');

CREATE TYPE public.incident_status AS ENUM ('open', 'contained', 'closed');

-- S17 B: the parties affected.
CREATE TYPE public.incident_party AS ENUM ('customer', 'supplier', 'forwarder', 'platform', 'warehouse');

-- S17 D
CREATE TYPE public.incident_root_cause AS ENUM (
   'human_error',
   'document_data',
   'communication',
   'supplier',
   'carrier',
   'platform_regulation',
   'customer'
);

CREATE TYPE public.incident_outcome AS ENUM ('full_recovery', 'partial_recovery', 'loss');

-- Y10 §4: the time limits an incident runs against.
CREATE TYPE public.incident_deadline_kind AS ENUM (
   'supplier_damage',
   'carrier_claim',
   'demurrage',
   'supplier_storage',
   'platform_escalation',
   'document_request',
   'other'
);

-- S17 D: who bears a cost (also used by change requests).
CREATE TYPE public.cost_payer AS ENUM ('moesa', 'customer', 'supplier', 'carrier_insurance');

-- Incidents
CREATE TABLE IF NOT EXISTS public.incident (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   -- Set by the incident_set_code trigger; whatever the client sends is replaced.
   code TEXT,
   family public.incident_family NOT NULL,
   -- The Y10 card (OL-09, …); NULL while not yet classified ("sınıflandırılacak").
   incident_type TEXT,
   severity public.incident_severity NOT NULL,
   status public.incident_status NOT NULL DEFAULT 'open',
   owner_id UUID DEFAULT auth.uid (),
   -- Opening (S17 A). reported_by: a role and a channel, no personal contact details (K8).
   title TEXT NOT NULL,
   what_happened TEXT NOT NULL,
   reported_by TEXT,
   current_state TEXT,
   immediate_action TEXT,
   entity_type public.document_entity,
   entity_id UUID,
   opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   -- Classification (S17 B). customer_notice_due_at is set by the incident_notice_due trigger.
   affected_parties public.incident_party[] NOT NULL DEFAULT '{}',
   management_notified_at TIMESTAMPTZ,
   customer_notice_due_at TIMESTAMPTZ,
   customer_notified_at TIMESTAMPTZ,
   -- Closure (S17 D). closed_on and closed_by are set when it closes.
   outcome public.incident_outcome,
   root_cause public.incident_root_cause,
   root_cause_note TEXT,
   impact_note TEXT,
   lessons TEXT,
   preventive_action TEXT,
   customer_closure_notified_on DATE,
   closed_on DATE,
   closed_by UUID,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT unique_incident_code UNIQUE (tenant_id, code),
   -- Target of the tenant-scoped foreign keys of the incident's child rows and of gate rollbacks.
   CONSTRAINT incident_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT incident_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT,
   CONSTRAINT incident_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.user (id) ON DELETE SET NULL,
   CONSTRAINT incident_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.user (id) ON DELETE SET NULL,
   CONSTRAINT incident_type_format CHECK (incident_type IS NULL OR incident_type ~ '^(OL|OA|OU|OT|OM)-[0-9]{2}$'),
   CONSTRAINT incident_entity_pair CHECK ((entity_type IS NULL) = (entity_id IS NULL)),
   CONSTRAINT incident_entity_kind CHECK (entity_type IS NULL OR entity_type IN ('project', 'purchase_order', 'shipment', 'product', 'market_cell'))
);

CREATE INDEX IF NOT EXISTS idx_incident_customer ON public.incident (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_incident_tenant_status ON public.incident (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_incident_entity ON public.incident (tenant_id, entity_type, entity_id);

-- Incidents are closed, never deleted.
REVOKE DELETE ON public.incident FROM anon, authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.incident FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The incident's code: the family, the customer's code, the year and the customer's next number of
-- that family; and the open status, whatever the client sends. A customer the caller cannot see in
-- the incident's tenant is a missing customer (23503), as the foreign key would report it.
CREATE OR REPLACE FUNCTION private.incident_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'incident_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code(NEW.family::TEXT, customer_code);
    NEW.status := 'open';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER incident_set_code BEFORE INSERT ON public.incident FOR EACH ROW
EXECUTE FUNCTION private.incident_set_code ();

-- When the customer is due to be told (see the header), on every write. SECURITY DEFINER: it reads
-- the company setting of the incident's own tenant.
CREATE OR REPLACE FUNCTION private.incident_notice_due () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    setting_value JSONB;
    hours NUMERIC;
BEGIN
    IF NEW.severity = 's1' THEN
        setting_value := private.company_setting(NEW.tenant_id, 's1_customer_notify_hours');
        IF jsonb_typeof(setting_value) IN ('number', 'string')
           AND (setting_value #>> '{}') ~ '^\s*[0-9]{1,6}(\.[0-9]+)?\s*$' THEN
            hours := btrim(setting_value #>> '{}')::NUMERIC;
        END IF;
        NEW.customer_notice_due_at := NEW.opened_at + coalesce(hours, 4) * INTERVAL '1 hour';
    ELSIF NEW.severity = 's2' THEN
        -- "Aynı iş günü": the end of the opening day, or of the next business day.
        NEW.customer_notice_due_at :=
            (public.add_business_days((NEW.opened_at AT TIME ZONE 'UTC')::DATE, 0) + TIME '23:59:59') AT TIME ZONE 'UTC';
    ELSE
        -- s3: the weekly summary.
        NEW.customer_notice_due_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER incident_notice_due BEFORE INSERT
OR
UPDATE ON public.incident FOR EACH ROW
EXECUTE FUNCTION private.incident_notice_due ();

-- The incident's rules (see the header), in this order: the fixed code, customer and family
-- (whatever the bypass flag); the Y10 card's family; the linked record; the status flow; the
-- management notice; what closing needs.
CREATE OR REPLACE FUNCTION private.incident_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- 1. The code, the customer and the family are fixed.
    IF TG_OP = 'UPDATE' AND (
        NEW.code IS DISTINCT FROM OLD.code
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.family IS DISTINCT FROM OLD.family
    ) THEN
        RAISE EXCEPTION 'incident_immutable_field' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN NEW;
    END IF;

    -- 2. The Y10 card is of the incident's family (its format is incident_type_format).
    IF NEW.incident_type IS NOT NULL AND split_part(NEW.incident_type, '-', 1) <> upper(NEW.family::TEXT) THEN
        RAISE EXCEPTION 'incident_type_family' USING ERRCODE = 'check_violation';
    END IF;

    -- 3. The linked record is there and the customer's (its kinds are incident_entity_kind), when
    --    it is set or changed: a linked candidate market cell may be deleted later.
    IF NEW.entity_type IS NOT NULL AND (
        TG_OP = 'INSERT'
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
    ) AND private.entity_customer(NEW.entity_type, NEW.entity_id, NEW.tenant_id) IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'incident_entity_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        -- 4. open → contained | closed; contained → closed; closed is final.
        IF NOT (OLD.status = 'open' AND NEW.status IN ('contained', 'closed')
                OR OLD.status = 'contained' AND NEW.status = 'closed') THEN
            RAISE EXCEPTION 'incident_status_order' USING ERRCODE = 'check_violation';
        END IF;

        -- 5. An s1 or s2 leaves open only once management was told.
        IF OLD.status = 'open' AND NEW.severity IN ('s1', 's2') AND NEW.management_notified_at IS NULL THEN
            RAISE EXCEPTION 'incident_management_notice_required' USING ERRCODE = 'check_violation';
        END IF;

        -- 6. Closing: the outcome, the root cause and the preventive action; management closes an s1.
        IF NEW.status = 'closed' THEN
            IF NEW.outcome IS NULL OR NEW.root_cause IS NULL OR nullif(btrim(NEW.preventive_action), '') IS NULL THEN
                RAISE EXCEPTION 'incident_closure_incomplete' USING ERRCODE = 'check_violation';
            END IF;
            IF NEW.severity = 's1' AND coalesce(cardinality(
                private.tenants_permitting(auth.uid(), ARRAY[NEW.tenant_id], 'public.tenant', 'update')
            ), 0) = 0 THEN
                RAISE EXCEPTION 'incident_close_management' USING ERRCODE = 'insufficient_privilege';
            END IF;
            NEW.closed_on := current_date;
            NEW.closed_by := auth.uid();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- BEFORE triggers fire in name order: the z sorts the guard after incident_set_code and
-- incident_notice_due.
CREATE OR REPLACE TRIGGER incident_z_guard BEFORE INSERT
OR
UPDATE ON public.incident FOR EACH ROW
EXECUTE FUNCTION private.incident_guard ();

-- The incident log (S17 C). counterparty: a role and a channel, no personal contact details (K8).
CREATE TABLE IF NOT EXISTS public.incident_log (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   incident_id UUID NOT NULL,
   logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   author_id UUID DEFAULT auth.uid (),
   note TEXT NOT NULL,
   counterparty TEXT,
   decision TEXT,
   cost_amount NUMERIC(14, 2) CHECK (cost_amount >= 0),
   cost_currency valid_currency_code,
   cost_payer public.cost_payer,
   customer_approved BOOLEAN NOT NULL DEFAULT FALSE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT incident_log_incident_fkey FOREIGN KEY (incident_id, tenant_id) REFERENCES public.incident (id, tenant_id) ON DELETE CASCADE,
   CONSTRAINT incident_log_author_fkey FOREIGN KEY (author_id) REFERENCES public.user (id) ON DELETE SET NULL,
   CONSTRAINT incident_log_cost_complete CHECK (
      (cost_amount IS NULL AND cost_currency IS NULL AND cost_payer IS NULL)
      OR (cost_amount IS NOT NULL AND cost_currency IS NOT NULL AND cost_payer IS NOT NULL)
   )
);

CREATE INDEX IF NOT EXISTS idx_incident_log_incident ON public.incident_log (tenant_id, incident_id);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.incident_log FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The incident's deadlines (S17 B "süre sınırları", Y10 §4).
CREATE TABLE IF NOT EXISTS public.incident_deadline (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   incident_id UUID NOT NULL,
   kind public.incident_deadline_kind NOT NULL,
   label TEXT,
   -- An empty due time is calculated for the kinds incident_deadline_defaults knows.
   due_at TIMESTAMPTZ NOT NULL,
   met_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT incident_deadline_incident_fkey FOREIGN KEY (incident_id, tenant_id) REFERENCES public.incident (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_incident_deadline_incident ON public.incident_deadline (tenant_id, incident_id);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.incident_deadline FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- An empty due time from the incident's opening (see the header). SECURITY DEFINER: it reads the
-- incident and the company setting in the deadline's own tenant. Other kinds, or an incident that
-- is not there, keep it empty for NOT NULL and the foreign key.
CREATE OR REPLACE FUNCTION private.incident_deadline_defaults () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    opened TIMESTAMPTZ;
    setting_value JSONB;
    days INT;
BEGIN
    IF NEW.due_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT i.opened_at INTO opened
    FROM public.incident i
    WHERE i.id = NEW.incident_id AND i.tenant_id = NEW.tenant_id;

    IF opened IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.kind
        WHEN 'supplier_damage', 'platform_escalation' THEN
            NEW.due_at := opened + INTERVAL '48 hours';
        WHEN 'carrier_claim' THEN
            NEW.due_at := opened + INTERVAL '7 days';
        WHEN 'document_request' THEN
            setting_value := private.company_setting(NEW.tenant_id, 'document_request_days');
            IF jsonb_typeof(setting_value) IN ('number', 'string')
               AND (setting_value #>> '{}') ~ '^\s*[0-9]{1,4}\s*$' THEN
                days := btrim(setting_value #>> '{}')::INT;
            END IF;
            NEW.due_at :=
                (public.add_business_days((opened AT TIME ZONE 'UTC')::DATE, coalesce(days, 5)) + TIME '23:59:59') AT TIME ZONE 'UTC';
        ELSE
            NULL;
    END CASE;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER incident_deadline_defaults BEFORE INSERT
OR
UPDATE ON public.incident_deadline FOR EACH ROW
EXECUTE FUNCTION private.incident_deadline_defaults ();

-- A closed incident's log and deadlines no longer change. The incident is read FOR SHARE, so a
-- concurrent close waits for this write and this write for a close in flight. An update that moves
-- a row to another incident checks both. A delete cascaded from the incident or the tenant is not
-- checked.
CREATE OR REPLACE FUNCTION private.incident_child_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    incident_ids UUID[];
    row_tenant UUID;
BEGIN
    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        incident_ids := ARRAY[NEW.incident_id];
        row_tenant := NEW.tenant_id;
    ELSIF TG_OP = 'UPDATE' THEN
        incident_ids := ARRAY[OLD.incident_id, NEW.incident_id];
        row_tenant := NEW.tenant_id;
    ELSE
        incident_ids := ARRAY[OLD.incident_id];
        row_tenant := OLD.tenant_id;
    END IF;

    PERFORM 1 FROM public.incident i
    WHERE i.id = ANY (incident_ids) AND i.tenant_id = row_tenant
    FOR SHARE;

    IF EXISTS (
        SELECT 1 FROM public.incident i
        WHERE i.id = ANY (incident_ids) AND i.tenant_id = row_tenant AND i.status = 'closed'
    ) THEN
        RAISE EXCEPTION 'incident_closed' USING ERRCODE = 'check_violation';
    END IF;

    RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE TRIGGER incident_log_z_guard BEFORE INSERT
OR
UPDATE
OR DELETE ON public.incident_log FOR EACH ROW
EXECUTE FUNCTION private.incident_child_guard ();

CREATE OR REPLACE TRIGGER incident_deadline_z_guard BEFORE INSERT
OR
UPDATE
OR DELETE ON public.incident_deadline FOR EACH ROW
EXECUTE FUNCTION private.incident_child_guard ();

REVOKE ALL ON FUNCTION private.incident_set_code () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.incident_notice_due () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.incident_guard () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.incident_deadline_defaults () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.incident_child_guard () FROM PUBLIC, anon, authenticated;

-- The customer a record belongs to (025_media_link.sql), now with incidents. The
-- 034_market_matrix.sql body, with the incident branch added.
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
        ELSE
            RETURN NULL;
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION private.entity_customer (public.document_entity, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The incident list and card header. Runs as the caller (security_invoker), so it shows only the
-- incidents, customers, linked records and deadlines the caller may read.
CREATE OR REPLACE VIEW public.incident_overview
WITH
   (security_invoker = TRUE) AS
SELECT
   i.*,
   c.code::TEXT AS customer_code,
   CASE i.entity_type
      WHEN 'project' THEN pj.code
      WHEN 'purchase_order' THEN po.code
      WHEN 'shipment' THEN s.code
      WHEN 'product' THEN pr.sku
      WHEN 'market_cell' THEN mp.sku || ' · ' || m.platform_id || '_' || m.country
   END AS entity_label,
   d.next_deadline_at,
   d.overdue_deadline_count,
   EXISTS (
      SELECT
         1
      FROM
         public.incident r
      WHERE
         r.tenant_id = i.tenant_id
         AND r.customer_id = i.customer_id
         AND r.incident_type = i.incident_type
         AND r.id <> i.id
         AND r.opened_at < i.opened_at
         AND r.opened_at >= i.opened_at - INTERVAL '90 days'
   ) AS is_repeat
FROM
   public.incident i
   LEFT JOIN public.customer c ON c.id = i.customer_id
   AND c.tenant_id = i.tenant_id
   LEFT JOIN public.project pj ON i.entity_type = 'project'
   AND pj.id = i.entity_id
   AND pj.tenant_id = i.tenant_id
   LEFT JOIN public.purchase_order po ON i.entity_type = 'purchase_order'
   AND po.id = i.entity_id
   AND po.tenant_id = i.tenant_id
   LEFT JOIN public.shipment s ON i.entity_type = 'shipment'
   AND s.id = i.entity_id
   AND s.tenant_id = i.tenant_id
   LEFT JOIN public.product pr ON i.entity_type = 'product'
   AND pr.id = i.entity_id
   AND pr.tenant_id = i.tenant_id
   LEFT JOIN public.market_cell m ON i.entity_type = 'market_cell'
   AND m.id = i.entity_id
   AND m.tenant_id = i.tenant_id
   LEFT JOIN public.product mp ON mp.id = m.product_id
   AND mp.tenant_id = m.tenant_id
   LEFT JOIN LATERAL (
      SELECT
         min(dl.due_at) AS next_deadline_at,
         count(*) FILTER (
            WHERE
               dl.due_at < now()
         )::INT AS overdue_deadline_count
      FROM
         public.incident_deadline dl
      WHERE
         dl.incident_id = i.id
         AND dl.tenant_id = i.tenant_id
         AND dl.met_at IS NULL
   ) d ON TRUE;

COMMENT ON VIEW public.incident_overview IS 'Per incident: every column of the incident, customer_code, entity_label (the linked record: the project, purchase order or shipment code, the product SKU, or <sku> · <platform>_<country> for a market cell), next_deadline_at (the earliest due time of its unmet deadlines), overdue_deadline_count (its unmet deadlines past due) and is_repeat (another incident of the same customer and Y10 card opened in the 90 days before, S17 D "Tekrar mı").';

GRANT SELECT ON public.incident_overview TO authenticated;

SELECT
   private.enable_tenant_level_security (t_name)
FROM
   unnest(ARRAY['incident', 'incident_log', 'incident_deadline']) AS t_name;

SELECT
   private.audit_enable ('public.incident'::REGCLASS);

SELECT
   private.audit_enable ('public.incident_log'::REGCLASS);

SELECT
   private.audit_enable ('public.incident_deadline'::REGCLASS);

INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('incident', TRUE, 200)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete on incidents (closed instead); the guard keeps a closed incident's log and deadlines.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.incident', 'incident', 'select', 'read', FALSE, FALSE, NULL),
   ('public.incident', 'incident', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.incident', 'incident', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.incident_log', 'incident', 'select', 'read', FALSE, FALSE, NULL),
   ('public.incident_log', 'incident', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.incident_log', 'incident', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.incident_log', 'incident', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.incident_deadline', 'incident', 'select', 'read', FALSE, FALSE, NULL),
   ('public.incident_deadline', 'incident', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.incident_deadline', 'incident', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.incident_deadline', 'incident', 'delete', 'modify', FALSE, TRUE, NULL)
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
   AND p.resource_name IN ('public.incident', 'public.incident_log', 'public.incident_deadline')
ON CONFLICT DO NOTHING;

-- Every permission of the group to each role that may change products (029_purchase_orders.sql).
SELECT
   private.grant_group_to_product_editors ('incident');
