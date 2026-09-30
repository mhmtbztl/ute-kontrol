/**
 * A1 CAPRAZ DENETIM AGI — Codex motorlari (Claude, 30.09.2026)
 *
 * Denetimde motorlarin sozlesme kurallari kodda DOGRU bulundu, ama bes kural
 * hicbir testle korunmuyordu: kural bilerek bozuldugunda Codex'in testleri
 * yesil kaldi (mutasyon denemesi, ortak-denetim/DENETIM_A1_Claude.md). Bu
 * dosya o bosluklari kapatir; motor dosyalarina dokunmaz.
 *
 *  M1 Takvim artisi = hafta sonu ile ozel gunun BUYUGU (toplanmaz)
 *  M2 Indirim = son dakika ile bos gecenin EN DERINI (ust uste binmez)
 *  M4 Talep kurali hedef dolulukta devreye girer, altinda girmez
 *  M6 Hedef bu fiyatlarla imkansizsa IMPOSSIBLE_AT_PRICES
 *  M7 Ozel gun tablosu resmi kaynakla birebir (Diyanet 2026/2027, MEB)
 */
const assert = require('assert');
const E = require('./suggested_price_engine');
const C = require('./target_revenue_calculator');
const S = require('./tr_special_days');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (e) { failed++; console.error(`[FAIL] ${name}\n       ${e.stack || e.message}`); } }

const gun = (r, d) => r.days.find(x => x.date === d);

test('M1. Hafta sonu ve özel gün aynı gecede: büyük olan uygulanır, toplanmaz (+40, +65 değil)', () => {
  // 2026-10-30 Cuma gecesi; ozel gun olarak isaretlenir.
  const r = E.suggest({ property: { id: 'p1', basePrice: 10000, floorPrice: null }, today: '2026-10-01', days: 30,
    rules: { lastMinute: { enabled: false } }, specialDays: [{ date: '2026-10-30' }] });
  const d = gun(r, '2026-10-30');
  assert.strictEqual(d.price, 14000);
  assert.deepStrictEqual(d.reasons.map(x => x.code), ['SPECIAL_DAY']);
});

test('M2. Son dakika ve boş gece aynı gecede: en derin indirim, üst üste binmez (−15, −25 değil)', () => {
  // 2026-10-03 aciktir, iki yani rezervasyonlu (1 gecelik bosluk) ve 2 gun sonra.
  // 3 Ekim Cumartesi: hafta sonu kurali kapatilir ki yalniz indirimler olculsun.
  const r = E.suggest({ property: { id: 'p1', basePrice: 10000 }, today: '2026-10-01', days: 10,
    rules: { weekend: { enabled: false } },
    bookings: [{ propertyId: 'p1', checkIn: '2026-10-01', checkOut: '2026-10-03' }, { propertyId: 'p1', checkIn: '2026-10-04', checkOut: '2026-10-06' }] });
  const d = gun(r, '2026-10-03');
  assert.strictEqual(d.price, 8500);
  assert.deepStrictEqual(d.reasons.map(x => x.code), ['GAP_NIGHT']);
});

test('M4. Talep kuralı: doluluk hedefe ulaşınca +%10, ulaşmayınca yok', () => {
  const bookings = [{ propertyId: 'p1', checkIn: '2026-10-02', checkOut: '2026-10-08' }]; // 10 gunun 6'si dolu = %60
  const temel = { property: { id: 'p1', basePrice: 10000 }, today: '2026-10-01', days: 10, bookings, rules: { lastMinute: { enabled: false }, weekend: { enabled: false } } };
  const ulasti = E.suggest({ ...temel, occupancyTarget: 0.6 });
  const ulasmadi = E.suggest({ ...temel, occupancyTarget: 0.7 });
  assert.strictEqual(ulasti.next30.occupancy, 0.6);
  assert.strictEqual(gun(ulasti, '2026-10-09').price, 11000);
  assert.strictEqual(gun(ulasmadi, '2026-10-09').price, 10000);
  assert(!ulasmadi.warnings.some(w => w.code === 'OCCUPANCY_TARGET_MISSING'));
});

test('M6. Hedef kapasiteyi aşıyorsa IMPOSSIBLE_AT_PRICES ve tablo satırı "mümkün değil"', () => {
  const r = C.calculate({ target: 600000, soldToDate: { nights: 0, netRoomRevenue: 0 }, openNights: { weekday: 30, weekend: 0, special: 0 }, prices: { weekday: 15000, weekend: 0, special: 0 } });
  assert.strictEqual(r.status, 'IMPOSSIBLE_AT_PRICES');
  assert(r.requiredOccupancy > 1);
  assert.strictEqual(r.minAvgPriceAtFull, 20000);
  assert.strictEqual(r.table.find(x => x.avgPrice === 15000).feasible, false);
});

test('M7. Özel gün tablosu resmî kaynakla birebir (Diyanet 2026/2027, MEB yarıyıl)', () => {
  // 30.09.2026'da resmi sayfalardan okundu:
  //  vakithesaplama.diyanet.gov.tr/icerik.php?icerik=158 (2026), =159 (2027)
  //  meb.gov.tr haber/37198 (2025-26), haber/41057 (2026-27)
  const beklenen = {
    2026: ['2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30'],
    2027: ['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-05-15', '2027-05-16', '2027-05-17', '2027-05-18', '2027-05-19']
  };
  Object.entries(beklenen).forEach(([yil, tarihler]) => {
    const dini = S.forRange(`${yil}-01-01`, `${yil}-12-31`).filter(x => x.kind === 'DINI').map(x => x.date);
    assert.deepStrictEqual(dini, tarihler, `${yil} dinî bayramlar`);
  });
  const okul = y => S.forRange(`${y}-01-01`, `${y}-02-28`).filter(x => x.kind === 'OKUL').map(x => x.date);
  assert.strictEqual(okul(2026)[0], '2026-01-19'); assert.strictEqual(okul(2026).slice(-1)[0], '2026-01-30');
  assert.strictEqual(okul(2027)[0], '2027-01-25'); assert.strictEqual(okul(2027).slice(-1)[0], '2027-02-05');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
