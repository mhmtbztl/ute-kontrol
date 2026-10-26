# phase105 — KVKK misafir silme + Görev 9 canlı inceleme takipleri (26.10.2026)

## Ne yapar

1. **KVKK silme hakkı (L-271, kullanıcı kararı 26.10.2026: "her şeyi temizlemeli").**
   `erase_guest_personal_data(p_tenant_id, p_guest_id, p_confirm)` tek işlemde:
   - misafir kartı **silinir** (izin olayları, özel sınıflama ve iç notlar onunla gider);
   - misafire bağlı ve aynı telefonlu rezervasyonlar ile aynı telefon/e-postalı
     talepler muhasebe/vergi kaydı oldukları için silinmez, **anonimleşir**:
     ad "Silinmiş misafir", telefon/e-posta/not boş, misafir bağlantısı kalkar;
     tutar, tarih, gece, mülk, durum **değişmez** (raporlar ve kapanışlar aynı kalır);
   - misafire ait zamanlanmış ve gönderilmiş mesajlar (alıcı, metin) **silinir**;
   - o rezervasyon ve taleplere ait bildirimler **silinir**;
   - bağlı temizlik, gider, arıza, görev ve finans hareketi metinlerinde misafir adı
     maskelenir, ödeme notu boşalır.
   Kapalı dönem korumaları yalnız bu işlem içinde ve yalnız kişisel alanlar için
   sıfırlamanın bayrağıyla askıya alınır, işlem bitmeden kapatılır.
   Kim, ne zaman, kaç kayıt işledi `guest_erasure_log`'a **kişisel veri olmadan**
   yazılır (hesap verebilirlik). Yetki: `owner/admin/manager` (`can_manage_tenant`),
   onay metni `MISAFIRI SIL`; satış, yabancı işletme ve anon `42501`.
2. **Bilinmeyen değer 0 değil (L-292):** `leads.quote_amount` ve
   `maintenance_tickets.estimated_cost/actual_cost` varsayılanı kalkar; teklifi 0
   olan eski talepler boş yapılır.
3. **Kişi sayısı (L-273):** pax yazılınca `guest_count`/`adults` eşitlenir (yalnız
   yeni yazma; eski satırlara dokunulmaz).
4. **Hızlı talep notu (L-286):** "4 kisi" → "4 kişi" (fonksiyon gövdesinde yalnız bu metin).
5. **Fiyat kuralı (L-309):** −%100 reddedilir (NOT VALID: eski satır kalır).
6. **Huni snapshot'ı silme (L-281):** yönetim silebilir; bir değişiklik ölçümünde
   kullanılan snapshot RESTRICT ile korunur.

## Göç yokken istemci

GitHub Pages kodu göçten önce yayına alır. Göç uygulanana kadar:
- misafir kartındaki "Kalıcı sil (KVKK)" → "phase105 henüz uygulanmadı. Hiçbir şey silinmedi.";
- snapshot "Sil" → "phase105 henüz uygulanmadı ya da yetki yok" (RLS satırı süzer, hiçbir şey silinmez);
- diğer maddeler (2–5) istemcide zaten karşılanır; göç veritabanı tarafını tamamlar.

## Test projesinde

- `npm run test:bootstrap`: uygulandı (26.10.2026), doğrulama bloğu geçti.
- `phase105_guest_erasure_live_tests`: 24/24 — yetki (satış/yabancı/anon/onay
  metni), silme ve anonimleştirme (kapalı aydaki rezervasyon dahil), tutarın
  korunması, başka misafire dokunulmaması, günlükte kişisel veri olmaması,
  bayrağın kapanması, G9 takipleri. Göç öncesi kırmızı koşu ölçülmedi
  (fonksiyon ve politika göçle doğduğu için tanım gereği yoktu).

## Üretime uygulama (kullanıcı)

1. Uygulamanın bu sürümü yayında olmalı (PR birleşmiş).
2. Supabase → SQL Editor → `supabase/migration_phase105_guest_erasure_and_g9_followups.sql`
   dosyasının tamamını yapıştırıp çalıştırın. Doğrulama bloğu başarısızsa işlem
   kendiliğinden geri alınır.
3. Bana "GÖÇ UYGULANDI" yazın; salt okunur doğrularım: anon
   `rpc/erase_guest_personal_data` → `401 42501` (önce `404 PGRST202`),
   `production:readiness`, `schema_migrations` 105.

## Üretim durumu

Uygulanmadı (26.10.2026).
