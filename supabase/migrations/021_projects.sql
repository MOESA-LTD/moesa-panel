-- Projects (M5): which project is in which phase, and which gate is waiting for whom.
--
-- project          A customer's project: its type (npi / variant / revision / reorder), its path
--                  (a_sourcing / b_private_label, only for npi), the customer's packages (A0…E),
--                  its current phase (P1…L5, closed), target dates and coordinator. Its code
--                  (THO-2026-001) comes from public.next_code and never changes; nor do its
--                  customer, type, path and packages, which decide its gates. Projects are closed
--                  or cancelled (status), never deleted.
-- project_product  The products a project is about.
-- project_gate     The project's gates, generated when the project is created (see the gate model
--                  below). There is no insert or delete permission, and only the decision columns
--                  can be updated. The UI decides gates through pass_gate and rollback_gate, but
--                  the rules sit in a trigger on the table, so a direct update obeys them too.
-- project_task     The phase checklist (K4): what has to be done in each phase, by which role,
--                  and whether it blocks the gate that closes the phase. The checklists of the
--                  phases a project enters are copied from task_template; they can then be edited
--                  freely.
-- task_template    The starting checklist of every phase. Global reference data like
--                  public.platform: no tenant_id, read by every signed-in user, written only by
--                  migrations, not audited.
--
-- Gate model (spec M5, K3). The gate set follows from the project's type, path and packages
-- (public.gates_for); a project starts in the phase its first gate closes (public.initial_phase).
-- Gates are passed in their order (position). Passing a gate moves the project to the phase after
-- it (public.phase_after). Whenever a project enters a phase (created, or a gate passed) it gets
-- the checklists of every phase from there up to the one its next open gate closes
-- (public.phase_before), plus PL7 when it enters P3 from PL_G4 (content runs alongside the
-- order); phases it already has tasks for are skipped.
--
-- Rules, checked by the BEFORE UPDATE trigger private.project_gate_guard whenever a gate is set
-- to passed, in order, each a check_violation whose message is the rule's code:
--   gate_not_pending                 the gate is already passed
--   project_not_active               the project is on hold, closed or cancelled
--   gate_order                       an earlier gate of the project is not passed
--   gate_customer_approval_required  an (M) gate (every gate but G4) needs the customer's approval
--                                    date and approval document
--   gate_approval_document_invalid   the approval document is not a gate_approval document of
--                                    this gate
--   gate_evidence_invalid            an evidence document is not a document of this gate or its
--                                    project
--   gate_spec_sheet_required         G2 needs products, and a signed or approved spec sheet for
--                                    each of them (public.product_evidence)
--   gate_blocked_by_task             a blocking task of the phases up to the one the gate closes
--                                    is not done (only while the setting gate_evidence_blocking
--                                    is true)
-- The AFTER UPDATE trigger private.project_gate_advance then moves the phase and adds the
-- checklists. rollback_gate (reason required) sets the gate and every later passed gate to
-- rolled_back and takes the project back to the phase the gate closes (public.phase_before). A
-- rolled-back gate is reopened in place: the guard accepts it like a pending one, so the UI simply
-- passes it again. In Phase 2 a rollback is tied to an incident (M10). pass_gate and
-- rollback_gate lock the project row first, so the decisions on one project run one at a time.
--
-- gates_for, initial_phase, phase_after and phase_before are pure functions in public: pass_gate
-- and rollback_gate are SECURITY INVOKER and signed-in users have no USAGE on schema private, and
-- the UI uses them too (the phase strip). The trigger functions are in private and not executable
-- by users. The code trigger runs as the caller: it reads the customer through RLS and gets the
-- code from public.next_code. The gate-creation, guard and advance triggers (and the checklist
-- copy they share) are SECURITY DEFINER: users cannot insert gates or tasks on the project's
-- behalf, and the rules must see the whole project whatever the caller may read. Each filters on
-- the row's own tenant_id itself, a tenant the caller has just been allowed to write to.
--
-- Every reference to a tenant-scoped table includes tenant_id (see 018_customers.sql). Customers,
-- products and documents are never deleted, so the references to them are ON DELETE RESTRICT; a
-- project's gates, tasks and product links go with it. Now that public.project and
-- public.project_gate exist, documents with those entity types are checked against them
-- (private.document_check_entity, 016_documents.sql).

CREATE TYPE public.project_type AS ENUM ('npi', 'variant', 'revision', 'reorder');

CREATE TYPE public.project_path AS ENUM ('a_sourcing', 'b_private_label');

CREATE TYPE public.project_status AS ENUM ('active', 'on_hold', 'closed', 'cancelled');

-- In the order a project goes through them, so phases compare (P1 < P2 < … < closed).
CREATE TYPE public.project_phase AS ENUM (
   'P1',
   'P2',
   'PL1',
   'PL2',
   'PL3',
   'PL4',
   'PL5',
   'PL6',
   'PL7',
   'P3',
   'P4',
   'P5',
   'P6',
   'L1',
   'L2',
   'L3',
   'L4',
   'L5',
   'closed'
);

CREATE TYPE public.gate_code AS ENUM ('G1', 'G2', 'G3', 'G4', 'G5', 'PL_G1', 'PL_G2', 'PL_G3', 'PL_G4', 'L_G1', 'L_G2');

CREATE TYPE public.gate_status AS ENUM ('pending', 'passed', 'rolled_back');

CREATE TYPE public.task_status AS ENUM ('todo', 'doing', 'done', 'blocked');

-- The gates of a project, in order (spec M5 gate-set table). A project whose only package is A0
-- (research, concept, design) or B (logistics) gets that package's gates whatever its type;
-- packages C (listing) and D add the listing gates.
CREATE OR REPLACE FUNCTION public.gates_for (type public.project_type, path public.project_path, packages TEXT[]) RETURNS public.gate_code[] LANGUAGE sql IMMUTABLE
SET
   search_path = '' AS $$
    SELECT CASE
        WHEN gates_for.packages = ARRAY['A0'] THEN ARRAY['PL_G1', 'PL_G2']::public.gate_code[]
        WHEN gates_for.packages = ARRAY['B'] THEN ARRAY['G5']::public.gate_code[]
        WHEN gates_for.type = 'npi' AND gates_for.path = 'b_private_label'
            THEN ARRAY['G1', 'PL_G1', 'PL_G2', 'PL_G3', 'PL_G4', 'G3', 'G4', 'G5']::public.gate_code[]
        WHEN gates_for.type = 'npi' THEN ARRAY['G1', 'G2', 'G3', 'G4', 'G5']::public.gate_code[]
        WHEN gates_for.type IN ('variant', 'revision') THEN ARRAY['G2', 'G3', 'G4', 'G5']::public.gate_code[]
        ELSE ARRAY['G3', 'G4', 'G5']::public.gate_code[]
    END
    || CASE
        WHEN coalesce(gates_for.packages, '{}') && ARRAY['C', 'D'] THEN ARRAY['L_G1', 'L_G2']::public.gate_code[]
        ELSE '{}'::public.gate_code[]
    END;
$$;

-- The phase a project enters when the gate passes. Projects without a path (variant, revision,
-- reorder) follow path A.
CREATE OR REPLACE FUNCTION public.phase_after (code public.gate_code, path public.project_path, packages TEXT[]) RETURNS public.project_phase LANGUAGE sql IMMUTABLE
SET
   search_path = '' AS $$
    SELECT (CASE phase_after.code
        WHEN 'G1' THEN CASE WHEN phase_after.path = 'b_private_label' THEN 'PL1' ELSE 'P2' END
        WHEN 'PL_G1' THEN 'PL3'
        -- An A0-only project ends with the concept and brand approved.
        WHEN 'PL_G2' THEN CASE WHEN phase_after.packages = ARRAY['A0'] THEN 'closed' ELSE 'PL4' END
        WHEN 'PL_G3' THEN 'PL6'
        WHEN 'PL_G4' THEN 'P3'
        WHEN 'G2' THEN 'P3'
        WHEN 'G3' THEN 'P4'
        WHEN 'G4' THEN 'P5'
        WHEN 'G5' THEN CASE WHEN coalesce(phase_after.packages, '{}') && ARRAY['C', 'D'] THEN 'L1' ELSE 'closed' END
        WHEN 'L_G1' THEN 'L4'
        WHEN 'L_G2' THEN 'closed'
    END)::public.project_phase;
$$;

-- The phase the gate closes: where a project goes back to when the gate is rolled back.
CREATE OR REPLACE FUNCTION public.phase_before (code public.gate_code) RETURNS public.project_phase LANGUAGE sql IMMUTABLE
SET
   search_path = '' AS $$
    SELECT (CASE phase_before.code
        WHEN 'G1' THEN 'P1'
        WHEN 'G2' THEN 'P2'
        WHEN 'PL_G1' THEN 'PL2'
        WHEN 'PL_G2' THEN 'PL3'
        WHEN 'PL_G3' THEN 'PL5'
        WHEN 'PL_G4' THEN 'PL6'
        WHEN 'G3' THEN 'P3'
        WHEN 'G4' THEN 'P4'
        WHEN 'G5' THEN 'P6'
        WHEN 'L_G1' THEN 'L3'
        WHEN 'L_G2' THEN 'L5'
    END)::public.project_phase;
$$;

-- The phase a new project starts in: the phase its first gate closes. A0 covers PL1–PL3 (PL_G1
-- closes PL2, after PL1), B covers P5–P6.
CREATE OR REPLACE FUNCTION public.initial_phase (type public.project_type, path public.project_path, packages TEXT[]) RETURNS public.project_phase LANGUAGE sql IMMUTABLE
SET
   search_path = '' AS $$
    SELECT (CASE
        WHEN initial_phase.packages = ARRAY['A0'] THEN 'PL1'
        WHEN initial_phase.packages = ARRAY['B'] THEN 'P5'
        WHEN initial_phase.type = 'npi' THEN 'P1'
        WHEN initial_phase.type IN ('variant', 'revision') THEN 'P2'
        ELSE 'P3'
    END)::public.project_phase;
$$;

REVOKE ALL ON FUNCTION public.initial_phase (public.project_type, public.project_path, TEXT[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.initial_phase (public.project_type, public.project_path, TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.gates_for (public.project_type, public.project_path, TEXT[]) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.phase_after (public.gate_code, public.project_path, TEXT[]) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.phase_before (public.gate_code) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.gates_for (public.project_type, public.project_path, TEXT[]) TO authenticated;

GRANT EXECUTE ON FUNCTION public.phase_after (public.gate_code, public.project_path, TEXT[]) TO authenticated;

GRANT EXECUTE ON FUNCTION public.phase_before (public.gate_code) TO authenticated;

-- Task templates
CREATE TABLE IF NOT EXISTS public.task_template (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   phase public.project_phase NOT NULL CHECK (phase <> 'closed'),
   display_name TEXT NOT NULL,
   role TEXT NOT NULL CHECK (
      role IN ('coordinator', 'supply_qc', 'compliance', 'content_listing', 'logistics', 'finance', 'management')
   ),
   blocks_gate BOOLEAN NOT NULL DEFAULT FALSE,
   position INT NOT NULL DEFAULT 0,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   CONSTRAINT unique_task_template UNIQUE (phase, position)
);

ALTER TABLE public.task_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_template_select ON public.task_template FOR
SELECT
   TO authenticated USING (TRUE);

-- From the step lists of the workflow (moesa_is_akisi.md §4, §4B, §5). The tasks that block a
-- gate are the gate's own evidence.
INSERT INTO
   public.task_template (phase, position, display_name, role, blocks_gate)
VALUES
   ('P1', 10, 'Ürün brief''i', 'coordinator', FALSE),
   ('P1', 20, 'Çok pazarlı talep ve rakip analizi', 'coordinator', FALSE),
   ('P1', 30, 'Uyum ön taraması (ülke × platform)', 'compliance', FALSE),
   ('P1', 40, 'Birim ekonomisi', 'finance', FALSE),
   ('P1', 50, 'Yol seçimi (A marka sourcing / B private label)', 'coordinator', TRUE),
   ('P2', 10, 'En az 3 tedarikçiden RFQ', 'supply_qc', FALSE),
   ('P2', 20, 'Tedarikçi değerlendirmesi', 'supply_qc', FALSE),
   ('P2', 30, 'Üretici spec sheet''i imzalı ve kaşeli', 'supply_qc', TRUE),
   ('P2', 40, 'Numune değerlendirme formu', 'supply_qc', FALSE),
   ('P2', 50, 'NPDS (ürün tasarım föyü)', 'supply_qc', FALSE),
   ('PL1', 10, 'Pazar ve kategori analizi', 'coordinator', FALSE),
   ('PL1', 20, 'Tüketici araştırması (yorum analizi)', 'coordinator', FALSE),
   ('PL1', 30, 'Rakip ürün incelemesi', 'supply_qc', FALSE),
   ('PL1', 40, 'Uyum riski ve kategori kısıtları', 'compliance', FALSE),
   ('PL1', 50, 'Farklılaşma tezi ve pazar araştırma raporu', 'coordinator', TRUE),
   ('PL2', 10, 'Konsept tanımı, varyantlar ve paket mimarisi', 'coordinator', FALSE),
   ('PL2', 20, 'Moodboard, render ve CMF tanımı', 'coordinator', FALSE),
   ('PL2', 30, 'Konsept doğrulama', 'coordinator', FALSE),
   ('PL2', 40, 'Hedef maliyet ve fiyat', 'finance', FALSE),
   ('PL2', 50, 'Konsept dosyası', 'coordinator', TRUE),
   ('PL3', 10, 'Marka kılavuzu veya kimlik tasarımı', 'coordinator', FALSE),
   ('PL3', 20, 'Marka tescili kontrolü ve başvurusu', 'compliance', TRUE),
   ('PL3', 30, 'GS1 barkodları marka sahibi adına', 'compliance', FALSE),
   ('PL4', 10, 'Tech pack / NPDS', 'supply_qc', FALSE),
   ('PL4', 20, 'Üretici spec sheet''i ve tech pack farklarının kapatılması', 'supply_qc', TRUE),
   ('PL4', 30, 'BOM (malzeme listesi)', 'supply_qc', FALSE),
   ('PL4', 40, 'Test planı', 'compliance', FALSE),
   ('PL4', 50, 'Kalıp maliyeti, mülkiyeti ve münhasırlığı', 'management', FALSE),
   ('PL5', 10, 'En az 3 üreticiden RFQ', 'supply_qc', FALSE),
   ('PL5', 20, 'Prototip ve ön üretim numunesi', 'supply_qc', FALSE),
   ('PL5', 30, 'Altın numune (üç adet, mühürlü)', 'supply_qc', TRUE),
   ('PL5', 40, 'Tasarım ve kalıp mülkiyeti, gizlilik anlaşması', 'management', FALSE),
   ('PL6', 10, 'Dieline ve artwork', 'coordinator', FALSE),
   ('PL6', 20, 'Zorunlu ambalaj içeriği (GTIN, GPSR, uyarılar, EPR)', 'compliance', TRUE),
   ('PL6', 30, 'Baskı provası ve renk onayı', 'supply_qc', FALSE),
   ('PL7', 10, 'Fotoğraf, render ve infografik', 'content_listing', FALSE),
   ('PL7', 20, 'A+ modülleri ve video', 'content_listing', FALSE),
   ('PL7', 30, 'İçerik ana seti (EN)', 'content_listing', FALSE),
   ('P3', 10, 'PO, onaylı spec sheet sürümüne referansla', 'supply_qc', FALSE),
   ('P3', 20, 'PI kontrol listesi', 'finance', TRUE),
   ('P3', 30, 'Ödeme ve üretim başlangıcı', 'finance', FALSE),
   ('P3', 40, 'Üretim takibi', 'supply_qc', FALSE),
   ('P3', 50, 'Ambalaj ve etiket baskı onayı', 'coordinator', TRUE),
   ('P4', 10, 'Yükleme öncesi kontrol (PSI)', 'supply_qc', TRUE),
   ('P4', 20, 'Ürün uyum dosyası', 'compliance', TRUE),
   ('P4', 30, 'Ülke ekleri', 'compliance', FALSE),
   ('P5', 10, 'Koli ve palet etiketleri', 'logistics', FALSE),
   ('P5', 20, 'Hedef depo kuralları (kendi depo, 3PL, FBA)', 'logistics', FALSE),
   ('P5', 30, 'Packing list ve etiketlerin müşteriyle teyidi', 'logistics', TRUE),
   ('P6', 10, 'Forwarder teklifi ve booking', 'logistics', FALSE),
   ('P6', 20, 'Sevkiyat belgeleri (CI, packing list, B/L veya CMR, menşe)', 'logistics', FALSE),
   ('P6', 30, 'Gümrük talimatı', 'logistics', FALSE),
   ('P6', 40, 'ETD/ETA takibi', 'logistics', FALSE),
   ('P6', 50, 'Teslim tutanağı', 'logistics', TRUE),
   ('L1', 10, 'Pazar matrisi (platform × ülke)', 'content_listing', TRUE),
   ('L1', 20, 'Platform ve ülke kuralları (uyum kütüphanesi)', 'compliance', FALSE),
   ('L1', 30, 'Öncelik sırası', 'coordinator', FALSE),
   ('L2', 10, 'Ürün ana kaydı (1 varyant = 1 GTIN)', 'content_listing', TRUE),
   ('L2', 20, 'İçerik ana seti (EN)', 'content_listing', FALSE),
   ('L2', 30, 'Attribute ana seti', 'content_listing', FALSE),
   ('L3', 10, 'Çeviri ve ana dil kontrolü', 'content_listing', FALSE),
   ('L3', 20, 'Yerel keyword araştırması', 'content_listing', FALSE),
   ('L3', 30, 'Yasaklı ifade ve iddia kontrolü', 'compliance', TRUE),
   ('L3', 40, 'Platform şablonuna uyarlama', 'content_listing', FALSE),
   ('L4', 10, 'Toplu yükleme', 'content_listing', FALSE),
   ('L4', 20, 'Yayın kontrol listesi (her hücre)', 'content_listing', TRUE),
   ('L4', 30, 'Bastırılmış uyarısı kontrolü', 'content_listing', FALSE),
   ('L5', 10, 'İlk 14 gün yakın izleme', 'content_listing', FALSE),
   ('L5', 20, 'Lansman reklamı kurulumu', 'content_listing', FALSE),
   ('L5', 30, 'Teslim dosyası', 'coordinator', TRUE)
ON CONFLICT ON CONSTRAINT unique_task_template DO NOTHING;

-- Projects
CREATE TABLE IF NOT EXISTS public.project (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   -- Set by the project_set_code trigger; whatever the client sends is replaced.
   code TEXT,
   display_name TEXT NOT NULL,
   type public.project_type NOT NULL,
   path public.project_path,
   packages TEXT[] NOT NULL DEFAULT '{}' CHECK (packages <@ ARRAY['A0', 'A1', 'A2', 'B', 'C', 'D', 'E']::TEXT[]),
   current_phase public.project_phase NOT NULL DEFAULT 'P1',
   status public.project_status NOT NULL DEFAULT 'active',
   target_delivery_on DATE,
   target_live_on DATE,
   coordinator_id UUID REFERENCES public.user (id) ON DELETE SET NULL,
   notes TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   -- The counters behind the codes are per tenant (public.code_sequence), so the code is too.
   CONSTRAINT unique_project_code UNIQUE (tenant_id, code),
   -- Only a new product has a path.
   CONSTRAINT project_path_only_npi CHECK ((type = 'npi') = (path IS NOT NULL)),
   -- Target of the tenant-scoped foreign keys of the project's child rows.
   CONSTRAINT project_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT project_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_project_customer ON public.project (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_project_tenant_status ON public.project (tenant_id, status);

-- Projects are closed or cancelled, not deleted.
REVOKE DELETE ON public.project FROM anon, authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.project FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The project's code: the customer's code, the year and the customer's next number; and its
-- starting phase (public.initial_phase), whatever the client sends. A customer
-- the caller cannot see in the project's tenant is a missing customer (23503), as the foreign key
-- would report it.
CREATE OR REPLACE FUNCTION private.project_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'project_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code('project', customer_code);
    NEW.current_phase := public.initial_phase(NEW.type, NEW.path, NEW.packages);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER project_set_code BEFORE INSERT ON public.project FOR EACH ROW
EXECUTE FUNCTION private.project_set_code ();

-- What a project is (its customer, type, path and packages) decides its code and its gates, so it
-- is fixed once the project exists.
CREATE OR REPLACE FUNCTION private.project_immutable () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'project_code_immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type
       OR NEW.path IS DISTINCT FROM OLD.path
       OR NEW.packages IS DISTINCT FROM OLD.packages
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
        RAISE EXCEPTION 'project_immutable_field' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER project_immutable BEFORE
UPDATE ON public.project FOR EACH ROW
EXECUTE FUNCTION private.project_immutable ();

-- Project products
CREATE TABLE IF NOT EXISTS public.project_product (
   project_id UUID NOT NULL,
   product_id UUID NOT NULL,
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT project_product_pkey PRIMARY KEY (project_id, product_id),
   CONSTRAINT project_product_project_fkey FOREIGN KEY (project_id, tenant_id) REFERENCES public.project (id, tenant_id) ON DELETE CASCADE,
   CONSTRAINT project_product_product_fkey FOREIGN KEY (product_id, tenant_id) REFERENCES public.product (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_project_product_product ON public.project_product (tenant_id, product_id);

-- Gates
CREATE TABLE IF NOT EXISTS public.project_gate (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   project_id UUID NOT NULL,
   code public.gate_code NOT NULL,
   position INT NOT NULL,
   needs_customer_approval BOOLEAN NOT NULL,
   status public.gate_status NOT NULL DEFAULT 'pending',
   passed_at TIMESTAMPTZ,
   decided_by_role TEXT,
   customer_approved_on DATE,
   approval_document_id UUID,
   -- Evidence also attached to the gate as documents (entity_type 'project_gate'); no foreign key.
   evidence_document_ids UUID[] NOT NULL DEFAULT '{}',
   note TEXT,
   rolled_back_reason TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT unique_project_gate_code UNIQUE (project_id, code),
   CONSTRAINT project_gate_project_fkey FOREIGN KEY (project_id, tenant_id) REFERENCES public.project (id, tenant_id) ON DELETE CASCADE,
   CONSTRAINT project_gate_approval_document_fkey FOREIGN KEY (approval_document_id, tenant_id) REFERENCES public.document (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_project_gate_tenant_status ON public.project_gate (tenant_id, status);

-- Gates are made by the trigger and decided through pass_gate / rollback_gate: only the decision
-- columns can be written (the table-level UPDATE Supabase grants is taken and given back for
-- them, as in 015_ops_core.sql), and nothing can be inserted or deleted.
REVOKE INSERT, UPDATE, DELETE ON public.project_gate FROM anon, authenticated;

GRANT
UPDATE (
   status,
   passed_at,
   decided_by_role,
   customer_approved_on,
   approval_document_id,
   evidence_document_ids,
   note,
   rolled_back_reason
) ON public.project_gate TO authenticated;

-- Tasks
CREATE TABLE IF NOT EXISTS public.project_task (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   project_id UUID NOT NULL,
   phase public.project_phase NOT NULL CHECK (phase <> 'closed'),
   display_name TEXT NOT NULL,
   role TEXT CHECK (
      role IN ('coordinator', 'supply_qc', 'compliance', 'content_listing', 'logistics', 'finance', 'management')
   ),
   assignee_id UUID REFERENCES public.user (id) ON DELETE SET NULL,
   due_on DATE,
   status public.task_status NOT NULL DEFAULT 'todo',
   blocks_gate BOOLEAN NOT NULL DEFAULT FALSE,
   position INT NOT NULL DEFAULT 0,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   CONSTRAINT project_task_project_fkey FOREIGN KEY (project_id, tenant_id) REFERENCES public.project (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_task_project ON public.project_task (tenant_id, project_id, phase);

CREATE INDEX IF NOT EXISTS idx_project_task_assignee ON public.project_task (assignee_id, status);

-- Copies the checklists of the phases a project has entered: from `entered` up to the phase its
-- next open gate closes (all of them when there is no open gate left before closing), skipping
-- the phases it already has tasks for (a gate passed again after a rollback). On path B, P3 runs
-- with PL7 (content production in parallel with the order), so entering P3 from PL6 adds PL7 too.
-- Called only from the SECURITY DEFINER triggers below, which pass the project's own tenant.
CREATE OR REPLACE FUNCTION private.project_copy_checklists (project_id UUID, tenant_id UUID, entered public.project_phase, with_pl7 BOOLEAN DEFAULT FALSE) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    open_code public.gate_code;
    upto public.project_phase;
BEGIN
    IF entered = 'closed' THEN
        RETURN;
    END IF;

    SELECT g.code INTO open_code
    FROM public.project_gate g
    WHERE g.project_id = project_copy_checklists.project_id AND g.status <> 'passed'
    ORDER BY g.position
    LIMIT 1;

    upto := public.phase_before(open_code);
    IF upto IS NULL OR upto < entered THEN
        upto := entered;
    END IF;

    INSERT INTO public.project_task (tenant_id, project_id, phase, display_name, role, blocks_gate, position)
    SELECT project_copy_checklists.tenant_id, project_copy_checklists.project_id, tt.phase, tt.display_name, tt.role,
           tt.blocks_gate, tt.position
    FROM public.task_template tt
    WHERE (tt.phase = ANY (enum_range(entered, upto)) OR (with_pl7 AND tt.phase = 'PL7'))
      AND NOT EXISTS (
          SELECT 1 FROM public.project_task t
          WHERE t.project_id = project_copy_checklists.project_id AND t.phase = tt.phase
      );
END;
$$;

-- A new project's gates and the checklists of its first phases. SECURITY DEFINER: users cannot
-- insert gates; the rows are the new project's, in its own tenant.
CREATE OR REPLACE FUNCTION private.project_create_gates () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    INSERT INTO public.project_gate (tenant_id, project_id, code, position, needs_customer_approval)
    SELECT NEW.tenant_id, NEW.id, g.code, g.position::INT, g.code <> 'G4'
    FROM unnest(public.gates_for(NEW.type, NEW.path, NEW.packages)) WITH ORDINALITY AS g (code, position);

    PERFORM private.project_copy_checklists(NEW.id, NEW.tenant_id, NEW.current_phase);

    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER project_create_gates
AFTER INSERT ON public.project FOR EACH ROW
EXECUTE FUNCTION private.project_create_gates ();

-- The gate rules (see the header), for every way a gate is passed: pass_gate or a direct update.
-- SECURITY DEFINER, so the checks see the whole project whatever the caller may read, and every
-- query filters on the gate's own tenant itself.
CREATE OR REPLACE FUNCTION private.project_gate_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    state public.project_status;
    blocking JSONB;
BEGIN
    IF NEW.status <> 'passed' THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'passed' THEN
        RAISE EXCEPTION 'gate_not_pending' USING ERRCODE = 'check_violation';
    END IF;

    SELECT p.status INTO state
    FROM public.project p
    WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id;

    IF state IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'project_not_active' USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.project_gate g
        WHERE g.project_id = NEW.project_id AND g.tenant_id = NEW.tenant_id
          AND g.position < NEW.position AND g.status <> 'passed'
    ) THEN
        RAISE EXCEPTION 'gate_order' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.needs_customer_approval AND (NEW.customer_approved_on IS NULL OR NEW.approval_document_id IS NULL) THEN
        RAISE EXCEPTION 'gate_customer_approval_required' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.approval_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document d
        WHERE d.id = NEW.approval_document_id AND d.tenant_id = NEW.tenant_id
          AND d.type = 'gate_approval' AND d.entity_type = 'project_gate' AND d.entity_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'gate_approval_document_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(NEW.evidence_document_ids) AS e (id)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.document d
            WHERE d.id = e.id AND d.tenant_id = NEW.tenant_id
              AND ((d.entity_type = 'project_gate' AND d.entity_id = NEW.id)
                   OR (d.entity_type = 'project' AND d.entity_id = NEW.project_id))
        )
    ) THEN
        RAISE EXCEPTION 'gate_evidence_invalid' USING ERRCODE = 'check_violation';
    END IF;

    -- G2 needs products, and a signed or approved spec sheet for each of them.
    IF NEW.code = 'G2' AND (
        NOT EXISTS (
            SELECT 1 FROM public.project_product pp
            WHERE pp.project_id = NEW.project_id AND pp.tenant_id = NEW.tenant_id
        )
        OR EXISTS (
            SELECT 1
            FROM public.project_product pp
            LEFT JOIN public.product_evidence e ON e.product_id = pp.product_id AND e.tenant_id = pp.tenant_id
            WHERE pp.project_id = NEW.project_id AND pp.tenant_id = NEW.tenant_id
              AND NOT coalesce(e.has_signed_spec, FALSE)
        )
    ) THEN
        RAISE EXCEPTION 'gate_spec_sheet_required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT s.value INTO blocking
    FROM public.setting s
    WHERE s.tenant_id = NEW.tenant_id AND s.key = 'gate_evidence_blocking';

    -- The blocking tasks of the phases up to the one the gate closes; tasks of later phases (left
    -- from before a rollback) do not hold back an earlier gate.
    IF coalesce(blocking, 'true'::JSONB) = 'true'::JSONB AND EXISTS (
        SELECT 1 FROM public.project_task t
        WHERE t.project_id = NEW.project_id AND t.tenant_id = NEW.tenant_id
          AND t.blocks_gate
          AND t.status <> 'done'
          AND t.phase <= public.phase_before(NEW.code)
    ) THEN
        RAISE EXCEPTION 'gate_blocked_by_task' USING ERRCODE = 'check_violation';
    END IF;

    NEW.passed_at := coalesce(NEW.passed_at, now());
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER project_gate_guard BEFORE
UPDATE ON public.project_gate FOR EACH ROW
EXECUTE FUNCTION private.project_gate_guard ();

-- A passed gate moves its project to the next phase (public.phase_after) and adds the
-- checklists of the phases entered. SECURITY DEFINER, in the gate's own tenant: the move is part
-- of passing the gate, not a separate edit of the project.
CREATE OR REPLACE FUNCTION private.project_gate_advance () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    target public.project;
    next_phase public.project_phase;
BEGIN
    SELECT * INTO target FROM public.project p WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id;

    next_phase := public.phase_after(NEW.code, target.path, target.packages);

    UPDATE public.project p SET current_phase = next_phase WHERE p.id = target.id;

    PERFORM private.project_copy_checklists(target.id, target.tenant_id, next_phase, NEW.code = 'PL_G4');

    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER project_gate_advance
AFTER UPDATE ON public.project_gate FOR EACH ROW
WHEN (
   NEW.status = 'passed'
   AND OLD.status <> 'passed'
)
EXECUTE FUNCTION private.project_gate_advance ();

REVOKE ALL ON FUNCTION private.project_set_code () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.project_immutable () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.project_copy_checklists (UUID, UUID, public.project_phase, BOOLEAN) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.project_create_gates () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.project_gate_guard () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.project_gate_advance () FROM PUBLIC, anon, authenticated;

-- Passes a gate. Runs as the caller: the gate and project are read through RLS (one the caller
-- cannot see is a 404) and the update needs the caller's right to update gates. The rules are
-- the project_gate_guard trigger's, and the phase move and checklists project_gate_advance's;
-- this function adds no rule checks of its own before the update. After it, the approval and
-- evidence documents are checked once more through RLS, so the caller must be able to see them.
-- The project row is locked first, as in rollback_gate, so passes and rollbacks of one project
-- run one after the other.
CREATE OR REPLACE FUNCTION public.pass_gate (
   gate_id UUID,
   note TEXT,
   customer_approved_on DATE DEFAULT NULL,
   approval_document_id UUID DEFAULT NULL,
   evidence_document_ids UUID[] DEFAULT '{}'
) RETURNS public.project_gate LANGUAGE plpgsql SECURITY INVOKER
SET
   search_path = '' AS $$
DECLARE
    gate_project UUID;
    result public.project_gate;
BEGIN
    SELECT g.project_id INTO gate_project FROM public.project_gate g WHERE g.id = pass_gate.gate_id;

    IF gate_project IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0002', 'message', 'gate not found')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
    END IF;

    PERFORM 1 FROM public.project p WHERE p.id = gate_project FOR UPDATE;

    IF NOT FOUND THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0002', 'message', 'project not found')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
    END IF;

    UPDATE public.project_gate g
    SET status = 'passed',
        passed_at = now(),
        decided_by_role = NULL,
        note = pass_gate.note,
        customer_approved_on = pass_gate.customer_approved_on,
        approval_document_id = pass_gate.approval_document_id,
        evidence_document_ids = coalesce(pass_gate.evidence_document_ids, '{}')
    WHERE g.id = pass_gate.gate_id
    RETURNING * INTO result;

    IF result.approval_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document d
        WHERE d.id = result.approval_document_id AND d.tenant_id = result.tenant_id
          AND d.type = 'gate_approval' AND d.entity_type = 'project_gate' AND d.entity_id = result.id
    ) THEN
        RAISE EXCEPTION 'gate_approval_document_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(result.evidence_document_ids) AS e (id)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.document d
            WHERE d.id = e.id AND d.tenant_id = result.tenant_id
              AND ((d.entity_type = 'project_gate' AND d.entity_id = result.id)
                   OR (d.entity_type = 'project' AND d.entity_id = result.project_id))
        )
    ) THEN
        RAISE EXCEPTION 'gate_evidence_invalid' USING ERRCODE = 'check_violation';
    END IF;

    RETURN result;
END;
$$;

-- Rolls a passed gate back, with every gate passed after it, and takes the project back to the
-- phase the gate closes. The gates stay rolled_back until passed again. The project row is locked
-- before any gate is touched, so a rollback and a pass of the same project cannot interleave.
CREATE OR REPLACE FUNCTION public.rollback_gate (gate_id UUID, reason TEXT) RETURNS public.project_gate LANGUAGE plpgsql SECURITY INVOKER
SET
   search_path = '' AS $$
DECLARE
    gate_project UUID;
    gate public.project_gate;
    result public.project_gate;
BEGIN
    IF nullif(btrim(rollback_gate.reason), '') IS NULL THEN
        RAISE EXCEPTION 'gate_reason_required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT g.project_id INTO gate_project FROM public.project_gate g WHERE g.id = rollback_gate.gate_id;

    IF gate_project IS NOT NULL THEN
        PERFORM 1 FROM public.project p WHERE p.id = gate_project FOR UPDATE;
        SELECT * INTO gate FROM public.project_gate g WHERE g.id = rollback_gate.gate_id FOR UPDATE;
    END IF;

    IF gate.id IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0002', 'message', 'gate not found')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
    END IF;

    IF gate.status <> 'passed' THEN
        RAISE EXCEPTION 'gate_not_passed' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.project_gate g
    SET status = 'rolled_back', rolled_back_reason = rollback_gate.reason
    WHERE g.project_id = gate.project_id AND g.position >= gate.position AND g.status = 'passed';

    UPDATE public.project p SET current_phase = public.phase_before(gate.code) WHERE p.id = gate.project_id;

    SELECT * INTO result FROM public.project_gate g WHERE g.id = gate.id;
    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.pass_gate (UUID, TEXT, DATE, UUID, UUID[]) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.rollback_gate (UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pass_gate (UUID, TEXT, DATE, UUID, UUID[]) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rollback_gate (UUID, TEXT) TO authenticated;

SELECT
   private.enable_tenant_level_security (t_name)
FROM
   unnest(ARRAY['project', 'project_product', 'project_gate', 'project_task']) AS t_name;

SELECT
   private.audit_enable ('public.project'::REGCLASS);

SELECT
   private.audit_enable ('public.project_product'::REGCLASS);

SELECT
   private.audit_enable ('public.project_gate'::REGCLASS);

SELECT
   private.audit_enable ('public.project_task'::REGCLASS);

-- Module row (from 015_ops_core.sql), kept here should this migration run alone.
INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('project', TRUE, 150)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). No
-- delete on projects (closed or cancelled instead); no insert or delete on gates (made by the
-- trigger, decided through pass_gate / rollback_gate).
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.project', 'project', 'select', 'read', FALSE, FALSE, NULL),
   ('public.project', 'project', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.project', 'project', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.project_product', 'project', 'select', 'read', FALSE, FALSE, NULL),
   ('public.project_product', 'project', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.project_product', 'project', 'delete', 'modify', FALSE, TRUE, NULL),
   ('public.project_gate', 'project', 'select', 'read', FALSE, FALSE, NULL),
   ('public.project_gate', 'project', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.project_task', 'project', 'select', 'read', FALSE, FALSE, NULL),
   ('public.project_task', 'project', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.project_task', 'project', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.project_task', 'project', 'delete', 'modify', FALSE, TRUE, NULL)
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
      'public.project',
      'public.project_product',
      'public.project_gate',
      'public.project_task'
   )
ON CONFLICT DO NOTHING;
