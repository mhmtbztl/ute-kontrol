# phase95 — geçmiş temizlik aktarımı geri alınabilir (L-195, kullanıcı M25)

## Ne yapar

Geçmiş rezervasyonların temizlik görevi olmadığı için geçmiş aylarda temizlik
maliyeti 0 görünüyor ve kâr olduğundan yüksek çıkıyordu. Gider şablonu
"temizlik buraya girilmez" diyordu; başka yol yoktu.

Yeni **Geçmiş Temizlik** şablonu satırları temizlik defterinin tek kaynağına
(`cleaning_tasks`) "yapıldı" olarak yazar: ödendi ya da (Ödendi = HAYIR)
personel borcu. Gider tablosuna ikinci yol açılmadı; aynı maliyet iki yerde
durursa iki kez sayılır. Aynı mülkte aynı gün zaten temizlik görevi varsa satır
reddedilir; gelecek tarih ve kapanmış ay da reddedilir.

Bu göç yalnız aktarımı **geri alınabilir** yapar:

- `finance_import_batch_rows.cleaning_task_id` (FK, ON DELETE CASCADE);
  hedef kuralı "tam olarak biri dolu" (`num_nonnulls = 1`), tekil indeks.
- `undo_finance_import` temizliği de geri alır: kapanmış aya düşen kayıt varsa
  hiç başlamaz, aktarımdan sonra düzenlenen (ör. "Ödendi" işaretlenen) kayıt
  atlanır. İmza aynı; yanıt `deleted_cleaning_tasks` ekler. phase35/37
  kazanımları (tam eşitlik, yetki sırası, yazılı onay, anon kapısı) doğrulama
  bloğunda yeniden ölçülür.
- `schema_migrations` 95.

Göç yokken: rezervasyon ve gider aktarımı aynen çalışır; geçmiş temizlik
aktarımı **başlamaz** ve nedenini söyler (geri alınamayan yüzlerce kayıt
yazılmasın).

## Test projesinde

- Göçten önce `phase95_cleaning_import_undo_live_tests` kırmızı (4/7).
- `npm run test:bootstrap`: uygulandı (15.10.2026).
- `phase95_cleaning_import_undo_live_tests`: 10/10; `import_undo_live_tests`
  (phase35/37) 23/23.

## Üretime uygulama (kullanıcı)

1. Uygulamanın phase95'i bilen sürümü yayında olmalı (PR birleşmiş).
2. Supabase → SQL Editor → `supabase/migration_phase95_cleaning_import_undo.sql`
   dosyasının tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa
   işlem kendiliğinden geri alınır.
3. Bana "GÖÇ UYGULANDI" yazın; üretime salt okunur sorarak doğrularım:
   `production:readiness` ile `schema_migrations` 95 ve `undo_finance_import`
   anon kapısı (`401 42501`). İmza değişmediği için anon RPC cevabı phase37 ile
   aynıdır; asıl kanıt göçün kendi doğrulama bloğu ve `schema_migrations`'tır.
