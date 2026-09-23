# phase43 — uygulama ve doğrulama paketi

> **SQL Editor'e YAPIŞTIRILACAK DOSYA:**
> `C:\Users\pc\Desktop\lexbnb-claude\supabase\migration_phase43_period_reset_integrity.sql`
> Bu belge (`.md`) açıklamadır — SQL Editor'e yapıştırılmaz.

**Sahibi:** Claude (tek numara — `AGENTS.md`)
**Durum (23 Eylül 2026):**

| Ortam | Durum |
|---|---|
| Test projesi `pdeiorpgxetksyogrmbi` | ✅ **uygulandı**, `phase43_period_reset_live_tests` 25/25 yeşil; göçten önce 16'sı kırmızıydı |
| Üretim `kirpcqklyjlrhvdbgdrq` | ✅ **uygulandı ve doğrulandı** (23 Eylül 2026) — `schema_migrations` 43 mevcut |

> phase41'den **sonra** uygulanmalıdır. Tek transaction, idempotent
> (test projesinde `BEGIN … ROLLBACK` içinde art arda iki kez koşuldu).

---

## 1. Ne değişiyor

| # | Madde | Değişiklik |
|---|---|---|
| 1 | L-08 | `close_monthly_period_atomic`: ay **bitmeden** kapatılamaz (`PERIOD_NOT_ENDED`). "Bugün" Europe/Istanbul takvimine göre. |
| 2 | L-09 | `reset_tenant_data` kendi denetim kaydını silmeden **sonra**, tablonun gerçek sütunlarıyla yazar (`new_data`); hata artık yutulmaz — iz yazılamazsa sıfırlama da geri alınır. |
| 3 | L-10 | `financial_transactions` sıfırlama listesinin başında (FK RESTRICT sıfırlamayı kilitliyordu). |
| 4 | L-10 (ek) | Hesap kapatma: `financial_transactions.created_by` ve `monthly_financial_closes.reopened_by` `ON DELETE SET NULL`; `guard_created_by` artık kullanıcı gerçekten silinmişse `NULL`'a izin veriyor; kapanış kaydı ve gider koruması yalnızca silinmiş kullanıcı kimliğinin boşalmasına izin veriyor. Önceden silinmiş kullanıcıyı gösteren eski değerler temizlenir. |
| 5 | L-11 | Kapalı dönemde rezervasyonun `channel`, `guest_name`, `pax`, kişi sayıları ve `net_room_revenue` alanları da değişmez. Temizlik görevleri korumaya girer: tarih/tutar/mülk değişmez, ekleme/silme yok; **"Ödendi" işaretlenebilir** (ödeme kapanıştan sonra olur). Sıfırlama ve işletme silme istisnaları tanımlı. |

**L-12 göçte değil:** SQL'den depolama dosyası silinemez. Sahipsiz fotoğrafları
her gece `Marketing workers` iş akışındaki yeni adım siler
(`npm run storage:orphan-cleanup`, `core/storage_orphan_cleanup.js`).
Yalnızca işletmesi ya da mülkü veritabanında **olmayan** klasörler silinir;
veritabanı okunamazsa veya hiç işletme görünmüyorsa **hiçbir şey silinmez**.
İlk koşuyu görmek isterseniz GitHub → Actions → Marketing workers →
Run workflow.

### Kullanıcının göreceği davranış farkları

- İçinde bulunulan ay kapatılamaz; kapatma denemesi `PERIOD_NOT_ENDED`
  hatası verir. Arayüzde düğmenin pasifleşmesi Dalga 2'dedir (app.js).
- Kapalı ayda temizlik görevi eklenemez/silinemez, tutarı değişmez; ödeme
  durumu değişebilir.
- Sıfırlama sonrası denetim kaydında `TENANT_DATA_RESET` satırı kalır.

---

## 2. Uygulama

1. https://supabase.com/dashboard/project/kirpcqklyjlrhvdbgdrq/sql/new
2. Editörü boşaltın, **yukarıdaki `.sql` dosyasının** tamamını yapıştırın, **Run**.
3. Son bildirim: `PHASE 43 OK — ay kapanisi, sifirlama ve hesap kapatma butunlugu yerinde.`

---

## 3. Doğrulama bloğunun ölçtükleri

| Kod | Ne ölçer |
|---|---|
| `PHASE43_PERIOD_NOT_ENDED_GATE_MISSING` / `_GATE_AFTER_SNAPSHOT` | ay-bitmedi kapısı ve sırası |
| `PHASE43_RESET_FINANCIAL_TRANSACTIONS_ORDER` | `financial_transactions` `bookings`'ten önce siliniyor mu |
| `PHASE43_RESET_STILL_SWALLOWS_ERRORS` / `_WRITES_NONEXISTENT_COLUMN` / `_AUDIT_BEFORE_DELETE` | sıfırlama izi |
| `PHASE43_BOOKING_GUARD_FIELDS_MISSING` / `PHASE43_CLEANING_GUARD_*` | kapalı dönem korumaları ve sıfırlama istisnası |
| `PHASE43_USER_FK_BLOCKS_ACCOUNT_DELETION` | `auth.users`'a NO ACTION/RESTRICT FK kaldı mı |
| `PHASE43_CREATED_BY_GUARD_BLOCKS_SET_NULL` / `PHASE43_CLOSE_GUARD_CONTRACT` | silinmiş kullanıcı kimliği boşalabiliyor mu, kapanış koruması yerinde mi |

---

## 4. Üretime salt okunur doğrulama (`GÖÇ UYGULANDI`)

`service_role` ile, kayıt bırakmayan sorgu:
`GET /rest/v1/schema_migrations?select=version,name&version=eq.43` →
`43 phase43_period_reset_integrity`. Göç tek transaction olduğu için bu satır
doğrulama bloğunun tamamının geçtiğini gösterir.

**Üretime doğrulama amacıyla kayıt yazılmaz** (ay kapatma, sıfırlama ve hesap
kapatma denemeleri test projesinde yapıldı).

---

## 5. Test ağları

| Süit | Tür | İddia |
|---|---|---|
| `core/phase43_period_reset_live_tests.js` | canlı (yalnız test projesi) | 25 |
| `core/storage_orphan_cleanup_tests.js` | çevrimdışı | 10 — silme kararı, kuru çalışma, "okuyamadım ≠ yok", yanlış anahtar, sayfalama |
