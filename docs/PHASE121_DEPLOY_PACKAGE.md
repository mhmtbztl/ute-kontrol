# phase121 — reklam verisinde TikTok ve "Diğer" platform

**Dosya:** `supabase/migration_phase121_ads_more_platforms.sql`
**Durum:** test projesine uygulandı (21.11.2026); üretim **kullanıcı onayı bekliyor**.

## Ne yapar
- `ad_metric_periods.platform` kısıtı: META, GOOGLE → META, GOOGLE, **TIKTOK, OTHER**.
- `save_ad_metric_period` (phase72) ve `import_ad_metric_batch` (phase113) platform kapısı aynı listeye genişler.
  Gövde dosyaya kopyalanmaz; göç veritabanındaki güncel gövdede yalnız platform listesini değiştirir,
  desen bulunamazsa `PHASE121_PLATFORM_GATE_NOT_FOUND` ile durur. İmza ve yetkiler aynı kalır.
- Yeni tablo, sütun ya da RPC yok; anon kapısı değişmez (doğrulama bloğu yeniden ölçer).

## Sıra
Kod önce yayına çıkabilir: göç yokken TikTok/Diğer kaydı sunucuda reddedilir ve istemci
"phase121 henüz uygulanmadı" der; Meta ve Google aynen çalışır.

## Uygulama
1. Supabase Dashboard → SQL Editor → dosyanın tamamını çalıştırın.
2. Beklenen: hatasız tamamlanma (`PHASE 121 OK` bildirimi).

## Doğrulama (salt okunur)
- `schema_migrations` içinde `121 phase121_ads_more_platforms`.
- `npm run production:readiness` BAŞARILI.
- Anon `rpc/import_ad_metric_batch` → `401 42501` (değişmemeli).

## Ağ
- Canlı: `core/phase121_ads_platforms_live_tests.js` 7/7 (TikTok dosyası istemci yolundan, elle "Diğer",
  bilinmeyen platform reddi, anon kapısı). phase111 20/20, phase113 12/12 göçten sonra yeşil.
- Çevrimdışı: `ads_import_parser_tests` T1–T7; tarayıcı: `npm run test:browser:ads`.
