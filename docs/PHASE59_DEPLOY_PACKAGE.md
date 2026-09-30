# phase59 (+ phase65, phase67) — uygulama ve doğrulama paketi

> **SQL Editor'e yapıştırılacak dosyalar bu `.md` DEĞİLDİR.** Sırasıyla, her biri ayrı sorguda:
> 1. `supabase/migration_phase59_property_lead_guest_context.sql`
> 2. `supabase/migration_phase65_phase59_link_guard_fix.sql`
> 3. `supabase/migration_phase67_system_source_restore_exemption.sql`
>
> Ön koşul: **phase53 uygulanmış olmalı** (dosya denetler). Üçü **birlikte** uygulanır:
> phase59 tek başına kalırsa hızlı kayıt çalışmaz (phase65) ve yedekten geri
> yükleme yarıda kalır (phase67).

## Ne yapar

| Konu | Veri |
|---|---|
| Konum: köy/mahalle, koordinat, araştırma yarıçapı (km) | `property_analysis_context` (phase40 yan tablosu) + `save_property_location` |
| Mülk sahibi (ad + iletişim; gelir paylaşımı yok) | `property_owners`, `property_owner_links` |
| "Nereden geldi" — zorunlu, işletme kendi kaynağını ekler | `lead_source_catalog` (her işletmede silinemez **"Bilinmiyor"**), `lead_acquisition` |
| Talep takip tarihi ve ekip ataması | `lead_workflow` |
| Telefon anahtar, 10 saniyelik hızlı kayıt | `fn_normalize_phone` + indeks, `quick_capture_lead` |
| Yalnız fiyat soranlar için günlük ilgi sayacı (kişisel veri yok) | `lead_interest_daily`, `bump_lead_interest` |
| Misafir doğum günü | `guests.birth_date` |
| Kara / beyaz liste (olgusal gerekçe, **yalnız yönetim**) | `guest_private_classifications` |

- **Hızlı kayıt:** aynı telefon (0532…, +90 532…, 5321… hepsi aynı) **açık** bir
  talebi varsa yeni talep açılmaz, mevcut talebe tarihli bir satır eklenir.
  Kapanmış (kazanıldı/kaybedildi) talebin sahibi yeniden yazarsa yeni talep
  açılır ve **tekrar gelen** olarak işaretlenir. Aynı anda iki kayıt tek talep
  açar. "Nereden geldi" seçilmeden kayıt olmaz.
- **Eski talepler `channel`'dan tahmin edilmez** (iletişim kanalı ≠ edinme
  kaynağı): kaynak satırı yoksa bilinmiyordur.
- **Kara/beyaz liste** KVKK kişisel verisidir: sahip/yönetici/operasyon
  okur-yazar; izleyici, satış ve personel görmez; başka işletmeyle asla. Hızlı
  kayıttaki uyarı da yalnız yönetim rolüne döner.
- `leads` ve `properties` tablolarına **sütun eklenmedi** (dağıtım tuzağı);
  yeni alanlar yan tablolarda. Eski istemci göçten önce ve sonra çalışır.
- **Sıfırlama:** ilgi sayacı ve mülk sahipleri defterdir, silinir
  (`reset_tenant_data` gövdesi phase43 ile aynı, yalnız iki tablo eklendi);
  talep ve misafir yan tabloları birlikte gider; kaynak kataloğu (ayar) kalır.

**Neden üç dosya:** phase59'un kiracı eşitliği tetikleyicisi PL/pgSQL'in `AND`'i
kısa devre yapmadığı bir kalıpla yazılmıştı; hızlı kayıt hiç çalışmıyordu
(phase65). "Bilinmiyor" kilidi yedekten geri yüklemeyi de engelliyordu
(phase67: kilit kullanıcı için durur, `service_role` bakımı için değil). İkisini
de test projesindeki canlı süitler yakaladı; phase59 orada uygulanmış olduğu için
değiştirilmedi.

## Uygulama

Üç dosyayı sırayla SQL Editor'de çalıştırın. Her biri tek transaction'dır ve
kendi doğrulama bloğuyla biter; hata çıkarsa o dosya hiçbir şey değiştirmemiştir.

## Doğrulama (üretime kayıt bırakmaz)

```
GET  /rest/v1/lead_workflow?select=lead_id&limit=0   ÖNCE 404 PGRST205 → SONRA 401 42501
POST /rest/v1/rpc/quick_capture_lead                  ÖNCE 404 PGRST202 → SONRA 401 42501
```
ve `npm run production:readiness` → `schema_migrations` içinde `59`, `65`, `67`.

## Test projesi

- `phase59_context_live_tests` **43/43** (göçten önce kırmızı; phase65 öncesi D1 kırmızı).
- `backup_restore_live_tests` 11/11 (phase67 öncesi 3 kırmızı).
- `phase59_context_tests` (çevrimdışı) 14/14 — tüm göçlerdeki son fonksiyon
  gövdelerini kısa devre anti-desenine karşı tarar; phase65 öncesi gövdeyi yakaladığı ölçülür.
