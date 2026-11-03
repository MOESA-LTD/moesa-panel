# Phase 2a — Media and Glossary: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the pgTAP suite in CI. Add M19 media management: files in Storage, linked to any record, uploadable from every document. Add M20 layer 1: a one-line glossary for every business enum, shown inside `SelectEnum`.

**Architecture:** Media rows (`media`) point at private Storage objects under `<tenant_id>/<media_id>/`. Records get media through `media_link`, which uses the same polymorphic `entity_type/entity_id` pattern as `document`, and a document points at its file through a composite FK `document.media_id`. The database enforces the rules (file present, type, size from the company setting, the record's update right, same customer, one primary image, unlinked-only delete), so the UI only mirrors them. The glossary lives in i18n under `glossary.<enum>.<value>`. A typed registry and a vitest keep it complete.

**Tech Stack:** Vue 3.5 + Vite 5 + PrimeVue 4 + Tailwind, TanStack Query 5, zod 4, CASL, vue-i18n; Supabase (Postgres 15, Storage, PostgREST, generated RLS), pgTAP (`pnpm test:db`), vitest 3; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md`: §6 M19, M20 (Katman 1 only; the Katman 2 page guide is a later plan), M4, M21 (readiness only), §7, §8, K7, K8.

## Global Constraints

- The existing patterns stay as they are: `defineResource` / `useUpsertForm` / `ResourceTable` / route-dialog / `queryKeys` / `appErrorHandler`. There is no `router.replace` inside route dialogs, and a picker inside a route dialog is a plain PrimeVue `Dialog`.
- Migrations are numbered `024_…` onward, one pgTAP file with the same number each (`supabase/tests/database/0NN_*.test.sql`), and each opens with a design comment (016/018/023 style).
- Every child→parent FK between tenant tables is composite `(x_id, tenant_id) → parent (id, tenant_id)`. Non-ownership references are `ON DELETE RESTRICT`.
- Every new table: `tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE`, `private.enable_tenant_level_security('<t>')`, `private.audit_enable('public.<t>'::REGCLASS)`, `permission` rows (`select` read/`throws_error` FALSE, `insert` create, `update`/`delete` modify, `throws_error` TRUE, `bypass` FALSE), and the owner role grant (016 block).
- Module `media`: `is_core = TRUE`, `position` 160, `group_name = 'media'`.
- `authenticated` has no USAGE on schema `private`. Policies and triggers may call private functions (resolved at creation), and storage policy helpers get `GRANT EXECUTE … TO authenticated` (014 pattern). pgTAP keeps ids in `set_config('test.…')`, never calls private functions while impersonating.
- Each rule violation is `RAISE EXCEPTION '<code>' USING ERRCODE = …`. Every code gets `errors.<code>` in `en` and `tr` (the `usedKeys` test) and a `NAMED_ERRORS` entry.
- Settings are per company (root tenant); a branch reads its root's value (the `private.management_gates` chain).
- Accepted media types: exactly `image/png`, `image/jpeg`, `image/webp`, `application/pdf`, `video/mp4`. No SVG. The size limit is the setting `media_max_mb` (default `25`), capped by the bucket ceiling `52428800` bytes (50 MiB, = `config.toml` `file_size_limit`).
- Media files are private (signed URLs, 3600 s). Making product images public is a separate decision (spec M19 "Faz 3 bağlantısı").
- i18n: `en` is the source and `tr` is hand-written; the other locales are filled by `pnpm i18n-sync`. Process codes (A1, G2, PL-G3) are the same in every language (K7). Glossary copy is plain text, not Markdown (M20).
- No field for sensitive data (bank, tax/EORI, passwords, platform case numbers; K8). Media titles, alt text and tags are free text, EN (spec §11 item 9).
- Generated types are refreshed with `pnpm dev:supabase-reset` and committed with every DB task (`supabase/functions/_shared/database.types.ts`).
- Commits use conventional commits and end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **File names with Turkish characters, spaces or a repeated name:** the Storage key is ASCII-safe, the original name is kept in `file_name`, and uploading `Ürün Fotoğrafı.jpg` twice gives two media rows. The second upload never overwrites the first. (Task 5: `safeFileName`, `uploadMedia` uses `upsert: false`.)
2. **One customer's file reaching another customer's record:** linking THO's photo to another customer's product, or using it as another customer's document file, fails with `media_customer_mismatch`. Shared media (`customer_id` NULL) links anywhere. (Task 3 and Task 4 pgTAP.)
3. **Deleting media that is still in use:** blocked with `media_in_use` while any link or document points at it. A file is removed from Storage only after its row is gone, so no document is ever left pointing at a missing file. (Task 2 storage-delete test, Tasks 3 and 4 pgTAP, Task 7 UI disables delete.)
4. **Marking a second primary image:** the previous primary becomes `gallery`, so a record never has two primaries and the user never sees an error. A PDF or video cannot be primary. (Task 3 `set_primary_media` pgTAP, Task 6 vitest.)
5. **A large upload from a branch:** the limit is the company's `media_max_mb`. The client refuses before uploading and names the limit in MB, and the database refuses anyway. (Task 2 `media_max_bytes` on a grandchild branch, Task 5 `maxBytesFromSetting` / `validateMediaFile`.)

---

## File map

```
.github/workflows/ci.yml                     + database job (supabase start, supabase test db)
supabase/migrations/
  024_media.sql             media_max_mb setting, media bucket + storage policies, media table, module, permissions
  025_media_link.sql        media_role, media_link, link checks, set_primary_media, media_library view, product thumbnail column
  026_document_media.sql    document.media_id (replaces storage_path), document media checks, in-use guard over documents
supabase/tests/database/    024_media.test.sql, 025_media_link.test.sql, 026_document_media.test.sql, 099_seed.test.sql (+2)
supabase/seed.sql           seed_ops_roles gives the media module (coordinator: no media delete)
app/src/api/media/
  index.ts                  types, constants, pure helpers, resources, link/primary/delete mutations
  upload.ts                 uploadMedia, readImageSize, makeThumbnail, useUploadMedia
  signedUrls.ts             createSignedUrlLoader, useSignedUrl, openMediaFile
  library.ts                MediaLibraryFilters, applyMediaLibraryFilters, useMediaLibrary
app/src/api/glossary.ts     GLOSSARY_ENUMS registry
app/src/lib/enumValues.ts   allValues<U>() exhaustiveness helper
app/src/components/service-components/media/{MediaThumb,MediaDropzone,MediaPickerDialog}.vue
app/src/components/service-components/entity-media/EntityMedia.vue
app/src/components/service-components/select-enum/SelectEnum.vue   (+ glossary, multiple)
app/src/views/pages/ops/media/{Index,Upsert}.vue
app/src/views/pages/ops/{product,customer}/tabs/Media.vue
app/src/views/pages/ops/document/{Upsert.vue, DocumentFileField.vue}
app/tests/api/{media,mediaLibrary,signedUrls}.test.ts, app/tests/components/{EntityMedia,SelectEnum}.test.ts,
app/tests/plugins/i18n/glossary.test.ts
```

---

### Task 1: pgTAP in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: CI job `database`, which every later task's pgTAP file runs in.

- [ ] **Step 1: Find the local CLI version** — Run `supabase --version`. Pin that version below (CI and local must apply migrations alike).

- [ ] **Step 2: Add the job** (after `functions`):

```yaml
    database:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4

            - uses: supabase/setup-cli@v1
              with:
                  version: <version from step 1>

            # Migrations and seed.sql run on start. Auth and Storage stay up: the seed writes
            # auth.users/identities and the migrations write storage.buckets.
            - run: supabase start -x studio,imgproxy,edge-runtime,logflare,vector
            - run: supabase test db
```

- [ ] **Step 3: Reproduce the job locally** — Run (repo root): `supabase stop --no-backup && supabase start -x studio,imgproxy,edge-runtime,logflare,vector && supabase test db`. Expected: every file from `015_core.test.sql` to `099_seed.test.sql` reports `ok`, ending with `Result: PASS`.

- [ ] **Step 4: Prove the job can fail** — Temporarily change one `is(...)` expectation in `015_core.test.sql`, then run `supabase test db`. Expected: non-zero exit and `Result: FAIL`. Revert the change.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the pgTAP suite against a local Supabase"
```

After pushing, the `database` job is green on the PR.

---

### Task 2: Media table, bucket and setting (DB)

**Files:**
- Create: `supabase/migrations/024_media.sql`, `supabase/tests/database/024_media.test.sql`
- Modify: `supabase/seed.sql` (`private.seed_ops_roles` and its header comment), `supabase/tests/database/099_seed.test.sql` (plan +2), `app/src/plugins/i18n/locales/{en,tr}/index.json` (`errors.media_file_missing`, `errors.media_type_not_allowed`, `errors.media_too_large`, `errors.media_file_immutable`; then `pnpm i18n-sync`)

**Interfaces:**
- Produces (SQL):
  - Setting: `private.default_settings()` redefined with every 022 row plus `('media_max_mb', '25'::JSONB, 'Largest file a user may upload to the media library (MB)', NULL)`. The migration then runs `SELECT private.copy_default_settings(t.id) FROM public.tenant t WHERE t.parent_id IS NULL` (idempotent, so new companies get the row from the existing trigger).
  - `private.media_max_bytes(tenant_id UUID) RETURNS BIGINT` STABLE SECURITY DEFINER: the root tenant's `media_max_mb` (walk `parent_id` as `private.management_gates` does), defaulting to 25 when missing or not a number, clamped to `[1, 50]`, × 1048576.
  - Bucket `media`: `public FALSE`, `file_size_limit 52428800`, `allowed_mime_types ARRAY['image/png','image/jpeg','image/webp','application/pdf','video/mp4']` (`ON CONFLICT (id) DO UPDATE` as in 014).
  - `private.storage_folder_id(object_name TEXT) RETURNS UUID` IMMUTABLE: `split_part(name, '/', 2)::UUID`, NULL when not a UUID (sibling of `private.storage_tenant`).
  - Storage policies on `storage.objects`, all `bucket_id = 'media'`:
    - `media_select`: `private.can_read_media_file(name)`, which is true when the folder's tenant has `public.media` `select` for `auth.uid()` (`private.tenants_permitting`).
    - `media_insert`: `private.can_write_media_file(name)`, which requires the folder tenant, a UUID second segment, and `public.media` `insert`.
    - **No update policy.** A file is never replaced; a new file is a new media row.
    - `media_delete`: `private.can_delete_media_file(name)`, which requires `can_write_media_file(name)` and no `public.media` row with `id = storage_folder_id(name)` in that tenant. A file goes only after its row (or as an orphan from a failed upload).
  - Table `public.media(id UUID PK DEFAULT gen_random_uuid(), tenant_id, customer_id UUID NULL, storage_path TEXT NOT NULL, thumbnail_path TEXT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL CHECK (size_bytes > 0), width INT NULL CHECK (width > 0), height INT NULL CHECK (height > 0), title TEXT, alt_text TEXT, tags TEXT[] NOT NULL DEFAULT '{}', uploaded_by UUID DEFAULT auth.uid(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`. Constraints:
    - `media_id_tenant_id_key UNIQUE (id, tenant_id)`
    - `unique_media_path UNIQUE (tenant_id, storage_path)`
    - `media_path_in_folder CHECK (storage_path LIKE tenant_id::TEXT || '/' || id::TEXT || '/_%' AND (thumbnail_path IS NULL OR thumbnail_path LIKE tenant_id::TEXT || '/' || id::TEXT || '/_%'))`
    - `media_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT`

    Indexes are `(tenant_id, customer_id)`, `(tenant_id, created_at DESC)`, and a GIN index on `tags`. `uploaded_by` has no FK, like `document.created_by` (M21: the uploader need not be a member of the target tenant). Trigger `set_updated_at`.
  - Trigger `media_check_file` (BEFORE INSERT OR UPDATE, SECURITY DEFINER, filters on `NEW.tenant_id`):
    - On INSERT, the `storage.objects` row (`bucket_id='media' AND name = NEW.storage_path`) must exist, else `media_file_missing` (23503). The trigger sets `NEW.mime_type := metadata->>'mimetype'` and `NEW.size_bytes := (metadata->>'size')::BIGINT`, so Storage is authoritative over whatever the client sent.
    - A type outside the five raises `media_type_not_allowed` (23514). A size above `private.media_max_bytes(NEW.tenant_id)` raises `media_too_large` (23514).
    - A non-NULL `thumbnail_path` must exist too (`media_file_missing`).
    - On UPDATE, `storage_path`, `mime_type`, `size_bytes` and `tenant_id` are fixed (`media_file_immutable`, 23514). `thumbnail_path` may go from NULL to an existing object.
  - Module `media` (160). Permissions: `public.media` select/insert/update/delete; owner grant.
- Produces (seed): `seed_ops_roles` adds `'media'` to the group list. The coordinator's exclusion adds `OR p.resource_name = 'public.media' AND p.command = 'delete'` (spec M19: delete only by management).
- M21 note (no code): `private.copy_media(media_id, target_tenant)` is not built. Nothing here blocks it:
  - The path derives only from `(tenant_id, id)`, so a copy gets a new id and folder.
  - No URL is stored, and the uploader has no FK.
  - M21 writes rows before copying files (spec M21), so its definer function must skip `media_check_file`'s existence check. It does that with the same transaction-local bypass it uses for the frozen-gate triggers and carries `mime_type`/`size_bytes` from the source row. That change belongs to M21.

- [ ] **Step 1: Write `024_media.test.sql`** — `plan(15)`, run in MOESA LTD. Store `set_config` ids first: MOESA, Atlas, Atlas Moda, the users `koordinator@`, `akif@`, `ayse@`, and fixed media ids `'00000000-0000-4000-8000-000000000241'` … `…245`. Storage rows are inserted as `postgres` before impersonating:

```sql
SELECT has_table('public', 'media', 'media table');
SELECT is((SELECT allowed_mime_types FROM storage.buckets WHERE id = 'media'),
          ARRAY['image/png','image/jpeg','image/webp','application/pdf','video/mp4'], 'media bucket types, no SVG');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'media'), FALSE, 'media bucket is private');
SELECT is((SELECT count(*)::INT FROM public.setting WHERE key = 'media_max_mb' AND value = '25'::JSONB),
          (SELECT count(*)::INT FROM public.tenant WHERE parent_id IS NULL), 'every company has media_max_mb 25');
UPDATE public.setting SET value = '30' WHERE key = 'media_max_mb' AND tenant_id = current_setting('test.atlas')::UUID;
SELECT is(private.media_max_bytes(current_setting('test.atlas_moda')::UUID), 31457280::BIGINT, 'a branch uses its company''s limit');
-- objects: <moesa>/<241>/a.png {"mimetype":"image/png","size":1000}, <242>/x.svg image/svg+xml, <243>/big.png size 26214401
-- then impersonate koordinator in MOESA
SELECT throws_ok($$ INSERT INTO public.media (id, tenant_id, storage_path, file_name, mime_type, size_bytes) VALUES (<244>, moesa, moesa||'/'||<244>||'/none.png', 'none.png', 'image/png', 1) $$,
                 '23503', 'media_file_missing', 'a row needs its uploaded file');
-- insert <241> sending mime_type 'video/mp4', size_bytes 5
SELECT is((SELECT mime_type || ':' || size_bytes FROM public.media WHERE id = <241>), 'image/png:1000', 'type and size come from Storage');
SELECT throws_ok(<insert 242>, '23514', 'media_type_not_allowed', 'SVG is refused');
SELECT throws_ok(<insert 243>, '23514', 'media_too_large', 'over 25 MB is refused');
SELECT throws_ok(<insert id 245 with storage_path moesa||'/'||<241>||'/a.png'>, '23514', NULL, 'the path must be in the media''s own folder');
SELECT throws_ok($$ UPDATE public.media SET storage_path = storage_path || 'x' WHERE id = <241> $$, '23514', 'media_file_immutable', 'the file is fixed');
SELECT lives_ok($$ INSERT INTO storage.objects (bucket_id, name) VALUES ('media', moesa||'/'||gen_random_uuid()||'/b.png') $$, 'a coordinator uploads into the company folder');
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name) VALUES ('media', atlas||'/'||gen_random_uuid()||'/b.png') $$, '42501', NULL, 'not into another tenant''s folder');
DELETE FROM storage.objects WHERE bucket_id = 'media' AND name = moesa||'/'||<241>||'/a.png';
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name = moesa||'/'||<241>||'/a.png'), 1, 'a file whose row exists is not deleted');
-- impersonate ayse in Atlas
SELECT is((SELECT count(*)::INT FROM public.media WHERE id = <241>), 0, 'another tenant cannot read the media');
```

- [ ] **Step 2: Add the two seed assertions to `099_seed.test.sql`** (as `postgres`):
  - `ok(cardinality(private.tenants_permitting(akif, ARRAY[moesa], 'public.media', 'delete')) = 1, 'management may delete media')`
  - `ok(cardinality(private.tenants_permitting(koordinator, ARRAY[moesa], 'public.media', 'delete')) = 0 AND cardinality(private.tenants_permitting(koordinator, ARRAY[moesa], 'public.media', 'insert')) = 1, 'a coordinator uploads but does not delete media')`

- [ ] **Step 3: Run and see the tests fail** — Run: `cd app && pnpm test:db`. Expected: FAIL (`media table` missing).

- [ ] **Step 4: Write `024_media.sql`** following the Interfaces above. Revoke all on every new private function from `PUBLIC, anon, authenticated`, then grant EXECUTE on the three `can_*_media_file` and `storage_folder_id` to `authenticated`. Update `seed_ops_roles` and add the four `errors.*` keys (EN/TR copy in Task 5's table). Run `pnpm i18n-sync`.

- [ ] **Step 5: Reset and run** — Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/024_media.sql supabase/tests/database/024_media.test.sql supabase/tests/database/099_seed.test.sql supabase/seed.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -m "feat(media): media table and private bucket with type and size rules"
```

---

### Task 3: Media links, primary image and library view (DB)

**Files:**
- Create: `supabase/migrations/025_media_link.sql`, `supabase/tests/database/025_media_link.test.sql`
- Modify: i18n `errors.media_in_use`, `errors.media_link_entity_missing`, `errors.media_link_forbidden`, `errors.media_link_identity_immutable`, `errors.media_customer_mismatch`, `errors.media_primary_not_image` (en/tr, then sync)

**Interfaces:**
- Consumes: `public.media`, `media_id_tenant_id_key` (Task 2); `public.document_entity` (016).
- Produces (SQL):
  - Enum `public.media_role` (`primary_image`, `gallery`, `evidence_photo`, `attachment`).
  - Table `public.media_link(id UUID PK, tenant_id, media_id UUID NOT NULL, entity_type public.document_entity NOT NULL, entity_id UUID NOT NULL, role public.media_role NOT NULL DEFAULT 'gallery', position INT NOT NULL DEFAULT 0, created_at, updated_at)`.
    - Constraints: `media_link_media_fkey FOREIGN KEY (media_id, tenant_id) REFERENCES public.media (id, tenant_id) ON DELETE RESTRICT`, and `unique_media_link UNIQUE (tenant_id, media_id, entity_type, entity_id)` (one link per file and record; the role is an attribute).
    - Index `CREATE UNIQUE INDEX media_link_one_primary ON public.media_link (tenant_id, entity_type, entity_id) WHERE role = 'primary_image'`. This means one primary per record, so "one per product" holds.
    - Index `(tenant_id, entity_type, entity_id)`.
    - Reusing `document_entity` keeps one list of linkable records; a Phase 2 table is added to it once.
  - `private.entity_customer(entity_type public.document_entity, entity_id UUID, tenant_id UUID) RETURNS UUID` STABLE SECURITY DEFINER: `customer` → its id; `product`, `project` → `customer_id`; `project_gate` → its project's `customer_id`; anything else → NULL.
  - Trigger `media_link_check` (BEFORE INSERT OR UPDATE OR DELETE, SECURITY DEFINER, uses `NEW` or `OLD`), checking in order:
    1. On UPDATE, a changed `media_id`, `entity_type`, `entity_id` or `tenant_id` raises `media_link_identity_immutable` (23514).
    2. On INSERT, the entity's table must exist (`to_regclass`; unlike `document`, a not-yet-created Phase 2 table is refused) and the row must be in the tenant, else `media_link_entity_missing` (23503).
    3. When `auth.uid()` is not NULL, the tenant must be in `private.tenants_permitting(auth.uid(), ARRAY[tenant_id], 'public.' || entity_type, 'update')`, else `media_link_forbidden` (42501). This applies on insert, update and delete. It is the tenant-logo rule: changing a record's media needs the right to change the record.
    4. On INSERT/UPDATE, `media.customer_id IS NOT NULL AND private.entity_customer(...) IS DISTINCT FROM media.customer_id` raises `media_customer_mismatch` (23514).
    5. `role = 'primary_image'` on media whose `mime_type NOT LIKE 'image/%'` raises `media_primary_not_image` (23514).
  - Trigger `media_guard_delete` (BEFORE DELETE ON media, SECURITY DEFINER): any `media_link` row for it raises `media_in_use` (23503). Task 4 widens it.
  - `public.set_primary_media(link_id UUID) RETURNS public.media_link`, SECURITY INVOKER. In one statement order it first moves the record's current primary (if any, and not `link_id`) to `gallery`, then sets `link_id` to `primary_image`. A link the caller cannot see raises `media_link_entity_missing`. `GRANT EXECUTE … TO authenticated`.
  - View `public.media_library` (security_invoker): `m.*`, plus
    - `kind TEXT`: `'image'` when the mime starts with `image/`, `'pdf'` for `application/pdf`, else `'video'`;
    - `link_count INT`;
    - `linked_types public.document_entity[]` (distinct);
    - `linked_entities TEXT[]` (`entity_type || ':' || entity_id`).

    `GRANT SELECT … TO authenticated`.
  - View `public.product_with_evidence` recreated with one column appended: `primary_image_path TEXT`. It is `coalesce(m.thumbnail_path, m.storage_path)` of the product's `primary_image` link (LEFT JOIN, so it is NULL when the caller cannot read media).
  - Permissions `public.media_link` select/insert/update/delete (group `media`); owner grant; RLS; audit.

- [ ] **Step 1: Write `025_media_link.test.sql`** — `plan(14)`, MOESA, impersonating `koordinator@`.
  - Setup as postgres: Storage objects and media rows `m_png` (THO, png), `m_png2` (THO, png), `m_pdf` (THO, pdf), `m_shared` (customer NULL, png).
  - Ids: product `THO-MOP40-2P`, product `THO-CONES-100`, the THO customer, supplier `TR1`.

```sql
SELECT has_table('public', 'media_link', 'media_link table');
SELECT lives_ok(<link m_png → product MOP40 role primary_image>, 'a coordinator links a primary image to a product');
SELECT throws_ok(<link m_png2 → MOP40 role primary_image>, '23505', NULL, 'a second primary is refused by the index');
-- link m_png2 → MOP40 as gallery, then SELECT public.set_primary_media(<that link>)
SELECT is((SELECT string_agg(m.file_name || ':' || l.role, ',' ORDER BY m.file_name) FROM public.media_link l JOIN public.media m ON m.id = l.media_id WHERE l.entity_id = <MOP40>),
          'a.png:gallery,b.png:primary_image', 'set_primary_media swaps the primary');
SELECT throws_ok(<link m_pdf → CONES role primary_image>, '23514', 'media_primary_not_image', 'a PDF cannot be primary');
SELECT throws_ok(<link m_png → supplier TR1>, '23514', 'media_customer_mismatch', 'THO''s file cannot go to a supplier');
SELECT lives_ok(<link m_shared → supplier TR1>, 'shared media links to any record');
SELECT throws_ok(<link m_shared → product id gen_random_uuid()>, '23503', 'media_link_entity_missing', 'the record must exist');
SELECT throws_ok(<link m_shared → entity_type 'shipment'>, '23503', 'media_link_entity_missing', 'not to a table that does not exist yet');
SELECT throws_ok($$ UPDATE public.media_link SET entity_id = <CONES> WHERE media_id = m_png $$, '23514', 'media_link_identity_immutable', 'a link does not move');
-- as postgres: DELETE the coordinator role's public.product update permission (rolled back with the test); impersonate koordinator again
SELECT throws_ok(<link m_shared → CONES>, '42501', 'media_link_forbidden', 'linking needs the record''s update right');
SELECT is((SELECT link_count || ':' || (linked_entities @> ARRAY['product:' || <MOP40>]) FROM public.media_library WHERE id = m_png), '1:true', 'the library counts links');
SELECT is((SELECT primary_image_path FROM public.product_with_evidence WHERE id = <MOP40>), <m_png2 storage_path>, 'the product list gets the primary image');
-- impersonate akif (management)
SELECT throws_ok($$ DELETE FROM public.media WHERE id = m_png $$, '23503', 'media_in_use', 'linked media is not deleted');
```

- [ ] **Step 2: Run and see the tests fail** — Run: `pnpm test:db`. Expected: FAIL (`media_link table`).
- [ ] **Step 3: Write `025_media_link.sql`** following the Interfaces; add the six `errors.*` keys and sync.
- [ ] **Step 4: Run** — Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/025_media_link.sql supabase/tests/database/025_media_link.test.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -m "feat(media): link media to records with one primary image and a library view"
```

---

### Task 4: Documents point at media (DB)

**Linkage decision:** use `document.media_id` with a composite FK to `media (id, tenant_id)` and drop `document.storage_path`. A path string can be neither FK-checked nor tenant-scoped, while the FK enforces the tenant rule, blocks deleting a file a document needs, and gives M21 one id to remap. (`storage_path` is unused at c733714: no app code, and no view selects `document.*`.)

**Files:**
- Create: `supabase/migrations/026_document_media.sql`, `supabase/tests/database/026_document_media.test.sql`

**Interfaces:**
- Consumes: `public.media`, `media_guard_delete`, `media_library` (Tasks 2–3).
- Produces (SQL):
  - `ALTER TABLE public.document ADD COLUMN media_id UUID`, plus `document_media_fkey FOREIGN KEY (media_id, tenant_id) REFERENCES public.media (id, tenant_id) ON DELETE RESTRICT`, plus index `(tenant_id, media_id)`.
  - Drop `document_has_file`, drop column `storage_path`, then re-add `document_has_file CHECK (url IS NOT NULL OR media_id IS NOT NULL)` under the same name (the existing NAMED_ERRORS entry keeps working).
  - Trigger `document_check_media` (BEFORE INSERT OR UPDATE OF media_id, customer_id, SECURITY DEFINER): `media.customer_id IS NOT NULL AND media.customer_id IS DISTINCT FROM NEW.customer_id` raises `media_customer_mismatch`.
  - `private.media_guard_delete()` replaced: a link **or** `EXISTS (SELECT 1 FROM public.document d WHERE d.media_id = OLD.id AND d.tenant_id = OLD.tenant_id)` raises `media_in_use`.
  - `public.media_library` recreated with `document_count INT` appended.

- [ ] **Step 1: Write `026_document_media.test.sql`** — `plan(7)`, MOESA, `koordinator@`; media `m_spec` (THO, pdf) and `m_other` (customer NULL, pdf) set up as postgres; plus one Atlas media row `m_atlas`.

```sql
SELECT has_column('public', 'document', 'media_id', 'document.media_id');
SELECT hasnt_column('public', 'document', 'storage_path', 'storage_path is gone');
SELECT lives_ok(<document product MOP40, customer THO, type spec_sheet, version 9, url NULL, media_id m_spec>, 'a document can be just a file');
SELECT throws_ok(<document … url NULL, media_id NULL>, '23514', NULL, 'a document needs a link or a file (document_has_file)');
SELECT throws_ok(<document for supplier TR1, customer_id NULL, media_id m_spec>, '23514', 'media_customer_mismatch', 'THO''s file is not another record''s document');
SELECT throws_ok(<document … media_id m_atlas>, '23503', NULL, 'not another tenant''s file');
-- impersonate akif
SELECT throws_ok($$ DELETE FROM public.media WHERE id = m_spec $$, '23503', 'media_in_use', 'a document''s file is not deleted');
```

- [ ] **Step 2: Run and see the tests fail** — Run: `pnpm test:db`. Expected: FAIL (`document.media_id`).
- [ ] **Step 3: Write `026_document_media.sql`**.
- [ ] **Step 4: Run** — Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm typecheck`. Expected: PASS (nothing in `app/` reads `storage_path`).
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/026_document_media.sql supabase/tests/database/026_document_media.test.sql supabase/functions/_shared/database.types.ts
git commit -m "feat(document): a document's file can be a media file instead of a Drive link"
```

---

### Task 5: Media API (app)

**Files:**
- Create: `app/src/api/media/{index,upload,signedUrls,library}.ts`, `app/tests/api/media.test.ts`, `app/tests/api/signedUrls.test.ts`, `app/tests/api/mediaLibrary.test.ts`
- Modify:
  - `app/src/api/queryKeys.ts`: DERIVED adds `media: ['media_library', 'product_with_evidence']` and `media_link: ['media_library', 'product_with_evidence', 'media']`, and `document` gains `'media_library'`.
  - `app/src/lib/form/postgrestErrors.ts`: NAMED_ERRORS, see the table below.
  - `app/src/constants/form/field.ts`: `media: { name: 'ops-media-edit' }`.
  - i18n `fields.media`, `fields.media_link`, `ops.setting.keys.media_max_mb`, `ops.media.*`, `errors.media_already_linked`, `errors.media_primary_exists`, `errors.document_file_required`.
  - `app/tests/plugins/i18n/fields.test.ts`: `OPS_TABLES` adds `media` and `media_link`; `OPS_MODULES` adds `media`.
  - `app/tests/api/queryKeys.test.ts` and `app/tests/lib/form/postgrestErrors.test.ts`: one case each.

**Interfaces:**
- Consumes: Tasks 2–4 tables and views; `useTenantKey`, `useSetting`, `defineResource`, `invalidateTables`, `supabase`.
- Produces, `api/media/index.ts`:
  - Types: `MediaRow = Tables['media']['Row']`, `MediaLinkRow = Tables['media_link']['Row']`, `MediaLibraryRow = Views['media_library']['Row']`, `MediaRole = Enums['media_role']`, `MediaKind = 'image' | 'pdf' | 'video'`, `EntityMediaLink = MediaLinkRow & { media: MediaRow }`.
  - Constants: `MEDIA_BUCKET = 'media'`; `MEDIA_TYPES = ['image/png','image/jpeg','image/webp','application/pdf','video/mp4'] as const`; `MEDIA_ROLES` (`allValues<MediaRole>()`, Task 9); `MEDIA_KINDS = ['image','pdf','video'] as const`; `MEDIA_MAX_MB_DEFAULT = 25`; `MEDIA_MAX_MB_CEILING = 50`; `THUMBNAIL_SIZE = 400`; `THUMBNAIL_NAME = 'thumb.webp'`.
  - `mediaKind(mimeType: string): MediaKind`.
  - `safeFileName(name: string): string`. It takes the extension from `/\.([a-z0-9]{1,5})$/i` (lower-cased). For the base it applies NFKD, strips combining marks, maps `ı`→`i`, lower-cases, turns every run of non-`[a-z0-9]` into `-`, trims `-`, and caps at 80 characters; an empty base becomes `file`.
  - `mediaPath(tenantId: string, mediaId: string, fileName: string): string` returns `${tenantId}/${mediaId}/${safeFileName(fileName)}`.
  - `maxBytesFromSetting(value: Json | undefined): number`: a number clamped to `[1, 50]`, times 1048576, else `25 * 1048576`.
  - `validateMediaFile(file: Pick<File, 'type' | 'size'>, maxBytes: number): 'media_type_not_allowed' | 'media_too_large' | null`.
  - `thumbPath(media: Pick<MediaRow, 'mime_type' | 'thumbnail_path' | 'storage_path'>): string | null`: for images, `thumbnail_path ?? storage_path`; otherwise NULL.
  - `defaultLinkRole({ kind, entityType, hasPrimary }: { kind: MediaKind; entityType: DocumentEntity; hasPrimary: boolean }): MediaRole`. It returns `primary_image` only for an image on a `product` without a primary, `gallery` for other images, and `attachment` otherwise.
  - `mediaResource = defineResource('media')`.
  - `useEntityMedia(entityType: MaybeRefOrGetter<DocumentEntity>, entityId: MaybeRefOrGetter<string>)` returns `UseQueryReturnType<EntityMediaLink[]>`. It reads `media_link` with `select('*, media(*)')` filtered on the entity, primary first and then by `position`. Its key is `queryKeys.list(tenant, 'media_link', { entityType, entityId })`.
  - Mutations, each followed by `invalidateTables`:
    - `useLinkMedia()` takes `{ entityType, entityId, links: { mediaId: string; role: MediaRole }[] }`. Positions continue after the record's highest.
    - `useUnlinkMedia()` takes `{ linkIds: string[] }`.
    - `useSetLinkRole()` takes `{ linkIds: string[]; role: Exclude<MediaRole, 'primary_image'> }`.
    - `useSetPrimaryMedia()` takes `{ linkId: string }` and calls `rpc('set_primary_media', { link_id })`.
    - `useDeleteMedia()` takes `{ media: Pick<MediaRow, 'id' | 'storage_path' | 'thumbnail_path'> }`. It deletes the row first, then calls `storage.remove([storage_path, thumbnail_path].filter(Boolean))`.
- Produces, `api/media/upload.ts`:
  - `class MediaFileError extends Error { code: 'media_type_not_allowed' | 'media_too_large' }`, whose message is `t('errors.<code>')`.
  - `readImageSize(file: File): Promise<{ width: number; height: number } | null>`.
  - `makeThumbnail(file: File, size = THUMBNAIL_SIZE): Promise<Blob | null>`: webp, longest side `size`, images only.
  - `uploadMedia(file: File, ctx: { tenantId: string; customerId: string | null; maxBytes: number }): Promise<MediaRow>`. Steps in order:
    1. Validate (throws `MediaFileError`).
    2. Generate `id = crypto.randomUUID()`.
    3. Upload the original with `{ contentType: file.type, upsert: false }`.
    4. For images, upload the thumbnail to `${tenantId}/${id}/thumb.webp`.
    5. Insert the row with `{ id, tenant_id, customer_id, storage_path, thumbnail_path, file_name: file.name, mime_type: file.type, size_bytes: file.size, width, height, title: <name without extension> }` and `.select().single()`.
    6. If the insert fails, remove the uploaded paths and rethrow.
  - `useUploadMedia()` mutation takes `{ file: File; customerId: string | null }` and returns `MediaRow`. It reads `maxBytesFromSetting(useSetting('media_max_mb', 25))` and invalidates `['media']`.
- Produces, `api/media/signedUrls.ts`:
  - `createSignedUrlLoader(sign: (paths: string[]) => Promise<Record<string, string>>, { ttlMs = 50 * 60_000, now = Date.now } = {})` returns `{ load(path: string): Promise<string> }`. Calls made in the same microtask share one `sign` call, and a URL is cached until `ttlMs` has passed. Signing is 3600 s, so a cached URL is always valid.
  - `useSignedUrl(path: MaybeRefOrGetter<string | null>)` returns `ComputedRef<string | undefined>`, using a module-level loader over `supabase.storage.from('media').createSignedUrls(paths, 3600)`.
  - `openMediaFile(path: string, fileName: string): Promise<void>` signs for 60 s with `{ download: fileName }` and calls `window.open(url, '_blank', 'noopener')`.
- Produces, `api/media/library.ts`:
  - `MediaLibraryFilters = { customerId?: string | null; includeShared?: boolean; kind?: MediaKind | null; tag?: string | null; linkedType?: DocumentEntity | 'none' | null; entityId?: string | null }`.
  - `applyMediaLibraryFilters<Q>(query: Q, filters: MediaLibraryFilters): Q`, where `Q` is the PostgREST filter builder. Each filter maps as follows:
    - `customerId` alone: `eq('customer_id', id)`.
    - `customerId` with `includeShared`: `or('customer_id.eq.<id>,customer_id.is.null')`.
    - `kind`: `eq('kind', k)`.
    - `tag`: `contains('tags', [tag])`.
    - `linkedType` `'none'`: `eq('link_count', 0)` and `eq('document_count', 0)`.
    - Any other `linkedType`: `contains('linked_types', [t])`.
    - `linkedType` with `entityId`: `contains('linked_entities', [`${t}:${id}`])`.
    - Empty values add nothing.
  - `MEDIA_PAGE_SIZE = 48`.
  - `useMediaLibrary(filters: MaybeRefOrGetter<MediaLibraryFilters>)` is a `useInfiniteQuery` over `media_library`, ordered `created_at` desc, with `range(page * 48, page * 48 + 47)` and key `queryKeys.list(tenant, 'media_library', filters)`.

NAMED_ERRORS additions. Each one's `message` is `errors.<code>` unless the table names another key:

| code | name | field |
|---|---|---|
| 23503 | media_file_missing | media_id |
| 23514 | media_type_not_allowed | media_id |
| 23514 | media_too_large | media_id |
| 23514 | media_file_immutable | media_id |
| 23503 | media_in_use | id |
| 23503 | media_link_entity_missing | media_id |
| 42501 | media_link_forbidden | media_id |
| 23514 | media_link_identity_immutable | media_id |
| 23514 | media_customer_mismatch | media_id |
| 23514 | media_primary_not_image | role |
| 23505 | unique_media_link | media_id (`errors.media_already_linked`) |
| 23505 | media_link_one_primary | role (`errors.media_primary_exists`) |

Error copy (EN / TR):

| key | en | tr |
|---|---|---|
| media_file_missing | The file was not uploaded. Try again. | Dosya yüklenmedi. Tekrar deneyin. |
| media_type_not_allowed | Only PNG, JPEG, WebP, PDF and MP4 files can be uploaded. | Yalnızca PNG, JPEG, WebP, PDF ve MP4 dosyaları yüklenebilir. |
| media_too_large | The file is larger than the upload limit in the settings. | Dosya, ayarlardaki yükleme sınırından büyük. |
| media_file_immutable | A media file cannot be replaced; upload a new one. | Ortam dosyası değiştirilemez; yenisini yükleyin. |
| media_in_use | The file is linked to a record or a document; unlink it first. | Dosya bir kayda ya da belgeye bağlı; önce bağlantıyı kaldırın. |
| media_link_entity_missing | The record to link to does not exist. | Bağlanacak kayıt bulunamadı. |
| media_link_forbidden | You may not change this record, so you cannot change its media. | Bu kaydı değiştirme yetkiniz yok; ortamını da değiştiremezsiniz. |
| media_link_identity_immutable | A link cannot be moved to another file or record. | Bağlantı başka bir dosyaya ya da kayda taşınamaz. |
| media_customer_mismatch | This file belongs to another customer. | Bu dosya başka bir müşteriye ait. |
| media_primary_not_image | Only an image can be the primary image. | Birincil görsel yalnızca bir resim olabilir. |
| media_already_linked | The file is already linked to this record. | Dosya bu kayda zaten bağlı. |
| media_primary_exists | The record already has a primary image. | Kaydın zaten bir birincil görseli var. |
| document_file_required | Add a Drive link or a file. | Drive bağlantısı ya da dosya ekleyin. |

UI copy the spec fixes, as `ops.media.*` keys (EN / TR):
- `title`: Media / Ortam
- `library`: Media library / Ortam kütüphanesi
- `upload`: Upload file / Dosya yükle
- `pick`: Pick from library / Kütüphaneden seç
- `link_from_library`: Link from library / Kütüphaneden bağla
- `primary`: Primary image / Birincil görsel
- `role.{primary_image,gallery,evidence_photo,attachment}`: Primary image, Gallery, Evidence photo, Attachment / Birincil görsel, Galeri, Kanıt fotoğrafı, Ek
- `kind.{image,pdf,video}`: Image, PDF, Video / Görsel, PDF, Video
- `upload_hint`: PNG, JPEG, WebP, PDF or MP4, up to {mb} MB. / PNG, JPEG, WebP, PDF ya da MP4, en fazla {mb} MB.
- `ops.setting.keys.media_max_mb`: Largest upload (MB) / En büyük yükleme (MB)

The remaining `ops.media.*` labels are the implementer's choice.

- [ ] **Step 1: Write the tests**

```ts
// media.test.ts
expect(safeFileName('Ürün Fotoğrafı (1).JPG')).toBe('urun-fotografi-1.jpg');
expect(safeFileName('ŞĞÜÇÖİ ı.png')).toBe('sgucoi-i.png');
expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
expect(safeFileName('.png')).toBe('file.png');
expect(mediaPath('t1', 'm1', 'A B.webp')).toBe('t1/m1/a-b.webp');
expect(maxBytesFromSetting(25)).toBe(26214400);
expect(maxBytesFromSetting(80)).toBe(52428800);
expect(maxBytesFromSetting('x')).toBe(26214400);
expect(validateMediaFile({ type: 'image/svg+xml', size: 10 }, 26214400)).toBe('media_type_not_allowed');
expect(validateMediaFile({ type: 'image/png', size: 26214401 }, 26214400)).toBe('media_too_large');
expect(validateMediaFile({ type: 'video/mp4', size: 1 }, 26214400)).toBeNull();
expect(mediaKind('image/webp')).toBe('image'); expect(mediaKind('application/pdf')).toBe('pdf'); expect(mediaKind('video/mp4')).toBe('video');
expect(defaultLinkRole({ kind: 'image', entityType: 'product', hasPrimary: false })).toBe('primary_image');
expect(defaultLinkRole({ kind: 'image', entityType: 'product', hasPrimary: true })).toBe('gallery');
expect(defaultLinkRole({ kind: 'image', entityType: 'customer', hasPrimary: false })).toBe('gallery');
expect(defaultLinkRole({ kind: 'pdf', entityType: 'product', hasPrimary: false })).toBe('attachment');
// uploadMedia (vi.mock('@/lib/supabase')): upload called with (`t1/<id>/a.pdf`, file, { contentType: 'application/pdf', upsert: false });
// two uploads of the same name → two different ids; insert error → storage.remove called with the uploaded paths, error rethrown;
// an SVG → rejects with MediaFileError code 'media_type_not_allowed' and storage.upload not called.

// signedUrls.test.ts
// two load() calls in one tick → sign called once with both paths; a cached path → no new call;
// after ttlMs (fake `now`) → signed again.

// mediaLibrary.test.ts (a fake builder recording [method, ...args]):
expect(calls({ customerId: 'c1', includeShared: true })).toEqual([['or', 'customer_id.eq.c1,customer_id.is.null']]);
expect(calls({ linkedType: 'product', entityId: 'p1' })).toEqual([['contains', 'linked_types', ['product']], ['contains', 'linked_entities', ['product:p1']]]);
expect(calls({ linkedType: 'none' })).toEqual([['eq', 'link_count', 0], ['eq', 'document_count', 0]]);
expect(calls({ tag: '', kind: null })).toEqual([]);

// queryKeys.test.ts
expect(affectedTables(['media_link'])).toEqual(expect.arrayContaining(['media_library', 'product_with_evidence']));
// postgrestErrors.test.ts
expect(mapPostgrestError({ code: '23514', message: 'media_too_large' }, ['media_id'])).toEqual({ media_id: i18n.t('errors.media_too_large') });
```

- [ ] **Step 2: Run and see the tests fail** — Run: `pnpm test tests/api/media.test.ts tests/api/signedUrls.test.ts tests/api/mediaLibrary.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the four modules plus the queryKeys, NAMED_ERRORS, field.ts and i18n changes (then `pnpm i18n-sync`).
- [ ] **Step 4: Run** — Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/media app/src/api/queryKeys.ts app/src/lib/form/postgrestErrors.ts app/src/constants/form/field.ts app/src/plugins/i18n/locales app/tests
git commit -m "feat(media): upload, signed URLs, links and library queries"
```

---

### Task 6: Media tab on product and customer cards

**Files:**
- Create:
  - `app/src/components/service-components/media/MediaThumb.vue`
  - `app/src/components/service-components/media/MediaDropzone.vue`
  - `app/src/components/service-components/media/MediaPickerDialog.vue`
  - `app/src/components/service-components/entity-media/EntityMedia.vue`
  - `app/src/views/pages/ops/product/tabs/Media.vue`
  - `app/src/views/pages/ops/customer/tabs/Media.vue`
  - `app/tests/components/EntityMedia.test.ts`
- Modify:
  - `app/src/views/pages/ops/product/useProductForm.ts`: `PRODUCT_CARD_TABS = ['general', 'dimensions', 'cost', 'documents', 'media']`.
  - `ProductCard.vue`: TabPanel `media` is `<Media v-if="id && activeTab === 'media'" :id />`.
  - `customer/Manage.vue`: a media tab after documents.
  - `app/src/router/routes/ops.ts`: children `ops-product-manage-media` and `ops-customer-manage-media`, path `media`, label `route.label.ops_{product,customer}_media`, `PrimeIcons.IMAGES`, `visible: false`.
  - i18n.

**Interfaces:**
- Consumes: everything in Task 5.
- Produces:
  - `MediaThumb.vue` props `{ path: string | null; mimeType?: string | null; alt?: string | null; size?: number }` (default size 48 px). It shows the image from `useSignedUrl(path)`, or a kind icon (`pi-file-pdf`, `pi-video`, `pi-image` placeholder when there is no path).
  - `MediaDropzone.vue` props `{ customerId: string | null; multiple?: boolean; compact?: boolean }`, emits `uploaded: [media: MediaRow[]]`.
    - It wraps PrimeVue `FileUpload` (`customUpload`, `accept` = `MEDIA_TYPES.join(',')`, drag-and-drop). It shows `ops.media.upload_hint` with `{ mb }`.
    - Files are uploaded one by one through `useUploadMedia`; each failure goes to `appErrorHandler` and the rest continue.
  - `MediaPickerDialog.vue` props `{ customerId?: string | null; multiple?: boolean; excludeIds?: string[]; kinds?: MediaKind[] }`, `v-model:visible`, emits `picked: [media: MediaLibraryRow[]]`.
    - It is a plain `Dialog`, not a route dialog.
    - The grid comes from `useMediaLibrary({ customerId, includeShared: true, kind })`, with a "load more" button.
  - `EntityMedia.vue` props `{ entityType: DocumentEntity; entityId: string; customerId?: string | null }`. It shows a grid of `useEntityMedia` cards: thumb, file name, role tag, a primary star on images, and a checkbox. Editing needs `canEdit = $can('modify', entityType) && $can('create', 'media_link')`. Actions:
    - The dropzone uploads with `customerId` and then links each file with `defaultLinkRole` (`hasPrimary` from the current links).
    - "Link from library" opens the picker with `excludeIds` set to the linked media ids.
    - Bulk actions on the selection: "Set role" (gallery, evidence_photo, attachment) and "Unlink".
    - The star calls `useSetPrimaryMedia`.
    - A click opens the file (`openMediaFile`).
  - `tabs/Media.vue` (product): `EntityMedia entityType="product" :entityId="id" :customerId="product.customer_id"`. Customer: `entityType="customer" :customerId="customer.id"`.

- [ ] **Step 1: Write `EntityMedia.test.ts`** (mock `@/api/media` hooks):
  - It renders one card per link with the primary first.
  - Clicking the star on a gallery image calls `setPrimary.mutateAsync({ linkId })` once.
  - A PDF card has no star.
  - Selecting two cards and "Unlink" calls `unlink.mutateAsync({ linkIds: [a, b] })`.
  - Without `modify` on the entity (ability rules lacking `update` on `product`), there is no dropzone, star or bulk bar.
  - An upload of an image to a product without links calls `link.mutateAsync` with `role: 'primary_image'`.
- [ ] **Step 2: Run and see the tests fail** — Run: `pnpm test tests/components/EntityMedia.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, tabs, routes and i18n; run `pnpm i18n-sync`.
- [ ] **Step 4: Run** — Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then `pnpm dev:vue` as `koordinator@moesa-panel.test`: on THO-MOP40-2P → Media, drop two PNGs. The first becomes primary; starring the second swaps them.
- [ ] **Step 5: Commit**

```bash
git add app/src/components/service-components/media app/src/components/service-components/entity-media app/src/views/pages/ops/product app/src/views/pages/ops/customer app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/components/EntityMedia.test.ts
git commit -m "feat(media): media tab on product and customer cards with upload, primary image and library links"
```

---

### Task 7: Media library page

**Files:**
- Create: `app/src/views/pages/ops/media/Index.vue`, `app/src/views/pages/ops/media/Upsert.vue`
- Modify: `app/src/router/routes/ops.ts`, i18n, `app/tests/api/media.test.ts` (schema cases)

**Interfaces:**
- Consumes: `useMediaLibrary`, `applyMediaLibraryFilters`, `MediaThumb`, `MediaDropzone`, `useDeleteMedia`, `mediaResource` (Tasks 5–6); `useCustomerFilter` (Phase 1).
- Produces:
  - Route `ops-media`: path `media`, label `route.label.ops_media`, icon `PrimeIcons.IMAGES`, `requiredPermissions: [{ action: 'select', subject: 'media' }]`, component `media/Index.vue`.
  - Route `ops-media-edit`: path `media/:id/edit`, route-dialog, `visible: false`, `requiredPermissions: [{ action: 'modify', subject: 'media' }]`, component `media/Upsert.vue`.
  - `mediaSchema` (zod, in `api/media/index.ts`): `title: optional(z.string().max(200))`, `alt_text: optional(z.string().max(300))`, `tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20)`, `customer_id: z.string().nullish()`. Also `toMediaFormValues` and `toMediaPayload` (only those four fields).
  - `Index.vue` is a grid, not a ResourceTable.
    - Filter bar: customer (`SelectCustomer`, initial value from the global customer filter), kind (`SelectEnum` `MEDIA_KINDS`, `ops.media.kind`), tag (InputText, applied on Enter), linked record (`SelectEnum` over `[...DOCUMENT_ENTITIES, 'none']` with `ops.document.entity` / `ops.media.unlinked`). The route query `entity_type` and `entity_id` preset the last two.
    - A dropzone with `customerId` = the selected customer.
    - Card actions: open, edit (route-dialog), delete. Delete shows only with `$can('delete','media')`, is disabled with tooltip `errors.media_in_use` when `link_count + document_count > 0`, and asks for confirmation.
- [ ] **Step 1: Add schema tests to `media.test.ts`** — `tags: [' Mop ', 'mop']` parses to `['mop', 'mop']`; `toMediaPayload` drops `storage_path` and other non-form fields; a 201-character title fails on `title`.
- [ ] **Step 2: Run and see the tests fail** — Run: `pnpm test tests/api/media.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the pages, routes and i18n; run `pnpm i18n-sync`.
- [ ] **Step 4: Run** — Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. In the browser as `koordinator@`, the delete action is absent. As `akif@`, deleting the linked file is disabled, and deleting an unlinked one removes the card.
- [ ] **Step 5: Commit**

```bash
git add app/src/views/pages/ops/media app/src/api/media/index.ts app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/api/media.test.ts
git commit -m "feat(media): media library with customer, type, tag and linked-record filters"
```

---

### Task 8: Files on documents and thumbnails in the product list

**Files:**
- Create: `app/src/views/pages/ops/document/DocumentFileField.vue`
- Modify:
  - `app/src/api/document/index.ts`: schema, form values, `useEntityDocuments` select `'*, media(storage_path, file_name)'`.
  - `app/src/views/pages/ops/document/Upsert.vue`: a `DocumentFileField` beside the url field. The url label becomes `ops.document.drive_link` ("Drive link" / "Drive bağlantısı").
  - `EntityDocuments.vue` and `document/Index.vue`: the link column also opens a media file.
  - `app/src/views/pages/ops/product/Index.vue`: a first column `primary_image_path` rendering `MediaThumb`, without header text, `aria-label` `ops.media.primary`.
  - i18n.
  - `app/tests/api/document.test.ts`.

**Interfaces:**
- Consumes: `MediaDropzone`, `MediaPickerDialog`, `openMediaFile`, `mediaResource` (Tasks 5–6); `product_with_evidence.primary_image_path` (Task 3).
- Produces:
  - `documentSchema` gains `media_id: z.string().nullish()`. Its `superRefine` adds: `!url && !media_id` gives an issue at path `['url']` with message `errors.document_file_required`. `toDocumentFormValues` maps `media_id ?? null`.
  - `DocumentFileField.vue`: `v-model:mediaId` (`string | null`), props `{ customerId?: string | null; readonly?: boolean }`. When set, it shows the file name (`mediaResource.useOne`) with "open" and "remove" buttons. When empty, it shows `MediaDropzone compact :multiple="false" :customerId` ("Upload file") and a "Pick from library" button (`MediaPickerDialog :customerId`). Every document type offers both (spec M19).
- [ ] **Step 1: Tests in `document.test.ts`**:
  - `documentSchema.safeParse(formValues({ url: '', media_id: null }))` fails with an issue at `url` whose message is `i18n.t('errors.document_file_required')`.
  - `formValues({ url: '', media_id: 'm1' })` succeeds.
  - `toDocumentPayload` keeps `media_id: 'm1'`.
  - `toDocumentFormValues({ media_id: 'm1' }).media_id === 'm1'`.
- [ ] **Step 2: Run and see the tests fail** — Run: `pnpm test tests/api/document.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** and sync i18n.
- [ ] **Step 4: Run** — Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. In the browser:
  - Add a THO spec sheet with an uploaded PDF and no Drive link. It saves, and the document list's link column downloads it.
  - The product list shows MOP40's thumbnail.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/document/index.ts app/src/views/pages/ops/document app/src/components/service-components/entity-documents app/src/views/pages/ops/product/Index.vue app/src/plugins/i18n/locales app/tests/api/document.test.ts
git commit -m "feat(document): upload or pick a media file for any document; product list thumbnails"
```

---

### Task 9: Glossary keys and registry

**Files:**
- Create: `app/src/lib/enumValues.ts`, `app/src/api/glossary.ts`, `app/tests/plugins/i18n/glossary.test.ts`
- Modify:
  - `app/src/api/project/index.ts`: export `GATE_CODES = Object.keys(GATE_CLOSES_PHASE) as [GateCode, ...GateCode[]]`.
  - The enum arrays below are wrapped in `allValues<…>()`.
  - `en` and `tr` `index.json` get the top-level `glossary`; then `pnpm i18n-sync`.

**Interfaces:**
- Produces:
  - `allValues = <U extends string>() => <const A extends readonly U[]>(values: A & ([Exclude<U, A[number]>] extends [never] ? unknown : { missing: Exclude<U, A[number]> })): A => values`. A DB enum value added later fails `pnpm typecheck` at the array.
  - It is applied to `CUSTOMER_STATUSES`, `SUPPLIER_STATUSES`, `PRODUCT_STATUSES`, `PROJECT_TYPES`, `PROJECT_PATHS` and `TASK_STATUSES` (with their DB enum types) and to `MEDIA_ROLES`.
  - `GLOSSARY_ENUMS = { package: PACKAGES, project_type: PROJECT_TYPES, project_path: PROJECT_PATHS, gate_code: GATE_CODES, document_type: DOCUMENT_TYPES, document_status: DOCUMENT_STATUSES, supplier_status: SUPPLIER_STATUSES, customer_status: CUSTOMER_STATUSES, product_status: PRODUCT_STATUSES, task_status: TASK_STATUSES } as const`. `GlossaryEnum = keyof typeof GLOSSARY_ENUMS`. `glossaryKey(e: GlossaryEnum, value: string) => `glossary.${e}.${value}``.

The glossary copy below is exact; `en`/`tr` take it verbatim. Sources: package rows are from 06 §1.4, gates from 06 §4/§4B/§5 (the spec names 06 §1–§2 as the glossary source), project types from spec M5, and the rest from the named spec sections. Per spec M20, the owner reviews TR. Rows marked **[owner to confirm]** are the developer's reading where neither the spec nor 06 defines the value.

| key | en | tr |
|---|---|---|
| package.A0 | Market research, concept and design (PL1–PL3): research report, approved concept, design and brand file. | Pazar araştırması, konsept ve tasarım (PL1–PL3): araştırma raporu, onaylı konsept, tasarım ve marka dosyası. |
| package.A1 | Brand sourcing (P1–P4): an existing brand's or maker's product, approved and quality-checked. | Marka sourcing (P1–P4): mevcut bir markanın ya da üreticinin ürünü; onaylı, kalite kontrolünden geçmiş. |
| package.A2 | Private label development (P1 → PL1–PL7 → P3–P4): a product made under the customer's brand from the concept on; includes A0. | Private label geliştirme (P1 → PL1–PL7 → P3–P4): müşterinin markasıyla konseptten itibaren geliştirilen ürün; A0'ı içerir. |
| package.B | Logistics and delivery (P5–P6): goods cleared through customs and in the customer's warehouse. | Lojistik ve teslim (P5–P6): ürün gümrüklenmiş, müşterinin deposunda. |
| package.C | Listing and market launch (L1–L5): the product live on the chosen platforms and countries. | Listing ve pazara açılış (L1–L5): ürün seçilen platform ve ülkelerde yayında. |
| package.D | End to end: A1 or A2 plus B and C, one contact from idea to a product ready to sell. | Uçtan uca: A1 veya A2 + B + C; fikirden satışa hazır ürüne tek muhatap. |
| package.E | Ongoing management (O1–O3): reorders, listing upkeep, reporting. No project; a reorder opens a reorder project. | Sürekli yönetim (O1–O3): yeniden sipariş, listing bakımı, raporlama. Proje açılmaz; yeniden sipariş reorder projesi olur. |
| project_type.npi | New product: goes through the full gate set of its path. | Yeni ürün: yolunun tam kapı setinden geçer. |
| project_type.variant | A new variant of an existing product (G2 → G5). | Mevcut üründen yeni varyant (G2 → G5). |
| project_type.revision | A spec or packaging change after a change request (G2 → G5). | Değişiklik talebi sonucu spec ya da ambalaj değişikliği (G2 → G5). |
| project_type.reorder | A repeat order of an approved product (G3 → G5). | Onaylı ürünün tekrar siparişi (G3 → G5). |
| project_path.a_sourcing | Path A, brand sourcing: supplier and sample (P2) for an existing brand's product. | A yolu, marka sourcing: mevcut markanın ürünü için tedarikçi ve numune (P2). |
| project_path.b_private_label | Path B, private label: from concept to print approval (PL1–PL7) under the customer's brand. | B yolu, private label: müşterinin markasıyla konseptten baskı onayına (PL1–PL7). |
| gate_code.G1 | Project start (M): brief and feasibility approved. | Proje başlatma (M): brief ve fizibilite onaylı. |
| gate_code.G2 | Sample, spec sheet and NPDS approval (M); not passed without a signed spec sheet. | Numune, spec sheet ve NPDS onayı (M); imzalı spec sheet olmadan geçilmez. |
| gate_code.G3 | PI, price and print approval (M). | PI, fiyat ve baskı onayı (M). |
| gate_code.G4 | Shipment release (internal): PSI passed, documents complete; approved by compliance and quality. | Sevkiyat izni (iç kapı): PSI geçti, belgeler tam; onay uyum ve kalite sorumlusunda. |
| gate_code.G5 | Delivery acceptance (M) at the customer's warehouse. | Teslim kabulü (M), müşterinin deposunda. |
| gate_code.PL_G1 | Concept and design approval (M), in writing. | Konsept ve tasarım onayı (M), yazılı. |
| gate_code.PL_G2 | Brand and identity approval (M). | Marka ve kimlik onayı (M). |
| gate_code.PL_G3 | Golden sample approval (M). | Altın numune onayı (M). |
| gate_code.PL_G4 | Approval to print the packaging (M). | Baskıya onay (M). |
| gate_code.L_G1 | Content approval (M). | İçerik onayı (M). |
| gate_code.L_G2 | Project closure (M). | Proje kapanışı (M). |
| document_type.spec_sheet | The maker's product specification, signed and stamped: the product's evidence. | Üreticinin imzalı ve kaşeli ürün spesifikasyonu: ürünün kanıtı. |
| document_type.tech_pack | Design package for the maker: drawings, materials, measurements. | Üreticiye tasarım paketi: çizim, malzeme, ölçüler. |
| document_type.sample_report | Sample evaluation: how the sample compares with the spec. | Numune değerlendirmesi: numunenin spec'e göre durumu. |
| document_type.pi | Proforma invoice from the supplier: quantities, prices, terms. | Tedarikçinin proforma faturası: adet, fiyat, şartlar. |
| document_type.po | Purchase order sent to the supplier. | Tedarikçiye gönderilen satın alma siparişi. |
| document_type.psi_report | Pre-shipment inspection report (AQL), with photos and video. | Yükleme öncesi kontrol raporu (AQL), fotoğraflı ve videolu. |
| document_type.test_report | Laboratory test report for the product's compliance. | Ürün uyumu için laboratuvar test raporu. |
| document_type.sds | Safety data sheet; required for chemicals. | Güvenlik bilgi formu; kimyasallarda zorunlu. |
| document_type.doc_of_conformity | EU declaration of conformity (DoC). | AB uygunluk beyanı (DoC). |
| document_type.technical_file | Technical documentation kept for market surveillance. | Piyasa gözetimi için tutulan teknik dosya. |
| document_type.label_artwork | Label and packaging print file: dieline, GTIN, warnings. | Etiket ve ambalaj baskı dosyası: dieline, GTIN, uyarılar. |
| document_type.packing_list | Packing list of a shipment: cartons, quantities, weights. | Sevkiyatın çeki listesi: koli, adet, ağırlık. |
| document_type.commercial_invoice | Commercial invoice for customs. | Gümrük için ticari fatura. |
| document_type.bill_of_lading | Bill of lading (B/L) from the carrier. | Taşıyıcının konşimentosu (B/L). |
| document_type.customs | Customs declaration and clearance papers. | Gümrük beyannamesi ve işlem belgeleri. |
| document_type.delivery_receipt | Delivery receipt signed at the warehouse; evidence for G5. | Depoda imzalanan teslim tutanağı; G5 kanıtı. |
| document_type.gate_approval | The customer's written approval of a gate (e-mail or e-signature). | Kapının yazılı müşteri onayı (e-posta ya da e-imza). |
| document_type.change_request | Change request (CR): a versioned change to spec, design, packaging or price. | Değişiklik talebi (CR): spec, tasarım, ambalaj ya da fiyatta sürümlü değişiklik. |
| document_type.contract | Contract with a customer or supplier (MSA, SOW, NDA). | Müşteri ya da tedarikçiyle sözleşme (MSA, SOW, NNN). |
| document_type.certificate | A supplier's or product's certificate. | Tedarikçi ya da ürün sertifikası. |
| document_type.other | Any other document. | Diğer belgeler. |
| document_status.draft | Not final yet; may change. | Henüz kesin değil; değişebilir. |
| document_status.signed | Signed, stamped, sent from the official e-mail and dated. | İmzalı, kaşeli, resmî e-postadan gönderilmiş ve tarihli. |
| document_status.approved | Accepted; an approved spec sheet must also be signed. | Kabul edildi; onaylı spec sheet ayrıca imzalı olmalı. |
| document_status.superseded | Replaced by a newer version; kept, never deleted. | Yeni sürümle değiştirildi; saklanır, silinmez. |
| supplier_status.candidate | Being evaluated; no orders yet. **[owner to confirm]** | Değerlendiriliyor; henüz sipariş yok. |
| supplier_status.approved | Evaluated and approved for orders. **[owner to confirm]** | Değerlendirildi, siparişe onaylı. |
| supplier_status.suspended | No new orders until the issue is resolved. **[owner to confirm]** | Sorun çözülene kadar yeni sipariş verilmez. |
| customer_status.lead | Potential customer, no contract yet (C1–C2). **[owner to confirm]** | Potansiyel müşteri, henüz sözleşme yok (C1–C2). |
| customer_status.onboarding | Contract signed, being onboarded (C3). **[owner to confirm]** | Sözleşme imzalandı, onboarding sürüyor (C3). |
| customer_status.active | Projects are running. | Projeleri yürüyor. |
| customer_status.paused | Work is on hold for now. **[owner to confirm]** | İş şimdilik beklemede. |
| customer_status.closed | Relationship ended; no new project can be opened. | İlişki sona erdi; yeni proje açılamaz. |
| product_status.concept | An idea or concept; not developed yet. | Fikir ya da konsept; henüz geliştirilmedi. |
| product_status.development | Being developed or sampled with the supplier. | Tedarikçiyle geliştiriliyor ya da numunede. |
| product_status.approved | Sample and spec approved; ready to order. **[owner to confirm]** | Numune ve spec onaylı; siparişe hazır. |
| product_status.ordering | Ordered; in production or on the way. **[owner to confirm]** | Sipariş verildi; üretimde ya da yolda. |
| product_status.on_sale | Live and selling. | Yayında, satışta. |
| product_status.paused | Sales stopped for now. **[owner to confirm]** | Satış şimdilik durduruldu. |
| product_status.archived | No longer used; its GTIN can be given again. | Artık kullanılmıyor; GTIN'i yeniden verilebilir. |
| task_status.todo | Not started. | Başlanmadı. |
| task_status.doing | In progress. | Sürüyor. |
| task_status.done | Finished. | Bitti. |
| task_status.blocked | Cannot go on until something else is resolved. | Başka bir şey çözülmeden ilerleyemiyor. |

The **[owner to confirm]** marker is not copied into the JSON.

- [ ] **Step 1: Write `glossary.test.ts`**

```ts
it.each(['en', 'tr'])('%s describes every value of every glossary enum', (locale) => {
   const glossary = messages(locale).glossary ?? {};
   const missing = Object.entries(GLOSSARY_ENUMS).flatMap(([e, values]) =>
      values.filter((v) => typeof glossary[e]?.[v] !== 'string').map((v) => `${e}.${v}`));
   expect(missing).toEqual([]);
});
it('has no entry for a value that is gone', () => {
   const extra = Object.entries(messages('en').glossary).flatMap(([e, entries]) =>
      Object.keys(entries).filter((v) => !(GLOSSARY_ENUMS as Record<string, readonly string[]>)[e]?.includes(v)).map((v) => `${e}.${v}`));
   expect(extra).toEqual([]);
});
it('covers the enums the spec names', () => {
   expect(Object.keys(GLOSSARY_ENUMS).sort()).toEqual(['customer_status', 'document_status', 'document_type', 'gate_code',
      'package', 'product_status', 'project_path', 'project_type', 'supplier_status', 'task_status']);
});
```

- [ ] **Step 2: Run and see the tests fail** — Run: `pnpm test tests/plugins/i18n/glossary.test.ts`. Expected: FAIL (`@/api/glossary` missing).
- [ ] **Step 3: Implement** `allValues`, `GATE_CODES` and the registry; write the JSON from the table; run `pnpm i18n-sync`.
- [ ] **Step 4: Run** — Run: `pnpm test && pnpm typecheck`. Expected: PASS. Then temporarily delete `glossary.task_status.blocked` from `en` and re-run. Expected: FAIL listing `task_status.blocked`. Restore it.
- [ ] **Step 5: Commit**

```bash
git add app/src/lib/enumValues.ts app/src/api/glossary.ts app/src/api app/src/plugins/i18n/locales app/tests/plugins/i18n/glossary.test.ts
git commit -m "feat(i18n): glossary of packages, gates, document types and statuses"
```

---

### Task 10: SelectEnum shows the glossary

**Files:**
- Modify:
  - `app/src/components/service-components/select-enum/SelectEnum.vue`
  - Every `SelectEnum` use over a glossary enum:
    - `customer/tabs/General.vue`: status, and packages, whose `MultiSelect` is replaced by `SelectEnum multiple glossary="package"`.
    - `supplier/tabs/General.vue`, `product/tabs/General.vue`, `product/Index.vue`, `document/{Index,Upsert}.vue`.
    - `project/{Index,Upsert}.vue`: type and path; packages as above.
    - `project/tabs/Tasks.vue`, `project/TaskUpsert.vue`: task status.
  - `GatePanel.vue`: an info icon beside the gate label, tooltip `glossary.gate_code.<code>`.
  - `PhaseStrip.vue`: the gate tag's `title` becomes `<gate_status> — <glossary>`.
  - `app/tests/components/SelectEnum.test.ts`
- Test: `app/tests/components/SelectEnum.test.ts`

**Interfaces:**
- Consumes: `GlossaryEnum`, `glossaryKey` (Task 9).
- Produces: `SelectEnum` props `{ values: readonly string[]; i18nPrefix?: string; glossary?: GlossaryEnum; multiple?: boolean }`, model `string | string[] | null`.
  - Each option is `{ value, label, description? }`. The label is `t(`${i18nPrefix}.${value}`)`, or the value itself without a prefix (process codes, K7). `description` is present only when `glossary` is set and `te(glossaryKey(...))`.
  - Rendering is `Select` (single) or `MultiSelect` (`multiple`, `display="chip"`).
  - The `#option` slot renders the label and, under it, `<small class="block text-muted-color">{{ description }}</small>`.
  - Single mode's `#value` slot renders the label plus `<i data-test="glossary-info" class="pi pi-info-circle ms-2" v-tooltip.top="description" :aria-label="description" />` when a value with a description is selected.
  - The existing test stays green unchanged (no `glossary` means no `description` key).
- [ ] **Step 1: Extend `SelectEnum.test.ts`**
  - `glossary: 'document_status'` gives `options[0]` equal to `{ value: 'draft', label: i18n.t('ops.document.status.draft'), description: i18n.t('glossary.document_status.draft') }`.
  - With `modelValue: 'signed'`, `wrapper.find('[data-test="glossary-info"]').attributes('aria-label')` equals `i18n.t('glossary.document_status.signed')`.
  - With no `modelValue`, there is no info icon.
  - With `multiple: true, values: PACKAGES, glossary: 'package'`, the component renders a `MultiSelect` whose `options[1]` is `{ value: 'A1', label: 'A1', description: i18n.t('glossary.package.A1') }`.
- [ ] **Step 2: Run and see the tests fail** — Run: `pnpm test tests/components/SelectEnum.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the component and wire the call sites.
- [ ] **Step 4: Run** — Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: PASS. In the browser:
  - The customer card's packages list shows the A0…E descriptions.
  - The document form's status shows the info icon with the "signed" description.
- [ ] **Step 5: Commit**

```bash
git add app/src/components/service-components app/src/views/pages/ops app/tests/components/SelectEnum.test.ts
git commit -m "feat(ui): enum selects explain each option from the glossary"
```

---

### Task 11: Full verification

**Files:**
- None, unless a defect is found. In that case, fix it in the owning task's files.

- [ ] **Step 1: Run the whole suite** — Run (`app/`): `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: every step PASS, and `git status` shows no regenerated-type drift.
- [ ] **Step 2: Walk the Review Focus in the browser** (`pnpm dev:vue`):
  - Upload `Ürün Fotoğrafı.jpg` twice to THO-MOP40-2P. Expected: two cards and two Storage keys `…/urun-fotografi.jpg` in different folders.
  - Link THO's photo from the library to a supplier's document file. Expected: toast `media_customer_mismatch`.
  - As `akif@`, deleting a linked file is disabled, and unlinking then deleting it works.
  - Star the second image. Expected: the first becomes Gallery.
  - Set `media_max_mb` to 1 in the settings. Expected: a 2 MB PNG is refused before upload with "up to 1 MB". Reset it to 25.
- [ ] **Step 3: Push and check CI** — Expected: `app`, `functions` and `database` are green. Commit only if Step 2 required fixes:

```bash
git commit -m "fix(media): <what the acceptance walk found>"
```

---

## Self-review notes

- **Spec coverage:**
  - M19 record fields are in T2. The `media_link` roles and position, the same polymorphic pattern and tenant check, and the one primary image are in T3.
  - The type, SVG and size rules with `media_max_mb` default 25 are in T2. The write right tied to the record's update right is in T3 (links); the file write is tied to `media` insert (T2), because a library file may not belong to any record yet.
  - Unlinked-only delete restricted to management is in T2 (seed), T3 and T4. Every document type can upload or pick a file (T8).
  - Screens: library (T7), Media tab on product and customer (T6), product-list thumbnail (T8). M21 readiness is a note in T2.
  - M20 layer 1: keys (T9) and SelectEnum (T10). CI is T1.
- **Rulings I made:**
  - `document.media_id` composite FK replaces `storage_path` (T4).
  - The primary image is unique per record, not only per product (T3), since every card has a primary mark.
  - A media link to a not-yet-existing table is refused (T3). This differs from `document`, which lets it through.
  - `media.customer_id` must match the linked record's customer or document (T3, T4).
  - The Storage file is immutable (no update policy) and is deleted only after its row (T2).
  - The bucket ceiling is 50 MiB, so the setting is clamped to [1, 50].
  - Only the product auto-marks the first uploaded image as primary (T5 `defaultLinkRole`).
- **Not in this plan:**
  - The M20 layer 2 page guide.
  - Media tabs on supplier, project and gate cards. The component is entity-agnostic, so each is one tab and one route later.
  - Reordering links by drag.
  - Public product-image URLs.
  - `private.copy_media` (M21).
  - Production MOESA roles get the `media` permissions through the role screen, since migrations grant only the built-in owner (as in Phase 1).
- **Type consistency:**
  - `DocumentEntity` is the type of `media_link.entity_type`, `EntityMedia.entityType` and `MediaLibraryFilters.linkedType`.
  - `media_library` columns `kind`, `link_count`, `linked_types`, `linked_entities` (T3) and `document_count` (T4) are used by T5's `applyMediaLibraryFilters` and T7's delete rule.
  - `primary_image_path` (T3) is read in T8.
  - `glossaryKey` and `GlossaryEnum` (T9) are used in T10.
