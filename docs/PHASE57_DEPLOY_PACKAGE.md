# phase57 — uygulama ve doğrulama paketi

> **SQL Editor'e yapıştırılacak dosya bu `.md` DEĞİLDİR.** Yalnız şu dosyanın tamamı:
> `supabase/migration_phase57_booking_payments.sql`
>
> Ön koşul: **phase53 uygulanmış olmalı** (dosya bunu kendisi denetler).

## Ne yapar

Rezervasyona **kapora, ara ödeme ve kalan ödeme** kaydı (`booking_payments`) ve
kalan tutarın tek hesap yeri (`booking_payment_balances` görünümü).

- **Ödeme nakit hareketidir, ciroyu değiştirmez.** Gelir K-04 gereği gecelere
  tahakkuk eder; ödeme defteri o hesaba hiç girmez. Sunucu anlık görüntüsü ve
  ay kapanış hesabı **değişmedi** — canlı süit ödeme ekleyip iki rakamın birebir
  aynı kaldığını ölçer.
- **Kalan saklanmaz:** tahsil edilecek = brüt − indirim (K-04 "Toplam Gelir"in
  rezervasyon satırı); kalan = tahsil edilecek − ödemeler. Fazla ödeme eksi
  kalan olarak görünür, gizlenmez. `bookings`'e sütun **eklenmedi** (§3.4).
- **Kapanmış dönem ödeme tarihine göre mühürlü:** kapanmış aydaki bir ödemenin
  tarihi, tutarı, rezervasyonu değişmez, silinmez; o aya yeni ödeme yazılmaz.
  Türü, yöntemi ve notu düzeltilebilir. Konaklaması kapanmış ayda olan
  rezervasyonun kalan ödemesi açık ayda alınabilir (gider defteriyle aynı mantık).
- **Ödemesi olan rezervasyon sessizce silinmez:** `BOOKING_HAS_PAYMENTS` —
  tahsil edilmiş para kaybolmasın. Önce ödeme silinir ya da rezervasyon iptal
  edilir. Sıfırlama ve işletme silme istisnadır (ödemeler birlikte gider;
  `reset_tenant_data` değişmedi).
- **Roller:** Satış (`sales`) okur ve yazar (kullanıcı kararı 30.09), silme
  yalnız yönetim; izleyici okur; personel görmez.

## Uygulama

1. SQL Editor → yeni sorgu → dosyanın tamamı → **Run**.
2. "Success. No rows returned" normaldir. Hata çıkarsa hiçbir şey değişmemiştir.

## Doğrulama (üretime kayıt bırakmaz)

```
GET /rest/v1/booking_payments?select=id&limit=0   (anon)
ÖNCE : 404 PGRST205    SONRA: 401 42501 permission denied for table
```
ve `npm run production:readiness` → `schema_migrations` içinde `57`.

## Test projesi

- `phase57_booking_payments_live_tests` **25/25** (göçten önce kırmızı).
- Rezervasyona silme tetikleyicisi eklendiği için yeniden koşuldu, hepsi yeşil:
  `tenant_reset_tests` 15/15, `account_deletion_tests` 15/15,
  `booking_crud_tests` 50/50, `phase45_cleaning_cost_live_tests` 28/28,
  `executive_snapshot_tests` 24/24.
- `phase57_booking_payments_tests` (çevrimdışı) 11/11 — ileriye dönük: ciroyu
  hesaplayan fonksiyonların son tanımı ödeme defterini okursa kırılır.
