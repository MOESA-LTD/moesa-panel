# Faz 2c (M9 pazar matrisi + M10 olay/CR + M20 sayfa rehberleri): ertelenen bulgular ve kararlar

Dal: `feat/phase2c-matrix-incidents-guides` (taban `6225c44`, Faz 2b üzerine). 14 görev; her görev uygulayıcı → görev incelemesi → düzeltme turu → kapsamlı yeniden inceleme döngüsünden geçti. Final dal incelemesi ve kabul yürüyüşü sonuçları en altta.

## Sahip kararı / dikkat gerektirenler

- **TR metinler**: 13 sayfanın rehber metni (amaç, görev başlıkları, adımlar), sözlük satırları, olay/CR durum etiketleri ve dashboard kutu adları geliştirici okumasıyla girildi; spec M20 TR'yi sahibin gözden geçirmesini ister. Kaynak: `app/src/plugins/i18n/locales/tr.json` altında `guide.pages.*`, `glossary.*`, `ops.incident.*`, `ops.change_request.*`, `ops.market.*`, `dashboard.ops.*`.
- **Y10 olay tipleri**: 42 tipin EN adları uygulayıcının çevirisi (`INCIDENT_TYPES`); TR adları Y10'dan.
- `contained` durumunun adı ve anlamı; OU aile etiketi; yeşil uyum ve Pan-EU sözlük satırları.
- Taşıyıcı hasar talebi varsayılanı 7 gün (CMR kara yolu); tedarikçi hasarı 48 saat; platform eskalasyonu 48 saat; belge talebi `document_request_days` iş günü.
- S2 "aynı iş günü" bildirimi UTC 23:59:59 olarak hesaplanıyor; S1 kapanışı şirket güncelleme hakkına (yönetim) bağlı.
- Şiddeti S1/S2'den aşağı çekmek yönetim hakkı ister (`incident_severity_downgrade_requires_management`); UI yalnız uyarır, DB reddeder.
- Olay kodu `<AİLE>-<MÜŞTERİ>-<YIL>-<NNN>` (K5); S17'nin `OLAY-yyyy-nnn` biçimi klasör adı olarak kalır.
- CR: müşteri onayı yalnız etkilenen kapı geçmiş bir (M) kapı ise zorunlu; karar tarihi 5 iş günü (acil: ertesi gün); talep başına tek etkilenen belge; "uygulandı" o belgenin daha yeni sürümünü ister. Onaydan sonra müşteri onay alanları boştan değere girilebilir, değiştirilemez/silinemez.
- Pazar hücresi: kırmızı uyum `planned` ve sonrasını engeller; `suppressed` açık sorun ister; `closed/removed` not ister; yalnız `candidate` silinir. `launched_on` payload ile temizlenemiyor (tasarım).
- Mevcut hücrede öncelik ve proje düzenlenebilir kalıyor (kabul edildi).
- Rehber paneli: PrimeVue 4.5.1 `Drawer` klavye odağını içeride tutuyor (prop/pt ile kapatılamıyor); fare ile sayfa kullanılabiliyor. Düz sabit `<aside>` ile değiştirmek istersen küçük bir iş.
- Rehber otomatik açılışı `localStorage` `guide.dismissed` altında tek bir `{ [route]: true }` objesiyle bir kez (sahip kararı 2026-11-05, rota başına anahtar yerine); bozuk JSON "hiçbiri gösterilmedi" sayılır; ayrı "bir daha gösterme" anahtarı yok. Hesap/şube/yönetici sayfalarında rehber yok (M20 "iş sayfası").
- Dashboard pazar kutusu yayında 0 olsa da hedefli müşterileri listeler (`CountListCard.empty` prop'u).
- DatePicker'a elle yazılan 10 ve üzeri günler yanlış kaydediliyor (Faz 1 genelinde); gerçek veri girişinden önce düzeltilmeli (2b backlog'unda da var).
- Üretim: `supabase db push` ile 034–038 uygulanır (028–033 hâlâ bekliyor); rol izinleri migrasyonlarda.
- Bu planda yok: S05/S08/S17 CSV/PDF dışa aktarımı; S03 aylık rapor satırları; olay maliyet toplamları (para birimi başına); `case_ref` (Faz 3, K8); tatil takvimi; itirazlı sevkiyattan otomatik olay; yeniden sipariş noktası kutuları.

## Ertelenen küçük bulgular

- Task 1: back route for a tab URL loaded directly lands on `ops` not the list; tests use synthetic records; tab taken from the leaf name; project card's tab reading unconfirmed.
- Task 2: missing product without customer_id → 23502 not the FK mapping; '' passes reason/note rules (forms send NULL); coverage gaps (stopped final, removed/stopped without notes, bypass insert, other-tenant product); dead INSERT branch in the guard.
- Task 3: payload casts hide key typos; product FK message always "another customer" (also for a missing product); useMarketCells query key untested; cell list unordered.
- Task 4: CellsAdd `:dirty="ready"` couples the reset button; CellUpsert.vue 409 lines; #empty slot may flash under the loading overlay; error line only in the empty slot; Index.vue isPending/isError wiring untested; route test mutates the shared ability without reset.
- Task 5: closure columns settable on INSERT and rewritable after close; incident_child_guard row_tenant from NEW for both ids; 016 no longer covers the "table does not exist" branch of document_check_entity; linked-record customer match checked on insert/link change only; extra rollback index; 036 header line too long.
- Task 6: step 2 runs on every write; CREATE TYPE without idempotency guard; server-set resets and the result-document check sit after the bypass return (intended); widened immutable_field copy only in en/tr; no pairing rule between customer_approval_document_id and customer_approved_on; CR fixtures use `approved` documents.
- Task 7: change_request_document_invalid always maps to affected_document_id; useSetChangeRequestProducts not atomic, invalidates only onSuccess; useIncidentEntityOptions per-type queries untested; incidentStatusHints assumes open when status omitted; immutable_field copy wording; deadline payload cast.
- Task 8: unused INCIDENT_OVERVIEW query on the card; GatePanel no_incident hint shows while loading and the picker query runs for every panel; frozen `now` in Deadlines/General; changing customer keeps the linked record; shared stateKey between list and embedded table; General.vue ~370 lines; useTableMeta gained optional sortOrder.priority.
- Task 9: restored draft naming another document leaves the record picker empty; a saved document whose record is not on the request is cleared on open and dirties the form; PO packing picker and the CR Decision-tab approval picker now show the document type prefix; four more in task-9-review.
- Task 10: incident order within a severity unspecified; `overdue`/`customer_notice_late` compare against UTC now()/current_date (033 backlog); pgTAP disables `change_request_due` for one back-dating update; five more in task-10-review.
- Task 11: value test lacks a checked>0 guard.
- Task 12: route watcher lives in the page-header view (routes without it, e.g. `error`, leave an open panel open); `useGuideStore()` resolved inside the click handler; `#page-toolbar` shares a wrapper span with the "?" button; four more in task-12-review.
- Task 13: settings-page role hand check done in Task 14 only; `page()` helper removed.
- Task 14 (walk): the open guide panel covers the topbar customer selector (close it to change the customer); two walk preconditions (P1 tasks done, `live_cell_count`) were set/read through REST because no screen shows them; the Phase 1 route-dialog restore sometimes brings back old dialogs on reload (a blank new-incident card, a project card twice).
- Task 14 (out of plan, Phase 1): with browser storage blocked (private window) the app does not start — unguarded `localStorage` reads at startup in `plugins/i18n` (`app_lang`), `store/theme`, `store/auth` (`tenant-scope`), `store/customerFilter`, `Login.vue`. The guide store itself is guarded. Fix before real use on locked-down browsers.

## Koordinatör kararları

- Ruling: T3 adds `market_cell` and `change_request` to `DOCUMENT_ENTITIES` with en/tr labels so typecheck stays green (change_request's table lands in T6).
- Ruling: top-level record cards open with `select` (module convention) — cell edit route no longer requires modify.
- Ruling: the gate pass branch clears `rolled_back_incident_id` and `rolled_back_reason` (overrides the "032 body unchanged" pin for that line).
- Ruling: lowering severity from s1/s2 needs the management right.
- Ruling: `result_document_id` customer check applies whenever set; approval/closure columns server-set; created_at immutable; decision_due_on from OLD.created_at in UTC; NULL→value approval fields allowed after approve/apply, change/clear refused.
- Ruling: T9 "who pays" select uses `ops.incident.cost_payer`; `useEntityDocumentOptions` selects `type` and prefixes the type label when no type filter is given.
- Ruling: `CountListCard` gains an optional `empty` prop (default `count === 0`).
- Ruling: an open guide panel follows navigation (`followRoute`): switches to the new page's guide or closes on a route without one.
- Ruling: T14 walk item 9 (CR flow) kept as an extra scenario beyond §9.

## Kabul yürüyüşü (Görev 14)

Tüm süit (`dev:supabase-reset`, `test:db`, `test`, `typecheck`, `lint`, `build`) geçti; üretilmiş tiplerde sapma yok. Spec §9 Faz 2 ölçütleri 3–4 (pazar matrisi dolu, ilk olay S17 ile) ve ek CR senaryosu tarayıcıda yürütüldü: 16 madde geçti, 0 kaldı, 1 çalıştırılamadı (depolaması engelli gizli pencere — yukarıdaki Faz 1 bulgusu). Yürüyüşün bulduğu hata: `customFetch` toplu eklemede satırlara `tenant_id` koymuyordu ve PostgREST `?columns=` listesi anahtarı düşürüyordu; "Hücre ekle" ve CR ürünleri bu yüzden RLS'e takılıyordu (`91e6fbf`, `f59742e`, test `app/tests/lib/supabase.test.ts`).

## Final dal incelemesi

Karar: "düzeltmelerle hazır". Kritik bulgu yok. Tek önemli bulgu: toplu eklemeler aktif kiracıyı alıyor; çok şubeli bir kullanıcı aktif olmayan şubenin CR'ını düzenlerken ürün satırları, ve "Hücre ekle" ekranı (form kiracısı sağlanmadığından seçiciler kapsamdaki her şubeyi listeliyordu) yanlış şubeye yazıp kompozit FK'ye takılıyordu. Tek düzeltme dalgasında kapatılanlar: bu bulgu; yayında hücrede boş string'in eksik sayılması (034); uygulanmış/reddedilmiş CR'da belge/kapı/proje sütunlarının dondurulması (037); kapı geri alma sütunlarının yalnız geçiş anında değişebilmesi (036); olay günlüğü/süre satırlarının olayın kiracısını taşıması; sorgu anahtarı kenarları (`customer→incident`, `product/project→market_cell`); iki yorum düzeltmesi. Commit'ler: `3e7f320` (DB), `1ab858b` (uygulama); ayrıca `eaa3b37` (rehber `guide.dismissed` tek obje, sahip kararı).

Dalganın bıraktığı bilinen sınırlar (küçük):
- Olay günlüğü/süre dialogu doğrudan bağlantıyla açılıp olay sorgusu yüklenmeden kaydedilirse satır aktif kiracıya gider (çok şubeli kullanıcı, başka şubenin olayı).
- "Hücre ekle" müşteriyi üstteki genel filtreden ön seçiyor; o müşteri başka şubedeyse aktif şubeye daraltılmış seçici onu listelemez ve ekleme yine olmaz (doğru davranış, ama mesaj "başka müşterinin ürünü" yerine boş seçici).

Final incelemenin ertelenen küçükleri:
- 035 kural 5: yönetime bildirim zorunluluğu yalnız `open`'dan çıkışta kontrol ediliyor; `contained` bir S3 sonradan S1/S2'ye yükseltilirse bildirim istenmiyor (dashboard `management_notice_missing` ile işaretliyor).
- pgTAP ön hazırlıkları kayıtları kiracı süzgeci olmadan koda göre arıyor; yürüyüş verisi dolu bir yerel DB'de `supabase-reset` olmadan çalışmıyor (CI her zaman taze başlar).
- `customFetch`: `tenant_id` sütunu olmayan bir tabloya gelecekte yapılacak toplu ekleme için opt-out gerekir (yorumla belirtildi).
- İncelemenin "yargılamadım" listesi (kararlı ve kapsam dışı maddeler) `.superpowers/sdd/…/final-review.md` içinde; önemli olanlar bu belgenin ilk bölümünde.
