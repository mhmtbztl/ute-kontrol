# phase31 — uygulama ve doğrulama paketi

**Göç dosyası:** `supabase/migration_phase31_local_state_persistence.sql`
**Sahibi:** Claude (tek numara — `AGENTS.md`, phase numarası sahipliği)
**Durum (20 Eylül 2026):**

| Ortam | Durum |
|---|---|
| Test projesi `pdeiorpgxetksyogrmbi` | ✅ **uygulandı** (`npm run test:bootstrap`), canlı süit 27/27 yeşil |
| Üretim `kirpcqklyjlrhvdbgdrq` | ✅ **21 Eylül 2026'da uygulandı ve doğrulandı** (§4.2 yöntemiyle, önce/sonra ölçümü — bkz. §4) |

> **Bu belge artık iki amaca hizmet ediyor:** (a) uygulamanın doğru yapıldığını
> kanıtlayan doğrulama seti, (b) yeni bir ortam (staging, felaket kurtarma) için
> uygulama talimatı. Üretim şemasına bu belgeden **hiçbir yazma yapılmadı**;
> göç Supabase panelinden elle ve ayrı açık onayla uygulandı.

---

## 1. Ne yapıyor

`saveAppData()` hiçbir şey kaydetmiyor; gövdesi yalnızca eski
`LEXBNB_DATA_*` localStorage anahtarlarını siliyor (CLAUDE.md §6). Onu
çağıran fonksiyonların çoğu 20 Eylül 2026'da Postgres'e bağlandı; **altısı**
"yazılacak tablo yok" dendiği için açık kalmıştı. Hepsi aynı belirtiyi
veriyordu: kullanıcı kaydı giriyor, tabloda görüyor, **sayfayı yenileyince
kaybediyordu.**

| Fonksiyon | Yeni adresi |
|---|---|
| `saveMarketingCampaign` / `deleteMarketingCampaign` | `marketing_campaigns` |
| `saveInfluencerCollab` / `deleteInfluencerCollab` | `influencer_collabs` |
| `setOtaPricingStrategy` | `tenant_settings` (`ota_pricing_strategy`) |
| `saveOperatorNote` | `property_operator_notes` |
| `saveAllSettings` (fiyat merdiveni) | `property_pricing_ladder` |
| `cycleHkStatus` | `housekeeping_status_overrides` |

Göç ayrıca `reset_tenant_data`'yı yeniden tanımlar: yeni defterler silme
listesine girer, **kiracı ayarları bilerek girmez** (ayar defter değildir;
sıfırlama işletmeyi, ekibi ve ayarları korur — §3.7).

---

## 2. İki tasarım kararı ve gerekçeleri

### 2.1 Fiyat merdiveni neden `properties` sütunu değil

GitHub Pages push ile **anında** yayına alır, göçler **elle** uygulanır.
Kod her zaman göçten önce canlıya çıkabilir. `bookings`'e temizlik maliyeti
sütunu eklendiğinde göç uygulanana kadar **hiçbir rezervasyon
kaydedilemedi** (`booking_crud_tests` bu şekilde kırmızı oldu).
`properties`'e yeni sütun eklemek aynı tuzaktır: mülk kaydetme akışının
tamamı kırılır.

Merdiven bu yüzden ayrı bir tabloda durur. Mülk CRUD'una hiç dokunulmaz;
göç uygulanana kadar **yalnızca merdiven kaydı** çalışmaz ve `saveAllSettings`
bunu kullanıcıya açıkça söyler:

> ⚠️ Fiyat merdiveni (taban/hedef/premium/zirve) ve ısıtma maliyeti
> KAYDEDİLEMEDİ: veritabanı göçü (phase31) henüz uygulanmamış.

`base_price` ve `clean_cost` merdiven tablosunda **yoktur** — onlar zaten
`properties` içinde. Aynı sayıyı iki tabloda tutmak "hangisi doğru"
sorusunu açar (§3.4).

### 2.2 Merdiven basamakları NULL olabilir

Girilmemiş bir basamak **0 değil, BİLİNMİYOR**'dur. `|| 3000` kalıbıyla
uydurulan varsayılanlar 20 Eylül'de temizlendi; şema da aynı ayrımı taşımak
zorunda, yoksa "girilmedi" ile "sıfır" tekrar birbirine karışır ve ekranda
"—" yerine uydurma bir rakam çıkar (§3.6). Göçün doğrulama bloğu bunu
`PHASE31_LADDER_STEP_NOT_NULLABLE` ile ölçer.

Açıkça girilen `0` korunur (ısıtmasız mülk geçerli bir durumdur).

---

## 3. Uygulama

Supabase Dashboard → SQL Editor → dosyanın tamamını yapıştır → Run.
Dosyanın sonundaki doğrulama bloğu başarısızsa `RAISE EXCEPTION` ile durur;
tek transaction gibi davranmaz, ama her adımı `IF NOT EXISTS` ile
yazıldığı için **tekrar çalıştırmak güvenlidir.**

```
.../project/kirpcqklyjlrhvdbgdrq/sql/new
```

Başarılı koşu şunu yazar:

```
NOTICE: PHASE 31 OK — alti yerel defter Postgres'e tasindi, sifirlama listesi guncel.
```

---

## 4. Doğrulama (salt okunur, üretime kayıt bırakmaz)

Altı tablonun **varlığı** anon anahtarıyla sorulur. §4.2'nin sütun/tablo
sorgusu: `42501` = tablo **var**, yetki RLS'te (doğru); `PGRST205` = tablo
**yok**, göç uygulanmamış.

```bash
node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/)
  .filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');
  return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const url=env.SUPABASE_URL, key=env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY;
(async()=>{
  for (const t of ['marketing_campaigns','influencer_collabs','tenant_settings',
                   'property_operator_notes','property_pricing_ladder',
                   'housekeeping_status_overrides']) {
    const r=await fetch(url+'/rest/v1/'+t+'?select=tenant_id&limit=0',
      {headers:{apikey:key,Authorization:'Bearer '+key}});
    const j=await r.json().catch(()=>({}));
    console.log(t.padEnd(32),'->',r.status,j.code||'');
  }
})();
"
```

**Uygulanmadan önce ölçüldü (20 Eylül 2026):**

```
marketing_campaigns              -> 404 PGRST205
influencer_collabs               -> 404 PGRST205
tenant_settings                  -> 404 PGRST205
property_operator_notes          -> 404 PGRST205
property_pricing_ladder          -> 404 PGRST205
housekeeping_status_overrides    -> 404 PGRST205
properties.floor_price           -> 400 42703
properties.target_price          -> 400 42703
properties.heating_cost          -> 400 42703
```

**Uygulandıktan sonra ölçüldü (21 Eylül 2026) — altısı da `401 42501`:**

```
marketing_campaigns              -> 401 42501  permission denied for table marketing_campaigns
influencer_collabs               -> 401 42501  permission denied for table influencer_collabs
tenant_settings                  -> 401 42501  permission denied for table tenant_settings
property_operator_notes          -> 401 42501  permission denied for table property_operator_notes
property_pricing_ladder          -> 401 42501  permission denied for table property_pricing_ladder
housekeeping_status_overrides    -> 401 42501  permission denied for table housekeeping_status_overrides
```

Bu tek ölçüm §7'nin **iki katını birden** kanıtlar:

- **Tablo adının bilinmesi** → altı tablo da üretimde var (`PGRST205` yerine
  `42501`; PostgREST tanımadığı tabloya şema önbelleği hatası verir).
- **`42501` dönmesi** → `anon` yetkisi gerçekten geri alınmış. Yetki
  bırakılmış olsaydı çağrı RLS'e kadar girer ve `200 []` dönerdi — veri
  sızmazdı ama koruma **tek katlıya** düşmüş olurdu. Phase 17'de tam olarak
  bu yaşanmıştı.

**Göçün iç değişmezleri** (RLS politikaları, `updated_at` tetikleyicileri,
merdiven basamaklarının NULL kalabilmesi, `reset_tenant_data`'nın yeni
defterleri görmesi ve ayarları görmemesi) ayrıca sorulmadı — gerek yok:
bunların hepsini göçün kendi doğrulama bloğu ölçüyor ve biri tutmazsa
`RAISE EXCEPTION` ile durup `PHASE31_...` kodunu basıyor. Koşunun
`PHASE31 OK` NOTICE'ı ile bitmesi, on bir kontrolün de geçtiği anlamına
gelir.

`id` **değil** `tenant_id` sorulur: dört tablonun birincil anahtarı
`(tenant_id, key)` ya da `property_id`'dir; `id` sütunları yoktur ve
PostgREST önce `42703` döndürüp asıl yetki cevabını maskeler.

---

## 5. Ağı

| Süit | Ne ölçer | Nerede koşar |
|---|---|---|
| `core/phase31_persistence_tests.js` | 64 iddia: sahte istemciyle yazılan satırın şekli, altı fonksiyonun kalıcı yoldan geçmesi, göç içeriği | çevrimdışı (`npm test`) |
| `core/phase31_isolation_tests.js` | 27 iddia: RLS çapraz kiracı, anon kapısı, sıfırlama | canlı (**yalnız test projesi**) |
| `core/persistence_wiring_tests.js` | KALICI listesine altı fonksiyon eklendi — liste yalnızca büyür | çevrimdışı |
| `core/tenant_reset_tests.js` | `reset_tenant_data` yeniden tanımlandı, 15/15 yeşil | canlı |

**Eski koda karşı ölçüldü (§5.5):** `phase31_persistence_tests` phase31
öncesi gövdeye karşı **64 iddianın 32'si kırılıyor**, yeni kodda 64/64
geçiyor. Ölçüm ayrı bir geçici worktree'de (`git worktree add --detach HEAD`)
yapıldı; ana ağaca dokunulmadı.

---

## 6. Bilinen sınır

`tenant_settings` genel bir anahtar/değer tablosudur. Anahtar biçimi
kısıtlıdır (`^[a-z][a-z0-9_]{1,63}$`) ve değer 8 KB ile sınırlıdır, ama
**anahtar beyaz listesi yoktur**: yetkili bir kullanıcı istediği anahtarı
yazabilir. Bu bilerek böyle — beyaz liste her yeni ayarda yeni bir göç
demek olurdu. Kötüye kullanım yüzeyi kendi kiracısıyla sınırlıdır
(RLS), yani bir müşteri yalnızca kendi ayar tablosunu kirletebilir.
