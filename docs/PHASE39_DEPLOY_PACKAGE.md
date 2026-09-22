# phase39 — uygulama ve doğrulama paketi

**Göç dosyası:** `supabase/migration_phase39_notification_rowcount.sql`
**Sahibi:** Claude (tek numara — `AGENTS.md`, phase numarası sahipliği)
**Durum (22 Eylül 2026):**

| Ortam | Durum |
|---|---|
| Test projesi `pdeiorpgxetksyogrmbi` | ✅ **uygulandı**, canlı süit 19/19 yeşil |
| Üretim `kirpcqklyjlrhvdbgdrq` | ⏳ **uygulanmadı** — §3 |

> phase29'dan **sonra** uygulanmalıdır. Tek transaction, idempotent.

---

## 1. Ne yapıyor

phase29, yetki kontrolünü satır kilidinden öne almak için
`SELECT ... FOR UPDATE` kilidini **tamamen kaldırdı**. Kendi notunda yazılı,
bilerek ertelenmiş yan etki buydu:

```sql
SELECT tenant_id INTO v_tenant_id FROM user_notifications WHERE id = ...;
-- ... yetki kontrolü ...
UPDATE user_notifications SET status = 'ACKNOWLEDGED' WHERE id = ...;
RETURN jsonb_build_object('success', true, ...);   -- ← koşulsuz
```

`SELECT` ile `UPDATE` arasında kilit yok. O aralıkta satır silinirse `UPDATE`
0 satır etkiler ama fonksiyon **yine `success: true` döner.** Aynı boşluk her
iki fonksiyonda da vardı (`acknowledge_notification_atomic`,
`resolve_executive_alert_atomic`).

**Pratik risk küçüktü ve ertelenmesi doğruydu**: bu satırlar tek tek
silinmiyor, pencere mikrosaniye, istemci `success` üzerinden yıkıcı bir iş
yapmıyor. **Kalması doğru değildi**: yanlış olan, fonksiyonun *yapmadığı* bir
işi yaptım demesidir — bu depoda kabul edilmeyen kalıbın ta kendisi.

phase39 `GET DIAGNOSTICS ... ROW_COUNT` ile 0 satır durumunu `success: false`
+ `NOTIFICATION_GONE` / `ALERT_GONE`'a çevirir.

---

## 2. Üç karar

### 2.1 `RAISE` değil, `success: false`

Çağıran zaten `{success, ...}` sözleşmesini okuyor. İstisna fırlatmak
istemcide **ayrı bir yol** açardı ve 0 satır bir **hata değil, sonuçtur**:
kayıt artık yok. Yetki ihlalleri (`42501`) istisna olmaya devam eder.

### 2.2 `FOR UPDATE` geri getirilmedi

Kilit yetki kontrolünden önce alınamaz — phase29'un düzelttiği açık buydu. Ve
kilidi yetkiden *sonra* almak pencereyi **kapatmaz, yalnızca daraltır.**
0 satırı dürüst raporlamak hem daha basit hem daha doğru.

### 2.3 İstemci de düzeltildi

Sunucunun dürüstleşmesi tek başına yetmez; istemci `success: false`'u okumazsa
**sunucunun düzelttiği yalanı kendi tekrarlar.** İki çağıran da bağlandı.

İkincisinde ayrı ve daha ağır bir hata çıktı. `RESOLVE_ALERT` aksiyonu şöyleydi:

```js
resolveExecutiveAlert(entityId, 'İncelendi ve çözüldü.');
alert('✅ Bildirim kapatıldı.');
```

İkinci argüman `p_resolved_by`dir ve tipi **UUID**'dir. Test projesinde
ölçüldü:

```
22P02  invalid input syntax for type uuid: "İncelendi ve çözüldü."
```

Yani çağrı **her zaman düşüyordu.** `await` edilmediği ve `catch`lenmediği
için reddedilen promise sessizce yutuluyor, hemen altındaki `alert` ise
koşulsuz "✅ Bildirim kapatıldı" diyordu. **Uyarı açık kalıyordu.**
"Kim çözdü" izini zaten sunucu belirliyor
(`COALESCE(auth.uid(), p_resolved_by)`), yani istemcinin oraya bir şey
göndermesine gerek yoktu.

---

## 3. Uygulama

Supabase Dashboard → SQL Editor → dosyanın tamamını yapıştır → Run.

```
.../project/kirpcqklyjlrhvdbgdrq/sql/new
```

Tek transaction (`BEGIN`/`COMMIT`); doğrulama bloğu başarısızsa **hiçbir şey
COMMIT edilmez.** Başarılı koşu:

```
NOTICE: PHASE 39 OK — 0 satir artik success:false; phase29 korumalari yerinde.
```

---

## 4. Doğrulama

`CREATE OR REPLACE` gövdeyi **bütünüyle** değiştirir, yani phase29'un her
kazanımı bu göçte yeniden yazılmak zorundaydı. Doğrulama bloğu bu yüzden hem
yeniyi hem eskiyi ölçer — eksik bırakılan her koruma sessizce kaybolurdu:

| Kod | Ne ölçer |
|---|---|
| `PHASE39_*_ROWCOUNT_MISSING` | 0 satır hâlâ `success: true` dönüyor mu |
| `PHASE39_*_GONE_MISSING` | 0 satır durumu raporlanıyor mu |
| `PHASE39_*_ORACLE_REOPENED` | varlık oraklü geri geldi mi (phase29) |
| `PHASE39_*_LOCK_BEFORE_AUTHZ` | kilit yetkiden önce mi (phase29) |
| `PHASE39_ALERT_AUDIT_ORDER_LOST` | çağıran denetim izini yazdırabiliyor mu (phase29) |
| `PHASE39_*_ANON_STILL_EXECUTABLE` | anon çağırabiliyor mu (§7) |

**Üretime salt okunur sorulacak kontrol** anon kapısını doğrular ama phase29
ile phase39'u **ayırt etmez** — ikisinde de `42501` döner:

```bash
node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/)
  .filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');
  return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const url=env.SUPABASE_URL, key=env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY;
(async()=>{
  for (const fn of ['acknowledge_notification_atomic','resolve_executive_alert_atomic']) {
    const r=await fetch(url+'/rest/v1/rpc/'+fn,{method:'POST',
      headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(fn.startsWith('ack')
        ? {p_notification_id:'00000000-0000-4000-8000-000000000000'}
        : {p_alert_id:'00000000-0000-4000-8000-000000000000',p_resolved_by:null})});
    const j=await r.json().catch(()=>({}));
    console.log(fn.padEnd(34),'->',r.status,j.code||'',(j.message||'').slice(0,40));
  }
})();
"
```

phase39'un uygulandığının kanıtı **kendi doğrulama bloğudur**: blok
`pg_get_functiondef` ile gövdeyi okuyup `ROW_COUNT` yoksa durur. Dosyanın
hatasız tamamlanıp `PHASE 39 OK` yazması, ölçümün **veritabanının içinde,
gerçek tanım üzerinde** yapıldığı anlamına gelir.

---

## 5. Ağı

| Süit | Ne ölçer | Nerede |
|---|---|---|
| `core/notification_authz_tests.js` | 19 iddia (3'ü yeni): oraklün kapalı kaldığı, denetim izi, `p_resolved_by`'ın UUID beklediği | canlı (**yalnız test projesi**) |
| `core/notification_wiring_tests.js` | 15 iddia (5'i yeni): istemci `success: false`'u okuyor mu, cümle argümanı gitmiyor mu, koşulsuz "kapatıldı" mesajı kalktı mı | çevrimdışı |

**Eski gövdeye karşı ölçüldü (§5.5):** `notification_wiring_tests`'in **5 yeni
iddiasının 5'i de** kırılıyor.

---

## 6. Bilinen sınır

**0 satır dalı istemciden sahnelenemez**, bu yüzden canlı süitte doğrudan test
edilmiyor. Satır çağrıdan önce silinmişse yetki kapısı (`NOT FOUND`) devreye
girip `42501` döner; `UPDATE`'e hiç gelinmez. Dala ancak iki eşzamanlı işlemle
ulaşılır ve `.env`'de doğrudan Postgres bağlantı dizesi yok (§4.2).

Dalın **varlığı** göçün kendi doğrulama bloğunda ölçülüyor; canlı süitin
ölçtüğü şey phase29 kazanımlarının kaybolmadığıdır.
