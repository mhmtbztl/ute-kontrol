# Phase 29 — üretim uygulama paketi

`supabase/migration_phase29_notification_authz_order.sql`

> **Bu göç 20 Eylül 2026'da üretime UYGULANDI ve doğrulandı.**
> Paket bu yüzden iki amaca hizmet eder: (a) uygulamanın doğru yapıldığını
> kanıtlayan doğrulama seti, (b) gerekirse geri dönüş yolu. Aşağıdaki
> "uygulama" adımları yalnızca **yeni bir ortam** (staging, yeni üretim,
> felaket kurtarma) için geçerlidir.
>
> Üretim şemasına bu paketten **hiçbir yazma yapılmadı.** Uygulama, §4.2
> gereği Supabase panelinden elle ve **ayrı açık onayla** yapılır.

---

## 1. Dosya denetimi — sonuç

| Kontrol | Sonuç |
|---|---|
| Manifest kaydı | ✅ `migration_manifest.txt` satır 40, sha256 `d018b792…35fb6` |
| `npm run verify:migrations` | ✅ schema.sql + 40 değişmez göç, bağımlılık sırası OK (phase30 eklendikten sonra yeniden ölçüldü) |
| UTF-8 BOM | ✅ **yok** (dosya `-- ` ile başlıyor). §5.13'teki BOM tuzağı bu dosyayı etkilemiyor; olduğu gibi yapıştırılabilir |
| Tek transaction | ✅ `BEGIN;` … `COMMIT;` — doğrulama bloğu düşerse hiçbir şey kalıcı olmaz |
| İmza uyumu | ✅ phase12 ile **birebir aynı**: `(uuid)` ve `(uuid, uuid)`. `CREATE OR REPLACE` aşırı yükleme yaratmaz |
| `anon` iptali | ✅ `REVOKE ALL … FROM PUBLIC, anon` — §7'nin iki katlı kuralı (yalnız `FROM PUBLIC` yetmez) |
| İkinci kat | ✅ Her iki gövde kendi `tenant_members` kontrolünü taşıyor |
| Varlık oracle'ı | ✅ `NOT FOUND` ile "üye değil" **aynı** `42501` hatasına düşürülmüş |
| Yetki sırası | ✅ Yetki, `UPDATE`'ten önce. `FOR UPDATE` tamamen kaldırıldığı için kilit-önce-yetki kalıbı imkânsız |
| Denetim izi | ✅ `COALESCE(auth.uid(), p_resolved_by)` — oturum varsa izi oturum belirler |
| `schema_migrations` | ✅ `VALUES (29, …) ON CONFLICT DO NOTHING` — tekrar çalıştırmaya dayanıklı |

**Idempotent mi?** Evet. `CREATE OR REPLACE` + `REVOKE`/`GRANT` + `ON CONFLICT
DO NOTHING`. İkinci kez çalıştırmak güvenlidir ve doğrulama bloğu yine geçer.

### Bilerek kabul edilen yan etki

`FOR UPDATE` kaldırıldığı için, `SELECT` ile `UPDATE` arasında satır silinirse
`UPDATE` 0 satır etkiler ama fonksiyon yine `{"success": true}` döner.

Bu satırlar tek tek silinmiyor (yalnızca kiracı sıfırlama ve hesap kapatmada,
cascade ile), pencere mikrosaniye ve istemci `success` üzerinden yıkıcı bir iş
yapmıyor. **Düzeltilmedi.** Düzeltilecekse `GET DIAGNOSTICS … ROW_COUNT` ile
0 satır durumu `success: false`'a çevrilmeli — ve bu, göçler değişmez olduğu
için **yeni bir phase31 dosyası** olmak zorunda (Claude tek numara kullanır).

---

## 2. Çalıştırma sırası

Supabase Dashboard → SQL Editor:
`https://supabase.com/dashboard/project/kirpcqklyjlrhvdbgdrq/sql`

| Sıra | Dosya | Not |
|---|---|---|
| 1 | `supabase/migration_phase29_notification_authz_order.sql` | Tek dosya, tek işlem. Dosyanın **tamamı** yapıştırılır (`BEGIN;`'den `COMMIT;`'e) |

**Bağımlılık:** phase12 (fonksiyonları tanımlayan göç) uygulanmış olmalı.
phase22 uygulanmış olsun ya da olmasın fark etmez; phase29 `anon` iptalini
kendisi yapar.

**Başka göçle birlikte çalıştırmayın.** Doğrulama bloğu `RAISE EXCEPTION`
ile durursa, aynı transaction'daki diğer göç de geri alınır.

### Dağıtım sırası tuzağı (§4.2)

GitHub Pages push ile **anında** yayına alır, göçler elle uygulanır. phase29
için bu bir risk **değildir**: göç yeni sütun/tablo eklemiyor, yalnızca mevcut
iki fonksiyonun gövdesini ve yetkisini değiştiriyor. İstemci kodu her iki
sürümle de çalışır — tek fark, var olmayan bir kimlik için `{"success": false}`
yerine `42501` dönmesi, ki istemci bu metinlere bağımlı değil.

---

## 3. Uygulama ÖNCESİ — salt okunur doğrulama

Hiçbiri yazma yapmaz. SQL Editor'de çalıştırın.

### 3.1 Bağımlılık ve mevcut durum

> ⚠️ **`schema_migrations`'a güvenmeyin.** Eski göçlerin hepsi bu tabloya
> satır yazmıyor. Test projesinde ölçüldü: 12 ve 22 için **kayıt yok**,
> yalnızca 25 ve 29 var — oysa ikisi de uygulanmış durumda. Bağımlılığın
> güvenilir kanıtı **fonksiyonun var olmasıdır**, kayıt değil.

```sql
-- BAGIMLILIK KANITI: phase12'nin yarattigi fonksiyonlar duruyor mu?
select p.oid::regprocedure as imza, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('acknowledge_notification_atomic', 'resolve_executive_alert_atomic');
```

Beklenen — tam olarak iki satır. **Başka bir imza görürseniz durun**,
aşırı yükleme vardır ve `CREATE OR REPLACE` yanlış fonksiyonu hedefler:
```
acknowledge_notification_atomic(uuid)    | security_definer = true
resolve_executive_alert_atomic(uuid,uuid)| security_definer = true
```

Sıfır satır dönerse **phase12 uygulanmamıştır** — phase29 çalışmaz, önce
phase12 uygulanmalı.

```sql
-- Bilgi amacli (eksik olabilir, karar dayanagi DEGIL):
select version, name, applied_at
from public.schema_migrations
where version in (12, 22, 25, 29)
order by version;
```

### 3.2 Göç gerekli mi? (tek sorguda cevap)

```sql
select
  p.oid::regprocedure                                              as fonksiyon,
  has_function_privilege('anon', p.oid, 'EXECUTE')                 as anon_calistirabiliyor,
  position('NOT_FOUND' in pg_get_functiondef(p.oid)) > 0           as oracle_acik,
  position('FOR UPDATE' in pg_get_functiondef(p.oid)) > 0          as kilit_var
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('acknowledge_notification_atomic', 'resolve_executive_alert_atomic');
```

| Çıktı | Anlamı |
|---|---|
| `anon_calistirabiliyor = true` **veya** `oracle_acik = true` | phase29 **uygulanmamış** → uygulayın |
| ikisi de `false`, `kilit_var = false` | phase29 **zaten uygulanmış** → 4. bölüme geçin |

**Bu sorgu üretime karşı ÇALIŞTIRILMADI** — SQL Editor erişimi kullanıcıdadır.
Test projesinde çalıştırıldı ve `false / false / false` döndü (§6.1). Üretimde
aynı sonuç, curl ölçümünden çıkarılıyor: `42501 permission denied` yalnızca
grant geri alınmışsa döner. Kesin kanıt için sorguyu siz SQL Editor'de koşun.

### 3.3 Yedek noktası

```sql
-- Geri dönüş gerekirse MEVCUT gövdeleri buradan alacaksınız. Çıktıyı
-- göç ÖNCESİNDE bir dosyaya kaydedin (§5).
select pg_get_functiondef('public.acknowledge_notification_atomic(uuid)'::regprocedure);
select pg_get_functiondef('public.resolve_executive_alert_atomic(uuid,uuid)'::regprocedure);
```

Ayrıca Supabase panelinden otomatik yedek / PITR durumunu doğrulayın.

---

## 4. Uygulama SONRASI — davranış doğrulaması

Altı davranışın **üçü üretime karşı salt okunur** olarak ölçülebilir. Kalan
üçü kayıt **değiştirir** (bildirim onaylamak, uyarı çözmek) ve bu yüzden
üretimde değil **test projesinde** ölçülür. Ayrım bilerek yapılmıştır:
müşterinin defterine doğrulama amaçlı kayıt yazılmaz.

### A. Üretime karşı — salt okunur (3 davranış)

Anon anahtarı tarayıcı kodunda zaten herkese açık; bu çağrılar kayıt bırakmaz.

```bash
K='<anon-key>'   # app.js icindeki DEFAULT_SUPABASE_KEY
U='https://kirpcqklyjlrhvdbgdrq.supabase.co'

# (1) anon acknowledge_notification_atomic CALISTIRAMIYOR
curl -s -X POST "$U/rest/v1/rpc/acknowledge_notification_atomic" \
  -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d '{"p_notification_id":"00000000-0000-0000-0000-000000000000"}'

# (2) anon resolve_executive_alert_atomic CALISTIRAMIYOR
curl -s -X POST "$U/rest/v1/rpc/resolve_executive_alert_atomic" \
  -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d '{"p_alert_id":"00000000-0000-0000-0000-000000000000"}'
```

**Beklenen (ikisi de):**
```json
{"code":"42501","message":"permission denied for function acknowledge_notification_atomic"}
```

**Başarısızlık işareti:** `200` ve `{"error":"NOTIFICATION_NOT_FOUND","success":false}`
— fonksiyonun kendi mesajı dönüyorsa göç uygulanmamıştır (§4.2).

**(3) Yetki kontrolü kayıt aramasından ÖNCE** — bu, SQL Editor'den gövdeye
bakarak kanıtlanır (davranışsal kanıt B bölümünde):

```sql
select
  p.proname,
  position('UNAUTHORIZED' in pg_get_functiondef(p.oid)) as yetki_konumu,
  position('FOR UPDATE'  in pg_get_functiondef(p.oid)) as kilit_konumu,
  position('NOT_FOUND'   in pg_get_functiondef(p.oid)) as oracle_konumu
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('acknowledge_notification_atomic','resolve_executive_alert_atomic');
```

Beklenen: `yetki_konumu > 0`, `kilit_konumu = 0`, `oracle_konumu = 0`.
Kilit yoksa "kilit yetkiden önce" durumu yapısal olarak imkânsızdır.

### Yetki tablosu (salt okunur, ek kanıt)

```sql
select p.oid::regprocedure as fonksiyon,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('acknowledge_notification_atomic','resolve_executive_alert_atomic');
```

Beklenen: `anon=false`, `authenticated=true`, `service_role=true`.
`authenticated=false` görürseniz **uygulama kırılmıştır** — geri dönün (§5).

### B. Test projesine karşı — davranışsal (3 davranış + diğerleri)

Üç davranış kayıt değiştirir, bu yüzden üretimde ölçülmez:

- geçerli `authenticated` tenant üyesi kendi kaydında çalışabiliyor
- başka tenant üyesi reddediliyor
- `resolved_by` denetim izi `auth.uid()` üzerinden oluşuyor

Bunları ölçen süit **zaten var**: `core/notification_authz_tests.js`, 16 iddia.
Kendi kiracısını, kullanıcısını, bildirimini ve uyarısını yaratır, ölçer,
sonra temizler (16. iddia temizliği doğrular).

```powershell
$env:LEXBNB_ALLOW_DESTRUCTIVE_TESTS = "1"
$env:LEXBNB_CONFIRM_REMOTE_TEST_PROJECT = "pdeiorpgxetksyogrmbi.supabase.co"
node core/notification_authz_tests.js
```

| İstenen davranış | Süitteki iddia |
|---|---|
| anon acknowledge çalıştıramıyor | 1 — ve 2: çağrı bildirimi **değiştirmedi** |
| anon resolve çalıştıramıyor | 3 — ve 4: çağrı uyarıyı **değiştirmedi** |
| yetki kontrolü kayıt aramasından önce | 5 (anon), 8 (giriş yapmış yabancı) — var olan ve var olmayan kimlik **aynı** yanıtı veriyor |
| geçerli tenant üyesi kendi kaydında çalışabiliyor | 11, 12 (bildirim ACKNOWLEDGED), 13, 14 (uyarı RESOLVED) |
| başka tenant üyesi reddediliyor | 6, 7 (hâlâ UNREAD), 9, 10 (RLS ile okuyamıyor bile) |
| `resolved_by` izi `auth.uid()`'den | 15 — çağıran `p_resolved_by` ile başkasının kimliğini gönderse bile iz oturumun sahibini gösteriyor |

> **Üretim kara listededir** (§5.4). `core/test_env.js` kapısı üretim URL'sini
> onay değişkeni doldurulsa bile reddeder; bu süit üretime koşulamaz.

> **§5.6:** Tam koşuyu arka arkaya tekrarlamayın — Supabase `Request rate limit
> reached` döndürür ve süitler sahte biçimde kırmızı olur. Tek süit koşmak
> güvenlidir.

---

## 5. Geri dönüş yaklaşımı

**Eski göç dosyaları değiştirilmez** (Kural 3 / §4.2). Geri dönüş iki
yoldan biriyle yapılır:

### Yol 1 — İleri düzeltme (tercih edilen)

Sorun phase29'un *içeriğindeyse*, **phase29 dosyasına dokunulmaz.** Düzeltme
yeni bir `migration_phase31_*.sql` olarak açılır; `CREATE OR REPLACE` ile
fonksiyon gövdesi düzeltilir ve manifest'e phase31 eklenir. Bu, üretim ile
repo'nun ayrışmamasının tek yoludur (Kural 3).

**Numarayı kim açar:** phase29 Claude'un göçüdür, düzeltmesini de **Claude
açar ve numara tek olmak zorundadır.** AGENTS.md "phase numarası sahipliği"
kuralı: Codex yalnızca çift (`30`, `32`, …), Claude yalnızca tek (`29`, `31`,
…) kullanır ve **bir araç diğerinin numarasını devralmaz.** `30` Codex'e
aittir ve zaten kullanılmıştır (`migration_phase30_booking_channel_settings.sql`),
bu yüzden düzeltme `N+1` değil **`31`**'dir.

### Yol 2 — Acil geri alma (yalnızca üretim kırıldıysa)

3.3'te kaydettiğiniz `pg_get_functiondef` çıktısını SQL Editor'de aynen
çalıştırın; fonksiyonlar phase12 gövdesine döner. Ardından **yetkiyi elle
geri kurmayın** — eski gövdede `anon` çalıştırabiliyordu ve bu bir açıktı:

```sql
-- Geri alsanız bile anon kapali kalmali: govde eski, yetki yeni.
REVOKE ALL ON FUNCTION public.acknowledge_notification_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_notification_atomic(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) TO authenticated, service_role;

-- schema_migrations kaydini da geri al, yoksa repo "uygulandi" sanir.
DELETE FROM public.schema_migrations WHERE version = 29;
```

Sonra durumu **CLAUDE.md'ye yazın.** Bir göçün geri alındığı yalnızca
veritabanında durursa, bir sonraki oturum onu uygulanmış sanar (§4.2:
"bir göçün uygulanıp uygulanmadığı dosyaya bakarak anlaşılmaz").

**Veri riski yok:** phase29 hiçbir tablo, sütun veya satır değiştirmez.
Geri alma veri kaybetmez; yalnızca iki fonksiyonun gövdesini ve yetkisini
eski hâline döndürür.

---

## 6. Ortam durumu — test projesi ve üretim

### 6.1 Test projesi (`pdeiorpgxetksyogrmbi`)

20 Eylül 2026, Codex'in phase30'u master'a girdikten **sonra** yeniden ölçüldü:

```
npm run test:bootstrap:check
  =  migration_phase29_notification_authz_order.sql   zaten uygulanmis
  =  migration_phase30_booking_channel_settings.sql   zaten uygulanmis
  Rapor: 0 dosya eksik, 41 dosya uygulanmis.
```

**41/41 dosya uygulanmış, 0 eksik.** Hem phase29 (bildirim yetki sırası) hem
phase30 (rezervasyon kanalı ayarları) test projesinde kurulu. Bu, ikisinin de
**sıfırdan kurulan bir şemada** çalıştığının kanıtıdır — §5.7: üretimdeki
başarı bunu göstermez, çünkü üretim elle ve çalışan bir sırayla kuruldu.

### 6.2 Üretim (`kirpcqklyjlrhvdbgdrq`) — ikisi AYRI durumda

| Göç | Sahip | Test projesi | Üretim | Ölçüm |
|---|---|---|---|---|
| **phase29** bildirim yetki sırası | Claude (tek) | ✅ uygulanmış | ✅ **uygulanmış ve doğrulanmış** | anon RPC → `42501 permission denied for function` |
| **phase30** rezervasyon kanalı ayarları | Codex (çift) | ✅ uygulanmış | ✅ **uygulanmış ve doğrulanmış** | anon tablo sorgusu → HTTP 401 `permission denied for table`; anon RPC → HTTP 401/`42501 permission denied for function` |

Her iki ölçüm de 20 Eylül 2026'da, salt okunur olarak yapıldı; üretime kayıt
bırakmadı.

**phase30 satırı aynı gün ikinci kez ölçüldü ve değişti.** İlk ölçümde
`404 PGRST205 Could not find the table` geliyordu (uygulanmamış); phase31
hazırlığı sırasında yapılan ikinci ölçümde `401 42501 permission denied`
geldi. Tablo adının *bilinip* yetkinin reddedilmesi, tablonun artık var
olduğunun kanıtıdır. Bu, §4.2'nin "bir göçün uygulanıp uygulanmadığı
dosyaya bakarak anlaşılmaz, üretime sorulur" kuralının canlı örneğidir:
aradaki fark saatlerle ölçülüyor ve belge tek başına asla güncel değildir.

> **Kapsam uyarısı.** Bu belge **yalnızca phase29'u** anlatır. phase30 burada
> sadece üretim durumunu netleştirmek için geçiyor; **uygulama talimatları bu
> belgeye ait değildir.** phase30 Codex'in göçüdür ve kendi paketiyle,
> kullanıcının ayrı açık onayıyla uygulanır. Bu belgedeki hiçbir adım phase30'u
> kapsamaz.

### Bu paketteki sorgular test projesine karşı koşuldu

Belgeye çalıştırılmamış sorgu konmadı. Beşi de `default_transaction_read_only
= on` altında, test projesine karşı çalıştırıldı (20 Eylül 2026):

```
3.1-b  -> acknowledge_notification_atomic(uuid)     security_definer=true
          resolve_executive_alert_atomic(uuid,uuid) security_definer=true
3.2    -> anon_calistirabiliyor=false  oracle_acik=false  kilit_var=false   (her iki fonksiyon)
4-sira -> yetki_konumu=690 / 606       kilit_konumu=0     oracle_konumu=0
4-yetki-> anon=false  authenticated=true  service_role=true                 (her iki fonksiyon)
```

`yetki_konumu > 0` ve `kilit_konumu = 0`: yetki kontrolü gövdede var, satır
kilidi hiç yok — "kilit yetkiden önce" durumu yapısal olarak imkânsız.

Üretimdeki karşılığı curl ile ölçüldü (aynı gün, salt okunur):
her iki RPC için `42501 permission denied for function`.

---

## Uygula ve doğrula — kontrol listesi

**Uygulama (yalnızca yeni ortam için; üretimde 20 Eylül'de tamamlandı):**

- [ ] Supabase yedek / PITR noktası doğrulandı
- [ ] §3.1 — phase12 uygulanmış, imzalar `(uuid)` ve `(uuid,uuid)`
- [ ] §3.2 — `anon_calistirabiliyor` veya `oracle_acik` **true** (göç gerçekten gerekli)
- [ ] §3.3 — mevcut iki gövde `pg_get_functiondef` ile dosyaya kaydedildi
- [ ] **Kullanıcıdan ayrı açık onay alındı**
- [ ] SQL Editor'de `migration_phase29_notification_authz_order.sql` **tamamı** çalıştırıldı
- [ ] `NOTICE: PHASE 29 OK — yetki kilitten once, varlik oraculu kapali, anon kesildi.` görüldü

**Doğrulama:**

- [ ] §3.2 sorgusu artık `false / false / false` dönüyor
- [ ] Yetki tablosu: `anon=false`, `authenticated=true`, `service_role=true`
- [ ] curl (1): `42501 permission denied for function acknowledge_notification_atomic`
- [ ] curl (2): `42501 permission denied for function resolve_executive_alert_atomic`
- [ ] `select * from public.schema_migrations where version=29` bir satır dönüyor
- [ ] Test projesinde `node core/notification_authz_tests.js` → 16/16
- [ ] Uygulamada zil ikonu açılıyor, "Onayla" çalışıyor, sayfa yenilenince durum kalıcı
- [ ] CLAUDE.md §4.2 güncellendi (uygulandı / doğrulandı, tarihiyle)

**Geri dönüş tetikleyicisi:** `authenticated=false` görülürse ya da giriş
yapmış kullanıcılar kendi bildirimlerini onaylayamıyorsa → §5 Yol 2, sonra
§5 Yol 1 ile kalıcı düzeltme.
