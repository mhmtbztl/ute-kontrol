# LEXBNB — EXECUTIVE CONTROL CENTER & STR REVENUE ENGINE

Lexbnb, lüks kısa dönem kiralama (STR) ve villa portföy işletmeleri için geliştirilmiş uçtan uca operasyon, gelir yönetimi ve yönetici karar kokpitidir.

Canlı Web Sürümü: [https://lexbnb.space](https://lexbnb.space)

---

### 📂 Proje Mimarisi

* **`app.js` & `index.html`**: Modern SaaS yönetici kokpiti, dinamik gelir yönetimi ve rezervasyon simülatörü.
* **`core/`**: Finans, fiyatlama, pazarlama, mesajlaşma, güvenlik ve yönetici paneli servisleri ile testleri.
* **`scripts/`**: Güvenli test, göç doğrulama ve kuyruk worker girişleri.
* **`run_all_tests.js`**: Çevrimdışı ve açıkça etkinleştirilen canlı paketleri ayıran ana regresyon koşucusu.
* **`supabase/`**: PostgreSQL/Supabase tenant veri modeli, RLS politikaları ve sıralı göç zinciri.
* **`.github/workflows/`**: Çevrimdışı CI ve zamanlanmış worker iş akışları.

---

### 🚀 Testleri Çalıştırma

Varsayılan komut dış sisteme bağlanmadan 84 güvenli paketi çalıştırır:
```bash
npm test
```

Göç bütünlüğü için `npm run verify:migrations` kullanın. Canlı entegrasyon testleri yalnızca ayrı bir test Supabase projesinde ve `LEXBNB_ALLOW_DESTRUCTIVE_TESTS=1` açık onayıyla `npm run test:live` üzerinden çalıştırılır. Üretim dağıtım sırası için `docs/PRODUCTION_RUNBOOK.md` belgesine bakın.
