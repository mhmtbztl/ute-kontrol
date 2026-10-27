# phase107 — kişi bazında izin matrisi (L-211, 27.10.2026)

## Ne yapar

Rol başlangıç paketidir; işletme sahibi her ekip üyesinin izinlerini ayrı ayrı
açıp kapatır (Ayarlar → Ekip → 🔐 İzinler). Kullanıcı kararı 27.10.2026:
satış + finans + operasyon.

| İzin | Rol varsayılanı | Sunucu fonksiyonu |
|---|---|---|
| Satış verisini görür (`sales.read`) | owner admin manager sales viewer | `can_read_sales` |
| Satış kaydı yapar (`sales.write`) | owner admin manager sales | `can_write_sales` |
| Finans defterini görür (`ledger.read`) | owner admin manager viewer | `can_read_ledger` |
| Finans kaydı yapar (`ledger.write`) | owner admin manager | `can_write_ledger` (yeni) |
| Operasyonu yönetir (`operations.manage`) | owner admin manager | `can_manage_operations` (yeni) |

- **Değişmeyenler:** sahibin kendi izinleri; yönetim (`can_manage_tenant`: mülk,
  ayar, ekip, pazarlama, fiyat kuralları); silme kararları (rezervasyon/talep/
  misafir), dönemi yeniden açma ve finans hareketi silme (owner/admin).
- **Yazma okumayı içerir.** Okuma kapatılırsa yazma da kapanır. Operasyon izni
  operasyon defterlerini okumayı da açar.
- **Rol değişince** kişiye özel izinler silinir; üye çıkarılınca izinleri gider.
- **Sunucu zorlar:** finans ve operasyon tablolarının 58 yazma/okuma politikası ve
  rolü kendi içinde listeyle denetleyen 16 fonksiyon (rezervasyon oluştur/güncelle,
  talepten dönüşüm, misafir bağlama, uzatma teklifi, fiyat koruması, ay kapanışı,
  aktarım geri alma, şablondan gider, rezervasyon ek giderleri, arıza çözme,
  temizlik atama, saha icrası) bu fonksiyonlara bağlandı. Gövdeler ve politikalar
  test projesinin kataloğundan birebir alınıp yalnız yetki ifadesi değiştirildi.
- `tenant_member_permissions` tablosu: yalnız varsayılandan farklı izinler satır
  olarak durur; yazma yalnız `set_member_permissions` (yalnız sahip), okuma kişi
  kendisi ya da yönetim. `tenants`'a doğrudan FK **yok**, bilerek: olsaydı
  PostgREST `tenant_members → tenants` gömmesini (giriş sorgusu) `PGRST201` ile
  düşürürdü — test projesinde yaşandı, doğrulama bloğu artık bunu yakalar.

## Göç yokken istemci

Kod göçten önce yayına girer. Göç uygulanana kadar `tenant_member_permissions`
okunamaz ve herkes rol varsayılanıyla çalışır (bugünkü davranış). İzinler
penceresinde kaydetmek "phase107 henüz uygulanmamış" der, hiçbir şey değişmez.
Rol davranışı göçten önce ve sonra aynıdır (varsayılan tablo phase53 ile birebir).

## Test projesinde

- `npm run test:bootstrap`: uygulandı, doğrulama bloğu geçti.
- `phase107_member_permissions_live_tests`: göçten önce 17 kırmızı; göçten sonra
  28/28 — varsayılanlar, yalnız sahip (yönetici, yabancı, anon reddedilir), sahibin
  izni sabit, finans okuma/yazma (ay kapanışı RPC'si dahil), yöneticiden geri alma,
  satış RPC'si, yazma↔okuma bağı, operasyon, satır görünürlüğü, doğrudan yazma
  yok, rol değişince silinme, **giriş sorgusu bozulmadı**.
- Tam canlı koşu (272 süit): rol/RLS süitleri yeşil.

## Üretime uygulama (kullanıcı)

1. Uygulamanın bu sürümü yayında olmalı (PR birleşmiş).
2. Supabase → SQL Editor → `supabase/migration_phase107_member_permissions.sql`
   tamamını çalıştırın. Doğrulama bloğu başarısızsa işlem kendiliğinden geri alınır.
3. Hemen ardından `phase109` (ayrı paket) — sıra önemli değil, ikisi bağımsız.
4. "GÖÇ UYGULANDI" yazın; salt okunur doğrularım: anon `rpc/set_member_permissions`
   → `401 42501` (önce `404 PGRST202`), anon `tenant_member_permissions` → `401 42501`,
   `production:readiness`, `schema_migrations` 107, oturumlu girişin çalıştığı.

## Üretim durumu

Uygulanmadı.
