# phase111 — Meta CSV içe aktarımı: kampanya açma, çakışan günleri değiştirme (05.11.2026)

## Ne yapar

phase82'nin toplu reklam RPC'si gerçek Meta dosyasında üç yerde takılıyordu:

1. Her kampanya önce elle açılmak zorundaydı; eşleşmeyen ad tüm aktarımı durduruyordu.
2. Aynı günleri kapsayan ikinci yükleme (ay ortası + ay sonu indirme) gün
   tekilliğine `(campaign_id, day)` takılıp tümüyle reddediliyordu.
3. Mesaj/arama dışındaki sonuç sayısı (profil ziyareti, açılış sayfası
   görüntüleme) ve dosyadaki ek sayaç sütunları saklanamıyordu.

phase111:

- `ad_metric_periods`'a iki **nullable** sütun ekler: `results` (sonuç sayısı,
  türü ne olursa olsun) ve `extra_metrics` (JSONB, dosyadaki ek toplanabilir sayaçlar).
  Yazma yalnız RPC'den yapıldığı için göç uygulanmadan yayına çıkan kod kayıt
  akışını kırmaz (§3.4 dağıtım tuzağı).
- `import_ad_metric_batch(p_tenant_id, p_new_campaigns, p_rows)` — tek işlemde:
  yeni kampanyaları açar (aynı ad + platform varsa yenisini açmaz), dosyanın
  **tamamen** kapsadığı eski dönemleri gider satırlarıyla birlikte siler, yeni
  dönemleri phase72'nin gider dağıtımından geçirerek yazar.
- Kısmi kapsama durdurur (`ADS_PARTIAL_OVERLAP`): "1–31 Ekim" kaydının üstüne
  yalnız 1 Ekim gelirse 2–31 Ekim kaybolmaz.
- Kapanmış aya düşen değiştirme mevcut `CLOSED_PERIOD_VIOLATION` korumasıyla
  tüm işlemi reddeder.
- Yetki: `can_manage_tenant` **ve** `can_write_ledger` (gider yazdığı için, §3.3.1).
  `anon` yetkisi geri alınır. Satır sınırı 3000 (günlük × kampanya dosyası 500'ü aşar).

phase72/82 fonksiyonlarına dokunulmaz; elle dönem ekleme ve eski toplu yol aynen çalışır.

## Test projesinde

`npm run test:bootstrap`: uygulandı. `phase111_ads_import_live_tests` göçten önce
kırmızı (`42703 column ad_metric_periods.results does not exist`), sonra 20/20:
kampanya açma, sonuç + ek metrik, mükerrer gidersiz değiştirme, kısmi kapsamada
tam ret, aylık → günlük dönüşüm, atomiklik, kapalı ay, rol/izin, anon, çapraz kiracı.

## Üretime uygulama (kullanıcı)

1. SQL Editor → `supabase/migration_phase111_meta_ads_import.sql` tamamı.
2. "GÖÇ UYGULANDI" yazın. Doğrulama (salt okunur):
   - anon `rpc/import_ad_metric_batch` → önce `404 PGRST202`, sonra `401 42501`;
   - `ad_metric_periods?select=results,extra_metrics&limit=0` → `42703` değil;
   - `schema_migrations` 111, `production:readiness`.

## Üretim durumu

5 Kasım 2026: kullanıcı uyguladı; doğrulandı — anon `rpc/import_ad_metric_batch` ve
`ad_metric_periods?select=results,extra_metrics` → `401 42501`, `production:readiness`
BAŞARILI, `schema_migrations` 111.
