# phase35 + phase37 — uygulama ve doğrulama paketi

**Göç dosyaları (bu sırayla):**
1. `supabase/migration_phase35_import_undo.sql`
2. `supabase/migration_phase37_import_undo_exact_match.sql`

**Sahibi:** Claude (tek numara — `AGENTS.md`, phase numarası sahipliği)
**Durum (22 Eylül 2026):**

| Ortam | Durum |
|---|---|
| Test projesi `pdeiorpgxetksyogrmbi` | ✅ **uygulandı**, canlı süit 23/23 yeşil |
| Üretim `kirpcqklyjlrhvdbgdrq` | ✅ **22 Eylül 2026'da uygulandı ve doğrulandı** — bkz. §5 |

> **İkisi birlikte uygulanmalıdır.** phase37, phase35'in bir kusurunu düzeltir;
> yalnız phase35 uygulanırsa geri alma, aktarımdan hemen sonra yapılan
> düzenlemeleri sessizce siler.

---

## 1. Ne yapıyor

İçe aktarma tek seferde yüzlerce kayıt yazabiliyor. Biçim kontrolleri
(zorunlu sütun, mülk eşleşmesi, tarih çakışması) bozuk **biçimi** yakalar ama
**"yanlış dosyayı yükledim" hiçbir kapıya takılmaz**: dosya geçerlidir, veri
yanlıştır. O ana kadar tek çıkış yolu 300 kaydı tek tek silmekti.

`finance_import_batches` her aktarımı zaten kaydediyordu (dosya parmak izi,
satır sayısı, tutar) ama aktarım ile **yazdığı kayıtlar arasında bağ yoktu** —
yani "bu aktarım neyi yazdı" sorusunun cevabı hiçbir yerde durmuyordu.

- **phase35** `finance_import_batch_rows` bağ tablosunu ve
  `undo_finance_import()` RPC'sini kurar.
- **phase37** "değişmiş kayıt" ölçütünü düzeltir (aşağıda).

---

## 2. Üç tasarım kararı

### 2.1 `bookings`/`expenses`'e sütun eklenmedi

GitHub Pages push ile **anında** yayına alır, göçler **elle** uygulanır. Kod
her zaman göçten önce canlıya çıkabilir. `bookings`'e temizlik maliyeti sütunu
eklendiğinde göç uygulanana kadar **hiçbir rezervasyon kaydedilemedi**
(CLAUDE.md §3.4). Aynı tuzak burada da geçerliydi.

Bağ ayrı tabloda durur: göç uygulanana kadar **yalnızca geri alma** çalışmaz,
içe aktarmanın kendisi çalışmaya devam eder. İstemci bunu yutmaz; kullanıcıya
"bu aktarım tek tuşla geri alınamayacak" der. phase31'deki fiyat merdiveni
kararıyla aynı gerekçe.

### 2.2 Sonradan düzenlenmiş kayıt silinmez, atlanır

Kullanıcı aktarımdan sonra bir kaydı elle düzelttiyse o artık "aktarılan veri"
değil, **onun emeğidir**. Geri alma onu yok saymamalıdır. Sonuç, kaç kaydın
atlandığını ayrı alan olarak döner ve kullanıcıya söylenir.

### 2.3 Kapanmış döneme düşen kayıt varsa işlem hiç başlamaz

Yarısını silip yarısını bırakmak, geri alınmak istenen karışıklığın daha
kötüsünü üretirdi. Kaç kaydın engellendiği söylenir; kullanıcı dönemi açıp
tekrar dener. Tetikleyiciye çarpmayı beklemek de işe yarardı ama o zaman
kullanıcıya **kaç** kaydın engellendiği söylenemezdi.

---

## 3. phase37 neden var

phase35 ölçütü şöyle yazdı:

```sql
b.updated_at <= b.created_at + INTERVAL '2 seconds'
```

İki saniyelik pay, oluşturma anındaki tetikleyici güncellemelerini yutmak için
konulmuştu. **Gereksizdi ve zararlıydı.** Test projesinde ölçüldü:

```
INSERT -> created_at = updated_at   (birebir aynı; ikisi de NOW())
UPDATE -> updated_at 82 ms sonraya kayıyor
```

`set_updated_at` (phase24) yalnızca `BEFORE UPDATE` çalışır; oluşturma anında
`updated_at`'e hiç dokunmaz. Yani pay hiçbir şeyi korumuyordu. Buna karşılık
gerçek bir zararı vardı: aktarımdan **hemen sonra** — ki en olağan durum budur,
kullanıcı yanlışı fark edip düzeltir — yapılan bir düzenleme "değişmemiş"
sayılıyor ve geri alma kullanıcının emeğini **sessizce** siliyordu.

**Bunu canlı süit yakaladı**, kaynak taraması değil: ilk koşuda 6., 7. ve 8.
iddialar kırmızıydı. Kaynak taraması ölçütün dosyada ne yazdığını görür,
veritabanında ne yaptığını göremez.

phase35 düzeltilmedi çünkü **bir veritabanına uygulanmış göç değişmezdir** —
`bootstrap_test_project.js` bunu kapıda reddediyor ("başka bir içerikle
uygulanmış"). Düzeltme yeni bir göç olarak geldi.

---

## 4. Uygulama

Supabase Dashboard → SQL Editor → **önce phase35, sonra phase37** → Run.
Her dosyanın sonunda kendi doğrulama bloğu var; başarısızsa `RAISE EXCEPTION`
ile durur. İkisi de idempotenttir, tekrar çalıştırmak güvenlidir.

```
.../project/kirpcqklyjlrhvdbgdrq/sql/new
```

Başarılı koşular şunu yazar:

```
NOTICE: PHASE 35 OK — ice aktarim bagi kuruldu, geri alma yerinde, anon kapali.
NOTICE: PHASE 37 OK — degismis kayit olcumu tam esitlik, zaman payi kaldirildi.
```

---

## 5. Doğrulama (salt okunur, üretime kayıt bırakmaz)

§4.2 yöntemi. Tablo için `PGRST205` = yok, `42501` = var ve anon kapalı.
Fonksiyon için `PGRST202` = yok, `42501` = var ve anon kapalı.

```bash
node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/)
  .filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');
  return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const url=env.SUPABASE_URL, key=env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY;
(async()=>{
  const r=await fetch(url+'/rest/v1/finance_import_batch_rows?select=tenant_id&limit=0',
    {headers:{apikey:key,Authorization:'Bearer '+key}});
  const j=await r.json().catch(()=>({}));
  console.log('finance_import_batch_rows ->', r.status, j.code||'');

  const f=await fetch(url+'/rest/v1/rpc/undo_finance_import',
    {method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
     body:JSON.stringify({p_tenant_id:'00000000-0000-4000-8000-000000000000',
                          p_batch_id:'00000000-0000-4000-8000-000000000000',p_confirm:'hayir'})});
  const fj=await f.json().catch(()=>({}));
  console.log('undo_finance_import        ->', f.status, fj.code||'', (fj.message||'').slice(0,60));
})();
"
```

**Uygulandıktan sonra ölçüldü (22 Eylül 2026):**

```
finance_import_batch_rows      -> 401 42501  permission denied for table
undo_finance_import            -> 401 42501  permission denied for function
bookings.import_batch_id       -> 400 42703  column does not exist
bookings.batch_id              -> 400 42703  column does not exist
```

İlk iki satır §7'nin **iki katını birden** kanıtlar: adın bilinmesi nesnenin
var olduğunu, `42501` dönmesi `anon` yetkisinin gerçekten geri alındığını
gösterir. `CONFIRMATION_REQUIRED` gibi **fonksiyonun kendi hata mesajı**
dönseydi anon gövdeye kadar girmiş olurdu — koruma tek katlıya düşerdi
(CLAUDE.md §7, Phase 17'de yaşanan).

Son iki satır **§2.1'deki tasarım kararının tuttuğunu** gösterir: `bookings`
tablosuna hiçbir sütun eklenmedi, yani rezervasyon kaydetme akışına
dokunulmadı.

**phase37 bu sorguyla DOĞRULANAMAZ.** Anon çağrısı phase35 ile phase37
arasında aynı cevabı verir; ikisini ayırt etmez. phase37'nin uygulandığının
kanıtı **kendi doğrulama bloğudur**: blok `pg_proc.prosrc`'u okuyup zaman
payı hâlâ duruyorsa `PHASE37_TOLERANCE_STILL_PRESENT` ile `RAISE EXCEPTION`
yapar. Yani dosyanın **hatasız** tamamlanıp `PHASE 37 OK` yazması, ölçümü
veritabanının içinde yapılmış bir doğrulamadır ve dışarıdan atılacak her
sorgudan güçlüdür. Şüphe varsa dosyayı yeniden çalıştırmak yeterlidir
(idempotenttir).

---

## 6. Ağı

| Süit | Ne ölçer | Nerede koşar |
|---|---|---|
| `core/import_undo_tests.js` | 50 iddia: bağ yazımı, eksik şema toleransı, `app.js` kaynağı, her iki göçün içeriği | çevrimdışı (`npm test`) |
| `core/import_undo_live_tests.js` | 23 iddia: geri almanın **gerçek** davranışı — atlanan düzenlemeler, kapanmış dönem reddi, çapraz kiracı, roller, anon kapısı, cascade | canlı (**yalnız test projesi**) |

**Eski gövdeye karşı ölçüldü (§5.5):** çevrimdışı süitin **18 iddiası** kırılıyor.

Canlı süit ilk koşuda **6/23 kırmızıydı** ve phase37'yi doğuran kusuru o
yakaladı. Kaynak taraması bunu bulamazdı.

---

## 7. Bilinen sınır

Geri alma **yalnızca içe aktarmanın eklediği kayıtları** siler. Aktarımdan
sonra bu kayıtlara bağlı olarak oluşan türev kayıtlar (örn. rezervasyondan
doğan temizlik görevi) rezervasyon silinirken FK davranışına göre işlenir:
`cleaning_tasks.booking_id` `ON DELETE SET NULL` olduğu için **ödenmiş temizlik
borcu korunur**, yalnızca rezervasyon bağı kopar. Bu bilerek böyledir —
ödeme geçmişi silinmemelidir.

Göç uygulanmadan **önce** yapılmış aktarımların bağı yoktur; arayüz onları
"geri alınamaz" olarak gösterir ve sebebini söyler.
