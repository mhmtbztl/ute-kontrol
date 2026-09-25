# Tasarım — Temizlik maliyeti ve ciro sözleşmesi (K-04 · L-27 + L-32)

**Durum:** kararlar verildi (25 Eylül 2026); sunucu kısmı phase45. `app.js` Codex Dalga 1'den
sonra açılınca uygulanır. Sunucu kısmı **phase45** (Claude'un sıradaki tek
numarası).

Kaynak kararlar (kullanıcı, 23.09 — HATALAR.md K-04, L-32):

```
Brüt Oda Geliri   = brüt tutar − misafirden alınan temizlik ücreti
Net Oda Geliri    = Brüt Oda Geliri − tüm indirimler        ← "konaklama cirosu"
Temizlik Geliri   = misafirden alınan temizlik ücreti        ← ayrı gelir kalemi
Toplam Gelir      = Net Oda Geliri + Temizlik Geliri
OPEX              = elle giderler + OTA komisyonu + ödeme komisyonu
                    + YAPILMIŞ temizliklerin maliyeti
Net Kâr           = Toplam Gelir − OPEX − CAPEX
ADR    = Net Oda Geliri / satılan gece
RevPAR = Net Oda Geliri / satılabilir gece
İndirim yalnız oda gelirinden düşer, gecelere tahakkukla dağılır.
Temizlik gideri "yapıldı" anında doğar, yapıldığı ayın gideridir.
Rezervasyon kaydı gider yazmaz. Yapılmayan temizlik ne gider ne borçtur.
```

---

## 1. Bugün ne var (24.09 ölçümü)

| Parça | Bugünkü davranış | K-04'e göre |
|---|---|---|
| Sunucu `compute_month_close_snapshot` | Oda = brüt − temizlik ücreti − indirim; temizlik geliri ayrı; ADR/RevPAR oda gelirinden; geceye tahakkuk | ✅ gelir tarafı doğru |
| Sunucu `get_executive_dashboard_snapshot` (phase38) | Aynı gelir tabanı | ✅ gelir tarafı doğru |
| İki sunucu fonksiyonu — OPEX | `elle giderler + OTA`; **temizlik maliyeti yok** | ❌ yapılmış temizlik eksik |
| Temizlik maliyeti (istemci) | Yalnız **"Ödendi"** anında `expenses`'e `legacy_id = 'EXP-CLEAN-<görev>'` satırı; **ödeme tarihinin** ayına | ❌ nakit esası; ödenmemiş yapılmış temizlik hiç gider değil |
| Rezervasyon kaydı (L-27) | Temizlik görevi **yazılmıyor**; maliyet = ücret varsayılıyor | ❌ |
| Görev ↔ rezervasyon bağı (L-28) | `cloudUpsertCleaningTask` `booking_id` yazmıyor → ödenmiş görev yeniden borç doğuyor | ❌ |
| Görev durumu | Yalnız `is_paid`. "Yapıldı / yapılmadı" alanı **yok** (phase34 notu) | ❌ |
| Ödeme komisyonu | **Hiçbir yerde alan yok** | — bkz. Soru 1 |
| ADR | Dört tanım (T3-C): brüt/gece, oda/gece, ciro/gece | ❌ tek tanım (L-37) |

Gelir tarafında sunucu doğru; asıl iş **gider tarafı** ve **istemcinin sunucuyla
aynı formüle bağlanması**.

---

## 2. Veri modeli (phase45)

`cleaning_tasks`'a iki sütun — **`bookings`'e sütun eklenmez** (§3.4:
göç uygulanana kadar rezervasyon kaydını kırar):

| Sütun | Tip | Anlam |
|---|---|---|
| `status` | `TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','DONE','SKIPPED'))` | planlandı / yapıldı / yapılmadı |
| `completed_at` | `TIMESTAMPTZ NULL` | "yapıldı" işaretlendiği an (denetim izi) |

- **Gider tarihi = `task_date`.** "Yapıldı" işaretlenirken `task_date`
  gerçekte yapıldığı güne güncellenebilir (varsayılan planlanan gün).
- `is_paid` yalnız **ödeme**dir; gider üretmez (phase34 ilkesi korunur).
- Kural: `is_paid = TRUE` ise `status = 'DONE'` olmalı (ödenmiş ama yapılmamış
  temizlik olmaz) — `CHECK`.
- `SKIPPED` görevin `is_paid`'i TRUE olamaz.
- phase43'ün kapalı dönem koruması `status` değişimini de kapsar
  (kapanmış ayda "yapıldı → yapılmadı" gideri değiştirir).

### Geçmiş veri (göç içinde, uydurmadan)

| Mevcut görev | Yeni durum | Gerekçe |
|---|---|---|
| `is_paid = TRUE` | `DONE` | ödendiyse yapılmıştır |
| `is_paid = FALSE`, bağlı rezervasyon `CANCELLED` | `SKIPPED` | misafir gelmedi |
| diğer tümü | `PLANNED` | **bilinmiyor** — uydurulmaz (§3.6) |

Geçmiş tarihli `PLANNED` görevler arayüzde "Bu temizlikler yapıldı mı?"
listesi olarak sorulur (tek tık "yapıldı" / "yapılmadı").

---

## 3. Gider hesabı — çift sayımsız geçiş

Eski ödemeler `expenses`'te `EXP-CLEAN-<görev>` satırı olarak duruyor ve
bazıları **kapanmış aylarda**. Onları silmek ya da başka aya taşımak kapanış
mührünü bozar (§3.4.1). Bu yüzden:

```
Temizlik maliyeti (ay) =
    Σ cleaning_tasks.amount  WHERE status = 'DONE' AND task_date ∈ ay
                             AND 'EXP-CLEAN-' || id  eski gider satırı olarak YOK
Elle giderler (ay)    = Σ expenses (EXP-CLEAN-* dahil — geçmiş ödemeler)
```

- Eski satırı olan görev bir kez sayılır (eski satırdan, eski ayında).
- Yeni işaretlenen her görev görevden sayılır.
- Yeni "Ödendi" **artık `expenses` yazmaz**; `persistCleaningLedgerEntry`
  yalnız görevi yazar. Eski satırı olan bir görev "Borç"a geri alınırsa
  eski satır silinir (bugünkü davranış) ve maliyet görevden gelir.
- Personel borcu = `status = 'DONE' AND NOT is_paid` toplamı.

Aynı ifade **üç yerde** kullanılır ve tek kaynaktan gelir:
`compute_month_close_snapshot`, `get_executive_dashboard_snapshot`
(phase45 ikisini de yeniden tanımlar) ve istemci Finans ekranı. İstemci
kendi hesabını yapmaz; ay rakamlarını phase32'deki gibi sunucu
snapshot'ından okur.

Sunucu snapshot'ına eklenecek alanlar: `cleaningCost`, `cleaningDebt`,
`totalOpex = manualOpex + otaCommission + cleaningCost`,
`netProfit = revenue − totalOpex − capex`. `schemaVersion` 4.

---

## 4. İstemci akışları (app.js — Codex Dalga 1 sonrası)

| Akış | Yeni davranış |
|---|---|
| Rezervasyon kaydet (L-27) | Temizlik maliyeti girildiyse görev `booking_id` + `amount` + `task_date = check_out` + `status = 'PLANNED'` ile yazılır. **Gider yazılmaz.** Maliyet boşsa görev açılır, tutar boş kalır — ücret maliyet diye **kopyalanmaz** (bugünkü "maliyet = ücret" kaldırılır) |
| Rezervasyon düzenle | Bağlı `PLANNED` görevin tarihi/tutarı güncellenir; `DONE` göreve dokunulmaz, kullanıcıya söylenir |
| Rezervasyon iptal | Bağlı `PLANNED` görev `SKIPPED` |
| "Yapıldı" düğmesi | `status = DONE`, `completed_at = now()`; tarih sorulur (varsayılan planlanan gün) |
| "Yapılmadı" | `SKIPPED` (gelmeyen misafir) |
| "Ödendi" | Yalnız `is_paid`; `PLANNED` görevde önce "yapıldı mı?" sorulur |
| Görev bağı (L-28) | `cloudUpsertCleaningTask` `booking_id` yazar; senkron, `booking_id`'si olan göreve ikinci görev türetmez |
| Tutar düzenleme (L-29) | `normalizeAmount`; doğru görev kimliğiyle |
| Etiketler | Her kartta "Net Oda Geliri" mi "Toplam Gelir" mi yazar (L-32) |

**Dağıtım sırası tuzağı:** GitHub Pages kodu göçten önce yayınlar. İstemci
`status` sütununu `fetchTenantRowsTolerant` kalıbıyla okur; sütun yoksa
eski davranışa düşer ve "veritabanı güncellemesi bekleniyor" der — temizlik
defteri kırılmaz (phase31 örneği).

---

## 5. Kabul senaryoları (canlı süit: `phase45_cleaning_cost_live_tests`)

| # | Senaryo | Beklenen (ay snapshot'ı) |
|---|---|---|
| A | Misafir ödedi, **gelmedi**: görev `SKIPPED` | Ciro var · temizlik gideri **0** · borç **0** |
| B | Temizlik **yapıldı, ödenmedi** | Gider = maliyet (yapıldığı ay) · borç = maliyet |
| C | Yapıldı + **ödendi** | Gider **tek sefer** · borç 0 · `expenses`'te yeni satır **yok** |
| D | Yapıldı 31 Ekim, ödendi 3 Kasım | Gider **Ekim**'de; Kasım'da yok |
| E | Eski `EXP-CLEAN-*` satırı olan görev | Gider eski satırdan, bir kez; görevden ikinci kez **sayılmaz** |
| F | Ücret 1.500, maliyet 1.200 | Temizlik geliri 1.500 · temizlik gideri 1.200 (yapıldıysa) |
| G | 40.000 brüt, 2.000 indirim, 1.500 temizlik ücreti, 5 gece, 2+3 ay bölünmüş | Net Oda Geliri 36.500 → 14.600 / 21.900; temizlik geliri 600 / 900; indirim de aynı oranla |
| H | Kapanmış ayda görev `DONE → SKIPPED` | Reddedilir (phase43 koruması) |
| I | Üç yer | Finans ekranı = yönetici paneli = kapanış snapshot'ı (aynı ay, aynı rakam) |

Mevcut ağlar yeni sözleşmeyi ölçecek şekilde güncellenir:
`booking_form_economics_tests`, `revenue_attribution_tests`,
`executive_snapshot_tests`, `cleaning_ledger_persistence_tests`.

---

## 6. Kullanıcı kararları (25 Eylül 2026)

1. **Ödeme komisyonu rezervasyon başına girilir** (gider kategorisi değil).
   Ayrı tablo `booking_payment_commissions` — `bookings`'e sütun eklenmez
   (§3.4). OTA komisyonu gibi gecelere tahakkukla dağılır, ciroyu azaltmaz.
   Uydurma oran yazılmaz: girilmemişse 0'dır.
2. **Geçmiş tarihli planlı görevler için toplu "seçilenlerin hepsi yapıldı"
   düğmesi olur**, tek tek işaretlemenin yanında.
3. **Gider, temizliğin yapıldığı günün ayına yazılır.** "Yapıldı" denirken
   tarih sorulur (varsayılan planlanan gün) ve `task_date` o güne çekilir.

Sunucu kısmı: `supabase/migration_phase45_cleaning_cost_contract.sql`,
paket `docs/PHASE45_DEPLOY_PACKAGE.md`.
