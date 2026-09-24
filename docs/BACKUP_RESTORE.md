# Yedek ve geri yükleme

Supabase Free planda otomatik yedek yok. **K-01:** ilk müşteri gerçek veri
girmeden Pro'ya geçilir; o güne kadar yedek **haftalık** elle alınır.

## Yedek almak

```powershell
npm run backup                     # üretim: tüm tablolar, kullanıcılar, fotoğraf listesi
npm run backup -- --with-storage   # fotoğrafların kendisi de indirilir
```

- Hedef: `Masaüstü\lexbnb-yedekler\<tarih-saat>\` — **deponun dışında.**
  Yedek müşteri verisi içerir (misafir adları, telefonlar, e-postalar);
  depo içindeki bir klasör verilirse betik reddeder. Başka bir yer için
  `LEXBNB_BACKUP_DIR`.
- Tablolar elle listelenmez; veritabanının kendi tanımından keşfedilir.
  Yeni bir tablo eklendiğinde yedek onu kendiliğinden kapsar.
- Betik veritabanına **hiçbir şey yazmaz.**
- Sonuç `manifest.json`: her tablonun satır sayısı ve sha256 özeti.
  Herhangi bir tablo okunamazsa betik `YEDEK EKSIK` der ve hata koduyla
  çıkar — o yedek geri yüklenmez.
- Şifreler yedekte **yoktur** (Supabase API'si vermez). Geri yüklenen
  kullanıcılar "Şifremi unuttum" ile yeni şifre belirler.

Yedek klasörünü ikinci bir yere (harici disk / bulut sürücü) kopyalayın;
bilgisayarın kendisi tek kopya olmamalı.

## Geri yüklemek

```powershell
# Tek işletme (yanlışlıkla sıfırlanan / silinen işletmeyi kurtarma)
npm run restore -- "<yedek-klasörü>" --tenant <işletme-uuid> --confirm-production kirpcqklyjlrhvdbgdrq

# Önce denemek için test projesine
npm run restore -- "<yedek-klasörü>" --env .env.test --tenant <işletme-uuid>
```

Kurallar:

- **Var olan satıra dokunulmaz.** Yalnızca eksik satırlar eklenir; güncel
  veri eski yedekle ezilmez. Aynı komutu iki kez çalıştırmak bir şey
  çoğaltmaz.
- **Üretime tüm yedek yüklenemez.** Betik bunu reddeder. Projenin tamamı
  kaybolduysa: yeni bir Supabase projesi açılır, şema `npm run
  test:bootstrap` ile kurulur, yedek oraya yüklenir, doğrulanır, sonra
  uygulama o projeye yönlendirilir.
- Tablolar ebeveynden çocuğa yüklenir; ay kapanış kayıtları **en son**
  gelir (önce gelirse kapalı dönem korumaları o ayın kayıtlarını reddeder).
- Tetikleyicilerin yükleme sırasında ürettiği ve yedekte olmayan satırlar
  silinir: sistem kanalları, pazarlama izni kaydı ve **davet e-posta
  kuyruğu** — geri yükleme kimseye davet e-postasını yeniden göndermez.
- Kapanmış bir döneme düşen eksik kayıt, o dönem kapalıyken eklenemez;
  rapor bunu hata olarak söyler. Önce dönem yeniden açılır
  (`reopen_monthly_period_atomic`, gerekçeyle), yükleme tekrarlanır.

## Neyle kanıtlandı

`core/backup_restore_live_tests.js` (canlı, yalnız test projesi): dolu bir
işletme kurulur (kapalı ay, temizlik, gider, finans kaydı, davet, bileşik
anahtarlı ayar), yedek alınır, işletme ve kullanıcıları **tamamen silinir**,
yedekten yüklenir. Her tablo satır satır birebir aynı çıkar; sahip yeni
şifreyle girip rezervasyonunu görür.

Bu tur, kaynak okuyarak bulunamayacak iki sorunu yakaladı: işletme satırı
eklenince tetikleyicinin kendi kanallarını üretmesi (yedektekilerle
çakışıyordu) ve `ON CONFLICT DO NOTHING`'in kapalı dönem korumasını
atlatamaması (ikinci yükleme düşüyordu).

Çevrimdışı ağlar: `backup_engine_tests` (eksiksizlik, yalnız okuma),
`restore_engine_tests` (görünüm ve tetikleyici listeleri şemayla uyumlu mu,
yükleme sırası, üretim koruması).
