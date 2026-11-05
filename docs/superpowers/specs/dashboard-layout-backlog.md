# Yapılandırılabilir dashboard (M6): ertelenen bulgular ve kararlar

Dal: `feat/dashboard-layout` (taban `refactor/company-enum` → `refactor/infrastructure`). 6 görev; her görev uygulayıcı → görev incelemesi döngüsünden geçti (Görev 3'te bir düzeltme turu). Final dal incelemesi ve yürüyüş sonuçları en altta.

## Sahip kararı / dikkat gerektirenler

- **TR metinler**: düzenle modu araç çubuğu, "Gizli kutular" şeridi, boy etiketleri, sola/sağa taşı, boş durumlar ("Tüm kutular gizli", "Rolünüzün dashboard kutusu yok"), "Tümünü aç" ve rehber görevi "Dashboard'u düzenle" (3 adım) geliştirici taslağı; onayın gerekir. Kaynak: `tr/index.json` altında `dashboard.layout.*`, `dashboard.ops.open_all`, `guide.pages.dashboard.tasks.edit_dashboard.*`.
- **Alan renkleri** (projeler/görevler, ürünler teal, tedarik, lojistik sky, olaylar, CR, pazar, bildirimler) geliştirici paleti; sahip gözden geçirir.
- **Kayıt yeri**: tarayıcı, kullanıcı başına anahtar `dashboard.layout.<userId>`; hesaba (veritabanına) bağlı değil (sahip kararı 05.11.2026). Başka cihazda düzen yeniden yapılır; "Varsayılana dön" her zaman var.
- **Bildirim kutusu**: artık veri yokken kaybolmuyor, "Yok" diyor; rozet yalnız ön yüklenen en çok 20 kaydı sayar (dönem başına 5), gerçek toplam değil.
- **Görev kutularında "Tümünü aç" yok** (görev listesi rotası yok); diğer kutular kendi listesine bağlanır.
- `StatisticCard.vue` artık kullanılmıyor (şube/kullanıcı/rol kartları kaldırıldı); silinmesi ayrı temizlik.
- Telefonda düzenle modu yok; tablette geniş kutu tam satır.
- `vuedraggable@4.1.0` (SortableJS) yeni bağımlılık.

## Ertelenen küçük bulgular

- Task 1: badge span has no accessible label; decorative icon not hidden from screen readers; `aria-disabled` on a role-less div while editing; rows keyed by index instead of `code`; empty-before-slot precedence not commented.
- Task 2: `useBoxView` reads the `box` object handed at setup (a swapped prop would not follow); probe test never changes `rows.value`; `ordersView`/`shipmentsView` compare `id` a second time apart from their group maps; no unit test for `ordersView`, `shipmentsView`, `changeRequestsView`, `incomplete_compliance`.
- Task 3: "None" shows before the feed has loaded (`loading` never true); `StatisticCard.vue` orphaned; badge counts the prefetched items only.
- Task 4: after a refused write a later `load(sameUser)` would replace the in-memory layout (Task 5 therefore loads only on user change); no test for a second `edit()`, `save()` with `load(null)`, or draft/saved isolation; `reorder` calls `canSee` twice per id.
- Task 5: the "no_boxes only after access" test grants no ability (weak); `accessReady().then` has no catch; `boxById` called three times per row in the template.
- Task 6: native `title` instead of `v-tooltip` on the handle and Hide; the drag handle is a focusable button with no keyboard action (moves go through the menu); menu trigger lacks `aria-expanded`/`aria-controls`; no view test for Reset, Move right (incl. disabled on the last box) or the drag reorder callback; edit outline has no dark variant; Edit is offered even when the role has no permitted box.

## Koordinatör kararları

- Ruling: `products` is its own area and colour (the spec's list named none for the SKU boxes).
- Ruling: row caps 4/8 (spec bullet corrected from 3/6); badge always the full count.
- Ruling: feed box always shown, "None" when empty, default narrow.
- Ruling: warning toast when storage blocks the save; M20 dashboard guide gains `edit_dashboard` (permission `read tenant`, held by every seeded role).
- Ruling: `hide` removes from `order` and appends to `hidden`; `unhide` the reverse (appends to the end); `setSize` deletes the key at the registry default; `reorder`/`move` touch only visible ids and keep unseen slots; `edit()` clones `saved` and is a no-op while editing.
- Ruling: `app/components.d.ts` is never committed; the plan's Step 5 lists were wrong.

## Doğrulama ve final dal incelemesi

Görev 6'nın el kontrolü üç genişlikte (1280 / 900 / 500 px) geçti: üç sütun ve tam satır kaplayan geniş kutu, tutamaçla sürükleme, düzenlerken pasif bağlantılar, kaydet sonrası yenilemede kalıcılık, daralınca taslağın düşmesi, telefonda Düzenle düğmesinin olmaması; engelli depolamada uyarı toast'u. Final inceleme "düzeltmelerle hazır" dedi; tek önemli bulgu: store'un `load`'u her dashboard ziyaretinde depoyu yeniden okuyordu, engelli depolamada oturum içi düzen bir sonraki ziyarette kayboluyordu. Tek dalgada kapatılanlar: bu bulgu; düzenleme kontrollerinin etiketlerinde kutu adı; düzenlerken "tüm kutular gizli" metninin gösterilmemesi; Varsayılana dön / sağa taşı / sürükleme için görünüm testleri; istatistik kartları testinin gerçek iddiası; yetkili kutu yokken Düzenle düğmesinin gizlenmesi; karanlık tema çerçevesi; menü tetikleyicisinde `aria-expanded`/`aria-controls`. Commit'ler: `4850e36`, `15bc867`. Not: store aynı kullanıcı için depoyu yeniden okumadığından başka sekmede kaydedilen düzen dashboard'a dönüşte değil sayfa yenilemede görünür (son yazan kazanır). Düzenleme kontrollerinin dört yeni TR etiketi ("Gizle: {box}", "Sıralamak için sürükleyin: {box}", "Kutu seçenekleri: {box}", "Kutu boyutu: {box}") onayını bekler.

Ertelenen küçükler (final inceleme): RTL dillerde "sola/sağa taşı" yönü ters (ar-ae); ilk ziyarette iskelet ve sayfa aynı bileşen olduğundan araç çubuğunun bir an ikilenme olasılığı (tekrarlanamadı).
