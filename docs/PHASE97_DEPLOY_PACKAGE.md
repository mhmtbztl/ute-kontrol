# phase97 — gelir ve sermaye defteri (kullanıcı, 19.10.2026)

## Ne yapar

Finans ekranında gider eklenebiliyordu, gelir eklenemiyordu: rezervasyon
dışındaki para girişi (transfer ücreti, hasar bedeli, erken giriş) ve ortak /
sermaye girişi hiçbir yere yazılamıyordu.

Yeni `income_entries` tablosu iki tür taşır:

| Tür | Ne | Formülde |
|---|---|---|
| `OTHER_INCOME` | Diğer gelir | Toplam Gelir'e ve kâra girer; **ciroya girmez** (ADR/RevPAR, hedef değişmez) |
| `CAPITAL` | Sermaye / ortak girişi, nakit dengeleme | **Gelir değildir**: kâra girmez, ayrı "sermaye girişi" olarak görünür |

Kayıt, gider gibi bir mülke ya da Tüm Portföy'e yazılır; açıklama zorunludur.

- Yetki gider defteriyle aynı (§3.3.1): okuma `can_read_ledger`, yazma
  `can_manage_tenant`; `anon` erişemez; `tenant_id` değişmez; başka işletmenin
  mülkü kullanılamaz (`CROSS_TENANT_PROPERTY`).
- Kapanmış dönemde gelir eklenemez, değiştirilemez, silinemez (gider korumasıyla
  aynı kural, sıfırlama ve hesap silme istisnalı).
- `compute_month_close_snapshot`: `otherIncome`, `capitalIn`, `totalIncome`
  eklenir; `netProfit` diğer geliri içerir; `schemaVersion` 5. `revenue`
  rezervasyon geliri olarak kalır (kapanışta istemci karşılaştırması onu ölçer).
- `get_executive_dashboard_snapshot`: `total_revenue`, `operating_profit`,
  `net_profit` diğer geliri içerir; `other_income`, `capital_in` eklenir;
  `room_revenue` (ciro) değişmez.
- `reset_tenant_data` gelir defterini de boşaltır (phase78 gövdesi + bir satır).
- `schema_migrations` 97.

`bookings`/`expenses`'e sütun eklenmedi (§3.4 dağıtım sırası tuzağı). Göç yokken
Finans ekranı açılır; Gelirler kartı "phase97 henüz uygulanmadı" yazar, gelir
kaydı yapılmaz. Rezervasyon ve gider aynen çalışır.

## Test projesinde

- `npm run test:bootstrap`: uygulandı (19.10.2026), doğrulama bloğu geçti.
- `phase97_income_live_tests`: 26/26 (yetki, kiracı sınırı, aynı rakam, kapalı
  dönem, sıfırlama). Göç yokken tablo olmadığı için kırmızıdır.
- Yeniden tanımlanan fonksiyonların eski ağları: `phase45_cleaning_cost_live_tests`
  28/28, `executive_snapshot_tests` 24/24, `tenant_reset_tests` 15/15,
  `phase43_period_reset_live_tests` 25/25.

## Üretime uygulama (kullanıcı)

1. Uygulamanın phase97'yi bilen sürümü yayında olmalı (PR birleşmiş).
2. Supabase → SQL Editor → `supabase/migration_phase97_income_entries.sql`
   dosyasının tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa
   işlem kendiliğinden geri alınır.
3. Bana "GÖÇ UYGULANDI" yazın; üretime salt okunur sorarak doğrularım:
   anon `income_entries` sorgusu `401 42501` (öncesinde `404 PGRST205`) ve
   `production:readiness` ile `schema_migrations` 97.

## Üretim durumu

19.10.2026: kullanıcı SQL Editor'de uyguladı (başarılı). Salt okunur doğrulama:
anon `income_entries` sorgusu `401 42501 permission denied for table`;
`production:readiness` BAŞARILI, `schema_migrations` 97 mevcut.
