# Amazon listing publishing (M22): rulings, deferred findings and owner follow-ups

Branch `feat/m22-amazon-listing` (on `refactor/infrastructure` 8158f1a; plan `docs/superpowers/plans/2026-11-06-m22-amazon-listing.md`, spec `docs/superpowers/specs/2026-11-06-amazon-listing-design.md`, SP-API options brief `docs/superpowers/specs/2026-11-06-spapi-integration-options.md`). 13 tasks: migrations 046 (core) and 047 (cron) (Tasks 1-2), shared SP-API client (3), completeness module and LUGGAGE fixture (4), `amazon-schema` (5), `amazon-auth` (6), `amazon-listing` (7), `amazon-poll` (8), app API module and copy (9), product Amazon tab (10), Connect Amazon, cell drawer, grid badge and bulk publish (11), story seed and guides (12), README and full verification (13). Every task went implementer -> task review; Tasks 1, 3, 4, 5, 7, 8, 9, 10, 11 needed one fix round each (scoped re-review approved every time); Tasks 2 and 6 were approved first time. Ledger: `.superpowers/sdd/2026-11-06-m22-amazon-listing/progress.md`; pre-flight scan (31 rows): `preflight.md` in the same folder.

## Status

Branch `feat/m22-amazon-listing`. All 13 tasks complete and task-reviewed (most needed one fix round). Verification after the final fix wave: pgTAP 702 PASS, Deno 167 passed + 11 live sandbox tests, vitest 1089 passed, typecheck clean, lint 0 errors, build OK, `pnpm dev:supabase-reset` end to end with the story at 150 checks, browser walk 13/13 in EN and TR. The final whole-branch review found no cross-tenant path to a token or seller account; its 7 Important findings and the walk's 4 bugs were fixed in one wave of 8 commits, re-reviewed with rolled-back probes. That re-review found one new Important regression (below, **must fix before production**) and three minors, parked because the process allows no second fix wave.

Reached so far (last committed state 17b0f79, Tasks 1-11 approved by review): `pnpm test:db` 687 tests in 36 files after Task 2 (675 after Task 1's fix round); `deno task test` 148 passed, `deno task check` clean; `deno task test:live` 4/4 (Task 3) and 10/10 (Task 7) against the sandbox; vitest 1078; typecheck and lint clean. Task 11 browser walk: connect -> connected, Check -> Ready, Publish -> Submitted, poll -> Issues with field links. Task 12 (story seed and guides) is in progress in the working tree; Task 13 (README, probe alias, full verification and browser walk) not started.

## Rulings made while the owner was away

Owner brief: "bitene kadar devam et"; unresolved questions saved for the end.

Spec rulings after the builder check (2026-11-06):

1. **One connection per customer, EU only in v1.** `customer_platform_account` keeps UNIQUE(customer, platform); `AMAZON_SPAPI_REGION=eu`; the US marketplace is out of scope.
2. **`listing_state` is the API journey; `market_cell.status` stays the business state.** The server moves `status` only through legal transitions: to `uploaded` on acceptance, to `live` when Amazon reports the listing buyable (sets `launched_on`); "issues" leaves `status` alone and writes `open_issue`.
3. **Schema fixture allowed.** One schema is checked in under `supabase/seed_files/amazon/` (the sandbox returns none); it is a fixture, production fetches replace it.
4. **Product type per product, schema version per marketplace.** Readiness is recomputed per cell against that marketplace's schema; stored values survive a version move.
5. **Images go through a public bucket copy** (`listing-images`, `<tenant>/<media id>/<file>`); `media` stays private; cleanup of unused copies is later.
6. **`customer_platform_account.seller_id`** is filled by the OAuth callback (`selling_partner_id`); in sandbox from `AMAZON_SPAPI_SELLER_ID`.
7. **Variations.** The Amazon parent is the product with children; submitted without GTIN with the schema's variation theme; its cell is created automatically when a child is published; its state mirrors the children's worst state.
8. **Cron via pg_cron + pg_net** with `edge_function_url` and `edge_service_key` read from Vault.

Planner decisions accepted before Task 1:

9. **Permission subject is `listing_submission` under module `listing`** (not the spec's bare `listing`); management and coordinator get it in `private.seed_ops_roles`.
10. **The LUGGAGE fixture schema is hand-written** (the sandbox gives no real schema).
11. **The sandbox's canned answers are US-only:** `deriveListingState` ignores the marketplace in sandbox, the catalogue match is always "new", and a sandbox publish walk ends in `issues`.
12. **Local `edge_function_url` is `http://supabase_kong_moesa-panel:8000/functions/v1`** (verified in Task 2).
13. **`amazon-poll`, `amazon-schema` and `amazon-auth` run with `verify_jwt=false` and `assertServiceCall` / their own auth;** `amazon-listing` keeps `verify_jwt=true`.
14. **A transferred platform account resets `api_connection`.**
15. **Updates go through `putListingsItem`.**
16. **FBM stock quantity is 0** in the offer.
17. **The poll gives up on a submission after 24 hours.**
18. **Glossary codes** `productType`, `submissionId`, `variation_theme`; guides are tasks on existing pages.

Pre-flight rulings (31-row scan):

19. **C1: the fixture envelope mirrors the API shape** (`productType`, `marketplaceIds[]`, `schema`); `toDefinitionRow` accepts an inline `schema` or the API's `{link, checksum}`.
20. **C2: `APP_URL` defaults to `http://localhost:6161`.**
21. **C3: the publish route returns `{ cell, submission }`;** `buildListingBody` adds `purchasable_offer` only when price and currency are both set (same guard as `serverProvided`).
22. **C4: Task 10 adds the route `ops-product-manage-amazon`** and its label; deep link `?field=<attribute>`.
23. **D1: no `is_empty` on UPDATE in pgTAP;** assert with `is((SELECT count(*) ...), n)` or `lives_ok`.
24. **D2: the completeness module stays in `supabase/functions/_shared/`** and Vite gets `server.fs.allow` for it; the app never re-implements `serverProvided`.
25. **D3: plpgsql parameters are `p_`-prefixed** (callers pass `p_*` keys).
26. **D4: Task 9 adds the keys the scan lists;** later tasks add what they still miss in en + tr.
27. **D5: `languageTag` = cell `listing_language`, else the marketplace default map;** the story's ES cell gets price, currency and `listing_language`; the expected canned issue code follows Task 3's live test (18027).
28. **D6: `test:live`, the probe and the walk skip with a clear message** when the env file or credentials are missing.
29. **D7: the account type is `CustomerPlatformAccountRow`.**
30. **N2: a copied cell is treated as `draft` whenever its customer's Amazon account is not connected,** so the drawer and publish recompute instead of trusting the copied `listing_state`.
31. **N5: cross-function imports go through `_shared/`,** never across function directories.

Rulings during the run:

32. **Issues win (Task 1).** Status never moves while `listing_state = issues`, even on an accepted submission; a later live poll still advances the cell.
33. **Revoked keeps `seller_id` and `authorized_at` and clears the token** (Task 1); an AFTER DELETE trigger on `customer_platform_account` removes the Vault secret, also on cascade.
34. **The `VALIDATION_PREVIEW` mock exists only on the NA sandbox host (Task 3).** In sandbox the client takes an explicit, sandbox-only region override for the canned US marketplace; production throws `amazon_region_unsupported` if it differs from the configured region.
35. **The sandbox seller id placeholder `SANDBOX_SELLER` is accepted** when `AMAZON_SPAPI_SELLER_ID` is not set (Tasks 3 and 6).
36. **The Belgian default language is `fr_BE`** (Task 4), overriding D5's `nl_BE`; `listingCompleteness.languageTag` is the single source and `amazon.ts` derives from it.
37. **A lone `unit` does not count as filled** (Task 4); `currency` does.
38. **Checksum of a schema link accepts hex or Base64 MD5** (Task 5).
39. **Sandbox connect stores no token** (Task 6). The client uses the env refresh token in sandbox, so after a switch to production an account connected in sandbox reports "not connected" instead of using our own grant.
40. **A bad OAuth state redirects with `amazon=error&reason=...`** instead of answering 400/403 (Task 6).
41. **CORS preflight is answered by `_shared/http.ts` `serve`** (Task 6 open point resolved).
42. **A variation parent sends no offer** (Task 7): no `purchasable_offer` or `fulfillment_availability`, even when its cell has a price; those count as provided in its completeness check (rule R7).
43. **A delete settles its submission directly** (Task 7), not through `listing_apply_submission`; a delete never moves `status`. Delete loads only cell, marketplace and SKU, so a cell whose product type or language was cleared can still be withdrawn.
44. **The status logic lives in `_shared/listingStatus.ts` `refreshListingStatus`** (Task 7 fix); the service-key `status` branch of `amazon-listing` was dropped.
45. **The poll handles at most 20 cells per run, oldest check first;** a failing cell is stamped `listing_checked_at` so it rotates behind healthy ones; only permanent errors give up early (Task 8).
46. **The Amazon tab is shown to every product reader, read-only without `update product`** (Task 10).
47. **Composite attributes use a raw JSON box** (Task 10): anything with more than a `value` key, such as `externally_assigned_product_identifier`, `list_price`, `purchasable_offer`, routes to JSON.
48. **The drawer's completeness uses the shared `serverProvided` with the parent flag** (Task 11 fix), so drawer and server agree on R7.
49. **Cache reads by the app are keyed by marketplace id** (Task 9 fix, `marketplaceIdFor(country)`: nine EU ids verified against the SP-API page), with an edge fallback on a miss.


### Final review rulings (2026-11-06, owner away)

- Migrations 046 and 047 were edited in place during the fix wave because neither has reached any shared database (staging is rebuilt from the branch by CI).
- A connected Amazon account cannot change customer, tenant or platform (a token must never move to another customer's products).
- Stale writes are refused: a state change applies only for the cell's latest submission, the check uses optimistic concurrency on the cell, and a second publish while one is in flight answers 409 `listing_in_progress`.
- Updates and offers on existing SKUs use `patchListingsItem` without `fulfillment_availability`, so the panel never zeroes stock the seller manages; FBM quantity is sent only for a brand-new SKU.
- A parent cell's state is the worst of its own latest submission and its children's states; the poll only works on the latest submission still processing.
- `AMAZON_SPAPI_ENV` must be set explicitly; unset means unconfigured. In production `APP_URL` and the public functions URL are required.
- Users cannot write `listing_submission` directly; only the functions (service role) do. Check and status need the publish permission because they spend the customer's grant.
- The schema refresh runs daily (cap 20 per run); the cron HTTP timeout is 120 s.
- One marketplace-id map lives in `_shared` and is used by both server and app.
- Product-type property groups are stored as an ordered array so the Amazon tab follows Amazon's order.

### Backlogged by the final review

- Public image copies in `listing-images` outlive a deleted media row, listing or customer, and Validate makes images of never-published products public. Needs a cleanup job (and possibly copying only on publish).


## Must fix before production use

- **Stuck cell after a disconnect (fix-wave re-review I1).** `supabase/functions/amazon-poll/poll.ts` ~145-147: when the account is disconnected or revoked, the poll sets the cell to `draft` but leaves its in-flight submission at `processing`. The poll only reads `submitted` cells and the drawer shows Refresh only for submitted/issues, while publish is refused from the submission, so after a reconnect every publish of that (non-parent) cell answers 409 `listing_in_progress` with no way out in the UI. Fix: in that poll branch mark the cell's latest in-flight submission `failed` (with a reason), plus a Deno test. Until then a stuck cell needs `update listing_submission set status='failed' where id=…` by hand. No customer can hit it before the production app exists.

### Parked minors from the fix-wave re-review

- M1: if a run dies while a delete is `processing`, give-up applies it through `listing_apply_submission`, moving the cell's business status to issues (which `remove()` avoids).
- M2: a failed or invalid delete becomes the cell's latest submission; Refresh then returns it unchanged and a `submitted` cell never settles until republished.
- M3: a create or update may start while a delete is still in flight (the 409 guard covers creates/updates in flight only).
- A parent cell with no submission of its own fails `listing_submission_not_found` on every poll run (pre-existing).


### Drawer inline editing (2026-11-07, owner chose option A)

Missing required fields and fields named by Amazon issues are now edited inside the cell drawer with the tab's own field component; "Tüm alanları ürün sekmesinde aç" opens the tab in a new browser tab. Parked minors from its review:

- The save merges per attribute, not per language entry: another session's change to a different language of the same attribute is overwritten (changes to other attributes are kept).
- A stale refetch landing right after a save could briefly bring back the pre-save values (unlikely race in `useListingAttributes`).
- Closing the cell dialog with both the cell form and the drawer fields unsaved asks twice; a combined prompt can come later.

## Deferred minors

### Fixed in the final fix wave (verify)

From `fix-wave-brief.md` section A; each carries a TDD requirement. Verify against the final review.

- **A1** `_shared/amazon.ts`: `AMAZON_SPAPI_ENV` unset defaulted to sandbox (fail open); now unset -> `amazon_unconfigured` (Tasks 3 and 6 reviews).
- **A2** `amazon-auth/index.ts`: the callback loaded config before it could redirect, so a missing state secret in production gave the seller's browser a raw 500; now redirects with `reason=amazon_unconfigured` (Task 6 review).
- **A3** Group order: `property_groups` is now an ordered array inside 046 (edited in place), produced by `toDefinitionRow` and read by the tab (Task 10 concern).
- **A4** `amazon-schema/schema.ts`: `encodeBase64` imported through `_shared/deps.ts` instead of directly from jsr (Task 5 re-review note).
- **A5** `amazon-schema`: a 403 test for a user lacking the permission, with the repo's auth test double, or a stated reason (Task 5).
- **A6** Drawer and tab: a background refetch returning an equal-but-new object no longer drops half-typed invalid JSON text (Task 10 re-review).
- **B1–B4** (walk): the Amazon tab takes `?market=` and `?lang=` with a stable default; the drawer shows the check's own time; the bulk button is pluralised; Turkish uses "ilan" for a listing.
- **C1–C18** (final review): see "Final review rulings" above; every item was confirmed by the re-review, most with rolled-back probes.

### Not fixed (cosmetic, harmless or by design)

- Task 1: a parent cell's own `listing_state` is overwritten by the next child update, and nothing re-mirrors when a child is deleted or its state set to NULL.
- Task 1: `public.product_with_evidence` does not expose `amazon_product_type`, `amazon_schema_version` or `listing_attributes`; only the product list uses that view, the Amazon tab reads `public.product`.
- Task 1: `ADD CONSTRAINT` in 046 is not idempotent (unlike the neighbouring `ADD COLUMN IF NOT EXISTS`).
- Task 1: a user can forge `created_by` on a `listing_submission` insert (matches `document`, 016); the user-insert trigger could force `auth.uid()`.
- Task 2: `seed-story.mjs` passes the service key inside the SQL on stdin; a `-v` variable would be marginally safer. Not a realistic leak path.
- Task 2: the 047 test does not assert `Content-Type` or the 30 s timeout.
- Task 2: a NULL `p_path` makes `amazon_cron_call` build a NULL URL; only the two fixed jobs call it.
- Task 3: `amazonAccount` needs the service-role client by contract, not by type or comment.
- Task 3: `errorResponse` maps 502 codes to `internal_error` (worked around in the `amazon-schema` handler).
- Task 3: production plus a region override equal to the configured region is silently accepted.
- Task 4: `conditionalRequired` evaluates the `if` on raw attributes, ignoring marketplace and language selectors (low risk while cells do not share an attributes map).
- Task 4: `maxItems`/`minItems` and enum membership are not checked by completeness (a seventh bullet or an out-of-enum `condition_type` counts as filled); Amazon's preflight and the form must catch them.
- Task 4: the fixture's `variation_theme` uses `value`, Amazon's real schema uses `name` (noted in the fixture `$comment`); a real fetch will need the select control and the payload builder to handle `name`.
- Task 5: the production refresh is sequential in one invocation (now ordered, capped at 20 rows and time-budgeted at about 100 s); real checksum format and schema size are unverified against production.
- Task 6: `amazon_account_connect` is called with `refreshToken as string` (hides a NULL from the generated RPC type; correct at runtime). A sandbox connect after a production period leaves the earlier Vault token in place.
- Task 7: `validate` copies images to the public bucket (idempotent; documented, not "writes nothing").
- Task 7: a child whose parent publish fails fails with the parent's error (for example `listing_incomplete` with the parent's missing fields); the UI could say "parent incomplete".
- Task 7: the `supabase/config.toml` comment above `[functions.amazon-listing]` still says `amazon-poll` calls `status` with the service key; reword to "users call it with their JWT" (verify in the final wave).
- Task 8: the poll tests were written with the code, not RED first (process only); the response carries an extra `given_up` field.
- Task 9: `disconnectAmazon` drops the `{account}` result (the invalidation refreshes it).
- Task 9: schema calls are a GET with the query string inside the function name, which depends on functions-js behaviour (documented helper, pinned by a test).
- Task 10: the Amazon tab shows issues only for the first Amazon cell; other marketplaces' issues appear in the drawer.
- Task 10: the schema locale is fixed to `en_GB`, so schema titles are in Amazon English; no unsaved-changes route guard on the tab.
- Task 10: composite attributes need a raw JSON box; a structured sub-form is a follow-up for operator usability.
- Task 11: the drawer puts the action buttons after the history, so on a long history they sit at the bottom.
- Task 11: the drawer's completeness uses `missingAttributes`, not the check's `missing` list (both now share `serverProvided`).

## Known limitations

### Sandbox facts (what the static sandbox can and cannot show)

- **Canned US-only responses.** The sandbox answers with canned data pattern-matched on parameters; `deriveListingState` ignores the marketplace in sandbox.
- **No EAN mock.** The catalogue match is always "new" in the sandbox.
- **`VALIDATION_PREVIEW` exists only on the NA sandbox host.** The EU sandbox answers marketplace `ATVPDKIKX0DER` with 403 `Unauthorized`; the validate path and the live tests use the sandbox-only region override.
- **A sandbox publish ends in `issues`** (the canned issues, for example `90220` size and `18027` General), so a clean `live` path is not exercisable until production.
- **Sandbox connect stores no token** and writes the placeholder seller `SANDBOX_SELLER` unless `AMAZON_SPAPI_SELLER_ID` is set (it is still missing in the local `supabase/functions/.env`).
- **The OAuth consent flow cannot run against sandbox hosts;** it is tested with a real seller and `version=beta` later.
- **The sandbox returns no usable product type schema;** definitions come from the R3 LUGGAGE fixture (its cache row serves any marketplace and locale in sandbox only); refresh is a no-op in sandbox.
- **Production code paths** (schema fetch on a miss, refresh, token refresh with a real grant) are covered only by mocked tests.

### Behaviour of the first version

- A variation parent sends no offer and gets no stock; a parent cell mirrors its children's worst state (and its own state is overwritten by the next child update).
- Delete settles its submission directly; a delete never moves `status`.
- Composite attributes (`externally_assigned_product_identifier`, `list_price`, `purchasable_offer`) are edited as raw JSON.
- `media:<id>` references inside `listing_attributes` are not remapped by a copy transfer; the copied product must have its images picked again (publish refuses with `listing_image_missing`).
- A transferred customer's Amazon account resets to not connected, so copied cells show `draft` until it is reconnected.
- One connection per customer, EU marketplaces only; the poll gives up after 24 hours and handles 20 cells per run.
- The `listing-images` copies are never cleaned up.
- Amazon's issue messages are stored and shown verbatim (English).
- Without `select customer_platform_account` a user's grid shows stored states and the drawer treats the account as not connected (acceptable for the ops roles).

### Threat model (from the Task 6 review; accepted risks)

- **The OAuth `state` is a bearer credential** (HMAC-signed, 10-minute expiry, bound to tenant, account and user) that is not tied to the initiating browser session: there is no cookie or nonce. A tenant user who holds the connect permission could send their own consent link to a third-party seller and attach that seller's grant to their own tenant's account. The callback re-checks tenant and account, so the damage stays inside the attacker's own row. Inherent to a cookieless edge callback.
- **Replay after disconnect.** A state that was used and then disconnected within its 10 minutes passes the `authorized_at` marker again; only Amazon's single-use authorization code (valid about 5 minutes) blocks the replay.
- **The callback does not re-check that the user still holds the permission** at callback time; the window is at most 10 minutes.
- **Fail-closed configuration.** In production a missing or short (under 32 characters) state secret answers `amazon_unconfigured`; the service-key-derived fallback secret exists only in sandbox. A1 and A2 above close the remaining fail-open default and the raw 500 (verify).
- **No secret leaves the server.** Tokens live in Vault (`amazon:<account id>`), the catch paths log codes only, redirects carry only `amazon` and `reason`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store` are set; the AFTER DELETE trigger removes the secret with the account.
- **Business constraints (options brief).** The production app must be a public app. Unlisted it is limited to 25 sellers (the docs state the cap inconsistently); more needs an Appstore listing and its review. Roles needed: Product Listing only (no restricted roles, no PII, no RDT). Sellers can revoke an authorization and renewal may be required; the panel shows the revoked state.

## Deliberately out of scope

- Other platforms (Kaufland, bol, eBay, Otto): their cells stay manual.
- Reading Amazon-side listings back into cells for products the panel did not publish (market matrix sync).
- Orders, inventory, finances, account health, notifications via SQS/EventBridge.
- Gate or customer-approval binding of the publish action (owner: "fix later if it bites").
- Translating content; each marketplace language is typed by the user.
- Amazon Ads and Vendor (1P) APIs.
- The US/NA and FE regions (a later need adds a region column and one token per customer and region).
- Opening an incident automatically when a listing turns to `issues` (v1 writes `open_issue` only).
- A hand-maintained copy of Amazon's schema (anti-goal); only the one fixture exists.
- Cleanup of unused `listing-images` copies.

## Copy for owner review

New EN and TR copy added on this branch (`git diff refactor/infrastructure` on both `index.json` files; 176 keys, none changed or removed). Turkish is a developer draft and has not been read by a native reviewer; the other 10 locales copy English through `pnpm i18n-sync`. Amazon's own issue messages are not in these files. The glossary, guide and system-guide keys at the end include Task 12's uncommitted working-tree additions; re-run the diff after Task 12 and Task 13 for the final list. Five TR values equal the EN value (terms kept on purpose).

### Errors and field labels (34)

| key | EN | TR |
|---|---|---|
| `fields.listing` | Listing | Listeleme |
| `fields.listing_submission` | Listing submission | Listeleme gönderimi |
| `errors.market_cell_listing_server_only` | Only the Amazon connection updates the listing state. | Listeleme durumunu yalnız Amazon bağlantısı günceller. |
| `errors.platform_account_api_server_only` | The Amazon connection is set by connecting the account. | Amazon bağlantısı, hesap bağlanarak kurulur. |
| `errors.amazon_not_connected` | The customer has not connected an Amazon account. | Müşteri bir Amazon hesabı bağlamamış. |
| `errors.amazon_connection_revoked` | The Amazon connection was withdrawn. Connect the account again. | Amazon bağlantısı geri çekildi. Hesabı yeniden bağlayın. |
| `errors.amazon_auth_failed` | Amazon refused the authorisation. Connect the account again. | Amazon yetkilendirmeyi reddetti. Hesabı yeniden bağlayın. |
| `errors.amazon_unavailable` | Amazon is not reachable right now. Try again later. | Amazon şu an erişilemiyor. Daha sonra tekrar deneyin. |
| `errors.amazon_throttled` | Amazon is limiting requests. Try again in a moment. | Amazon istekleri sınırlıyor. Biraz sonra tekrar deneyin. |
| `errors.amazon_rate_limited` | Too many requests to Amazon. Try again in a moment. | Amazon’a çok fazla istek gönderildi. Biraz sonra tekrar deneyin. |
| `errors.amazon_marketplace_unsupported` | This country is not supported for Amazon listings. | Bu ülke Amazon listeleri için desteklenmiyor. |
| `errors.amazon_schema_missing` | The Amazon schema for this product type is not available yet. | Bu ürün tipinin Amazon şeması henüz mevcut değil. |
| `errors.amazon_schema_checksum` | The downloaded Amazon schema failed its integrity check. Try again. | İndirilen Amazon şeması bütünlük denetimini geçemedi. Tekrar deneyin. |
| `errors.amazon_schema_invalid` | The Amazon schema could not be read. | Amazon şeması okunamadı. |
| `errors.amazon_request_invalid` | Amazon rejected the request. | Amazon isteği reddetti. |
| `errors.amazon_not_found` | Amazon does not know this item. | Amazon bu öğeyi tanımıyor. |
| `errors.amazon_unconfigured` | Amazon is not configured on the server. | Amazon sunucuda yapılandırılmamış. |
| `errors.amazon_state_invalid` | The Amazon connection request expired or is not valid. Start again. | Amazon bağlantı isteğinin süresi doldu ya da geçerli değil. Baştan başlayın. |
| `errors.amazon_state_replayed` | This Amazon connection request was already used. Start again. | Bu Amazon bağlantı isteği daha önce kullanılmış. Baştan başlayın. |
| `errors.amazon_callback_invalid` | Amazon’s answer was incomplete. Start again. | Amazon’un yanıtı eksikti. Baştan başlayın. |
| `errors.listing_incomplete` | Required Amazon fields are missing. | Zorunlu Amazon alanları eksik. |
| `errors.listing_image_missing` | An image of the listing could not be found. | Listenin bir görseli bulunamadı. |
| `errors.listing_image_url_not_public` | Images must be served from a public address before Amazon can fetch them. | Amazon’un indirebilmesi için görseller herkese açık bir adresten sunulmalı. |
| `errors.listing_cell_not_found` | This Amazon cell was not found. | Bu Amazon hücresi bulunamadı. |
| `errors.listing_product_type_missing` | Choose an Amazon product type first. | Önce bir Amazon ürün tipi seçin. |
| `errors.listing_language_missing` | This country needs a listing language. | Bu ülke için bir liste dili gerekli. |
| `errors.listing_submission_not_found` | Nothing has been submitted for this cell yet. | Bu hücre için henüz bir şey gönderilmedi. |
| `errors.platform_account_not_found` | The platform account was not found. | Platform hesabı bulunamadı. |
| `errors.invalid_request` | The request is not valid. | İstek geçerli değil. |
| `errors.unauthorized` | Sign in again to continue. | Devam etmek için yeniden giriş yapın. |
| `errors.forbidden` | You are not allowed to do this. | Bunu yapmaya yetkiniz yok. |
| `errors.tenant_not_allowed` | You are not allowed to act in this company. | Bu şirkette işlem yapmaya yetkiniz yok. |
| `errors.method_not_allowed` | This request method is not allowed. | Bu istek yöntemine izin verilmiyor. |
| `errors.not_found` | Not found. | Bulunamadı. |

### Amazon tab, drawer, connection and bulk (`ops.amazon.*`, `ops.product`, `route.label`) (114)

| key | EN | TR |
|---|---|---|
| `route.label.ops_product_amazon` | Amazon | Amazon |
| `ops.product.tabs.amazon` | Amazon | Amazon |
| `ops.amazon.state.draft` | Draft | Taslak |
| `ops.amazon.state.ready` | Ready | Hazır |
| `ops.amazon.state.submitted` | Submitted | Gönderildi |
| `ops.amazon.state.live` | Live | Yayında |
| `ops.amazon.state.issues` | Issues | Sorunlu |
| `ops.amazon.api_connection.none` | Not connected | Bağlı değil |
| `ops.amazon.api_connection.connected` | Connected | Bağlı |
| `ops.amazon.api_connection.revoked` | Revoked | İptal edildi |
| `ops.amazon.platform.api_connection` | Amazon connection | Amazon bağlantısı |
| `ops.amazon.platform.authorized_at` | Connected on | Bağlanma tarihi |
| `ops.amazon.tab.title` | Amazon | Amazon |
| `ops.amazon.tab.product_type` | Amazon product type | Amazon ürün tipi |
| `ops.amazon.tab.product_type_search` | Search product types | Ürün tipi ara |
| `ops.amazon.tab.product_type_none` | No product type matches. | Eşleşen ürün tipi yok. |
| `ops.amazon.tab.schema_version` | Schema version {version} | Şema sürümü {version} |
| `ops.amazon.tab.schema_moved` | Amazon changed this product type to version {version}. Your values are kept; check the fields marked missing. | Amazon bu ürün tipini {version} sürümüne taşıdı. Girdiğiniz değerler korundu; eksik işaretli alanları kontrol edin. |
| `ops.amazon.tab.language` | Language | Dil |
| `ops.amazon.tab.next_missing` | Next missing field | Sonraki eksik alan |
| `ops.amazon.tab.completeness` | {filled} of {total} required fields filled | Zorunlu {total} alanın {filled} tanesi dolu |
| `ops.amazon.tab.groups` | Field groups | Alan grupları |
| `ops.amazon.tab.badge.required` | Required | Zorunlu |
| `ops.amazon.tab.badge.conditional` | Required if applicable | Duruma göre zorunlu |
| `ops.amazon.tab.badge.optional` | Optional | İsteğe bağlı |
| `ops.amazon.tab.image_pick` | Choose image | Görsel seç |
| `ops.amazon.tab.image_clear` | Remove image | Görseli kaldır |
| `ops.amazon.tab.save` | Save Amazon content | Amazon içeriğini kaydet |
| `ops.amazon.tab.values_kept` | Values already entered are kept. | Daha önce girilen değerler korunur. |
| `ops.amazon.tab.json_invalid` | This is not valid JSON. | Bu geçerli bir JSON değil. |
| `ops.amazon.tab.issue_link` | Go to {field} | {field} alanına git |
| `ops.amazon.tab.product_type_empty` | Choose the Amazon product type to fill in its fields. | Alanlarını doldurmak için Amazon ürün tipini seçin. |
| `ops.amazon.tab.provided` | Filled in on publishing, from the product or the market cell. | Yayınlarken üründen veya pazar hücresinden doldurulur. |
| `ops.amazon.tab.value_clear` | Clear the value | Değeri temizle |
| `ops.amazon.cell.title` | Amazon listing | Amazon listesi |
| `ops.amazon.cell.open` | Open Amazon listing | Amazon listesini aç |
| `ops.amazon.cell.connection` | Amazon connection | Amazon bağlantısı |
| `ops.amazon.cell.not_connected` | The customer has not connected an Amazon account. | Müşteri bir Amazon hesabı bağlamamış. |
| `ops.amazon.cell.completeness` | Completeness | Doluluk |
| `ops.amazon.cell.missing_none` | No field is missing. | Eksik alan yok. |
| `ops.amazon.cell.missing_link` | Fill in {field} | {field} alanını doldur |
| `ops.amazon.cell.marketplace` | Marketplace | Pazaryeri |
| `ops.amazon.cell.listing_language` | Listing language | Liste dili |
| `ops.amazon.cell.fulfillment_channel` | Fulfilment | Gönderim |
| `ops.amazon.cell.fulfillment.fbm` | Merchant fulfilled (FBM) | Satıcı gönderimi (FBM) |
| `ops.amazon.cell.fulfillment.fba` | Fulfilled by Amazon (FBA) | Amazon gönderimi (FBA) |
| `ops.amazon.cell.match.found` | Matches an existing Amazon product ({asin}) | Mevcut bir Amazon ürünüyle eşleşti ({asin}) |
| `ops.amazon.cell.match.new` | No match: a new product will be created | Eşleşme yok: yeni ürün oluşturulacak |
| `ops.amazon.cell.match.none` | Not checked yet | Henüz kontrol edilmedi |
| `ops.amazon.cell.restriction.none` | No selling restriction | Satış kısıtı yok |
| `ops.amazon.cell.restriction.restricted` | Selling is restricted: {reasons} | Satış kısıtlı: {reasons} |
| `ops.amazon.cell.history` | Submissions | Gönderimler |
| `ops.amazon.cell.history_empty` | Nothing has been submitted yet. | Henüz bir şey gönderilmedi. |
| `ops.amazon.cell.issue_general` | General | Genel |
| `ops.amazon.cell.check` | Check | Kontrol et |
| `ops.amazon.cell.publish` | Publish on Amazon | Amazon’da yayınla |
| `ops.amazon.cell.update` | Update on Amazon | Amazon’da güncelle |
| `ops.amazon.cell.validate` | Validate with Amazon | Amazon ile doğrula |
| `ops.amazon.cell.validated.VALID` | Amazon accepts this listing. | Amazon bu listeyi kabul ediyor. |
| `ops.amazon.cell.validated.INVALID` | Amazon reports problems with this listing. | Amazon bu listede sorun bildiriyor. |
| `ops.amazon.cell.delete` | Remove from Amazon | Amazon’dan kaldır |
| `ops.amazon.cell.delete_confirm` | Remove this listing from Amazon? | Bu liste Amazon’dan kaldırılsın mı? |
| `ops.amazon.cell.checked_at` | Checked {date} | Kontrol: {date} |
| `ops.amazon.cell.state` | Listing state | Liste durumu |
| `ops.amazon.cell.state_unknown` | Unknown state | Bilinmeyen durum |
| `ops.amazon.cell.open_platforms` | Open the customer’s platform accounts | Müşterinin platform hesaplarını aç |
| `ops.amazon.cell.product_type_missing` | The product has no Amazon product type yet. | Ürünün henüz bir Amazon ürün tipi yok. |
| `ops.amazon.cell.open_tab` | Open the Amazon tab | Amazon sekmesini aç |
| `ops.amazon.cell.catalogue` | Catalogue match | Katalog eşleşmesi |
| `ops.amazon.cell.fields_save` | Save marketplace fields | Pazaryeri alanlarını kaydet |
| `ops.amazon.cell.published` | Sent to Amazon: {status} | Amazon’a gönderildi: {status} |
| `ops.amazon.cell.publish_blocked.not_connected` | Connect the customer’s Amazon account first. | Önce müşterinin Amazon hesabını bağlayın. |
| `ops.amazon.cell.publish_blocked.product_type` | Choose the product’s Amazon product type first. | Önce ürünün Amazon ürün tipini seçin. |
| `ops.amazon.cell.publish_blocked.missing` | Fill in the missing fields first. | Önce eksik alanları doldurun. |
| `ops.amazon.cell.publish_blocked.unchecked` | Run Check to mark the listing ready. | Listeyi hazır işaretlemek için Kontrol et’i çalıştırın. |
| `ops.amazon.cell.publish_blocked.submitted` | Amazon is still processing the last submission. | Amazon son gönderimi hâlâ işliyor. |
| `ops.amazon.cell.publish_blocked.unsaved` | Save the marketplace fields first. | Önce pazaryeri alanlarını kaydedin. |
| `ops.amazon.connect.button` | Connect Amazon | Amazon’u bağla |
| `ops.amazon.connect.reconnect` | Reconnect Amazon | Amazon’u yeniden bağla |
| `ops.amazon.connect.disconnect` | Disconnect Amazon | Amazon bağlantısını kes |
| `ops.amazon.connect.connected_on` | Connected on {date} | {date} tarihinde bağlandı |
| `ops.amazon.connect.sandbox_note` | Test mode: the connection is simulated and no seller consent is asked. | Test modu: bağlantı simüle edilir, satıcıdan onay istenmez. |
| `ops.amazon.connect.result.connected` | Amazon is connected. | Amazon bağlandı. |
| `ops.amazon.connect.result.error` | Amazon could not be connected. | Amazon bağlanamadı. |
| `ops.amazon.connect.seller_id` | Seller ID {id} | Satıcı kimliği {id} |
| `ops.amazon.connect.disconnect_confirm` | Disconnect the Amazon account? Nothing can be published to Amazon until it is connected again. | Amazon hesabının bağlantısı kesilsin mi? Yeniden bağlanana kadar Amazon’a hiçbir şey yayınlanamaz. |
| `ops.amazon.connect.disconnected` | Amazon is disconnected. | Amazon bağlantısı kesildi. |
| `ops.amazon.bulk.open` | Publish to Amazon | Amazon’da yayınla |
| `ops.amazon.bulk.open_count` | Publish {count} products to Amazon | {count} ürünü Amazon’da yayınla |
| `ops.amazon.bulk.title` | Publish to Amazon | Amazon’da yayınla |
| `ops.amazon.bulk.country` | Country | Ülke |
| `ops.amazon.bulk.submit` | Publish | Yayınla |
| `ops.amazon.bulk.col.sku` | SKU | SKU |
| `ops.amazon.bulk.col.name` | Product | Ürün |
| `ops.amazon.bulk.col.result` | Result | Sonuç |
| `ops.amazon.bulk.col.detail` | Detail | Ayrıntı |
| `ops.amazon.bulk.result.submitted` | Submitted | Gönderildi |
| `ops.amazon.bulk.result.skipped_no_cell` | Skipped: no Amazon cell in this country | Atlandı: bu ülkede Amazon hücresi yok |
| `ops.amazon.bulk.result.skipped_incomplete` | Skipped: required fields are missing | Atlandı: zorunlu alanlar eksik |
| `ops.amazon.bulk.result.invalid` | Rejected by Amazon | Amazon reddetti |
| `ops.amazon.bulk.result.error` | Failed | Başarısız |
| `ops.amazon.bulk.open_disabled_empty` | Select products first. | Önce ürün seçin. |
| `ops.amazon.bulk.open_disabled_mixed` | Pick products of one customer to publish them. | Yayınlamak için tek bir müşterinin ürünlerini seçin. |
| `ops.amazon.bulk.summary` | {submitted} of {total} submitted | {total} üründen {submitted} tanesi gönderildi |
| `ops.amazon.submission.kind.create` | Create | Oluşturma |
| `ops.amazon.submission.kind.update` | Update | Güncelleme |
| `ops.amazon.submission.kind.delete` | Remove from Amazon | Amazon’dan kaldır |
| `ops.amazon.submission.kind.unknown` | Other | Diğer |
| `ops.amazon.submission.status.accepted` | Accepted | Kabul edildi |
| `ops.amazon.submission.status.invalid` | Rejected | Reddedildi |
| `ops.amazon.submission.status.processing` | Processing | İşleniyor |
| `ops.amazon.submission.status.done` | Done | Tamamlandı |
| `ops.amazon.submission.status.failed` | Failed | Başarısız |
| `ops.amazon.submission.status.unknown` | Unknown | Bilinmiyor |

### Glossary terms, page guides and system guide (28)

| key | EN | TR |
|---|---|---|
| `glossary.listing_state.draft` | Required Amazon fields are still missing. | Zorunlu Amazon alanları hâlâ eksik. |
| `glossary.listing_state.ready` | All required Amazon fields are filled; the listing can be published. | Zorunlu Amazon alanlarının hepsi dolu; liste yayınlanabilir. |
| `glossary.listing_state.submitted` | Sent to Amazon; waiting for Amazon to process it. | Amazon’a gönderildi; Amazon’un işlemesi bekleniyor. |
| `glossary.listing_state.live` | Amazon lists the product and it can be bought. | Amazon ürünü listeliyor ve satın alınabiliyor. |
| `glossary.listing_state.issues` | Amazon reported problems that must be fixed. | Amazon düzeltilmesi gereken sorunlar bildirdi. |
| `glossary.api_connection.none` | The customer has not connected an Amazon account. | Müşteri bir Amazon hesabı bağlamamış. |
| `glossary.api_connection.connected` | The customer’s Amazon account is connected. | Müşterinin Amazon hesabı bağlı. |
| `glossary.api_connection.revoked` | The customer withdrew the authorisation; connect again to continue. | Müşteri yetkiyi geri çekti; devam etmek için yeniden bağlayın. |
| `guide.pages.customer.tasks.connect_amazon.title` | Connect the Amazon account | Amazon hesabını bağla |
| `guide.pages.customer.tasks.connect_amazon.steps.1` | Open the customer, then the Platforms tab. | Müşteriyi, sonra Platformlar sekmesini açın. |
| `guide.pages.customer.tasks.connect_amazon.steps.2` | Press Connect Amazon on the Amazon account and give consent as the seller. | Amazon hesabında Amazon'u bağla'ya basıp satıcı olarak izin verin. |
| `guide.pages.customer.tasks.connect_amazon.steps.3` | The tab shows Connected with the seller ID; publishing is possible from then on. | Sekme satıcı kimliğiyle Bağlı gösterir; bundan sonra yayınlama yapılabilir. |
| `guide.pages.product.tasks.fill_amazon.title` | Fill in the Amazon content | Amazon içeriğini doldur |
| `guide.pages.product.tasks.fill_amazon.steps.1` | Open the product, then the Amazon tab, and choose the [[productType]]. | Ürünü, sonra Amazon sekmesini açın ve [[productType]] seçin. |
| `guide.pages.product.tasks.fill_amazon.steps.2` | Fill the fields marked Required; the counter shows how many are left. A parent product also needs its [[variation_theme]]. | Zorunlu işaretli alanları doldurun; sayaç kaç alanın kaldığını gösterir. Ana ürün için ayrıca [[variation_theme]] gerekir. |
| `guide.pages.product.tasks.fill_amazon.steps.3` | Save the Amazon content; the market cell shows what is still missing. | Amazon içeriğini kaydedin; pazar hücresi nelerin eksik kaldığını gösterir. |
| `guide.pages.market_matrix.tasks.publish_amazon.title` | Publish a cell on Amazon | Hücreyi Amazon'da yayınla |
| `guide.pages.market_matrix.tasks.publish_amazon.steps.1` | Open an Amazon cell and press Check; fix the missing fields it links to. | Bir Amazon hücresini açıp Kontrol et'e basın; bağlantı verilen eksik alanları düzeltin. |
| `guide.pages.market_matrix.tasks.publish_amazon.steps.2` | When the cell is ready, press Publish on Amazon; Amazon answers with a [[submissionId]]. | Hücre hazır olunca Amazon'da yayınla'ya basın; Amazon bir [[submissionId]] ile yanıt verir. |
| `guide.pages.market_matrix.tasks.publish_amazon.steps.3` | Watch the state move to Live, or open the issues and fix each one in the Amazon tab. | Durumun Yayında'ya geçmesini izleyin ya da sorunları açıp her birini Amazon sekmesinde düzeltin. |
| `system_guide.sections.amazon.title` | Amazon listing | Amazon listing |
| `system_guide.sections.amazon.intro` | Amazon's own words, as they appear in its messages and in the Amazon tab. | Amazon'un kendi terimleri; mesajlarında ve Amazon sekmesinde göründükleri gibi. |
| `terms.product_type.short` | Amazon's category of a product, for example LUGGAGE. It decides which fields Amazon asks for. | Amazon'un bir ürün için kullandığı kategori, örneğin LUGGAGE. Amazon'un hangi alanları isteyeceğini belirler. |
| `terms.product_type.long` | Amazon describes every product type with its own schema, and the Amazon tab shows exactly those fields. Pick it once per product; if Amazon changes the schema the values you entered are kept and the missing fields are recomputed. It is filled in before a cell can be published ([[S05]]). | Amazon her ürün tipini kendi şemasıyla tanımlar; Amazon sekmesi tam olarak bu alanları gösterir. Ürün başına bir kez seçilir; Amazon şemayı değiştirirse girdiğiniz değerler korunur, eksik alanlar yeniden hesaplanır. Hücre yayına alınmadan önce doldurulmalıdır ([[S05]]). |
| `terms.submission_id.short` | The ID Amazon gives to one submission of a listing. | Amazon'un bir listing gönderimine verdiği kimlik. |
| `terms.submission_id.long` | Every Publish, Update or Remove creates one submission, and Amazon answers with this ID. The panel polls Amazon with it until the submission is done or has issues; it is also what Amazon support asks for when something looks wrong. | Her Yayınla, Güncelle veya Kaldır bir gönderim oluşturur ve Amazon bu kimlikle yanıt verir. Panel, gönderim bitene ya da sorun çıkana kadar bu kimlikle Amazon'u yoklar; bir şey ters giderse Amazon desteği de bunu sorar. |
| `terms.variation_theme.short` | How the children of a parent product differ, for example by size or colour. | Bir ana ürünün alt ürünlerinin birbirinden nasıl ayrıldığı, örneğin beden veya renk. |
| `terms.variation_theme.long` | Set on the parent product of a variation family. Every child must then carry the matching attributes (such as size or colour) and the parent link, or Amazon refuses the listing. The panel marks them as missing in the Amazon tab. | Varyasyon ailesinin ana ürününde belirlenir. Her alt ürün buna uyan alanları (beden, renk gibi) ve ana ürün bağlantısını taşımalıdır; yoksa Amazon listing'i reddeder. Panel bunları Amazon sekmesinde eksik olarak işaretler. |

## Follow-ups for the owner

- **Review the Turkish copy above** (and the English wording, for example "Remove from Amazon" for the delete action); send corrections and they are applied in one pass.
- **Developer profile and production app:** the production app is a second app created after Amazon approves the developer profile (a sandbox app does not become the production app). It must be public, with the Product Listing role only; decide the Appstore question before the 25-seller cap bites.
- **Production environment:** set `AMAZON_SPAPI_ENV=production` explicitly (an unset value fails closed, see A1), plus `AMAZON_SPAPI_REGION=eu`, the app id, a state secret of at least 32 characters, `APP_URL` and `PUBLIC_SUPABASE_URL`; register the redirect URI `<PUBLIC_SUPABASE_URL>/functions/v1/amazon-auth/callback` in the Amazon app.
- **Hosted Vault secrets:** `select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'edge_function_url');` and the service key as `edge_service_key`; without them the cron helper logs `amazon_cron_unconfigured` and does nothing. Details in the Amazon (M22) section of `supabase/README.md` (Task 13).
- **Production push:** production is still at 027; the push must carry 046 and 047 (and 048 if the group-order fix ships as a migration) together with everything between. The M21 caveats (order, locks) are in `m21-transfer-backlog.md`.
- **Add `AMAZON_SPAPI_SELLER_ID`** to your local `supabase/functions/.env` if you want a real seller id instead of the `SANDBOX_SELLER` placeholder.
- **Delete the stray empty file `A:\tmp_probe_x.ts`** (outside the repo, left by Task 3; the safety check blocked its removal).
- **Decide** whether a listing turning to `issues` should open an incident automatically (v1: no).
- **First real seller:** run the consent flow once with a real seller and `version=beta`, then one publish in production; this is the only way to confirm the real checksum format, schema size and the `variation_theme` `name` key.
- **Story seed (Task 12):** the LUGGAGE definition is seeded for DE/FR/IT/ES/NL; THO-MOP40-2P carries the fixture attributes and `variation_theme`; the two issue messages (90220, 90000900) are hand-written in Amazon's style. Review them with the other Turkish/English copy.
- **Local setup (Task 13):** `supabase/README.md` has an "Amazon (M22)" section; `pnpm dev:amazon-probe` checks the credentials. One full `pnpm test` run had 2 flaky failures under load; two reruns were green.
