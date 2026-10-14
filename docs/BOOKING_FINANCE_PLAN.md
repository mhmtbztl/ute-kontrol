# Rezervasyon finansı — onaylı sözleşme (14 Ekim 2026)

Amaç: Mevcut rezervasyon formunda brüt → OTA/POS → vergi → temizlik → diğer
giderler sırasıyla tahmini kalanı göstermek. Sonuç banka tahsilatı veya net kâr değildir.

Uygulama sırası: saf hesap motoru ve regresyon testleri → atomik kalıcılık ve
rapor uyumu → mevcut form/ayarlar → tarayıcı ve tam regresyon.

- Vergi varsayılan olarak kapalıdır. Dahil, hariç ve manuel yöntemler vardır.
- Vergi profili: geçerlilik tarihleri, oran tarihinin kaynağı, her verginin oda/
  temizlik matrahı ve diğer vergiyi matraha dahil edip etmediği açık seçilir.
  Döngüsel vergi matrahı reddedilir. Hiçbir mevzuat/oran varsayılanı üretilmez.
- Rezervasyonda profilin kopyası saklanır; ayar değişimi eski kaydı değiştirmez.
- Tahsil eden pay ile ödeme yükümlülüğü ayrı kaydedilir. Vergi toplamı kalan
  hesabından yalnız bir kez ayrılır: platformun tuttuğu pay + işletme
  tahsilatında ayrılan bakiye. İkincisi hukuki borç değildir; platforma
  aktarılacak vergiyi de içerebilir. Tahsilat, ödendi/mahsup edildi demek değildir.
- ADR/RevPAR: vergi ve temizlik geliri hariç, indirim sonrası oda geliri;
  komisyon giderdir, ADR'den düşülmez. Vergisiz geçmiş kayıtların defteri korunur.
- Yeni bilgiler Supabase'de atomik kaydedilir; şema eksikse yeni özellik açık
  hatayla durur, eski rezervasyon yolu çalışır. Kapalı dönem ve rol sınırları korunur.
- Ek giderler önce rezervasyon tahminidir. Deftere açık aktarım, sabit kayıt
  kimliğiyle yapılır; tekrar aktarım aynı gideri çoğaltmaz.
- Temizlik bilinmiyor ile sıfır farklıdır. Mülk varsayılanı yalnız yeni formda
  uygulanır, elle girilen veya kayıtlı tutar ezilmez.

Kaynaklar: app.js, index.html, style.css, core/*, ileri yönlü phase92/94 göçleri.
Yeni bağımlılık yok. Üretim göçü, deploy, push ve master merge yetkisi yok.

Doğrulama: kullanıcıdaki 12 senaryo; kuruş/yuvarlama, indirim, ay sınırı,
yetki/tenant, kapalı dönem, kayıt turu ve aktarımın idempotansı.
Komutlar: node core/booking_finance_tests.js; npm test;
npm run verify:migrations; npm run templates:check; node stamp_assets.js --check;
npm run test:bootstrap; ilgili canlı süitler (yalnız test projesi);
npm run test:browser ve finans formunun gerçek tarayıcı turu.

## Kalıcılık ve devreye alma sınırları

- `bookings.financial_details` sürüm 1: girişler, vergi profilinin kopyası ve
  sunucuda tekrar hesaplanan sonuç. Eski kayıtlar NULL kalır; backfill yoktur.
- Rezervasyon, finans snapshot'ı ve POS kesintisi aynı RPC işlemi içindedir.
  Temizlik görev kaydı mevcut ayrı akışını korur; yazılamazsa kullanıcıya
  uyarı verilir. Gerçek temizlik giderinin kaynağı hâlâ görev defteridir.
- Deftere gider aktarımı açık eylemdir. `BF:<booking>:<expense>` kimliği ve
  mevcut benzersiz kısıt tekrarı engeller. Tarih kullanıcı tarafından seçilir.
- Excel/CSV finanslı kayıtları ek JSON sütunuyla taşır. Geri yükleme bu
  girişleri aynı atomik RPC'ye gönderir; sütun/tutar uyuşmazlığı reddedilir.
  JSON sütunu silinmemelidir. Bu dosyalar tüm işletme yedeği değildir;
  gerçekleşmiş gider defteri bağlantıları yalnız tam yedekte korunur.
- phase92 sonra phase94 birlikte uygulanmalıdır; phase94, test ortamında
  bulunan vergi rezervi uç durumunun ileri düzeltmesidir. phase92 değiştirilmedi.
- Üretim için ayrı onay gerekir. Önce yedek ve göçler, sonra ayrıca onaylı
  PR/CI/yayın. Üretim verisi bu çalışmada değiştirilmedi.
- Şema eksikken vergisiz/ek gidersiz temel kayıt eski RPC ile çalışır;
  yeni finans özellikleri veri kaybetmek yerine açıklayıcı hata verir.
- Vergi kullanılan kayıtlar eski istemciyle tutarsız değiştirilemez. Eski
  koda dönmek tam rollback değildir; snapshot korunarak ileri düzeltme gerekir.
  Veri silen bir down migration yazılmadı/çalıştırılmadı.
- Hesap, girilen vergileri tahmini gelirden ayırır; indirilecek KDV,
  mahsuplar, vergi ödeme kanıtı veya banka mutabakatı üretmez. Profil ve
  yükümlülük seçimlerini işletme yetkilisi doğrulamalıdır.
