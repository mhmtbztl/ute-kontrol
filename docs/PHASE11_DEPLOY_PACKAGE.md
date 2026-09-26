# Phase 11 üretim dağıtım paketi

Bu paket fiyatlandırma sözleşmesini üretime güvenli ve ileri yönlü olarak kurar. Araç üretim şemasına yazmaz; SQL yalnız Supabase Dashboard → SQL Editor'de kullanıcı tarafından çalıştırılır.

## Beklenen sözleşme

- 7 tablo: `pricing_profiles`, `pricing_rules`, `pricing_events`, `pricing_overrides`, `daily_rates`, `rate_change_logs`, `booking_quotes`
- `bookings.quote_snapshot` ve `bookings.pricing_source`
- `save_manual_pricing_override_atomic(uuid,uuid,date,date,numeric,text,boolean,integer)`
- `accept_booking_quote_atomic(uuid,uuid)`
- Phase 44 sonrası: `anon` tablo/RPC yetkisi yok, `tenant_id` değişmezlik ve yazma rolü tetikleyicileri var.

## Üretim ön kontrolü

Önce SQL Editor'de yalnız okuyun:

```sql
select to_regclass('public.' || x) as object_name
from unnest(array[
  'pricing_profiles','pricing_rules','pricing_events','pricing_overrides',
  'daily_rates','rate_change_logs','booking_quotes'
]) x;

select column_name, is_nullable
from information_schema.columns
where table_schema='public' and table_name='bookings'
  and column_name in ('quote_snapshot','pricing_source');

select to_regprocedure('public.save_manual_pricing_override_atomic(uuid,uuid,date,date,numeric,text,boolean,integer)'),
       to_regprocedure('public.accept_booking_quote_atomic(uuid,uuid)');
```

Phase11 hiç uygulanmadıysa nesneler `NULL`/boş döner. Kısmi durum varsa aşağıdaki idempotent işlem yine aynı hedef sözleşmeye taşır.

## Uygulama sırası

1. SQL Editor'de yeni sorgu açın, `BEGIN;` yazın.
2. `supabase/migration_phase11_pricing.sql` dosyasının tamamını yapıştırın.
3. `COMMIT;` yazıp tek seferde çalıştırın. Hata varsa transaction geri alınır; devam etmeyin.
4. Yeni sorguda `supabase/migration_phase44_pricing_late_deploy_hardening.sql` dosyasının tamamını çalıştırın. Dosya kendi transaction ve doğrulama bloğunu içerir.
5. PostgREST şema önbelleğini yenileyin:

```sql
notify pgrst, 'reload schema';
```

Phase42 ayrı bir sözleşmedir; Phase11 için önkoşul değildir. Ancak Dalga 2 üretim eşitliği için `migration_phase42_lead_identity_contract.sql` de ayrıca uygulanmalıdır.

## Etki ve bakım notu

İşlem yalnız DDL uygular; yedi yeni tablo ve iki nullable sütun ekler. Mevcut rezervasyon satırları yeniden yazılmaz. Kısa metadata kilitleri oluşabilir; aktif rezervasyon yazımının düşük olduğu bir pencere seçin. Phase44 yetki ve tetikleyicileri kurar; veri silmez.

## İşlem sonrası doğrulama

```sql
select count(*) = 7 as seven_tables
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname = any(array[
    'pricing_profiles','pricing_rules','pricing_events','pricing_overrides',
    'daily_rates','rate_change_logs','booking_quotes'
  ]);

select column_name, is_nullable
from information_schema.columns
where table_schema='public' and table_name='bookings'
  and column_name in ('quote_snapshot','pricing_source')
order by column_name;

select version, name from public.schema_migrations where version=44;
```

Ardından yerelde, yalnız salt okunur OpenAPI ve yetki problarıyla:

```powershell
$env:LEXBNB_CONFIRM_PRODUCTION_PROJECT = 'kirpcqklyjlrhvdbgdrq.supabase.co'
npm run production:readiness
```

Kapı sıfır çıkış vermeden dağıtım tamamlanmış sayılmaz.

## Yetki doğrulaması

Anon anahtarıyla her yedi tabloya `select=id&limit=0` çağrısı `401/403` ile `42501 permission denied` dönmelidir. Üretimde veri yazabilecek RPC'lere doğrulama amacıyla `POST` gönderilmez. RPC varlığı ve imzası service-role OpenAPI sözleşmesinden; anon yetkisinin kapalı olduğu ise transaction içindeki Phase44 doğrulaması başarıyla tamamlandıktan sonra yazılan `schema_migrations.version = 44` kaydından doğrulanır. Authenticated owner/admin/manager/staff davranışı üretimde kayıt yaratılarak ölçülmez; ayrılmış test projesindeki fiyatlandırma canlı süitlerinde ölçülür.

## Hata ve ileri yönlü kurtarma

- Phase11 transaction içindeyken hata verirse `ROLLBACK` sonrası hiçbir Phase11 nesnesi kalmaz.
- Daha önce transaction dışında kısmi uygulanmışsa dosya idempotenttir: Phase11'i transaction içinde yeniden çalıştırın, ardından Phase44'ü uygulayın.
- Uygulanmış migration dosyasını değiştirmeyin ve tablo/sütun silerek geri dönmeyin. Yeni kusur için sonraki boş çift phase numarasıyla ileri yönlü düzeltme hazırlayın.
- Uygulama kodu şemadan bağımsız kaldığı için, sorun halinde kod rollback'i yapılabilir; veritabanı nesneleri korunur.

Test projesi kanıtı (25 Eylül 2026): güncel şemaya geç uygulama, ikinci çalıştırma, yapay hata rollback'i ve 7 tablo + 2 sütun + 2 RPC denetimi yeşil.
