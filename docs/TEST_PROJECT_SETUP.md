# Ayrı Supabase test projesi kurulumu

Bu belge, veritabanına yazan **22 canlı süiti** üretimden ayrı bir Supabase
projesine karşı koşulabilir hâle getirir.

## Neden

Canlı süitler gerçek `auth` kullanıcısı, gerçek işletme ve gerçek defter kaydı
yaratır. Bugüne kadar bunu **üretim projesinde** yapıyorlardı:

- Süitlerin her biri `.env` dosyasını kendi başına, üç ayrı biçimde okuyordu.
  Hedefi değiştirmenin tek yolu dosyayı elle takas etmekti; yani varsayılan
  hedef üretimdi.
- Temizlik hataları Supabase JS'te fırlatmaz, `{ error }` döner. Kontrol
  edilmeyen her hata üretimde artık hesap bırakıyordu — bir kez **525 tane**
  birikti (`CLAUDE.md` §5.4).
- Sonuç: süitler varsayılan koşuda tamamen kapatıldı ve **kimse koşmadı.**
  Çapraz kiracı güvenlik ağı da dahil.

Kurulum bittiğinde üretim projesine hiçbir test yazmaz; kod bunu **reddeder**
(`core/test_env.js` kara listesi).

---

## 1. Supabase'de yeni proje

Supabase panelinde yeni bir proje açın:

| Alan | Değer |
|---|---|
| Ad | `lexbnb-test` |
| Bölge | Üretimle aynı bölge (gecikme farkı test sürelerini şaşırtmasın) |
| Veritabanı parolası | Yeni üretin, üretim parolasıyla **aynı olmasın** |

Ücretsiz katman yeterlidir.

## 2. Auth ayarları

Test projesinin panelinde (`.../project/<ref>/auth/...`):

- **Custom SMTP: kurmayın.** Üretimdeki Resend bağlantısı buraya
  kopyalanmamalı. Süitler `@lexbnb.test`, `@lexbnbtest.com`,
  `@lexbnb-test.com` gibi var olmayan alan adlarına hesap açar; gerçek bir SMTP
  bağlarsanız Resend ücretsiz katmanını sıçrayan e-postalarla doldurursunuz ve
  üretimin gönderim itibarına zarar verirsiniz.
- **Hız limitleri** (`.../auth/rate-limits`): varsayılanlar tam koşu için
  düşüktür. `CLAUDE.md` §5.6'daki "iki-üç ardışık koşudan sonra 10 süit sahte
  biçimde kırmızı oluyor" sorunu buradan gelir. Saatlik kullanıcı oluşturma ve
  oturum açma limitlerini yükseltin.
- **E-posta onayı** (`.../auth/providers` → Email → *Confirm email*): **kapatın.**
  Bu bir tercih değil, zorunluluk. Onay açıkken her `signUp()` bir onay maili
  tetikler; custom SMTP kurmadığınız için (ki kurmamalısınız, yukarıya bakın)
  Supabase'in yerleşik göndericisi devreye girer ve ücretsiz projede saatte
  yalnızca birkaç maile izin verir. `registration_flow_tests` gerçek `signUp()`
  kullanan tek süittir ve ikinci koşuda `email rate limit exceeded` ile düşer.

  Bu limit kontrolü adres doğrulamasından **önce** çalışır, yani asıl hatayı da
  maskeler: "invalid email" sorununu ararken elinizde yalnızca "rate limit"
  kalır.

  İkinci sebep: Supabase yeni projelerde `signUp()` adresinin alan adını
  **teslim edilebilirlik** açısından doğrular. `@lexbnb.test` ve
  `@lexbnb-test.com` MX kaydı olmadığı için reddedilir. `admin.createUser()`
  bu doğrulamayı atladığından diğer 21 süit etkilenmez — yalnızca gerçek kayıt
  akışını ölçen süit takılır.

## 3. Anahtarlar ve bağlantı dizesi

Panelden toplayın:

- **Project URL** ve **anon key** → Settings → API
- **service_role key** → Settings → API (bu anahtar tam yetkilidir)
- **Veritabanı bağlantı dizesi** → Settings → Database → Connection string
  (pooler ya da doğrudan; ikisi de olur)

## 4. `.env.test`

Repo kökünde `.env.test` oluşturun. `.gitignore` içindeki `.env.*` kuralı bunu
zaten kapsar; commit edilmez.

```
# Test projesi — URETIM DEGIL
SUPABASE_URL=https://<test-ref>.supabase.co
TEST_SUPABASE_URL=https://<test-ref>.supabase.co
SUPABASE_ANON_KEY=<test projesinin anon anahtari>
SUPABASE_PUBLISHABLE_KEY=<test projesinin anon anahtari>
SUPABASE_SERVICE_ROLE_KEY=<test projesinin service_role anahtari>

# Sema kurulumu icin (yalnizca bootstrap betigi kullanir)
TEST_DATABASE_URL=postgresql://postgres.<test-ref>:<parola>@<pooler-host>:5432/postgres
```

`SUPABASE_URL` ile `TEST_SUPABASE_URL` **birebir aynı** olmak zorundadır. Bu
tekrar bilerek var: hedefin test projesi olduğu, tek bir değişkene güvenmek
yerine iki kez beyan edilir.

## 5. Şemayı kur

`schema.sql` + manifestteki 35 göç, manifest sırasıyla uygulanır:

```bash
npm run test:bootstrap:check   # ne uygulanacak, hiçbir şey yazmaz
npm run test:bootstrap         # eksikleri uygula
```

Betik kendi defterini tutar (`public.lexbnb_bootstrap_log`): tekrar
koşulabilir, uygulanmış dosyaları atlar. Her dosya kendi transaction'ında
çalışır; biri patlarsa o dosya geri alınır ve koşu durur.

**Bu betik üretim şemasına dokunmaz ve dokunamaz.** Üretim göçleri
`AGENTS.md` teslim protokolü 5 gereği Supabase panelinden elle ve ayrı açık
onayla uygulanır; bu yol değişmedi.

## 6. Canlı süitleri koş

```powershell
$env:LEXBNB_ALLOW_DESTRUCTIVE_TESTS = "1"
$env:LEXBNB_CONFIRM_REMOTE_TEST_PROJECT = "<test-ref>.supabase.co"
npm run test:live
```

Koşu sonunda sızıntı denetimi çalışır: test alan adlı hesap kalırsa koşu
başarısız sayılır (temizlik: `supabase/cleanup_test_accounts.sql`).

> **Ardışık tam koşu yapmayın.** Her süit auth kullanıcısı yaratır; hız limitine
> takılırsanız birçok süit sahte biçimde kırmızı olur. Kod regresyonu sanmayın —
> süiti tek başına koşun, geçiyorsa limittir (`CLAUDE.md` §5.6).

---

## Korumalar

`core/test_env.js` canlı süitlerin kimlik bilgisi aldığı **tek** yerdir. Sırayla:

1. `LEXBNB_ALLOW_DESTRUCTIVE_TESTS=1` yoksa süit hiç çalışmaz.
2. `SUPABASE_URL`, açıkça beyan edilen `TEST_SUPABASE_URL` ile birebir eşit olmalı.
3. **Üretim projesi kara listede.** Her iki değişken de üretimi gösterse ve
   hostname onayı verilse bile reddedilir — kapatılamaz.
4. Uzak bir proje ise hostname `LEXBNB_CONFIRM_REMOTE_TEST_PROJECT` ile
   ayrıca onaylanmalı.

Kara liste `app.js` içindeki `DEFAULT_SUPABASE_URL` ile aynı projeyi göstermek
zorundadır; üretim başka bir projeye taşınırsa `core/test_gate_tests.js`
kırılır ve kara liste sessizce eskimez.

### Üretime bir göçün uygulandığını doğrulama

Canlı süitler artık üretimi hedefleyemediği için, `CLAUDE.md` §4.2'deki
"davranış göçleri → ilgili canlı süiti koş" yöntemi **üretim için geçersizdir.**
Üretimde göç doğrulaması aynı bölümdeki diğer iki yolla yapılır:

- **Yetki göçleri** → anon anahtarıyla RPC çağırın (`permission denied for
  function` = uygulanmış).
- **Sütun/tablo göçleri** → `select=<sutun>&limit=0` ile sorun (`42703` =
  uygulanmamış).

Canlı süitler **davranışı** ölçer ve bunu test projesinde yapar.

---

## CI

`.github/workflows/live-tests.yml` **açık ve çalışıyor** (16 Eylül 2026).
Her gece 03:00 UTC’te tek koşu yapar; elle tetiklemek için `workflow_dispatch`.
İlk yeşil koşu 17 Eylül 2026: 120/120 süit, 1123 iddia, sızıntı denetimi temiz.

Anahtar hâlâ `LIVE_TESTS_ENABLED` repo değişkenidir; `true` dışında bir değer
iş akışını atlar. Sıfırdan kurulum ya da başka bir repoya taşıma için:

1. Repo → Settings → Secrets and variables → Actions
2. **Secrets**: `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`,
   `TEST_SUPABASE_SERVICE_ROLE_KEY`
3. **Variables**: `LIVE_TESTS_ENABLED = true`,
   `TEST_SUPABASE_HOST = <test-ref>.supabase.co`

Secret'lara **üretim anahtarlarını koymayın.** İş akışı hedefin üretim olmadığını
ayrıca doğrular, ama ilk savunma doğru değeri girmektir.

> **Anahtarı yapıştırırken satır sonu kaçırmayın.** Değer tek satır olmalı.
> Anahtarın içine giren bir satır sonu, `supabase-js`'in `apikey` başlığını
> geçersiz kılar ve **her** istek reddedilir. İlk CI koşusunda tam olarak bu
> oldu. Kapı bunu artık yakalıyor ve hangi değişkenin bozuk olduğunu söylüyor:
>
> ```
> LIVE_TEST_GUARD: SUPABASE_ANON_KEY icinde satir sonu ya da sekme var.
> ```
>
> Bu mesajı görürseniz ilgili secret'ı silip **tek satır** olarak yeniden girin.
> Sondaki fazladan boşluk/satır sonu kırpılır; **içeride** kalan bir satır sonu
> anahtarın kendisini bozar ve kırpılamaz.
