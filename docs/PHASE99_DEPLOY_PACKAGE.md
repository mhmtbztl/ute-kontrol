# phase99 — kapanan temizlik personel ekranından düşer (kullanıcı M62, 19.10.2026)

## Ne yapar

Personelin "Bugünkü saha işlerim" ekranını besleyen `get_my_field_work`
(phase55) aralıktaki **bütün** icra satırlarını döndürüyordu:

- yönetici **M Onayla** dedikten sonra iş "Onaylandı" kartı olarak kalıyordu;
- yönetici işi doğrudan "yapıldı" ya da "gerek kalmadı" yapınca icra satırı
  `ASSIGNED` kalıyor, temizlikçi kapanmış işi "Açık" görüp imzalamaya
  çalışıyordu.

Artık yalnız açık iş döner: icra `INSPECTED` değil **ve** temizlik
`DONE`/`SKIPPED` değil. Satıra `task_status` eklenir. İmza, yetki kapısı
(`auth.uid()` + `is_tenant_member`), aralık sınırı ve dönen diğer alanlar
phase55 ile aynı; tablo değişmez. `anon` yetkisi geri alınır,
`schema_migrations` 99.

Göç yokken istemci onaylanan işi (`INSPECTED`) yine kendisi eler; doğrudan
kapatılan iş ise göç uygulanana kadar personelde görünmeye devam eder.

## Test projesinde

- `npm run test:bootstrap`: uygulandı (19.10.2026), doğrulama bloğu geçti.
- `phase55_operations_execution_live_tests`: 39/39 — yeni C8b (yeniden açılan
  iş notuyla ve `task_status` ile görünür) ve C9b (M onayından sonra listede
  yok).

## Üretime uygulama (kullanıcı)

1. Uygulamanın bu sürümü yayında olmalı (PR birleşmiş).
2. Supabase → SQL Editor → `supabase/migration_phase99_field_work_closed_cleanings.sql`
   dosyasının tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa
   işlem kendiliğinden geri alınır.
3. Bana "GÖÇ UYGULANDI" yazın; `production:readiness` ile `schema_migrations`
   99'u ve anon `rpc/get_my_field_work` → `401 42501` kapısını salt okunur
   doğrularım. İmza aynı olduğu için anon cevabı phase55 ile phase99'u ayırt
   etmez; kanıt `schema_migrations` 99 ve SQL Editor'deki `PHASE 99 OK`.

## Üretim durumu

19.10.2026: kullanıcı SQL Editor'de uyguladı (başarılı). Salt okunur doğrulama:
`production:readiness` BAŞARILI (kanonik RPC ve anon kapıları uyumlu),
`schema_migrations` 99 mevcut.
