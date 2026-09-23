# phase41 — uygulama ve doğrulama paketi

> **SQL Editor'e YAPIŞTIRILACAK DOSYA:**
> `C:\Users\pc\Desktop\lexbnb-claude\supabase\migration_phase41_role_authz_hardening.sql`
> Bu belge (`.md`) açıklamadır — SQL Editor'e yapıştırılmaz.

**Göç dosyası:** `supabase/migration_phase41_role_authz_hardening.sql`
**Sahibi:** Claude (tek numara — `AGENTS.md`, phase numarası sahipliği)
**Durum (23 Eylül 2026):**

| Ortam | Durum |
|---|---|
| Test projesi `pdeiorpgxetksyogrmbi` | ✅ **uygulandı** (`npm run test:bootstrap`), `phase41_authz_live_tests` 38/38 yeşil; göçten önce 29'u kırmızıydı |
| Üretim `kirpcqklyjlrhvdbgdrq` | ✅ **uygulandı ve doğrulandı** (23 Eylül 2026) — anon ile `guests`/`profiles`/`scheduled_messages`/`extension_offers`/`bookings` → `401 42501`; `schema_migrations` 41 mevcut |

> phase39'dan **sonra** uygulanmalıdır. Tek transaction, idempotent
> (test projesinde `BEGIN … ROLLBACK` içinde art arda iki kez koşuldu).

> ⚠️ **Sıra: önce üretim, sonra `PUSH`.** Repo herkese açık; göç dosyası ve
> canlı süit, kapattıkları boşlukları dolaylı olarak tarif eder. Göç
> üretimde uygulanmadan bu dal `master`'a gönderilmemelidir.

---

## 1. Ne değişiyor

| # | Konu | Değişiklik |
|---|---|---|
| 1 | Mesaj kuyruğu worker RPC'leri | `claim_scheduled_messages_atomic`, `record_message_delivery_result_atomic` yalnız `service_role`; `authenticated` yetkisi geri alındı. Uygulamada tarayıcıdan çağıran yol yok. |
| 2 | Uzatma teklifi kabulü | `accept_extension_offer_atomic` oturum ve rol ister (bookings UPDATE ile aynı roller: owner/admin/manager/staff); kontrol kayıt aranmadan önce. |
| 3 | Mesajlaşma, uyarı, bildirim tabloları (phase10 + phase12) | `FOR ALL` üyelik politikaları kaldırıldı. Okuma üyelere açık; yazma role göre. Teslim kayıtları istemciye salt okunur. Bildirimler kişisel: kullanıcı yalnız kendi bildirimini görür/değiştirir. Bildirim ve uyarı RPC'leri aynı kurala bağlandı. |
| 4 | `delete_booking_atomic` | owner/admin/manager (RLS silme politikasıyla aynı). |
| 5 | `tenant_id` değişmezliği | `tenant_id` sütunu olan **her** tabloya `trg_tenant_id_immutable`. |
| 6 | `anon` tablo yetkileri | `public` şemasındaki tüm tablo/görünüm/dizi yetkileri ve gelecek tablolar için varsayılan yetki geri alındı. |
| 7 | `create_tenant_and_owner` | Üyeliği olan kullanıcıya yeni işletme açmaz (`MEMBERSHIP_EXISTS`). |
| 8 | `schema_migrations` | RLS açık (politika yok). |

### Kullanıcının göreceği davranış farkları

- **staff** rolü artık rezervasyon **silemez** (düzenleyebilir). Silme
  denemesi `FORBIDDEN_ROLE` ile reddedilir.
- **viewer** rolü mesaj şablonu, zamanlanmış mesaj, uyarı ve işletme geneli
  bildirim durumunu değiştiremez; okumaya devam eder.
- Bir kullanıcı başka kullanıcıya ait kişisel bildirimleri artık görmez.
- Zaten bir işletmeye üye olan hesap yeni işletme açamaz. İstemcinin girişte
  üyelik okuma hatasını ayrıca ele alması Dalga 2'dedir (L-06 istemci kısmı);
  o gelene kadar böyle bir hata "İşletme kurulumu tamamlanamadı" olarak
  görünür, ikinci bir boş işletme **açılmaz**.

---

## 2. Uygulama

Supabase Dashboard → SQL Editor → dosyanın tamamını yapıştır → Run.

```
https://supabase.com/dashboard/project/kirpcqklyjlrhvdbgdrq/sql/new
```

Tek transaction; doğrulama bloğu başarısızsa **hiçbir şey COMMIT edilmez.**
Başarılı koşunun son bildirimi:

```
NOTICE: PHASE 41 OK — rol ve kiraci yetkileri sikilastirildi.
```

SQL Editor bir dizi `policy ... does not exist, skipping` bildirimi de
gösterir; bunlar `DROP POLICY IF EXISTS` satırlarından gelir ve normaldir.

---

## 3. Doğrulama bloğunun ölçtükleri

Göç, veritabanının **içinde** şunları ölçer; biri tutmazsa durur:

| Kod | Ne ölçer |
|---|---|
| `PHASE41_WORKER_GATE_MISSING` / `_STILL_CLIENT_EXECUTABLE` / `_SERVICE_ROLE_LOST` | worker RPC'leri yalnız service_role'e açık mı |
| `PHASE41_EXTENSION_AUTHZ_ORDER` / `_NULL_ROLE_GUARD_MISSING` / `_ANON_EXECUTABLE` | teklif kabulünde yetki kilitten önce ve `COALESCE` kalıbında mı |
| `PHASE41_BROAD_POLICY_REMAINS` | dokuz tabloda `FOR ALL` ya da `authenticated` dışı politika kaldı mı |
| `PHASE41_WRITE_POLICY_WITHOUT_ROLE` | yazma politikası rol kontrolsüz mü |
| `PHASE41_DELIVERY_LOGS_CLIENT_WRITABLE` | teslim kayıtlarında okuma dışı politika var mı |
| `PHASE41_NOTIFICATIONS_NOT_PERSONAL` | bildirim okuma politikası kişiye bağlı mı |
| `PHASE41_NOTIFICATION_RPC_CONTRACT` / `PHASE41_ALERT_RPC_CONTRACT` | phase29 + phase39 kazanımları (yetki kilitten önce, oracle kapalı, `ROW_COUNT`, denetim izi sırası) korunuyor mu |
| `PHASE41_DELETE_BOOKING_ROLE_GATE_MISSING` | silme rol kapısı |
| `PHASE41_TENANT_ID_TRIGGER_MISSING` | tetikleyicisi eksik `tenant_id` tablosu kaldı mı |
| `PHASE41_ANON_TABLE_PRIVILEGE_REMAINS` | anon'un yetkisi olan tablo kaldı mı |
| `PHASE41_SECOND_TENANT_GATE_*` | ikinci işletme kapısı tenant INSERT'inden önce mi |
| `PHASE41_SCHEMA_MIGRATIONS_RLS_OFF` | defter tablosunda RLS |

Göç sonunda kendini `schema_migrations`'a `41, phase41_role_authz_hardening`
olarak yazar.

---

## 4. Üretime salt okunur doğrulama (`GÖÇ UYGULANDI`)

Göç tek transaction olduğu için tek bir ayırt edici ölçüm hepsinin
uygulandığını gösterir. `anon` anahtarıyla, **kayıt bırakmayan** tablo
sorguları (§4.2):

```
GET /rest/v1/guests?select=id&limit=0
GET /rest/v1/profiles?select=id&limit=0
GET /rest/v1/scheduled_messages?select=id&limit=0
GET /rest/v1/extension_offers?select=id&limit=0
```

| | Beklenen |
|---|---|
| Uygulanmadan önce | `200 []` (anon tabloya girip RLS'te boş dönüyor — H-12 ölçümü) |
| Uygulandıktan sonra | `401 42501 permission denied for table` |

Ek olarak `service_role` ile salt okunur:
`GET /rest/v1/schema_migrations?select=version,name&version=eq.41` →
`41 phase41_role_authz_hardening`.

**Üretime doğrulama amacıyla kayıt yazılmaz.** Rol davranışının kendisi
(viewer/staff/yabancı kiracı) test projesinde `phase41_authz_live_tests` ile
ölçüldü; üretimde aynı göç, aynı doğrulama bloğuyla koşar.

---

## 5. Test ağları

| Süit | Tür | İddia |
|---|---|---|
| `core/phase41_authz_live_tests.js` | canlı (yalnız test projesi) | 38 — her kapanan boşluk için hem "artık olmuyor" hem "izinli olan hâlâ oluyor" |
| `core/phase41_rules_tests.js` | çevrimdışı | 19 — phase41 kaynak sözleşmesi + **ileriye dönük kural**: phase41'den sonraki her göç, `tenant_id` tablosu açıyorsa tetikleyiciyi kurar ve anon'u geri alır; her göç kendini `schema_migrations`'a yazar |

İleriye dönük kural geçmişe uygulandığında phase30, phase31, phase35 ve
phase40'ın dördünü de yakalıyor — L-04'ün kaynağı tam olarak bu dört göçtü.

`account_deletion_tests` uyarlandı: bir kullanıcıya ikinci işletmeyi
`create_tenant_and_owner` ile açtırıyordu; artık o işletme service_role ile
kuruluyor, testin ölçtüğü şey (bekleyen davet) değişmedi.
