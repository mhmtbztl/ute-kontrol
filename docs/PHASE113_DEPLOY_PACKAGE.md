# phase113 — reklam günlük dökümü kampanya × ay başına tek satır (05.11.2026)

## Neden

Kullanıcı: "az veri harcayacak şekilde yapalım; SaaS'ta backend masrafım artabilir."

phase111 ile Meta'nın günlük dökümü her gün × kampanya için ayrı dönem satırı
açıyordu; phase72'nin gider dağıtımı da her dönem için ayrı gider satırı yazıyordu.
6 kampanyalı bir ay: 186 dönem + 186 gider satırı. Finans gider listesi de aynı
oranda kalabalıklaşıyordu.

## Ne yapar

- `ad_metric_periods.daily_metrics JSONB NULL` (dizi). Gün kaydı yalnız
  `d` (gün), `s` (harcama), `i` (gösterim), `c` (tıklama), `r` (sonuç) taşır.
- `import_ad_metric_batch` yeniden tanımlanır (imza aynı): satır `daily` taşıyabilir.
  Sunucu doğrular: dizi 1–31 gün, gün dönem içinde ve tekil, bilinmeyen alan yok,
  sayaçlar negatif olmayan tam sayı, **günlük harcamaların toplamı dönem harcamasına
  eşit** (`ADS_DAILY_SPEND_MISMATCH`). Aksi halde grafik ile Finans farklı rakam söylerdi.
- İstemci (`AdsImportParser.compactDaily`) günlük dökümü kampanya × takvim ayı
  başına tek satıra toplar. Ay ortası + ay sonu yüklemesinde aynı ayın kayıtlı
  günleriyle birleştirir; sunucu için bu tam kapsama ve phase111'in değiştirme yoludur.
  phase113'ten önce yüklenmiş tek günlük kayıtlar da aynı aya katlanır.
- Yeni tablo yok, phase72/82 fonksiyonları değişmez; tek dönem tek ay olduğu için
  tek gider satırı doğar.

Sonuç: aynı ay **6 dönem + 6 gider satırı** (93 günlük dosya satırı → 3 + 3 ölçüldü).

## Test projesinde

`npm run test:bootstrap`: uygulandı. `phase113_ads_daily_compact_live_tests` göçten
önce kırmızı (`42703 column ad_metric_periods.daily_metrics does not exist`), sonra
12/12. `phase111_ads_import_live_tests` yeni gövdeye karşı 20/20 (gerileme yok).

## Üretime uygulama (kullanıcı)

1. SQL Editor → `supabase/migration_phase113_ads_daily_compact.sql` tamamı.
2. "GÖÇ UYGULANDI" yazın. Doğrulama (salt okunur):
   - `ad_metric_periods?select=daily_metrics&limit=0` → `42703` değil (`401 42501`);
   - anon `rpc/import_ad_metric_batch` → `401 42501` (kapı yerinde);
   - `schema_migrations` 113, `production:readiness`.

Göç uygulanmadan yayına çıkan istemci `daily` gönderirse phase111 gövdesi alanı
yok sayar: toplamlar doğru yazılır, yalnız günlük kırılım kaybolur. Bu yüzden
yükleme ekranı (Aşama 3) göç doğrulandıktan sonra yayına alınır.

## Üretim durumu

5 Kasım 2026: kullanıcı uyguladı; doğrulandı — anon `ad_metric_periods?select=daily_metrics`
→ `401 42501`, `production:readiness` BAŞARILI, `schema_migrations` 113.
