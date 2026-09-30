# phase53 — uygulama ve doğrulama paketi

> **SQL Editor'e yapıştırılacak dosya bu `.md` DEĞİLDİR.** Yalnız şu dosyanın tamamı:
> `supabase/migration_phase53_staff_data_boundary.sql`

## Ne yapar

**L-107:** "Personel" (`staff`) rolü üye olduğu işletmenin rezervasyon, gider,
temizlik hakedişi, misafir ve talep defterlerinin tamamını okuyabiliyor; temizlik
görevinin tutarını ve "ödendi" durumunu doğrudan değiştirebiliyordu. Arayüzde
gizlemek koruma değildir; kural veritabanında durur.

Kullanıcı kararı (30.09.2026):

| Rol | Görür | Yazar |
|---|---|---|
| Sahip / Yönetici / Operasyon (`owner/admin/manager`) | her şey | her şey (silme dahil) |
| **Satış (`sales`) — yeni** | rezervasyon, talep, misafir, mülk, takvim, fiyat basamakları | rezervasyon, talep, misafir, teklif, misafir mesajı. **Silemez.** |
| Personel (`staff`) | **yalnız kendisine atanan** görev ve arıza | doğrudan tablo yazması yok (saha güncellemesi phase55'in dar RPC'leriyle) |
| İzleyici (`viewer`) | her şey (kara/beyaz liste hariç, phase59) | hiçbir şey |

Satış rolü **göremez:** giderler, temizlik maliyeti ve borcu, ay kapanışı,
hedefler, finans özeti (ana sayfa anlık görüntüsü), pazarlama defterleri,
işletme geneli bildirimler. Rezervasyon satırındaki tutar ve OTA komisyonu aynı
satırda durduğu için görünür (bilerek).

Rol kümeleri tek yerde: `can_manage_tenant`, `can_read_ledger`,
`can_read_sales`, `can_write_sales`. Politikalar ve RPC'ler rol dizisi yazmaz.

**Ek güvenlik düzeltmesi:** phase11'in `accept_booking_quote_atomic`
fonksiyonunda hiç yetki kontrolü, `save_manual_pricing_override_atomic`'te
kiracı kontrolü yoktu; yalnız phase44 tablo tetikleyicisi koruyordu (iki katlı
kuralın tek katı, CLAUDE.md §7). İkisine de gövde içi yetki eklendi.

Yeni tablo yok; `bookings`/`properties`'e sütun yok. 14 fonksiyon yeniden
tanımlanır — gövdeler güncel tanımla birebir, yalnız rol satırları değişir
(`phase53_staff_boundary_tests` A bölümü satır satır ölçer).

## Dağıtım kararı

Kullanıcı (30.09.2026): üretimde `staff` rolünde hesap **yok** → P53 A2 sonunda
hemen uygulanabilir; temizlikçi sayfasını (A3-G2) beklemesine gerek yok.
Uygulamadan önce SQL Editor'de salt okunur kontrol:

```sql
SELECT role, count(*) FROM public.tenant_members GROUP BY role ORDER BY role;
```

`staff` satırı çıkarsa **uygulamayın**, haber verin: o hesap rezervasyon ve
finans ekranlarında boş/yetkisiz görür (çökme yok, test projesinde ölçüldü).

**Arayüz etkisi (göç uygulanınca, arayüz değişmeden):** test projesinde başsız
Edge ile staff ve sales oturumu açıldı. Uygulama çökmüyor; ana sayfa finans
kartlarında "Sunucu anlık görüntüsü alınamadı; finansal KPI gösterilmiyor" ve
"—" yazıyor. Satış rolünün etiketi ve davet seçeneği arayüzde henüz yok —
Codex'e iletildi (`A2_CLAUDE_ISTEKLERI.md`). Rol davet edilmediği sürece kimse
etkilenmez.

## Uygulama

Ön koşul: phase44 ve phase45 üretimde (30.09.2026 `production:readiness`:
`schema_migrations` 44 ve 45 mevcut). Dosya bunu kendisi de denetler.

1. Supabase → SQL Editor → yeni sorgu.
2. `supabase/migration_phase53_staff_data_boundary.sql` dosyasının
   **tamamını** yapıştırın, **Run**.
3. "Success. No rows returned" normaldir. Kırmızı bir hata çıkarsa hiçbir şey
   değişmemiştir (tek transaction); mesajı iletin.

## Doğrulama (üretime kayıt bırakmaz)

1. **Anon kapısı** (§4.2) — yeni yardımcı fonksiyonun varlığı:
   ```
   POST /rest/v1/rpc/can_read_ledger  (anon anahtarı)
   ÖNCE : 404 PGRST202 Could not find the function
   SONRA: 401 42501  permission denied for function
   ```
2. **Defter:** `npm run production:readiness` → `schema_migrations` içinde `53`.
3. Göçün kendi doğrulama bloğu (`PHASE 53 OK`) politika, rol kısıtı, RPC
   gövdeleri ve anon yetkisini veritabanının içinde ölçer; hata verseydi işlem
   geri alınırdı.

## Test projesi

- `phase53_staff_boundary_live_tests` **47/47**; göçten önce **31 kırmızı**
  (D1/D2 dahil: teklif kabulünü yalnız tetikleyici durduruyordu). İki kez koşuldu.
- Etkilenen canlı süitler güncellendi: `phase41` 3g (staff artık zamanlanmış
  mesajı iptal edemez), `phase43` ve `phase49` (rezervasyon giren üye `sales`;
  phase49 1b artık kaçış dalına düşmeden gerçek yolu ölçüyor). phase31, phase51,
  import_undo, team_management, supabase_live_integration değişmeden yeşil.
- `phase53_staff_boundary_tests` (çevrimdışı) 34/34; bir gövde satırı bozulunca
  kırıldığı görüldü.
