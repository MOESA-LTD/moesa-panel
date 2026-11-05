# Moesa Panel — iş modülleri tasarımı

| Alan | Değer |
|---|---|
| Tarih | 03.11.2026 |
| Durum | **Onaylandı 03.11.2026** (ürün sahibi); §11'deki öneriler karar olarak kabul edildi |
| Dayanak | `ABOUT MOESA` seti (06 iş akışı, Y01–Y10, S01–S17, 24 aylık plan, raporlar 00–05, açık sorular), `web_panel` kod tabanı (v1.5.3-alpha.1) |
| Sonraki adım | Onaydan sonra uygulama planı (`docs/superpowers/plans/`) yazılır; geliştirme o plandan yürür |

---

## 1. Amaç ve neden

MOESA'nın iş akışı kâğıt üstünde hazır: kapılı süreç (C1–C4, P1–P6, PL1–PL7, L1–L5, O1–O3), 10 yönerge, 17 şablon, KPI seti. Eksik olan, bu akışı **her gün işleten** bir yer. Bugünkü durum:

- Aktif pano Google Sheets; 276 görevin %98'i "Not Started", 5 aydır güncellenmemiş. Üç kuşak pano denendi, hiçbiri yaşamadı.
- Ürün verisi dağınık: aynı EAN farklı ürünlerde, aynı ASIN'e bağlı farklı paketler, 13 boş backend alanı.
- Hiçbir satıştaki SKU'nun imzalı spec sheet'i yok. QC kaydı yok. Sevkiyat, üretim ve gümrük takibi hiçbir yerde izlenmiyor.
- Kanıt (kapı onayı, değişiklik talebi, PSI raporu) Drive'da dağınık ya da hiç yok.

Panelin amacı tek cümlede: **06 iş akışındaki kayıtları (müşteri, ürün, proje, kapı, PO, sevkiyat, belge, olay) tek bir yerde tutmak ve haftalık ritmi (Pazartesi plan, Çarşamba operasyon, Cuma rapor) bu kayıtlardan beslemek.**

Panelin neden Sheets gibi ölmeyeceği üç tasarım ilkesine bağlı:

1. **Her modül tek bir soruya cevap verir ve o cevabı başka yerde bulmak mümkün olmaz.** "Bu SKU'nun imzalı spec'i var mı?", "Hangi kapı kimi bekliyor?", "Bu sevkiyat nerede?" Panelde yoksa cevap yok.
2. **Kayıt, görev değil.** Pano 276 görevle öldü. Panel görev şablonu üretmez; kapıları ve kanıtları tutar. Kapıdan geçmek için gereken şey açıkça yazılıdır, ama 38 satırlık görev listesi değildir.
3. **Az alan, zorunlu alan.** Her kayıtta yalnızca kapı ve KPI için gereken alanlar zorunlu. Alan sayısı şablonların tamamı değil, çekirdeği.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

**Hedefler**
- Ürün Ana Tablosu'nun (S10) tek doğru kaynak olması; EAN/SKU çakışmasının teknik olarak imkânsız olması.
- Her proje için kapı durumu ve kanıt bağlantısı; (M) kapılarda müşteri onay tarihi ve belgesi.
- PO ve sevkiyatın baştan sona izlenmesi; "spec sheet'siz PO yok" kuralının sistemde zorlanması.
- Haftalık ritmi besleyen tek ekran: bekleyen kapılar, yönetim aksiyonu, yoldaki sevkiyatlar, açık olaylar, spec'siz SKU'lar.
- Çok müşterili yapı ilk günden: her kayıt bir müşteriye ait, müşteri seçici ile süzülür.
- KPI'ların (06 §7.5) elle değil kayıtlardan hesaplanması.

**Hedef olmayanlar (şimdilik)**
- Belge deposu olmak. Belgeler Drive'da kalır; panel bağlantı, sürüm ve durumu tutar. Dosya yükleme ikinci fazda, yalnızca kanıt belgeleri için.
- Görev yönetimi aracı olmak (Jira/Asana ikamesi). Aşama başına hafif kontrol listesi var, görev şablonu motoru yok.
- Platform API entegrasyonu (Seller Central, Kaufland). Satış ve stok verisi ilk fazlarda elle ya da CSV ile girilir.
- Muhasebe, fatura, ödeme işleme. Yalnızca "depozito ödendi / bakiye ödendi" tarih ve tutarları.
- İçerik üretimi (listing metni, A+). Panel içeriğin hangi dilde hangi durumda olduğunu tutar, metni tutmaz.
- E-posta, sohbet, bildirim motoru. Toast ve dashboard feed yeter.

**Anti-hedefler (bunlar olursa proje başarısız sayılır)**
- Koordinatörün panoyu güncellemek için günde 30 dakikadan fazla harcaması.
- Bir kaydın hem Sheets'te hem panelde yaşaması (çift kaynak).
- Zorunlu alan sayısı yüzünden kayıt açılamaması ve işin WhatsApp'a kaçması.
- Hassas verinin (banka, vergi/EORI, şifre, platform vaka no) panelde düz metin tutulması.

## 3. Kısıtlar

- **Ekip:** Bir geliştirici (Akif) + Claude. Kullanıcı: yönetim (Barış), koordinatör, zamanla rol bazlı dış hizmet kişileri.
- **Takvim:** 24 aylık planın 0–3. ay dönemi (Kasım 2026–Ocak 2027) süreç altyapısını, Şubat–Nisan 2027 çok ülke pilotunu öngörüyor. Faz 1 Aralık sonunda, Faz 2 Şubat başında çalışır durumda olmalı.
- **Mevcut altyapı korunur:** Vite + Vue 3 + PrimeVue + Supabase, çok kiracılı (tenant) model, CASL yetkileri, generated RLS, audit log, route-dialog sistemi, ResourceTable/useUpsertForm. Yeni modüller bu kalıbı izler; kalıp değiştirilmez.
- **Açık sorular:** `acik_sorular.md`'de 70+ soru yönetim cevabı bekliyor. Panel bu cevapları **veri olarak** (ör. depozito %, güvenlik stoku gün) tutar, kurala gömmez; cevap gelince ayar değişir, kod değişmez.
- **Veri saklama:** Kayıtlar silinmez, "arşiv" durumuna geçer. Audit log zaten var; 10 yıl kuralı veri silmeme ile karşılanır.

## 4. Temel tasarım kararları

Her karar "kimin" olduğu ile işaretli: **[belgelerden]** iş akışı setinin gerektirdiği, **[benim kararım]** tasarımcı tercihi, onaya açık.

### K1. Müşteri = MOESA kiracısı içinde düz bir `customer` tablosu **[benim kararım]**

Tek kiracı: MOESA LTD. Müşteri, tedarikçi, ürün, proje, PO, sevkiyat, belge, olay — hepsi bu kiracıda yaşar. Müşteriye ait her iş tablosu `customer_id` sütunu taşır; listeler sağ üstteki **müşteri filtresi** ile (ResourceTable filtreleri kalıcıdır) süzülür; dashboard müşteri bazında kırılım verir.

İlk taslakta müşteri "alt kiracı (şube)" olarak düşünülmüştü. İnşaatçı kontrolü üç engel çıkardı: roller kiracıya bağlıdır ve ağaçtan aşağı inmez (koordinatörün her müşteriyi görmesi için ya kök sahibi yapılması ya da her müşteride rol kopyası gerekir); plan şube limiti (`max_branches`) müşteri sayısını sınırlar; kök kiracıdaki paylaşılan kayıtlar (tedarikçi, ayar) tek müşteri seçilince RLS'ten geçmez. Üçü de ancak erişim modelini değiştirerek çözülür; bu "kalıp değiştirilmez" kısıtına ve sadelik hedefine aykırıdır. Düz tabloda bu sorunların hiçbiri yoktur.

Müşteri portalı (M15, Faz 3) için gereken satır kısıtı, mevcut izin kataloğundaki `resource_condition` ile çıkar: `customer_user(customer_id, user_id)` eşleme tablosu + `customer_viewer` rolünün izinlerine `customer_id IN (SELECT … WHERE user_id = auth.uid())` koşulu. Yeni yetki katmanı gerekmez; şema bugünden `customer_id` taşıdığı için Faz 3'te geriye dönük değişiklik olmaz.

Kiracı ağacı (şubeler) MOESA'nın kendi ofisleri için kullanılabilir durur; müşteri için kullanılmaz. **Yönetim onayına sunulan karar** (bkz. §11 madde 1).

İşleten şirket enum değerlerinde ve arayüz metninde adıyla değil `company` olarak anılır (`payment_payer`, `cost_payer`, `change_request_source`, `company_approved_*`); panel çok kiracılıdır, `moesa` yazılmaz (sahip kararı 2026-11-05).

### K2. Belge = bağlantı + sürüm + durum **[belgelerden + benim kararım]**

Tek bir `document` tablosu her şeye bağlanır (ürün, proje, kapı, PO, sevkiyat, olay, müşteri, tedarikçi). Alanlar: tür (spec sheet, PI, PSI raporu, kapı onayı, CR, SDS, DoC, packing list, B/L, teslim tutanağı…), sürüm, tarih, durum (taslak / imzalı / onaylı / eski), Drive bağlantısı, dosya adı (06 §7.6 standardıyla otomatik üretilir), notlar. Supabase Storage'a yükleme Faz 2'de yalnızca kanıt türleri için açılır.

Böylece "spec sheet imzalı mı?" sorusu belgeye bakılarak değil, `document` kaydıyla cevaplanır; KPI buradan hesaplanır.

### K3. Kapılar birinci sınıf kayıt **[belgelerden]**

Proje açılınca yolu (A marka sourcing / B private label) ve paketine göre kapı seti otomatik üretilir: C-G1, G1, G2, G3, G4, G5, PL-G1…PL-G4, L-G1, L-G2. Her kapı: durum (bekliyor / geçti / geri döndü), (M) ise müşteri onay tarihi + onay belgesi, geçiş kanıtı (belge bağlantıları), sahibi (rol), karar notu. Kapı geçmeden sonraki aşama "kilitli" görünür ama işlem engellenmez (uyarı); yalnızca üç sert kural zorlanır:

1. G2 geçişi için imzalı spec sheet belgesi şart.
2. PO kaydı onaylı spec sheet sürümüne referans vermeden "gönderildi" durumuna geçemez (31.12.2026 sonrası tüm SKU'lar; öncesinde yalnızca yeni SKU'lar — tarih ayardır).
3. Aynı GTIN iki aktif ürüne verilemez; GTIN kontrol basamağı doğrulanır.

### K4. Görev değil, aşama kontrol listesi **[benim kararım]**

Proje aşaması (P1…L5) başına kısa kontrol listesi (`project_task`): ad, rol, sorumlu (isteğe bağlı), termin, durum, "kapıyı bloke eder" bayrağı. Şablon yok; proje tipine göre başlangıç listesi (5–8 madde) yönergelerin "Kontrol listesi" bölümlerinden sabit olarak gelir. MVP'nin 38 görevlik şablonu Faz 3'te, panel gerçekten kullanılıyorsa değerlendirilir.

### K5. Kodlar otomatik, elle değiştirilmez **[belgelerden]**

06 §7.2: müşteri 3 harf; proje `<KOD>-<YIL>-<NNN>`; PO `PO-<KOD>-<YIL>-<NNN>`; sevkiyat `SHP-…`; değişiklik talebi `CR-…`; olay `OL-/OA-/OU-/OT-/OM-` + sıra. Sayaçlar müşteri + yıl bazında veritabanında (`code_sequence`), yarış koşulsuz.

### K6. Ayarlar tablo, kural değil **[benim kararım]**

Yönetim onayı bekleyen sayılar (depozito %, güvenlik stoku gün, belge talebi süresi 5 iş günü, S1/S2 bildirim süreleri, spec sheet zorunluluk tarihi, WIP sınırı) `setting` tablosunda (anahtar, değer, açıklama, kaynak soru no) tutulur; yalnızca `management` yazar; kod bu değerleri okur.

### K7. Dil **[benim kararım]**

Arayüz TR ve EN (mevcut i18n). Alan adları ve enum değerleri İngilizce snake_case (kod tabanı konvansiyonu); ekranda çevrilir. Süreç kodları (P1, G2, PL-G3) her dilde aynı kalır.

### K9. Platform bağımsızlık **[benim kararım, onaylandı]**

Ürün çekirdeği ve içerik ana seti hiçbir platform kuralı içermez; platform yalnızca ince bir katman ekler (06 §1.2). Somut kurallar:

1. `platform` bir referans tablosudur (kod, ad, ülkeler, ürün kimliği etiketi, içerik limitleri); yeni pazar yeri (Temu, Kaufland, eBay…) = bir satır + bir kütüphane kartı, şema değişikliği değil.
2. Pazar hücresinde (M9) platforma özel sütun yoktur; her hücre genel `platform_product_id` ve `platform_sku` taşır. S10'daki `asin_de` gibi sütunlar içe aktarımda hücrelere dönüştürülür.
3. İçerik üç katmandır (M17, Faz 3): çekirdek → EN ana set → dil çevirileri; platforma özel attribute'lar ayrı `platform_attribute` katmanında, platform kartındaki eşlemeyle dolar.
4. Entegrasyon = platform başına bir adaptör (edge function): dışa aktar → gönder → rapor çek. Amazon ilk adaptör; diğerleri aynı arayüzü uygular. "Amazon'da yayınla" Faz 4 konusudur (SP-API geliştirici onayı ve müşteri yetkilendirmesi gerekir); önce dışa aktarım (flat file / JSON), sonra rapor okuma, en son yazma.
5. Platform kimlik bilgileri tabloya yazılmaz; Vault / edge function secret'ında durur, panel yalnızca yetki durumunu gösterir.

### K8. Hassas veri **[belgelerden]**

Banka, vergi/EORI, şifre, platform vaka numarası için alan yoktur. Müşteri ve tedarikçi kartlarında "kısıtlı bilgi Drive klasörü" bağlantısı vardır. Platform vakalarında `case_ref` alanı yalnızca `management` rolünün okuyabildiği ayrı tabloda tutulur (Faz 3).

## 5. Modül haritası

| # | Modül | Süreç | Şablon kaynağı | Faz |
|---|---|---|---|---|
| M0 | Temel (var): kiracı/şube, kullanıcı, rol, audit, abonelik | — | — | ✓ |
| M1 | Müşteriler | C1–C4 | S01, S02, T1 | 1 |
| M2 | Tedarikçiler | P2, PL5 | Supplier Register | 1 |
| M3 | Ürün ana tablosu | L2, S10 | S10, S07 | 1 |
| M4 | Belgeler ve kanıt | §7.6 | S07, S08, S12 | 1 |
| M5 | Projeler, aşamalar ve kapılar | P1–L5 | 06 §2, §4, plan §4 | 1 |
| M6 | Dashboard ve haftalık ritim | §6 | v2 dashboard, MVP KPI | 1 |
| M7 | Satın alma (PO) | P3 | S09 | 2 |
| M8 | Sevkiyatlar | P5–P6 | S14, S15, S16 | 2 |
| M9 | Pazar matrisi | L1–L5 | S05 | 2 |
| M10 | Olaylar ve değişiklik talepleri | Y10, S08 | S17, S08 | 2 |
| M11 | Stok ve yeniden sipariş | O1 | Y09 §4.1 | 3 |
| M12 | Hesap sağlığı ve vaka günlüğü | O2 | Y09 §4.2 | 3 |
| M13 | Raporlar (haftalık özet, aylık müşteri raporu) | O3 | S03 | 3 |
| M14 | Kütüphane kartları (platform, ülke, ürün tipi) | L1, S12 | 06 §5 | 3 |
| M15 | Müşteri portalı (salt okunur + kapı onayı) | (M) kapılar | §1.5 | 3 |
| M16 | İş geliştirme (müşteri adayları) | C1 | — | 3 |
| M17 | Listing içeriği (EN ana set, çeviriler, platform attribute katmanı, dışa aktarım) | L2–L4 | T10, S13 | 3 |
| M18 | Platform entegrasyonları (SP-API rapor okuma, sonra yayınlama; diğer pazar yerleri adaptör olarak) | L4, O1–O2 | — | 4 |
| M19 | Ortam yönetimi (fotoğraf, görsel, dosya; her kayda bağlanır) | §7.6 fotoğraf/video kanıtı, PL7, L2 | — | **2 (ilk görev)** |
| M20 | Rehber ve sözlük (alan ipuçları, seçenek açıklamaları, sayfa başına rol duyarlı yan panel) | tüm süreç; terimler A1/B/C/E, kapılar, belge türleri | 06 §1, §2, S12 | **2 (son görev)** |
| M21 | Kiracılar arası veri aktarımı (müşteri paketi; kopyala / taşı; prova raporu) | — | — | **3 (ilk görev)** |

Faz 1 "tek doğru kaynak", Faz 2 "operasyon", Faz 3 "sürekli yönetim ve müşteri", Faz 4 "entegrasyonlar" (ikinci müşteriden sonra, çok kanallı araç satın almakla karşılaştırılarak karar verilir). Faz 3 modülleri Faz 2 bitince yeniden önceliklenir; bu belge onların yalnızca sınırını çizer.

## 6. Modül tanımları

Her modülde: amaç, ana kayıt (zorunlu alanlar **kalın**), ilişkiler, ekranlar, kurallar. Alan listeleri çekirdektir; şablondaki ek alanlar builder tarafından isteğe bağlı sütun olarak eklenebilir, zorunlu yapılamaz.

### M1 Müşteriler

**Amaç:** Her kaydın ait olduğu müşteriyi ve sözleşme çerçevesini tutmak.

**Kayıt `customer`:**
- **kod** (3 harf, benzersiz), **unvan**, ülke, web sitesi
- C-G1 teklif kabulü: kabul tarihi + sözleşme belgesi (M4) — bu kapı projeye değil müşteriye aittir
- **ticari model** (trading_partner / commercial_representative / operations_partner)
- **paketler** (A0, A1, A2, B, C, D, E — çoklu seçim)
- durum (lead / onboarding / active / paused / closed)
- sözleşme: MSA/SOW belge bağlantısı, başlangıç tarihi, depozito oranı, ek maliyet kuralı notu
- markalar (liste: ad, tescil durumu, marka programı durumu)
- AB sorumlu kişi / ithalatçı (metin + belge bağlantısı)
- kısıtlı bilgi Drive bağlantısı
- kişiler `customer_contact`: ad, rol (karar verici / operasyon / depo / muhasebe), e-posta, telefon, onay yetkisi var mı
- teslim noktaları `customer_warehouse`: ad, adres, tür (own / 3pl / fba), rampa saatleri, randevu kuralı, palet standardı, kabul eden kişi (S14 depo teslim kartı)
- platform hesapları `customer_platform_account`: platform, ülke(ler), hesap sahibi, MOESA erişim türü (yetkili kullanıcı / yok) — **şifre alanı yok**

**Ekranlar:** Müşteri listesi (kod, unvan, model, aktif proje sayısı, açık kapı sayısı); müşteri kartı (sekmeler: genel, kişiler, depolar, platformlar, belgeler, projeler).

**Kurallar:** Kod kaydedildikten sonra değiştirilemez (proje, PO, SHP kodları ona bağlıdır). Durumu `closed` olan müşteriye yeni proje açılamaz.

### M2 Tedarikçiler

**Amaç:** Tedarikçi ağı ve her tedarikçinin ticari şartlarını (Y10 süre sınırları için) tutmak. Müşteriye bağlı değildir (paylaşılan kayıt); `customer_viewer` rolü bu tabloyu hiç okuyamaz (D3-3).

**Kayıt `supplier`:**
- **kod** (CN1, TR1… — mevcut Supplier Register kuralı), **ad**, **ülke**, şehir, web
- ürün grupları (etiket listesi), kapasite notu
- şartlar: varsayılan Incoterm, depozito %, ödeme vadesi, hasar bildirim süresi (saat), depolama ücreti kuralı, geç ödeme cezası, iptal/iade kuralı
- belgeler: sertifikalar, NNN/sözleşme, kalite eki (M4 üzerinden)
- değerlendirme: puan 1–5, son denetim tarihi, notlar
- kişiler `supplier_contact`
- durum (candidate / approved / suspended)

**Ekranlar:** Liste; kart (genel, şartlar, kişiler, belgeler, ürünler, PO geçmişi).

### M3 Ürün ana tablosu

**Amaç:** 1 varyant = 1 GTIN = 1 kayıt. Her satış, PO, sevkiyat, listing bu kayda bağlanır.

**Kayıt `product`:**
- **müşteri** (`customer_id`), **sku**, parent_id (varyant → ana ürün), **ad**, varyant tanımı (renk / ölçü / paket adedi), kategori, marka
- **gtin** (13/14 hane, kontrol basamağı doğrulanır, aktif kayıtlar arasında benzersiz), GS1 önek sahibi
- tedarikçi (supplier), tedarikçi ürün kodu, üretici art. no
- **durum** (concept / development / approved / ordering / on_sale / paused / archived)
- spec: `spec_document_id` (M4'ten, türü spec sheet, durumu imzalı olan en güncel), altın numune tarihi ve yerleri
- uyum: hazmat bayrağı, uyum belge durumu (none / partial / complete), AB sorumlu kişi, HS kodu, menşe
- ölçü/ağırlık: ürün (mm, g), paket (adet, mm, g), koli (adet, mm, kg net/brüt), palet (koli adedi, tip)
- maliyet/fiyat: alış fiyatı + para birimi + Incoterm, landed cost EUR + tarih, hedef satış fiyatı EUR, MOESA satış fiyatı EUR + fiyat listesi sürümü
- lot kuralı, notlar

**Ekranlar:** Liste (müşteri seçiciyle, filtreler: durum, spec imzalı mı, uyum durumu, tedarikçi); ürün kartı (genel, ölçüler, maliyet, belgeler, pazar hücreleri, PO/sevkiyat geçmişi); CSV içe/dışa aktarma (S10 başlık sırasıyla) — mevcut Sheets verisinin taşınması için.

**Kurallar:** GTIN benzersizlik (partial unique index: durum ≠ archived); SKU müşteri içinde benzersiz; spec sheet sürümü yalnızca M4 belge kaydı üzerinden değişir.

**Hesaplanan görünüm `product_evidence`:** her ürün için "imzalı spec var mı", "uyum tam mı", "son PO", "yayındaki hücre sayısı" — KPI ve dashboard bunu okur.

### M4 Belgeler ve kanıt

**Amaç:** Kanıt ilkesinin (06 §1.5, §7.6) veri karşılığı.

**Kayıt `document`:**
- **tür** (enum: spec_sheet, tech_pack, sample_report, pi, po, psi_report, test_report, sds, doc_of_conformity, technical_file, label_artwork, packing_list, commercial_invoice, bill_of_lading, customs, delivery_receipt, gate_approval, change_request, contract, certificate, other)
- **bağlı kayıt** (polimorfik: `entity_type` + `entity_id`; ürün, proje, kapı, PO, sevkiyat, olay, müşteri, tedarikçi)
- **sürüm** (v01…), **tarih**, **durum** (draft / signed / approved / superseded)
- **bağlantı** (Drive URL) ya da storage yolu (Faz 2)
- dosya adı (otomatik: `<SKU>_<TÜR>_v<NN>_<YYYYMMDD>_<durum>`), gönderen (tedarikçi resmî e-posta mı), imza/kaşe var mı, notlar

**Ekranlar:** Her kartta "Belgeler" sekmesi (liste + ekle); global belge arama (tür, durum, müşteri).

**Kurallar:** Yeni sürüm eklenince eski sürüm otomatik `superseded`; silme yok. Spec sheet `signed` olabilmesi için imza/kaşe, resmî e-posta, sürüm, tarih alanlarının dolu olması gerekir (S07 §4 geçerlilik şartı).

### M5 Projeler, aşamalar ve kapılar

**Amaç:** "Hangi proje hangi aşamada, hangi kapı kimi bekliyor?"

**Kayıt `project`:**
- **kod** (otomatik), **müşteri**, **ad**, **tip** (npi / variant / revision / reorder), **yol** (a_sourcing / b_private_label), paket (A0…E)
- ürünler (çoklu, `project_product`)
- **aşama** (current_phase: P1, P2, PL1…PL7, P3…P6, L1…L5, closed) — kapı geçince ilerler
- hedef tarihler: depo teslim, yayın
- sorumlu koordinatör (kullanıcı), durum (active / on_hold / closed / cancelled)

**Kapı seti** (proje tipi × yol × paket; `gate_definition` sabit listesi) **[benim kararım, yönetim onayı]**:

| Proje tipi / paket | Kapılar (sırayla) |
|---|---|
| npi, yol A (marka sourcing), paket A1 | G1 → G2 → G3 → G4 → G5 |
| npi, yol B (private label), paket A2 | G1 → PL-G1 → PL-G2 → PL-G3 → PL-G4 → G3 → G4 → G5 |
| variant (mevcut üründen yeni varyant) | G2 → G3 → G4 → G5 |
| revision (CR sonucu spec/ambalaj değişikliği) | G2 → G3 → G4 → G5 (PL-G4 yalnızca ambalaj değişiyorsa) |
| reorder (tekrar sipariş) | G3 → G4 → G5; G3 ön koşulu Y09 §5 listesi |
| yalnız A0 (araştırma, konsept, tasarım) | PL-G1 → PL-G2 |
| yalnız B (lojistik) | G5 (G4 yalnızca MOESA PSI yapıyorsa) |
| paket C içeriyorsa (listing) | yukarıdakilere ek: L-G1 → L-G2 (ürün yolculuğuna paralel) |
| paket D | A1 veya A2 seti + C eki |
| paket E | proje açılmaz; yeniden sipariş `reorder` projesi olarak doğar |

C-G1 müşteri kaydındadır (M1). (M) işaretli kapılar 06 §2'deki gibi: G1, G2, G3, G5, PL-G1…PL-G4, L-G1, L-G2; G4 iç kapıdır.

**Kayıt `project_gate`** (proje açılınca yukarıdaki setten otomatik üretilir):
- **kapı kodu** (C-G1, G1, G2, G3, G4, G5, PL-G1…PL-G4, L-G1, L-G2), sıra, **müşteri onayı gerekir mi** (M)
- **durum** (pending / passed / rolled_back), geçiş tarihi, karar veren rol, müşteri onay tarihi, onay belgesi (M4), kanıt belgeleri (M4, çoklu), karar notu
- geri dönüş: hangi olaydan (M10) ve neden

**Kayıt `project_task`** (K4): aşama, **ad**, rol, sorumlu, termin, durum (todo / doing / done / blocked), kapıyı bloke eder mi.

**Ekranlar:** Proje listesi (müşteri, kod, aşama, bekleyen kapı, sorumlu, hedef tarih, gecikme); proje kartı: aşama şeridi (P1 → … → L5, kapılar işaretli), kapı paneli (kanıt ekle, geçir, geri al), aşama kontrol listesi, ürünler, belgeler, PO'lar, sevkiyatlar, olaylar.

**Kurallar:** Kapı geçişi için zorunlu kanıt türleri kapı başına tanımlıdır (plan §4 tablosu); eksikse uyarı, yalnızca G2 ve G3'te (K3) engel. (M) kapıda müşteri onay tarihi ve belgesi olmadan "passed" olamaz. Proje aşaması kapı geçişiyle otomatik ilerler; elle de değiştirilebilir (audit'e düşer).

### M6 Dashboard ve haftalık ritim

**Amaç:** Pazartesi / Çarşamba / Cuma toplantılarının tek ekranı. Veri girişi yok; her kutu bir listeye tıklanır.

**Kutular (Faz 1):**
- Bekleyen kapılar (kapı, proje, kaç gündür bekliyor, kimde)
- Yönetim aksiyonu bekleyenler ("Owner Action": yönetim onayı gereken kapılar ve kararlar)
- Müşteri onayı bekleyen (M) kapılar
- Geciken aşama görevleri; 5 gün içinde dolacaklar
- İmzalı spec'i olmayan aktif SKU'lar (sayı + liste), uyumu eksik SKU'lar
- Son 7 günde değişen kayıtlar (audit feed, var)

**Faz 2 ekleri:** yoldaki sevkiyatlar (ETA sırasıyla), üretimdeki PO'lar ve bakiye ödeme tarihleri, açık olaylar (S1/S2 öne), açık CR'ler, pazar matrisi özeti (yayında / hazırlanıyor / bastırılmış).

**Faz 3 ekleri:** yeniden sipariş noktasına yaklaşan SKU'lar, hesap sağlığı uyarıları, KPI kartları (06 §7.5).

**Yapılandırılabilir dashboard (eklendi 05.11.2026, onaylandı).** Kutu ihtiyacı kullanıcıya göre değişir; dashboard kişiseldir.
- *Kaldırılanlar:* şubeler, kullanıcılar ve roller istatistik kartları dashboard'dan çıkar (yönetim sayfalarında zaten var).
- *Kutu seti:* yalnızca operasyon kutuları ve bildirim akışı (audit feed). Her kutu bir kayıt defterinde (`DASHBOARD_BOXES`) sabit bir kimlik, alan rengi, varsayılan boy, gerektirdiği CASL yetkisi ve rehber görevi ile tanımlıdır. Yetkisi olmayan kutu ne gösterilir ne de "gizli kutular" arasında sunulur.
- *Yerleşim:* kutular soldan sağa akar (sıralı akış); her kutu **dar** (1 sütun) ya da **geniş** (2 sütun). Masaüstünde 3 sütun, tablette 2, telefonda 1 (telefonda geniş de tek sütun). Geniş kutu daha çok satır gösterir (dar 3, geniş 6 satır; geliştirici kararı). Serbest ızgara ve kutu yüksekliği kapsam dışı.
- *Görünüm ("yoğun liste"):* gölgeli yuvarlak kart; başlığın yanında alan rengiyle simge ve sayı rozeti; her satır kendi açık zemininde, kayıt kodu kalın, bağlam gri, aciliyet küçük etiketle (geciken gün, "yönetime bildirilmedi" gibi); kart altında "Tümünü aç" ve M20'nin "Bu kartı nasıl kapatırım?" bağlantısı. Alan renkleri sabit: projeler/görevler, tedarik, lojistik, olaylar, CR, pazar, bildirimler (geliştirici paleti; sahip gözden geçirir). Boş kutu kaybolmaz, "Yok" der.
- *Düzenle modu:* sayfanın sağ üstünde "Düzenle" düğmesi. Modda kutularda tutamaç, göz simgesi (gizle) ve dar/geniş seçimi; sürükle-bırak sıralama; altta "Gizli kutular" şeridi (tıklayınca sona eklenir); üstte araç çubuğu "Kaydet / Vazgeç / Varsayılana dön". Vazgeç son kaydedilen düzene döner; Varsayılana dön kayıt defterinin varsayılan sırasına ve boylarına, hepsi görünür. Mod dışında dashboard bugünkü gibi çalışır; telefonda düzenle modu yoktur (geliştirici kararı).
- *Kayıt:* tarayıcıda, `localStorage` altında kullanıcı başına bir anahtar (`dashboard.layout.<userId>`; aynı tarayıcıyı paylaşan hesaplar birbirinin düzenini görmez — geliştirici kararı) tek obje: `{ order: [id…], sizes: { id: 'narrow' | 'wide' }, hidden: [id…] }`; `sizes` yalnız varsayılandan sapan kutuları tutar. Hesaba (veritabanına) bağlı değil (sahip kararı: cihaz başına ayar yeterli). Kaydet tıklanınca yazılır, o ana kadar taslak bellekte; sekmeler arasında son yazan kazanır. Bozuk, eksik veya engelli depolama varsayılan düzene düşer; kayıt defterinde olmayan kimlikler okunurken atılır, `hidden`'daki kimlik `order`'dan düşer, yetkisi olmayan kutu atlanır, yeni kutular sona görünür eklenir. Rol tabanlı varsayılan düzen yok.
- *Geliştirici kararları (uygulayıcı incelemesinden):* kutu envanteri bugünkü 14 operasyon kutusu + bildirim akışı, varsayılan sıra bugünkü sıra, hepsi dar; bildirim akışı aynı kart kabuğunu (başlık, rozet, alt bağlantılar) kullanır, içeriği kendi gruplu listesidir ve rozeti kayıt sayısıdır; her kutu kendi sorgusunu taşıyan bir bileşendir, gizli kutu sorgu çalıştırmaz; satır sınırı dar 4, geniş 8 (bugünkü 8 geniş kutuda korunur), rozet her zaman toplam sayı; tablette geniş kutu iki sütunu (tam satır) kaplar; "Tümünü aç" yalnız hedef rotası olan kutuda görünür (yeni liste rotası açılmaz; müşteri filtresiyle çalışan kutular bugünkü `onSelect` davranışını korur); "Bu kartı nasıl kapatırım?" mevcut `guideTask` bağıdır ve isteğe bağlıdır; sürükle-bırak için `vuedraggable` (SortableJS) bağımlılığı eklenir, klavye için düzenle modunda kutu menüsünde "sola/sağa taşı".
- *Kapsam dışı:* hesaba bağlı kayıt ve rol varsayılanları, serbest ızgara, kutu içi filtreler, başka sayfalarda düzenlenebilirlik, üst çubuk bildirim zili.

### M7 Satın alma (PO)

**Kayıt `purchase_order`:**
- **kod**, **müşteri**, **tedarikçi**, proje, **durum** (draft / sent / pi_received / pi_approved / deposit_paid / in_production / ready / balance_paid / closed / cancelled)
- satırlar `purchase_order_line`: **ürün**, **adet**, **birim fiyat**, para birimi, **spec sheet sürümü** (M4 belge referansı)
- şartlar: **Incoterm** + yer, depozito %, termin (hazır tarih), tolerans %, ceza kuralı, ambalaj/etiket talimatı belgesi
- PI kontrol (S09): PI belge bağlantısı, aritmetik kontrol (satır toplamları, ara toplam, ek kalem, indirim, genel toplam, depozito, bakiye — sistem hesaplar, PI'daki girilir, fark gösterilir), kontrol listesi onay kutuları, kontrol eden
- ödemeler `purchase_order_payment`: tür (deposit / balance / other), tutar, para birimi, planlanan tarih, ödenen tarih, ödeyen taraf (MOESA / müşteri)
- üretim takibi `purchase_order_update`: tarih, durum notu, fotoğraf belge bağlantısı
- G3 kapısına bağ (proje üzerinden)

**Kurallar:** `sent` durumuna geçiş için her satırda spec sheet referansı (K3 kural 2). Bakiye ödeme "ödendi" olabilmesi için PSI raporu belgesi `approved` olmalı (plan §4 G4: PSI'sız bakiye yok) — uyarı, engel değil [yönetim onayı].

### M8 Sevkiyatlar

**Kayıt `shipment`:**
- **kod**, **müşteri**, PO'lar (çoklu), **teslim deposu** (M1 warehouse), **mod** (fcl20 / fcl40 / lcl / road / courier / air)
- taraflar: forwarder, gümrük müşaviri, taşıyıcı (metin + kişi; Faz 3'te `partner` tablosu)
- Incoterm alış / satış, sigorta var mı
- tarihler: hazır, booking teyit, ETD, ETA, gümrük çıkış, planlanan teslim, gerçekleşen teslim
- konteyner/araç no, mühür no, serbest gün (liman / detention), demuraj tarifesi notu
- adetler: koli, palet, m³, brüt kg (packing list tek kaynak; belgeler arası farklar S15'teki üçlü eşleştirme için uyarı)
- **durum** (planned / booked / loaded / in_transit / at_customs / delivered / accepted / disputed)
- olaylar `shipment_event`: tarih, olay (S15 B tablosu satırları), kim → kime, kanal, not
- teslim kabulü (S16): kabul eden, tarih, adet uyumlu mu, hasar var mı, fotoğraf belgeleri, itiraz süresi sonu
- belge kontrol listesi: CI, packing list, B/L-CMR, menşe/A.TR, SDS, gümrük talimatı — her biri M4 belgesine bağ ve durum

**Kurallar:** `accepted` için teslim tutanağı belgesi şart (G5 kanıtı). Teslim adresi `customer_warehouse`'tan gelir, elle yazılmaz (C1 palet adresi hatası).

### M9 Pazar matrisi

**Kayıt `market_cell`:** **ürün**, **platform** (enum), **ülke** (ISO-2), **durum** (planned / preparing / live / suppressed / paused / stopped), öncelik 1–3, uyum durumu (green / yellow / red / pending) + not, platform ürün kimliği (ASIN vb.), platform SKU, fiyat + para birimi, stok kaynağı (customer_warehouse / 3pl / platform / pan_eu), içerik dil durumu (none / en_master / translated / approved), yayın tarihi, son kontrol tarihi, açık sorun notu.

**Ekranlar:** Pivot görünüm (satır ürün, sütun platform×ülke, hücre renkli durum) + düz liste; hücre düzenleme dialogu. Müşteri bazında "yayında / hedef" sayacı.

**Kurallar:** Ürün + platform + ülke benzersiz. `live` için platform kimliği ve içerik durumu `approved` şart (L-G1).

### M10 Olaylar ve değişiklik talepleri

**Kayıt `incident`** (S17): **kod** (aile + sıra: OL-01 tipindeki Y10 kart kodu `incident_type` olarak ayrıca tutulur), **müşteri**, bağlı kayıt (proje / PO / sevkiyat / ürün / pazar hücresi), **şiddet** (s1 / s2 / s3), **sahip**, etkilenen taraflar, açılış, yönetime bildirim zamanı, müşteriye ilk bildirim hedefi/gerçekleşen, süre sınırları (son tarihli liste), geri dönülen kapı, durum (open / contained / closed), kök neden, önlem, kapanış tarihi.
`incident_log`: tarih-saat, yazan, not, maliyet kalemi (tutar, kime yazıldı, müşteri onayı var mı).

**Kayıt `change_request`** (S08): **kod**, **müşteri**, proje/ürünler, **kaynak** (customer / supplier / moesa / regulation), **aciliyet** (normal / urgent), ne değişiyor (alan listesi: spec / design / packaging / price / deadline), gerekçe, etki (maliyet, süre), onaylar (MOESA rol + tarih, müşteri + tarih + belge), sonuç: yeni belge sürümü (M4 bağlantısı), durum (open / approved / rejected / applied).

**Kurallar:** S1/S2 olayda yönetime bildirim zamanı zorunlu. Kapı geri alma yalnızca olay üzerinden yapılır (K3). CR `applied` olunca ilgili belge yeni sürüm alır.

### M19 Ortam yönetimi (Faz 2, ilk görev) — eklendi 03.11.2026

**Amaç:** Fotoğraf, görsel ve dosyaları tek bir yerde tutup her kayda (ürün, müşteri, tedarikçi, proje, kapı, PO, sevkiyat, olay) bağlayabilmek. Belge (M4) "bu belge nedir, hangi sürümdür, imzalı mıdır" sorusuna cevap verir; ortam "dosyanın kendisi nerede, hangi kayıtların görseli" sorusuna. İkisi birbirine bağlanabilir: bir belge kaydı Drive bağlantısı yerine bir ortam dosyasına işaret edebilir (`document.storage_path` zaten var).

**Kayıt `media`:** **dosya** (Supabase Storage `media` kovası, `<tenant_id>/<media_id>/<dosya>`), **mime**, boyut, genişlik/yükseklik (görselde), küçük resim yolu, başlık, alt metin, etiketler, yükleyen, yüklenme tarihi, `customer_id` (müşteriye ait görseller için, paylaşılan ortamda NULL).
**Kayıt `media_link`:** **ortam**, **bağlı kayıt** (`entity_type` + `entity_id`, M4 ile aynı polimorfik kalıp ve aynı tenant/satır doğrulama tetikleyicisi), **rol** (`primary_image` | `gallery` | `evidence_photo` | `attachment`), sıra. Bir ortam birden çok kayda bağlanabilir (aynı görsel ana ürün ve varyantlarında).

**Ekranlar:** Ortam kütüphanesi (ızgara, filtre: müşteri, tür, etiket, bağlı kayıt); her kartta "Ortam" sekmesi (sürükle-bırak yükleme, çoklu seçim, birincil görsel işareti, kütüphaneden bağla); ürün listesinde küçük resim sütunu.

**Kurallar:** Kabul edilen türler görsel (png/jpg/webp), pdf, video (mp4) — SVG yok; boyut sınırı ayarda (`media_max_mb`, varsayılan 25). Yazma izni ilgili kaydın `update` iznine bağlı (tenant-logo kalıbı); silme yalnız bağlantısı olmayan ortamda ve `management` rolünde. Ürün başına tek `primary_image`. Faz 2'deki belge yükleme bu modül üzerinden yapılır: **her belge türü** (kanıt türleri ve spec sheet, SDS, DoC gibi ürün belgeleri dahil) bir `media` dosyasına bağlanabilir ya da Drive bağlantısıyla kalır; belge formunda "Drive bağlantısı" yanında "dosya yükle / kütüphaneden seç" bulunur (§11 madde 4'ün genişletilmiş hali, 03.11.2026 **[benim kararım]**). Belge kaydı (M4) ortam modülüne taşınmaz; ürün kartının Belgeler sekmesi aynı kalır, Ortam sekmesi fotoğraf ve görseller için ayrıca gelir. Kiracılar arası aktarım (M21) için `media` satırı ve dosyası birlikte hedef kiracının klasörüne kopyalanır; bu modül o kopyayı baştan destekler.

**Faz 3 bağlantısı:** M17 listing içeriği görsel setini `media_link` rolleriyle (`primary_image`, `gallery`) okur; dışa aktarım için herkese açık URL gerekirse kovanın okuma politikası ürün görselleri için açılır (ayrı karar).

### M20 Rehber ve sözlük (Faz 2, son görev) — eklendi 03.11.2026

**Amaç:** Kullanıcı paketlerin (A1, B, C, E), kapıların, belge türlerinin ne olduğunu bilmeden paneli açabilmeli. İki soru, iki katman: "bu alan ne?" (ipucu, seçeneğin yanında) ve "bu sayfada ne yapacağım?" (sayfa rehberi). Sihirbaz ve adım adım ekran turu kapsam dışı; ilk gerçek kullanıcı geri bildiriminden sonra ayrı karar.

**Katman 1 — sözlük ve ipuçları.** Her enum değeri için bir satır açıklama, i18n'de tek anahtar altında (`glossary.<enum>.<value>`): paketler, proje tipi ve yolu, kapı kodları, belge türleri ve durumları, tedarikçi ve müşteri durumları, ürün durumları, görev durumları. `select-enum` bileşeni açıklamayı seçenek satırının altında küçük yazıyla ve seçili değerin yanında bilgi simgesiyle gösterir. Alan ipuçları mevcut `*_hint` kalıbıyla büyür. Sözlük rol bağımsızdır.

**Katman 2 — sayfa rehberi.** Her iş sayfasının başlığında "?" düğmesi; sağdan açılan yan panel (modal değil: kullanıcı okurken sayfayı kullanabilmeli). İçerik: bu sayfa ne için (2–3 cümle), sık yapılan işler adım adım (3–5 madde), ilgili sayfalara bağlantı, bu sayfanın terimleri (Katman 1'den otomatik). "Sık yapılan işler" rol duyarlıdır: koordinatör ve management aynı sayfada farklı liste görür; CASL yetkisine göre süzülür, ayrı içerik yazılmaz, her maddenin gerektirdiği yetki belirtilir. Panel ilk ziyarette bir kez kendiliğinden açılır; "bir daha gösterme" kullanıcı tercihi olarak saklanır (`localStorage`, hesaba bağlı değil). Giriş noktası dashboard: her kartın rehberi "bu kartı nasıl kapatırım" adımlarına bağlanır.

**İçerik:** TR ve EN elle yazılır (K7); diğer diller `pnpm i18n-sync` ile İngilizce kopya. İçerik i18n'de Markdown değil düz metin ve madde listesi (çeviri sağlığı için). Sözlük metinlerinin kaynağı 06 §1–§2 ve S12.

**İçerik sahipliği [benim kararım]:** sözlük ve rehber metinlerinin ilk taslağını geliştirici `ABOUT MOESA` belgelerinden (06 §1–§2, S12; repo dışında, `A:\job\e-commerce\moesa\ABOUT MOESA`) çıkarır; ürün sahibi TR metni gözden geçirir, EN geliştiricinindir. "Bir daha gösterme" tercihi sayfa başınadır (`guide.dismissed` altında tek bir `{ [route]: true }` objesi — 05.11.2026 sahip kararı), tek global bayrak değil.

**Sıra:** sözlük ve ipuçları M19 ile birlikte Faz 2 başında (küçük, bağımsız); sayfa rehberleri Faz 2 sonunda, ekranlar oturduktan sonra (her ekran değişimi rehber metnini de değiştirir).

**Katman 3 — terimler ve sistem rehberi (eklendi 05.11.2026, onaylandı).** Katman 1 yalnız enum değerlerini açıklar; metin ve etiketlerde geçen süreç kodları (S05, S08, S09, S12, S14–S17, Y10, K5, K6, K8), kısaltmalar (PI, PSI, ETD, ETA, CMR, GTIN, ASIN, OL/OT/OM) ve paket/kapı kodları (A, A0, B, G1–G4, L-G1, (M) kapı) açıklamasızdır.
- *Terim kayıt defteri:* tek kaynak `TERMS` (kod → kısa açıklama, uzun açıklama, kategori: süreç belgesi / kısaltma / paket / kapı / olay ailesi; varsa Drive belgesi bağlantısı). Paket, kapı ve olay ailesi girdileri Katman 1'in enum sözlüğünden türetilir, süreç kodları ve kısaltmalar eklenir. Metinler i18n'de (`terms.<code>.short`, `terms.<code>.long`), TR ve EN elle (K7).
- *Metin içi işaretleme:* rehber, sözlük ve ipucu metinlerinde kod `[[S09]]` biçiminde yazılır; bir metin bileşeni bunu noktalı altı çizili `<abbr>` + ipucuna (kısa açıklama) çevirir, tıklanınca rehber panelinin "Terimler" bölümü o kayıtta açılır. Metinler düz string kalır. Bilinmeyen bir token test tarafından yakalanır.
- *Formlar:* alan etiketinde kod geçen yerlerde (`PI kontrolü (S09)`, kapı, paket) aynı bileşen etiket yuvasında; `FormField`'a opsiyonel `term` prop'u. Enum seçeneklerinin ipuçları Katman 1'de kalır.
- *Sistem rehberi sayfası:* rol bağımsız tek sayfa, "?" panelinin altından ve kullanıcı menüsünden açılır. Bölümler: panel nasıl çalışır (müşteri filtresi, kartlar ve sekmeler, durum düğmeleri, belge sürümleri, şube/kiracı), süreç belgeleri (her kod bir paragraf + Drive bağlantısı), paketler, kapı seti, olay aileleri ve şiddetler, kısaltmalar. İçerik kayıt defterinden üretilir; sayfa rehberleri "ilgili sayfalar" gibi buna bağlanır. Rehber sayfasının kendi rehberi yoktur.
- *İçerik sahipliği:* geliştirici `ABOUT MOESA` belgelerinden taslaklar; TR sahibin onayından geçer.
- *Sıra:* Faz 2c'den sonra bağımsız dal, Faz 3'ten önce.

### M21 Kiracılar arası veri aktarımı (Faz 3, ilk görev) — eklendi 03.11.2026

**Amaç:** İki kiracıda da yetkili bir kullanıcı, seçtiği veriyi bir kiracıdan diğerine aktarabilsin: şube ↔ merkez, iki ayrı şirket, ya da kapanan (salt okunur) bir kiracıdan aktif olana. Ham `tenant_id` güncellemesi yetmez: salt okunur kiracıda UPDATE geçmez, bileşik FK'ler `ON UPDATE CASCADE` değildir, tedarikçi birden çok müşteriyle paylaşılır, belgeler polimorfik bağlıdır, geçmiş kapılar dondurulmuştur, kodlar kiracı başına tekildir, GTIN globaldir.

**Birim: müşteri paketi.** Bir müşteri seçilir; onunla kişileri, depoları, platform hesapları, markaları, ürünleri (varyantlarıyla), projeleri (kapı, görev, proje-ürün satırları), bağlı belgeleri ve ürünlerin tedarikçileri (kişileriyle) gider. Ürün listesinden seçili ürünler de aktarılabilir; ürün tek başına gidemez, müşterisi hedefte yoksa müşteri kaydı onunla gider. Tedarikçi hiçbir modda kaynaktan çıkmaz (paylaşılan kayıt): her zaman kopyalanır ya da hedefteki mevcut tedarikçiye eşlenir.

**İki mod.** *Kopyala:* kaynak dokunulmaz kalır. *Taşı:* hedefe yazılır, kaynaktan silinir (tedarikçi hariç); silme audit log'da eski satırla kalır, kod sayaçları ilerlemiş kalır (kod yeniden üretilmez), kaynaktaki GTIN serbest kalır. Taşı yalnız kaynak yazılabilirken; kaynak salt okunursa yalnız Kopyala sunulur. Kaydın kaynaktaki değişiklik geçmişi hedefe gitmez; hedefte kayıt "aktarımla geldi" audit girdisiyle başlar.

**Prova raporu (kuru çalıştırma), aktarımdan önce zorunlu:** tablo başına kayıt sayısı; hedefte çakışan müşteri/tedarikçi/proje kodları ve `(customer, sku)` çiftleri; aktif GTIN çakışmaları; hedefte üye olmayan kullanıcılar (`created_by`, `assignee_id`); belge sürüm çakışmaları; hedefin ayarlarına göre eksik kalacaklar (örn. spec sheet zorunluluğu). Her çakışma için kullanıcı kararı: *eşle* (hedefteki mevcut kayda bağla; müşteri ve tedarikçi için), *yeni kod ver* (proje/müşteri/tedarikçi kodu hedef sayacından üretilir), *GTIN'i boş bırak*, *atla*. Eşleşmeyen kullanıcı → `created_by` aktarımı yapan, `assignee_id` NULL.

**Uygulama:** tek `SECURITY DEFINER` fonksiyon `transfer_customer(source_tenant, target_tenant, customer_id, mode, decisions JSONB, dry_run BOOLEAN)`; tek işlem, hata olursa hiçbir şey yazılmaz. Kaynak ve hedef aynı şirket ağacındaysa, kaynak yazılabilirse ve prova çakışma göstermiyorsa fonksiyon `tenant_id` güncelleyerek taşır (ucuz yol; bileşik FK'lere `ON UPDATE CASCADE` eklenir, polimorfik belgeler ayrıca güncellenir); aksi halde yeni id'lerle kopyalar, Taşı modunda kaynakta FK sırasına göre siler. Geçmiş kapılar dondurma tetikleyicisini atlayarak yazılır; fonksiyon kapı sırasını ve durumunu kendisi doğrular. Sonuç `transfer` tablosu: kim, ne zaman, kaynak, hedef, mod, kararlar, eski→yeni id eşlemesi, rapor.

**Yetki:** her iki kiracıda da yetki şart (kaynakta ilgili tabloların `select`, hedefte `insert`). Aynı şirket ağacı içinde `management` yeter; iki ayrı şirket arasında yalnız her ikisinin de owner'ı. Hedef kiracı salt okunursa ya da planı iş modüllerini içermiyorsa aktarım reddedilir. Bu modül çapraz kiracı veri hareketinin tek yoludur; RLS politikaları değişmez.

**Aktarılmayanlar:** ayarlar, roller, kod sayaçları, audit geçmişi, dashboard okuma durumları. Drive bağlantıları olduğu gibi gider; M19 Storage dosyaları hedef kiracının klasörüne kopyalanır (M19 bu kopyayı baştan destekler: `media` satırı ve dosya birlikte).

**Kenar durumları (gözden geçirici sorularına kararlar, 03.11.2026) [benim kararım]:**
- *Tedarikçi her iki yolda da aynı adımdan geçer:* önce hedefte eşle-ya-da-kopyala, sonra ürünlerin `supplier_id`'si yeni id'ye çevrilir. Ucuz yol (`tenant_id` güncellemesi) yalnız müşteri köklü satırlara uygulanır; tedarikçi satırı hiçbir zaman `tenant_id` değiştirmez.
- *Paket dışına işaret eden satırlar:* tedarikçiye bağlı belgeler tedarikçi kopyasıyla birlikte **kopyalanır** (taşınmaz). Paylaşılan ortam (`customer_id` NULL) aktarılan ürüne bağlıysa `media` satırı ve dosyası kopyalanır, kaynaktaki kalır. Yalnız ürün aktarımında ürün geride kalan bir projede kullanılıyorsa Taşı **reddedilir** (prova raporu projeyi listeler; Kopyala serbesttir). Hiçbir durumda bağlantı sessizce düşürülmez.
- *Sonraki modüllerin tabloları:* fonksiyon bir tablo kayıt listesi (registry) üzerinden çalışır: hangi tablo, hangi FK ile müşteri/ürün/proje köküne bağlı, hangi sırada. pgTAP testi, `customer`/`product`/`project`'e FK'si olup listede olmayan bir tablo bulursa başarısız olur; M7–M16 her yeni tablosunu listeye ekler. M21 ilk sürümde Faz 1 ve Faz 2 tablolarını kapsar.
- *Storage dosyaları işlemsel değildir:* satırlar tek işlemde yazılır ve commit edilir; dosyalar sonra uygulama tarafından kopyalanır. `transfer.files_status` (`pending` / `done` / `partial`) ve eksik dosya listesi tutulur; "Dosyaları yeniden kopyala" düğmesiyle tekrar denenir. Taşı modunda kaynak dosyalar ancak kopya tamamlanınca silinir. İlk sürüm senkron RPC; paket büyüklüğü sorun olursa Edge Function'a taşınır (ayrı karar).
- *Prova ve uygulama arası tutarlılık:* uygulama çağrısı analizi yeniden çalıştırır ve çakışma kümesinin özetini (hash) prova raporuyla karşılaştırır; değiştiyse `transfer_report_stale` ile reddeder. `decisions` JSONB anahtarı `<tablo>:<kaynak_id>`, değeri `{action: map|new_code|clear_gtin|skip, target_id?}`.
- *"Aynı şirket ağacı":* `tenant.parent_id` zinciriyle aynı köke ulaşan iki kiracı. "Planı iş modüllerini içeriyor": `private.entitlements(target).modules` iş modüllerini (`ops_setting`, `document`, `supplier`, `customer`, `product`, `project` …) kapsıyor ve `writable` doğru. Bugün iş modülleri `is_core` olduğundan ilk koşul her planda sağlanır; kontrol yine de fonksiyonda durur.
- *Taşı'da kaynak silme:* gerçek silme, arşivleme değil; müşteri satırı dahil. Çocuklar önce, `ON DELETE RESTRICT` sırasına göre; dondurma tetikleyicileri (geçmiş kapı, proje sabit alanları) yazmada kullanılan aynı işlem-yerel bayrakla atlanır. Audit silme kayıtları olağan şekilde oluşur; kod sayaçları dokunulmaz.

**Ekran:** Müşteri kartı → "Aktar…" (ve ürün listesinde çoklu seçim → "Aktar…"): hedef kiracı seçimi (kullanıcının yetkili olduğu, kaynak dışındaki kiracılar), mod, prova raporu, karar formu, onay. Sonuç ekranı eşleme tablosunu CSV olarak verir.

### M11–M16 (Faz 3, sınır tanımı)

- **M11 Stok ve yeniden sipariş:** haftalık `stock_snapshot` (ürün × hücre: 30 gün satış, stok platform / depo / yolda) → kalan gün ve yeniden sipariş noktası (üretim + sevkiyat + güvenlik stoku) × günlük satış; PO önerisi taslağı üretir. Veri CSV ile girilir; API yok.
- **M12 Hesap sağlığı:** müşteri hesabı × hafta kontrol kaydı (puan, bildirim sayısı, bastırılmış listing, açık belge talepleri ve yaşları); 5 iş günü kuralı uyarısı. Platform vakaları M10 olay olarak, `case_ref` kısıtlı tabloda.
- **M13 Raporlar:** Cuma haftalık özet (müşteri başına: kapılar, sevkiyatlar, olaylar, kararlar) ve S03 aylık rapor, kayıtlardan üretilir, PDF'e basılır (PrintElementButton var).
- **M14 Kütüphane kartları:** platform / ülke / ürün tipi kartları: yapılandırılmış alanlar az (ad, kapsam, son güncelleme, sahip) + zengin metin + gerekli belge listesi (S12 kodları). Ürün tipi kartı, ürün kaydının uyum kontrol listesini besler.
- **M15 Müşteri portalı:** müşteri kullanıcısı `customer_user` eşlemesi ve `customer_viewer` rolüyle (satır koşulu `customer_id`, bkz. K1): projeler, kapılar, sevkiyatlar, raporlar salt okunur; (M) kapıda "Onaylıyorum" butonu → onay kaydı (kullanıcı, zaman, IP) + e-posta teyidi. Tedarikçi, maliyet ve iç notlar görünmez.
- **M16 İş geliştirme:** aday listesi (firma, platformlar, ülkeler, kategori, tahmini hacim, temas durumu, sonraki adım). Teklif kabulünde müşteriye dönüştürülür.

## 7. Roller ve yetkiler

Mevcut rol/izin sistemi (modül → izin → üretilen RLS) kullanılır. İzinler tablo × komut (select / insert / update / delete) + satır koşulu düzeyindedir; **sütun bazlı yazma izni yoktur.**

**Faz 1'de yalnızca iki rol vardır: `management` ve `coordinator`.** İkisi de tüm iş tablolarına tam yazar; fark yalnızca ayarlar ve müşteri sözleşme alanlarındadır (management). Aşağıdaki matris **hedef** durumdur; uzman roller gerçek kişiler kadroya girdikçe Faz 2–3'te açılır. Alan bazlı kısıtlar (finance yalnızca ödeme, compliance yalnızca uyum alanları) o zaman ya tablo bölünerek (`product_cost`, `product_compliance`) ya da RPC ile uygulanır; Faz 1 şeması düz tablolarla yapılır, bölme sonradan görünüm katmanıyla eklenir.

| Rol | Görür | Yazar | Onaylar |
|---|---|---|---|
| management | Her şey | Ayarlar, müşteri sözleşme alanları | Yönetim kapıları (C-G1), PO ödeme eşiği üstü, olay kapanışı |
| coordinator | Her şey (tedarikçi dahil) | Müşteri, proje, kapı, görev, belge, olay, CR | Koordinatör kapıları, CR |
| supply_qc | Ürün, tedarikçi, PO, belge | Ürün, tedarikçi, PO, spec belgeleri | G2 kanıtı, PSI |
| compliance | Ürün, belge, pazar hücresi uyum alanları | Uyum belgeleri, uyum durumu | G4 |
| content_listing | Ürün, pazar matrisi | Pazar hücresi içerik/durum alanları | L-G1 kanıtı |
| logistics | PO (okuma), sevkiyat, depo kartları | Sevkiyat, teslim kabulü | G5 kanıtı |
| finance | PO ödemeleri, maliyet alanları | Ödeme kayıtları | — |
| customer_viewer (Faz 3) | Kendi müşterisi: proje, kapı, sevkiyat, rapor | — | (M) kapı onayı |

Tedarikçi ve maliyet alanları `customer_viewer`'dan gizlenir: tedarikçi tablosuna izin verilmez, ürün maliyet alanları için müşteriye açık ayrı görünüm kullanılır (builder'a bırakıldı).

## 8. Teknik eşleme

Kod tabanı kalıbı değişmez; yeni modüller aynı reçeteyi izler (bkz. `app/src/api/role`, `views/pages/branch/role`, `router/routes/branch.ts`).

**Veritabanı**
- Yeni migrasyonlar `015_…`'ten itibaren, modül başına bir dosya (`015_customers.sql`, `016_suppliers.sql`, `017_products.sql`, `018_documents.sql`, `019_projects.sql`, …). Her dosya: tablolar + enum'lar, `private.enable_tenant_level_security` çağrısı, `audit_enable`, `module` satırı, `permission` satırları, gerekirse RPC.
- Tüm iş tabloları `tenant_id` taşır (MOESA kiracısı); müşteriye ait olanlar ayrıca `customer_id`. Tedarikçi, kütüphane kartı ve ayar tablolarında `customer_id` yoktur.
- **Abonelik katmanı:** yeni 16 modül `module.is_core = true` ile kaydedilir; böylece plan ve `plan_module` tanımlarına dokunulmaz, MOESA şirketi hangi planda olursa olsun modüller görünür. Super admin / plan ekranları ve `create-account` kaydı olduğu gibi kalır (bkz. §11 madde 2).
- Kod sayaçları: `code_sequence(tenant_id, kind, year, last_no)` + `next_code(kind)` fonksiyonu, satır kilidiyle.
- Enum'lar Postgres enum tipi; ekranda i18n.
- `document.entity_type/entity_id` polimorfik; bütünlük trigger ile (tür başına hedef tablo kontrolü).
- Hesaplanan görünümler: `product_evidence`, `project_gate_pending`, `dashboard_counts`. `queryKeys.ts` DERIVED/CASCADES haritasına eklenir.
- Supabase Storage (Faz 2): `evidence` bucket, klasör `<tenant_id>/<entity_type>/<entity_id>/`, yazma izni ilgili tablonun update iznine bağlı (tenant-logo kalıbı).

**Uygulama**
- `api/<entity>/index.ts` (`defineResource` ya da özel repo + zod şema + mapper), `views/pages/moesa/<entity>/{Index,Upsert}.vue`, `router/routes/moesa.ts`. Dialoglar route-dialog ile açılır.
- Proje kartı ve pazar matrisi pivotu iki yeni bileşen gerektirir (`PhaseStrip`, `MarketMatrixGrid`); kalan ekranlar ResourceTable + FormBox ile çıkar.
- CSV içe/dışa aktarma (M3): tarayıcıda parse, satır satır zod doğrulama, hata raporu, sonra toplu upsert RPC.
- i18n: `tr` ve `en` tam; diğer 11 dil makine çevirisi (mevcut script).
- Testler: zod şemaları, kod üretimi, GTIN kontrol basamağı, PI aritmetiği, yeniden sipariş hesabı için vitest; RLS ve RPC için Supabase SQL testleri (mevcut CI'daki `deno task test` kalıbı ya da pgTAP — builder seçer).

**Veri taşıma (Faz 1 sonunda) — sorumluluk**
- Geliştirici: Drive'daki EAN/SKU listelerini (OKAEI EAN LIST, Thometzki barkod listesi, MOP Product Master, LASTIK tablosu) S10 CSV formatına dönüştürür ve M3 içe aktarma ile yükler; içe aktarma raporu çakışan EAN/SKU'ları listeler. Drive okuma erişimi gerekir (bkz. §11 madde 8).
- Yönetim / koordinatör: çakışma listesindeki her satır için karar verir (hangi ürün doğru EAN'ı tutar, hangisi karantinaya alınır); kararlar panelde uygulanır.
- Geliştirici: THOMETZKI ve yönetimin seçtiği diğer müşterileri (E1) M1'e, beş tedarikçi (Kutlu, TEKIS, BTE, Cixi Fujing, PT Kertas) + Supplier Register'daki üçünü M2'ye girer; şart alanları yönetim cevaplayınca dolar.

## 9. Faz planı

Süreler tek geliştirici + Claude için; her faz çalışır ve kullanılır durumda biter, bir sonraki faz gerçek kullanımdan gelen geri bildirimle başlar.

| Faz | Süre | Kapsam | Kabul ölçütü |
|---|---|---|---|
| **1 — Tek doğru kaynak** | Kasım – Aralık 2026 (≈6 hafta) | M1, M2, M3, M4, M5, M6 (Faz 1 kutuları); ayarlar tablosu; CSV içe aktarma; veri taşıma; roller: management + coordinator | THOMETZKI'nin tüm aktif SKU'ları panelde; çakışan EAN'lar listelenmiş ve her birine karar atanmış (sıfıra indirme yönetimin işidir); her SKU'da spec sheet durumu görünür; en az bir gerçek proje kapılarıyla açık; Pazartesi toplantısı dashboard'dan yapılıyor |
| **2 — Operasyon** | Ocak – Şubat 2027 (≈7 hafta) | M19 (ilk), M7, M8, M9, M10; M6 Faz 2 kutuları; Storage ile kanıt yükleme (her belge türü için); M20 (son) | İlk yeni PO panelde açıldı ve PI aritmetik kontrolü yapıldı; ilk sevkiyat ETD'den teslime panelden izlendi; THOMETZKI mop ailesi için pazar matrisi dolu; ilk olay kaydı S17 ile tutuldu |
| **3 — Sürekli yönetim ve müşteri** | Mart 2027 → | M21 (ilk), M11, M12, M13, M14, M15, M16; sıra Faz 2 sonunda yeniden belirlenir | Aylık müşteri raporu panelden üretildi; çok ülke pilotu (Şubat–Nisan) pazar matrisinden yönetildi; müşteri en az bir (M) kapıyı portaldan onayladı |

**Faz 1 iç sırası:** ayarlar + kod sayaçları → M4 belge (diğerleri ona bağlanır) → M2 tedarikçi → M1 müşteri → M3 ürün (+CSV) → M5 proje/kapı → M6 dashboard → veri taşıma. Her modül: migrasyon → tipler → api → sayfalar → route → i18n → test, tek PR.

Uygulama planı (görev görev, dosya dosya) bu belge onaylanınca `superpowers:writing-plans` ile yazılır.

## 10. Builder'a bırakılanlar

- Tablo ve sütun adlarının son hâli, index'ler, enum değerlerinin tam listesi (bu belgedeki listeler çekirdek).
- Polimorfik belge bağının uygulanma biçimi (tek tablo + trigger, ya da bağ tabloları).
- Kapı başına zorunlu kanıt türü tablosunun nerede tutulacağı (sabit TS listesi ya da `gate_definition` tablosu).
- Pivot ve aşama şeridi bileşenlerinin görsel tasarımı (PrimeVue içinde kalmak şartıyla).
- CSV içe aktarma hata raporunun biçimi.
- Test stratejisinin ayrıntısı (SQL testleri için araç).
- `customer_viewer` için sütun gizleme yöntemi (görünüm, RLS sütun izni ya da ayrı RPC).

## 11. Kararlar (03.11.2026, ürün sahibi onayı)

Aşağıdaki sorular 03.11.2026'da "öneriler kabul" biçiminde kapandı. Geçerli kararlar: (1) müşteri düz tablo; (2) abonelik katmanı dokunulmaz, modüller `is_core`; (3) Faz 1'de yalnızca THOMETZKI yüklenir, diğer müşteriler yönetim seçtikçe eklenir; (4) belgeler Faz 1'de Drive bağlantısı; (5) spec sheet'siz PO engeldir, tarih ayardır; (6) kapı seti tablosu geçerlidir; (7) aşama kontrol listesi Faz 1'de kısa listeyle vardır; (8) Drive erişimi veri taşıma adımında istenir; (9) arayüz TR + EN, serbest metin EN; (10) portal Faz 3. Sorular kayıt için aşağıda bırakıldı.

1. **K1 — Müşteri düz tablo mu, alt kiracı mı?** Önerim düz tablo (K1'deki gerekçe: rol modeli, plan limiti, paylaşılan kayıtlar). Alt kiracı istenirse erişim modelinde "rol ağaçtan aşağı iner" değişikliği Faz 1'e eklenir (+1–2 hafta).
2. **Panel çok şirketli SaaS olarak mı kalıyor, yalnızca MOESA aracı mı?** Önerim: abonelik/plan katmanı dokunulmadan kalsın, yeni modüller çekirdek (`is_core`) olsun. Panelin ileride müşterilere satılması düşünülüyorsa modüller plana bağlanır ve `customer_id` yerine kiracı modeli yeniden değerlendirilir; bu, 1. maddeyi değiştirir.
3. **Faz 1'de hangi müşteriler ve ürünler yüklenecek?** THOMETZKI kesin; E1'deki diğer dört müşteri (iki mop alıcısı, yalıtım paneli, danışmanlık) panele girecek mi, yoksa yalnızca e-ticaret akışındakiler mi (D1-5)?
4. **Belgeler yalnızca Drive bağlantısı mı, Faz 2'de yükleme de mi?** Önerim: Faz 1 bağlantı, Faz 2'de kanıt türleri (kapı onayı, PSI, teslim tutanağı) için yükleme.
5. **Sert kuralların kapsamı (K3):** "spec sheet'siz PO gönderilemez" engel mi, uyarı mı? Belgeler engel diyor; geçiş tarihi 31.12.2026 ayar olarak tutulacak.
6. **Kapı seti tablosu (M5)** onaylanıyor mu? Özellikle reorder (G3→G4→G5) ve yalnız-B paketinde G4'ün olup olmadığı.
7. **Aşama kontrol listesi (K4) Faz 1'de olsun mu, yoksa yalnızca kapılar mı?** Önerim kısa listeyle olsun; MVP'nin 38 görevlik şablonu Faz 3'e.
8. **Drive erişimi:** Geliştiricinin veri taşıma için Drive'daki ürün listelerine okuma erişimi var mı; yoksa dosyalar dışa aktarılıp verilecek mi? Faz 1 takvimi buna bağlı.
9. **Dil:** Ekip çok uluslu (pano isimleri). Arayüz TR + EN yeterli mi; kayıtlardaki serbest metin hangi dilde tutulacak (öneri: EN, müşteriyle paylaşılan alanlarda DE opsiyonu)?
10. **Müşteri portalı zamanı:** Faz 3 başı mı, ilk yeni müşteri imzalandığında mı?
