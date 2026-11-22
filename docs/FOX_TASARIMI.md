# Fox Tasarımı

Lexbnb'nin renk standardı. Kullanıcı kararı, 22.11.2026: "Finans ekranı çok renksiz olmuş, attığım
örnekteki gibi renklendir. Bu renkleri standart haline getirelim, daha canlı ve güzel duruyor. Buna
Fox tasarımı ismi verelim."

Fox, **Lex Tasarımı'nın üstüne gelen renk katmanıdır**; onun yerine geçmez. Lex'in düzen kuralları aynen
kalır: 3 sütunlu tablo, kısa özet cümlesi, ekranda sabit değer yok, uydurma rakam yok, iki yazı
kalınlığı (400/500), gölge yok. Fox yalnız şunu ekler: **her rakam anlamının rengini taşır.**

## 1. İlke

1. **Renk anlam taşır, süs değildir.** Bir kartın rengi o rakamın ne olduğunu söyler: gelir mavi,
   ek gelir yeşil, gider kırmızı, yatırım turuncu, kâr yeşil. Aynı anlam her ekranda aynı renktir.
2. **Renk kenarda ve zeminde durur, yazıda değil.** Kartın üst kenarında 3 px renk çizgisi ve çok açık
   aynı renk zemin. Rakam koyu yazılır, okunurluk renge bağlı kalmaz.
3. **Bir ekranda en fazla 5 anlam rengi.** Daha fazlası Fox değil, gürültüdür.
4. **Renk tek başına bilgi değildir.** Her renkli kartın bir etiketi vardır ("Ciro", "Gider"); renk
   körü kullanıcı etiketten okur. Artış/azalış oku (▲ ▼) her zaman yazılır.
5. **Minimallik bozulmaz.** Fox kart sayısını artırmaz; mevcut rakama renk verir.

## 2. Anlam renkleri

| Anlam | Ad | Kenar (gündüz) | Zemin (gündüz) | Kenar (gece) | Zemin (gece) | Nerede |
|---|---|---|---|---|---|---|
| Gelir / ciro | `fox-revenue` | `#1F6FEB` | `#EEF4FE` | `#58A6FF` | `#14263F` | Ciro, konaklama cirosu, ADR, RevPAR |
| Ek gelir / olumlu | `fox-income` | `#1A7F37` | `#EEF8F0` | `#3FB950` | `#13301C` | Temizlik geliri, diğer gelir, kâr, hedefte |
| Gider | `fox-expense` | `#CF222E` | `#FDEEEF` | `#F85149` | `#3A1618` | OPEX, komisyon, temizlik maliyeti, acil |
| Yatırım / uyarı | `fox-capex` | `#BC4C00` | `#FFF3E8` | `#F0883E` | `#3A2312` | CAPEX, eşik aşımı, bekleyen |
| Bilgi / tarafsız | `fox-info` | `#6E40C9` | `#F4F0FC` | `#A371F7` | `#2A1F45` | Doluluk, gece, rezervasyon sayısı, hedef |
| Nötr | `fox-neutral` | `#D3D1C7` | `#FFFFFF` | `#5F5E5A` | `#2C2C2A` | Ölçülemeyen ("—"), boş durum |

Rakam yazısı her zaman `--lx-text` (gündüz `#2C2C2A`, gece `#F1EFE8`). Kontrast: zemin ile yazı
arasında en az 4,5:1 (gündüz ve gece ölçüldü, tablodaki değerler bu sınırı geçer).

Değişim rozetleri:
- Olumlu (iyi yön): `fox-income` yazı, `▲`/`▼` hangisi iyiyse o.
- Olumsuz: `fox-expense` yazı.
- Kıyas yoksa rozet yok (0 yazılmaz, §3.6).

Gider için "artış kötüdür": giderin ▲ rozeti kırmızıdır. İyi yön bilgisi metriğin tanımından gelir
(`ads_metric_glossary.js` deseni), ekran kendisi karar vermez.

## 3. Bileşenler

### Fox kartı (`.fox-card`)
```
┌───────────────────────────┐  ← 3 px üst kenar: anlam rengi
│ Ciro (net konaklama)   ⓘ  │  ← 13 px etiket, --lx-text-2
│ 86.000 TL                 │  ← 26 px, 500 kalınlık, --lx-text
│ Hedef 120.000 TL · %72    │  ← 12 px alt satır
│ ▲ %20 geçen aya göre      │  ← rozet (varsa)
└───────────────────────────┘  ← zemin: anlam renginin açık tonu, 12 px köşe, gölge yok
```
- Tıklanabilir kart (alt sayfa açan) sağ altta `›` taşır ve üzerine gelince kenar 1 px koyulaşır.
- Kart ızgarası masaüstünde 4, telefonda 2 sütun.

### Fox köprüsü (`.fox-bridge`) — kâr köprüsü
Konaklama cirosu (mavi) → + Temizlik geliri (yeşil) → = Toplam gelir (mavi) → − OPEX (kırmızı)
→ − CAPEX (turuncu) → = Net kâr (yeşil, kâr negatifse kırmızı). Her adım bir Fox kartı; aradaki
işaret (+ − =) 18 px gri. Temizlik geliri 0 ise o iki adım görünmez (§3.4).

### Fox grafiği
Analiz ekranındaki grafik dili (`analytics.css` `ba-*`) aynen kullanılır; seri renkleri anlam
renkleridir (ciro çizgisi `fox-revenue`, gider çubuğu `fox-expense`). Halka grafikte en fazla 3 renk
+ "Diğer" (renk körlüğü kuralı, Analiz ile aynı).

### Alt sayfa (`.fox-subpage`)
Bir rakama tıklayınca ekranın içinde açılan sayfa (Notion sayfası gibi): üstte `← Geri` ve başlık,
altında o rakamın kayıtları (liste), en altta `+ Gelir ekle` / `+ Gider ekle`. Sayfa kendi rengini
başlığın altındaki 3 px çizgide taşır.

## 4. Kullanım kuralları

- Yeni bir ekrana renk eklerken önce bu tablodan anlamını seçin; yeni renk icat etmeyin.
- Rengi CSS değişkeninden alın (`var(--fox-revenue)`, `var(--fox-revenue-bg)`); sabit hex yazmayın.
  Gece/Gündüz değişimi değişkenle olur (`core/theme.js`).
- Kullanıcının seçtiği renk (mülk rengi) Fox değildir; `data-lx-literal-color` ile olduğu gibi kalır.
- Fox kartı Lex tablosunun yerine geçmez: karar listesi (iş, talimat) yine 3 sütun Lex tablosudur.
  Fox, **özet rakamlar** ve **grafik** içindir.
- Ölçülemeyen rakam (`null`) nötr kartta "—" ve nedeniyle yazılır; anlam rengi almaz.

## 5. Uygulama sırası

1. Finans (örnek ekran): özet kartları, kâr köprüsü, gelir/gider alt sayfaları.
2. Pazarlama: reklam ve Airbnb özet kartları + Analiz dilinde küçük grafikler.
3. Bugün performans, Rezervasyonlar özet satırı, Analiz KPI kartları.
4. Diğer ekranlar ihtiyaç oldukça.

Ağı: `lex_ui_tests` (değişkenler iki temada tanımlı, ekranda sabit Fox hex yok).
