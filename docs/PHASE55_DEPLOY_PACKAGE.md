# phase55 (+ phase63) — uygulama ve doğrulama paketi

> **SQL Editor'e yapıştırılacak dosyalar bu `.md` DEĞİLDİR.** Sırasıyla, her biri ayrı sorguda:
> 1. `supabase/migration_phase55_operations_people_execution.sql`
> 2. `supabase/migration_phase63_task_status_audit_action.sql`
>
> Ön koşul: **phase53 uygulanmış olmalı** (dosya bunu kendisi denetler).

## Ne yapar

Operasyon ekranının (A3-G1) ve temizlikçi sayfasının (A3-G2) veritabanı temeli.

| Parça | Tablo / RPC |
|---|---|
| Mülke bağlı olmayan genel görev | `operational_tasks.property_id` boş olabilir |
| Temizlikçi ve usta listesi (ad, telefon, uzmanlık, isteğe bağlı giriş hesabı) | `operational_people` |
| Temizliği kişiye atama; kontrol listesi o anki şablondan dondurulur | `cleaning_task_executions`, `assign_cleaning_task` |
| Arızaya usta atama | `maintenance_assignments` |
| Hazır görev kütüphanesi | `task_templates` |
| Kontrol listesi biçimi (bölüm · madde · önemli · oda alt işareti + ayrı malzeme listesi) | `property_checklist_templates.items` CHECK |
| Personelin kendi işi (kapı kodu, adres, saatler; **tutar, ödeme, misafir adı yok**) | `get_my_field_work` |
| Z: temizlikçi "yaptım" · malzeme Var/Az var/Yok · not | `save_cleaning_progress`, `sign_cleaning_done` |
| M: yönetici denetimi — onay ya da maddeyi yeniden açma | `inspect_cleaning` |
| Personel kendi görevini günceller | `set_my_task_status` (phase63 düzeltmesiyle) |

**Temizlik gideri (kullanıcı kararı 30.09.2026, K-04 değişikliği):** temizlikçinin
"yaptım"ı (Z) gider **değildir**. Yönetici denetleyip onaylayınca (M) temizlik
`DONE` olur ve gider o anda doğar; ay **temizlik günüdür** (`task_date`). Sunucu
formülü (`compute_month_close_snapshot`, `get_executive_dashboard_snapshot`) zaten
`task_date`'e bakıyordu — **değişmedi.** Denetim bekleyen temizlik varken o ay
**kapatılamaz** (`CLEANING_AWAITING_INSPECTION`). Yöneticinin bugünkü gibi
temizliği doğrudan "yapıldı" işaretlemesi (denetimsiz) çalışmaya devam eder.

`cleaning_tasks.cleaner_name` (geçmiş ödeme kaydı) silinmedi, değişmedi. Yeni
tabloda finansal sütun yok; tutar ve ödeme `cleaning_tasks`'ta, personele kapalı.

**Sıfırlama:** icra satırı temizlikle, usta ataması arızayla birlikte silinir;
kişi listesi ve görev şablonları (ekip/ayar gibi) korunur. `reset_tenant_data`
değişmedi.

**phase63 neden ayrı:** phase55'in `set_my_task_status`'ı denetim izine izinsiz
bir eylem adı yazıyordu; personel görevini hiç güncelleyemiyordu. Canlı süit
test projesinde yakaladı. phase55 test projesine uygulanmış olduğu için
değiştirilmedi (phase37 emsali); düzeltme phase63. İkisi birlikte uygulanır.

## Uygulamadan önce (salt okunur)

Kontrol listesi biçim kuralı mevcut satırlara da uygulanır. İstemci bu tabloya
bugün yazmıyor; yine de SQL Editor'de bakın:

```sql
SELECT jsonb_typeof(items) AS bicim, count(*) FROM public.property_checklist_templates GROUP BY 1;
```

Yalnız `array` ya da hiç satır yoksa sorun yok. `object` satırı varsa uygulamadan
önce iletin.

## Uygulama

1. SQL Editor → yeni sorgu → `migration_phase55_operations_people_execution.sql`
   tamamı → **Run**.
2. Yeni sorgu → `migration_phase63_task_status_audit_action.sql` tamamı → **Run**.
3. "Success. No rows returned" normaldir. Hata çıkarsa o dosya hiçbir şey
   değiştirmemiştir; mesajı iletin.

## Doğrulama (üretime kayıt bırakmaz)

1. Anon kapısı (§4.2):
   ```
   POST /rest/v1/rpc/get_my_field_work   ÖNCE 404 PGRST202  →  SONRA 401 42501
   GET  /rest/v1/operational_people?select=id&limit=0
                                         ÖNCE 404 PGRST205  →  SONRA 401 42501
   ```
2. `npm run production:readiness` → `schema_migrations` içinde `55` ve `63`.

## Test projesi

- `phase55_operations_execution_live_tests` **35/35** (göçten önce 11 kırmızı ve
  süit durdu; phase63'ten önce D1 kırmızı). Z imzasından sonra sunucu temizlik
  maliyeti değişmiyor, M onayından sonra 2026-08'e +1.500 yazılıyor; denetim
  bekleyen ay kapanmıyor, denetimden sonra kapanıyor; sıfırlama kapalı ay ve
  icra varken çalışıyor.
- `phase55_operations_execution_tests` (çevrimdışı) 15/15; phase63 olmadan C1
  kırılıyor (izinsiz denetim izi eylemi `schema.sql` CHECK listesinden okunur).
- `phase53_staff_boundary_live_tests` phase55 sonrası 47/47.

## Örnek şablon

`docs/ornek_kontrol_listesi_seyir_zirve.json` — kullanıcının Seyir ve Zirve PDF'lerinden:
1 genel (mutfak + ortak malzeme) + 2 eve özel şablon; üçü de veritabanı
doğrulayıcısından geçti. **Veri değildir**; içe aktarma A3-G2'de.
