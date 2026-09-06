# UTE KONTROL MERKEZİ V5 (ULUDAĞ TATİL EVLERİ)
## Executive Operations & Revenue Management System

Uludağ Tatil Evleri (Seyir, Doğuş, Zirve, Şirin, Nefes) için geliştirilmiş V5 Kontrol Merkezi; **"One Input → Many Outputs" (Tek Veri Girişi → Çoklu Çıktı)** prensibiyle çalışan bir işletme, gelir yönetimi ve karar kokpitidir.

---

### 📂 Proje Dizin Yapısı

* **`UTE_Kontrol_Merkezi_V5.xlsx`**: Excel ve Google Sheets için hazırlanmış, formülleri ve koşullu biçimlendirmeleri hazır ana çalışma kitabı.
* **`core/`**
  * `engine.js`: USALI standardında gece bölme, ADR, RevPAR, Lead CRM, Gap Night ve Today Radar hesaplama motoru.
  * `tests.js`: Phase 1-11 için otomatik Acceptance Test Suite (%100 PASS).
  * `excel_generator.js`: ExcelJS tabanlı tablo üretim motoru.
* **`apps_script/`**
  * `Code.gs`: Google Sheets için özel menü, Bugün Ne Yapmalıyım radarı ve Gap Night tarayıcısı.
* **`web/`**
  * `index.html`: Modern, responsive yönetici kokpiti ve rezervasyon simülatörü.
  * `style.css`: Dağ/kış temalı lüks UI tasarım sistemi.
  * `app.js`: Canlı veri etkileşimi ve formül motoru.
* **`supabase/`**
  * `schema.sql`: PostgreSQL / Supabase üretim şeması, tetikleyiciler (Triggers) ve RLS güvenlik politikaları.
  * `flutter_models.dart`: Mobil uygulama geliştirme için Dart veri modelleri.

---

### 🚀 Hızlı Başlangıç

#### 1. Excel / Google Sheets Kullanımı
* `c:\Users\pc\Desktop\lexbnb\UTE_Kontrol_Merkezi_V5.xlsx` dosyasını doğrudan Microsoft Excel ile açabilir veya Google Drive'a yükleyerek Google Sheets olarak içe aktarabilirsiniz.
* Google Sheets'te **Uzantılar > Apps Script** menüsüne gidip `apps_script/Code.gs` kodunu yapıştırdığınızda üst menüde **"🌲 UTE Kontrol Merkezi"** otomasyon araçları aktif hale gelecektir.

#### 2. Web Kokpitini Görüntüleme
* `web/index.html` dosyasını herhangi bir internet tarayıcısında (Chrome, Edge vb.) doğrudan çift tıklayarak açabilirsiniz.

#### 3. Testleri Çalıştırma
Konsolda testleri yeniden çalıştırmak için:
```bash
node core/tests.js
```

---

### 🏆 5 Villa Özellikleri ve Fiyat Basamakları

| Villa | Kapasite | Floor Rate | Base Rate | Target Rate | Premium Rate | Peak Rate | Öne Çıkan Özellikler |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Seyir** | 6+2 | ₺3.500 | ₺4.500 | ₺6.000 | ₺8.500 | ₺12.000 | Şömine, soba, kış bahçesi |
| **Doğuş** | 11 | ₺5.000 | ₺6.500 | ₺9.000 | ₺13.000 | ₺18.000 | 4 oda, büyük lüks kış bahçesi |
| **Zirve** | 9 | ₺6.500 | ₺8.500 | ₺12.000 | ₺16.500 | ₺24.000 | Isıtmalı jakuzi, sauna, kapalı çardak |
| **Şirin** | 7 | ₺3.000 | ₺4.000 | ₺5.500 | ₺7.500 | ₺11.000 | Üst teras, kapalı veranda |
| **Nefes** | 12 | ₺5.500 | ₺7.000 | ₺9.500 | ₺14.000 | ₺19.000 | Voleybol alanı, mini kale, 3 banyo |
