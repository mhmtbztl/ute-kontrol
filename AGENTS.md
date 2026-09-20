# AGENTS.md — Ortak Çalışma Kuralları

Bu dosya, bu repoda çalışan **her AI aracı için bağlayıcı tek kaynaktır**
(Codex, Claude, Antigravity ve sonradan eklenecek her araç).

- Ürünün kendi kuralları (finansal hesaplama, uydurma veri yasağı, test
  tuzakları, güvenlik notları) **`CLAUDE.md`** dosyasındadır ve orası da
  geçerlidir. İkisi çelişirse: ortak çalışma konularında bu dosya,
  ürün/alan kurallarında `CLAUDE.md` bağlar.
- Buradaki kurallar tercih değil, **yaşanmış hataların sonucudur.** Her
  kuralın altında neden var olduğu yazılıdır; gerekçesini okumadan
  değiştirmeyin.

---

## Neden bu dosya var

Bu repoda birden fazla AI aracı **aynı anda** çalışıyor ve hepsi `app.js`
(~530 KB) ile `index.html` (~265 KB) gibi dev ortak dosyalara dokunuyor.
Dosya bazında bölüşmek yetmedi. 2026-09-14'te yaşananlar:

- Antigravity bir kez, başka bir araç çalışırken commit atıp **yarım
  düzenlemeyi kendi commit'ine kattı.**
- Codex bir kez, Claude'un iki commit'ini **kendi push'uyla gönderdi.**
- Claude, Codex'in 27 dosyalık kaydedilmemiş işinin üstünde çalışmak zorunda
  kaldı; ayrı worktree açmasa o iş karışacaktı.

---

## Kural 1 — Her araç kendi klasöründe (worktree)

Ana klasörde **tek bir araç** çalışır. Diğerlerine ayrı worktree açılır:

```powershell
cd C:\Users\pc\Desktop\lexbnb
git worktree add ../lexbnb-claude -b claude/calisma origin/master
# .env gitignore'da olduğu için worktree'ye gelmez, kopyalanmalı:
Copy-Item -LiteralPath .env -Destination ..\lexbnb-claude\.env
# Bağımlılıklar: ya junction ya da npm ci
cmd /c mklink /J ..\lexbnb-claude\node_modules node_modules
```

Mevcut yerleşim:

| Klasör | Dal | Kim |
|---|---|---|
| `lexbnb` | `master` | Codex |
| `lexbnb-claude` | `claude/calisma` | Claude |
| `lexbnb-codex-marketing` | `codex/marketing` | (eski, pazarlama) |

İş bitince dal `master`'a birleştirilir. Çakışma çıkarsa git **söyler** ve
görerek çözülür — sessiz kayıp olmaz. Asıl kazanç budur.

**Kural klasöre değil, çalışan örneğe bakar.** Aynı aracın iki oturumu da ayrı
sayılır. 2026-09-14'te bir Claude oturumu, başka bir Claude oturumunun
worktree'sindeki dala commit attı (`docs(agents): komut sozlugu`); içerik doğruydu
ama commit, o dalda çalışan oturumun teslim raporunda **kendine ait olmayan bir
commit** olarak göründü ve push sırasında "bu benim mi?" sorusunu doğurdu.
Kimin ne yazdığını commit mesajından anlarsınız: Claude commit'leri
`Co-Authored-By` ve `Claude-Session` satırı taşır, oturum kimliği farklıysa
**başka bir oturumdur**; Codex commit'lerinde bu satırlar hiç yoktur.

## Kural 2 — Kimse başkasının dosyasını commit'lemez

**`git add -A` ve `git add .` yasaktır.** Yalnızca kendi dokunduğunuz
dosyaları adıyla ekleyin.

- Başka bir aracın takipsiz dosyası (ör. `RGVQI_AUDIT_REPORT.md`) ağaçta
  duruyorsa **ona dokunmayın**, commit'lemeyin, silmeyin.
- **Diğer aracın commit'leri kendi commit'inize otomatik dahil edilmez.**
  Push ederken yalnızca kendi commit'lerinizi gönderdiğinizi doğrulayın:
  `git log --oneline origin/master..HEAD`
- Çok dosyalı bir değişikliğe başlamadan ve bitirince `git log --oneline -1`
  ile `git status` bakın. `git status` siz commit atmadan temizlendiyse
  **başkası araya girmiştir.**

## Kural 3 — Göç dosyaları değişmezdir

`supabase/migration_*.sql` bir kez uygulandıktan sonra **düzenlenmez**;
düzeltme yeni bir `phase<N+1>` dosyası olarak eklenir ve
`supabase/migration_manifest.txt`'e hash'iyle işlenir.
`npm run verify:migrations` bunu zorlar.

Bir göçü düzenlemek, onu zaten uygulamış olan üretimle dosyayı sessizce
ayrıştırır: dosya "doğru" görünür, veritabanı eski hâlde kalır.

## Kural 4 — Teslimden önce tam test koşusu

**Hakem araçlardan biri değil, test paketidir.** 2026-09-14'te iki gerçek
hata çıktı; ikisini de kod okuyan bir AI değil, testler yakaladı:

- Codex'in phase24'ü mülk silmeyi engelleyen bir koruma ekledi ama sıfırlama
  ve hesap kapatma istisnalarını tanımlamadı → **veri sıfırlama üretimde
  yarıda kalıyordu.** `tenant_reset_tests` kırmızıya döndüğü için bulundu
  (phase26 ile düzeltildi).
- Claude temizlik maliyeti için `bookings`'e yeni sütun ekledi → **göç
  uygulanana kadar hiçbir rezervasyon kaydedilemiyordu.**
  `booking_crud_tests` kırmızıya döndüğü için bulundu ve tasarımdan dönüldü.

## Kural 5 — `master`'a aynı anda tek araç dokunur

**Aynı anda yalnızca bir araç `master`'a merge/push yapabilir.** Diğeri kendi
dalında kalır ve **haber vermeden `master`'a dokunmaz.**

- Merge/push sırası kullanıcı tarafından verilir; araç kendi kendine sıra
  almaz.
- Push etmeden önce `git fetch origin` + `git log --oneline origin/master..HEAD`
  ile yalnızca kendi commit'lerinizin gideceğini doğrulayın.
- `master` sizin dalınızın atası değilse **force push yapmayın**; rebase edin,
  çakışmayı görerek çözün, testleri yeniden koşun.

---

## Teslim protokolü

İş "bitti" demeden önce, sırayla:

1. **Çalışma ağacını görün**
   ```bash
   git status --short
   git diff --cached --name-only     # staged dosya listesi — yalnızca sizinkiler olmalı
   ```
   Listede sizin dokunmadığınız bir dosya varsa **commit etmeyin**, çıkarın.

2. **Testler ve damgalar**
   ```bash
   npm test                          # güvenli koşu (canlı süitler atlanır)
   npm run verify:migrations         # göç zinciri + hash bütünlüğü
   node stamp_assets.js --check      # varlık önbellek damgaları güncel mi
   ```
   Üçü de yeşil olmalı.

3. **Veritabanına dokunan değişiklik yaptıysanız**
   Canlı süitler varsayılan koşuda **atlanır** (güvenli test kapısı) ve
   **üretime karşı koşulamaz** — kapı reddeder. Ayrı bir Supabase test
   projesi gerekir; kurulum ve gerekçe: [`docs/TEST_PROJECT_SETUP.md`](docs/TEST_PROJECT_SETUP.md).

   ```powershell
   $env:LEXBNB_ALLOW_DESTRUCTIVE_TESTS = "1"
   $env:LEXBNB_CONFIRM_REMOTE_TEST_PROJECT = "<test-ref>.supabase.co"
   npm run test:live                 # tamamı
   node core/<ilgili>_tests.js       # tek süit (aynı iki değişken gerekir)
   ```

   Kimlik bilgisini okuyan tek yer `core/test_env.js`'dir. Yeni bir canlı süit
   yazarken `.env` dosyasını kendiniz **okumayın**; `loadTestEnv()` çağırın.
   Okursanız `core/test_gate_tests.js` kırılır.

4. **Yeni göç eklediyseniz**
   - Dosya `supabase/migration_phase<N>_<konu>.sql` olarak eklenir.
   - **Phase numarası sahipliği:** Codex yalnızca çift numaraları (`30`, `32`,
     `34`, ...), Claude yalnızca tek numaraları (`29`, `31`, `33`, ...)
     kullanır. Bir aracın sırası kullanılmayacak olsa bile diğer araç o
     numarayı devralmaz; böylece paralel worktree'ler aynı phase adını seçmez.
   - Sonunda kendi doğrulama bloğu bulunur; başarısızsa `RAISE EXCEPTION`
     ile durur.
   - `supabase/migration_manifest.txt`'e dosya adı + sha256 kaydedilir.
   - `npm run verify:migrations` hem hash'leri hem **bağımlılık sırasını**
     doğrular. Manifest sırası "hangi dosyalar" değil **"hangi sırayla"**
     sözleşmesidir; sona eklemek her zaman güvenli değildir. Göçünüz daha
     önce tanımlanmamış bir tabloya ya da kısıta dayanıyorsa satırın yeri
     önemlidir.
   - **`npm run test:bootstrap` ile test projesine uygulayın.** Test projesi
     kendiliğinden güncellenmez ve canlı süitler oraya koşar; uygulamazsanız
     süitler eski şemaya karşı çalışır. Bu adım aynı zamanda göçün sıfırdan
     kurulan bir veritabanında **gerçekten çalıştığının** tek kanıtıdır —
     üretim elle ve çalışan bir sırayla kurulduğu için oradaki başarı bunu
     göstermez (`CLAUDE.md` §5.7).

5. **Üretim göçü ayrı ve açık onayla uygulanır**
   Göçler Supabase Dashboard → SQL Editor'den **elle** çalıştırılır.
   Araç kendi başına üretim şemasını değiştirmez; kullanıcıdan **ayrı ve açık
   onay** ister. Onay "kodu yaz" demekle aynı şey değildir.

   **Dikkat — dağıtım sırası tuzağı:** GitHub Pages push ile **anında** yayına
   alır, göçler ise elle uygulanır. Yani kod her zaman göçten önce canlıya
   çıkabilir. Yeni bir sütuna/tabloya bağlı istemci kodu, göç uygulanana kadar
   o akışı tamamen kırar. Ya kodu şemaya dayanıklı yazın ya da şema
   değişikliği gerektirmeyen bir tasarım seçin.

---

## Komut sözlüğü

Kullanıcı bu kelimeleri tek başına yazabilir; **her araç aynı şeyi anlar.**
"İşi bitirmek" ile "push etmek" bilerek **iki ayrı adımdır**: Kural 5 gereği
`master`'a aynı anda tek araç dokunur, sırayı kullanıcı verir.

### `TESLİM`
İşi tamamla ama **push etme.** Sırayla:
1. `git status --short` ve `git diff --cached --name-only` — staged listede
   yalnızca senin dosyaların olmalı.
2. `npm test`, `npm run verify:migrations`, `node stamp_assets.js --check`.
3. Veritabanına dokunduysan ilgili canlı süiti **test projesine karşı** koş
   (teslim protokolü 3 — üretime koşulamaz).
4. Kendi dalına commit at.
5. Şunu raporla: ne değişti, hangi dosyalar, test sonuçları, **uygulanması
   gereken göç var mı**, push için hazır mı.

Push izni ayrıca istenir. Kendiliğinden `master`'a dokunma.

### `PUSH`
Şimdi `master`'a gönder. Önce:
```bash
git fetch origin
git log --oneline origin/master..HEAD    # yalnızca senin commit'lerin olmalı
```
Yabancı commit görüyorsan **dur ve sor.** `master` dalının atası değilse
rebase et, çakışmayı görerek çöz, testleri yeniden koş, sonra push et.
**Force push yok.**

### `REBASE`
Diğer araç `master`'a push etti. `git fetch origin` + `git rebase origin/master`,
çakışmaları görerek çöz, `npm test` ve `node stamp_assets.js --check` yeşile
dönene kadar teslim etme.

### `DENETLE`
Karşılıklı denetim — aşağıya bakın.

### `GÖÇ UYGULANDI`
Kullanıcı bir göçü Supabase panelinden çalıştırdı. Dosyaya bakarak değil,
**üretime sorarak** doğrula (§4.2'deki yöntemler). Canlı süitler artık üretimi
hedefleyemez; davranışı test projesinde ölçün, üretimde göçün varlığını anon
RPC ya da sütun sorgusuyla doğrulayın.

---

## Karşılıklı denetim

Biri işini push ettikten sonra diğerine verilecek istek şudur:

> "Son N commit'i denetle: tam test paketini koştur, göçlerin üretimde
> uygulanıp uygulanmadığını doğrula, `CLAUDE.md` ve `AGENTS.md` kurallarına
> aykırı bir şey var mı bak. Bulduğun hatayı düzelt ama karşı tarafın yarım
> işine dokunma."

Denetleyen taraf **düzeltmeyi de yapar**, ama karşı tarafın yarım işine
dokunmaz: düzeltme ya yeni bir dosyadır (göç, test) ya da kendi
worktree'sindeki dalında durur.

Denetim raporu şu başlıkları taşır: doğrulananlar, bulunan hatalar, yapılan
düzeltmeler ve commit'ler, test sonuçları, üretim kontrolü, hâlâ eksik kalanlar.

**Denetim kod okumakla bitmez.** 2026-09-14'te iki gerçek hata çıktı ve ikisini
de kod okuyan bir AI değil, testler yakaladı. Denetim yapan taraf testleri
gerçekten koşmak zorundadır; "diff temiz görünüyor" denetim değildir.
