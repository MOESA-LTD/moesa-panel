# Development story seed: rulings, deferred findings and owner follow-ups

Branch: `feat/dev-story-seed` (base `d1a6fe7`, on `feat/m21-transfer` d8606fd; plan `docs/superpowers/plans/2026-11-06-dev-story-seed.md`, spec `docs/superpowers/specs/2026-11-06-dev-story-seed-design.md`). 11 tasks: pipeline (Task 1), story steps 02-10 (Tasks 2-10), README, guide coverage and full verification (Task 11). Every task went implementer -> task review; only Task 8 needed a fix round (one, scoped re-review approved). Ledger: `.superpowers/sdd/2026-11-06-dev-story-seed/progress.md`; pre-flight scan (56 rows): `preflight.md` in the same folder.

## Status

Branch `feat/dev-story-seed` (stacked on the M21 branch, PR #102). All 11 tasks complete and task-reviewed; Task 11's verification: `pnpm dev:seed-story` ok (139 checks) on a fresh reset, `pnpm test:scripts` green, `pnpm test:db` 616 pgTAP PASS on the small seed, `pnpm dev:supabase-reset` end to end with `database.types.ts` unchanged, browser walk 15/15 (every dashboard box, the Media page thumbnails, the Europe KRN pending-files notice, the refused-move situations). The final whole-branch review approved with no Critical or Important findings (the script cannot reach a non-local database; the single transaction holds; every rules bypass is a sanctioned one; `seed.sql`, `config.toml`, pgTAP and CI untouched; the story stays loadable after `spec_sheet_required_from`). One fix wave of six commits followed: the check's "today" pinned to the story's run date, the PostgREST toast title bug in the app (`errors.request_failed`), a node test tying the `guide.page` list to `GUIDE_PAGES`, a localhost-only guard on the API URL, `test:scripts` in CI, the attributes file marked text, README failure notes, a spec sentence corrected. After it: vitest 953, typecheck clean, lint 0 errors, pgTAP 616 PASS.

Reached before Task 11 (last committed state 1769540): Tasks 1-10 approved by review; `pnpm dev:seed-story` ends `ok (136 checks)`; `pnpm test:db` unchanged at 616 tests in 33 files (the pgTAP suite still sees only the small seed); `pnpm test:scripts` 6 of 6.

## Rulings made while the owner was away

Planner decisions (accepted before Task 1):

1. **The whole story runs in one `psql --single-transaction`.** A failed run leaves no rows and the KRN guard stays false, so the next run can go again. Uploads use `upsert: true`.
2. **Gate passes that need a PO's PI run in the PO task** (variant G3, reorder G3, cones G3-G5), after the orders exist. Task 4 passes only the gates without a PI rule.
3. **MOP40-3P and CONES-100 get signed specs** because the G2 rule demands a signed or approved spec for every project product. Draft specs go on THO-TIPS-6-50 and THO-MOP60-2P.
4. **PO-001 "missing spec" uses THO-MOP40-4P**, not BRUSH-1: `private.po_line_needs_spec` is false for a paused product before 2026-12-31.

Pre-flight rulings (P1-P10, from the 56-row scan of the plan against the migrations):

5. **P1: shipment 09 links to the closed PO 09 under the bypass flag.** The link guard honours the flag; in story time the PO closed after the dispute. Cost if wrong: a check fails at step 06.
6. **P2: step 02 writes the customer rows before any document**, so the audit transaction's `table_name` is `customer`.
7. **P3: closing CLS as baris gets its own `story_begin`/`story_end` pair** (one more audit transaction).
8. **P4: supplier documents never cite customer-owned media** (`media_customer_mismatch` is certain). The CN1 certificate cites a shared media PDF (customer NULL), so there are 12 media rows, not 11.
9. **P5: `dates.weekday` pins "every business-day deadline falls on isodow < 6"** (s2 notice due dates, the document-request deadline, the normal CR decision dates) instead of the brief's query.
10. **P6: `core.bypass_off` is the last DO block of the story**, asserting the flag is not `'1'` in the same transaction; the check file has no copy of it.
11. **P7 as adapted in Task 4: `story_pass_gate` completes exactly the tasks the guard counts** (blocking, phase up to the gate, `todo`) and raises on `doing`/`blocked`. `blocks_gate` is a boolean, so the literal ruling ("tasks whose `blocks_gate` equals the gate") could not be followed. The story's task states (overdue, due soon, blocked, doing, unassigned) sit on non-blocking P3 tasks and survive every pass.
12. **P8: every `private.story_*` parameter is prefixed `p_`; every inserting helper takes `p_id uuid` first** (fixed UUIDs `5eed00NN-...`).
13. **P9: the transfer decision loop exists once, in step 10.** The check asserts the stored transfer row (mode copy, `files_status` pending, every gtin conflict `clear_gtin`) instead of re-deriving decisions.
14. **P10: no reliance on AND short-circuit**; plpgsql IF/CASE only.

Rulings during the run:

15. **Fictional `.test` supplier-contact domains (`@kutlu.test`, `@bte.test`) are fine under K8**; the ruling named only the two customer domains, it was not exhaustive (Task 2).
16. **Lines of products without a signed spec stay uncited** (THO-TIPS-6-50 draft only, THO-CONES-200): the rule is not in force before 2026-12-31. `m7.spec_cited` covers lines whose product has a signed spec (Task 5).
17. **The cones project's G5 pass and its close moved from step 05 to step 06**, evidenced by the signed delivery receipt of an accepted shipment (11) on PO-009. Otherwise the closed project would keep a permanent G5 warning. Cost: one more shipment row.
18. **Shipment 07's dispute deadline is T+3 days** (the plan said T+1 day): the 2-day-margin rule for time-based states wins. Shipment 07 is delivered 1 day ago, so the deadline is 3 days ahead.
19. **Closed incidents have `closed_on` = today and CR-002 has `created_at` = now** (Task 8). Both columns are guard-owned and immutable even under the bypass; test 038 lives with the same limit.
20. **PO-11's PI stays v1 approved and gains a media next to its URL** (kind "both"). A v2 would supersede the PI of a locked order and break `m7.pi_approved` (Task 9).
21. **The Media page browser check moved from Task 9 into the Task 11 walk.** Task 9 verified the thumbnail only with curl (200, image/webp).
22. **`files_pending` is probed as baris (owner of both companies) moving Europe's KRN onward to Trading.** akif on the same path meets `transfer_owner_required` first; both situations are in the story (Task 10).
23. **Task 1 tooling choices accepted:** `psql --single-transaction -f -` (psql ignores the flag on plain stdin); a shell only for `supabase` on win32 (constant args; npm-installed `.cmd` needs it), none for docker; `supabase/seed_files/.gitattributes` `* binary` so autocrlf cannot corrupt the PDF xref offsets; root `.gitattributes` `text eol=lf` for both story SQL files.
24. **The plan's "Calls made here" 1-7 stand** (single transaction, feed backdating folded into each step with bands 40/35/25/5/1/3/0/30 days and step 10 untouched, PI gates in Task 5, spec documents forced by G2, PO-001 on MOP40-4P, `transfer_owner_required` reproduced through `private.transfer_refusal`, M19 thumbnail layout).

## Deferred minors

### Not fixed (cosmetic, harmless or by design)

- Task 3: `seed_story.sql` step 03 mixes UUID variables (`v_p01/03/04/08`) and inline literals (`02/05/06/07/09`).
- Task 4: the plan text is stale. Its Interfaces line (~401) and the Task 5 calls (~522-524) still show the 4-argument `story_pass_gate`; the code has `(p_id, p_project_id, p_gate, p_passed_at, p_evidence)`. Plan drift only.
- Task 5: `story_po_walk` counts `ok` values over any key and skips the `pi_line_total` check; the guard counts keys '1'..'30'. Today's input is equivalent, the mirror is looser.
- Task 5: PO-05 (created D-24) and PO-09 (created D-110) are created before their project's G2 (D-15 and D-100). No rule is broken; a timeline nit.
- Task 6: `story_shipment_walk` re-implements the guard's checks under the bypass, although `shipment_guard` has no date rules; it could run with the bypass off (pre-setting 09's deadline) and drop the duplicate logic.
- Task 6: the `damage_notice_hours` lookup in the walk has no tenant filter (the guard's has). Harmless for fixed story ids.
- Task 7: `story_cell` applies `launched_on` only on entering `live`; a value passed on a non-live path is ignored (documented in the helper).
- Task 8: `management_notified_at` (opened + 1 h / 30 min) can still pass its due time near midnight UTC; no check compares it to the due time. Only `customer_notified_at` got the `least()` fix.
- Task 9: documents 205 and 207 carry `issued_on` 3 and 2 days ago while step 09's feed rows are 30 days old, so the activity feed reads oddly.
- Fix-wave re-review: the `feed.*` checks still use `now()::DATE - created_at::DATE` instead of `pg_temp.today()`; a midnight crossing could shift them by a day, but the band margins (> 7, 2–7) make it unlikely.
- Final review: the KRN guard stops a second run but not a hand-edited database; that case fails loudly at the code-pattern checks, so it is acceptable.
- Final review: the bypassed PO/shipment walks re-check the guard's rules by hand, so they are not a regression net for NEW transition rules added later; the smoke checks are.
- Task 1: a failed story run leaves the uploaded Storage objects behind and `supabase db reset` does not clear Storage (see limitations).

### Known limitations of the story data (accepted, not bugs)

- Closed incidents 03 and 07 show `closed_on` = the seed day, although 03 was opened 60 days ago (ruling 19).
- CR-002 (`created_at` = now) and every `media`/`document` row (`created_at` = now) are not backdated; only the audit feed is, step by step.
- Step audit ages versus row dates: each step has one audit transaction backdated by the step's band (steps 04-06 and 09 especially), while gate `passed_at` values reach back 80 days and documents are dated recently. The feed shows "5 days ago" for a gate passed 60-80 days ago.
- The transfer row and Europe's copied KRN rows get RPC-generated UUIDs; they change on every reset. The checks find them by customer.
- Europe's KRN keeps `files_status = 'pending'` for good: no file-copy client runs in the story. Calling `transfer_check_files` would flip it to `partial` because the target paths hold no Storage objects.
- GTIN 4260696025930 is unused (validated in the loop only, then reported).
- PO-009 (2000 pcs, no tolerance) is split over two shipments: 11 accepted 1500 (G5 evidence) and 09 disputed 500, because of the line cap. The plan had 09 carry all 2000.
- PO-009 is closed 5 days ago while shipment 09 on it was delivered 4 days ago (ruling 5).
- Shipments 03, 06 and 07 carry goods of PO-006 while it is still `in_production`; no guard rule forbids it.
- Incident 03 (OL-09) sits on shipment 06 and 04 on shipment 07 as in the brief; there is no OL-08.
- The PO and shipment walks (and the links to the closed PO) run under `story_bypass` for the backdated status moves; gate passes, incidents, CRs, cells, media and the transfer go through the real guards with the flag off.
- The big-PDF edge file is 12 MiB of padding after `%%EOF` (in memory only, never on disk); strict readers that read the last 1 KB may need xref recovery. Fine for its purpose (the 5 MB Trading cap versus the 25 MB LTD cap).
- Re-running the checks more than about 24 hours after seeding can flip the time-based states (shipment dispute windows, `m8.dispute_running`), by design of the relative dates.
- `supabase db reset` clears no Storage objects; a rerun overwrites them (`upsert`), stale folders remain.

## Deliberately out of scope

- Changing `seed.sql`, the pgTAP suite or CI; the story is development-only (spec non-goal).
- Loading the story into the staging project (Cloudflare previews); it would need a secret and the owner's go (spec non-goal, open question below).
- Real customer data: KRN and the stubs are fictional; THO keeps only what the small seed says.
- New users or tenants: the cast stays as `seed.sql` defines it. This also drops the `transfer_source_read_only` situation (it needs a second company owned by selin and ops roles in Eski Ticaret, and `seed.sql` has already expired Eski).
- New schema: no `valid_until` on documents (an old `issued_on` plays the expired certificate), no new tables, no new settings.
- Production or demo-presentation polish: the sample files are placeholders (generated, under 500 KB each, license-free).
- Switching rules off wholesale (`DISABLE TRIGGER` everywhere, raw final-status inserts) is an anti-goal. The only trigger toggle is the sanctioned `change_request_due` one for CR-002, as test 038 does; the bypass flag is used only where listed above.
- Hard-coded year-dependent codes (`PO-THO-2026-001`) in documents, checks or the app: codes are found by fixed id.
- A client that copies the transferred files (hence the pending-files situation stays).

## Copy for owner review

The story is Turkish-flavoured developer drafts; none of it has been read by a native reviewer. Source: `supabase/seed_story.sql` (line numbers at commit 1769540; Task 11 may shift them). The panel's own i18n files are untouched.

### Invented companies, people and domains

| what | text | line |
|---|---|---|
| customer KRN | Kernhaus Living GmbH (Austria, brand "Kernhaus") | 141 |
| customer LEA | Leafline Garten GmbH | 143 |
| customer PAU | Paxton Haushalt GmbH | 145 |
| customer CLS | Clearstar Handel GmbH | 148 |
| KRN contact | Kernhaus Einkauf, role Einkauf, einkauf@kernhaus.test | 152 |
| THO contacts | Thometzki Operations / Lager / Buchhaltung (roles Operations, Lager, Buchhaltung), `@thometzki.test` | 173-175 |
| supplier CN3 | Ningbo Clean | 189 |
| supplier TR3 | Demir Tekstil (Türkiye) | 190 |
| TR1 contact | Kutlu Satis (role Satis), satis@kutlu.test | 193 |
| CN1 contacts | BTE Sales, BTE Quality, `@bte.test` | 194-195 |
| TR1 terms (English) | "Free for 30 days, then 0.50 EUR per pallet and day"; "1 percent of the open amount per week of delay" | 200-201 |
| THO field | eu_responsible_person "MOESA Europe, EU responsible person"; restricted_drive_url example link | 168 |
| warehouses | Rhenus 3PL (Hamburg), FBA DE, Wien | 178-179 |
| brand | OKAEI Pro (pending) | 185 |

### Product names (Turkish drafts)

| SKU | name | line |
|---|---|---|
| THO-MOP40-3P | Pamuk mop bezi 40 cm, 3'lü | 272 |
| THO-MOP40-4P | Pamuk mop bezi 40 cm, 4'lü | 275 |
| THO-MOP60-2P | Pamuk mop bezi 60 cm, 2'li | 276 |
| THO-TIPS-6-100 | Aktif karbon filtre 6 mm, 100'lü | 278 |
| THO-CONES-200 | Cones 200'lü | 280 |
| THO-BRUSH-1 | Temizlik fırçası | 282 |
| THO-MOP40-2P-OLD | Pamuk mop bezi 40 cm, 2'li (eski) | 285 |
| KRN-VASE-01 / 02 | Seramik vazo, 24 cm / 32 cm | 286-288 |

### Project titles

| text | line |
|---|---|
| OKAEI fırça private label | 426 |
| MOP40 3'lü varyant | 428 |
| Karbon filtre tekrar siparişi | 430 |
| CONES-100 ambalaj revizyonu | 432 |
| Cones ilk sipariş | 434 |
| Mop 60 iptal | 436 |
| THO lojistik Q1 | 438 |
| Konsept vazo (KRN) | 440 |
| CLS eski proje | 442 |

### Purchase order and shipment texts

| what | text | line |
|---|---|---|
| payment note | Navlun (freight) | 734 |
| PO-006 production updates | "Aktif karbon dolumu başladı, ilk 800 adet hazır"; "Dolum %70, ambalaj malzemesi depoda" | 743-744 |
| SHP-005 events (4) | "Booking teyidi ve yükleme tarihi alındı"; "Konşimento ve ETA müşteriye iletildi"; "Aktarma limanında gecikme bildirildi"; "Yeni ETA belirsiz, müşteri bilgilendirildi" (parties Forwarder / MOESA / Müşteri, channels e-mail / telefon) | 968-974 |

### Market cell notes

| cell | text | line |
|---|---|---|
| 02 FR yellow | "Fransa için ambalaj geri dönüşüm işareti doğrulanacak" | 1045 |
| 05 NL suppressed | open issue "OA-06: ilan platform tarafından askıya alındı, eksik ürün bilgisi bekleniyor" | 1060 |
| 07 IT stopped | "Düşük satış nedeniyle bu pazarda durduruldu" | 1071 |
| 09 PL candidate red | "Polonya için gerekli uygunluk belgesi yok, pazar kapalı" | 1081 |
| 11 removed | "Otto satış koşulları uygun değil, hedeften çıkarıldı" | 1087 |

### Incident titles, descriptions and notes

| incident | title and text | lines |
|---|---|---|
| 01 OL, s1 open | "Tır depoda kabul edilmedi"; "Rosbach deposu randevusuz gelen aracı geri çevirdi; yük araçta bekliyor."; reported by "Forwarder operasyon (telefon)", state "Araç depo önünde bekliyor" | 1191-1193 |
| 02 supplier damage | "Teslimatta hasarlı koliler"; "Hava kargo teslimatında koliler ezik geldi; teslim tutanağına hasar notu düşüldü."; "Müşteri deposu (e-posta)"; "Hasarlı koliler ayrıldı, fotoğraflandı"; deadline task "Tedarikçiye hasar bildirimi"; log "Taşıyıcı sigortasına hasar dosyası açıldı." / "Taşıyıcı sigorta birimi (e-posta)" / "Hasar bedeli sigortadan karşılanacak" (350 EUR); state "Hasarlı koliler ayrıldı, sigorta süreci sürüyor" | 1198-1213 |
| 03 OL-09, closed | "Eksik koli"; "Gümrük sayımında iki koli eksik çıktı."; "Gümrük müşaviri (e-posta)"; root cause "Koliler aktarma limanında başka bir konşimentoya yüklenmiş"; preventive "Aktarmalı sevkiyatlarda koli sayısı her aktarmada teyit edilecek" | 1217-1224 |
| 04 OL-09, open repeat | "Eksik koli (tekrar)"; "Kara yolu teslimatında bir koli eksik sayıldı."; "Müşteri deposu (e-posta)" | 1229-1230 |
| 05 OT-04, G3 rollback | "PI tutarsızlığı"; "Tedarikçinin PI toplamı sipariş tutarından farklı; onaylı varyant fiyatları da etkileniyor."; "Satın alma (e-posta)"; action "Siparişler PI düzeltilene kadar bekletiliyor"; rollback reason "PI tutarsızlığı (OT-04)" | 1234-1242 |
| 06 OA, document request | "Platform belge talebi"; "Platform, askıdaki ilan için ürün uygunluk belgesi istedi."; "Satıcı paneli bildirimi"; deadline task "Platforma belge yükleme" | 1249-1252 |
| 07 OT, closed | "PSI sapması"; "Sevkiyat öncesi denetimde filtre ölçüleri toleransın dışında çıktı."; "Denetim firması (rapor)"; action "Sapmalı parti ayrıldı, yeniden üretim istendi"; root cause "Kalıp aşınması fark edilmemiş"; impact "Partinin bir kısmı indirimli satıldı"; preventive "Her üretimde ilk numune ölçü raporu istenecek" | 1256-1267 |
| 08 OM, unclassified | "Müşteri talebi netleşmedi"; "Müşteri pilot kapsamını toplantıda değiştirmek istedi; konu henüz sınıflandırılmadı."; "Koordinatör (toplantı)" | 1272-1274 |

### Change request texts

| CR | title / before / after / reason and notes | lines |
|---|---|---|
| 11 | "Koli baskısı ve etiket tasarımı"; "Tek renk koli baskısı"; "İki renk baskı, yeni logo"; "Müşteri marka yenilemesi"; cost impact "Baskı kalıbı ek maliyeti" | 1278-1279 |
| 12 | "Teslim tarihinin öne alınması"; "Mevcut teslim planı"; "Teslimin bir hafta öne alınması"; "Sezon başlangıcı öne çekildi" | 1284 |
| 13 | "Fırça kıl sertliği ve ürün metni"; "Orta sertlik"; "Sert kıl, ürün metninde belirtilecek"; "Müşteri geri bildirimi"; quality impact "Numune yeniden onaylanacak"; listing impact "Ürün metni güncellenecek"; decision note "Müşteri yazılı onayı ile kabul edildi" | 1292-1300 |
| 14 rejected | "Tedarikçi fiyat artışı"; "Birim fiyat 1,90 USD"; "Birim fiyat 2,10 USD"; "Hammadde maliyeti arttı"; cost impact "Birim başına 0,20 USD"; decision note "Sözleşme fiyatı yıl sonuna kadar geçerli; artış kabul edilmedi" | 1305-1307 |
| 15 applied | "Etikette geri dönüşüm işareti"; "Etiket v1"; "Etiket v2, geri dönüşüm işaretli"; "Ambalaj mevzuatı" | 1312 |

### Media titles (12)

Mop 40 cm, 2'li paket: ana görsel / detay; Üretim hattı fotoğrafı; Teslimatta hasarlı koliler; Proforma fatura (PDF); Ambalaj baskı dosyası; Uç seti kullanım videosu; Kullanılmayan çekim; Ortak katalog fotoğrafı; Vazo: ana görsel; Ürün kataloğu (yüksek çözünürlük); Tedarikçi sertifikası (PDF). Lines 1386-1397.

## Follow-ups for the owner

- **Review the Turkish and invented texts above** (project titles, incident and CR descriptions, cell notes, product and media names, the four invented customers and the invented suppliers). They are developer drafts; the spec lists this review as open. Send corrected wording and the seed can be edited in one pass.
- **Staging:** decide whether the story should also load into the staging project for Cloudflare previews (spec non-goal). It would need a secret in the CI `staging` job and your go.
- **Run it once on your machine:** `supabase db reset`, then `pnpm dev:seed-story` in `app/` (needs Docker; it refuses if KRN already exists). The README written in Task 11 (`supabase/README.md`) describes the command, the reset order and the refused-move probes.
- **Dev-only data:** the story lives in the local database only; nothing is pushed to production. The production `supabase db push` caveats of M21 (migration order, locks) are unchanged and are listed in `m21-transfer-backlog.md`.
- **Time-based states** (dispute windows, overdue and due-soon boxes) are relative to the seed day: reseed after about a day if a dashboard box looks empty.
