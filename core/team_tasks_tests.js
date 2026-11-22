/**
 * LEXBNB — EKIP GOREVLERI (core/team_tasks.js)
 * Gorev yalniz kayittan turer; ekip dagitimla, gorme hakki rol kapisiyla belirlenir.
 * Dis sisteme baglanmaz.
 */
const assert = require('assert');
const T = require('./team_tasks.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (err) {
    failed++; console.error(`[FAIL] ${name}\n       ${err && err.stack}`);
  }
}

const today = '2026-11-21';
const ALL = { operations: true, sales: true, ledger: true, manage: true };
const villas = { SEYIR: { id: 'p1', name: 'Seyir' }, DOGUS: { id: 'p2', name: 'Doğuş' } };
const helpers = {
  isTicketOpen: t => !['COMPLETED', 'CANCELLED'].includes(t.status),
  isTicketBlockingToday: t => !!t.blocks,
  isBulkSummary: b => /^TOPLU AKTARIM/.test(b.guest || ''),
  leadStatusLabel: s => ({ FOLLOW_UP: 'Takipte', QUOTE_SENT: 'Teklif gönderildi' }[s] || s)
};
const base = (extra = {}) => Object.assign({ today, villas, helpers, can: ALL }, extra);

test('T1. Bos isletmede hic gorev yok (uydurma yok)', () => {
  assert.deepStrictEqual(T.buildTeamTasks(base()), []);
  const parts = T.summaryParts([], { arrivals: 0, departures: 0 }).map(p => p.text || p.strong).join('');
  assert.strictEqual(parts, 'Bugün 0 giriş, 0 çıkış; açık iş yok.');
});

test('T2. Temizlik: gecmis acil, bugun yap, kontrol bekleyen yap, yapilan tamam, yarin yap', () => {
  const tasks = T.buildTeamTasks(base({ cleaningTasks: [
    { id: 'a', villa: 'SEYIR', date: '2026-11-19', status: 'PLANNED' },
    { id: 'b', villa: 'DOGUS', date: today, status: 'PLANNED', cleaner: 'Ayşe' },
    { id: 'c', villa: 'SEYIR', date: today, status: 'PLANNED', workflowState: 'AWAITING_INSPECTION' },
    { id: 'd', villa: 'DOGUS', date: today, status: 'DONE' },
    { id: 'e', villa: 'SEYIR', date: '2026-11-22', status: 'PLANNED' },
    { id: 'f', villa: 'SEYIR', date: '2026-11-25', status: 'PLANNED' },
    { id: 'g', villa: 'SEYIR', date: '2026-11-18', status: 'SKIPPED' }
  ] }));
  const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
  assert.strictEqual(byId['cleaning:a'].tag, 'URGENT');
  assert.strictEqual(byId['cleaning:b'].reason, 'Temizlikçi: Ayşe');
  assert.strictEqual(byId['cleaning:c'].type, 'CLEANING_INSPECTION');
  assert.strictEqual(byId['cleaning:d'].tag, 'DONE');
  assert.strictEqual(byId['cleaning:e'].type, 'CLEANING_TOMORROW');
  assert.ok(!byId['cleaning:f'] && !byId['cleaning:g'], '4 gun sonrasi ve atlanan gorev Bugun\'e girmez');
  assert.ok(tasks.every(t => t.team === 'CLEANING'));
  assert.strictEqual(tasks[0].tag, 'URGENT', 'acil ilk sirada');
  assert.strictEqual(tasks[tasks.length - 1].tag, 'DONE', 'tamam en sonda');
});

test('T3. Giris/cikis: ayni gun cikis varsa giris acil; iptal ve toplu aktarim ozeti sayilmaz', () => {
  const tasks = T.buildTeamTasks(base({ bookings: [
    { id: 'x', villa: 'SEYIR', guest: 'Ali', checkIn: '2026-11-18', checkOut: today, status: 'CONFIRMED' },
    { id: 'y', villa: 'SEYIR', guest: 'Ayşe', checkIn: today, checkOut: '2026-11-24', nights: 3, status: 'CONFIRMED' },
    { id: 'z', villa: 'DOGUS', guest: 'Can', checkIn: today, checkOut: '2026-11-23', status: 'CANCELLED' },
    { id: 'w', villa: 'DOGUS', guest: 'TOPLU AKTARIM — Kasım', checkIn: today, checkOut: '2026-11-30', status: 'CONFIRMED' },
    { id: 'v', villa: 'DOGUS', guest: 'Ece', checkIn: '2026-11-22', checkOut: '2026-11-24', nights: 2, status: 'CONFIRMED' }
  ] }));
  const ids = tasks.map(t => t.id).sort();
  assert.deepStrictEqual(ids, ['arrival:v', 'arrival:y', 'departure:x']);
  assert.strictEqual(tasks.find(t => t.id === 'arrival:y').tag, 'URGENT');
  assert.strictEqual(tasks.find(t => t.id === 'arrival:v').reason, 'Giriş · 2 gece');
});

test('T4. Rol kapisi: finans defterini okuyamayan finans gorevini gormez, dagitim degisse de', () => {
  const input = base({ finance: { cleaningDebts: [{ cleaner: 'A', amount: 2500, count: 2 }], goalMissing: true } });
  const satis = { operations: false, sales: true, ledger: false, manage: false };
  assert.strictEqual(T.buildTeamTasks(Object.assign({}, input, { can: satis })).length, 0);
  const tasindi = Object.assign({}, input, { can: satis, routing: { CLEANING_DEBT: 'MARKETING' } });
  assert.strictEqual(T.buildTeamTasks(tasindi).length, 0, 'ekip degisti, kapi degismedi');
  const full = T.buildTeamTasks(Object.assign({}, input, { routing: { CLEANING_DEBT: 'MARKETING' } }));
  assert.strictEqual(full.find(t => t.type === 'CLEANING_DEBT').team, 'MARKETING');
  assert.strictEqual(full.find(t => t.type === 'CLEANING_DEBT').value, '2.500 TL temizlik borcu');
  assert.deepStrictEqual(T.visibleTeams(satis).map(t => t.key), ['SALES', 'OPERATIONS']);
});

test('T5. Dagitim kaydi: bilinmeyen tur/ekip ve on tanimliyla ayni deger yok sayilir', () => {
  assert.deepStrictEqual(T.normalizeRouting({ NOPE: 'SALES', GAP_NIGHT: 'XX', LEAD_FOLLOW_UP: 'SALES', GAP_NIGHT2: 1 }), {});
  assert.deepStrictEqual(T.normalizeRouting({ GAP_NIGHT: 'marketing' }), { GAP_NIGHT: 'MARKETING' });
  assert.deepStrictEqual(T.normalizeRouting(null), {});
  assert.deepStrictEqual(T.normalizeRouting(['x']), {});
});

test('T6. Ariza: satisa kapatan ve P1 acil, digeri yap; kapali ariza yok', () => {
  const tasks = T.buildTeamTasks(base({ tickets: [
    { id: 1, villa: 'SEYIR', title: 'Havuz pompası', status: 'OPEN', priority: 'P2', blocks: true },
    { id: 2, villa: 'DOGUS', title: 'Musluk', status: 'OPEN', priority: 'P3' },
    { id: 3, villa: 'DOGUS', title: 'Klima', status: 'OPEN', priority: 'P1' },
    { id: 4, villa: 'DOGUS', title: 'Kapı', status: 'CANCELLED', priority: 'P1' }
  ] }));
  assert.deepStrictEqual(tasks.map(t => [t.id, t.tag]), [['ticket:1', 'URGENT'], ['ticket:3', 'URGENT'], ['ticket:2', 'DO']]);
});

test('T7. Fiyat onayi yalniz gunluk fiyat defterini kullanan isletmede; dolu gece sayilmaz', () => {
  const bookings = [{ villa: 'SEYIR', checkIn: today, checkOut: '2026-11-24', status: 'CONFIRMED', guest: 'A' }];
  assert.strictEqual(T.buildTeamTasks(base({ bookings, dailyPrices: [] })).filter(t => t.type === 'PRICE_APPROVAL').length, 0);
  const tasks = T.buildTeamTasks(base({ bookings, dailyPrices: [{ property_id: 'p1', price_date: '2026-11-25' }] }));
  const seyir = tasks.find(t => t.id === 'price:SEYIR');
  assert.strictEqual(seyir.value, '3 gece · Seyir', '7 gecenin 3\'u dolu, 1\'i kayitli');
  assert.strictEqual(tasks.find(t => t.id === 'price:DOGUS').value, '7 gece · Doğuş');
});

test('T8. Filtre ve sayac: villa ve ekip suzgeci, tamam sayilmaz; ozet cumlesi', () => {
  const tasks = T.buildTeamTasks(base({
    cleaningTasks: [{ id: 'a', villa: 'SEYIR', date: '2026-11-19', status: 'PLANNED' }, { id: 'd', villa: 'DOGUS', date: today, status: 'DONE' }],
    finance: { goalMissing: true }
  }));
  assert.strictEqual(T.filterTasks(tasks, { villa: 'SEYIR' }).length, 1);
  assert.strictEqual(T.filterTasks(tasks, { team: 'FINANCE' }).length, 1);
  assert.strictEqual(T.filterTasks(tasks, { teams: ['CLEANING'] }).length, 2);
  assert.deepStrictEqual(T.countByTeam(tasks), { CLEANING: 1, FINANCE: 1 });
  const s = T.summaryParts(tasks, { arrivals: 1, departures: 0 }).map(p => p.text || p.strong).join('');
  assert.strictEqual(s, 'Bugün 1 giriş, 0 çıkış; 2 iş bekliyor, 1 acil — önce Seyir temizliği.');
});

test('T9. Kampanya: bitisi gecmis aktif kampanya Pazarlama gorevi; yalniz yonetim gorur', () => {
  const campaigns = [{ id: 'c1', name: 'Yılbaşı', status: 'ACTIVE', endDate: '2026-11-10' }, { id: 'c2', status: 'ACTIVE', endDate: '2026-12-10' }, { id: 'c3', status: 'ENDED', endDate: '2026-11-01' }];
  const tasks = T.buildTeamTasks(base({ campaigns }));
  assert.deepStrictEqual(tasks.map(t => [t.id, t.team]), [['campaign:c1', 'MARKETING']]);
  assert.strictEqual(T.buildTeamTasks(base({ campaigns, can: { sales: true } })).length, 0);
});

test('T10. Her gorev turunun ekibi gecerli ve kapisi tanimli', () => {
  T.TASK_TYPE_KEYS.forEach(k => {
    assert.ok(T.TEAM_KEYS.includes(T.TASK_TYPES[k].team), k);
    assert.ok(['operations', 'sales', 'ledger', 'manage'].includes(T.TASK_TYPES[k].gate), k);
    assert.ok(T.TASK_TYPES[k].label && T.TASK_TYPES[k].target, k);
  });
});

console.log('-----------------------------------------------------------------------------');
console.log(`Sonuc: ${passed}/${passed + failed} gecti`);
if (failed > 0) process.exit(1);
