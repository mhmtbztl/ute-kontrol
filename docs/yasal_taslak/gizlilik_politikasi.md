> **TASLAK — hukuki onay bekliyor. Yayımlanmaz.** (L-157, `docs/yasal_taslak/README.md`)

# Gizlilik Politikası

Bu politika, lexbnb.space adresindeki Lexbnb uygulamasının hangi veriyi
neden işlediğini, nerede sakladığını ve nasıl koruduğunu anlatır. Kişisel
verilerin işlenmesine ilişkin yasal bilgilendirme için KVKK Aydınlatma
Metni'ne bakınız.

## 1. Kim, hangi veriden sorumlu

- **Hesap verisi** (işletme kullanıcılarının adı, e-postası, rolü):
  sorumlusu Lexbnb'dir.
- **İşletme verisi** (mülkler, rezervasyonlar, misafirler, talepler, giderler,
  personel, temizlik ve arıza kayıtları): işletmenin kendisinindir; sorumlusu
  işletmedir. Lexbnb bu veriyi yalnız işletmenin talimatıyla ve hizmeti sunmak
  için işler (Veri İşleme Eki).

## 2. İşletmelerin Lexbnb'ye girebildiği kişisel veriler

Bu liste, uygulamanın veritabanında gerçekte bulunan alanlardır:

- **Misafir:** ad, soyad, telefon, e-posta, dil, ülke kodu, doğum tarihi,
  tercihler ve iç notlar; e-posta / SMS / WhatsApp iletişim izinleri ve
  kampanya (pazarlama) izni ile bu iznin değişiklik geçmişi.
- **Rezervasyon ve talep:** misafir adı ve telefonu, tarih, kişi sayısı, tutar,
  kanal, notlar.
- **İşletmeye özel misafir sınıflandırması:** liste türü, gerekçe ve olay
  tarihi (yalnız o işletmede görünür, başka işletmeyle paylaşılmaz).
  [Hukukçu notu: dayanak ve süre — README madde 3]
- **Personel ve tedarikçi:** ad soyad, telefon, uzmanlık, notlar; temizlik ve
  arıza işlerine ait kayıtlar ve iş kanıtı fotoğrafları.
- **Planlanan mesajlar:** alıcı, mesaj metni, gönderim durumu.

## 3. Verinin ayrımı

Her işletmenin verisi veritabanı düzeyinde ayrıdır: satır düzeyi güvenlik
kuralları, bir işletmenin kullanıcısının başka bir işletmenin hiçbir kaydını
okumasına ya da değiştirmesine izin vermez. Ekip içinde de rol sınırları
vardır (ör. satış rolü finans defterini, personel rolü satış verisini görmez).

## 4. Saklama ve silme

- İşletme kayıtları, işletme onları silene kadar saklanır.
- **Misafir silme (KVKK silme hakkı):** işletme, misafir profilinden
  "Kişisel verileri sil" ile misafirin adını, iletişim bilgilerini ve izin
  geçmişini kalıcı olarak siler; rezervasyon ve taleplerdeki ad ve telefon
  alanları da temizlenir, finansal tutarlar anonim kalır. Silme işleminin
  yalnız sayısal izi tutulur (kim, ne zaman, kaç kayıt).
- **Veri sıfırlama:** işletme sahibi bütün defterleri tek işlemde siler;
  işletme ve ekip kalır.
- **Hesap kapatma:** hesap ve sahibi olunan işletmelerin bütün verisi silinir.
- **Yedekler:** [YEDEK KONUMU, ŞİFRELEME, SÜRE]. İşletme sahibi ayrıca
  Ayarlar'dan kendi işletme yedeğini indirebilir; bu dosya misafirlerin
  kişisel verilerini içerir ve saklanması işletmenin sorumluluğundadır.

## 5. Tarayıcıda saklanan veriler (çerezler ve yerel depolama)

Lexbnb reklam ya da izleme çerezi kullanmaz.

| Ne | Nerede | Süre | Neden |
|---|---|---|---|
| Giriş oturumu | Tarayıcı oturum deposu (sekme kapanınca silinir) | Oturum | Girişin sürmesi |
| "Bu cihazda beni hatırla" işaretliyse giriş oturumu | Tarayıcının yerel deposu | En fazla 7 gün | Tekrar giriş yapmamak |
| Seçili işletme ve kullanıcı bilgisi | Oturum deposu | Oturum | Ekranın doğru işletmeyi göstermesi |
| Bot doğrulama (Cloudflare Turnstile) | Cloudflare | [SÜRE — Cloudflare belgesi] | Otomatik saldırıların önlenmesi |
| Anonim ziyaret istatistiği (Cloudflare Web Analytics) | Çerez kullanmaz | — | Sayfa performansı |

Çıkış yapıldığında uygulamanın tarayıcıdaki bütün kayıtları silinir.

## 6. Güvenlik

- Bağlantılar şifrelidir (HTTPS, HSTS).
- Şifreler yalnız tek yönlü özet olarak saklanır.
- Giriş, kayıt ve şifre sıfırlama otomatik saldırılara karşı bot doğrulamasıyla
  korunur.
- Uygulama, içerik güvenlik politikasıyla yalnız kendi dosyalarını
  çalıştırır; misafir ya da kullanıcı metni uygulamada kod olarak çalışamaz.
- Veritabanına yetkisiz (oturumsuz) erişim kapalıdır.

## 7. Hizmet sağlayıcılar

Supabase (veritabanı, kimlik doğrulama, dosya), Resend (e-posta), Cloudflare
(ağ güvenliği, bot doğrulama, anonim istatistik), GitHub Pages (uygulama
dosyaları; kişisel veri tutmaz), Google Fonts (yazı tipi dosyaları).
Konumlar ve aktarım dayanağı için KVKK Aydınlatma Metni md. 4.

Uygulama WhatsApp, Airbnb ya da başka bir platforma kendiliğinden veri
göndermez. "WhatsApp'ta aç" düğmesi yalnız kullanıcının kendi cihazında
mesaj taslağını açar; gönderimi kullanıcı yapar.

## 8. Değişiklikler ve iletişim

Bu politika değiştiğinde sürüm kodu değişir ve yeni sürüm bu sayfada
yayımlanır. Sorularınız için: [İLETİŞİM E-POSTASI].

*Sürüm: [ONAYLI SÜRÜM KODU] · Yürürlük: [TARİH]*
