# phase115 — rakip araştırmasında rakip adı (kullanıcı, 08.11.2026)

## Ne yapar

`competitor_price_research` (phase78) satırları yalnız mülk + tarih taşıyordu;
aynı rakibin fiyatı zaman içinde izlenemiyor, "en fazla 5 rakibin ortalaması"
hesaplanamıyordu. Göç tek bir sütun ekler:

- `competitor_name TEXT NULL` — boş/yalnız boşluk/baş-son boşluklu ad ve
  120 karakterden uzun ad `CHECK` ile reddedilir; ad verilmezse `NULL`.
- Eski satırlar `NULL` kalır ("adsız"); geriye dönük ad **uydurulmaz**.
- Rakip bazında arama için kısmi indeks.
- Yetki, RLS, `tenant_id` değişmezliği ve sıfırlama listesi phase78/phase41'den
  gelir; göç dokunmaz. Doğrulama bloğu sütunu, kısıtı, anon kapısını ve
  tetikleyiciyi ölçer; `schema_migrations` 115.

Rakip ortalaması **yalnız gösterimdir**, öneri motoruna girmez (kullanıcı kararı).

## Göç yokken (dağıtım sırası, CLAUDE.md §3.4)

İstemci ayrı bir yoklama isteği atmaz (göç yokken her açılışta konsola 400
düşerdi). Durumu mevcut kayıtlardan anlar: satırlar sütunu taşıyorsa hazır,
satır var ama sütun yoksa hazır değil. Hazır değilken rakip adı alanı kilitli,
araştırma eskisi gibi adsız kaydedilir. Hiç kayıt yoksa ilk kayıt adla denenir;
sütun yoksa kayıt **adsız tekrarlanır** ve kullanıcıya "rakip adı
kaydedilemedi: phase115 göçü henüz uygulanmamış" denir. Araştırma kaydı hiçbir
durumda kırılmaz.

## Test projesinde

- `npm run test:bootstrap`: uygulandı (08.11.2026), doğrulama bloğu geçti.
- `phase115_competitor_name_live_tests`: göçten önce 9 kırmızı, sonra 13/13
  (istemcinin gerçek `saveResearch` çağrısı, CHECK sınırları, satış okur/yazamaz,
  yabancı işletme göremez, anon 42501, adsız kayıt düzenlemeyle ad alır).
- `phase78_pricing_expense_live_tests` 24/24, `tenant_backup_live_tests` 10/10
  (yedek → sıfırlama → geri yükleme yeni sütunla birebir).

## Üretime uygulama (kullanıcı)

1. Uygulamanın bu sürümü yayında olmalı (PR birleşmiş). Sıra önemli değil:
   göç önce de uygulanabilir, istemci her iki durumda çalışır.
2. Supabase → SQL Editor → `supabase/migration_phase115_competitor_name.sql`
   dosyasının tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa
   işlem kendiliğinden geri alınır.
3. Bana "GÖÇ UYGULANDI" yazın; `production:readiness` ile `schema_migrations`
   115'i salt okunur doğrularım. Anon kapısı göçten önce de kapalı olduğu için
   (`401 42501`) anon sorgusu bu göçü ayırt etmez; kanıt defter satırı ve
   doğrulama bloğudur.

## Üretim durumu

08.11.2026: kullanıcı SQL Editor'de uyguladı (başarılı). Salt okunur doğrulama:
 BAŞARILI,  115 mevcut. İstemci aynı gün
yayına alındı (PR #64).
