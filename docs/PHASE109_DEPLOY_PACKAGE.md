# phase109 — anlık görüntülerde vergi düşümü geri geldi (27.10.2026)

## Ne yapar

phase92 (rezervasyon finansı) ay kapanışı (`compute_month_close_snapshot`) ve ana
sayfa (`get_executive_dashboard_snapshot`) raporlarında oda ve temizlik gelirini
rezervasyonun vergisinden (`financial_details.result.taxTotal / cleaningTax`)
arındırıyordu. **phase97 (19.10.2026, üretimde) iki fonksiyonu eski gövdeden
yeniden tanımladı ve bu düşümü sessizce sildi.** O günden beri vergi profili
kullanılan rezervasyonda sunucunun ay kapanışı ve ana sayfa cirosu vergiyi de
ciro sayıyor. Test projesinde ölçüldü: oda geliri 11.200 yerine 12.544
(`booking_finance_live_tests`).

phase109 phase92'nin yaptığını güncel gövdeye yeniden uygular; yalnız gelir
izdüşümü değişir. Yeniden koşulursa bir şey yapmaz.

**Etkisi:** vergi profili hiç kullanılmamışsa (rezervasyon formunda vergi kapalı)
rakamlar değişmez. Kullanılmışsa 19.10'dan beri kapatılan ayların kapanış
anlık görüntüsü vergiyi içerir; kapanış kaydı mühürlüdür ve bu göç onu
değiştirmez. Gerekirse ilgili ay `reopen_monthly_period_atomic` ile açılıp
yeniden kapatılır (sahip, gerekçeli).

**Tekrarı önleyen ağ:** `snapshot_tax_rule_tests` — bu iki fonksiyona dokunan son
göç vergi düşümünü taşımak zorunda (109 olmadan kırmızı).

## Test projesinde

`npm run test:bootstrap`: uygulandı. `booking_finance_live_tests` göçten önce
kırmızı ("12544 == 11200"), sonra 10/10.

## Üretime uygulama (kullanıcı)

1. SQL Editor → `supabase/migration_phase109_snapshot_tax_reapply.sql` tamamı.
2. "GÖÇ UYGULANDI" yazın; doğrulama: `schema_migrations` 109, `production:readiness`.
   Kanıt göçün kendi doğrulama bloğudur (gövdede `result,taxTotal`); dışarıdan
   imza aynı görünür.

## Üretim durumu

Uygulanmadı.
