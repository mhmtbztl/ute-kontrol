# phase93 — bildirim merkezine kaynak (L-192, kullanıcı M22)

## Ne yapar

`user_notifications` tablosunu okuyan ve "okundu" yazan kod vardı; satır
**üreten** kod yoktu, merkez her hesapta boştu. Bildirimler artık istemcide,
kullanıcının zaten okuyabildiği gerçek veriden türetilir
(`core/notification_feed.js`) ve `sync_my_notifications(p_tenant_id, p_events)`
ile **yalnız çağıranın kendi satırlarına** yazılır.

Olaylar (kullanıcı kararı 14.10.2026): ekibe katılan üye, M kontrolü bekleyen
temizlik, son 7 günün açık arızası, kapanmamış geçen ay, takip tarihi gelen
talep, 30 gün içindeki boşluk gecesi (kazanç fırsatı).

- Tablo değişmez, sütun eklenmez. Kişisel satırlar için tekil indeks
  `(tenant_id, user_id, event_key) WHERE user_id IS NOT NULL`.
- Listede olmayan kendi açık satırı `RESOLVED` olur (silinmez); olay geri
  gelirse yeniden `UNREAD`.
- Yetki kayıt aramadan önce: oturum + `is_tenant_member`. Başkasına bildirim
  yazılamaz, başkasının okundu durumu değişmez.
- Alan doğrulaması: olay anahtarı, alan, önem, bağlantı biçimi, uzunluk, en çok 100 olay.
- `anon` yetkisi yok, `schema_migrations` 93.
- Göç uygulanmadan önce de uygulama çalışır: liste gösterilir, çekmece
  "okundu durumu saklanamıyor" der.

## Test projesinde

- Göçten önce `phase93_notification_feed_live_tests` kırmızı (1/4).
- `npm run test:bootstrap`: uygulandı (14.10.2026).
- `phase93_notification_feed_live_tests`: 16/16.

## Üretime uygulama (kullanıcı)

1. Uygulamanın phase93'ü bilen sürümü yayında olmalı (PR birleşmiş).
2. Supabase → SQL Editor → `supabase/migration_phase93_notification_feed.sql`
   dosyasının tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa
   işlem kendiliğinden geri alınır. Ön kontrol, aynı kişiye aynı olay iki kez
   yazılmışsa (beklenmez; tabloya yazan kod yoktu) `PHASE93_DUPLICATE_...` ile durur.
3. Bana "GÖÇ UYGULANDI" yazın; üretime salt okunur sorarak doğrularım:
   anon ile `rpc/sync_my_notifications` → uygulanmamışsa `404 PGRST202`,
   uygulanmışsa `401 42501`; ayrıca `production:readiness` ve
   `schema_migrations` 93.
