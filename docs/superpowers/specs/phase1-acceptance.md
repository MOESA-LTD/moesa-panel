# Faz 1 kabul turu — Tek doğru kaynak

Kaynak: `2026-11-03-moesa-panel-modules-design.md` §9 (Faz 1 satırı) ve §7 (Faz 1 rolleri).
Ortam: yerel Supabase (`pnpm dev:supabase-reset`, seed: MOESA LTD), Vite `http://localhost:6161`.
Hesap: `akif@moesa-panel.test` / `Demo1234!` (management); rol kontrolü için `koordinator@moesa-panel.test`.
Tur: 03.11.2026, tarayıcıda (Chrome DevTools otomasyonu). Ekran görüntüleri:
`.superpowers/sdd/2026-11-03-phase1-single-source/screenshots/` (yerel, git dışı).

Durum: **Geçti** = ekranda yapılıp beklenen sonuç görüldü; **Kısmen** = araç hazır, ölçütün bir
parçası gerçek veri ya da süreç ister; **Açık** = panelde karşılığı yok.

## Kontrol listesi

| # | Ölçüt (§9 Faz 1) | Ekran ve eylem | Beklenen | Sonuç |
|---|---|---|---|---|
| 1 | THOMETZKI'nin tüm aktif SKU'ları panelde | Operasyon → Ürünler; üst çubukta müşteri filtresi `THO — THOMETZKI ONLINE HANDEL` | THO'nun 3 satırı (THO-CONES-100, THO-MOP40-2P, THO-TIPS-6-50), hepsi "On sale" | **Kısmen** — demo verisiyle geçti (`02-products-tho.png`). Gerçek SKU listesi, Drive'daki listelerin S10 CSV'ye dönüştürülüp içe aktarılmasıyla gelir (§8 veri taşıma; Drive erişimi gerekir, §11 madde 8) |
| 2 | Çakışan EAN'lar listelenmiş | Ürünler → İçe aktar; THO-MOP40-2P'nin GTIN'ini (4260696025800) taşıyan yeni bir SKU içeren CSV seç → İçe aktar | Hiçbir satır kaydedilmez; rapor "Row 1, gtin: GTIN already used by active product THO-MOP40-2P" | **Geçti** (`08-import-ean-conflict.png`). Dosya içi çakışma ve kontrol basamağı hatası da satır bazında listelenir |
| 2b | … ve her birine karar atanmış | Ürün kartında karar uygulanır: yanlış ürün arşivlenir (GTIN serbest kalır) ya da GTIN düzeltilir | Arşivlenen ürünün GTIN'i yeniden kullanılabilir (pgTAP 019) | **Kısmen** — kararın *uygulanması* panelde var; kararın kendisini (kim, ne zaman, neden) tutan bir çakışma listesi yok. Bkz. bulgu B4 |
| 3 | Her SKU'da spec sheet durumu görünür | Ürünler listesi, "Spec" sütunu; Dashboard → "Active SKUs without a signed spec" | THO-MOP40-2P `v02` (imzalı), diğer ikisi `None`; dashboard THO: 2 | **Geçti** (`02-products-tho-spec.png`, `01-dashboard-before.png`) |
| 4 | En az bir gerçek proje kapılarıyla açık | Operasyon → Projeler → THO-2026-001 "Mop ailesi çok ülke pilotu" → Görevler: P1'in kapıyı bloklayan görevi (50 Yol seçimi) "Done" → Genel bakış: G1 belgeleri → Ekle (Gate approval, Approved, Drive linki) → "Pass gate" (müşteri onay tarihi + onay belgesi) | "Gate passed"; proje P2'ye geçer; G1 Passed, G2 Pending | **Geçti** (demo projesiyle: `04-project-card-before.png`, `05-pass-g1-dialog.png`, `06-project-card-after-g1.png`). "Gerçek" proje, ürün sahibinin ilk canlı projeyi açmasıyla tamamlanır |
| 5 | Pazartesi toplantısı dashboard'dan yapılıyor | Dashboard (G1 geçişinden önce ve sonra) | Önce: "Management action" THO-2026-001 · G1. Sonra: G2 bekliyor (`dashboard_gate_pending`: G2 / supply_qc / müşteri onayı gerekli); SKU kanıt kartları THO 2/2; bildirimler okunur | **Geçti** (araç) — `01-dashboard-before.png`, `07-dashboard-after-g1.png`. Toplantının panelden yapılması bir süreç ölçütüdür; ilk Pazartesi toplantısında doğrulanır. Bkz. bulgu B3 |
| 6 | Roller: management + coordinator (§7) | `koordinator@…` ile giriş → Operasyon → Ayarlar | Ayarlar okunur, alanlar kilitli; iş tablolarına (proje) yazabilir. management ayarları değiştirebilir | **Geçti** (`10-coordinator-settings-readonly.png`; pgTAP `099_seed`: koordinatörün `setting` UPDATE'i 42501, proje UPDATE'i geçer) |
| 7 | Ayarlar tablosu | Operasyon → Ayarlar (management) | 8 ayar, kaynak sorusuyla; management düzenler | **Geçti** |
| 8 | CSV içe aktarma (dışa aktar → aynı dosyayı içe aktar) | Ürünler (filtre THO) → Dışa aktar → indirilen `urun_ana_tablosu_20261103.csv` → İçe aktar | "0 products added, 3 updated"; veriler değişmez (tedarikçi, fiyatlar korunur) | **Geçti** (`03-csv-import-roundtrip.png`; DB'de TR1/1.90 USD/2.65/12.99 aynı) |
| 9 | M1/M2 kayıtları (THOMETZKI, beş tedarikçi) | Müşteriler listesi; Tedarikçiler listesi | THO (Germany, Trading partner, A1 B C E, Active); TR1, TR2, CN1, CN2, ID1 Approved | **Geçti** (`09-suppliers.png`) |

Özet: 9 maddenin 7'si geçti, 2'si (1 ve 2b) kısmen — ikisi de gerçek veriyle (veri taşıma) ve
çakışma kararlarının kaydıyla ilgili; panel tarafı hazır.

## Bulgular

- **B1 (düzeltildi)** — Dashboard bildirimleri ve değişiklik geçmişi iş tablolarını ham anahtarla
  gösteriyordu ("fields.project_gate updated by …"). Rol izin seçicisi ve plan ekranları da modül
  adları için aynı `fields.<ad>` anahtarlarını kullanıyor. İş tablolarının ve modüllerinin adları
  `fields` altına eklendi (en, tr; diğer diller `pnpm i18n-sync` ile İngilizce). Test:
  `app/tests/plugins/i18n/fields.test.ts`.
- **B2 (düzeltildi)** — Ürün içe aktarma hatasında bildirim başlığı ham anahtar "toast.error"
  çıkıyordu. `toast.error` eklendi; koddaki her sabit i18n anahtarının kaynak dilde var olduğunu
  denetleyen test eklendi (`app/tests/plugins/i18n/usedKeys.test.ts`; bugün yalnızca bu eksik çıktı).
- **B3 (gözlem)** — Dashboard'da G2, "Awaiting customer approval" kartında görünür (G2 müşteri
  onayı ister); kapının sahibi olan rol (supply_qc) kartta yazmaz. Veri görünümde var
  (`dashboard_gate_pending.owner_role`). Uzman roller Faz 2'de açılınca kartta rol gösterimi
  eklenebilir.
- **B4 (açık)** — "Her çakışan EAN'a karar atanmış" ölçütü için kararın kaydı yok: içe aktarma
  çakışmayı listeler, karar ürün kartında uygulanır (arşivle / GTIN düzelt), ama hangi çakışmaya
  kimin ne karar verdiği tutulmaz. Gerçek veri taşımadan önce ürün sahibiyle karar verilmeli:
  ürün notuna yazmak yeterli mi, yoksa ayrı bir çakışma listesi mi?
- **B5 (gözlem)** — Dışa aktarılan S10 dosyasında `spec_surumu`/`spec_imzali` sütunları boş
  (THO-MOP40-2P'nin imzalı v02'si olduğu halde). Bu sütunlar bilerek "ertelenmiş" (Faz 2, belge
  kayıtlarından doldurulacak); listede ve dashboard'da spec durumu doğru görünür.
- **B6 (gözlem)** — Belge ekleme penceresi kaydettikten sonra açık kalıyor (kayıt başarılı,
  liste yenileniyor); kullanıcı kapatmalı. Proje kartı penceresi büyütülünce yatay kaydırma çubuğu
  çıkıyor.

## Tekrar çalıştırma

```sh
cd app
pnpm dev:supabase-reset   # migrasyonlar + seed (MOESA LTD)
pnpm test:db              # 099_seed seed'in kendisini doğrular
pnpm dev:vue              # http://localhost:6161, akif@moesa-panel.test / Demo1234!
```

Tur veriyi değiştirir (G1 geçer, görev "Done" olur, G1 onay belgesi eklenir); tekrar için
`pnpm dev:supabase-reset`.
