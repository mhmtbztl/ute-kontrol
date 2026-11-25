'use strict';
// Rakip analizi taramasi -> kaynakli rakip fiyat defteri (kullanici 25.11.2026).
const R = require('./rival_scan_import.js');
let passed = 0; let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); } else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

const scan = {
  tarama_tarihi: '2026-11-24', gece: 2,
  tarihler: {
    D1: { gun_tipi: 'Hafta sonu', giris: '2026-11-27', cikis: '2026-11-29' },
    D2: { gun_tipi: 'Hafta içi', giris: '2026-12-08', cikis: '2026-12-10' },
    D3: { gun_tipi: 'Hafta sonu', giris: '2026-12-11', cikis: '2026-12-13' },
    D4: { gun_tipi: 'Yılbaşı', giris: '2026-12-30', cikis: '2027-01-01' }
  },
  bizim: [{ ad: 'Villa Şirin', maks: 7 }, { ad: 'Villa Nefes', maks: 12 }, { ad: 'Villa Bilinmeyen', maks: 6 }],
  airbnb: [
    { ad: 'Küçük Ev', maks: 6, fiyat: { 4: { D1: 20000, D2: 12000, D3: 24000, D4: 40000 } } },
    { ad: 'Büyük Ev', maks: 12, fiyat: { 4: { D1: 30000 }, 8: { D1: 50000, D2: 'Satış yok' } } },
    { ad: 'Fiyatsız Ev', maks: 7, fiyat: { 4: {} } }
  ]
};
const settings = { airbnb_rakipler: { 'Küçük Ev': '12345', 'Büyük Ev': '' } };
const props = [{ id: 'p1', name: 'ŞİRİN' }, { id: 'p2', name: 'Nefes' }];

let p = R.plan({ scan, settings, properties: props, today: '2026-11-25' });
const sirinKucuk = p.rows.find(r => r.propertyId === 'p1' && r.competitorName === 'Küçük Ev');
check(!p.error && sirinKucuk && sirinKucuk.values.WEEKEND === 11000 && sirinKucuk.values.WEEKDAY === 6000 && sirinKucuk.values.SPECIAL === 20000,
  'R1. Gece basi fiyat = 2 gecelik toplam / 2; ayni turun ortalamasi; bayram/yilbasi ozel gun', JSON.stringify(sirinKucuk && sirinKucuk.values));
check(p.unmatched.join() === 'Villa Bilinmeyen' && p.rows.every(r => ['p1', 'p2'].includes(r.propertyId)),
  'R2. Ev adindan eslesir ("Villa Şirin" = "ŞİRİN"); eslesmeyen ev aktarilmaz ve adlanir');
const nefesBuyuk = p.rows.find(r => r.propertyId === 'p2' && r.competitorName === 'Büyük Ev');
check(nefesBuyuk && nefesBuyuk.persons === 8 && nefesBuyuk.values.WEEKEND === 25000 && !('WEEKDAY' in nefesBuyuk.values),
  'R3. 8+ kapasiteli ev icin 8 kisilik fiyat; "Satis yok" fiyat sayilmaz, 0 uydurulmaz', JSON.stringify(nefesBuyuk));
check(!p.rows.some(r => r.competitorName === 'Fiyatsız Ev'), 'R4. Hic fiyati olmayan rakip aktarilmaz');
check(sirinKucuk.sourceUrl === 'https://www.airbnb.com.tr/rooms/12345' && nefesBuyuk.sourceUrl === R.FALLBACK_URL,
  'R5. Kaynak baglantisi ilan numarasindan; numara yoksa Airbnb arama sayfasi (kayit kurali http zorunlu)');
check(p.rows.filter(r => r.propertyId === 'p1').length <= R.MAX_RIVALS, 'R6. Ev basina en fazla 5 rakip');

const existing = [{ property_id: 'p1', competitor_name: 'küçük ev', researched_on: '2026-11-24' }];
p = R.plan({ scan, settings, properties: props, existing, today: '2026-11-25' });
check(p.skipped === 1 && !p.rows.some(r => r.propertyId === 'p1' && r.competitorName === 'Küçük Ev'),
  'R7. Ayni ev + rakip + tarih zaten kayitliysa atlanir (iki kez aktarmak cift yazmaz)');

check(/tarama/.test(R.plan({ scan: { foo: 1 }, properties: props }).error || ''), 'R8. Tarama olmayan dosya acik hatayla reddedilir');
check(/gelecekte/.test(R.plan({ scan, properties: props, today: '2026-11-01' }).error || ''), 'R9. Gelecek tarihli tarama aktarilmaz (veritabani kurali researched_on <= bugun)');

// --- Uygulama yolu: dosya secimi -> onizleme -> aktar (ayni kayit servisi saveResearch) ----------
(async () => {
  global.window = global.window || {}; global.window.showToast = () => {};
  const App = require('../app.js');
  const yazmalar = [];
  const istemci = {
    from(t) {
      const q = {
        insert(y) { yazmalar.push({ t, y }); q.y = y; return q; }, update() { return q; }, eq() { return q; }, select() { return q; },
        async single() { return { data: { id: 'r' + yazmalar.length, ...q.y }, error: null }; }
      };
      return q;
    }
  };
  App.setActiveTenant({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'owner' });
  App.setSupabaseClient(istemci);
  App.setAppData({ villas: { S: { id: 'p1', slug: 'S', name: 'ŞİRİN', isActive: true }, N: { id: 'p2', slug: 'N', name: 'Nefes', isActive: true } },
    bookings: [], expenses: [], cleaningTasks: [], competitorPriceResearch: [], phase78SchemaReady: true, tenantSettings: {} });
  const dosya = obj => ({ text: async () => JSON.stringify(obj) });
  const plan = App.planRivalScanFromJson([scan, settings]);
  const html = App.rivalScanPreviewHtml(plan);
  check(/kaydı aktar/.test(html) && /Villa Bilinmeyen/.test(html), 'R10. Onizleme kayit sayisini, eslesmeyen evi ve aktar dugmesini gosterir');
  await App.handleRivalScanFiles({ files: [dosya(scan), dosya(settings)] });
  const ok = await App.importRivalScan();
  const y = yazmalar.map(k => k.y);
  check(ok === true && y.length === plan.rows.length && y.every(r => r.source_kind === 'OTA' && r.researched_on === '2026-11-24' && r.competitor_name
    && Array.isArray(r.prices) && r.prices.length > 0 && /^https:\/\//.test(r.source_url)),
  'R11. Aktar her satiri kaynakli rakip kaydi olarak yazar (OTA, tarama tarihi, rakip adi, gece basi fiyatlar)', JSON.stringify(y[0]));
  const ikinci = App.planRivalScanFromJson([scan, settings]);
  check(ikinci.rows.length === 0 && ikinci.skipped === plan.rows.length, 'R12. Ayni tarama ikinci kez aktarilmak istenirse hepsi atlanir', JSON.stringify([ikinci.rows.length, ikinci.skipped]));
  App.setActiveTenant({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'sales' });
  yazmalar.length = 0;
  await App.handleRivalScanFiles({ files: [dosya({ ...scan, tarama_tarihi: '2026-11-20' })] });
  check(await App.importRivalScan() === false && yazmalar.length === 0, 'R13. Yonetim yetkisi olmayan rol aktaramaz');
})().catch(e => { failed++; console.error('[FAIL] Beklenmeyen hata — ' + (e && e.stack)); }).finally(() => {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
});
