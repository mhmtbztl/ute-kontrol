# phase49 — uygulama ve doğrulama paketi

> **SQL Editor'e yapıştırılacak dosya bu `.md` DEĞİLDİR.** Yalnız şu dosyanın tamamı:
> `supabase/migration_phase49_property_activation_floor.sql`

## Ne yapar

Mülkün **faaliyete başlama tarihi** (`properties.activated_on`) doluluk ve
RevPAR kapasitesinin başlangıcıdır. Varsayılanı kayıt günüydü ve form onu
yazmıyordu; geçmiş rezervasyonları içe aktarılmış mülklerde geçmiş ayların
kapasitesi **0** çıkıyordu (ana sayfa "79 / 0 Gece").

1. Mevcut veri: her mülkün tarihi, iptal edilmemiş en erken girişine çekilir.
2. Daha eski tarihli bir rezervasyon girilince tarih kendiliğinden geri çekilir.
3. Tarih ilk rezervasyondan sonraya alınamaz, boş bırakılamaz; kapanmış bir
   aya dokunan değişiklik reddedilir (1 ve 2 o durumda tarihi çekmez).

Yeni tablo, sütun ya da RPC yoktur. Göç uygulanmadan yayına alınan kod
**kırılmaz**: form alanı zaten var olan `activated_on` sütununu yazar.

## Uygulama

1. Supabase → SQL Editor → yeni sorgu.
2. `supabase/migration_phase49_property_activation_floor.sql` dosyasının
   **tamamını** yapıştırın, **Run**.
3. Beklenen bildirim:
   `PHASE 49 OK — faaliyet baslangici ilk rezervasyona cekildi (kapanmis donem nedeniyle atlanan mulk: 0).`
   Başka bir mesajla durursa hiçbir şey değişmemiştir (tek işlem); mesajı iletin.

## Doğrulama

Dışarıdan (anon) ayırt edilemez: yeni bir tablo ya da fonksiyon açılmıyor.
Kanıtlar:

- SQL Editor'deki `PHASE 49 OK` bildirimi (doğrulama bloğu veritabanının
  içinde koşar: tetikleyiciler, yetkiler ve "hiçbir konaklama faaliyet
  başlangıcından önce değil" değişmezi).
- Oturumlu hesapta Ağustos 2026 seçildiğinde ana sayfa "79 / 0 Gece" yerine
  gerçek bir kapasite (5 mülk × 31 = 155 gece) gösterir.

Test projesinde: `phase49_activation_live_tests` 12/12 (göçten önce 9 kırmızı),
`BEGIN…ROLLBACK` içinde iki kez koşuldu (idempotent).
