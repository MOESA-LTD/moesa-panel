# M20 katman 3 (terimler ve sistem rehberi): ertelenen bulgular ve kararlar

Dal: `feat/m20-terms-system-guide` (taban `0ee748a`, Faz 2c üzerine). 8 görev (6 ve 7 tek sevkiyatta); her görev uygulayıcı → görev incelemesi döngüsünden geçti, hiçbirinde düzeltme turu gerekmedi. Final dal incelemesi ve yürüyüş sonuçları en altta.

## Sahip kararı / dikkat gerektirenler

- **TR metinler**: 53 terimin kısa/uzun açıklaması, sistem rehberi sayfasının metni (giriş, 6 bölüm, 5 "panel nasıl çalışır" konusu) ve işaret eklenen 42 rehber satırı geliştirici taslağı; spec M20 TR'yi sahibin gözden geçirmesini ister. Kaynak: `tr/index.json` altında `terms.*`, `system_guide.*`, `guide.pages.*`.
- **Drive bağlantıları**: `DRIVE_LINKS` boş; süreç belgeleri için Drive URL'leri (ya da klasör bağlantısı) sen verince eklenir, sistem rehberinde "Belgeyi Drive'da aç" o zaman görünür.
- **Türetilmiş terimler** (paketler, kapılar, olay aileleri, şiddetler): kısa satır Katman 1'in sözlük satırıdır, yalnız uzun açıklama yeni. Sözlük satırı değişirse terim de değişir.
- **İşaret kuralı**: bir metinde her kodun yalnız ilk geçişi işaretli. Sözlük satırlarının işaretleri yalnız rehber panelinde ve sistem rehberinde tıklanabilir; seçenek listeleri, durum düğmesi ipuçları, kapı paneli ve aşama şeridi düz metin gösterir.
- **Form etiketleri**: yalnız zaten kod içeren etiketler terim aldı (PI, S09, ETD/ETA, SKU, GTIN, Y10, platform SKU, ASIN/EAN); paket, kapı ve şiddet alanlarının seçenekleri kendi sözlük satırlarına güveniyor.
- Sistem rehberi kenar çubuğunda görünmez; "?" panelinin altından ve hesap menüsünden açılır. "Panel kuralları" (K5–K8) bölümü spec'in listesinde yoktu, eklendi.
- Supabase kişisel erişim token'ı `github-actions-staging` süresiz ve yalnız staging projesine yetkili; süreli istersen yeniden üretilir.

## Ertelenen küçük bulgular

- Task 1: Drive-link assertion loops over an empty map (vacuous; the five-fixture `driveLinkValid` test is the real one); `markLabel` treats a hyphen as a boundary (`PL-G4` + `G4` → `PL-[[G4]]`) while the marker grammar does not; the malformed-marker guard misses `[[[PI]]]`; the prefix guard reads `en` only.
- Task 2: `Term.vue` repeats tooltip/data-term/class in its two branches; the space key is not exercised in tests; "opens a term alone" does not assert `focusTerm`; `hide()` leaves `focusTerm` set (every reopen path goes through `show`, harmless today).
- Task 3: the PI tab test does not assert the `pi_number` label's abbr.
- Task 4: the account popover stays open when "System guide" is chosen (same as other route items); the contents nav repeats its h2 as `aria-label`; vue-router active-class ignores the hash so every contents link looks active on `/guide`.
- Task 5: `scrollIntoView` spy not asserted with options; the glossary-focus case does not prove the absence of a duplicate term row; `Element.prototype.scrollIntoView` reassigned without restore; selector built from a raw slug; with `open`, no guide and no focused term the body is empty apart from the footer (unreachable: `followRoute(null)` closes it).
- Tasks 6+7: PageGuide test wraps all three `close_incident` steps in `stripTerms` (brief said 1 and 3); red step skipped for both tasks.

## Koordinatör kararları

- Ruling: `app/components.d.ts` is generated and gitignored; it is never part of a commit (the plan's Step 5 lists were wrong).
- Ruling: Tasks 6 and 7 ran as one dispatch with two commits and one review (same-shape marker edits).
- Ruling: hand checks of Tasks 4, 7 move to the Task 8 walk.

## Doğrulama ve yürüyüş (Görev 8)

`pnpm test` (822), typecheck, lint ve build geçti; `components.d.ts` sapması yok. Yürüyüş `koordinator@` İngilizce ve `akif@` Türkçe olarak 6 maddenin 6'sında geçti. Yürüyüşün bulduğu üç hata düzeltildi: panel altındaki "Sistem rehberini aç" ve hesap menüsündeki "Sistem rehberi" görünmüyordu, çünkü `CustomLink` menüde gizli (`visible: false`) rotalar için hiçbir şey çizmiyor (`8c4a1d7` düz `RouterLink`, `4b28866` menüde komut); sistem rehberi sayfası önceki sayfanın kaydırma konumunda açılıyordu (`ac5a7f0`).

Yürüyüşün bıraktığı notlar:
- Panelin "İlgili sayfalar" bağlantıları gezinmiyor (`CustomLink` `navigate` yuvası olmadan kullanılmış; Faz 2c'den kalma). Final incelemeye taşındı.
- Ekran okuyucu adları terimin etiketini içeriyor ("What is PI? document"). Final incelemeye taşındı.
- Odaklanan terimin tek vurgusu `aria-current` ve uzun metin; görsel vurgu yok (spec böyle).
- Görev adımlarının içindeki terime tıklamak görevi kapatıyor (`showTerm` `focusTask`'ı sıfırlıyor; spec böyle).
- Sayfalar gezinmede kaydırma konumunu koruyor (düzen geneli, plan öncesi).
- Olay kartı `/manage/closure` derin bağlantısı bir kez Genel sekmesinde açıldı; araştırılmadı.
- Yürüyüş verileri (PO, sevkiyat, olay, CR, Amazon/DE hücresi) yerel DB'de kaldı; pilot projenin G1'i SQL ile geçirilip geri alındı.
- Devtools'tan terim açma yolu: `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('guide').showTerm('CMR')`.

## Final dal incelemesi

Karar: "düzeltmelerle hazır". Kritik bulgu yok. İki önemli bulgu tek dalgada kapatıldı: panelin "İlgili sayfalar" bağlantıları düz tıklamada gezinmiyordu (`CustomLink` `navigate` yuvası bağlanmamıştı; Faz 2c'den kalma) ve `showTerm` `focusTask`'ı sıfırladığı için adım içindeki terime tıklamak görevi kapatıyordu (artık yalnız sayfa değişince sıfırlanıyor). Aynı dalgada erişilebilir ad düzeltildi: terimli bir etiketin adı "What is PI? document" yerine düz etiket metni. Commit'ler: `cba9ea0`, `02e1e25`, `618fc0c`. Not: "What is PI?" metni `aria-description` ile veriliyor (ARIA 1.3; Chrome/Firefox tam, Safari/VoiceOver kısmen destekler); `showTerm` panel kapalıyken de açık görevi sıfırlar.

Final incelemenin ertelenen küçükleri:
- `CustomLink` "menüde gizli" (`visible: false`) rotayı "çizilemez" sayıyor; sistem rehberi bağlantıları bu yüzden düz `RouterLink`/komut. Gizli ama erişilebilir rota kavramı istenirse `CustomLink` genişletilir.
- Sistem rehberi sayfasının `route.hash` izleyicisi sayfadan çıkarken bir kez daha çalışıyor (zararsız).
