# phase101 — günlük fiyat kaydı (kullanıcı M76 / F.2.9, 19.10.2026)

## Ne yapar

Fiyat takvimi her gün için öneri hesaplıyordu ama öneri hiçbir yere
uygulanamıyordu: işletme "bu fiyatı kullan" diyemiyor, bir günün fiyatını elle
değiştiremiyordu (L-255).

Yeni `property_daily_prices` tablosu işletmenin **onayladığı** fiyatı tutar:

| `source` | Ne |
|---|---|
| `APPROVED` | Öneri olduğu gibi onaylandı (`price = suggested_price`) |
| `MANUAL` | İşletme elle başka fiyat yazdı (öneri `suggested_price`'ta kalır) |

- Kayıt referanstır: OTA'ya gönderilmez, rezervasyon tutarını kendiliğinden
  değiştirmez. Rezervasyon formu seçilen geceler için "Fiyat takvimi: 3 gece ·
  ₺… — 2 onaylı, 1 öneri" yazar.
- Benzersizlik **tam kısıt** `(property_id, price_date)`; istemci
  `upsert(..., { onConflict: 'property_id,price_date' })` gönderir (§5.15).
- Yetki (§3.3.1): okuma `can_read_sales` (satış ve izleyici görür), yazma
  `can_manage_tenant`; personel okuyamaz; `anon` erişemez; `tenant_id`
  değişmez; başka işletmenin mülkü kullanılamaz (`CROSS_TENANT_PROPERTY`);
  `updated_by` oturumdan yazılır.
- Defter değildir: kapanmış dönem koruması yok.
- `reset_tenant_data` günlük fiyatları da boşaltır (phase97 gövdesi + bir satır;
  `phase59_context_tests` D4 ölçer).
- `schema_migrations` 101.

`properties`'e sütun eklenmedi (§3.4 dağıtım sırası tuzağı). Göç yokken fiyat
takvimi açılır ve yalnız öneriyi gösterir; düzenleyici "phase101 göçü bekleniyor"
yazar, kayıt yapılmaz.

## Test projesinde

- `npm run test:bootstrap`: uygulandı (19.10.2026), doğrulama bloğu geçti.
- `phase101_daily_prices_live_tests`: göçten önce kırmızı (tablo yok), göçten
  sonra 18/18 (yazma/upsert, roller, kiracı sınırı, anon, sıfırlama).
- Yeniden tanımlanan sıfırlamanın eski ağı: `tenant_reset_tests` 15/15,
  `phase97_income_live_tests` 26/26.

## Üretime uygulama (kullanıcı)

1. Uygulamanın phase101'i bilen sürümü yayında olmalı (PR birleşmiş). Önce
   uygulanırsa da sorun olmaz: eski istemci tabloyu okumaz.
2. Supabase → SQL Editor → `supabase/migration_phase101_property_daily_prices.sql`
   dosyasının tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa işlem
   kendiliğinden geri alınır.
3. Bana "GÖÇ UYGULANDI" yazın; üretime salt okunur sorarak doğrularım: anon
   `property_daily_prices` sorgusu `401 42501` (öncesinde `404 PGRST205`) ve
   `production:readiness` ile `schema_migrations` 101.

## Üretim durumu

19.10.2026: kullanıcı SQL Editor'de uyguladı (başarılı). Salt okunur doğrulama:
anon `property_daily_prices` sorgusu `401 42501 permission denied for table`;
`production:readiness` BAŞARILI, `schema_migrations` 101 mevcut.
