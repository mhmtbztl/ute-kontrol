'use strict';
// Ciro plani (Fiyatlandirma yeniden tasarim, kullanici 25.11.2026): her ev icin doluluk orani
// ve gecelik fiyat secilir; ev cirosu = satilabilir gece × doluluk × fiyat, altta toplam.
// Satilabilir gece Bugun/Finans ile ayni kapasite kuralindan; varsayilan uydurulmaz.
global.FinancialMetricsService = require('./financial_metrics_service.js');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

let passed = 0; let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); } else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const MONTH = '2027-03'; // 31 gun, ufkun icinde
const TODAY = '2026-11-25';
const villa = (id, name, base) => ({ id, slug: name, name, basePrice: base, cleanCost: 0, activationDate: '2025-01-01', isActive: true });
App.setActiveTenant(null);
App.setAppData({
  villas: { A: villa('pa', 'ZIRVE', 6000), B: villa('pb', 'SIRIN', null) },
  bookings: [], expenses: [], cleaningTasks: [], maintenance: [], maintenanceTickets: [], tenantSettings: {}, monthlyTargets: []
});
const entries = Object.entries(App.getAppData().villas).map(([key, property]) => ({ key, property }));

try {
  let plan = App.pricingPlanRows(entries, MONTH, {}, TODAY);
  const a = plan.rows.find(r => r.key === 'A');
  const b = plan.rows.find(r => r.key === 'B');
  check(a.nights === 31 && b.nights === 31, 'P1. Satilabilir gece ayin kapasitesidir (Bugun/Finans ile ayni kural)', JSON.stringify([a.nights, b.nights]));
  check(a.occ === null && a.revenue === null && b.price === null,
    'P2. Doluluk hedefi ve gecen yil verisi yoksa doluluk bos; baz fiyati olmayan evde fiyat bos (uydurma yok)', JSON.stringify(a));
  check(a.price > 0 && /Ortalama önerimiz|Baz fiyat/.test(a.priceSource), 'P3. Fiyat varsayilani motorun ayki ortalama onerisi ya da baz fiyat; kaynagi yazar', `${a.price} ${a.priceSource}`);
  check(plan.total === null && plan.missing.length === 2, 'P4. Hic ev hesaplanamiyorsa toplam "—" (null), eksik evler adlanir');

  plan = App.pricingPlanRows(entries, MONTH, { pa: { occ: 60, price: 5000 } }, TODAY);
  const a2 = plan.rows.find(r => r.key === 'A');
  check(a2.revenue === Math.round(31 * 0.6 * 5000) && a2.plannedNights === 19 && a2.occSource === 'Sizin seçiminiz',
    'P5. Ev cirosu = satilabilir gece × doluluk × fiyat', JSON.stringify(a2));
  check(plan.total === a2.revenue && plan.counted === 1 && plan.missing.join() === 'SIRIN',
    'P6. Toplam yalniz hesaplanabilen evleri toplar; eksik ev ayrica soylenir', JSON.stringify(plan.missing));

  plan = App.pricingPlanRows(entries, MONTH, { pa: { occ: 60, price: 5000 }, pb: { occ: 40, price: 3000 } }, TODAY);
  check(plan.total === Math.round(31 * 0.6 * 5000) + Math.round(31 * 0.4 * 3000) && plan.missing.length === 0 && plan.avgOcc === 50,
    'P7. Iki evin toplami ve ortalama doluluk', JSON.stringify({ t: plan.total, o: plan.avgOcc, p: plan.avgPrice }));

  // Kayitli aylik doluluk hedefi varsayilan doluluktur.
  App.getAppData().targets = [{ year: 2027, month: 3, property_id: 'pa', occupancy_target: 70 }];
  const hedefli = App.pricingPlanRows(entries, MONTH, {}, TODAY).rows.find(r => r.key === 'A');
  check(hedefli.occ === 70 && hedefli.occSource === 'Doluluk hedefiniz',
    'P8. Kayitli aylik doluluk hedefi varsa varsayilan doluluk odur', JSON.stringify(hedefli));
  App.getAppData().targets = [];

  // Ekran: menude dort sekme, Hedef/Sonuclar baglantidan acilir; eylemler izin listesinde.
  const html = read('index.html');
  const menu = html.slice(html.indexOf('class="ads-subnav pricing-subnav"'), html.indexOf('</div>', html.indexOf('class="ads-subnav pricing-subnav"')));
  const gorunen = (menu.match(/<button[^>]*>/g) || []).filter(t => !/\shidden[\s>]/.test(t));
  check(gorunen.length === 4 && /Fiyatlarım/.test(menu) && /Ciro planı/.test(menu) && /Rakipler/.test(menu) && /Ayarlar/.test(menu),
    'P9. Menude dort sekme: Fiyatlarim · Ciro plani · Rakipler · Ayarlar', String(gorunen.length));
  check(/setPricingView\('target'\)/.test(html.slice(html.indexOf('id="pricingView_plan"'))) && /Kaydettiğim fiyatlar nasıl sattı\?/.test(html),
    'P10. Hedef (ters hesap) ve Sonuclar silinmedi; ilgili sekmenin altindaki baglantidan acilir');
  const ad = read('core/action_dispatch.js');
  check(['setPricingPlanValue', 'setPricingPlanMonth', 'resetPricingPlan'].every(f => ad.includes(`'${f}'`)), 'P11. Ciro plani eylemleri izin listesinde');
  check(App.setPricingView('plan') === true && App.setPricingView('calendar') === true, 'P12. Ciro plani gorunumu acilir');
} catch (e) {
  failed++; console.error(`[FAIL] Beklenmeyen hata — ${e && e.stack}`);
} finally {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
}
