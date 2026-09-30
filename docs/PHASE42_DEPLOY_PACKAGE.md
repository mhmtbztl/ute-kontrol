# Phase 42 üretim paketi — adsız telefon talebi

Bu paket yalnız `leads.guest_name` sözleşmesini düzeltir. Telefonu bulunan bir
talebin adı henüz bilinmiyorsa kayıt üretimde reddedilmemelidir. Araç üretim
şemasına yazmaz; uygulama yalnız kullanıcının açık onayıyla Supabase Dashboard
→ SQL Editor üzerinden yapılır.

## Uygulama öncesi salt okunur kontrol

```sql
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leads'
  and column_name in ('guest_name', 'guest_phone')
order by column_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.leads'::regclass
  and conname = 'chk_lead_guest_identity';

select version, name
from public.schema_migrations
where version = 42;
```

Beklenen eksik durum: `guest_name.is_nullable = NO` veya migration defterinde
42 bulunmaması. Kontrol hiçbir kayıt oluşturmaz ya da değiştirmez.

## Kullanıcının uygulayacağı dosya

SQL Editor'de
`supabase/migration_phase42_lead_identity_contract.sql` dosyasının tamamını
tek seferde çalıştırın. Dosya kendi transaction'ını ve `PHASE42_*` doğrulama
bloğunu içerir. Hata görülürse devam etmeyin; uygulanmış dosyayı düzenlemeyin.

## Uygulama sonrası salt okunur doğrulama

Yukarıdaki üç sorguyu yeniden çalıştırın. Beklenen sonuç:

- `guest_name` ve `guest_phone` nullable (`YES`),
- `chk_lead_guest_identity` tanımı ad veya telefondan en az birini zorunlu
  kılar,
- `schema_migrations` satırı `42 / phase42_lead_identity_contract` değerini
  taşır.

Ardından yalnız salt okunur OpenAPI/yetki kapısını çalıştırın:

```powershell
$env:LEXBNB_CONFIRM_PRODUCTION_PROJECT = '<production-ref>.supabase.co'
npm run production:readiness
```

Phase11 ve phase44, 30.09.2026 ürün kararıyla bu readiness kapısının kapsamı
dışındadır. Dosyaları ve migration manifesti korunur; bu paket onları uygulama
talimatı vermez.
