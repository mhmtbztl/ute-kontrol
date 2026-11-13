# phase119 — kullanılmayan defter tablolarının kaldırılması

**Dosya:** `supabase/migration_phase119_unused_ledgers_cleanup.sql`
(SQL Editor'e bu `.sql` dosyasının içeriği yapıştırılır, bu belge değil.)

## Ne yapar

Hiçbir ekranın, worker'ın ya da istemcinin çağırdığı RPC'nin okumadığı/yazmadığı
**20 tabloyu** ve yalnız onlara ait **14 fonksiyonu** kaldırır. 13.11.2026'da
üretimde satır sayısı salt okunur ölçüldü: hepsi **0**.

| Grup | Tablolar |
|---|---|
| phase11 eski fiyat motoru | pricing_profiles, pricing_rules, pricing_events, pricing_overrides, daily_rates, rate_change_logs, booking_quotes |
| phase10 mesaj otomasyonu | message_automation_rules, message_delivery_logs, scheduled_messages, extension_offers |
| diğer | financial_transactions, recurring_task_rules, operation_evidence, tenant_onboarding, property_media_versions, influencer_collabs, property_operator_notes, expense_templates, expense_template_occurrences |

`message_templates` (WhatsApp şablonları), `executive_alerts` ve
`listing_experiment_snapshots` **kalır**.

Canlı üç fonksiyon mevcut göçlerden birebir alınıp daraltılır:
`erase_guest_personal_data` (phase105; dönüş sözleşmesi aynı, `messages` 0),
`reset_tenant_data` (phase101; yalnız liste) ve `guard_phase78_links` (phase78).

## Güvenlik

- Tablolardan birinde **tek satır** bile varsa göç hiçbir şey silmeden durur:
  `PHASE119_TABLE_NOT_EMPTY`.
- `DROP ... RESTRICT`: beklenmeyen bir bağımlılık varsa göç durur, başka nesne
  sessizce silinmez.
- Doğrulama bloğu: tablolar yok, fonksiyonlar yok, hiçbir `public` fonksiyon
  gövdesi silinen tabloya dokunmuyor, anon iki canlı fonksiyonu çağıramıyor.

## Dağıtım sırası (önemli)

1. **Önce kod yayına girer** (PUSH → Pages). Yeni istemci bu tabloları okumaz;
   tablolar varken de yokken de çalışır.
2. Sonra göç SQL Editor'den uygulanır. Ters sıra: eski istemci
   `scheduled_messages` okurken tablo düşerse tüm veri yüklemesi düşer.

## Test projesinde ölçüldü (13.11.2026)

- `BEGIN … ROLLBACK` kuru çalıştırma: 91 → 71 tablo, `PHASE 119 OK`, geri alma sonrası 91.
- Veri koruması: işlem içinde `tenant_onboarding`'e satır eklenince göç
  `PHASE119_TABLE_NOT_EMPTY` ile durdu, iz kalmadı.
- `npm run test:bootstrap` ile uygulandı; etkilenen 12 canlı süit geçti
  (phase105 KVKK, phase41, phase43, phase53, phase31, operations_security,
  phase78, phase107, backup_restore, tenant_backup, tenant_reset, phase101).

## Üretimde doğrulama (uygulandıktan sonra, salt okunur)

- `schema_migrations` içinde `119 phase119_unused_ledgers_cleanup`.
- `GET /rest/v1/scheduled_messages?select=id&limit=0` → `404 PGRST205`
  (önce `401 42501` idi).
- `npm run production:readiness` BAŞARILI.
