# phase45 + phase47 — uygulama ve doğrulama paketi

> **SQL Editor'e YAPIŞTIRILACAK DOSYA:**
> `C:\Users\pc\Desktop\lexbnb-claude\supabase\migration_phase45_cleaning_cost_contract.sql`
> ardından **ayrı bir çalıştırmayla**
> `C:UserspcDesktoplexbnb-claudesupabasemigration_phase47_booking_delete_keeps_done_cleaning.sql`
> Bu belge (`.md`) açıklamadır — SQL Editor'e yapıştırılmaz.

**Sahibi:** Claude (tek numara — `AGENTS.md`)
**Durum (25 Eylül 2026):**

| Ortam | Durum |
|---|---|
| Test projesi `pdeiorpgxetksyogrmbi` | ✅ **uygulandı**, `phase45_cleaning_cost_live_tests` 28/28; göçten önce kırmızıydı (`status` sütunu yok). `BEGIN … ROLLBACK` içinde art arda iki kez hatasız koştu (idempotent). phase43, yönetici snapshot'ı, ay kapanışı, sıfırlama, hesap kapatma ve yedek/geri yükleme canlı süitleri yeşil. |
| Üretim `kirpcqklyjlrhvdbgdrq` | ⬜ uygulanmadı |

> phase43'ten **sonra** uygulanır. Tek transaction.

## ⚠️ Sıra: önce göç, sonra PUSH

Yeni istemci kodu temizlik görevinin `status` sütununa ve
`booking_payment_commissions` tablosuna yazar. GitHub Pages push'u anında
yayına alır; göç uygulanmadan push edilirse temizlik defteri ve ödeme
komisyonu yazmaları "veritabanı güncellemesi bekleniyor" hatasıyla durur
(rezervasyon kaydının kendisi kırılmaz).

Göç **eski istemciyle uyumludur**: eski "Ödendi" akışı `EXP-CLEAN-*` gider
satırı yazmaya devam eder, tetikleyici ödenen görevi `DONE` yapar, snapshot
o görevi ikinci kez saymaz. Yani göç bugün uygulanıp push sonra yapılabilir.

---

## 1. Ne değişiyor (K-04 kararı, HATALAR.md L-27 / L-28 / L-32)

| # | Değişiklik |
|---|---|
| 1 | `cleaning_tasks.status` (`PLANNED` / `DONE` / `SKIPPED`) ve `completed_at`. Temizlik **gideri "yapıldı" anında** doğar, **yapıldığı günün ayına** yazılır. Ödeme yalnız ödeme durumudur. |
| 2 | Geçmiş veri uydurulmadan eşlenir: ödenmiş görev → `DONE`; iptal edilmiş rezervasyonun ödenmemiş görevi → `SKIPPED`; kalanı `PLANNED` (bilinmiyor — arayüz "yapıldı mı?" diye sorar). |
| 3 | Kurallar: ödenmiş ama yapılmamış temizlik olamaz (`CHECK`); görev yalnız **aynı işletmenin** rezervasyonuna bağlanabilir. |
| 4 | Kapalı dönem koruması durum değişimini de kapsar: kapanmış ayda "yapıldı → yapılmadı" reddedilir. Yapılmış temizliğin **ödemesi** kapanıştan sonra serbest kalır. Kapanmış ayda **planlı** bir görev ödenemez (ödeme = yapıldı, kapanış giderini değiştirir; dönem yeniden açılmalıdır). |
| 5 | `booking_payment_commissions`: rezervasyon başına ödeme komisyonu (POS / sanal POS kesintisi). `bookings`'e sütun **eklenmedi** (CLAUDE.md §3.4 dağıtım sırası tuzağı). RLS, `anon` kapalı, `tenant_id` değişmez, kapalı dönem koruması, yabancı rezervasyon reddi. |
| 6 | `compute_month_close_snapshot` (schemaVersion 4) ve `get_executive_dashboard_snapshot`: OPEX = elle giderler + OTA komisyonu + **ödeme komisyonu** + **yapılmış temizlik maliyeti**. Ödeme komisyonu gecelere tahakkukla dağılır, ciroyu azaltmaz. Yeni alanlar: `paymentCommission`, `cleaningCost`, `cleaningDebt` (yönetici: `payment_commission`, `cleaning_cost`, `cleaning_debt`, `cleaning_revenue`). |

Kapanmış ayların **saklanmış** snapshot'ları değişmez; yalnız yeni hesaplar
bu sözleşmeyi kullanır.

---

## 2. Uygulama

1. https://supabase.com/dashboard/project/kirpcqklyjlrhvdbgdrq/sql/new
2. Editörü boşaltın, **phase45 `.sql` dosyasının** tamamını yapıştırın, **Run**.
3. Son bildirim: `PHASE 45 OK — temizlik maliyeti ve odeme komisyonu sozlesmesi yerinde.`
4. Editörü boşaltın, **phase47 `.sql` dosyasının** tamamını yapıştırın, **Run**.
5. Son bildirim: `PHASE 47 OK — rezervasyon silme yapilmis temizligi koruyor.`

### phase47 ne yapar

`delete_booking_atomic` rezervasyonla birlikte ödenmemiş **her** temizlik
görevini siliyordu. phase45'ten beri yapılmış ama ödenmemiş temizlik
gerçekleşmiş bir gider ve personele borçtur; artık yalnız **yapılmamış**
(planlı / yapılmadı) ve ödenmemiş görevler silinir. Yetki kapısı phase41 ile
aynı. Ağı `booking_delete_atomicity_tests` 2b (göçten önce kırmızıydı);
`phase41_authz_live_tests` 38/38.

Hata alırsanız hiçbir şey uygulanmamıştır (tek transaction); hata kodunu iletin.

---

## 3. Doğrulama bloğunun ölçtükleri

| Kod | Ne ölçer |
|---|---|
| `PHASE45_STATUS_COLUMN_MISSING` | `status` sütunu |
| `PHASE45_PAID_NOT_DONE` | geçmiş veri eşlemesi: ödenmiş her görev `DONE` |
| `PHASE45_STATUS_TRIGGER_MISSING` / `_TRIGGER_ORDER` | durum eşitleme tetikleyicisi ve kapalı dönem korumasından önce çalışması |
| `PHASE45_CLOSED_PERIOD_STATUS_UNGUARDED` / `_EXEMPTIONS_LOST` | koruma durumu kapsıyor, sıfırlama/silme istisnaları duruyor |
| `PHASE45_PAYMENT_RLS_OFF` / `_ANON_OPEN` / `_TENANT_IMMUTABLE_MISSING` / `_GUARD_MISSING` | yeni tablonun dört koruması |
| `PHASE45_CLOSE_SNAPSHOT_CONTRACT` / `PHASE45_EXECUTIVE_SNAPSHOT_CONTRACT` | iki snapshot yeni sözleşmeyi taşıyor |
| `PHASE45_ANON_EXECUTE_OPEN` | iki snapshot fonksiyonunda `anon` kapalı |

---

## 4. "GÖÇ UYGULANDI" — üretime salt okunur doğrulama (§4.2)

Anon anahtarıyla, üretime kayıt bırakmadan:

```
booking_payment_commissions?select=booking_id&limit=0
  ÖNCE:  404 PGRST205 Could not find the table
  SONRA: 401 42501    permission denied for table
```

`cleaning_tasks.status` anon ile ayırt edilemez (tablo phase41'den beri
anon'a kapalı, önce de sonra da `42501`). Sütunun ve snapshot sözleşmesinin
kanıtı doğrulama bloğunun kendisidir: dosya `PHASE 45 OK` ile bittiyse
kontroller **veritabanının içinde** geçmiştir.

---

## 5. Ağlar

- `core/phase45_cleaning_cost_live_tests.js` — 28 iddia, canlı (yalnız test projesi): K-04 kabul senaryoları A–I, yabancı kiracı, anon kapısı.
- `core/phase43_period_reset_live_tests.js` 2g — kapanıştan sonra ödeme artık **yapılmış** görev üzerinden ölçülür.
