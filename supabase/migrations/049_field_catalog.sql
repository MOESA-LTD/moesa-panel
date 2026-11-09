-- Field catalog for field-level permissions.
--
-- field_group            The nine groups of sensitive fields, in display order.
-- field_class            One row per column of every public base table: system (ids, tenant,
--                        timestamps, foreign keys), open (readable whenever the row is) or sensitive
--                        (in one group). self_readable: the person a row describes may always read it.
--                        A later migration that adds a column inserts its `field_class` row;
--                        `049_field_catalog.test.sql` fails otherwise.
-- role_field_permission  What a role may read and write of a sensitive field. A role has no row for a
--                        field it may neither read nor write. Only sensitive fields carry rights, and
--                        these never go into public.permission (T18). A later migration restricts
--                        writes to save_role.
-- private.field_default  The rights a built-in profile (management, coordinator, customer_viewer) has
--                        per group; no row means no right on the group.
--
--   field_not_sensitive  (check_violation) a right was set on a field that is not sensitive

CREATE TABLE IF NOT EXISTS public.field_group (
   id TEXT PRIMARY KEY CHECK (id ~ '^[a-z_]+$'),
   position INT NOT NULL
);

INSERT INTO
   public.field_group (id, position)
VALUES
   ('cost', 10),
   ('sell_price', 20),
   ('supplier_identity', 30),
   ('supplier_contact', 40),
   ('supplier_terms', 50),
   ('contract', 60),
   ('finance', 70),
   ('internal_note', 80),
   ('personal_data', 90)
ON CONFLICT DO NOTHING;

CREATE TYPE public.field_class_kind AS ENUM('system', 'open', 'sensitive');

CREATE TABLE public.field_class (
   resource_name TEXT NOT NULL,
   field TEXT NOT NULL,
   class public.field_class_kind NOT NULL,
   group_name TEXT REFERENCES public.field_group (id),
   self_readable BOOLEAN NOT NULL DEFAULT FALSE,
   PRIMARY KEY (resource_name, field),
   CHECK ((class = 'sensitive') = (group_name IS NOT NULL)),
   CHECK (NOT self_readable OR class = 'sensitive')
);

ALTER TABLE public.field_group ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.field_class ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_group_select ON public.field_group FOR
SELECT
   TO authenticated USING (TRUE);

CREATE POLICY field_class_select ON public.field_class FOR
SELECT
   TO authenticated USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON public.field_group, public.field_class FROM anon, authenticated;

CREATE TABLE public.role_field_permission (
   -- Not part of the key: the audit trigger identifies a row by its id.
   id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid (),
   role_id UUID NOT NULL REFERENCES public.role (id) ON DELETE CASCADE,
   resource_name TEXT NOT NULL,
   field TEXT NOT NULL,
   can_read BOOLEAN NOT NULL,
   can_write BOOLEAN NOT NULL,
   created_at TIMESTAMPTZ DEFAULT now(),
   PRIMARY KEY (role_id, resource_name, field),
   FOREIGN KEY (resource_name, field) REFERENCES public.field_class ON DELETE CASCADE,
   CHECK (can_read OR NOT can_write)
);

CREATE INDEX idx_role_field_permission_field ON public.role_field_permission (resource_name, field);

-- 1. Every column of every public base table: system for ids, tenant, timestamps and foreign keys.
INSERT INTO
   public.field_class (resource_name, field, class)
SELECT
   'public.' || c.relname,
   a.attname,
   CASE
      WHEN a.attname IN ('id', 'tenant_id', 'created_at', 'updated_at', 'created_by', 'uploaded_by')
      OR EXISTS (
         SELECT
            1
         FROM
            pg_constraint k
         WHERE
            k.conrelid = c.oid
            AND k.contype = 'f'
            AND a.attnum = ANY (k.conkey)
      ) THEN 'system'::public.field_class_kind
      ELSE 'open'::public.field_class_kind
   END
FROM
   pg_attribute a
   JOIN pg_class c ON c.oid = a.attrelid
WHERE
   c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p')
   AND a.attnum > 0
   AND NOT a.attisdropped;

-- 2. The sensitive fields: the classification document's, with the owner's amendments (target price
-- is cost, the customer drive URL is an internal note, the parties of a shipment event and incident
-- identify suppliers).
UPDATE public.field_class f
SET
   class = 'sensitive',
   group_name = s.group_name
FROM
   (
      VALUES
         ('public.customer', 'contract_accepted_on', 'contract'),
         ('public.customer', 'contract_document_id', 'contract'),
         ('public.customer', 'deposit_rate', 'contract'),
         ('public.customer', 'extra_cost_rule', 'contract'),
         ('public.customer', 'start_on', 'contract'),
         ('public.product', 'landed_cost_eur', 'cost'),
         ('public.product', 'landed_cost_on', 'cost'),
         ('public.product', 'purchase_currency', 'cost'),
         ('public.product', 'purchase_incoterm', 'cost'),
         ('public.product', 'purchase_price', 'cost'),
         ('public.product', 'target_price_eur', 'cost'),
         ('public.purchase_order', 'pi_balance_amount', 'cost'),
         ('public.purchase_order', 'pi_check', 'cost'),
         ('public.purchase_order', 'pi_deposit_amount', 'cost'),
         ('public.purchase_order', 'pi_discount_amount', 'cost'),
         ('public.purchase_order', 'pi_document_id', 'cost'),
         ('public.purchase_order', 'pi_extra_amount', 'cost'),
         ('public.purchase_order', 'pi_number', 'cost'),
         ('public.purchase_order', 'pi_subtotal', 'cost'),
         ('public.purchase_order', 'pi_total', 'cost'),
         ('public.purchase_order_line', 'line_total', 'cost'),
         ('public.purchase_order_line', 'pi_line_total', 'cost'),
         ('public.purchase_order_line', 'unit_price', 'cost'),
         ('public.incident_log', 'cost_amount', 'finance'),
         ('public.incident_log', 'cost_currency', 'finance'),
         ('public.incident_log', 'cost_payer', 'finance'),
         ('public.purchase_order_payment', 'amount', 'finance'),
         ('public.purchase_order_payment', 'currency', 'finance'),
         ('public.change_request', 'decision_note', 'internal_note'),
         ('public.customer', 'notes', 'internal_note'),
         ('public.customer', 'restricted_drive_url', 'internal_note'),
         ('public.customer_platform_account', 'notes', 'internal_note'),
         ('public.document', 'notes', 'internal_note'),
         ('public.incident', 'impact_note', 'internal_note'),
         ('public.incident', 'lessons', 'internal_note'),
         ('public.incident', 'root_cause_note', 'internal_note'),
         ('public.incident_log', 'note', 'internal_note'),
         ('public.market_cell', 'notes', 'internal_note'),
         ('public.product', 'notes', 'internal_note'),
         ('public.project', 'notes', 'internal_note'),
         ('public.project_gate', 'note', 'internal_note'),
         ('public.purchase_order', 'notes', 'internal_note'),
         ('public.purchase_order_line', 'notes', 'internal_note'),
         ('public.purchase_order_payment', 'notes', 'internal_note'),
         ('public.shipment', 'notes', 'internal_note'),
         ('public.shipment_event', 'note', 'internal_note'),
         ('public.supplier', 'last_audit_on', 'internal_note'),
         ('public.supplier', 'notes', 'internal_note'),
         ('public.supplier', 'rating', 'internal_note'),
         ('public.customer_contact', 'email', 'personal_data'),
         ('public.customer_contact', 'name', 'personal_data'),
         ('public.customer_contact', 'phone', 'personal_data'),
         ('public.customer_platform_account', 'account_holder', 'personal_data'),
         ('public.customer_warehouse', 'receiving_person', 'personal_data'),
         ('public.user', 'email', 'personal_data'),
         ('public.user', 'phone', 'personal_data'),
         ('public.user', 'user_metadata', 'personal_data'),
         ('public.product', 'company_price_eur', 'sell_price'),
         ('public.product', 'price_list_version', 'sell_price'),
         ('public.supplier_contact', 'email', 'supplier_contact'),
         ('public.supplier_contact', 'name', 'supplier_contact'),
         ('public.supplier_contact', 'phone', 'supplier_contact'),
         ('public.supplier_contact', 'role', 'supplier_contact'),
         ('public.incident', 'affected_parties', 'supplier_identity'),
         ('public.incident_log', 'counterparty', 'supplier_identity'),
         ('public.product', 'manufacturer_art_no', 'supplier_identity'),
         ('public.product', 'supplier_id', 'supplier_identity'),
         ('public.product', 'supplier_product_code', 'supplier_identity'),
         ('public.purchase_order', 'supplier_id', 'supplier_identity'),
         ('public.shipment_event', 'from_party', 'supplier_identity'),
         ('public.shipment_event', 'to_party', 'supplier_identity'),
         ('public.purchase_order', 'deposit_rate', 'supplier_terms'),
         ('public.purchase_order', 'incoterm', 'supplier_terms'),
         ('public.purchase_order', 'incoterm_place', 'supplier_terms'),
         ('public.purchase_order', 'penalty_rule', 'supplier_terms'),
         ('public.purchase_order', 'tolerance_pct', 'supplier_terms'),
         ('public.shipment', 'incoterm_buy', 'supplier_terms'),
         ('public.supplier', 'cancellation_rule', 'supplier_terms'),
         ('public.supplier', 'damage_notice_hours', 'supplier_terms'),
         ('public.supplier', 'default_incoterm', 'supplier_terms'),
         ('public.supplier', 'deposit_rate', 'supplier_terms'),
         ('public.supplier', 'late_payment_penalty', 'supplier_terms'),
         ('public.supplier', 'payment_terms', 'supplier_terms'),
         ('public.supplier', 'storage_fee_rule', 'supplier_terms')
   ) AS s (resource_name, field, group_name)
WHERE
   f.resource_name = s.resource_name
   AND f.field = s.field;

-- What a person may always read of their own record.
UPDATE public.field_class
SET
   self_readable = TRUE
WHERE
   resource_name = 'public.user'
   AND field IN ('user_metadata', 'email', 'phone');

CREATE OR REPLACE FUNCTION private.role_field_permission_sensitive_only () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.field_class f
        WHERE f.resource_name = NEW.resource_name AND f.field = NEW.field AND f.class = 'sensitive'
    ) THEN
        RAISE EXCEPTION 'field_not_sensitive' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.role_field_permission_sensitive_only ()
FROM
   PUBLIC,
   anon,
   authenticated;

CREATE TRIGGER role_field_permission_sensitive_only BEFORE INSERT
OR
UPDATE ON public.role_field_permission FOR EACH ROW
EXECUTE FUNCTION private.role_field_permission_sensitive_only ();

ALTER TABLE public.role_field_permission ENABLE ROW LEVEL SECURITY;

SELECT
   private.audit_enable ('public.role_field_permission'::REGCLASS);

-- Permissions: the four of role_permission, for this table. Inserting a permission creates its RLS
-- policies (see private.manage_policies).
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
SELECT
   'public.role_field_permission',
   p.group_name,
   p.command,
   p.kind,
   p.bypass,
   p.throws_error,
   p.resource_condition
FROM
   public.permission p
WHERE
   p.resource_name = 'public.role_permission'
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
   AND p.resource_name = 'public.role_field_permission'
ON CONFLICT DO NOTHING;

-- Default rights per profile and group; a hidden group has no row.
CREATE TABLE private.field_default (
   profile TEXT NOT NULL,
   group_name TEXT NOT NULL REFERENCES public.field_group (id),
   can_read BOOLEAN NOT NULL,
   can_write BOOLEAN NOT NULL,
   PRIMARY KEY (profile, group_name),
   CHECK (can_read OR NOT can_write)
);

INSERT INTO
   private.field_default (profile, group_name, can_read, can_write)
VALUES
   ('management', 'cost', TRUE, TRUE),
   ('management', 'sell_price', TRUE, TRUE),
   ('management', 'supplier_identity', TRUE, TRUE),
   ('management', 'supplier_contact', TRUE, TRUE),
   ('management', 'supplier_terms', TRUE, TRUE),
   ('management', 'contract', TRUE, TRUE),
   ('management', 'finance', TRUE, TRUE),
   ('management', 'internal_note', TRUE, TRUE),
   ('management', 'personal_data', TRUE, TRUE),
   ('coordinator', 'cost', TRUE, TRUE),
   ('coordinator', 'sell_price', TRUE, FALSE),
   ('coordinator', 'supplier_identity', TRUE, TRUE),
   ('coordinator', 'supplier_contact', TRUE, TRUE),
   ('coordinator', 'supplier_terms', TRUE, FALSE),
   ('coordinator', 'contract', TRUE, FALSE),
   ('coordinator', 'finance', TRUE, FALSE),
   ('coordinator', 'internal_note', TRUE, TRUE),
   ('coordinator', 'personal_data', TRUE, TRUE),
   ('customer_viewer', 'sell_price', TRUE, FALSE),
   ('customer_viewer', 'contract', TRUE, FALSE),
   ('customer_viewer', 'personal_data', TRUE, FALSE);

-- Gives a role the default rights of a profile. The fields of public.user are read by management and
-- coordinator, and by no portal user.
CREATE OR REPLACE FUNCTION private.apply_field_defaults (p_role_id UUID, p_profile TEXT) RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET
   search_path = '' AS $$
    INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
    SELECT p_role_id, f.resource_name, f.field,
           CASE WHEN f.resource_name = 'public.user' THEN TRUE ELSE d.can_read END,
           CASE WHEN f.resource_name = 'public.user' THEN FALSE ELSE d.can_write END
    FROM public.field_class f
    LEFT JOIN private.field_default d ON d.profile = p_profile AND d.group_name = f.group_name
    WHERE f.class = 'sensitive'
      AND CASE WHEN f.resource_name = 'public.user' THEN p_profile IN ('management', 'coordinator')
               ELSE d.profile IS NOT NULL END
    ON CONFLICT (role_id, resource_name, field) DO UPDATE
    SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write;
$$;

-- Gives a role every sensitive field of the tables it holds rights on: read with select, write with
-- select and insert or update (R1: no role loses what it had).
CREATE OR REPLACE FUNCTION private.grant_all_fields (p_role_id UUID) RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET
   search_path = '' AS $$
    INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
    SELECT p_role_id, f.resource_name, f.field, h.can_read, h.can_read AND h.can_write
    FROM public.field_class f
    CROSS JOIN LATERAL (
        SELECT coalesce(bool_or(p.command = 'select'), FALSE) AS can_read,
               coalesce(bool_or(p.command IN ('insert', 'update')), FALSE) AS can_write
        FROM public.role_permission rp
        JOIN public.permission p ON p.id = rp.permission_id
        WHERE rp.role_id = p_role_id AND p.resource_name = f.resource_name
    ) h
    WHERE f.class = 'sensitive'
    ON CONFLICT (role_id, resource_name, field) DO UPDATE
    SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write;
$$;

-- Every role of a tenant: the three built-in profiles get their defaults, any other role every field
-- it can reach (R1).
CREATE OR REPLACE FUNCTION private.backfill_role_fields () RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, display_name FROM public.role WHERE tenant_id IS NOT NULL LOOP
        IF r.display_name IN ('management', 'coordinator', 'customer_viewer') THEN
            PERFORM private.apply_field_defaults(r.id, r.display_name);
        ELSE
            PERFORM private.grant_all_fields(r.id);
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_field_defaults (UUID, TEXT)
FROM
   PUBLIC,
   anon,
   authenticated;

REVOKE ALL ON FUNCTION private.grant_all_fields (UUID)
FROM
   PUBLIC,
   anon,
   authenticated;

REVOKE ALL ON FUNCTION private.backfill_role_fields ()
FROM
   PUBLIC,
   anon,
   authenticated;

SELECT
   private.backfill_role_fields ();
