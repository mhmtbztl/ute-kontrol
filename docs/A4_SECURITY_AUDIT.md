# A4-G5 Güvenlik ve Tarayıcı Denetimi

Tarih: 2026-10-02  
Hedef: yalnız Supabase test projesi `pdeiorpgxetksyogrmbi` ve localhost geçici runtime  
Üretim değişikliği: yok

## Doğrulananlar

- Canlı RLS/RPC sınırları ayrı sahip, satış, personel, izleyici, yabancı işletme ve anonim istemcilerle sınandı.
- A3 reklam dönemi, logo depolama ve reklam kiracı değişmezliği göçleri test projesinde çalıştı.
- A4 mülk/talep/misafir bağlamı, kara listenin yalnız yönetime görünmesi ve phase78 fiyat araştırması/gider şablonu sınırları çalıştı.
- Tarayıcı runtime'ı üretim sabitlerini değiştirmeden geçici klasöre kopyalandı; yalnız test projesinin publishable anahtarı kullanıldı. Service-role anahtarı tarayıcıya yazılmadı.
- Tarayıcıda sahip ve satış hesaplarıyla; personel ve izleyici rollerinde yeniden yüklenen test üyesiyle rol görünümü ölçüldü. Ayrı hesapların veri yetkileri canlı süitlerde ayrıca doğrulandı.
- 390 px genişlikte Misafirler ve Satış, Mülkler, Fiyatlandırma ve Reklamlar gezildi. Belge genişliği 375 px kaldı; sayfa düzeyinde yatay taşma oluşmadı. Üst sekme şeridi kendi içinde yatay kaydırılabilir kaldı.

## Rol sonuçları

| Rol | Tarayıcı sonucu |
|---|---|
| Sahip | Dört A4 ekranını görür; kaynak ekleme, mülk düzenleme, fiyat kuralı/rakip araştırması ve kara liste alanları görünür. |
| Satış | Hızlı kayıt ve misafir düzenleme görünür; Finans ve Pazarlama menüleri gizli; kara/beyaz liste bölümü görünmez. |
| Personel | Ana uygulama menüsü gizli; yalnız “Bugünkü saha işlerim” görünür. |
| İzleyici | Defter ekranlarını salt okunur görür; hızlı kayıt gönderimi kapalı; kaynak ekleme ve yeni misafir gizli; kara/beyaz liste görünmez. |
| Yabancı işletme | Başka kiracının rezervasyon, mülk, fiyat ayarı, rakip araştırması ve reklam verisini okuyamaz/yazamaz (canlı RLS/RPC süitleri). |

## Bulunan hata ve düzeltme

Tarayıcı denetiminde izleyici rolünün misafir detay formundaki alanları düzenleyebildiği ve “Misafiri Kaydet” düğmesini görebildiği bulundu. RLS kaydı reddediyordu fakat istemci sınırı yanıltıcıydı.

Düzeltme:

- İzleyici için görünür profil alanları devre dışı bırakıldı.
- Kaydet düğmesi gizlendi ve devre dışı bırakıldı.
- `saveGuestProfile` programatik çağrısı da satış-yazma rol kapısından geçirildi.
- Satış rolü normal profil alanlarını düzenlemeye devam ederken özel liste alanları kapalı kaldı; yönetim rolü tüm alanları kullanır.

## Test sonuçları

Canlı, yalnız test projesi:

- phase41 authz: 38/38
- phase53 staff/sales/viewer/foreign/anon: 47/47
- phase59 mülk-talep-misafir bağlamı: 43/43
- phase70 iş tarihi: 3/3
- phase72 reklam dönemleri: 8/8
- phase74 logo depolama: 7/7
- phase76 reklam tenant değişmezliği: 1/1
- phase78 fiyat araştırması/gider şablonu: 19/19
- Toplam: 166/166

Hedefli çevrimdışı kontroller:

- `core/a4_sales_ui_tests.js`
- `core/a4_browser_fixture_tests.js`
- `core/action_dispatch_tests.js`
- `core/html_injection_tests.js`
- `core/test_gate_tests.js`
- `server_tests.js`
- `node --check app.js`
- `node stamp_assets.js --check`

## Üretim kontrolü ve kalan kapılar

- Üretime göç uygulanmadı ve üretim verisine yazılmadı.
- A3/A4 üretim göç varlığı bu çalışmada doğrulanmadı; kullanıcı A3 ve A4'ü birlikte denetleteceğini belirtti.
- Phase78 ve phase80 üretime uygulanmadan yeni şema özellikleri üretimde hazır sayılmaz. Uygulama göç eksikliğine toleranslıdır; üretim uygulaması ayrıca ve açıkça onaylanmalıdır.
- TESLİM öncesi tam `npm test`, göç manifesti ve damga kapıları ayrıca çalıştırılacaktır.
