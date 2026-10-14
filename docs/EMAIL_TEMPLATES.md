# Supabase e-posta şablonları (L-180)

Davet ve giriş e-postaları spama düşüyordu. DNS tarafı temizdi (SPF, DKIM,
DMARC `p=none` yayında; 14.10.2026'da ölçüldü). Kalan iki sebep:

1. Varsayılan şablon İngilizce ve markasızdı.
2. Bağlantı `kirpcqklyjlrhvdbgdrq.supabase.co/auth/v1/verify` adresine
   gidiyordu; gönderen `noreply@lexbnb.space` iken bağlantının başka bir alan
   adına çıkması bilinen bir spam sinyalidir.

Uygulama artık `https://lexbnb.space/?token_hash=…&type=…` bağlantısını
kendisi doğrular (`consumeEmailTokenHashLink`, app.js). Şablonlar aşağıdaki
gibi değiştirilince bağlantı kendi alan adımıza gelir.

**Sıra önemli:** önce bu kodu içeren sürüm yayında olmalı, sonra şablonlar
değişmeli. Eski sürüm `token_hash` bağlantısını tanımaz.

## Nerede

Supabase → Authentication → Emails → Templates (üretim projesi
`kirpcqklyjlrhvdbgdrq`). Önce Authentication → URL Configuration'da
**Site URL = `https://lexbnb.space`** olduğunu kontrol edin; şablonlar
`{{ .SiteURL }}` kullanır.

Test projesinde değiştirmeyin (orada SMTP ve e-posta onayı bilerek kapalı,
CLAUDE.md §2).

## Invite user (ekip daveti)

Konu: `Lexbnb ekibine davet edildiniz`

```html
<h2>Lexbnb ekibine davet edildiniz</h2>
<p>Merhaba,</p>
<p>Bir işletme sizi Lexbnb'deki ekibine ekledi. Daveti kabul edip şifrenizi
belirlemek için aşağıdaki bağlantıya tıklayın.</p>
<p><a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite">Daveti kabul et</a></p>
<p>Bu daveti beklemiyorsanız bu e-postayı yok sayabilirsiniz.</p>
<p>— Lexbnb</p>
```

## Magic Link (hesabı olan kişiye davet / giriş bağlantısı)

Konu: `Lexbnb giriş bağlantınız`

```html
<h2>Lexbnb giriş bağlantınız</h2>
<p>Merhaba,</p>
<p>Lexbnb'ye giriş yapmak için aşağıdaki bağlantıya tıklayın. Bağlantı tek
kullanımlıktır.</p>
<p><a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=magiclink">Giriş yap</a></p>
<p>Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
<p>— Lexbnb</p>
```

## Reset Password (şifremi unuttum)

Konu: `Lexbnb şifre sıfırlama`

```html
<h2>Şifrenizi sıfırlayın</h2>
<p>Merhaba,</p>
<p>Lexbnb hesabınız için şifre sıfırlama isteği aldık. Yeni şifrenizi
belirlemek için aşağıdaki bağlantıya tıklayın.</p>
<p><a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery">Yeni şifre belirle</a></p>
<p>Bu isteği siz yapmadıysanız şifreniz değişmez; bu e-postayı yok sayabilirsiniz.</p>
<p>— Lexbnb</p>
```

## Confirm signup (kayıt onayı)

Konu: `Lexbnb hesabınızı onaylayın`

```html
<h2>Hesabınızı onaylayın</h2>
<p>Merhaba,</p>
<p>Lexbnb'ye kaydolduğunuz için teşekkürler. Hesabınızı onaylamak için
aşağıdaki bağlantıya tıklayın.</p>
<p><a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=email">Hesabımı onayla</a></p>
<p>— Lexbnb</p>
```

## Doğrulama

1. Şablonları kaydedin.
2. Kendi Gmail adresinize (`adın+deneme@gmail.com`) Personel daveti gönderin.
3. E-postadaki bağlantının üzerine gelin: adres `https://lexbnb.space/?token_hash=`
   ile başlamalı.
4. Tıklayın: şifre belirleme formu açılmalı; şifreyi kaydedince uygulamaya
   girilmeli. Adres çubuğunda `token_hash` kalmamalı.
5. Aynı bağlantıya ikinci kez tıklayın: "bağlantının süresi dolmuş ya da daha
   önce kullanılmış" uyarısı çıkmalı.
6. E-posta hâlâ spama düşüyorsa Gmail'de "Spam değil" işaretleyin; yeni alan
   adının itibarı birkaç gün içinde oturur. Gmail'de "Orijinali göster"
   ekranında SPF, DKIM ve DMARC üçünün de `PASS` olduğunu kontrol edin.
