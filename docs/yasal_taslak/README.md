# Yasal metin taslakları — hukuki onay bekliyor (L-157)

**Bu klasördeki metinler TASLAKTIR ve yayımlanmaz.** `docs/` lexbnb.space'te
yayınlanmaz (L-19). Hukukçu onayından sonra metinler `yasal/kvkk.html`,
`yasal/gizlilik.html` ve `yasal/kullanim-sartlari.html` sayfalarına taşınır ve
`app.js` içindeki `LEGAL_TEXT_VERSION` değiştirilir (`iskelet-2026-10-03` →
onaylı sürüm). Kayıt formu onayı bu sürümle kaydeder.

Taslaklar, ürünün **gerçekte işlediği** veriye göre yazıldı: tablo ve sütunlar
şemadan (`supabase/schema.sql` + göçler), alt işleyiciler kaynaktaki bağlantı
adreslerinden çıkarıldı. Uydurma bilgi yazılmadı; bilinmeyen her bilgi
`[KÖŞELİ PARANTEZ]` içinde boş bırakıldı.

| Dosya | Hedef sayfa |
|---|---|
| `kvkk_aydinlatma.md` | `yasal/kvkk.html` |
| `gizlilik_politikasi.md` | `yasal/gizlilik.html` |
| `kullanim_sartlari.md` | `yasal/kullanim-sartlari.html` |
| `veri_isleme_eki.md` | Kullanım şartlarının eki (işletme = veri sorumlusu, Lexbnb = veri işleyen) |

## Hukukçunun karar vermesi gereken noktalar

1. **Roller.** Taslak iki ayrı rol varsayar: işletme kullanıcılarının hesap
   verisi için Lexbnb **veri sorumlusu**; işletmenin girdiği misafir, talep ve
   personel verisi için işletme **veri sorumlusu**, Lexbnb **veri işleyen**.
   Doğru mu?
2. **Yurt dışına aktarım (KVKK md. 9).** Barındırma ve e-posta yurt dışı
   hizmet sağlayıcılarda. 2024 değişikliğiyle gelen aktarım araçlarından hangisi
   (standart sözleşme, bildirim) kullanılacak?
3. **Misafir kara listesi** (`guest_private_classifications`: liste türü,
   gerekçe, olay tarihi). İşletmeler arası paylaşılmaz, yalnız o işletmede
   durur. Hukuki dayanak ve saklama süresi?
4. **Doğum tarihi** (`guests.birth_date`) toplanıyor. Gerekli mi, dayanağı ne?
5. **Ticari elektronik ileti (6563).** Pazarlama mesajı yalnız
   `marketing_opt_in` açık misafire gider ve izin geçmişi tutulur
   (`guest_consent_events`). İYS kaydı işletmenin mi yükümlülüğü?
6. **Saklama süreleri.** Kodda sabit bir süre yok; kayıtlar işletme silene,
   sıfırlayana ya da hesabı kapatana kadar durur. Önerilen süreler?
7. **Yedekler.** Haftalık yedek işletmecinin bilgisayarında tutulur
   (`npm run backup`, depo dışı). Konum, şifreleme ve süre belirtilmeli.
8. **Sorumluluk sınırı, ücret, fesih, uyuşmazlık** maddeleri tamamen ticari
   karardır; taslakta boş bırakıldı.

## Doldurulacak bilgiler

| Alan | Kaynak |
|---|---|
| Şirket unvanı, adresi, MERSİS, vergi no | Şirket kayıtları |
| KVKK başvuru adresi / e-posta, KEP | Şirket |
| VERBİS kaydı (gerekiyorsa) | Hukukçu |
| Supabase proje bölgesi | Supabase paneli → Project Settings → General (`kirpcqklyjlrhvdbgdrq`) |
| Yedeklerin saklandığı yer ve süre | İşletmeci |

## Ürünün gerçekte kullandığı hizmetler (kaynaktan)

| Hizmet | Ne için | Kaynak |
|---|---|---|
| Supabase (PostgreSQL, Auth, Storage, Edge Functions) | Bütün uygulama verisi, giriş, fotoğraflar, davet e-postası tetikleme | `app.js` `SUPABASE_URL`, `supabase/` |
| Resend | Hesap, şifre sıfırlama ve davet e-postaları (`noreply@lexbnb.space`) | CLAUDE.md §2 |
| Cloudflare | Alan adı önünde ağ geçidi ve güvenlik başlıkları; Turnstile (bot doğrulama); Web Analytics | `index.html` CSP: `challenges.cloudflare.com`, `static.cloudflareinsights.com` |
| GitHub Pages | Uygulama dosyalarının barındırılması (kişisel veri tutmaz) | CLAUDE.md §1 |
| Google Fonts | Yazı tipi dosyaları (tarayıcı Google'a istek atar) | `index.html` |
| Hostinger | Alan adı kaydı | CLAUDE.md §2 |

Uygulama WhatsApp, Airbnb ya da benzeri bir servise **veri göndermez**:
"WhatsApp'ta aç" yalnız kullanıcının kendi cihazında bir `wa.me` bağlantısı
açar (L-290); OTA senkronizasyonu yoktur (CLAUDE.md §6).
