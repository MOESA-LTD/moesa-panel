# Faz 1 — Tek Doğru Kaynak: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moesa Panel'e müşteri, tedarikçi, ürün ana tablosu, belge/kanıt, proje/kapı modüllerini ve haftalık ritmi besleyen dashboard'u eklemek; THOMETZKI verisinin CSV ile taşınabilmesi.

**Architecture:** Tek kiracı (MOESA) içinde düz iş tabloları; müşteriye ait tablolar `customer_id` taşır. Her modül mevcut reçeteyi izler: migrasyon (tablo + RLS + audit + modül + izinler) → üretilen tipler → `api/<entity>` (zod şema + repo + composable) → `views/pages/ops/<entity>` (ResourceTable listesi, FormBox formu, route-dialog) → `router/routes/ops.ts` → i18n. Kapılar ve kod sayaçları veritabanı fonksiyonlarında; dashboard SQL görünümlerinden okur.

**Tech Stack:** Vue 3.5 + Vite 5 + PrimeVue 4 + Tailwind, TanStack Query 5, zod 4, CASL; Supabase (Postgres 15, PostgREST, generated RLS), pgTAP (`supabase test db`), vitest 3.

**Spec:** `docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md` (bölümler §4 K1–K9, §6 M1–M6, §7, §8, §9)

## Global Constraints

- Mevcut kalıp değiştirilmez: `defineResource` / `useUpsertForm` / `ResourceTable` / route-dialog / `queryKeys` (spec §3, §8).
- Her iş tablosu `tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE` taşır; migrasyon sonunda `PERFORM private.enable_tenant_level_security('<table>')` ve `PERFORM private.audit_enable('public.<table>')` çağrılır (006 döngüsü yalnızca o anda var olan tabloları kapsar).
- Her modül `public.module` satırı `is_core = TRUE` ile kaydedilir; `permission` satırları `group_name` = modül id (spec K1 sonrası §8 "Abonelik katmanı").
- İzin kuralı: her tabloda `select` (`kind='read'`, `throws_error=FALSE`), `insert` (`create`), `update`, `delete` (`modify`, `throws_error=TRUE`) satırları; `bypass=FALSE`.
- Kodlar otomatik ve değişmez: müşteri 3 harf; proje `<KOD>-<YIL>-<NNN>`; ileride PO/SHP/CR aynı sayaçtan (spec K5).
- Silme yok: `archived` / `closed` durumları; yalnızca `document` için de silme yok, `superseded` (spec §3, K2).
- Alan adları İngilizce snake_case; enum'lar Postgres enum tipi; arayüzde i18n (spec K7). Arayüz dili TR ve EN elle yazılır; diğer 11 locale `en` değerleriyle doldurulur (locale testi tüm dillerde aynı anahtar setini ister).
- Hassas alan yok: banka, vergi/EORI, şifre, platform vaka no (spec K8).
- Commit mesajları conventional commits; her commit sonunda `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Zod şema yardımcıları `lib/form/fields.ts`'ten (`requiredText`, `optional`, `required`, `dateOnly`, `website`, `email`, `phone`).
- Rota adları `ops-<entity>-<action>`, etiketler `route.label.ops_<entity>_<action>`; sayfalar `app/src/views/pages/ops/<entity>/`.
- Migrasyon numaraları 015'ten başlar; her migrasyonun başında tasarım açıklaması yorum olarak (010–014 kalıbı).

## Review Focus

1. **Aynı GTIN iki aktif üründe:** ikinci kayıt reddedilmeli ve formda `gtin` alanında hata görünmeli; arşivlenmiş ürünün GTIN'i yeniden kullanılabilmeli. (Task 7 pgTAP + Task 8 `postgrestErrors` eşlemesi.)
2. **Kapı atlama:** G2 geçmemişken G3 "geçti" yapılamaz; (M) kapı müşteri onay tarihi olmadan geçemez; aynı kapı iki kez geçilemez. (Task 10 `pass_gate` pgTAP.)
3. **Belge sürümü:** aynı ürün için ikinci `spec_sheet` eklenince ilki `superseded` olur ama silinmez; `signed` durumuna geçiş imza/kaşe/resmî e-posta/sürüm/tarih olmadan reddedilir. (Task 4 pgTAP.)
4. **CSV ithalatında bozuk satır:** bir satır hatalıysa dosyanın tamamı yazılmaz; rapor satır numarası ve alan adıyla hatayı gösterir; başlık sırası farklı CSV kabul edilir, bilinmeyen sütun uyarıyla atlanır. (Task 9 vitest + pgTAP.)
5. **Müşteri filtresi sızıntısı:** müşteri filtresi seçiliyken belge/ürün/proje listeleri yalnızca o müşterinin kayıtlarını gösterir; filtre temizlenince hepsi; tedarikçi listesi filtreden etkilenmez. (Task 11 vitest `useCustomerFilter`.)

---

## Dosya haritası

```
supabase/migrations/
  015_ops_core.sql          modüller, setting, code_sequence/next_code, platform, test yardımcıları
  016_documents.sql         document + supersede/signed tetikleyicileri
  017_suppliers.sql         supplier, supplier_contact
  018_customers.sql         customer, customer_contact, customer_warehouse, customer_platform_account, customer_brand
  019_products.sql          product, gtin_valid, product_evidence görünümü
  020_products_import.sql   import_products RPC
  021_projects.sql          project, project_product, project_gate, project_task, task_template, gates_for, pass_gate
  022_dashboard.sql         dashboard görünümleri
supabase/tests/database/    pgTAP: 015_core.test.sql … 022_dashboard.test.sql
app/src/api/
  setting/, document/, supplier/, customer/, product/ (index.ts, import.ts, csv.ts), project/, dashboard/
  customerFilter.ts         müşteri filtresi (pinia state + helper)
app/src/components/service-components/
  select-customer/SelectCustomer.vue, select-supplier/SelectSupplier.vue, select-enum/SelectEnum.vue
  entity-documents/EntityDocuments.vue
  customer-filter/CustomerFilter.vue
  phase-strip/PhaseStrip.vue, gate-panel/GatePanel.vue
app/src/views/pages/ops/
  Index.vue (bölüm), setting/Index.vue, document/Upsert.vue,
  supplier/{Index,Manage}.vue + tabs/{General,Contacts,Documents}.vue, supplier/ContactUpsert.vue
  customer/{Index,Manage}.vue + tabs/{General,Contacts,Warehouses,Platforms,Brands,Documents}.vue + {Contact,Warehouse,Platform,Brand}Upsert.vue
  product/{Index,Manage,Import}.vue + tabs/{General,Dimensions,Cost,Documents}.vue
  project/{Index,Manage,Upsert}.vue + tabs/{Overview,Tasks,Products,Documents}.vue, project/TaskUpsert.vue
app/src/router/routes/ops.ts
app/src/lib/csv/{parse,serialize}.ts
app/src/script/sync-locales.mjs
app/tests/ (api/*.test.ts, lib/csv/*.test.ts, components/*.test.ts)
```

---

### Task 1: Geliştirme ortamı, çekirdek migrasyon ve test altyapısı

**Files:**
- Create: `supabase/migrations/015_ops_core.sql`
- Create: `supabase/tests/database/015_core.test.sql`
- Create: `app/src/script/sync-locales.mjs`
- Modify: `app/package.json` (scripts: `"test:db": "cd ../supabase && supabase test db"`, `"i18n-sync": "node src/script/sync-locales.mjs"`)
- Test: `supabase/tests/database/015_core.test.sql`, `app/tests/script/syncLocales.test.ts`

**Interfaces:**
- Produces (SQL):
  - `public.setting(key TEXT PK, value JSONB NOT NULL, description TEXT, source_question TEXT, tenant_id)`; satırlar: `deposit_rate_default` 30, `safety_stock_days` 30, `document_request_days` 5, `s1_customer_notify_hours` 4, `spec_sheet_required_from` "2026-12-31", `wip_limit_per_role` 5, `gate_evidence_blocking` true.
  - `public.platform(id TEXT PK, display_name TEXT, countries TEXT[], product_id_label TEXT, position INT, tenant_id NULL)`; satırlar amazon ("ASIN"), ebay, kaufland, allegro, bol, cdiscount, otto, emag, temu, walmart.
  - `public.code_sequence(tenant_id, kind TEXT, scope TEXT, year INT, last_no INT, PRIMARY KEY (tenant_id, kind, scope, year))`.
  - `public.next_code(kind TEXT, scope TEXT) RETURNS TEXT` SECURITY INVOKER: `scope` müşteri kodu; döndürür `kind='project'` → `<SCOPE>-<YYYY>-<NNN>`, `kind IN ('po','shp','cr')` → `<KIND_UPPER>-<SCOPE>-<YYYY>-<NNN>`; satır kilidi (`INSERT … ON CONFLICT DO UPDATE … RETURNING`).
  - `private.impersonate(user_id UUID, tenant_id UUID) RETURNS VOID`: `SET LOCAL ROLE authenticated`, `request.jwt.claims` = `{"sub": user_id, "role": "authenticated"}`, `request.headers` = `{"x-tenant-id": tenant_id, "x-tenant-ids": tenant_id}` (testler için; `private.tenant_id()` ve `private.tenant_scope()` bu ayarları okur).
  - `public.module` satırları: `ops_setting` (pos 100), `document` (110), `supplier` (120), `customer` (130), `product` (140), `project` (150), hepsi `is_core = TRUE`. Bu görevde yalnızca `ops_setting` ve `platform` izinleri: `setting` select/update, `platform` select/insert/update.
- Produces (app): `pnpm test:db`, `pnpm i18n-sync` (en'de olup diğer locale'lerde olmayan anahtarları en değeriyle kopyalar, fazla anahtarı siler; `tr` hariç hiçbir dosyada elle çeviri beklenmez).

- [ ] **Step 1: Yerel Supabase'i yeni adla başlat**

Run (repo kökünde, `supabase/` içinde):
```bash
supabase stop --project-id echochart
supabase start
cd ../app && pnpm dev:supabase-reset && pnpm test
```
Expected: `supabase_db_moesa-panel` konteyneri; `pnpm test` mevcut testler PASS.

- [ ] **Step 2: pgTAP çalıştığını kanıtlayan test**

`supabase/tests/database/015_core.test.sql`:
```sql
BEGIN;
SELECT plan(6);
SELECT has_table('public', 'setting', 'setting table');
SELECT has_table('public', 'code_sequence', 'code_sequence table');
SELECT has_function('public', 'next_code', ARRAY['text', 'text'], 'next_code');
-- sayaç: aynı müşteri ve yıl içinde ardışık, müşteriler bağımsız
SELECT is(public.next_code('project', 'THO'), 'THO-' || extract(year FROM now())::INT || '-001');
SELECT is(public.next_code('project', 'THO'), 'THO-' || extract(year FROM now())::INT || '-002');
SELECT is(public.next_code('po', 'ABC'), 'PO-ABC-' || extract(year FROM now())::INT || '-001');
SELECT * FROM finish();
ROLLBACK;
```
Test, bir demo kiracı sahibi olarak `private.impersonate` ile çalışır (seed'deki `ayse@moesa-panel.test` kullanıcı ve Atlas kiracısı id'leri `SELECT … FROM public.user WHERE email = …` ile alınır).

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

Run: `cd app && pnpm test:db`
Expected: FAIL ("setting table" not found). pgTAP yoksa test dosyasının başına `CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;` ekle ve tekrar çalıştır.

- [ ] **Step 4: `015_ops_core.sql` migrasyonunu yaz** (Interfaces'teki nesneler, `enable_tenant_level_security`, `audit_enable` yalnızca `setting` ve `platform` için; `code_sequence` yalnızca `next_code` üzerinden yazılır: izin satırı yok, RLS açık, `GRANT EXECUTE ON FUNCTION public.next_code TO authenticated`)

- [ ] **Step 5: Reset + test**

Run: `pnpm dev:supabase-reset && pnpm test:db`
Expected: 6/6 PASS.

- [ ] **Step 6: `sync-locales.mjs` ve testi**

`app/tests/script/syncLocales.test.ts`: `syncLocales(source, target)` saf fonksiyonunu dışa aktar (script `import.meta.main` benzeri koşulla CLI olarak çalışır); test: eksik anahtar en değeriyle eklenir, fazla anahtar silinir, mevcut çeviri korunur.

- [ ] **Step 7: vitest çalıştır, PASS; commit**

```bash
git add supabase/migrations/015_ops_core.sql supabase/tests/database/015_core.test.sql app/src/script/sync-locales.mjs app/tests/script/syncLocales.test.ts app/package.json supabase/functions/_shared/database.types.ts
git commit -m "feat(ops): core settings, code sequences, platforms and pgTAP test setup"
```

---

### Task 2: Operasyon bölümü, ayarlar sayfası ve müşteri filtresi iskeleti

**Files:**
- Create: `app/src/router/routes/ops.ts`, `app/src/views/pages/ops/Index.vue`, `app/src/views/pages/ops/setting/Index.vue`
- Create: `app/src/api/setting/index.ts`, `app/src/api/customerFilter.ts`, `app/src/components/service-components/customer-filter/CustomerFilter.vue`
- Modify: `app/src/router/index.ts` (`...opsRoutes` branch'ten sonra), `app/src/plugins/i18n/locales/{en,tr}/index.json`, diğer locale'ler `pnpm i18n-sync` ile
- Test: `app/tests/api/setting.test.ts`, `app/tests/api/customerFilter.test.ts`

**Interfaces:**
- Produces: route `ops` (path `ops`, label `route.label.ops`, icon `PrimeIcons.BRIEFCASE`, `anyPermission` `[{action:'read', subject:'customer'}, {action:'read', subject:'product'}]`), child `ops-setting` (`requiredPermissions` select `setting`).
- `useSettings()` → `UseQueryReturnType<Record<string, Json>>`; `useSetting<T>(key, fallback: T)` → `ComputedRef<T>`; `useSaveSetting()` mutation `{key, value}`.
- `useCustomerFilter()` (pinia store `customerFilter`): `customerId: Ref<string | null>`, `set(id)`, `clear()`; localStorage'da kalıcı (`customer-filter`). `withCustomerFilter(filters, customerId)`: PrimeVue filter nesnesine `customer_id` eşitlik koşulu ekler/kaldırır (saf fonksiyon, test edilir).
- `CustomerFilter.vue`: Select (seçenekler Task 5'teki `useLookup('customer', {select:'id, code, display_name', order:'code'})`; bu görevde boş liste ile çalışır) — Topbar'a Task 5'te eklenir.

- [ ] **Step 1: Testler** — `setting.test.ts`: `useSetting('deposit_rate_default', 0)` ayar yüklenmeden fallback, yüklenince değer; `customerFilter.test.ts`: `withCustomerFilter({}, 'c1').customer_id` eşitlik koşulu, `withCustomerFilter(f, null)` koşulu kaldırır.
- [ ] **Step 2: Çalıştır, FAIL** — `pnpm test tests/api/setting.test.ts tests/api/customerFilter.test.ts`
- [ ] **Step 3: Uygula** — ayar sayfası: `setting` satırları tablo halinde, değer `InputNumber`/`InputText`/`DatePicker`/`ToggleSwitch` (JSON tipine göre), yalnız `$can('modify','setting')` yazabilir.
- [ ] **Step 4: PASS; `pnpm typecheck && pnpm lint`; i18n-sync; locale testi PASS**
- [ ] **Step 5: Commit** — `feat(ops): operations section, settings page and customer filter store`

---

### Task 3: Belge modülü — veritabanı

**Files:**
- Create: `supabase/migrations/016_documents.sql`, `supabase/tests/database/016_documents.test.sql`

**Interfaces:**
- Enums: `document_type` (spec §6 M4 listesi: spec_sheet, tech_pack, sample_report, pi, po, psi_report, test_report, sds, doc_of_conformity, technical_file, label_artwork, packing_list, commercial_invoice, bill_of_lading, customs, delivery_receipt, gate_approval, change_request, contract, certificate, other), `document_status` (draft, signed, approved, superseded), `document_entity` (customer, supplier, product, project, project_gate, purchase_order, shipment, incident).
- Table `public.document(id, tenant_id, customer_id UUID NULL, entity_type document_entity, entity_id UUID, type, version INT CHECK (version >= 1), issued_on DATE, status document_status DEFAULT 'draft', url TEXT, storage_path TEXT NULL, file_name TEXT, sent_from_official_email BOOL DEFAULT FALSE, is_signed BOOL DEFAULT FALSE, is_stamped BOOL DEFAULT FALSE, notes TEXT, created_by UUID DEFAULT auth.uid(), created_at, updated_at)`; `UNIQUE (entity_type, entity_id, type, version)`; `CHECK (url IS NOT NULL OR storage_path IS NOT NULL)`.
- Trigger `document_check_entity` (BEFORE INSERT/UPDATE): `entity_id`, `entity_type`'ın işaret ettiği tabloda (`to_regclass('public.' || entity_type)`) varsa geçer; tablo henüz yoksa geçer (Faz 2 tabloları), satır yoksa `RAISE EXCEPTION 'document_entity_missing'`.
- Trigger `document_supersede` (AFTER INSERT): aynı `(entity_type, entity_id, type)` içinde daha düşük `version`lu ve durumu `signed`/`approved`/`draft` olan satırları `superseded` yapar.
- Trigger `document_signed_requires` (BEFORE INSERT/UPDATE): `status = 'signed'` iken `is_signed AND is_stamped AND sent_from_official_email AND issued_on IS NOT NULL` değilse `RAISE EXCEPTION 'document_signed_incomplete'`.
- `updated_at` tetikleyicisi: `private.set_updated_at()` (bu migrasyonda tanımlanır, sonraki tablolar da kullanır).
- Module `document`, izinler select/insert/update (delete yok). `enable_tenant_level_security('document')`, `audit_enable('public.document')`.

- [ ] **Step 1: pgTAP** — `plan(7)`: tablo var; supplier satırı (Task 4 öncesi: `entity_type='customer'` için to_regclass NULL → geçer) ile v1 insert; v2 insert → v1 `superseded`; `signed` eksik alanla `throws_ok(…, 'document_signed_incomplete')`; tam alanla `lives_ok`; delete izni yok → `throws_ok` (delete policy); başka kiracıdan select boş.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Migrasyon**
- [ ] **Step 4: `pnpm dev:supabase-reset && pnpm test:db` PASS**
- [ ] **Step 5: Commit** — `feat(document): evidence records with versions and signing rules`

---

### Task 4: Belge modülü — uygulama

**Files:**
- Create: `app/src/api/document/index.ts`, `app/src/components/service-components/entity-documents/EntityDocuments.vue`, `app/src/views/pages/ops/document/Upsert.vue`, `app/src/components/service-components/select-enum/SelectEnum.vue`
- Modify: `app/src/router/routes/ops.ts` (`ops-document-add` path `document/add`, `ops-document-edit` path `document/:id/edit`, ikisi de `visible:false`, props: route.params + query `entity_type`, `entity_id`, `customer_id`, `code`), `app/src/api/queryKeys.ts` (DERIVED: `document → ['product_evidence']` — görünüm Task 7'de), `app/src/constants/form/field.ts` (`document: { name: 'ops-document-edit' }`), i18n
- Test: `app/tests/api/document.test.ts`, `app/tests/components/SelectEnum.test.ts`

**Interfaces:**
- `documentResource = defineResource('document')`; `documentSchema` (zod): `type` `required(z.enum(DOCUMENT_TYPES))`, `version` `z.number().int().min(1)`, `issued_on` `optional(dateOnly())`, `status` enum default `draft`, `url` `optional(website())`, `is_signed/is_stamped/sent_from_official_email` boolean, `notes` `optional(z.string())`; `toDocumentFormValues`, `toDocumentPayload`.
- `DOCUMENT_TYPES: readonly DocumentType[]`, `DOCUMENT_TYPE_CODES: Record<DocumentType, string>` (spec_sheet→SPEC, tech_pack→TECHPACK, sample_report→SAMPLE, pi→PI, po→PO, psi_report→PSI, test_report→TEST, sds→SDS, doc_of_conformity→DOC, technical_file→TECHFILE, label_artwork→LABEL, packing_list→PL, commercial_invoice→CI, bill_of_lading→BL, customs→CUSTOMS, delivery_receipt→DELIVERY, gate_approval→GATE, change_request→CR, contract→CONTRACT, certificate→CERT, other→OTHER); `DOCUMENT_STATUS_SUFFIX` (draft→taslak, signed→imzali, approved→onayli, superseded→eski).
- `documentFileName({ code, type, version, issuedOn, status }): string` → `<code>_<TYPECODE>_v<NN>_<YYYYMMDD>_<suffix>` (spec §7.6 örneği: `THO-MOP40-2P_SPEC_v03_20261102_imzali`).
- `useEntityDocuments(entityType, entityId)` → ResourceTable props (from `document`, filters `entity_type`, `entity_id` eşitlik, `useMeta:false`).
- `EntityDocuments.vue` props `{ entityType: DocumentEntity; entityId: string; code: string; customerId?: string | null }`: liste (tür, sürüm, tarih, durum, dosya adı, bağlantı) + "Ekle" butonu → `ops-document-add` route-dialog (query ile bağlam).
- `SelectEnum.vue` props `{ values: readonly string[]; i18nPrefix: string }` → PrimeVue Select, etiket `$t(`${i18nPrefix}.${value}`)`.

- [ ] **Step 1: Testler** — `documentFileName` iki örnek (spec örneği ve `status: 'draft'`, version 12 → `v12`); şema: `status:'signed'` ama `is_signed:false` → formda hata `status` (zod `superRefine`, mesaj `errors.document_signed_incomplete`); `SelectEnum` seçenek etiketlerini çevirir.
- [ ] **Step 2: FAIL**  - [ ] **Step 3: Uygula**  - [ ] **Step 4: PASS + typecheck + lint + i18n-sync**
- [ ] **Step 5: Commit** — `feat(document): document list per record and upsert dialog`

---

### Task 5: Tedarikçiler (M2) — veritabanı ve uygulama

**Files:**
- Create: `supabase/migrations/017_suppliers.sql`, `supabase/tests/database/017_suppliers.test.sql`
- Create: `app/src/api/supplier/index.ts`, `app/src/components/service-components/select-supplier/SelectSupplier.vue`, `app/src/views/pages/ops/supplier/{Index,Manage,ContactUpsert}.vue`, `app/src/views/pages/ops/supplier/tabs/{General,Contacts,Documents}.vue`
- Modify: `ops.ts` (`ops-supplier` → `ops-supplier-list`, `ops-supplier-manage` `:id?/manage/:tab?` children `general|contacts|documents`, `ops-supplier-contact-add/edit`), `field.ts`, i18n
- Test: `app/tests/api/supplier.test.ts`

**Interfaces:**
- Enum `supplier_status` (candidate, approved, suspended). Table `supplier(id, tenant_id, code TEXT CHECK (code ~ '^[A-Z]{2}[0-9]{1,3}$'), display_name, country TEXT, city, website, product_groups TEXT[], capacity_note, default_incoterm TEXT, deposit_rate NUMERIC(5,2), payment_terms TEXT, damage_notice_hours INT, storage_fee_rule TEXT, late_payment_penalty TEXT, cancellation_rule TEXT, rating SMALLINT CHECK (1..5), last_audit_on DATE, status DEFAULT 'candidate', notes, created_at, updated_at)`; `UNIQUE (tenant_id, code)`. `supplier_contact(id, tenant_id, supplier_id FK CASCADE, name, role TEXT, email, phone, is_primary BOOL)`. Modül `supplier`; izinler iki tabloda select/insert/update/delete. `enable_tenant_level_security`, `audit_enable` ikisine.
- App: `supplierResource = defineResource('supplier')`, `supplierSchema` (`code` regex, `display_name` requiredText, `country` required, `deposit_rate` optional 0–100, `rating` optional 1–5, `website` optional(website()), geri kalanı optional text), `supplierContactResource = defineResource('supplier_contact')`, `supplierContactSchema` (`name` requiredText, `email` optional(email()), `phone` optional(phone())).
- `SelectSupplier.vue` (`useLookup('supplier', {select:'id, code, display_name', order:'code'})`, optionLabel `code — display_name`).
- `Manage.vue` user-upsert tab kalıbı; `Documents` sekmesi `EntityDocuments entityType="supplier" :code="supplier.code"`.

- [ ] **Step 1: pgTAP** `plan(5)`: tablolar; kod regex `throws_ok` (`'cn1'`), aynı kodu ikinci kez `throws_ok` (unique); contact FK cascade; başka kiracı okuyamaz.
- [ ] **Step 2: FAIL → migrasyon → reset → PASS**
- [ ] **Step 3: vitest** — şema: `deposit_rate: 150` hata; `code: 'TR1'` geçer; `toSupplierPayload` boş metinleri null yapar.
- [ ] **Step 4: FAIL → uygula → PASS + typecheck + lint + i18n-sync**
- [ ] **Step 5: Commit** — `feat(supplier): supplier register with terms, contacts and documents`

---

### Task 6: Müşteriler (M1) — veritabanı ve uygulama

**Files:**
- Create: `supabase/migrations/018_customers.sql`, `supabase/tests/database/018_customers.test.sql`
- Create: `app/src/api/customer/index.ts`, `app/src/components/service-components/select-customer/SelectCustomer.vue`, `app/src/views/pages/ops/customer/{Index,Manage,ContactUpsert,WarehouseUpsert,PlatformUpsert,BrandUpsert}.vue`, `tabs/{General,Contacts,Warehouses,Platforms,Brands,Documents}.vue`
- Modify: `ops.ts`, `field.ts`, `layouts/dashboard/Topbar.vue` (CustomerFilter, `v-if="$can('read','customer')"`), `api/customerFilter.ts` (lookup bağlanır), i18n
- Test: `app/tests/api/customer.test.ts`

**Interfaces:**
- Enums `commercial_model` (trading_partner, commercial_representative, operations_partner), `customer_status` (lead, onboarding, active, paused, closed), `warehouse_type` (own, third_party, fba), `platform_access` (authorized_user, none).
- `customer(id, tenant_id, code CHAR(3) CHECK (code ~ '^[A-Z]{3}$'), display_name, country, website, commercial_model, packages TEXT[] CHECK (packages <@ ARRAY['A0','A1','A2','B','C','D','E']), status DEFAULT 'lead', contract_accepted_on DATE, contract_document_id UUID REFERENCES document, start_on DATE, deposit_rate NUMERIC(5,2), extra_cost_rule TEXT, eu_responsible_person TEXT, restricted_drive_url TEXT, notes, created_at, updated_at)`; `UNIQUE (tenant_id, code)`; trigger `customer_code_immutable` (UPDATE'te `code` değişirse `RAISE EXCEPTION 'customer_code_immutable'`).
- `customer_contact(…, customer_id, name, role TEXT, email, phone, can_approve BOOL)`, `customer_warehouse(…, customer_id, display_name, type warehouse_type, country, city, address, postal_code, dock_hours, appointment_rule, pallet_standard, receiving_person, is_default BOOL)`, `customer_platform_account(…, customer_id, platform_id TEXT REFERENCES platform, countries TEXT[], account_holder TEXT, access platform_access DEFAULT 'none', notes)` `UNIQUE (customer_id, platform_id)`, `customer_brand(…, customer_id, name, registration_status TEXT, brand_program_status TEXT, gs1_prefix_owner TEXT)`.
- Modül `customer`; beş tabloda izinler (delete yalnız alt tablolarda). App: `customerResource`, `customerSchema` (`code` regex uppercase transform, `packages` `z.array(z.enum(PACKAGES))`, `commercial_model` required enum), alt kaynaklar `defineResource` ile; `SelectCustomer.vue` (`useLookup('customer', …)`).
- `useCustomerFilter` lookup'ı `customer` tablosundan okur; `Topbar.vue`'ya eklenir.

- [ ] **Step 1: pgTAP** `plan(6)`: kod `'tho'` reddi; `code` güncellemesi `throws_ok('customer_code_immutable')`; `packages` `ARRAY['X']` reddi; platform hesabı FK `platform`; warehouse cascade; başka kiracı okuyamaz.
- [ ] **Step 2–5:** FAIL → migrasyon → PASS; vitest (kod küçük harf → büyük harf; paket dizisi doğrulama; `toCustomerPayload`); uygula; PASS + typecheck + lint + i18n-sync.
- [ ] **Step 6: Commit** — `feat(customer): customer cards with contacts, warehouses, platforms and brands`

---

### Task 7: Ürün ana tablosu (M3) — veritabanı

**Files:**
- Create: `supabase/migrations/019_products.sql`, `supabase/tests/database/019_products.test.sql`

**Interfaces:**
- Enums `product_status` (concept, development, approved, ordering, on_sale, paused, archived), `compliance_status` (none, partial, complete), `currency_code` yerine mevcut domain `valid_currency_code`.
- `private.gtin_valid(gtin TEXT) RETURNS BOOLEAN IMMUTABLE`: 8/12/13/14 hane, GS1 mod-10 kontrol basamağı.
- `product(id, tenant_id, customer_id NOT NULL FK, parent_id UUID NULL FK product, sku TEXT NOT NULL, display_name, variant_label TEXT, category TEXT, brand TEXT, gtin TEXT CHECK (gtin IS NULL OR private.gtin_valid(gtin)), gs1_prefix_owner TEXT, supplier_id FK supplier NULL, supplier_product_code, manufacturer_art_no, status DEFAULT 'concept', golden_sample_on DATE, golden_sample_locations TEXT, is_hazmat BOOL DEFAULT FALSE, compliance_status DEFAULT 'none', eu_responsible_person, hs_code TEXT, origin_country TEXT, unit_dims_mm TEXT, unit_net_g NUMERIC, pack_qty INT, pack_dims_mm TEXT, pack_gross_g NUMERIC, carton_pack_qty INT, carton_dims_mm TEXT, carton_net_kg NUMERIC, carton_gross_kg NUMERIC, pallet_carton_qty INT, pallet_type TEXT, lot_rule TEXT, purchase_price NUMERIC(12,4), purchase_currency valid_currency_code, purchase_incoterm TEXT, landed_cost_eur NUMERIC(12,4), landed_cost_on DATE, target_price_eur NUMERIC(12,2), moesa_price_eur NUMERIC(12,4), price_list_version TEXT, notes, created_at, updated_at)`.
- Indexler: `UNIQUE (customer_id, sku)`; `CREATE UNIQUE INDEX product_gtin_active ON product (gtin) WHERE gtin IS NOT NULL AND status <> 'archived'`.
- View `public.product_evidence` (security_invoker): `product_id, customer_id, tenant_id, sku, status, has_signed_spec BOOL, spec_version INT, spec_document_id, compliance_status, compliance_complete BOOL, last_po_code TEXT (NULL), live_cell_count INT (0)` — spec belgesi: `document` where `entity_type='product' AND type='spec_sheet' AND status IN ('signed','approved')` en yüksek sürüm.
- Modül `product`; izinler product select/insert/update (delete yok; arşiv). `GRANT SELECT ON product_evidence TO authenticated`.

- [ ] **Step 1: pgTAP** `plan(8)`: `gtin_valid('4260696025800')` true, `'4260696025801'` false, `'12345'` false; aynı GTIN ikinci aktif ürün `throws_ok` (unique violation `23505`); ilk ürün `archived` olunca ikinci `lives_ok`; aynı müşteride aynı SKU reddi; `product_evidence.has_signed_spec` spec belgesi `signed` eklenince true; delete `throws_ok`.
- [ ] **Step 2: FAIL → migrasyon → reset → PASS**
- [ ] **Step 3: Commit** — `feat(product): product master with GTIN validation and evidence view`

---

### Task 8: Ürün ana tablosu (M3) — uygulama

**Files:**
- Create: `app/src/api/product/index.ts`, `app/src/views/pages/ops/product/{Index,Manage}.vue`, `tabs/{General,Dimensions,Cost,Documents}.vue`
- Modify: `ops.ts` (`ops-product-list`, `ops-product-manage` `:id?/manage/:tab?`), `field.ts`, `queryKeys.ts` (DERIVED `product → ['product_evidence']`), `lib/form/postgrestErrors.ts` (unique index `product_gtin_active` → alan `gtin`, mesaj `errors.gtin_in_use`; `product_customer_id_sku_key` → `sku`), i18n
- Test: `app/tests/api/product.test.ts`, `app/tests/lib/form/postgrestErrors.test.ts` (ek vaka)

**Interfaces:**
- `productResource = defineResource('product', { select: '*, customer(code, display_name), supplier(code, display_name)' })`; `productSchema`: `customer_id` required uuid, `sku` requiredText + regex `^[A-Z0-9-]+$` (uppercase transform), `display_name` requiredText, `gtin` `optional(z.string().regex(/^\d{8}$|^\d{12,14}$/).refine(gtinValid, …))`, sayısal alanlar `optional(z.number().nonnegative())`, `purchase_currency` optional enum `['EUR','USD','CNY','TRY']`, `status` enum.
- `gtinValid(gtin: string): boolean` (`lib/gtin.ts`, SQL ile aynı algoritma); `GTIN` testleri SQL testindeki örneklerle aynı.
- Liste sütunları: müşteri kodu, SKU, ad, varyant, GTIN, durum, tedarikçi, spec (product_evidence `has_signed_spec` rozeti: select'te `product_evidence!inner(has_signed_spec, spec_version)` — view FK'sız ise ayrı `useLookup('product_evidence')` ile eşle), uyum durumu; filtreler: müşteri (CustomerFilter ile), durum, spec var/yok.
- `Manage.vue` sekmeleri: Genel (kimlik, tedarikçi, durum, uyum), Ölçüler, Maliyet, Belgeler (`EntityDocuments entityType="product" :code="product.sku"`).

- [ ] **Step 1: vitest** — `gtinValid` üç vaka; şema `sku: 'tho-mop40-2p'` → `THO-MOP40-2P`; `gtin: '4260696025801'` hata `errors.invalid_gtin`; `mapPostgrestError` `product_gtin_active` → `{ gtin: … }`.
- [ ] **Step 2: FAIL → uygula → PASS + typecheck + lint + i18n-sync**
- [ ] **Step 3: Commit** — `feat(product): product list and card with dimensions, cost and documents`

---

### Task 9: CSV içe/dışa aktarma (S10)

**Files:**
- Create: `supabase/migrations/020_products_import.sql`, `supabase/tests/database/020_products_import.test.sql`
- Create: `app/src/lib/csv/parse.ts`, `app/src/lib/csv/serialize.ts`, `app/src/api/product/csv.ts`, `app/src/api/product/import.ts`, `app/src/views/pages/ops/product/Import.vue`
- Modify: `ops.ts` (`ops-product-import` path `product/import`, dialog), product `Index.vue` (İçe/Dışa aktar butonları), i18n
- Test: `app/tests/lib/csv/parse.test.ts`, `app/tests/lib/csv/serialize.test.ts`, `app/tests/api/productCsv.test.ts`

**Interfaces:**
- SQL `public.import_products(rows JSONB) RETURNS JSONB` SECURITY INVOKER, tek transaction: her satır `{customer_code, sku, …product sütunları…}`; müşteri koduyla `customer_id` bulunur; `(customer_id, sku)` varsa UPDATE, yoksa INSERT; herhangi bir satır hata verirse tamamı geri alınır ve `{ok:false, errors:[{row:n, field, code}]}` döner (GTIN çakışması `code:'gtin_in_use'` ve çakışan `sku`); başarıda `{ok:true, inserted:n, updated:n}`.
- `parseCsv(text: string, { delimiter?: ',' | ';' }): { header: string[]; rows: string[][] }` RFC 4180 (tırnak, çift tırnak kaçışı, CRLF); `serializeCsv(header, rows): string`.
- `S10_COLUMNS: readonly string[]` (spec S10 CSV başlığı; `asin_*`, `*_id`, `listing_dosya` sütunları `DEFERRED_COLUMNS` listesinde: okunur, rapora "Faz 2'de pazar hücresine aktarılacak" uyarısıyla yazılır, veritabanına gitmez); `S10_TO_PRODUCT: Record<string, keyof ProductImportRow>` eşlemesi (`musteri_kodu→customer_code`, `urun_adi→display_name`, `tedarikci_kodu→supplier_code`, `urun_olcu_mm→unit_dims_mm`, `alis_fiyati→purchase_price` …; sayı alanlarında `1,90` → `1.90`).
- `mapS10Rows(header, rows): { rows: ProductImportRow[]; warnings: ImportWarning[]; errors: ImportError[] }` (zod `productImportRowSchema` satır başına; bilinmeyen sütun → warning; eksik zorunlu → error satır+alan).
- `toS10Csv(products: ProductRow[]): string` (başlık sırası `S10_COLUMNS`, ertelenen sütunlar boş).
- `Import.vue`: dosya seç (FileUpload custom), önizleme tablosu (ilk 20 satır), hata/uyarı listesi, "İçe aktar" yalnız `errors.length === 0`; sonuç toast; `invalidateTables(['product'])`.

- [ ] **Step 1: vitest** — parse: tırnaklı virgül, `""` kaçışı, CRLF, `;` ayırıcı; serialize round-trip; `mapS10Rows`: başlık sırası farklı CSV kabul, bilinmeyen sütun warning, `gtin_kontrol` boş olabilir, `alis_fiyati '1,90'` → 1.9, eksik `sku` → error `{row:2, field:'sku'}`.
- [ ] **Step 2: pgTAP** `plan(4)`: iki satır insert → `ok:true, inserted:2`; aynı dosya tekrar → `updated:2`; GTIN çakışan satır → `ok:false` ve hiçbir satır yazılmamış (`is(count, 2)`); bilinmeyen müşteri kodu → `errors[0].field = 'customer_code'`.
- [ ] **Step 3: FAIL → migrasyon + kod → PASS + typecheck + lint + i18n-sync**
- [ ] **Step 4: Commit** — `feat(product): S10 CSV import with transactional report and export`

---

### Task 10: Projeler ve kapılar (M5) — veritabanı

**Files:**
- Create: `supabase/migrations/021_projects.sql`, `supabase/tests/database/021_projects.test.sql`

**Interfaces:**
- Enums `project_type` (npi, variant, revision, reorder), `project_path` (a_sourcing, b_private_label), `project_status` (active, on_hold, closed, cancelled), `project_phase` (P1, P2, PL1, PL2, PL3, PL4, PL5, PL6, PL7, P3, P4, P5, P6, L1, L2, L3, L4, L5, closed), `gate_code` (G1, G2, G3, G4, G5, PL_G1, PL_G2, PL_G3, PL_G4, L_G1, L_G2), `gate_status` (pending, passed, rolled_back), `task_status` (todo, doing, done, blocked).
- `project(id, tenant_id, customer_id, code TEXT UNIQUE, display_name, type, path NULL (yalnız npi), packages TEXT[] CHECK ⊂ A0..E, current_phase DEFAULT 'P1', status DEFAULT 'active', target_delivery_on DATE, target_live_on DATE, coordinator_id UUID REFERENCES public.user, notes, created_at, updated_at)`; BEFORE INSERT trigger: `code := public.next_code('project', customer.code)`; UPDATE'te `code` değişmez.
- `project_product(project_id, product_id, PRIMARY KEY)`, `project_gate(id, tenant_id, project_id, code gate_code, position INT, needs_customer_approval BOOL, status DEFAULT 'pending', passed_at TIMESTAMPTZ, decided_by_role TEXT, customer_approved_on DATE, approval_document_id FK document, evidence_document_ids UUID[], note, rolled_back_reason TEXT, UNIQUE (project_id, code))`, `project_task(id, tenant_id, project_id, phase project_phase, display_name, role TEXT, assignee_id FK user NULL, due_on DATE, status DEFAULT 'todo', blocks_gate BOOL DEFAULT FALSE, position INT)`, `task_template(id, phase, display_name, role, blocks_gate, position, tenant_id NULL)` — seed: P1 (ürün brief'i / koordinatör; çok pazarlı talep ve rakip analizi / koordinatör; uyum ön taraması / uyum; birim ekonomisi / finans; yol seçimi / koordinatör, blocks), P2 (≥3 tedarikçiden RFQ / tedarik; tedarikçi değerlendirmesi / tedarik; üretici spec sheet'i imzalı / tedarik, blocks; numune değerlendirme formu / tedarik; NPDS / tedarik), PL1–PL7 ve P3–P6, L1–L5 için spec §4/§4B/§5 adım listelerinden 3–5 madde (builder yazar).
- `private.gates_for(type project_type, path project_path, packages TEXT[]) RETURNS gate_code[]` — spec M5 kapı seti tablosu birebir: npi+a_sourcing → {G1,G2,G3,G4,G5}; npi+b_private_label → {G1,PL_G1,PL_G2,PL_G3,PL_G4,G3,G4,G5}; variant/revision → {G2,G3,G4,G5}; reorder → {G3,G4,G5}; packages = {A0} yalnız → {PL_G1,PL_G2}; packages = {B} yalnız → {G5}; `'C' = ANY(packages)` veya `'D'` → sona {L_G1,L_G2}; (M) kapılar: G1,G2,G3,G5,PL_*,L_* → `needs_customer_approval = TRUE`, G4 FALSE.
- AFTER INSERT trigger `project_create_gates`: `gates_for` sonucuna göre `project_gate` satırları ve `task_template`'ten ilk fazın görevleri.
- `public.pass_gate(gate_id UUID, note TEXT, customer_approved_on DATE DEFAULT NULL, approval_document_id UUID DEFAULT NULL, evidence_document_ids UUID[] DEFAULT '{}') RETURNS public.project_gate` SECURITY INVOKER: kurallar sırayla — kapı `pending` değilse `gate_not_pending`; `position` daha küçük bir kapı `pending` ise `gate_order`; `needs_customer_approval` ve `customer_approved_on IS NULL OR approval_document_id IS NULL` ise `gate_customer_approval_required`; `code='G2'` ve projenin bir ürünü için `product_evidence.has_signed_spec = FALSE` ise `gate_spec_sheet_required`; `blocks_gate` görevi `done` değilse ve `setting.gate_evidence_blocking` true ise `gate_blocked_by_task`; geçince `status='passed'`, `passed_at=now()`, `project.current_phase` = kapıdan sonraki faz (`private.phase_after(gate_code, path)`: G1→P2 (a) / PL1 (b), PL_G1→PL3, PL_G2→PL4, PL_G3→PL6, PL_G4→P3, G2→P3, G3→P4, G4→P5, G5→L1 (C varsa) / closed, L_G1→L4, L_G2→closed) ve yeni fazın `task_template` görevleri eklenir.
- `public.rollback_gate(gate_id UUID, reason TEXT) RETURNS public.project_gate`: `passed` → `rolled_back`, sonraki geçmiş kapılar da `rolled_back`, faz geri alınır (Faz 2'de olay kaydına bağlanır; şimdilik `reason` zorunlu).
- Modül `project`; izinler project/project_gate/project_task select/insert/update (gate update yalnız RPC üzerinden: `resource_condition` `FALSE` değil, politika var ama UI yalnız RPC kullanır), project_product select/insert/delete, task_template select. `audit_enable` hepsine.

- [ ] **Step 1: pgTAP** `plan(10)`: npi+a proje → 5 kapı sırayla, G4 `needs_customer_approval=FALSE`; packages {A1,C} → L_G1, L_G2 eklenmiş; kod `THO-<yıl>-001`; `pass_gate(G2)` G1 pending iken `throws_ok('gate_order')`; G1 onay tarihsiz `throws_ok('gate_customer_approval_required')`; G1 onaylı → `current_phase = 'P2'`; G2 spec'siz ürünle `throws_ok('gate_spec_sheet_required')`; spec signed sonrası `lives_ok`; aynı kapı ikinci kez `throws_ok('gate_not_pending')`; `rollback_gate` → `rolled_back` ve faz geri.
- [ ] **Step 2: FAIL → migrasyon → reset → PASS**
- [ ] **Step 3: Commit** — `feat(project): projects with generated gates, phase checklists and pass_gate rules`

---

### Task 11: Projeler ve kapılar (M5) — uygulama

**Files:**
- Create: `app/src/api/project/index.ts`, `app/src/components/service-components/phase-strip/PhaseStrip.vue`, `app/src/components/service-components/gate-panel/GatePanel.vue`, `app/src/views/pages/ops/project/{Index,Manage,Upsert,TaskUpsert}.vue`, `tabs/{Overview,Tasks,Products,Documents}.vue`
- Modify: `ops.ts` (`ops-project-list`, `ops-project-add`, `ops-project-manage` `:id/manage/:tab?`, `ops-project-task-add/edit`), `field.ts`, `queryKeys.ts` (DERIVED `project_gate → ['project', 'dashboard_gate_pending']`, `project_task → ['dashboard_task_due']`), i18n
- Test: `app/tests/api/project.test.ts`, `app/tests/components/PhaseStrip.test.ts`

**Interfaces:**
- `projectResource = defineResource('project', { select: '*, customer(code, display_name), project_gate(*), project_product(product(id, sku, display_name))' })`; `projectSchema` (`customer_id` required, `display_name` requiredText, `type` enum, `path` `type==='npi'` ise required (superRefine), `packages` array enum, hedef tarihler optional dateOnly).
- `usePassGate()` mutation `{ gateId, note, customerApprovedOn?, approvalDocumentId?, evidenceDocumentIds? }` → `supabase.rpc('pass_gate', …)`, onSuccess `invalidateTables(['project_gate','project'])`; `useRollbackGate()`.
- `PHASES_FOR_PATH(path): ProjectPhase[]` (a: P1,P2,P3,P4,P5,P6,L1…L5; b: P1,PL1…PL7,P3,…), `PhaseStrip.vue` props `{ phases: ProjectPhase[]; current: ProjectPhase; gates: ProjectGateRow[] }`: yatay şerit, geçilen faz yeşil, mevcut vurgulu, kapılar faz sınırında rozet (pending/passed/rolled_back).
- `GatePanel.vue` props `{ gate: ProjectGateRow; project: ProjectRow }`: durum, kanıt belgeleri (`EntityDocuments entityType="project_gate"`), "Kapıyı geçir" dialogu (not, müşteri onay tarihi, onay belgesi seçimi `useLookup('document', { in: { column: 'entity_id', values: [gate.id, project.id] } })`), RPC hatalarını `errors.gate_*` mesajlarıyla toast; "Geri al" (sebep zorunlu).
- Liste sütunları: kod, müşteri, ad, tip, faz, bekleyen kapı (ilk `pending`), koordinatör, hedef yayın, durum; müşteri filtresi uygulanır.

- [ ] **Step 1: vitest** — şema: npi + path yok → hata `path`; `PHASES_FOR_PATH('b_private_label')` PL1..PL7 içerir; `PhaseStrip` mevcut faza `aria-current="step"` verir ve `passed` kapıda `pi-check` ikonu basar.
- [ ] **Step 2: FAIL → uygula → PASS + typecheck + lint + i18n-sync**
- [ ] **Step 3: Commit** — `feat(project): project list, phase strip, gate panel and task checklist`

---

### Task 12: Dashboard (M6) — görünümler ve sayfa

**Files:**
- Create: `supabase/migrations/022_dashboard.sql`, `supabase/tests/database/022_dashboard.test.sql`, `app/src/api/dashboard/index.ts`, `app/src/components/service-components/dashboard/CountListCard.vue`
- Modify: `app/src/views/pages/dashboard/Index.vue`, `queryKeys.ts`, i18n
- Test: `app/tests/api/dashboard.test.ts`

**Interfaces:**
- Views (security_invoker, `GRANT SELECT … TO authenticated`): `dashboard_gate_pending(gate_id, project_id, project_code, customer_id, customer_code, gate_code, needs_customer_approval, waiting_days INT, owner_role TEXT, needs_management BOOL)` — ilk pending kapı; `owner_role` kapı→rol (G1,G3,G5,PL_*: coordinator; G2: supply_qc; G4: compliance; L_*: content_listing; spec §7.1), `needs_management` = `gate_code IN ('G1')` veya `settings.management_gates`; `dashboard_task_due(task_id, project_id, project_code, customer_id, display_name, role, due_on, days_left INT, overdue BOOL)` (done olmayanlar, `due_on <= now()+5 gün`); `dashboard_product_evidence(customer_id, customer_code, active_sku_count, signed_spec_count, compliance_complete_count)`.
- `useDashboardGates()`, `useDashboardTasks()`, `useDashboardEvidence()` (useQuery, `queryKeys.list(tenant, '<view>')`; müşteri filtresi uygulanır).
- `CountListCard.vue` props `{ title: string; count: number; items: {label, meta, to: RouteLocationRaw}[]; icon: string; severity?: string }`.
- Dashboard kutuları (spec M6 Faz 1): bekleyen kapılar, yönetim aksiyonu, müşteri onayı bekleyen (M), geciken görevler, 5 gün içinde dolacak görevler, imzalı spec'i olmayan aktif SKU'lar (sayı + ürün listesine filtreli link), uyumu eksik SKU'lar; mevcut audit feed kartı kalır.

- [ ] **Step 1: pgTAP** `plan(4)`: proje açılınca `dashboard_gate_pending` tek satır (G1, coordinator, needs_customer_approval); G1 geçince G2 (supply_qc); `dashboard_task_due` termini 3 gün sonra olan görevi listeler, 10 gün sonrakini listelemez; `dashboard_product_evidence` sayıları.
- [ ] **Step 2: vitest** — `groupGates(rows)` → `{ management, customer, team }` ayrımı; `CountListCard` sıfır sayıda "yok" metni.
- [ ] **Step 3: FAIL → migrasyon + sayfa → PASS + typecheck + lint + i18n-sync**
- [ ] **Step 4: Commit** — `feat(dashboard): weekly rhythm cards from gate, task and evidence views`

---

### Task 13: Seed, roller ve kabul turu

**Files:**
- Modify: `supabase/seed.sql` (MOESA LTD demo şirketi: Enterprise plan; kullanıcılar `baris@moesa-panel.test` (owner), `akif@moesa-panel.test` (management rolü), `koordinator@moesa-panel.test` (coordinator rolü); roller `management` (ops modüllerinin tüm izinleri + `setting` update + core modüller), `coordinator` (ops modüllerinin tüm izinleri, `setting` select); müşteri THO "THOMETZKI ONLINE HANDEL" (DE, trading_partner, paketler {A1,B,C,E}), depo "Rosbach" (own), platform hesabı amazon {DE,FR,IT,ES,NL}; tedarikçiler TR1 Kutlu, TR2 TEKIS, CN1 BTE, CN2 Cixi Fujing, ID1 PT Kertas Energi Mulia; 3 örnek ürün (biri `signed` spec belgeli); 1 npi+a projesi)
- Modify: `supabase/tests/database/` — `099_seed.test.sql`: seed sonrası `dashboard_gate_pending` THO projesi için satır döner.
- Create: `docs/superpowers/specs/phase1-acceptance.md` (kabul turu kontrol listesi: spec §9 Faz 1 kabul ölçütleri, her maddeye hangi ekranda nasıl doğrulanır)

- [ ] **Step 1: Seed'i yaz; `pnpm dev:supabase-reset`; `pnpm test:db` tamamı PASS; `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` PASS**
- [ ] **Step 2: Tarayıcıda kabul turu** (`pnpm dev:vue`, `akif@moesa-panel.test`): müşteri filtresi THO → ürün listesi 3 satır, spec rozeti; proje kartında G1'i onay belgesiyle geçir → faz P2; dashboard'da G2 supply_qc bekliyor; CSV dışa aktar → aynı dosyayı içe aktar → `updated:3`. Bulgular `phase1-acceptance.md`'ye işlenir; açık hata varsa bu görevde kapatılır.
- [ ] **Step 3: Commit** — `chore(seed): MOESA demo company with THOMETZKI customer, suppliers, products and a project`

---

## Self-review notları

- Spec kapsamı: M1 (T6), M2 (T5), M3 (T7–T9), M4 (T3–T4), M5 (T10–T11), M6 (T12), ayarlar/K6 (T1–T2), K5 kodlar (T1, T10), K9 `platform` tablosu (T1), roller §7 Faz 1 (T13), veri taşıma aracı (T9; gerçek Drive verisinin dönüştürülmesi T13 sonrası ayrı iş, Drive erişimi gerektirir — spec §11 madde 8).
- Spec'te olup bu planda olmayan: Supabase Storage yükleme (Faz 2), `customer_viewer` (Faz 3), olay üzerinden kapı geri alma (Faz 2; şimdilik `rollback_gate` sebep zorunlu).
- Tip tutarlılığı: `document_entity` değerleri ile `EntityDocuments.entityType` aynı enum; `gate_code` SQL'de alt çizgi (`PL_G1`), arayüzde `PL-G1` olarak çevrilir (i18n `gate.PL_G1`).
- CI: `pnpm test:db` yerel Supabase ister; CI'a eklenmesi (supabase CLI servisi) Faz 2 başında ayrı görev.
