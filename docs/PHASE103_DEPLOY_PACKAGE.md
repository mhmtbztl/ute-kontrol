# phase103 — satış rolüne yalnız kapalı tarihler (kullanıcı M83, 19.10.2026)

## Ne yapar

Arıza kayıtları (`maintenance_tickets`) phase53'ten beri yalnız defter
okuyucusuna (owner/admin/manager) açıktır. Satış ve izleyici rolü arızaları
okuyamadığı için fiyat takviminde bakımla **kapalı** günü "Açık" görüyor ve o
güne fiyat öneriliyordu (Claude tarayıcı turu, F.7.1).

Kullanıcı kararı: satışçıya arızanın ayrıntısı değil, yalnız "şu tarihlerde
kapalı" bilgisi gider. Yeni `get_property_closures(p_tenant_id, p_from, p_to)`
yalnız `(property_id, start_date, end_date)` döndürür; başlık, açıklama,
maliyet, atanan kişi **dönmez**. Tanım istemcideki `isTicketBlockingOn` ile
aynıdır (L-246): açık arıza + kapalı tarih aralığı → o aralık; aralığı olmayan
bloklayan/kritik arıza → yalnız bugün (Europe/Istanbul).

Yetki kayıt aramadan önce: `auth.uid()` + `can_read_sales` (owner, admin,
manager, sales, viewer); personel, yabancı işletme ve anon `42501`. Aralık en
fazla 400 gün. Tablo değişmez; `anon` yetkisi geri alınır, `schema_migrations` 103.

Göç yokken istemci kapalı tarihleri okuyamaz ve satış/izleyici takviminde
**"Bakımla kapalı günler bu rolde okunamadı (phase103 bekleniyor)"** uyarısı
çıkar — gün sessizce açık gösterilmez. Yönetim rolleri etkilenmez (arızanın
kendisini okurlar).

## Test projesinde

- `npm run test:bootstrap`: uygulandı (19.10.2026), doğrulama bloğu geçti.
- `phase103_property_closures_live_tests`: göçten önce 7 kırmızı, sonra 11/11
  (satış/izleyici aralığı görür, ayrıntı sızmaz, çözülmüş/iptal/aralık dışı
  dönmez, personel/yabancı/anon reddedilir, satış arızanın kendisini hâlâ
  okuyamaz).

## Üretime uygulama (kullanıcı)

1. Uygulamanın bu sürümü yayında olmalı (PR birleşmiş).
2. Supabase → SQL Editor →
   `supabase/migration_phase103_property_closures_for_sales.sql` dosyasının
   tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa işlem
   kendiliğinden geri alınır.
3. Bana "GÖÇ UYGULANDI" yazın; `production:readiness` ile `schema_migrations`
   103'ü ve anon `rpc/get_property_closures` → `401 42501` kapısını salt
   okunur doğrularım. Uygulanmadan önce aynı çağrı `404 PGRST202` döner (yeni
   fonksiyon), yani bu ölçüm göçü ayırt eder.

## Üretim durumu

20.10.2026: kullanıcı SQL Editor'de uyguladı (başarılı). Salt okunur doğrulama:
anon `rpc/get_property_closures` → `401 42501 permission denied for function`,
`production:readiness` BAŞARILI, `schema_migrations` 103 mevcut.
