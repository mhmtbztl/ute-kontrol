# Fox Tasarımı — Lexbnb renk standardı

*Sürüm: 25 Kasım 2026 (2) · Kaynak: `docs/FOX_TASARIMI.md` + uygulanmış ekranlar (PR #88, #90, #91 ve sonrası)*

Kullanıcı kararı (22.11.2026): "Finans ekranı çok renksiz olmuş, attığım örnekteki gibi renklendir.
Bu renkleri standart haline getirelim, daha canlı ve güzel duruyor. Buna Fox tasarımı ismi verelim."

Fox, **Lex Tasarımı'nın üstüne gelen renk katmanıdır**, Lex'in yerine geçmez. Lex'in düzen kuralları
aynen kalır: kısa özet cümlesi, sade yüzey, iki yazı kalınlığı (400/500), gölge yok, ekranda sabit
değer yok, uydurma rakam yok. Fox yalnız bir şey ekler: **her rakam, anlamının rengini taşır.**

---

## 1. Beş ilke

1. **Renk anlam taşır, süs değildir.** Gelir mavi, ek gelir ve kâr yeşil, gider kırmızı, yatırım
   turuncu, bilgi mor. Aynı anlam her ekranda aynı renktir.
2. **Renk kenarda ve zeminde durur, yazıda değil.** Kartın üstünde 3 px renk çizgisi, altında aynı
   rengin çok açık tonu. Rakam koyu yazılır; okunurluk renge bağlı değildir.
3. **Bir ekranda en fazla 5 anlam rengi.** Daha fazlası Fox değil, gürültüdür.
4. **Renk tek başına bilgi değildir.** Her renkli kartın etiketi vardır ("Ciro", "Gider"); renk körü
   kullanıcı etiketten okur. Artış/azalışta ▲ ▼ oku her zaman yazılır.
5. **Minimallik bozulmaz.** Fox kart sayısını artırmaz; var olan rakama renk verir.

---

## 2. Anlam renkleri

| Anlam | Değişken | Kenar (gündüz) | Zemin (gündüz) | Kenar (gece) | Zemin (gece) | Örnek |
|---|---|---|---|---|---|---|
| Gelir / ciro | `--fox-revenue` | `#1F6FEB` | `#EEF4FE` | `#58A6FF` | `#14263F` | Ciro, ADR, rezervasyon cirosu |
| Ek gelir / olumlu | `--fox-income` | `#1A7F37` | `#EEF8F0` | `#3FB950` | `#13301C` | Temizlik geliri, diğer gelir, net kâr, tahsilat, "kazanıldı" |
| Gider / olumsuz | `--fox-expense` | `#CF222E` | `#FDEEEF` | `#F85149` | `#3A1618` | OPEX, komisyon, kesintiler, zarar, "kaybedildi", geçmiş tarih |
| Yatırım / bekleyen | `--fox-capex` | `#BC4C00` | `#FFF3E8` | `#F0883E` | `#3A2312` | CAPEX, teklif/takip aşaması, bağlantısız kayıt |
| Bilgi / tarafsız | `--fox-info` | `#6E40C9` | `#F4F0FC` | `#A371F7` | `#2A1F45` | Doluluk, RevPAR, gece, rezervasyon sayısı, yeni talep |
| Nötr | `--fox-neutral` | `#D3D1C7` | `#FFFFFF` | `#5F5E5A` | `#2C2C2A` | Ölçülemeyen ("—"), boş durum |

- Rakam yazısı her zaman `--lx-text` (gündüz `#2C2C2A`, gece `#F1EFE8`). Zemin ile yazı arasında
  en az 4,5:1 kontrast (iki temada ölçüldü).
- Değişkenler `style.css` başındadır; gece/gündüz değişimi değişkenle olur (`core/theme.js`).

### Değişim rozetleri
- İyi yönde değişim yeşil (`fox-income`), kötü yönde kırmızı (`fox-expense`).
- "İyi yön" metriğin tanımından gelir: giderde ▲ kırmızıdır, ciroda ▲ yeşildir.
- Kıyas yoksa rozet yoktur; "0" yazılmaz.

---

## 3. Bileşenler

### 3.1 Fox kartı — `.fox-card .fox-card--<anlam>`
```
┌───────────────────────────┐  ← 3 px üst kenar: anlam rengi
│ Ciro                      │  ← 13 px etiket, ikincil yazı rengi
│ 86.000 TL                 │  ← büyük rakam, 500 kalınlık, koyu
│ Hedef 120.000 TL · %72    │  ← küçük alt satır
│ ▲ %20 geçen aya göre      │  ← rozet (varsa)
└───────────────────────────┘  ← açık zemin, 12 px köşe, ince kenar, gölge yok
```
- Tıklanabilir kart `.fox-card--link` alır; dokununca ilgili ekranı/alt sayfayı açar.
- Izgara: masaüstünde 4–5 sütun, telefonda 2 sütun (tek kalan son kart satırı doldurur).
- Ölçülemeyen rakam nötr kartta "—" ve nedeniyle yazılır; anlam rengi almaz.

### 3.2 Fox köprüsü — `.fox-bridge` (kâr köprüsü)
Konaklama cirosu (mavi) → + Temizlik geliri (yeşil) → = Toplam gelir (mavi) → − OPEX (kırmızı)
→ − CAPEX (turuncu) → = Net kâr (yeşil; negatifse kırmızı). Temizlik geliri 0 ise o iki adım görünmez.

### 3.3 Alt sayfa — `.fox-subpage`
Bir rakama ya da listeye dokununca ekranın içinde açılan sayfa: üstte `← Geri` ve başlık, altında
kayıtlar, **en altta** ekleme düğmesi (`.fox-add`, örn. "+ Gider ekle"). Başlığın altındaki 3 px çizgi
sayfanın anlam rengidir.

### 3.4 Pano (Trello gibi) — `LexUi.boardHtml` / `.lex-board`
Bugün → Yapılacaklar (24.11.2026, kullanıcı: "trello gibi yapabiliriz"):
- **Ekip = sütun.** Sütunun üst çizgisi ve zemini ekibin rengi: Satış mavi, Pazarlama mor,
  Operasyon turuncu, Temizlik yeşil, Finans nötr. Başlıkta iş sayısı.
- **İş = kart.** Sol kenardaki 4 px şerit talimat rengidir: **Acil** kırmızı, **Yap** mavi,
  **Tamam** yeşil. Üstte talimat etiketi + ne zaman (tarih geçtiyse kırmızı), ortada iş adı
  (dokununca iş açılır), altta tür ve kısa gerekçe (türle aynıysa tekrar yazılmaz).
- Telefonda sütunlar alt alta. PDF/Excel çıktısı tablo olarak kalır.
- Aynı pano **Operasyon → Temizlik**te ev ev kullanılır (25.11.2026): her ev bir sütun, her açık temizlik
  bir kart (durum, ne zaman, temizlikçi, ilerleme). Geciken temizliği olan evin sütunu kırmızı.

### 3.5 Metin renkleri
`.fox-text-revenue` (ciro rakamı), `.fox-text-expense` (indirim, vergi, komisyon gibi kesintiler).
Yalnız tablo içindeki tek rakamı vurgulamak için; paragraf metni renklendirilmez.

### 3.6 Grafik
Analiz ekranının grafik dili (`analytics.css`, `ba-*`) aynen kullanılır; seri renkleri anlam
renkleridir (ciro çizgisi mavi, gider çubuğu kırmızı). Halka grafikte en fazla 3 renk + "Diğer".

---

## 4. Şu an Fox uygulanan ekranlar

| Ekran | Ne renkli |
|---|---|
| **Bugün** | Üstte 5 performans kartı (Ciro mavi, Doluluk mor, ADR mavi, RevPAR mor, Net kâr yeşil/zararda kırmızı) → Finans'ı açar; tek "Hedef gir"; Yapılacaklar panosu (3.4) |
| **Finans** | Özet kartları, kâr köprüsü, gelir/gider/kategori alt sayfaları |
| **Rezervasyonlar** | 5 rakamlık özet (Rezervasyon, Satılan gece, Ciro mavi, Kalan yeşil, Tahsilat yeşil); satırda ciro mavi, kesintiler kırmızı |
| **Talepler** | Aşama sütunları: Yeni/Görüşüldü mor, Teklif/Takip turuncu, Kazanıldı yeşil, Kaybedildi kırmızı |
| **Misafirler** | 6 özet kartı; "Bağlantısız rez." turuncu ve tıklanabilir |
| **Pazarlama** | Özet şeridi + kampanyaya göre harcama çubukları |
| **Operasyon** | Temizlik ev ev pano (3.4) |
| **Mülkler** | Mülk kartı: açık zemin, yeşil üst çizgi, baz fiyat mavi |
| **Fiyatlandırma** | Ciro planı: her ev mavi kart (doluluk + fiyat → ciro), altta yeşil toplam kartı |

Sırada: ihtiyaç oldukça diğer ekranlar.

---

## 5. Kurallar (yeni ekran yaparken)

- Önce yukarıdaki tablodan **anlamı** seçin; yeni renk icat etmeyin.
- Rengi değişkenden alın (`var(--fox-revenue)`, `var(--fox-revenue-bg)`); **sabit hex yazmayın.**
- Kullanıcının seçtiği renk (mülk rengi) Fox değildir; `data-lx-literal-color` ile olduğu gibi kalır.
- Özet rakamlar → Fox kartı. Yapılacak işler → pano (Bugün) ya da Lex listesi. Uzun kayıt listesi
  → Lex tablosu (telefonda kart olur).
- Ölçülemeyen değer "—" + neden; nötr renk. Uydurma rakam yok.
- **Okunurluk (25.11.2026):** renkli (mavi/kırmızı) zemindeki yazı `var(--on-accent)` — iki temada beyaz.
  Yazı rengi olarak vurgu rengi (`--accent-emerald`) değil, okunur tonu (`--accent-emerald-text`, `--lx-keep-fg`)
  kullanılır. **Seçili** sekme/öğe koyu gri değil: açık zemin (`--lx-bg`) + ince kenar + koyu yazı. Koyu temadan
  kalma sabit hex (`#636366`, `#323234`, `#FFFFFF`) yazmayın; gündüzde okunmaz hâle gelir.
- Her rakamın tek evi vardır: başka ekran o rakamı kopyalamaz, ona bağlantı (`goTo`) verir.

**Testler:** `lex_ui_tests` (değişkenler iki temada tanımlı, sabit Fox hex yok), `a2_finance_ui`,
`browser_quality_gate` #25 (Bugün'de 5 Fox kartı, tek "Hedef gir") ve #35 (pano telefonda alt alta).
