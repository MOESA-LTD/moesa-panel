# Amazon SP-API ile Moesa Panel'de neler yapılabilir?

*Hazırlanma: 06.11.2026. Kaynak: Amazon SP-API dokümantasyonu (developer-docs.amazon.com/sp-api) ve panel modül tasarımı (2026-11-03).*

**Kısaca:** SP-API, müşterinin Seller Central hesabındaki veriyi (listing'ler, stok, siparişler, ödemeler, hesap sağlığı) okumamıza ve bazılarını değiştirmemize izin veren resmi arayüzdür. Her erişim **o satıcı hesabının sahibinin onayıyla** olur. Bugün elimizde çalışan bir **sandbox** uygulaması var. Sandbox gerçek veri değil, hazır örnek cevap döndürür.

Sandbox türleri (Amazon'un tablosuna göre):
- **Static:** her zaman aynı örnek cevap gelir. Kodun doğru yazıldığını test eder.
- **Dynamic:** isteğe göre değişen, gerçeğe benzer cevap gelir.
- **Yok:** sandbox'ta karşılığı yoktur.

---

## 1. Ne mümkün? (modül modül)

### M9 Pazar matrisi (`market_cell`) — ürünün kalbi

| SP-API'nin verdiği | Panelde somut kullanım | Sandbox | Production'da ek gereksinim |
|---|---|---|---|
| **Listings Items API** (okuma: `getListingsItem`, `searchListingsItems`; yazma: `putListingsItem`, `patchListingsItem`, `deleteListingsItem`) | Her hücrenin gerçek durumu (BUYABLE / DISCOVERABLE), listing'deki sorunlar (`issues`), fiyat ve SKU otomatik gelir. `live / suppressed` elle girilmez. | Static (+ yerel AI sandbox) | Satıcı yetkilendirmesi + **Product Listing** rolü. Yazma işlemi ancak Faz 4'te (K9). |
| **Reports API**: `GET_MERCHANT_LISTINGS_ALL_DATA`, `GET_MERCHANTS_LISTINGS_FYP_REPORT` (bastırılmış listing'ler), `GET_PAN_EU_OFFER_STATUS` | Günde bir kez müşterinin tüm listing'leri toplu çekilir. Bastırılmış listing'ler ve Pan-EU durumu hücrelere işlenir. | Static | Product Listing rolü |
| **Product Pricing API** (okuma; Featured Offer / Buy Box verisi) | Hücrede "Buy Box bizde mi, rakip fiyat ne" göstergesi | Static | **Pricing** rolü |
| **Listings Restrictions API** (okuma) | Bir ürün ilgili pazarda listelenebilir mi (kategori/marka kısıtı)? Sonuç, `market_cell.uyum durumu` ön kontrolüne girer. | Static | Product Listing rolü |
| **Notifications API**: `LISTINGS_ITEM_STATUS_CHANGE`, `LISTINGS_ITEM_ISSUES_CHANGE`, `ANY_OFFER_CHANGED`, `PRICING_HEALTH` | Durum değişince hücre anında güncellenir, beklemeden. | Static (yalnız abonelik çağrıları; olay gönderimi test edilemez) | AWS tarafında SQS kuyruğu veya EventBridge kurulumu |

### M3 Ürün ana tablosu (`product`) ve M19 Ortam (`media`)

| SP-API'nin verdiği | Panelde somut kullanım | Sandbox | Production'da ek gereksinim |
|---|---|---|---|
| **Catalog Items API** v2022-04-01 (okuma: `searchCatalogItems` GTIN/EAN ile, `getCatalogItem`) | GTIN → ASIN eşleştirmesi (`market_cell.platform_product_id`). Amazon'daki başlık, marka, ölçü, satış sıralaması ve görseller okunur, bizim kayıtla karşılaştırılır. | Static (+AI) | Product Listing rolü |
| **Product Type Definitions API** (okuma) | Amazon'un ürün tipine göre zorunlu attribute listesi. M17 `platform_attribute` katmanının şablonunu verir. | Static (+AI) | Product Listing rolü |
| **Listings Items API**, görsel attribute'ları (yazma) | `media_link` (`primary_image`, `gallery`) görsellerini listing'e gönderme | Static | Faz 4. Görsel URL'leri herkese açık olmalı (M19 notu). |
| **A+ Content Management API** | A+ içeriğinin durumunu görme ve gönderme (marka kayıtlı müşteriler için) | Static | Brand Registry + ilgili rol |

### M8 Sevkiyatlar ve M11 Stok

| SP-API'nin verdiği | Panelde somut kullanım | Sandbox | Production'da ek gereksinim |
|---|---|---|---|
| **FBA Inventory API** (okuma: `getInventorySummaries`) | FBA'daki satılabilir, rezerve ve yoldaki stok. M11 `stock_snapshot` CSV yerine buradan dolar. | **Dynamic** (+AI) | **Amazon Fulfillment** rolü |
| **Fulfillment Inbound API** v2024-03-20 (okuma ve yazma) | Amazon depolarına giden sevkiyat planı ve kabul durumu (CHECKED_IN, RECEIVING...). FBA teslimli `shipment` kayıtlarının son halkası olur. | Static | Amazon Fulfillment rolü |
| **Reports API**: `GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA`, `GET_RESTOCK_INVENTORY_RECOMMENDATIONS_REPORT`, `GET_STRANDED_INVENTORY_UI_DATA`, `GET_FBA_FULFILLMENT_INBOUND_NONCOMPLIANCE_DATA`, `GET_FBA_REIMBURSEMENTS_DATA` | Yeniden sipariş önerisi, sıkışmış stok, depo kabul uygunsuzluğu (M10 olay adayı), tazminatlar | Static | Amazon Fulfillment rolü |
| Notifications: `FBA_INVENTORY_AVAILABILITY_CHANGES` | Stok değişince uyarı | Static | SQS/EventBridge |
| **Amazon Warehousing and Distribution (AWD) API** | Müşteri AWD kullanıyorsa ara depo stoku | Static | Amazon Fulfillment rolü |

Not: Bizim M8 kaydı (konteyner, gümrük, forwarder) SP-API'de yoktur. Amazon yalnızca "Amazon deposuna varış ve kabul" kısmını bilir.

### M6 Dashboard ve M13 Raporlar (satış görünümü)

| SP-API'nin verdiği | Panelde somut kullanım | Sandbox | Production'da ek gereksinim |
|---|---|---|---|
| **Sales API** (`getOrderMetrics`) | "Son 7/30 gün satış adedi ve ciro" kutusu (müşteri ve ürün bazında). Kişisel veri içermez. | Static | **Inventory and Order Tracking** rolü |
| **Data Kiosk API** (GraphQL; Seller Sales and Traffic veri seti) | Aylık müşteri raporu (S03) için satış, trafik ve dönüşüm oranı | Static | Satıcı yetkisi + ilgili rol (Brand Analytics verisi için marka sahipliği) |
| **Reports API**: `GET_SALES_AND_TRAFFIC_REPORT`, `GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL` | Data Kiosk'a alternatif, dosya tabanlı | Static (+AI) | Inventory and Order Tracking |
| **Orders API** v2026-01-01 (`searchOrders`, `getOrder`; v0 artık deprecated) | Sipariş listesi. Panel için genelde gereksiz: Sales API ve raporlar yeterli. | Static (+AI) | Alıcı adı/adresi için **Restricted Data Token (RDT)** + kısıtlı rol (Direct-to-Consumer Shipping / Tax Invoicing). Bize gerekmez. |
| Notifications: `ORDER_CHANGE` | Sipariş durum değişimi | Static | SQS/EventBridge |

### M12 Hesap sağlığı ve M10 Olaylar (`incident`)

| SP-API'nin verdiği | Panelde somut kullanım | Sandbox | Production'da ek gereksinim |
|---|---|---|---|
| **Reports API**: `GET_V2_SELLER_PERFORMANCE_REPORT` (Account Health dashboard metrikleri), `GET_SELLER_FEEDBACK_DATA` | M12 haftalık kontrol kaydı (puan, geç sevk oranı, politika ihlalleri) otomatik dolar. Eşik aşılırsa M10 olay taslağı açılır. | Static | **Selling Partner Insights** rolü |
| Notifications: `ACCOUNT_STATUS_CHANGED` (NORMAL / AT_RISK / DEACTIVATED) | Hesap riske girince anında S1 olay ve yönetime bildirim | Static | SQS/EventBridge |
| Notifications: `LISTINGS_ITEM_ISSUES_CHANGE`, `BRANDED_ITEM_CONTENT_CHANGE`, `ITEM_PRODUCT_TYPE_CHANGE` | Listing bastırıldı, marka içeriği değişti → olay kaydı (bağlı kayıt = pazar hücresi) | Static | — |
| **Action Items API** ve **Action Plans API** (v2026-06-01, yeni; yalnız satıcılar) | Amazon'un satıcıya önerdiği yapılacaklar ("düzelt", "yeni AB pazarına aç") panelde görev olarak görünür. Action Plans ile, satıcı onayıyla uygulanır. | Static | Selling Partner Insights rolü; yalnız NA/EU |
| **Customer Feedback API** | ASIN bazında yorum ve iade gerekçesi özetleri → kalite olayları ve CR (M10) girdisi | Static | — |
| Reports: `GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA`, `GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE` | İade sayısı ve gerekçesi | Static | Amazon Fulfillment / Inventory and Order Tracking |

### Finans (M7 maliyet karşılaştırması, M13 aylık rapor)

| SP-API'nin verdiği | Panelde somut kullanım | Sandbox | Production'da ek gereksinim |
|---|---|---|---|
| **Finances API** v2024-06-19 (`listTransactions`) | Satış, komisyon, FBA ücreti, iade kesintileri. Landed cost ile gerçek marjın karşılaştırması yapılır. | Static | **Finance and Accounting** rolü |
| Reports: `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2` (otomatik oluşur), `GET_FBA_STORAGE_FEE_CHARGES_DATA` | Hesap kesimi (settlement) ve depolama ücretleri | Static | Finance and Accounting |
| **Product Fees API** | Bir fiyat için tahmini Amazon ücreti (hedef satış fiyatı hesabı, M3) | Static | Pricing rolü |

### M1 Müşteriler (`customer_platform_account`)

| SP-API'nin verdiği | Panelde somut kullanım | Sandbox | Production'da ek gereksinim |
|---|---|---|---|
| **Sellers API** (`getMarketplaceParticipations`) | Müşterinin hangi ülkelerde aktif olduğu otomatik doğrulanır. "Yetki durumu" göstergesi (K9 madde 5) buradan beslenir. | Static | Satıcı yetkilendirmesi |

### Kapsam dışı veya ayrı program

- **Reklam:** Amazon Ads API, SP-API'nin parçası **değildir**. Ayrı başvuru, ayrı yetkilendirme ve ayrı dokümantasyon gerektirir (advertising.amazon.com). Panelde reklam modülü planlanmadığı için şimdilik yok.
- **Vendor API'leri** (Vendor Orders, Vendor Shipments, Vendor Invoices, Vendor Direct Fulfillment, `GET_VENDOR_SALES_REPORT`, `GET_VENDOR_INVENTORY_REPORT`): yalnızca müşteri Amazon'a **toptan satan (1P, Vendor Central)** ise geçerlidir. Amazon'un PO'larını ve sevkiyatlarını bizim M7/M8'e bağlamak mümkündür. Bugünkü müşteriler 3P satıcı ise gereksizdir. Vendor yetkilendirmesi ayrı bir akıştır.
- **Merchant Fulfillment API ve Shipping API:** satıcı siparişi kendisi gönderiyorsa (FBM) kargo etiketi alır. Alıcı adresi gerektirir, dolayısıyla RDT ve kısıtlı rol (Direct-to-Consumer Shipping) ister. Panelimiz B2B tedarik ve operasyon aracı olduğu için ilgisiz.
- **Messaging API ve Solicitations API** (alıcıya mesaj, yorum isteme): Buyer Communication rolü ister, panelin işi değil.

---

## 2. Sandbox'ta bugün yapabileceklerimiz

**Tam kurulabilir (kod, tablo, ekran; sahte veriyle uçtan uca):**
- Pazar matrisi senkronu: `searchListingsItems` / `getListingsItem` cevabını `market_cell` alanlarına eşleme (durum, `platform_product_id`, `platform_sku`, fiyat, açık sorun notu). Static sandbox sabit örnek döndürür. Eşleme kodu ve ekran bununla tamamen test edilir.
- GTIN → ASIN eşleştirme akışı (`searchCatalogItems`). Mantık test edilir, sonuç sahte olur.
- Rapor akışı: `createReport` → `getReport` → `getReportDocument` → dosyayı parse et. Örnek dosya içeriği sabittir.
- FBA stok: FBA Inventory API **dynamic** sandbox'ı gerçeğe yakın, değişen cevap verir. Bu yüzden en anlamlı test burada yapılabilir.
- Bildirim aboneliği çağrıları (`createDestination`, `createSubscription`) ve bizim tarafta olay → `incident` kuralları. Kuralları, örnek bildirim JSON'u elle beslenerek test ederiz.
- Yerel "Sample AI sandbox" (Node 22 + AWS Bedrock gerekir), Catalog / Listings / Orders / Reports için senaryoya göre veri üretebilir. İsteğe bağlı.

**Gerçek veri olmadan anlamı olmayanlar:**
- Buy Box ve fiyat rekabeti, bastırılmış listing'lerin gerçek nedenleri, hesap sağlığı skorları, satış rakamları ve finans. Bunlar sandbox'ta mantığı doğrulanır ama karar verdirmez.
- Bildirimlerin gerçekten gelmesi. Sandbox olay üretmez, bunun için production ve gerçek bir satıcı hesabı gerekir.
- RDT gerektiren çağrılar: Amazon'a göre RDT sandbox'ta bile production'dan alınmalıdır. Zaten ihtiyacımız yok.
- Yazma işlemleri (`putListingsItem`, Feeds): sandbox kabul eder ama hiçbir şey olmaz. Gerçek doğrulama hataları yalnız production'da çıkar.

---

## 3. Önerilen ilk adımlar (değer ve emek sırasıyla)

### Önce iş kararı: müşterinin hesabına nasıl erişeceğiz?

Her müşteri ayrı bir Amazon satıcı hesabıdır. SP-API'de veri, **o hesabın sahibi uygulamamıza izin verdiğinde** gelir. Amazon'un kuralları:

| Uygulama türü | Kim yetkilendirir | Sınır |
|---|---|---|
| Private (özel) | Yalnız kendi kuruluşumuz (self-authorization) | En fazla 10. **Müşteri hesabı için uygun değil.** |
| Public, Appstore'da listelenmemiş | Her müşteri kendi Seller Central'ından OAuth ile "izin ver" der | **En fazla 25 satıcı** (vendor için sınırsız) |
| Public, Appstore'da listelenmiş | Aynı akış | Sınırsız. Appstore inceleme süreci gerekir. |

Bu nedenle panelin uygulaması **Public (listelenmemiş)** olmalıdır. Müşteri, panelde "Amazon hesabını bağla" düğmesine basar, Seller Central'da izin verir. Amazon bize bir yenileme anahtarı (refresh token) verir. Bu anahtar Vault'ta saklanır (K9 madde 5; tabloya yazılmaz). Panel yalnızca "bağlı / bağlı değil / süresi doldu" durumunu `customer_platform_account` üzerinde gösterir. Müşteri bu izni istediği an geri alabilir. Bu, müşteri sözleşmesine (MSA/SOW) bir madde olarak girmelidir. 25 müşteriyi aşarsak Appstore'a listelenmek gerekir.

Önce sahibin edinmesi gerekenler:
1. Developer profili onayı.
2. Public uygulama kaydı ve rol seçimi. Önerilen roller: Product Listing, Amazon Fulfillment, Selling Partner Insights, Inventory and Order Tracking, Finance and Accounting, Pricing. **Kısıtlı rollere (Direct-to-Consumer Shipping, Tax Invoicing) başvurmuyoruz**, çünkü alıcı kişisel verisine ihtiyacımız yok. Bu, onay sürecini ve güvenlik denetimini ciddi biçimde hafifletir.
3. OAuth dönüş adresi (panelin bir sayfası).
4. Her müşteriden yazılı onay ve hesabını bağlaması.

### Aday 1: Pazar matrisi senkronu (salt okuma) — en yüksek değer, orta emek
- **API'ler:** Listings Items API (`searchListingsItems`, müşteri SKU'larıyla), Reports API (`GET_MERCHANT_LISTINGS_ALL_DATA`, `GET_MERCHANTS_LISTINGS_FYP_REPORT`), Catalog Items API (GTIN → ASIN).
- **Veri nereye gider:**
  - `market_cell.durum` (live / suppressed / paused, Amazon durumundan eşlenir)
  - `platform_product_id` (ASIN), `platform_sku`, fiyat + para birimi
  - `son kontrol tarihi`, `açık sorun notu` (Amazon `issues` metni)
  - Eşleşmeyen GTIN'ler ayrı bir "eşleşme bekliyor" listesine düşer.
  - Yeni tablo önerisi: `platform_sync_run` (ne zaman, kaç hücre, kaç hata).
- **Kural:** Amazon'dan gelen durum, elle girilen durumla çelişirse panel uyarır. Pivot görünüm Amazon'u "doğru" kabul eder, ama L-G1 kapısı (içerik `approved`) bizde kalır.
- **Sandbox'ta:** eşleme ve ekran bugün yazılabilir.

### Aday 2: Bildirim → olay akışı — ikinci değer, orta-yüksek emek
- **API'ler:** Notifications API (`LISTINGS_ITEM_STATUS_CHANGE`, `LISTINGS_ITEM_ISSUES_CHANGE`, `ACCOUNT_STATUS_CHANGED`, `FBA_INVENTORY_AVAILABILITY_CHANGES`) + Amazon SQS veya EventBridge + bir edge function.
- **Veri nereye gider:**
  - Listing bastırıldı → `market_cell` güncellenir ve `incident` taslağı açılır (bağlı kayıt = pazar hücresi, şiddet kurala göre s2).
  - Hesap AT_RISK → `incident` s1, "yönetime bildirim zamanı" zorunlu.
  - Her olay `incident_log`'a not düşer.
- **Ek iş:** bir AWS hesabı ve kuyruk gerekir. Supabase'den doğrudan push alınamaz, kuyruğu periyodik okuyan bir fonksiyon gerekir.

### Aday 3: Hesap sağlığı ve stok anlık görüntüsü (M12, M11) — orta değer, düşük emek
- **API'ler:** `GET_V2_SELLER_PERFORMANCE_REPORT` (haftalık), FBA Inventory API (günlük).
- **Veri nereye gider:**
  - M12 hesap sağlığı kayıtları (müşteri × hafta)
  - M11 `stock_snapshot` (CSV girişini otomatikleştirir)
  - Dashboard "hesap sağlığı uyarıları" ve "yeniden sipariş" kutuları
- Aday 1 kurulduktan sonra aynı yetki ve rapor altyapısını kullandığı için ucuzdur.

Satış ve finans (Sales API, Finances API, Data Kiosk) bunlardan sonra gelir: M13 aylık rapor için değerlidir, ama operasyon kararlarını hemen değiştirmez.

---

## 4. Kısıtlar

- **Hız sınırları (rate limits):** Satıcı ve uygulama çifti başına uygulanır. Örnekler:
  - `getListingsItem` ve `searchListingsItems`: saniyede 5 istek.
  - Orders API v2026-01-01 `searchOrders`: saniyede 0,0056 istek (yaklaşık 3 dakikada bir).
  - Toplu veri için tekil çağrı yerine Reports API kullanılmalı.
  - Sandbox ayrıca saniyede 5 istek / burst 15 ile sınırlı ve yalnız işlevi test eder, ölçeği test etmez.
- **Kişisel veri (PII) ve RDT:** Alıcı adı ve adresi yalnız Restricted Data Token ve kısıtlı rollerle alınır. Amazon'un Data Protection Policy'si saklama süresi, şifreleme ve denetim şartları getirir. Önerimiz **PII'ye hiç dokunmamak**: panelin hiçbir modülü buna ihtiyaç duymuyor.
- **Veri saklama ve güvenlik:** SP-API verisi ve token'lar şifreli saklanmalı, erişim rol bazlı olmalı, loglara token yazılmamalı. Amazon, Data Protection Policy ve Acceptable Use Policy'ye uyumu kayıt sırasında sorar. Bunlar Vault ve RLS mimarimizle uyumlu.
- **Developer profili ve roller:** Production uygulama ancak profil onaylandıktan sonra açılır. Her rol ayrıca gerekçelendirilir. Rolü onaylanmamış API çağrısı 403 döner. Kısıtlı roller ek güvenlik denetimi ister.
- **Yetkilendirme sınırı:** Public listelenmemiş uygulamada en fazla 25 satıcı. Yetkiler müşteri tarafından geri alınabilir ve periyodik yeniden yetkilendirme gerekebilir. Panel "yetki düştü" durumunu göstermeli.
- **Sandbox sahte veridir:** Static sandbox her zaman aynı örneği döndürür. Sandbox'ta "çalışıyor" demek production'da doğru veri geleceği anlamına gelmez, yalnız kodun doğru konuştuğunu gösterir. Sandbox uygulamasını gerçek satıcı yetkilendiremez.
- **Sürüm değişiklikleri:** Amazon API'leri düzenli eskitir (ör. Orders API v0 deprecated, v2026-01-01'e geçiş istenir; Fulfillment Inbound v0 → v2024-03-20). Adaptör katmanı (K9 madde 4) bu nedenle tek yerde tutulmalı.
- **Kapsam:** Reklam (Ads API) ayrı programdır. Vendor (1P) API'leri yalnız 1P müşteride işe yarar. Yazma işlemleri (yayınlama) spec'e göre Faz 4'tür.
