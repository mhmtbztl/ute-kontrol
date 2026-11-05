# Airbnb İlan Performansı — onaylı kapsam (5 Kasım 2026)

## Amaç ve ekran sözleşmesi
Kullanıcı Airbnb'de tek ilan için gördüğü sayıları/yüzdeleri aynı isimli alanlara
girer; dönem ve mülk karşılaştırması yapar. Huni/snapshot terimleri kaldırılır.
Ana eylem Veri ekle; ikincil bölüm Değişiklik takibi. Kullanıcının sağladığı
Airbnb ekranları bilgi hiyerarşisi referansıdır; Lexbnb'nin mevcut kart, form,
renk ve tablo bileşenleri kullanılır. Mobilde formlar tek sütun, tablolar kendi
kapsayıcısında kayar. Boş, yükleniyor, yetkisiz ve göç eksik durumları açıktır.

## Veri sözleşmesi
- Tek Airbnb ilanı + başlangıç/bitiş (ikisi de dahil); eski snapshot tarihleri
  okuma sırasında dönüştürülür, geçmiş kayıtlara yazılmaz.
- Sayfa görüntülenmesi, ilk arama sayfası gösterimi, favori adedi; dört ayrı
  bildirilen yüzde: toplam dönüşüm, ilk sayfa gösterilme, aramadan ilana,
  ilandan rezervasyona dönüşüm. Sayılar sıfır veya pozitif güvenli tam sayı;
  oranlar 0–100. Boş null; yüzde değerlerinden adet türetilmez.
- Airbnb sayfa görüntülenmesinin ilk sayfa gösteriminden az olması zorunlu
  değildir: tanımlar farklıdır. Eski genel huni sıralaması burada uygulanmaz.
- Tek dönem için bir güncel sürüm; düzeltmeler eski sürümü korur. Eşzamanlı
  farklı düzeltmede eski sürüm kimliği kontrol edilir. Aynı istek tekrarı güvenlidir.
- Tam eşleşen kayıt dönemi gösterilir; önceki eşit uzunluktaki bitişik dönem
  karşılaştırılır. Oran farkları yüzde puandır; çakışan aralıklar toplanmaz.
- Grafik gerçek dönem kayıtlarından oluşur; günlük seri uydurulmaz.
- Fotoğraf/başlık/fiyat/diğer değişiklik notları, iki gerçek 14 günlük dönemle
  karşılaştırılır. Değişiklik Airbnb'ye yayınlanmaz; nedensellik iddiası yoktur.

## Teknik sınırlar
Mevcut vanilla JS/UMD, Supabase RPC ve PostgreSQL yapısı. Yeni bağımlılık yok.
Yeni modüller core/airbnb_performance_service.js ve core/airbnb_performance_ui.js;
core/marketing_ui.js yalnız yönlendirme ve bulut bağlamını sağlar.
Phase98 yeni tablolar/RPC'ler; phase100 kiracı kimliği korumaları ve göç defteri;
phase102 tekrar denenmeyen çakışma yanıtları. Test projesine uygulanmış göçler
değiştirilmedi, bulgular yeni göçlerle düzeltildi. Üretimde manifest sırasıyla
98 → 100 → 102 uygulanmalı. Eski genel huni tabloları ve worker'ları değiştirilmez.
Yeni bildirilen oranlar eski worker hesaplarıyla karıştırılmaz.
Okuma can_read_ledger, yazma can_manage_tenant sözleşmelerine dayanır.
RLS, tenant/listing bileşik FK, auth kontrolü, sunucu validasyonu ve yalnız RPC
yazma yetkisi uygulanır. Metinler HTML-escape edilir; başka tenant'a erişim,
doğrudan tablo yazımı, anon erişim ve eşzamanlı düzeltme test edilir.

## Dikey dilimler ve doğrulama
1. Kaydet/düzelt: servis + göç + saf test + test projesi canlı testi.
2. Form/tablo/geçmiş: UI modülü + marketing bağlantısı + CSS + tarayıcı turu.
3. Karşılaştırma/grafik: saf dönem testleri + tarayıcıda boş veri ve filtre.
4. Değişiklik takibi: not RPC'si + önce/sonra görünümü + canlı ve UI testleri.
5. Teslim: npm test; npm run verify:migrations; node stamp_assets.js --check;
   npm run test:bootstrap; ilgili canlı test; npm run test:browser.

Odaklı doğrulama komutları:
- `node core/airbnb_performance_tests.js`
- `node scripts/airbnb_performance_browser_test.js` (1280 ve 390 px)
- Test kapısı değişkenleriyle `node core/airbnb_performance_live_tests.js`
  (yalnız ayrı test projesi; auth kullanıcıları ve tenant kayıtları sonunda temizlenir).

## Sonraki aşama — CSV ile toplu yükleme (kullanıcı isteği)
Örnek Airbnb CSV kullanıcı tarafından sağlanacak. Gerçek sütun, tarih,
ondalık, ortalama/toplam ve ilan kimliği yapısı görülmeden parser varsayılmaz.
Akış: dosya seç → ilan/sütun eşle → önizle → eksik/hatalı/tekrar kayıtları göster
→ onaylanan satırları aynı kalıcı kayıt sözleşmesiyle yükle. Formüller çalıştırılmaz;
birden çok ilan ortalaması mülk verisine çevrilmez. Bu aşama mevcut teslimde
implement edilmez, örnek dosya geldikten sonra ayrıntılandırılır.

## Dağıtım
Üretime göç uygulaması ayrı açık kullanıcı onayıyla, Dashboard üzerinden.
Push/merge yetkisi bu implementasyon onayından türetilmez. Göç henüz yoksa yeni
kayıt formları açılmaz ve açıklama gösterilir; eski veriler okunmaya devam eder.

## Doğrulama sonucu
- Ayrı test projesinde üç göç uygulandı; kayıt, tekrar gönderim, sürüm geçmişi,
  eşzamanlı düzeltme, viewer/staff, anon ve çapraz kiracı testleri geçti.
- Tam güvenli koşu 215/215 süit; canlı süitler bu koşudan ayrı çalıştırıldı.
- Mevcut tarayıcı kapısı 36 akış/4 rol geçti. Yeni ekran 1280 ve 390 px'te
  önizleme, kayıt, düzeltme, geçmiş, not, XSS, taşma ve göç eksik durumuyla doğrulandı.
- Göç zinciri ve varlık damgaları doğrulandı. Üretim göçü/push yapılmadı.
