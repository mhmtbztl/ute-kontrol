# G9 Açık İşler — Yetenek Haritası

Durum: Kullanıcı tarafından kapsam ve sıra onaylandı (2026-10-16).

Bu harita, `HATALAR.md` içindeki açık G9 maddelerini birbirinden bağımsız,
teslim edilebilir dikey dilimlere ayırır. Bir dilim tamamlanmadan sonraki
dilime geçilmez.

## CAP-G9-01 — Zengin operasyon kontrol listeleri (L-207 / M36)

Durum: Kod ve test-projesi doğrulaması tamamlandı; phase96 üretim uygulaması
ayrı açık onay bekliyor.

Amaç: Operasyon sorumlularının görsel bir düzenleyiciyle bölümlü ve alt
kontrollü şablonlar hazırlaması; temizleyici/personelin kendisine atanmış
listeyi mobil ekranda uygulaması; misafir gelmeden önce son kontrolün ayrı bir
operasyon görevi olarak tamamlanması.

İlk dilim:

- `CLEANING` ve `CHECKIN_PREP` şablonları
- portföy geneli veya mülk kapsamı
- bölüm, madde, alt kontrol ve önemli işareti
- temizlik şablonlarında sarf/malzeme satırları
- atanmış temizleyici/personel tarafından işaretleme ve kaydetme
- mevcut Z imza / M yönetici kontrolü akışının korunması
- eski dizi biçimli kontrol listeleriyle geriye uyumluluk

İlk dilim dışında:

- JPG/görselden kontrol listesi üretme
- Excel içe aktarma
- ChatGPT veya başka bir yapay zekâ ile otomatik şablon üretme

## CAP-G9-02 — Ayrıntılı yetki matrisi (L-211 / M40)

Amaç: Rol adından türetilen kaba erişim yerine, özellik ve işlem bazında
sunucu tarafından uygulanan izinlerin yönetilebilmesi ve denetlenebilmesi.

Bağımlılık: CAP-G9-01 tamamlandıktan sonra kontrol listesi oluşturma,
atama, uygulama ve onaylama izinleri matrise taşınır.

## CAP-G9-03 — Uygulama geneli arayüz tasarım programı (L-205 / M34)

Amaç: Bilgi mimarisi, görsel dil, erişilebilirlik, mobil davranış ve ortak
bileşenleri uygulama genelinde tutarlı hâle getirmek.

Bağımlılık: CAP-G9-01 ve CAP-G9-02 ile ortaya çıkan gerçek iş akışları önce
doğrulanır; tasarım programı bunları ortak bir sisteme dönüştürür.

## Teslim sırası

1. CAP-G9-01 — Zengin operasyon kontrol listeleri
2. CAP-G9-02 — Ayrıntılı yetki matrisi
3. CAP-G9-03 — Uygulama geneli arayüz tasarım programı
