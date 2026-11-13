# Mobil ölçüm ve ekran ekran iş listesi

Ölçüm aracı: `node scripts/mobile_audit.js` (fikstür `?ci-browser=1`, 390 ve 360 px,
sahip + saha rolü; `--tab`, `--width`, `--role`, `--no-modals`). Çıktı `tmp/mobile-audit/`
(her sekme için tam sayfa ve `-ilk.png` ilk ekran görüntüsü, `report.md`, `report.json`).
Belge düzeyinde yatay taşma (`browser_quality_gate`) her ekranda zaten 0'dı; asıl sorun
ilk ekranın başlıkla dolması, kendi kutusunda kayan tablolar ve küçük dokunma hedefleriydi.

## PR 1 — uygulama kabuğu (09.11.2026)

| | Önce | Sonra |
|---|---|---|
| Üst bar + menü (sabit, kaydırırken de ekranda) | 206 px; filtreli sayfada 345–378 px | 57 px; filtreli sayfada 105 px |
| Menü | yana kaydırılan şerit, 3 sekme görünür | alt çubuk: Bugün · Rezervasyon · Operasyon · Finans · Daha fazla |
| Dönem / mülk | açıklamasıyla her zaman açık kutu | tek düğme ("Kasım 2026 · Tüm Villalar"), dokununca açılır |
| Pencereler | 365 px ortalı kart, 2 sütun form sıkışır | alttan açılan sayfa, başlık üstte ve düğmeler altta sabit, tek sütun form |
| iOS yakınlaştırması yapan alan (<16 px) | 179 (pencerelerde 158 — mülk formu 37, rezervasyon 17 — sekmelerde 21) | 0 |
| Hızlı rezervasyon düğmesi | yazılı, içeriğin üstünü örtüyor | yuvarlak ＋, alt çubuğun üstünde |

Ağ: `core/mobile_shell_tests.js` (27 iddia; rol gizlemesi bozulunca D8/D9 kırılır),
tarayıcı kapısı 34 (üst bar ≤72 px, alt çubuk, Daha fazla, dönem düğmesi) ve saha rolünde
çubuk yok.

## Sıradaki ekranlar (390 px, PR 1 sonrası)

`boy` = sayfa boyu / ekran boyu, `kayan` = kendi kutusunda yana kayan alan, `küçük` = 36 px altı dokunma hedefi.

| Ekran | boy | kayan | küçük | Yapılacak |
|---|---|---|---|---|
| Bugün | 2,9 | 0 | 0 | **PR 2 tamam (14.11.2026):** performans kartları kısa 2'li ızgara, boş komuta grubu tek satırlık not, kurulum adımları ≥36 px (önce boy 3,2, küçük 3); tarayıcı kapısı 35 |
| Rezervasyonlar | 2,0 | 1 | 0 | **PR 3 tamam (14.11.2026):** liste kart modunda sığar (780 px tablo tabanı kalktı), dönem kartı Önceki · aralık · Sonraki tek satır, takvimin mülk sütunu 112 px; takvim bilerek yana kayar. Kapı 36 |
| Operasyon | 2,5 | 1 | 4 | Alt sayfa geçişi (Temizlik / Arıza / …) 462 px kayıyor |
| Misafirler ve Satış | 4,1 | 1 | 4 | Kanban 1180 px; telefonda aşama seçici + tek sütun |
| Fiyatlandırma | 4,3 | 1 | 22 | Ay sekmeleri 1542 px kayıyor; küçük gün hücreleri |
| Finans | 4,8 | 4 | 13 | Dört tablo (780–1038 px) kart moduna; sayfa içi ikinci dönem seçici |
| Analiz | 5,1 | 2 | 28 | Kanal ve mülk tabloları; küçük çipler |
| Kanallar ve Pazarlama | 1,9 | 1 | 0 | Kanal tablosu 812 px |
| Ayarlar | 1,0 | 1 | 1 | Ayar menüsü 1212 px kapsül satırı |
| Mülkler | 1,9 | 0 | 10 | Küçük dokunma hedefleri |
| Saha (personel) | 1,0 | 0 | 0 | — |

Kalıp: tablo kart moduna `td[data-label]` + `td::before` ile döner (`.reservation-list-table`,
style.css); yeni ekranda aynısı kullanılır. Telefon kuralı yalnız style.css sonundaki
"MOBIL KATMAN" bölümüne, tek kırılım 640 px ile yazılır.
