# M22 Amazon listing publishing — design

Owner request (2026-11-06): the panel becomes the source of a product's listing content, and a
"Publish on Amazon" action creates or updates the listing in the customer's Amazon seller account
and follows its journey (draft → ready → submitted → live / with issues). Today this is done by
hand in Drive and Seller Central.

Research behind this document: `docs/superpowers/specs/2026-11-06-spapi-integration-options.md`
(what the Selling Partner API offers per module). The sandbox application exists and works: LWA
token exchange and a sandbox call were verified on 2026-11-06 with the credentials in
`supabase/functions/.env` (git-ignored; template `supabase/functions/.env.example`).

## Intent

A coordinator prepares a product once, in the panel, against the exact field schema Amazon
demands for that product's category; sees what is still missing per marketplace; presses one
button in the market matrix cell; and watches the cell's badge move from "preparing" to "live"
or "issues" with Amazon's own messages attached. Nothing is copied into Seller Central by hand.

## Goals

- Product content for Amazon lives on the product (M3): the Amazon product type (category) and
  the attribute values Amazon's schema for that type defines, in a form generated from the schema.
- Marketplace-specific data (price, language, fulfilment channel, stock source) and the publish
  action live on the market matrix cell (M9), in a drawer opened from the cell.
- The journey is visible: cell badge states draft / ready / submitted / live / issues, a
  submission history with Amazon's responses, and issues that link back to the field.
- Each customer connects their own Amazon seller account from the customer card (OAuth, public
  app); the panel never asks for Seller Central passwords.
- Images come from the media library (M19). Variations (parent/child) are supported from the
  product tree.
- Everything that can run against the sandbox is built and tested against it now; production
  needs only the production app credentials and real authorizations.

## Non-goals (v1)

- Other platforms (Kaufland, bol, eBay, Otto): their cells stay manual.
- Reading listings Amazon-side back into cells for products the panel did not publish (the
  "market matrix sync" of the options document) — a later phase; the schema allows it.
- Orders, inventory, finances, account health, notifications via SQS/EventBridge.
- Gate or customer-approval binding of the publish action (owner: "fix later if it bites").
- Translating content; each marketplace language is entered by the user.
- Amazon Ads (a separate API program) and Vendor (1P) APIs.

## Anti-goals

- Secrets in the browser or the repo. LWA client secret, refresh tokens and access tokens never
  leave the server side (Edge Functions + Vault).
- A hand-maintained copy of Amazon's schema. The form is generated from the Product Type
  Definitions the server fetched; nobody types field lists into the code.
- Silent failures: a submission that Amazon rejects or that never resolves must show on the cell.

## Constraints

- SP-API facts (docs, 2026-11): sandbox application works while the developer profile is under
  review; static sandbox returns mock responses for all APIs (pattern-matched on parameters),
  dynamic sandbox only for some; throttling 5 req/s, burst 15; a sandbox app does not become the
  production app — a second app is created after approval. A private app can only self-authorize
  the developer's own organisation; our customers are separate seller accounts, so the production
  app is **public** (unlisted public app ≤ 25 sellers; more needs Appstore listing). Roles needed:
  Product Listing (no restricted roles, no PII, no RDT).
- Stack: Supabase Edge Functions (Deno) for every Amazon call; Postgres with the project's RLS
  conventions (`private.enable_tenant_level_security`, `private.audit_enable`), pgTAP; Vue 3.5 +
  PrimeVue 4 app with the existing FormField/FormBox, glossary terms (M20) and permissions (CASL).
- Spec K8: tenant-neutral copy, no sensitive fields in logs; Amazon error messages are stored
  verbatim but contain no PII.
- Migrations continue after 045; production is still at 027 and the owner pushes in one go.

## Decisions

### Where things live

- **Product → "Amazon" tab** (M3). Holds: `amazon_product_type` (the Amazon category key, e.g.
  `MOP_AND_BROOM_SET`), the schema version it was filled against, and the attribute values as JSON
  (`listing_attributes jsonb`, keyed exactly as Amazon's attribute names, values in Amazon's own
  shape: arrays of `{value, language_tag, marketplace_id, unit…}`). Layout: option B of the
  brainstorm — left navigation with the schema's property groups and their missing counts, right
  pane with the selected group's fields, a "next missing" button, a language selector for
  language-tagged fields, a completeness bar. Required / conditionally required / optional are
  shown as badges from the schema. Images are picked from the media library (M19) into the schema's
  image slots (main, other, swatch).
- **Market cell → drawer** (M9). Opened from the cell; shows account connection state, the
  content completeness (missing required fields for THIS marketplace, with a link to the Amazon
  tab), the marketplace-specific fields (price/currency, list language, fulfilment channel
  FBA/FBM, stock source — reusing the cell's existing `price`, `currency`, `stock_source`), the
  catalogue match (GTIN → ASIN found / new ASIN), the category restriction check, the submission
  history, and the **Publish on Amazon** / **Update on Amazon** button. Bulk publishing is the
  product list's multi-select action ("publish selected to <marketplace>") — reuses the Transfer
  entry pattern.
- **Customer → platform account** (M1). `customer_platform_account` for `amazon` gains a
  "Connect Amazon" button: the OAuth consent flow (public app) that ends with a refresh token
  stored server-side; the row shows connected / expired / revoked and the authorization date. The
  existing `access` column keeps its meaning (what access the customer gave the company); the new
  column `api_connection` (none / connected / revoked) is the API state.

### Data

- `product.amazon_product_type text`, `product.amazon_schema_version text`,
  `product.listing_attributes jsonb` — owned by the product; copied to the target on a transfer
  (registry entry in `private.transfer_registry` for any new table below).
- `amazon_product_type_definition` (tenant-neutral cache, no RLS, service-role writes): key
  (marketplace_id, product_type, locale), the JSON schema, property groups, the `version`
  Amazon reports, fetched_at. Refreshed weekly by a cron Edge Function and on demand.
- `listing_submission` (per tenant): cell_id, kind (create / update / delete), payload sent,
  Amazon `submissionId`, status (accepted / invalid / processing / done / failed), issues jsonb
  (Amazon's `{code, message, severity, attributeNames}` list), created_by, timestamps. One row per
  press of the button; the latest row drives the cell's badge.
- `customer_platform_account.api_connection`, `…authorized_at`, and the token in Supabase Vault
  (`vault.secrets`, name `amazon:<customer_platform_account id>`); a `private.amazon_token(id)`
  helper readable only by the Edge Functions' service role.
- `market_cell` gains `listing_state` (draft / ready / submitted / live / issues) derived and
  written by the server after each submission or status poll, plus `listing_checked_at`. The
  existing `platform_product_id` (ASIN) and `platform_sku` are filled on success.
- Permission: new subject `listing` with `create` (publish/update) and `read`; management and
  coordinator get it in `private.seed_ops_roles`. Connecting an account is `customer:update`.

### Server (Edge Functions, Deno)

- `amazon-auth`: builds the consent URL, handles the OAuth callback, exchanges the code for the
  refresh token, stores it in Vault. In sandbox the "connect" uses the self-authorized refresh
  token of our own app (one per environment) so the whole flow is exercisable without a customer.
- `amazon-schema`: GET/refresh of a product type definition for a marketplace; search of product
  types by keyword (Product Type Definitions API `searchDefinitionsProductTypes`, `getDefinitionsProductType`).
- `amazon-listing`: validate (dry run: Listings Items `putListingsItem` with `mode=VALIDATION_PREVIEW`
  where supported), publish/update (`putListingsItem` / `patchListingsItem`), delete, status
  (`getListingsItem` with `includedData=issues,summaries`), catalogue match (Catalog Items
  `searchCatalogItems` by GTIN), restriction check (Listings Restrictions `getListingsRestrictions`).
- `amazon-poll` (cron, every 10 min): for cells in `submitted`, ask status and update
  `listing_submission` and the cell; optionally open an incident (M10) when a listing turns to
  `issues` — v1 writes the issue summary into `market_cell.open_issue` and leaves incidents to the
  user.
- All functions take `AMAZON_SPAPI_ENV` (sandbox / production) and `AMAZON_SPAPI_REGION`; the
  sandbox host is `sandbox.sellingpartnerapi-<region>.amazon.com`. Rate limiting with a small
  token bucket per function instance; retries on 429/5xx with backoff.
- Images: at submission time the function signs the media files' URLs (long-lived signed URLs
  from the private bucket) and sends those; Amazon fetches once.
- Variations: a parent product (no GTIN, `parent_id` null with children) is submitted as the
  parent listing with the variation theme from the schema; children reference it via
  `parentage_level` / `child_parent_sku_relationship` attributes as the schema defines.

### Sandbox strategy

- Every Edge Function can run against the static sandbox: the mock responses are keyed on the
  request parameters documented in the API's JSON model, so the dev seed story gets one product
  whose attributes match the sandbox's expected `putListingsItem` sample, and the pgTAP/Deno tests
  assert the parsed responses. The dev story seed (M-seed) gets a "connected" Amazon account for
  THO and the THO products' `listing_attributes`.
- A `pnpm dev:amazon-probe` script (the verified LWA + marketplaceParticipations probe) stays as a
  smoke test of the credentials.

### UI copy and guide

- Glossary terms (M20): ASIN, product type, submission, variation theme. Page guides: product
  "Amazon" tab, cell drawer, "Connect Amazon".
- Amazon's issue messages are shown verbatim (English) with the field name translated through
  the schema's `title`.

### Rulings after the builder check (owner away, 2026-11-06)

1. **One connection per customer, EU only in v1.** `customer_platform_account` keeps its
   UNIQUE(customer, platform); `AMAZON_SPAPI_REGION=eu`; the US marketplace of the `amazon`
   platform is out of scope. A later NA/FE need adds a region column and one token per
   (customer, region).
2. **`listing_state` is the API journey; `market_cell.status` stays the business state.** The
   server moves `status` only through the existing legal transitions, as a user would: to
   `uploaded` when Amazon accepts the submission and to `live` when the summary reports the
   listing buyable/discoverable (which sets `launched_on`); "issues" leaves `status` alone and
   writes `open_issue`. Rollups that count `status='live'` keep working unchanged.
3. **Schema fixture allowed.** If the static sandbox returns no usable product type schema, one
   schema captured from Amazon's public documentation example is checked in under
   `supabase/seed_files/amazon/` and loaded into the cache table by the dev story seed; the form
   generator and tests run on it; production fetches replace it. This is the only hand-maintained
   schema and it is a fixture, not code.
4. **Product type per product, schema version per marketplace.** The product holds
   `amazon_product_type`; versions live in the cache table per (marketplace, type, locale).
   Readiness is computed per cell against that marketplace's schema at validation time; stored
   values are kept when a schema version moves and the missing-field list is recomputed.
5. **Images go through a public bucket copy.** Amazon needs URLs it can fetch without credentials,
   possibly again later. At submission time the function copies the chosen media objects into a
   public bucket `listing-images` under `<tenant>/<media id>/<file>` and sends those stable
   URLs; `media` stays private. Cleanup of unused copies is a later task.
6. **`customer_platform_account.seller_id`** is added (filled by the OAuth callback's
   `selling_partner_id`; in sandbox from `AMAZON_SPAPI_SELLER_ID` in the env).
7. **Variations.** The Amazon parent is the product with children (`parent_id` null); it is
   submitted without GTIN with the schema's variation theme; it needs a cell in the same
   marketplace, created automatically when a child is published, and its state mirrors the
   children's worst state.
8. **Cron via pg_cron + pg_net.** A migration schedules `amazon-poll` (10 min) and the weekly
   schema refresh with `net.http_post` to the functions' URL; the URL and the service key are
   read from Vault secrets (`edge_function_url`, `edge_service_key`) that the dev seed sets
   locally and the owner sets on the hosted project (documented in `supabase/README.md`).
   Vault, pg_cron and pg_net are present locally (checked 2026-11-06).

Facts confirmed by the check: `VALIDATION_PREVIEW` exists on put/patch with static sandbox mocks
but is low-throttle — the per-cell "validate" is on demand only; Amazon returns only
ACCEPTED/INVALID for a submission, so processing/done/failed are panel states fed by polling
`getListingsItem`; the OAuth website flow cannot run against sandbox hosts (sandbox exercises token
storage and use with the self-authorized token; the consent flow is tested with a real seller
and `version=beta` later); the unlisted-app authorization cap is stated inconsistently in the docs.

## Left to the builder

- Form generation details (which PrimeVue control per schema type/enum/array, how language tags
  and units are edited), as long as the B layout and the badges hold.
- Exact OAuth callback route and CSRF/state handling (use Supabase Auth user + a signed state).
- How the catalogue match result is cached on the cell.
- Deno test layout for the Edge Functions (mock fetch for the sandbox).

## Open for the owner

- The production app's roles and the Appstore question once the developer profile is approved.
- Whether a listing turning to "issues" should open an incident automatically (v1: no).
- Review of Turkish copy once written.
