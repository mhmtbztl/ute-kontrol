# Analiz sekmesi — entegrasyon notları

Dal: `claude/analiz` · worktree: `lexbnb-claude-analiz` · 5 Kasım 2026

**Durum: UYGULANDI (5.11.2026).** Dal Codex'in Airbnb işini içeren master'a
(PR #57, #58) çakışmasız taşındı ve aşağıdaki adımların hepsi uygulandı:
3.e (içe aktarım bağı) dahil. Bağlama tek bir yükleme dizisine eklenmedi; sekme
ilk açıldığında arka planda bir kez okunur. Talep kanalları kendi Türkçe
adlarıyla çıkar (`leadChannelLabel`). Menü testleri 10 kaleme güncellendi.
Tarayıcı kapısına 33 ve 33b adımları eklendi. Doğrulama: `npm test` 225/225,
`test:browser` iki ardışık koşuda yeşil, göç zinciri ve damgalar temiz.
Aşağıdaki metin tarihçe olarak duruyor.

İlk durum: hesap ve arayüz katmanı bitmişti ama uygulamaya bağlı değildi.
Kullanıcı kararıyla (5.11.2026) başka işler sürerken paylaşılan dosyalara
dokunulmadı; bu not son adımda yapılacak değişiklikleri listeliyordu.

Uygulama sırası: dal güncel `master`'a **REBASE** edilir, aşağıdaki adımlar
tek commit'te uygulanır, ardından `node stamp_assets.js` + doğrulama koşulur.

**Göç gerekmez.** Bütün veri zaten istemcide: `appData.bookings` tarih
filtresi olmadan yüklenir (app.js `from('bookings').select('*')`),
`appData.leads`, `appData.targets` ve `appData.villas` da yüklüdür.

---

## Bu dalda olanlar (dokunulmayacak, yalnız bağlanacak)

| Dosya | Ne |
|---|---|
| `core/booking_analytics.js` | Saf hesap modülü (Node + tarayıcı). Para ve gece hesaplamaz: ay performansı enjekte edilir, kanal cirosu ve ileriye dolu `LedgerContract`'tan gelir. |
| `core/analytics_ui.js` | Arayüz. `AnalyticsUI.mount(el, opts)` ile bir kaba çizer. **innerHTML kullanmaz**: güvenlik sınırı `<svg>`'yi siliyor. Satır içi `style=` ve `on*` yok, olaylar kendi dinleyicisinde. |
| `analytics.css` | `ba-` önekli stiller, uygulamanın koyu tema değişkenleriyle. |
| `core/booking_analytics_tests.js` | 21 iddia. Bozulmuş koda karşı denendi: 5 bozmanın 5'i yakalandı. |
| `core/analytics_ui_tests.js` | 11 iddia, sahte DOM. Bozulmuş koda karşı denendi: 3 bozmanın 3'ü yakalandı. |

---

## 1. `server.js` — izin listesi (ZORUNLU, yoksa 404)

`analytics.css` kökte duruyor; `ROOT_FILES` yalnız adı geçen dosyaları verir.
Pages derlemesi de (`scripts/build_pages.js`) aynı `isAllowed` süzgecini
kullandığı için **canlıda da 404** olur.

```js
const ROOT_FILES = new Set(['index.html', 'style.css', 'analytics.css', 'app.js', /* … */]);
```

`core/local_server_tests.js:59` izinli yol listesine `'/analytics.css'` eklenir; bir iddia varsa
`analytics.css` oraya da eklenir. `core/*.js` dosyaları zaten kalıba uyar:
`booking_analytics.js` ve `analytics_ui.js` için ek iş gerekmez.

> Seçenek: ayrı dosya yerine `analytics.css` içeriği `style.css`'in sonuna
> eklenebilir. O zaman bu adım gerekmez, ama ortak dosya büyür. Önerilen:
> ayrı dosya.

## 2. `index.html`

**a) Stil** — `style.css` bağlantısının hemen altına (satır ~17):
```html
<link rel="stylesheet" href="analytics.css">
```

**b) Menü düğmesi** — `switchTab('marketing')` düğmesinin yanına (satır ~396):
```html
<button class="tab-btn" data-onclick="switchTab('analytics')">📊 Analiz</button>
```
`switchTab` zaten `core/action_dispatch.js` `EYLEMLER` listesinde. Modülün
kendi düğmeleri `data-onclick` kullanmaz, bu yüzden listeye yeni ad eklenmez.

**c) Sekme** — `tab-marketing` div'inin yanına (satır ~1173). Sayı içeren
sabit değer yoktur (§3.5):
```html
<div id="tab-analytics" class="tab-content">
  <div id="analyticsRoot"></div>
</div>
```

**d) Betikler** — `core/ledger_contract.js`'ten **sonra**, `app.js`'ten **önce**
(satır ~4219–4253):
```html
<script src="core/booking_analytics.js"></script>
<script src="core/analytics_ui.js"></script>
```
Ardından `node stamp_assets.js`: `?v=` damgaları kendiliğinden yazılır.

## 3. `app.js`

**a) Bağlama** — tek yerde, mevcut kaynak fonksiyonlarıyla. Yeni hesap yok:
```js
// Analiz sekmesi (core/analytics_ui.js). Rakamlar tek kaynaktan:
// computeMonthPerformance (Bugun ekrani + Finans KPI tablosu ile ayni).
let analyticsUi = null;
function renderAnalyticsTab() {
  const el = typeof document !== 'undefined' && document.getElementById('analyticsRoot');
  if (!el || typeof AnalyticsUI === 'undefined') return;
  if (!analyticsUi) {
    analyticsUi = AnalyticsUI.mount(el, {
      getData: () => ({
        bookings: appData.bookings || [],
        leads: canReadSalesRole(activeTenant?.role) ? (appData.leads || []) : [],
        villas: Object.entries(appData.villas || {}).map(([key, v]) => ({ key, name: v.name || key, id: v.id })),
        today: getTodayStr()
      }),
      deps: {
        monthPerformance: (monthKey, villa) => computeMonthPerformance(monthKey, villa),
        monthTarget: (monthKey, villa) => analyticsMonthTarget(monthKey, villa),
        isBulkSummary: isBulkSummaryBooking,
        channelName: getChannelDisplayName
        // isImported: bkz. 3.e
      },
      monthOptions: () => (typeof ALL_FINANCIAL_MONTHS !== 'undefined' ? ALL_FINANCIAL_MONTHS : []),
      canReadLeads: () => canReadSalesRole(activeTenant?.role)
    });
  }
  analyticsUi.render();
}

// Aylik hedef satiri (monthly_targets). Ciro hedefi Finans'in kullandigi
// getConfiguredRevenueTarget'tan; doluluk/ADR/RevPAR sutun varsayilani 0
// "girilmemis" sayilir (modul 0'i zaten yok sayar).
function analyticsMonthTarget(monthKey, villa) {
  const [y, m] = monthKey.split('-').map(Number);
  const pid = villa && villa !== 'ALL' ? appData.villas?.[villa]?.id || null : null;
  const rows = Array.isArray(appData.targets) ? appData.targets : [];
  const row = rows.find(t => Number(t.year) === y && Number(t.month) === m
    && ((t.property_id || t.propertyId || null) === pid));
  const revenue = getConfiguredRevenueTarget({ period: monthKey }, appData.targets, villa || 'ALL');
  if (!row && !revenue) return null;
  return {
    revenue: revenue || null,
    occupancy: Number(row?.occupancy_target) || null,
    adr: Number(row?.adr_target) || null,
    revpar: Number(row?.revpar_target) || null
  };
}
```

**b) `switchTab`** (satır ~4675–4722), diğer dalların yanına:
```js
if (tabId === 'analytics') renderAnalyticsTab();
```

**c) `ACTIVE_RENDER_PLANS`** (satır ~5404). Veri yeniden yüklenince açık sekme
tazelenir (§3.5 kuralı: blok hangi sekmedeyse render'ı o satırda):
```js
'tab-analytics': ['renderAnalyticsTab'],
```

**d) Rol görünürlüğü** — `applyRoleNavigationVisibility` (satır ~18511).
Karar: satış okuma izni olan herkes görür (sales dahil), `staff` görmez:
```js
if (!canReadSalesRole(role)) hiddenTabs.add('analytics');
```
`switchTab` başına da aynı kapı (doğrudan çağrıya karşı):
```js
if (tabId === 'analytics' && !canReadSalesRole(activeTenant?.role)) return;
```

**e) İçe aktarılan rezervasyonlar (isteğe bağlı, önerilir).** Rezervasyon
öncesi süre `created_at`'ten hesaplanır. İçe aktarılan kayıtta bu tarih
aktarım günüdür. Modül, giriş tarihinden **sonra** girilmiş kayıtları zaten
dışlar. Ama ileri tarihli bir rezervasyon içe aktarılırsa süre kısa görünür.
Tam çözüm için aktarım bağı yüklenir (phase35 tablosu, okuma RLS'i var):
```js
// loadTenantAppData icinde, digerleriyle paralel; tablo yoksa sessizce bos.
const imported = await fetchTenantRowsTolerant(() => supabaseClient
  .from('finance_import_batch_rows').select('booking_id')
  .eq('tenant_id', tenantId).not('booking_id', 'is', null));
appData.importedBookingIds = new Set((imported || []).map(r => r.booking_id));
// deps:
isImported: b => !!appData.importedBookingIds?.has(b.dbId || b.id)
```
(`fetchTenantRowsTolerant(buildQuery)` app.js:17945; tablo yoksa `null` döner.
`fetchAllCloudRows`'un sayfalama için `buildQuery`'yi nasıl çağırdığı
entegrasyonda kontrol edilmeli.) Yapılmazsa
ekran yanlış rakam göstermez; yalnız örneklem biraz daha kalabalık olur.

**f) Deftere yazan fonksiyonlar.** Ek iş yok: modül her `render()` çağrısında
`appData`'dan yeniden hesaplar ve önbellek tutmaz. `renderAll` ve
`ACTIVE_RENDER_PLANS` yeterli.

## 4. `run_all_tests.js`

Çevrimdışı listeye:
```js
'booking_analytics_tests.js',
'analytics_ui_tests.js',
```

## 5. Testler (entegrasyonla birlikte)

- **`render_pipeline_tests`**: sahte DOM'da `renderAnalyticsTab()` koşusu.
  Boş işletmede "Henüz rezervasyon yok" yazmalı, tutar ve yüzde olmamalı.
- **Tek kaynak iddiası (yeni, önerilen):** app.js'i yükleyen bir süitte aynı ay
  için `AnalyticsUI` raporundaki `kpis.current.revenue/occupancy/adr` ile
  `computeMonthPerformance(ay, villa)` birebir aynı olmalı. Hesap modülünün
  testleri bunu sahte ay performansıyla ölçüyor; gerçek fonksiyonla ölçen ağ
  entegrasyonda eklenir.
- **`static_ui_value_tests`, `html_injection_tests`, `action_dispatch_tests`,
  `demo_residue_tests`** yeni kodu kendiliğinden tarar. 5.11 itibarıyla
  worktree'de `npm test` 218/218 yeşil.

## 6. `CLAUDE.md`

§3.4'e kısa bir paragraf eklenir: Analiz sekmesi rakamları
`computeMonthPerformance`'tan alır; kanal cirosu ve ileriye dolu
`LedgerContract`'tan; kayıt başı metrikler giriş tarihine göre; toplu aktarım
özeti adede girmez. §6 tablosuna bir satır eklenir.

## 7. Doğrulama (entegrasyondan sonra)

1. `node stamp_assets.js` → `npm test` → `npm run verify:migrations` →
   `node stamp_assets.js --check`
2. `node server.js` ile Claude tarayıcı hesabıyla giriş. Analiz sekmesinde:
   - Tüm mülkler ve tek mülk için aynı ayın ciro, doluluk ve ADR'si Bugün
     ekranıyla ve Finans aylık KPI tablosuyla **birebir aynı** olmalı.
   - Mülk tablosu toplamı portföy kartıyla aynı olmalı.
   - Konsolda CSP ve diğer hata yok.
   - 390 px genişlikte yatay kaydırma yok.
3. Salt okunur inceleme: üretime yazılmaz.

## Çakışma notu

Codex aynı anda `codex/airbnb-performance` dalında Pazarlama sekmesine
"Airbnb İlan Performansı" bölümü ekliyor (phase98/100/102, elle girilen Airbnb
rakamları). Bu iş **ondan ayrıdır**: rezervasyonlardan beslenir ve göç
gerektirmez. İkisi de `index.html` (menü, betikler) ve `style.css`
civarına dokunur. Hangisi master'a önce girerse diğeri REBASE ile üstüne
alınır, çakışma satır düzeyinde olur. Kullanıcıya ileride ikisini aynı ekranda
göstermek önerilebilir: Analiz'de bir "Airbnb ilan performansı" kartı.
