# LEXBNB — EXECUTIVE CONTROL CENTER & STR REVENUE ENGINE

Lexbnb, lüks kısa dönem kiralama (STR) ve villa portföy işletmeleri için geliştirilmiş uçtan uca operasyon, gelir yönetimi ve yönetici karar kokpitidir.

Canlı Web Sürümü: [https://lexbnb.space](https://lexbnb.space)

---

### 📂 Proje Mimarisi

* **`app.js` & `index.html`**: Modern SaaS yönetici kokpiti, dinamik gelir yönetimi ve rezervasyon simülatörü.
* **`core/`**:
  * `engine.js`: USALI standartlarında gece bölme, ADR, RevPAR, Lead CRM, Gap Night ve Today Radar motoru.
  * `pricing_engine.js`: Deterministik ve kural tabanlı dinamik fiyatlama ve gelir optimizasyon motoru.
  * `executive_dashboard_service.js`: CEO / Executive kontrol merkezi snapshot servisi.
  * `notification_service.js`: Kritik operasyonel ve finansal bildirim merkezi.
  * `run_all_tests.js`: 43 test suite'lik kapsamlı master regresyon test koşucusu.
* **`web/`**: GitHub Pages / CDN canlı dağıtım dizini.
* **`supabase/`**: PostgreSQL / Supabase multi-tenant veri modeli, RLS politikaları ve trigger fonksiyonları.

---

### 🏆 Örnek Demo Portföyü (Akdeniz & Ege Lüks Villa Koleksiyonu)

| Villa | Konum | Kapasite | Taban Fiyat | Baz Fiyat | Hedef Fiyat | Premium | Öne Çıkan Özellikler |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Villa Bella Vista** | Kaş | 6+2 Kişi | ₺4.500 | ₺6.000 | ₺8.500 | ₺12.000 | Isıtmalı Sonsuzluk Havuzu, Meis Manzarası, Teras Jakuzisi |
| **Villa Olive Garden** | Bodrum | 8 Kişi | ₺6.000 | ₺8.500 | ₺12.000 | ₺17.000 | 1000m² Zeytinlik, Özel Havuz, Açık Şömine, Taş Mimari |
| **Villa Sunset Horizon** | Kalkan | 4 Kişi | ₺3.500 | ₺5.000 | ₺7.000 | ₺10.000 | Panoramik Körfez Manzarası, Teras Jakuzisi, Korunaklı Havuz |
| **Villa Azure Bay** | Göcek | 10 Kişi | ₺8.000 | ₺11.000 | ₺16.000 | ₺22.500 | Özel İskele, Tekne Bağlama Alanı, Özel Hamam, Sauna |
| **Villa Palm Breeze** | Alaçatı | 6 Kişi | ₺5.000 | ₺7.000 | ₺10.000 | ₺14.500 | Otantik Alaçatı Taş Ev, Isıtmalı Havuz, Korunaklı İç Avlu |

---

### 🚀 Testleri Çalıştırma

Tüm modülleri ve regresyon testlerini çalıştırmak için:
```bash
node run_all_tests.js
```
