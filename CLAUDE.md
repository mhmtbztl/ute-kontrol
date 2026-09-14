# CLAUDE.md — Lexbnb Proje Beyni

Bu dosya, projede çalışan herkes (ve her AI aracı) için tek referans noktasıdır.
**Yeni bir şey öğrenildiğinde buraya yazılır.**

---

## 1. Ürün ne?

Lexbnb, lüks kısa dönem kiralama (STR) işletmeleri için **çok kiracılı (multi-tenant) ticari bir SaaS**.
Firmalara satılacak — kişisel araç veya demo değil. Bu, kalite çıtasını belirler:

- Müşteriye **uydurma veri gösterilmez.** Hesaplanamayan yerde "—" yazılır, tahmin edilmez.
- Bir müşterinin verisi **asla** başka bir müşteriye görünmez.
- `localStorage`'a yazıp "kaydedildi" demek kabul edilemez; veri Postgres'te durur.

**Canlı:** https://lexbnb.space (GitHub Pages, `master` dalının kökünden)
**Repo:** github.com/mhmtbztl/ute-kontrol

---

## 2. Mimari

| Katman | Nerede |
|---|---|
| Arayüz | `index.html` (tek sayfa, ~265 KB) + `style.css` |
| Uygulama mantığı | `app.js` (tek dosya, ~528 KB) |
| Servis modülleri | `core/*.js` — hem Node'da hem tarayıcıda çalışır |
| Testler | `core/*_tests.js`, koşucu `run_all_tests.js` |
| Veritabanı | Supabase PostgreSQL, `supabase/schema.sql` + `migration_phase*.sql` |

### Altyapı

- **DNS + alan adı:** Hostinger. Apex A kayıtları GitHub Pages IP'lerine bakar — **onlara dokunmayın.**
- **E-posta:** Resend ücretsiz katman, `lexbnb.space` doğrulanmış. Supabase'e custom SMTP olarak bağlı
  (`smtp.resend.com:465`, kullanıcı adı birebir `resend`, gönderen `noreply@lexbnb.space`).
- **Supabase proje ref:** `kirpcqklyjlrhvdbgdrq`

Supabase panelinde bulması zor ayarlar (menüde arama, doğrudan gidin):
```
SMTP            .../project/kirpcqklyjlrhvdbgdrq/auth/smtp
Site/redirect   .../auth/url-configuration
Hız limitleri   .../auth/rate-limits
E-posta onayı   .../auth/providers
```

---

## 3. Değişmez kurallar

### 3.1 Kimlik doğrulama
Tek kaynak **Supabase Auth**. Yerel şifre karşılaştırması, PIN, `?key=` bypass — hepsi kaldırıldı, geri gelmemeli.
Giriş yalnızca **e-posta** ile yapılır (`signInWithPassword` kullanıcı adı kabul etmez).

### 3.2 Tenant kimliği
Bulut yoluna **yalnızca gerçek UUID** girer:
```js
function isCloudTenant(tenantId) { return !!(supabaseClient && isUUID(tenantId)); }
```
Bu bir **beyaz listedir**. Daha önce `tenantId.startsWith('usr_')` kara listesi vardı ve
`ten_<timestamp>` gibi kimlikler süzülüp Postgres'e gidiyordu → her yazma `22P02` ile düşüyordu.
Kara listeye geri dönmeyin.

### 3.3 Yazma koruması
`requireCloudForWrite(islem, tenantId)` — bağlantı yoksa yazma **durur**, sessizce localStorage'a yazılmaz.
Node'da (testler) muaf; orada yerel yol doğrulama mantığının test yüzeyidir.

### 3.4 Finansal hesaplama — USALI
```
CİRO   = Σ rezervasyon.brütTutar              (iptaller hariç, temizlik ücreti dahil)
OPEX   = elle girilen giderler
       + Σ OTA komisyonu        ← rezervasyondan otomatik
       + Σ temizlik ücreti      ← rezervasyondan otomatik
NET KÂR = CİRO − OPEX − CAPEX
```
Komisyon ve temizlik **gelirden düşülmez, gider yazılır.** Yönetici paneli ve Finans ekranı
aynı tabanı kullanmalı — bir zamanlar biri brüt, diğeri net kullanıyordu ve aynı ay için
farklı net kâr raporluyorlardı.

Doluluk/RevPAR paydası: `getPeriodDayCount()` — **ayın gerçek gün sayısı**.
Bir zamanlar bir ekranda 30, diğerinde 31, bir başkasında 90 kullanılıyordu.

**Gelirin aya yazılması — tahakkuk (accrual):**
Gelir **gecelere eşit bölünür**, her ay yalnızca kendi gecelerinin payını alır.
Ay sınırını kesen bir rezervasyonda bu şart:

```
04-28 → 05-03, 50.000 TL, 5 gece
  Nisan: 3 gece → 30.000 TL      Mayıs: 2 gece → 20.000 TL
```

Tek kaynak `getBookingFilterShare(b)` (app.js). Rezervasyondan para veya gece
toplayan **her** yer bu payı uygulamak zorundadır — altı ayrı toplama noktası var.

Bir zamanlar `isBookingInFilter()` yalnızca **giriş ve çıkış ayına** bakıyordu ve
Finans ekranı tutarın **tamamını** o aya yazıyordu. İki ayrı bozukluk:
- 04-28 → 05-03 rezervasyonu Nisan'da da 50.000, Mayıs'ta da 50.000 görünüyordu
  (**aynı para iki kez**, aylık toplamların toplamı gerçek cironun üstünde).
- 04-28 → 06-02 rezervasyonu Mayıs'ta **hiç görünmüyordu**, oysa Mayıs'ın 31
  gecesinin tamamı ona aitti.

`core/financial_metrics_service.js` (yönetici paneli) baştan beri gece bazında
dağıtıyordu; bu yüzden aynı ay için iki ekran farklı ciro veriyordu — 3.4'ün
başındaki hatanın başka bir kılıkta tekrarı. Ağı `core/revenue_attribution_tests.js`
tutuyor.

### 3.4.1 Ay kapanışı
Kapatılan dönem **mühürlüdür**. Koruma tetikleyicileri konaklamanın **tüm gece
aralığına** bakar ve hem **eski** hem **yeni** satırı kontrol eder — yoksa kayıt
kapalı aydan açık aya taşınarak kaçırılır.

Kapanış kaydı yalnızca RPC ile değişir; doğrudan `INSERT/UPDATE/DELETE`
reddedilir. Dönemi açmak ayrı bir işlemdir: `reopen_monthly_period_atomic`,
yalnızca **owner/admin**, **gerekçe zorunlu**, kayıt silinmez, `history_json`'a işlenir.

Kapanış anlık görüntüsü **sunucuda** hesaplanır (`compute_month_close_snapshot`).
İstemcininki de saklanır ve karşılaştırılır (`client_matches_server`,
`revenue_delta`). Bir muhasebe kapanışının rakamını tarayıcıya hesaplatmayın.

Henüz **başlamamış** bir ay kapatılamaz.

### 3.5 Arayüzde sabit değer yasağı
`index.html`'de **sayı içeren hiçbir id** sabit bir değerle duramaz. Ya JS yazar ve
başlangıç değeri nötrdür (`—`), ya da gerekçesiyle `core/static_ui_value_tests.js`
içindeki ALLOWLIST'e eklenir.

Bu kural tesadüfi değil: bu oturumda bulunan hataların çoğu tam bu kalıptı —
`pricingAdrVal "₺16.500"`, `opsReadyPropsVal "5 / 5"`, `dummyMoMDeltas`,
`finActualRevenue "483.965 TL"`. Toplam 100'den fazla nokta.

### 3.6 Demo yok / uydurma veri yok
Demo portföyü ve paralel yerel yolu **tamamen kaldırıldı** (2026-09-13).
Yeniden kurulacaksa **Supabase'de gerçek bir tenant** olarak kurulmalı — paralel kod yolu değil.
Sebep: test edilmeyen ikinci bir yürütme yolu üretimde çalışıyordu ve bulunan her hata sınıfının kaynağıydı.

**Uydurma veri yasağı (2026-09-13 taraması).** Demo portföyü kaldırıldıktan sonra
artıkları uygulamanın içinde kaldı ve müşteriye gösterilmeye devam etti:
indirilebilir yönetici raporu sabit "5.004.165 TL ciro / 88-100 skor" yazıyordu,
AI finans analisti cirosu sıfırdan büyük **herkese** "Villa Azure Bay liderliği"
diyordu, ilan eleştirmeni her URL için 79/100 uyduruyordu, boşluk gecesi motoru
gerçek boşluk yoksa üç tane uyduruyordu.

Kural: **hesaplanamayan yerde rakam yazılmaz.** Bir özellik gerçek veriyi
ölçemiyorsa (ör. OTA ilan puanı) bunu açıkça söyler; skor uydurmaz.

Ağı `core/demo_residue_tests.js` tutuyor — kaynak taraması. Uydurma villa adları,
sabit tarihler, ilk müşterinin rakamları, silinmiş `DEFAULT_*` referansları,
kapsam dışı villa seçicileri ve "yoksa uydur" kalıbı için kırılır.

**"Bugün" sabit yazılmaz.** Tek kaynak `getTodayStr()`. Bir zamanlar 20 ayrı
yerde `'2026-09-07'` sabitti ve yalnızca ekranı değil **kayıtları da** bozuyordu:
temizlik ödemesi hangi gün işaretlenirse işaretlensin ödeme tarihi 2026-09-07
kaydediliyordu.

**Dönem ve mülk listeleri müşterinin verisinden üretilir.** Dönem seçicileri
2025-07..2027-12 arasında sabitti (`refreshPeriodSelectors` +
`computeFinancialMonthRange` ile düzeltildi); villa seçicilerinin tamamı
`updateAllVillaDropdowns` kapsamında olmalı.

### 3.7 Veri sıfırlama
"Sıfırla" tuşu bulut hesabında **hiçbir şey yapmıyordu** — yalnızca "bu işlem bulut
hesabınızdaki kayıtları silmez" uyarısı gösteriyordu.

`reset_tenant_data(tenant_id, 'VERILERI SIFIRLA')` — tek transaction, **yalnızca
owner**, yazılı onay zorunlu, 33 tablo. **İşletme ve ekip üyeleri korunur**; sadece
defterler boşalır. Hesabı tamamen kapatmak ayrı bir işlemdir (`delete_my_account`).

Sıfırlama sırasında beş koruma `fn_tenant_reset_in_progress()` ile askıya alınır
(kapanmış dönem ×2, kapanış kaydı, kabul edilmiş teklif, gönderilmiş mesaj).
Yeni bir koruma eklerken aynı istisnayı tanımlayın — yoksa sıfırlama yarıda kalır
ve kısmi veriyle daha kötü bir duruma yol açar. Bayrak işlem sonunda kapanmalı;
`tenant_reset_tests` 13. iddia bunu ölçer.


---

## 4. Çalışma düzeni

### 4.1 Commit öncesi
```bash
node stamp_assets.js     # varlıkları içerik hash'iyle damgala (ZORUNLU)
npm run verify:migrations # şema + 34 göçün içerik bütünlüğü
npm test                  # 84 çevrimdışı/güvenli süit
npm run test:live         # yalnız ayrı test projesi + açık destructive-test onayı
```
`stamp_assets.js --check` güncel değilse hata verir — CI'ya konabilir.

**Damgalayıcı iki yeri birden kapsar.** `index.html`'deki `src`/`href` damgalarına ek
olarak, `core/marketing_ui.js` bağımlılıklarını `<script>` etiketiyle değil kendi
içindeki bir tabloyla (`'core/marketing_engine.js?v=xxxxxxxx'`) çalışma anında
yüklüyor. Bu damgalar bir zamanlar elle yazılmıştı ve **15'inin 15'i de** dosya
içeriğiyle uyuşmuyordu — yani o dosyalar için önbellek kırma hiç çalışmıyordu.
Yeni bir çalışma anı yükleyici eklerseniz dosyayı `stamp_assets.js` içindeki
`SATELLITE_FILES` listesine ekleyin, yoksa `--check` onu görmez.

`index.html` kendi başına 10 dakika önbelleklenir (GitHub Pages `max-age=600`, başlık
değiştiremiyoruz). Deploy sonrası eski sürüm görürseniz `Ctrl+Shift+R`.

### 4.2 Göç (migration) uygulama
DDL, PostgREST üzerinden çalıştırılamaz ve `.env`'de doğrudan Postgres bağlantı dizesi yok.
**Göçler Supabase Dashboard → SQL Editor'den elle çalıştırılır.** Her göç dosyasının
sonunda kendi doğrulama bloğu vardır; başarısızsa `RAISE EXCEPTION` ile durur.

Uygulanmış göçler: phase13 (kullanıcı silinebilirliği), phase14 (son-sahip koruması),
phase15 (cascade istisnaları), phase16 (ekip daveti), phase18 (hesap kapatma),
phase19 (atomik rezervasyon silme), phase20 (ay kapanışı bütünlüğü),
phase21 (veri sıfırlama), phase17 (pazarlama — 14 tablo + 20 fonksiyon,
2026-09-13 doğrulandı).

phase22 (Phase 17 fonksiyonlarından `anon` yetkisinin geri alınması) uygulandı.

**Bekleyen — ACİL:** phase23 (`migration_phase23_marketing_tenant_guard.sql`).
Çapraz kiracı yazma açığını kapatır (§7'ye bakın). Uygulanana kadar
`marketing_tenant_isolation_tests.js` **kırmızı kalır ve kırmızı kalması
doğrudur** — üretimde gerçekten yabancı kiracı yazabiliyor demektir.

Göçün uygulanıp uygulanmadığını doğrulamanın en hızlı yolu şemayı okumak değil,
**PostgREST'e anon anahtarıyla sormaktır**: fonksiyon gövdesindeki hatayı
(`MARKETING_FINDING_NOT_FOUND`) görüyorsanız anon hâlâ çalıştırabiliyordur;
`permission denied for function` görüyorsanız göç uygulanmıştır.

### 4.3 Paralel çalışma (Codex / Antigravity)
Bu repoda başka AI araçları da çalışıyor. **Dosya bazında bölüşün.**

- Pazarlama: `core/marketing_*.js`, `docs/`, `index.html`'deki `tab-marketing` → `codex/marketing` dalı, ayrı worktree
- Geri kalan her şey → `master`

Tek ortak dosya `run_all_tests.js` (süit listesi). Çakışma orada olur, küçüktür.

**Uyarı:** Antigravity bir kez ben çalışırken commit atıp yarım düzenlememi kendi commit'ine
kattı. Çok dosyalı bir değişikliğe başlamadan `git log --oneline -1` ve `git status` bakın,
bitince tekrar bakın. `git status` siz commit atmadan temizlendiyse başkası araya girmiştir.

---

## 5. Test altyapısı — bilinen tuzaklar

Bu tuzaklar gerçekten yaşandı; tekrar etmeyin.

1. **Supabase JS hata FIRLATMAZ**, `{ error }` döndürür. Kontrol etmezseniz temizlik
   sessizce başarısız olur — bu şekilde üretimde **525 artık test hesabı** birikmişti.
2. **`try` içindeki `return`**, `try/finally`'den sonraki özet ve `process.exit(1)` satırlarını atlar.
   Süit hatalı olduğu hâlde 0 ile çıkar. Özeti `finally` içine koyun.
3. **`execSync` yalnızca stdout döndürür.** `[FAIL]` satırları `console.error` ile stderr'e gider.
   Koşucu `2>&1` ile ikisini de yakalar — bu olmadan "sıfır çıkış koduyla [FAIL]" ağı hiç çalışmaz.
4. **Testler üretim Supabase'ine karşı koşar.** Koşucu sonunda sızıntı denetimi yapar;
   `@lexbnb-e2e.test`, `@lexbnb.test`, `@lexbnbtest.com`, `@lexbnb-test.com` alan adlı
   hesap kalırsa koşu başarısız sayılır. Temizlik: `supabase/cleanup_test_accounts.sql`.
5. **Yeni bir test yazdığınızda, eski koda karşı çalıştırıp KIRILDIĞINI görün.**
   Kırılmıyorsa regresyon ağı değildir.
6. **Tam koşuyu arka arkaya tekrarlamayın.** Her süit auth kullanıcısı yaratıyor;
   iki-üç ardışık tam koşudan sonra Supabase `Request rate limit reached` döner ve
   **10'a yakın süit sahte biçimde kırmızı olur**. Kod regresyonu sanmayın:
   süiti tek başına koşun, geçiyorsa hız limitidir. Birkaç dakika bekleyin.

### Kabuk tuzakları (Windows / Git Bash)
- Heredoc (`<<'SCRIPT'`) bir kaçış seviyesi yiyor: `'\\b'` dosyada `'\b'` (backspace) oluyor
  ve regex sessizce hiçbir şeyle eşleşmiyor. Ters bölü gerekiyorsa `String.fromCharCode(92)`
  kullanın ya da regex yerine `indexOf`/`startsWith` ile çalışın.
- Dosyalar **CRLF**. Çok satırlı `\n` içeren eşleşmeler tutmaz; satır bazlı gidin.
- `String.prototype.replace` replacement'ında **`$$` tek `$`'a dönüşür.** SQL/JS gövdesi
  taşırken `AS $$` bozulur. Metni birebir yerleştirmek için `slice`/`splice` kullanın.

---

## 6. Bilinen açık işler

| Konu | Durum |
|---|---|
| Rezervasyon düzenleme/silme akışı analizi | tamamlandı (phase19) |
| Ay kapatma akışı analizi | tamamlandı (phase20) |
| Demo artığı taraması | tamamlandı — ağı `demo_residue_tests` |
| Veri sıfırlama | tamamlandı (phase21) — göç uygulandı |
| Phase 17 pazarlama (Codex, PR #1) | birleştirildi; tablolar + RPC'ler üretimde |
| Phase 17 `anon` yetkisi | tamamlandı (phase22 uygulandı) — ağı `marketing_anon_grant_tests` |
| Çapraz kiracı yazma açığı | **phase23 göçü uygulanmayı bekliyor — ACİL** — ağı `marketing_tenant_isolation_tests` |
| Fotoğraf AI worker'ı | `GEMINI_API_KEY` yok; Actions adımı güvenle atlanıyor — **harici bağımlılık** |
| `get_executive_dashboard_snapshot` | tanımlı ama arayüzde **hiç çağrılmıyor**; içinde tahakkuk ve gece sayımı hataları var (§3.4) |
| Excel içe/dışa aktarma | "Şirket Genel Raporu" içe aktarımı devre dışı bırakıldı, gerçek uygulama yok |
| Bildirim merkezi analizi | yapılmadı |
| OTA ilan analizi (`runAiListingCritic`) | veri bağlantısı yok; artık skor uydurmuyor, durumu açıkça söylüyor |
| Demo'yu Supabase'de gerçek tenant olarak yeniden kurma | yapılmadı |
| Pazarlama ROAS'ı | kampanya gelir alanı kullanıcı girdisi; "ölçülmüş" gibi sunuluyor, etiketlenmeli |
| RGVQI denetim düzeltmeleri | phase24 ve phase25, 14 Eylül 2026'da üretime uygulandı ve readiness denetimiyle doğrulandı; uygulama/worker dağıtımı ayrıca izlenmeli |
| Güvenli test kapısı | `npm test` yalnızca çevrimdışı suite'leri çalıştırır; canlı suite için ayrı test projesi ve açık onay gerekir |
| Kullanıcı davet e-postası | phase24 outbox + `npm run invitations:worker`; üretimde worker secret'ları kurulmalı |

---

## 7. Güvenlik notları

- `.env` **asla** commit edilmez (`.gitignore`'da). İçinde `service_role` anahtarı var — tam yetkili.
  Tarayıcı koduna hiç girmedi, git geçmişine hiç girmedi.
- **Supabase, `public` şemasındaki yeni fonksiyonlara varsayılan olarak `anon` rolüne EXECUTE verir.**
  `REVOKE ALL ... FROM PUBLIC` bunu **kaldırmaz** — `anon`'u ayrıca revoke etmek gerekir.
  Yeni bir SECURITY DEFINER fonksiyon eklerken:
  ```sql
  REVOKE ALL ON FUNCTION public.fn(...) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fn(...) FROM anon;
  GRANT EXECUTE ON FUNCTION public.fn(...) TO authenticated;
  ```
  **Bu kural 2026-09-13'te yeniden ihlal edildi:** Phase 17'nin 15 göç dosyasının
  hiçbiri `anon`'u revoke etmedi. Beşi `FROM PUBLIC` yazıp doğru olanı yaptığını
  sandı. Üretimde doğrulandı — anon anahtarıyla `review_marketing_finding`
  çağrısı SECURITY DEFINER gövdesine kadar girdi.

  Kural bu yüzden **iki katlıdır**: grant'i geri alın **ve** her SECURITY DEFINER
  fonksiyonun gövdesine kendi yetki kontrolünü (`auth.uid()` + `get_tenant_role()`,
  worker'larda `SERVICE_ROLE_REQUIRED`) koyun. Phase 17'de veri sızmamasının tek
  sebebi ikinci kattı. Ağı `core/marketing_anon_grant_tests.js` tutuyor.

  Yetki kontrolünü **kayıt aramadan önce** yapın. `review_marketing_finding` önce
  `SELECT ... FOR UPDATE` yapıp sonra yetkiye bakıyor: kimliği doğrulanmamış bir
  çağrı rastgele satırlara kilit alabiliyor ve hata mesajı ("bulunamadı" ile
  "yetkisiz" farklı) bir UUID'nin var olup olmadığını sızdırıyor.
- **`NULL NOT IN (...)` bir koruma DEĞİLDİR.** Phase 17'nin yetki kontrolü şuydu:

  ```sql
  IF auth.uid() IS NULL
     OR public.get_tenant_role(p_tenant_id) NOT IN ('owner','admin','manager') THEN
      RAISE EXCEPTION 'UNAUTHORIZED...';
  END IF;
  ```

  Çağıran kişi **hedef kiracının üyesi değilse** `get_tenant_role` NULL döner.
  SQL üç değerli mantığında `NULL NOT IN (...)` sonucu TRUE değil **NULL**'dır;
  `FALSE OR NULL` → NULL; `IF NULL THEN` çalışmaz. Yani koruma **tam da
  korumasi gereken anda** — yabancı kiracıdan gelen çağrıda — sessizce atlanır.

  Üretimde kanıtlandı (2026-09-14): B kiracısının sahibi, A kiracısının
  defterine kanal ilanı, kanal snapshot'ı ve pazarlama referansı yazdı.
  Okuma tarafı RLS ile korunuyordu (sızıntı yok); kırılan **yazma bütünlüğüydü**.

  Phase 16 aynı kontrolü doğru yazıyordu: `IF v_role IS NULL OR v_role NOT IN (...)`.
  Phase 17 `IS NULL` yarısını düşürdü. Doğru kalıp ikisinden biri:

  ```sql
  COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner','admin','manager')
  v_role IS NULL OR v_role NOT IN ('owner','admin','manager')
  ```

  RLS politikaları **pozitif** `IN` kullandığı için etkilenmedi (NULL → izin yok).
  Tehlike yalnızca prosedürel `IF ... NOT IN` kalıbındadır.

  İki ağ birden tutuyor: `marketing_anon_grant_tests` kaynakta kalıbı yasaklar,
  `marketing_tenant_isolation_tests` üretime karşı davranışı ölçer.
- **Yetki yükseltme:** `admin` rolü yalnızca `manager/staff/viewer` verebilir. Bir zamanlar
  doğrudan `owner` ekleyebiliyordu — işletmeyi devralma yolu.
- **Koruma tetikleyicileri cascade'i engellememeli.** Beş tetikleyici (son sahip, kapanmış dönem ×2,
  gönderilmiş mesaj, kabul edilmiş teklif) üst kayıt silinirken devreye girip hesap silmeyi
  kilitliyordu. `fn_tenant_is_being_deleted()` ile istisna tanımlı — yeni koruma eklerken aynısını yapın.
