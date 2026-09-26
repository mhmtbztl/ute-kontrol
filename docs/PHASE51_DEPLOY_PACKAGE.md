# phase51 — uygulama ve doğrulama paketi

> **SQL Editor'e yapıştırılacak dosya bu `.md` DEĞİLDİR.** Yalnız şu dosyanın tamamı:
> `supabase/migration_phase51_booking_delete_reopens_lead.sql`

## Ne yapar

Talepten dönüştürülen bir rezervasyon silindiğinde bağlı talep **kazanıldı**
(WON) durumunda kalıyordu: olmayan satış dönüşüm oranında sayılıyor, talep de
"kazanılmış satış" diye silinemiyordu. Artık `delete_booking_atomic` aynı işlemde
talebi **teklif gönderildi** (QUOTE_SENT) durumuna döndürür. Kullanıcı isterse
sonra "kaybedildi" yapar.

Geriye dönük veri düzeltmesi yoktur: rezervasyon bağı olmayan WON talep, elle
işaretlenmiş gerçek bir satış olabilir. Yeni tablo, sütun ya da RPC yoktur.

## Uygulama

1. Supabase → SQL Editor → yeni sorgu.
2. `supabase/migration_phase51_booking_delete_reopens_lead.sql` dosyasının
   **tamamını** yapıştırın, **Run**.
3. "Success. No rows returned" normaldir (editör bilgi mesajını her zaman
   göstermez). Kırmızı bir hata çıkarsa hiçbir şey değişmemiştir; mesajı iletin.

## Doğrulama

Fonksiyonun imzası değişmediği için dışarıdan (anon) ayırt edilemez. Kanıt:
oturumlu hesapta `schema_migrations` defterinde `51` satırı ya da
SQL Editor'deki `PHASE 51 OK` bildirimi (doğrulama bloğu fonksiyon gövdesini
veritabanının içinde okur).

Test projesinde: `phase51_lead_revert_live_tests` 6/6 (göçten önce 1 kırmızı),
`BEGIN…ROLLBACK` içinde iki kez koşuldu (idempotent).
