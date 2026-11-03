-- Phase 1 fixes (final review): rules the business tables still lacked.
--
-- document               An approved document is a signed one and more (approved ⊇ signed): it
--                        needs the same signature, stamp, official e-mail and date
--                        (private.document_signed_requires), so an unsigned spec sheet no longer
--                        counts as product evidence. A superseded document stays superseded, and
--                        what a document is (its record, type, version and tenant) never changes
--                        (private.document_transition).
-- project                A closed customer gets no new projects (private.project_set_code).
-- customer               The contract terms (contract_accepted_on, contract_document_id, start_on,
--                        deposit_rate, extra_cost_rule, restricted_drive_url) are changed only by
--                        those who may change the company's settings, i.e. management
--                        (private.customer_contract_guard).
-- product_with_evidence  The product list: every product column plus its evidence
--                        (public.product_evidence), so the list can filter on a signed spec sheet.
--
-- Each rule is a check_violation whose message is the rule's code:
--   document_signed_incomplete    a signed or approved document lacks signature, stamp, official
--                                 e-mail or date
--   document_superseded_sticky    a superseded document cannot get another status
--   document_identity_immutable   a document's entity_type, entity_id, type, version or tenant
--                                 changed
--   customer_closed               a project for a closed customer
--   customer_contract_restricted  a contract term changed by a caller without the update
--                                 permission on settings in the customer's tenant

-- Signed or approved means signed, stamped, sent from the official e-mail and dated.
CREATE OR REPLACE FUNCTION private.document_signed_requires () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF NEW.status IN ('signed', 'approved')
       AND NOT (NEW.is_signed AND NEW.is_stamped AND NEW.sent_from_official_email AND NEW.issued_on IS NOT NULL) THEN
        RAISE EXCEPTION 'document_signed_incomplete' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- A superseded document stays superseded, and a document never moves to another record, type,
-- version or tenant: a new version is a new row.
CREATE OR REPLACE FUNCTION private.document_transition () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
        RAISE EXCEPTION 'document_superseded_sticky' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'document_identity_immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER document_transition BEFORE
UPDATE ON public.document FOR EACH ROW
EXECUTE FUNCTION private.document_transition ();

REVOKE ALL ON FUNCTION private.document_transition () FROM PUBLIC, anon, authenticated;

-- The project's code and starting phase (see 021_projects.sql); a closed customer gets no new
-- projects.
CREATE OR REPLACE FUNCTION private.project_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
    customer_status public.customer_status;
BEGIN
    SELECT c.code, c.status INTO customer_code, customer_status
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'project_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF customer_status = 'closed' THEN
        RAISE EXCEPTION 'customer_closed' USING ERRCODE = 'check_violation';
    END IF;

    NEW.code := public.next_code('project', customer_code);
    NEW.current_phase := public.initial_phase(NEW.type, NEW.path, NEW.packages);
    RETURN NEW;
END;
$$;

-- The contract terms are management's: a caller changes them only while holding the update
-- permission on settings in the customer's tenant. SECURITY DEFINER for the permission lookup
-- (private.tenants_permitting reads roles the caller may not read). A request without a user
-- (migrations, seed, service role) is not limited.
CREATE OR REPLACE FUNCTION private.customer_contract_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF (NEW.contract_accepted_on IS DISTINCT FROM OLD.contract_accepted_on
        OR NEW.contract_document_id IS DISTINCT FROM OLD.contract_document_id
        OR NEW.start_on IS DISTINCT FROM OLD.start_on
        OR NEW.deposit_rate IS DISTINCT FROM OLD.deposit_rate
        OR NEW.extra_cost_rule IS DISTINCT FROM OLD.extra_cost_rule
        OR NEW.restricted_drive_url IS DISTINCT FROM OLD.restricted_drive_url)
       AND auth.uid() IS NOT NULL
       AND cardinality(private.tenants_permitting(auth.uid(), ARRAY[NEW.tenant_id], 'public.setting', 'update')) = 0 THEN
        RAISE EXCEPTION 'customer_contract_restricted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER customer_contract_guard BEFORE
UPDATE ON public.customer FOR EACH ROW
EXECUTE FUNCTION private.customer_contract_guard ();

REVOKE ALL ON FUNCTION private.customer_contract_guard () FROM PUBLIC, anon, authenticated;

-- The product list: the product and its evidence, as the caller may read them.
CREATE OR REPLACE VIEW public.product_with_evidence
WITH
   (security_invoker = TRUE) AS
SELECT
   p.*,
   e.has_signed_spec,
   e.spec_version,
   e.compliance_complete
FROM
   public.product p
   LEFT JOIN public.product_evidence e ON e.product_id = p.id;

COMMENT ON VIEW public.product_with_evidence IS 'Every product column plus its evidence (public.product_evidence): whether it has a signed or approved spec sheet, the highest such version, and whether its compliance is complete. Read by the product list, which filters on has_signed_spec.';

GRANT SELECT ON public.product_with_evidence TO authenticated;
