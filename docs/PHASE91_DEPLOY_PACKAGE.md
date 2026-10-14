# phase91 — talebin ek ilgilendiği mülkler (L-186, kullanıcı M16)

## Ne yapar

Yeni tablo `lead_interest_properties` (talep ↔ mülk bağı). `leads.property_id`
asıl mülk olarak kalır; misafirin ayrıca baktığı mülkler bu tabloda durur.
`leads` tablosuna sütun eklenmedi: göç uygulanana kadar talep kaydı çalışmaya
devam eder, yalnız ek mülkler kaydedilmez ve kullanıcıya söylenir.

- Okuma `can_read_sales`, yazma `can_write_sales` (talebin kendi sözleşmesi).
- Talep ve mülk aynı işletmenin olmalı (`CROSS_TENANT_LEAD/PROPERTY`).
- `trg_tenant_id_immutable`, anon yetkisi yok, `schema_migrations` 91.
- Talep ya da mülk silinince bağlar cascade ile gider; kiracı sıfırlama
  ayrı liste gerektirmez.

## Test projesinde

- `BEGIN … ROLLBACK` kuru koşusu: `PHASE 91 OK` (14.10.2026).
- `npm run test:bootstrap`: uygulandı.
- `phase91_lead_interest_live_tests`: 13/13.

## Üretime uygulama (kullanıcı)

1. Uygulamanın phase91'i bilen sürümü yayında olmalı (PR birleşmiş).
   Eski sürüm tabloyu okumaz; zararı yok, sıra yalnız yeni özellik için önemli.
2. Supabase → SQL Editor → `supabase/migration_phase91_lead_interest_properties.sql`
   dosyasının tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa
   işlem kendiliğinden geri alınır.
3. Bana "GÖÇ UYGULANDI" yazın; üretime salt okunur sorarak doğrularım:
   anon ile `lead_interest_properties?select=lead_id&limit=0` →
   uygulanmamışsa `404 PGRST205`, uygulanmışsa `401 42501`.
