# Phase 70–76 dağıtım paketi

Bu paket A3 için dört yeni, değişmez göçü kapsar. **Üretime araç tarafından
uygulanmaz.** Kullanıcı açıkça onayladıktan sonra Supabase Dashboard → SQL
Editor üzerinden aşağıdaki sırayla çalıştırılır:

1. `supabase/migration_phase70_business_date_defaults.sql`
2. `supabase/migration_phase72_ads_metric_periods.sql`
3. `supabase/migration_phase74_tenant_logo_storage.sql`
4. `supabase/migration_phase76_ads_tenant_guard.sql`

## İçerik

- **Phase 70:** `properties.activated_on`, `expenses.expense_date` ve
  `leads.lead_date` varsayılanlarını Europe/Istanbul iş gününe bağlar.
- **Phase 72:** en fazla 31 günlük, aynı kampanyada çakışmayan reklam metrik
  dönemlerini ekler. Yönetim RPC'si harcamayı aynı işlemde Finans'a `Reklam`
  gideri olarak yazar; ay sınırını gün sayısına göre böler.
- **Phase 74:** 2 MB sınırındaki özel `tenant-assets` logo bucket'ını ve
  `<tenant_uuid>/logo/<dosya>` RLS politikasını ekler. Aynı göç L-118 için
  `property-media` politikalarındaki nesne adını `storage.objects.name` olarak
  niteler.
- **Phase 76:** phase72 test projesine uygulandıktan sonra tam regresyonun
  yakaladığı eksik `tenant_id` değişmezlik tetikleyicisini yeni, değişmez bir
  düzeltme göçüyle ekler. Uygulanmış phase72 dosyası değiştirilmemiştir.

## Test projesi kanıtı

1 Ekim 2026'da manifest sırasıyla `npm run test:bootstrap` çalıştırıldı; dört
göç de ayrı Supabase test projesine başarıyla uygulandı. Sonrasında:

- `phase70_business_date_defaults_live_tests`: 3/3
- `phase72_ads_metrics_live_tests`: 8/8
- `phase74_logo_storage_live_tests`: 7/7
- `phase76_ads_tenant_guard_live_tests`: 1/1

Phase 72 ve 74 canlı süitleri göçten önce sırasıyla eksik RPC/tablo ve eksik
bucket nedeniyle kırmızıydı. Bootstrap, üretim projesini hedeflemeyi kodla
reddeder.

## Üretim doğrulaması

Her dosyanın sonundaki doğrulama bloğu başarıyla tamamlanmalı ve NOTICE
satırı görülmelidir. Ardından üretime salt okunur olarak:

```sql
select version, name
from public.schema_migrations
where version in (70, 72, 74, 76)
order by version;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'tenant-assets';
```

Beklenen sürümler `70`, `72`, `74`, `76`; bucket `public = false`,
`file_size_limit = 2097152` olmalıdır. Gerçek işletme verisi veya kontrol
listesi bu göçlerle içe aktarılmaz.
