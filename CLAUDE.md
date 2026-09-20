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
- **Supabase proje ref (ÜRETİM):** `kirpcqklyjlrhvdbgdrq`
- **Supabase proje ref (TEST):** `pdeiorpgxetksyogrmbi` — veritabanına yazan 22 süit
  yalnızca buraya koşar. Üretim `core/test_env.js` içinde **kara listededir**: onay
  değişkeni doldurulsa bile hedeflenemez. Test projesinde custom SMTP **yoktur** ve
  e-posta onayı **kapalıdır**; ikisi de zorunlu, gerekçeleri
  `docs/TEST_PROJECT_SETUP.md` içinde.

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
       ├─ oda geliri      = brüt − temizlik ücreti
       └─ temizlik geliri = misafirden alınan temizlik ücreti
OPEX   = elle girilen giderler
       + Σ OTA komisyonu          ← rezervasyondan otomatik
       + Σ temizlik MALİYETİ      ← rezervasyondan otomatik (personele ödenen)
NET KÂR = CİRO − OPEX − CAPEX
```
Komisyon **gelirden düşülmez, gider yazılır.** Yönetici paneli ve Finans ekranı
aynı tabanı kullanmalı — bir zamanlar biri brüt, diğeri net kullanıyordu ve aynı ay için
farklı net kâr raporluyorlardı.

**Temizlik iki ayrı kalemdir; asla tek sayıya indirgenmez (2026-09-14 kararı).**

| | Alan | Nerede durur | Ne |
|---|---|---|---|
| Gelir | `cleaning_fee` | `bookings.cleaning_fee` | Misafirden alınan temizlik ücreti. **Brüt tutarın içindedir**, ayrı gelir kalemi olarak raporlanır. |
| Gider | `cleanCost` | `cleaning_tasks.amount` | Personele ödenen temizlik maliyeti. Temizlik & Borç defterine borç yazılır; "Ödendi" işaretlenince gider defterine geçer. |

Maliyet için `bookings`'e **yeni sütun açılmadı, bilerek.** Denendi ve kırdı:
göçler Supabase panelinden elle uygulanıyor ama GitHub Pages push ile anında
yayına alıyor; yeni sütuna bağlı kod, göç uygulanana kadar **rezervasyon
kaydını tamamen kırıyor** (`booking_crud_tests` bu şekilde kırmızı oldu, çünkü
o test `mapBookingToDb()` çıktısını doğrudan insert ediyor). Maliyetin zaten
kalıcı ve doğal adresi temizlik borç defteridir; aynı sayıyı iki tabloda
tutmak ayrıca "hangisi doğru" sorusunu açardı. `syncBookingCleaningTasks()`
yüklemeden sonra değeri oradan geri okur.

Bir zamanlar rezervasyon ekranında **tek bir "Temizlik Ücreti" alanı** vardı ve o sayı
aynı anda hem `cleaning_fee` olarak (gelir) kaydediliyor hem de temizlik görevinin
personele ödenecek tutarı (gider) oluyordu. Misafirden 1.500 TL alıp personele
1.200 TL ödeyen işletmede aradaki 300 TL yok sayılıyordu: kâr marjı ve temizlik
borcu aynı anda yanlıştı. Ağı `core/booking_form_economics_tests.js` tutuyor.

Rezervasyonun bağlı bir temizlik görevi **yoksa** kayıt bu ayrımdan öncedir; doğru
maliyet bilinmiyordur ve **uydurulmaz** (§3.6). İstemci o durumda eski davranışa
düşer (maliyet = ücret); işletme rezervasyonu düzenleyip gerçek maliyeti girdikçe
veri düzelir.

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

**Sıfır olmayan varsayılan, uydurma veridir (2026-09-17 taraması).** `x.roas || 8.0`
kalıbı masum görünür ama tam olarak ölçülmemiş bir şeyi ölçülmüş gibi gösterir.
Pazarlama ekranı bu kalıpla doluydu ve **bomboş bir hesapta bile** rakam yazıyordu:

- `runAIMarketingAdvisor` — "AI Analizini Yenile" düğmesi onu **argümansız**
  çağırıyordu, yani her zaman `context = {}` yolundan geçiyordu: Meta 8,0x /
  Google 9,5x ROAS, 28.000 TL OTA komisyonu, "tahmini **+32.000 TL ek ciro**",
  sabit arama kelimeleri ve şehir listesi.
- `runMarketingBudgetSimulation` — kutunun etiketi "Geçmiş ROAS'a göre
  hesaplanır" diyordu; gerçekte sabit 9,5x / 8,0x / 10,5x çarpanlarıyla
  "Beklenen Toplam Ciro" üretiyordu.
- `detectGapNights` — gecelik fiyatı **silinmiş demo anahtarlarına** bağlı bir
  merdivenden alıyordu (`vKey === 'AZURE' ? 18000 : ... : 12000`). Bu rakam
  yalnızca ekranda kalmıyordu: "Durum" ve "Flaş Hikaye" düğmeleri onu
  **misafire gönderilen metne** koyuyordu.
- Satış kapanış asistanı — misafire "1.200 m² korunaklı bahçe, ısıtmalı
  jakuzi, sınırsız meşe şömine odunu, Akdeniz kıyısı" yazıyordu ve "1 çuval
  odun hediye", "%30 avantajlı" gibi **işletmenin yerine getirmek zorunda
  kalacağı taahhütler** veriyordu. Hiçbiri mülkün verisinden gelmiyordu.
- Mülk formu ve içe aktarım — `base_price: v.basePrice || 20000` ve
  `clean_cost: ... || 1500` **Postgres'e yazıyordu**. Kullanıcının hiç
  girmediği bir fiyat mülkün gerçek fiyatı oluyor, oradan fırsat fiyatına ve
  misafire giden metne taşınıyordu.
- Temizlik tutarı — `cleanCost || 1500` **borç defterine** yazılıyordu.

`|| 0` ve `?? 0` yasak değildir: toplamada 0 etkisiz elemandır. Yasak olan
**sıfır olmayan** varsayılandır. Ölçülemeyen değer `null` taşınır, ekranda "—"
yazılır ve **neden** ölçülemediği söylenir.

Pazarlama ekranı `renderAll()` içinde **değildir** (sekme açılınca çalışır);
bu yüzden render hattı testi onu hiç koşmuyordu. `render_pipeline_tests` artık
sahte DOM ile `renderMarketingModule` + danışman + simülatörü de koşuyor ve
boş işletmede ekranda uydurma rakam çıkmadığını doğrudan ölçüyor.

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
npm run verify:migrations # göçlerin içerik bütünlüğü + bağımlılık sırası
npm test                  # 101 çevrimdışı/güvenli süit
npm run test:bootstrap    # test projesine eksik göçleri uygula (--check salt okunur)
npm run test:live         # 125 süit, yalnız ayrı test projesine karşı
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

phase22 (`anon` yetkisinin geri alınması), phase23 (çapraz kiracı yazma açığı),
phase24 (RGVQI denetim düzeltmeleri), phase25 (bulgu incelemesinde yetki sırası)
ve phase26 (mülk koruması istisnaları) **14 Eylül 2026'da uygulandı.**

phase27 (misafir CRM bağlantısı) ve phase28 (misafir tercihleri, iç notlar,
izin geçmişi) **15 Eylül 2026'da uygulandı**; üretime sorularak doğrulandı
(§4.2 sütun sorgusu: `bookings.primary_guest_id`, `guests.preferences`,
`guests.tags`, `guest_consent_events` — hepsi mevcut). İkisi ayrıca test
projesine `npm run test:bootstrap` ile uygulandı ve sıfırdan kurulan bir
şemada temiz çalıştıkları görüldü.

**phase29 (`migration_phase29_notification_authz_order.sql`) 20 Eylül 2026'da
üretime uygulandı ve doğrulandı.** Test projesinde de kurulu
(`npm run test:bootstrap:check`: 0 eksik, 41 uygulanmış; phase30 dahil).
Ne yaptığı: `acknowledge_notification_atomic` ve `resolve_executive_alert_atomic`
için yetkiyi satır kilidinden öne alır, varlık oracülünü kapatır ve `anon`
yetkisini geri alır. Ağı `core/notification_authz_tests.js` (16 iddia).

Doğrulama, aynı gün iki kez §4.2 yöntemiyle yapıldı — **önce ve sonra**:

```
UYGULANMADAN ÖNCE (anon anahtarı, var olmayan UUID):
  acknowledge_notification_atomic -> 200 {"error": "NOTIFICATION_NOT_FOUND", "success": false}
  resolve_executive_alert_atomic  -> 200 {"error": "ALERT_NOT_FOUND",        "success": false}

UYGULANDIKTAN SONRA:
  acknowledge_notification_atomic -> 42501 permission denied for function
  resolve_executive_alert_atomic  -> 42501 permission denied for function
```

Fonksiyonun kendi hata mesajı yerine `permission denied` dönmesi, göçün
uygulandığının kanıtıdır. Bu ayrım §4.2'nin yetki göçü testidir ve
salt okunurdur — üretime kayıt bırakmaz.

**Bilinen ve kabul edilen yan etki:** phase29 `FOR UPDATE` satır kilidini
tamamen kaldırdı (yetki kontrolünün kilitten önce gelmesi böyle
sağlandı). Artık `SELECT` ile `UPDATE` arasında satır silinirse `UPDATE`
0 satır etkiler ama fonksiyon yine `{"success": true}` döner. Bu satırlar
tek tek silinmiyor (yalnızca kiracı sıfırlama ve hesap kapatma akışlarında,
cascade ile), pencere mikrosaniye ve istemci `success` üzerinden yıkıcı bir
iş yapmıyor. Düzeltmek yeni bir göç gerektirir; **bilerek ertelendi.**
Düzeltilecekse `GET DIAGNOSTICS ... ROW_COUNT` ile 0 satır durumu
`success: false`'a çevrilmeli.

**phase30 (`migration_phase30_booking_channel_settings.sql`) 20 Eylül 2026'da
üretime uygulandı ve doğrulandı.** `tenant_booking_channels` tablosu üretimde
mevcut; anon tablo sorgusu eksik şema (`PGRST205`) yerine `401 permission
denied for table` ve anon `save_tenant_booking_channel` çağrısı `401/42501
permission denied for function` döndürdü. Böylece hem göçün varlığı hem de
doğrudan/anon yazma kapısı, üretime kayıt bırakmadan doğrulandı. Test projesinde
owner/manager, viewer, anon, çapraz tenant, özel kanal rezervasyonu ve pasif
kanal geçmişi dahil canlı süit 26/26 geçti.

**Bir göçün uygulanıp uygulanmadığı, dosyaya bakarak anlaşılmaz.** Dosya repoda
durur; veritabanı uygulanmamış olabilir. Doğrulamanın yolu üretime sormaktır:

- **Yetki göçleri** → anon anahtarıyla RPC çağırın.
  `permission denied for function` = uygulanmış;
  fonksiyonun kendi hata mesajı (ör. `MARKETING_FINDING_NOT_FOUND`) = uygulanmamış.
- **Davranış göçleri** → ilgili canlı süiti koşun. `tenant_reset_tests` ve
  `account_deletion_tests` phase26'yı, `marketing_tenant_isolation_tests`
  phase23'ü böyle ölçer.
  **Ama bu süitler artık üretimi hedefleyemez** (§5.4): davranışı *test
  projesinde* ölçerler. Bir göçün **üretimde** olduğunu doğrulamak için
  yukarıdaki yetki ve sütun sorgularını kullanın — onlar salt okunurdur ve
  üretime kayıt bırakmaz.
- **Sütun/tablo göçleri** → `select=<sutun>&limit=0` ile sorun; `42703`
  dönüyorsa uygulanmamıştır.

### 4.3 Paralel çalışma (Codex / Claude / Antigravity)

Bu repoda birden fazla AI aracı **aynı anda** çalışıyor ve hepsi `app.js` (~530 KB)
ile `index.html` (~265 KB) gibi dev ortak dosyalara dokunuyor.

> **Ortak çalışma kurallarının tek kaynağı [`AGENTS.md`](AGENTS.md) dosyasıdır.**
> Worktree düzeni, commit/push kuralları, göç değişmezliği, teslim protokolü ve
> karşılıklı denetim orada tanımlıdır ve **bu repoda çalışan her araç için
> bağlayıcıdır**. Kuralları buraya kopyalamayın: iki kopya kaçınılmaz olarak
> ayrışır ve hangisinin geçerli olduğu belirsizleşir.

Özet — ayrıntı ve gerekçeler `AGENTS.md` içinde:

1. Her araç kendi worktree klasöründe çalışır; ana klasörde tek araç bulunur.
2. `git add -A` / `git add .` yasak — kimse başkasının dosyasını commit etmez.
3. Göç dosyaları değişmezdir; düzeltme **yeni bir göç** olarak eklenir —
   numarası `N+1` olmak zorunda değildir: phase numaraları araçlara ayrılmıştır
   (**Codex çift, Claude tek**), her araç kendi sırasındaki ilk boş numarayı alır.
4. Teslimden önce `npm test`, `npm run verify:migrations` ve
   `node stamp_assets.js --check` yeşil olmalı.
5. `master` dalına aynı anda tek araç dokunur; diğeri haber vermeden merge/push yapmaz.

`AGENTS.md` ayrıca bir **komut sözlüğü** tanımlar — kullanıcı tek kelime yazar,
her araç aynı şeyi anlar: `TESLİM` (bitir, raporla, **push etme**), `PUSH`
(şimdi master'a gönder), `REBASE` (diğeri push etti, üstüne al), `DENETLE`
(karşılıklı denetim), `GÖÇ UYGULANDI` (üretime sorarak doğrula).
"İşi bitirmek" ile "push etmek" bilerek ayrı adımlardır.

Üretim şeması **hiçbir araç tarafından kendiliğinden değiştirilmez**: göçler
Supabase panelinden elle ve **ayrı açık onayla** uygulanır (§4.2).

---

## 5. Test altyapısı — bilinen tuzaklar

Bu tuzaklar gerçekten yaşandı; tekrar etmeyin.

1. **Supabase JS hata FIRLATMAZ**, `{ error }` döndürür. Kontrol etmezseniz temizlik
   sessizce başarısız olur — bu şekilde üretimde **525 artık test hesabı** birikmişti.
2. **`try` içindeki `return`**, `try/finally`'den sonraki özet ve `process.exit(1)` satırlarını atlar.
   Süit hatalı olduğu hâlde 0 ile çıkar. Özeti `finally` içine koyun.
3. **`execSync` yalnızca stdout döndürür.** `[FAIL]` satırları `console.error` ile stderr'e gider.
   Koşucu `2>&1` ile ikisini de yakalar — bu olmadan "sıfır çıkış koduyla [FAIL]" ağı hiç çalışmaz.
4. **Canlı süitler ayrı bir Supabase test projesine yazar; üretim kara listededir.**
   Kimlik bilgisini okuyan tek yer `core/test_env.js`. Kapı üç şey ister:
   `LEXBNB_ALLOW_DESTRUCTIVE_TESTS=1`, `SUPABASE_URL` == `TEST_SUPABASE_URL` ve uzak
   proje için `LEXBNB_CONFIRM_REMOTE_TEST_PROJECT` hostname onayı. Üretim reddi
   **kapatılamaz** — onay değişkeni onu geçmez. Kurulum: `docs/TEST_PROJECT_SETUP.md`.

   Bir zamanlar 22 süit `.env`'i kendi başına, **üç ayrı biçimde** okuyordu
   (`path.join`, `path.resolve` ve çalışma dizinine bağımlı `readFileSync('.env')`).
   Hedefi değiştirmenin tek yolu dosyayı elle takas etmekti; yani varsayılan hedef
   **üretimdi** ve aşağıdaki 525 hesap böyle birikti. Ağı `core/test_gate_tests.js`.

   Koşu sonunda sızıntı denetimi yapılır; `@lexbnb-e2e.test`, `@lexbnb.test`,
   `@lexbnbtest.com`, `@lexbnb-test.com` alan adlı hesap kalırsa koşu başarısız
   sayılır. Temizlik: `supabase/cleanup_test_accounts.sql`.
5. **Yeni bir test yazdığınızda, eski koda karşı çalıştırıp KIRILDIĞINI görün.**
   Kırılmıyorsa regresyon ağı değildir.

   **Sunucu tarafı (SQL) bir ağ için de bu geçerli** ve yapılabilir: TEST
   projesine `pg` ile bağlanın, `pg_get_functiondef('<imza>'::regprocedure)`
   ile mevcut tanımı **kaydedin**, fonksiyonu eski (hatalı) gövdeyle
   `CREATE OR REPLACE` edin, süiti koşun, sonra kaydettiğiniz metni aynen geri
   yükleyip `pg_get_functiondef` çıktısını yeniden okuyarak **birebir aynı**
   olduğunu doğrulayın. Geri yükleme `finally` içinde olmalı.
   `executive_snapshot_tests` böyle ölçüldü: phase12 gövdesine karşı 22
   iddianın 12’si kırıldı. Bu yalnızca TEST projesine dokunur; üretim şeması
   elle ve ayrı onayla değişir (§4.2).
6. **Tam koşuyu arka arkaya tekrarlamayın.** Her süit auth kullanıcısı yaratıyor;
   iki-üç ardışık tam koşudan sonra Supabase `Request rate limit reached` döner ve
   **10'a yakın süit sahte biçimde kırmızı olur**. Kod regresyonu sanmayın:
   süiti tek başına koşun, geçiyorsa hız limitidir. Birkaç dakika bekleyin.
7. **Manifest sırası, bağımlılık sırasıdır.** Dosyalar tek tek doğru görünüp
   veritabanı yine de **sıfırdan kurulamayabilir**. `change_impact`,
   `media_ai`'nin yarattığı tabloya ve unique indekse dayanıyordu ama manifest
   onu sonra listeliyordu; boş bir projede 16. dosyada duruyordu. Üretimde
   görünmemişti, çünkü göçler orada elle ve çalışan bir sırayla uygulanmıştı —
   kimse sıfırdan kurmayı denememişti. `npm run verify:migrations` artık tablo
   düzeyinde ileri referansı yakalar; kısıt/indeks düzeyinin hakemi boş bir
   projeye karşı `npm run test:bootstrap`.
8. **PostgREST sorgu nesnesinde `.catch()` YOKTUR.** `.catch(() => {})` yazmak
   hatayı yutmaz, `TypeError` fırlatır — üstelik genelde `finally` içinde, yani
   **asıl hatayı tamamen siler**. İki fiyatlandırma süiti bu yüzden yıllarca
   sebebi görünmeyen bir şekilde kırmızıydı ve canlı bölümlerini hiç
   çalıştırmamışlardı. Supabase JS fırlatmaz (madde 1): `{ error }` okunur.
9. **`{ data }` alıp `{ error }` okumamak, hatayı bir sonraki satıra taşır.**
   Belirti `Cannot read properties of null` olur ve gerçek sebep (eksik sütun,
   RLS reddi) hiçbir yerde yazmaz. Canlı süitlerde her çağrıyı hatayı yüzeye
   çıkaran bir yardımcıdan geçirin.
10. **`signUp()` ile `admin.createUser()` aynı kapıdan geçmez.** Supabase
   `signUp` adresinin alan adını teslim edilebilirlik açısından doğrular:
   `@lexbnb.test` ve `@lexbnb-test.com` MX kaydı olmadığı için reddedilir.
   `admin.createUser` bu doğrulamayı atlar — bu yüzden 21 süit etkilenmez,
   yalnızca gerçek kayıt akışını ölçen `registration_flow_tests` takılır.
   Ayrıca e-posta onayı açıkken her `signUp` bir mail tetikler ve gönderim
   limiti doğrulamadan **önce** çalışıp asıl hatayı maskeler. Test projesinde
   onay bu yüzden kapalıdır.
12. **Bir kimlik bilgisine kaçan satır sonu, 20 süiti anlaşılmaz hatayla düşürür.**
   CI'daki ilk canlı koşuda anon anahtarı GitHub secret'ına satır sonlarıyla
   yapıştırılmıştı. `supabase-js` onu `apikey` başlığına koyuyor, fetch
   `Headers.append: ... is an invalid header value` ile reddediyor, her giriş
   düşüyor ve süitler `Cannot read properties of null` ile yarılıyor. Hiçbir
   mesaj sorunun **anahtarda** olduğunu söylemiyordu; GitHub değeri
   maskelediği için hata `"***" is an invalid header value` olarak görünüyor,
   yani değeri okumak da mümkün değil. Üstüne, yarım kalan süitler temizlik
   yapamadan çıkıp hesap sızdırıyor.

   `core/test_env.js` artık kimlik bilgilerini kırpar ve içinde satır sonu
   kalırsa **hangi değişkenin** bozuk olduğunu söyleyerek, tek bir hesap bile
   yaratmadan durur. Ağı `core/test_gate_tests.js`.
13. **SQL dosyalarında UTF-8 BOM var** (`schema.sql` + üç göç). Postgres'e
   olduğu gibi gönderilirse ilk ifade sözdizimi hatası verir. Dosyadan
   silinemez: manifest hash'leri BOM dahil metin üzerinden üretildi ve göçler
   değişmezdir. `bootstrap_test_project.js` çalıştırdığı metinden ayıklar,
   hash'ten ayıklamaz.

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
| Çapraz kiracı yazma açığı | tamamlandı (phase23 uygulandı) — ağı `marketing_tenant_isolation_tests` |
| Bulgu incelemesinde yetki sırası | tamamlandı (phase25 uygulandı) |
| Mülk koruması sıfırlamayı kilitliyordu | tamamlandı (phase26 uygulandı) — ağı `tenant_reset_tests`, `account_deletion_tests` |
| Rezervasyon ekranı: temizlik gelir/gider ayrımı, komisyon oranı, tek takvimli tarih | tamamlandı — ağı `booking_form_economics_tests` |
| Ayrı Supabase test projesi | **tamamlandı** (15 Eylül 2026) — proje `pdeiorpgxetksyogrmbi`, şema bootstrap ile kuruldu, tam koşu yeşil |
| Canlı süitlerin CI’da otomatik koşması | **tamamlandı** (16 Eylül 2026) — `.github/workflows/live-tests.yml` açık, her gece 03:00 UTC. İlk yeşil koşu 17 Eylül: 120/120 süit, 1123 iddia, sızıntı temiz |
| Fotoğraf AI worker'ı | `GEMINI_API_KEY` yok; Actions adımı güvenle atlanıyor — **harici bağımlılık** |
| `get_executive_dashboard_snapshot` | tahakkuk ve gece sayımı hataları phase24 ile düzeltildi; ağı artık `executive_snapshot_tests` (22 iddia, davranış). **Arayüz hâlâ çağırmıyor**: yönetici paneli aynı rakamları tarayıcıda hesaplıyor (§3.4.1 ile ters) |
| Excel içe/dışa aktarma | "Şirket Genel Raporu" içe aktarımı devre dışı bırakıldı, gerçek uygulama yok |
| Bildirim merkezi analizi | **tamamlandı** (17 Eylül 2026) — merkez her iki uçtan da bağlı değildi; yükleme bağlandı, "okundu" artık Postgres'e yazıyor. RPC yetki sırası phase29 ile düzeltildi; göç 20 Eylül 2026'da **üretime uygulandı ve doğrulandı** |
| `saveAppData()` hiçbir şey kaydetmiyor | gövdesi yalnızca eski localStorage anahtarlarını siliyor. 17 çağıranda hiçbir Postgres yazması yoktu; **8'i 20 Eylül 2026'da bağlandı**, 1'i meşru yerel durum, 2'si kaldırıldı, **6'sı açık** (tablo yok — phase31 gerekiyor). Ayrıntı aşağıda |
| Temizlik & gider defteri kalıcılığı | **tamamlandı** (20 Eylül 2026) — beş fonksiyon hiçbir şey yazmıyordu. Ayrıca `cloudUpsertCleaningTask` yeniden yüklemeden sonra **mükerrer görev satırı** açıyordu (UUID'yi `legacy_id` olarak gönderiyordu) ve `cleaningPayments` hiç yüklenmiyordu. Ağı `cleaning_ledger_persistence_tests` (27 iddia) |
| WhatsApp → talep / rezervasyon | **tamamlandı** (20 Eylül 2026) — modal "✅ rezervasyon kesinleştirildi" deyip hiçbir şey yazmıyordu. `createBooking()` / `createLead()` yoluna bağlandı. Ağı `persistence_wiring_tests` |
| Pazarlama kampanya defteri kalıcı değil | **açık** — `marketing_campaigns` tablosu **yok**; `saveMarketingCampaign()` yalnızca bellekte tutuyor. Kullanıcı kampanyayı giriyor, tabloda görüyor, sayfa yenilenince kayıp. `influencerCollabs` de aynı. **phase31 bekliyor** |
| `month: ‘2026-09’` sabiti | **tamamlandı** (20 Eylül 2026) — altı nokta kaldırıldı. Tek kaynak `getCurrentMonthKey()`, o da `getTodayStr()`'den türer. Başlangıç dönemi de tarayıcının yerel saatini kullanıyordu; kayıtlar Europe/Istanbul gününe yazılıyor, ay sınırında kullanıcı az önce girdiği kaydı filtrede göremiyordu. Ağı `persistence_wiring_tests` (kaynak taraması) |
| Ölü `appData.excelDb` dalları | **tamamlandı** (20 Eylül 2026) — alan yalnızca `null` atanıyordu, hiçbir yerde doldurulmuyordu. Ona bağlı **üç panel hiç çalışmıyordu**: yönetici panelinin 116 satırlık dalı, YoY karşılaştırması (her zaman "Veriler sıfırlandı" diyordu) ve gidişat radarı (ölü dalında ilk müşterinin rakamları duruyordu: skor "88", "Haziran (268k) ➔ Temmuz (467k)"). Üçü de artık gerçek kayıttan hesaplıyor; ortak taban `computeMonthActuals()` |
| Fiyat merdiveni uydurma varsayılanları | **tamamlandı** (20 Eylül 2026) — `saveAllSettings()` boş bırakılan her alana `|| 3000`, `|| 4000`, `|| 12000`, `|| 800`, `|| 350` yazıyordu ve o rakam mülkün gerçek fiyatı oluyordu. Form da girilmemiş basamakları `v.base * 1.3` ile dolduruyordu. 17 Eylül §3.6 taraması bunu **kaçırmıştı** |
| Sahte talep üreten düğme | **kaldırıldı** (20 Eylül 2026) — "⚡ Gelen Canlı Mesajı Simüle Et" müşterinin **gerçek talep defterine** sahte kayıt yazıyordu (Cemil Öz / 55.000 TL, silinmiş AZURE/OLIVE/BELLA anahtarlarıyla) ve dönüşüm oranını bozuyordu |
| Whapi "canlı bağlantı" | **kaldırıldı** (20 Eylül 2026) — özelliğin **tamamı mockup'tı**: QR elle çizilmiş bir SVG, token hiçbir yere yazılmıyor ve hiçbir yerden okunmuyordu, rozet sabit "🟢 Hazır", Whapi.cloud'a tek bir istek gitmiyordu. Müşteri gerçek API anahtarını girip çöpe atıyordu. Mesaj yapıştırıp ayrıştırma akışı korundu |
| Sahte Airbnb senkronizasyonu | **düzeltildi** (20 Eylül 2026) — `syncLiveAirbnbData()` 600 ms bekleyip `lastSync`'e "Şimdi" yazıyor ve "✅ Canlı Skorlar Güncel!" diyordu; Airbnb'ye istek gitmiyordu. Artık durumu açıkça söylüyor |
| OTA ilan analizi (`runAiListingCritic`) | veri bağlantısı yok; artık skor uydurmuyor, durumu açıkça söylüyor |
| Demo'yu Supabase'de gerçek tenant olarak yeniden kurma | yapılmadı |
| Pazarlama ROAS’ı | **tamamlandı** (17 Eylül 2026) — reklam cirosu artık "girilen" olarak etiketleniyor; simülatör sabit çarpan yerine işletmenin kendi ölçülmüş ROAS'ını kullanıyor, ölçülmemiş kanal için tahmin üretmiyor |
| RGVQI denetim düzeltmeleri | phase24 ve phase25, 14 Eylül 2026'da üretime uygulandı ve readiness denetimiyle doğrulandı; uygulama/worker dağıtımı ayrıca izlenmeli |
| Misafir CRM (phase27 + phase28) | göçler **üretimde uygulandı ve doğrulandı** (15 Eylül 2026, sütun sorgusuyla); test projesinde de kurulu |
| Güvenli test kapısı | tamamlandı — canlı/çevrimdışı ayrımı artık `@supabase/supabase-js` require'ına bakıyor. Eski kaba dizgi taraması 8 çevrimdışı süiti (worker giriş noktaları) yanlışlıkla atlıyordu; güvenli koşu 85 → 94 süit |
| Kullanıcı davet e-postası | phase24 outbox + `npm run invitations:worker`; üretimde worker secret'ları kurulmalı |

### `saveAppData()` — kaydetmeyen kaydedici

Adı kaydediyormuş gibi duruyor; gövdesi yalnızca `LEXBNB_DATA_*` ve
`LEXBNB_V5_MASTER_DATA` anahtarlarını siliyor. Postgres tek kaynak olduğu için
bu doğru bir temizlik — ama çağıran kodun yarısı onu **kalıcılık sanıyor.**

Çağıran 40 fonksiyonun 23’ü yanında gerçek bir bulut yazması yapıyor
(`createBooking`, `saveCleaningTask` → `cloudUpsertCleaningTask`, …) — onlarda
`saveAppData()` yalnızca artık bir çağrı. Kalan 17’sinde hiçbir yazma yoktu.

**20 Eylül 2026 durumu — 8 bağlandı, 2 kaldırıldı, 1 meşru yerel, 6 açık:**

| Durum | Fonksiyon | Nereye yazıyor |
|---|---|---|
| ✅ bağlandı | `promptEditCleaningAmount` | `cleaning_tasks` + `properties.clean_cost` |
| ✅ bağlandı | `promptEditTaskAmount` | `cleaning_tasks` |
| ✅ bağlandı | `toggleCleaningPaid` | `cleaning_tasks` + `expenses` |
| ✅ bağlandı | `toggleTaskPaid` | `cleaning_tasks` + `expenses` |
| ✅ bağlandı | `payAllPendingCleaning` | `cleaning_tasks` + `expenses` |
| ✅ bağlandı | `saveWaAsLead` | `createLead()` → `leads` |
| ✅ bağlandı | `saveWaAsBooking` | `createBooking()` → `bookings` |
| ✅ bağlandı | `convertAiActionToTask` | `createMaintenanceTicket()` |
| ✅ bağlandı | `saveAllSettings` | `properties` (yalnız taban fiyat + temizlik maliyeti) |
| 🗑 kaldırıldı | `saveWhapiSettings` | özelliğin tamamı mockup'tı |
| 🗑 düzeltildi | `syncLiveAirbnbData` | senkronizasyon yoktu; durumu söylüyor |
| ⚪ meşru yerel | `changeImportMode` | açık formun görünümü; iş kaydı değil |
| ❌ **açık** | `cycleHkStatus` | temizlik durumu geçersiz kılma — **tablo yok** |
| ❌ **açık** | `saveMarketingCampaign` | `marketing_campaigns` — **tablo yok** |
| ❌ **açık** | `saveInfluencerCollab` | influencer defteri — **tablo yok** |
| ❌ **açık** | `setOtaPricingStrategy` | kiracı ayarı — **tablo yok** |
| ❌ **açık** | `saveOperatorNote` | mülk başına not — **tablo yok** |
| ❌ **kısmen** | `saveAllSettings` | merdivenin floor/target/premium/peak + ısıtma maliyeti için **sütun yok**; kullanıcıya açıkça söyleniyor |

Açık kalan altısının hepsi **aynı sebepten** açık: yazılacak tablo yok.
Hepsi tek bir **phase31** göçü ile kapanır (tek numara: AGENTS.md phase sahipliği).

`requireCloudForWrite` (§3.3) artık bağlananların hepsinde devrede; yazma
düşerse kullanıcıya söylenir ve ekran `loadTenantAppData()` ile gerçeğe
geri çekilir — bellekteki değişiklik ekranda "kaydedilmiş" gibi kalmaz.

Bildirim merkezi bu sınıfın ilk düzeltilen üyesidir; ağı
`core/notification_wiring_tests.js`. Temizlik defteri için
`core/cleaning_ledger_persistence_tests.js`, geri kalanı için
`core/persistence_wiring_tests.js` — ikincisi ayrıca sabit `YYYY-MM` ay
literallerini tarar ve **KALICI listesi yalnızca büyür**: bağlanan bir
fonksiyon bir daha "yalnızca saveAppData()" hâline dönemez.

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

  **Bu kalıp phase25’ten sonra da iki yerde durmaya devam etti** ve 17 Eylül
  2026’da bildirim merkezi incelemesinde bulundu: phase12’den gelen
  `acknowledge_notification_atomic` ile `resolve_executive_alert_atomic`.
  Üretimde ölçüldü — **`anon` ikisini de çalıştırabiliyordu** (phase22 yalnızca
  pazarlama fonksiyonlarını kapatmıştı) ve varlık oracülü açıktı:

  ```
  var olmayan UUID -> 200 {"success": false, "error": "NOTIFICATION_NOT_FOUND"}
  VAR OLAN UUID    -> UNAUTHORIZED: Tenant membership mismatch
  ```

  Yani giriş bile yapmamış biri, tarayıcıda duran anon anahtarıyla bir
  bildirim kimliğinin var olup olmadığını öğrenebiliyordu. **Veri değişmedi**:
  gövdedeki ikinci kat (`tenant_members` kontrolü) tuttu ve kayıt UNREAD kaldı —
  iki katlı kuralın üçüncü kanıtı. Düzeltme phase29; ağı
  `core/notification_authz_tests.js`, 16 iddianın 5’i eski gövdeye karşı kırılıyor.

  Aynı göçte ikinci bir düzeltme var: `resolve_executive_alert_atomic`
  "kim çözdü" izini `COALESCE(p_resolved_by, auth.uid())` ile yazıyordu, yani
  **çağıran denetim izine başkasının kimliğini yazdırabiliyordu.** Sıra
  `COALESCE(auth.uid(), p_resolved_by)` olarak çevrildi: oturum varken izi
  oturum belirler.
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
