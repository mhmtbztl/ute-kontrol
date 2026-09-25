/**
 * LEXBNB PARA DEFTERI BUTUNLUGU (Dalga 3 — gider ve temizlik defteri)
 *
 * Kaynak taramasi degil, DAVRANIS olcumu: app.js gercekten calistirilir,
 * Supabase istemcisi her yazmayi kaydeden bir taklitle degistirilir ve
 * veritabanina KAC satir, HANGI tutarla gittigi sayilir. "Kaydedildi"
 * mesajinin dogru olup olmadigini ancak boyle gorebiliriz.
 *
 * Dis sisteme baglanmaz.
 */

const assert = require('assert');
const App = require('../app.js');

let passed = 0;
let failed = 0;

// Akisin ortasinda yakalanip console.error'a yazilan bir hata, testi yanlis
// sebeple yesil yapar (yazma hic tamamlanmadigi icin "tek yazma" tutar).
// Bu yuzden her senaryo hata gunlugu yazmadan bitmek zorundadir.
const konsolHatalari = [];
const asilHata = console.error;
async function test(name, fn) {
  konsolHatalari.length = 0;
  console.error = (...a) => { konsolHatalari.push(a.map(x => (x && x.stack) || String(x)).join(' ')); };
  try {
    await fn();
    await new Promise(r => setImmediate(r));
    console.error = asilHata;
    if (konsolHatalari.length) throw new Error('Akış hata günlüğü yazdı: ' + konsolHatalari[0]);
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error = asilHata;
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

const TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let sayac = 0;
const yeniUuid = () => `11111111-1111-4111-8111-${String(++sayac).padStart(12, '0')}`;

/**
 * Her cagriyi `kayitlar`a yazan Supabase taklidi. Donen satir, gonderilen
 * yukun kendisi + bir UUID'dir (insert/upsert), yani cagiran taraf gercek
 * istemcideki gibi `data.id` okuyabilir.
 */
function kaydedenIstemci(secenek = {}) {
  const kayitlar = [];
  const client = {
    kayitlar,
    rpc: async (ad, args) => { kayitlar.push({ tablo: null, islem: 'rpc', ad, args }); return secenek.rpc ? secenek.rpc(ad, args) : { data: null, error: null }; },
    from(tablo) {
      const k = { tablo, islem: 'select', yuk: null, filtre: [] };
      const sonuc = () => {
        if (secenek.hata && secenek.hata(k)) return { data: null, error: secenek.hata(k) };
        if (k.islem === 'insert' || k.islem === 'upsert' || k.islem === 'update') {
          const tek = Array.isArray(k.yuk) ? k.yuk[0] : k.yuk;
          return { data: { id: (tek && tek.id) || yeniUuid(), ...tek }, error: null };
        }
        if (k.islem === 'select' && secenek.okuma) return { data: secenek.okuma(k), error: null };
        return { data: k.islem === 'select' ? [] : null, error: null };
      };
      const q = {
        insert(y) { k.islem = 'insert'; k.yuk = y; kayitlar.push(k); return q; },
        upsert(y, o) { k.islem = 'upsert'; k.yuk = y; k.secenek = o; kayitlar.push(k); return q; },
        update(y) { k.islem = 'update'; k.yuk = y; kayitlar.push(k); return q; },
        delete() { k.islem = 'delete'; kayitlar.push(k); return q; },
        select() { return q; },
        eq(c, v) { k.filtre.push([c, v]); return q; },
        in(c, v) { k.filtre.push([c, v]); return q; },
        match(m) { Object.entries(m).forEach(e => k.filtre.push(e)); return q; },
        order() { return q; },
        limit() { return q; },
        range() { return q; },
        async single() { return sonuc(); },
        async maybeSingle() { return sonuc(); },
        then(res, rej) { return Promise.resolve(sonuc()).then(res, rej); }
      };
      return q;
    }
  };
  return client;
}

/** Form alanlarini okuyan fonksiyonlar icin en kucuk DOM. */
function formKur(degerler) {
  const eleman = id => ({
    id,
    value: Object.prototype.hasOwnProperty.call(degerler, id) ? degerler[id] : '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {}, dataset: {}, innerHTML: '', innerText: '', textContent: '',
    options: [], children: [],
    appendChild(c) { return c; }, removeChild(c) { return c; },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, focus() {}
  });
  const onbellek = new Map();
  global.document = {
    getElementById(id) { if (!onbellek.has(id)) onbellek.set(id, eleman(id)); return onbellek.get(id); },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => eleman(''),
    createElementNS: () => eleman(''),
    body: eleman('body'),
    documentElement: eleman('html'),
    addEventListener() {},
    createDocumentFragment: () => eleman(''),
    createTextNode: t => ({ textContent: t })
  };
  global.window = global.window || {};
  global.window.showToast = () => {};
  global.alert = () => {};
  global.requestAnimationFrame = fn => { fn(); return 1; };
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = global.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  global.confirm = () => true;
}

function ortamKur(veri, istemci) {
  App.setActiveTenant({ id: TENANT });
  App.setSupabaseClient(istemci);
  App.setAppData({
    villas: { A: { id: PROP_A, slug: 'A', name: 'Villa A' } },
    bookings: [], expenses: [], cleaningTasks: [], closedPeriods: [],
    ...veri
  });
}

const yazmalar = (istemci, tablo) =>
  istemci.kayitlar.filter(k => k.tablo === tablo && k.islem !== 'select');

(async () => {
  console.log('=============================================================================');
  console.log('LEXBNB PARA DEFTERI BUTUNLUGU');
  console.log('=============================================================================\n');

  // --- L-26: gider tek kez yazilir -------------------------------------------
  await test('L-26a Yeni gider veritabanına TEK satır olarak yazılır', async () => {
    const istemci = kaydedenIstemci();
    ortamKur({}, istemci);
    formKur({ expEditId: '', expType: 'OPEX', expCategory: 'Bakım', expVilla: 'A', expDate: '2026-09-10', expAmount: '2500', expDesc: 'Musluk' });
    await App.saveExpense();
    // Arka planda baslatilmis bir ikinci yazma varsa once bitsin.
    await new Promise(r => setImmediate(r));
    const ekler = yazmalar(istemci, 'expenses').filter(k => k.islem === 'insert' || k.islem === 'upsert');
    assert.strictEqual(ekler.length, 1, `expenses tablosuna ${ekler.length} ekleme gitti; bir gider bir satırdır`);
    assert.strictEqual(App.getAppData().expenses.length, 1, 'bellekte de tek gider olmalı');
  });

  await test('L-26b Gider düzenlemesi veritabanına TEK güncelleme gönderir', async () => {
    const istemci = kaydedenIstemci();
    const id = yeniUuid();
    ortamKur({ expenses: [{ id, dbId: id, villa: 'A', propertyId: PROP_A, date: '2026-09-10', month: '2026-09', category: 'Bakım', type: 'OPEX', amount: 2500 }] }, istemci);
    formKur({ expEditId: id, expType: 'OPEX', expCategory: 'Bakım', expVilla: 'A', expDate: '2026-09-10', expAmount: '3000', expDesc: '' });
    await App.saveExpense();
    await new Promise(r => setImmediate(r));
    const w = yazmalar(istemci, 'expenses');
    assert.strictEqual(w.length, 1, `expenses tablosuna ${w.length} yazma gitti (${w.map(x => x.islem).join(', ')})`);
    assert.strictEqual(w[0].islem, 'update');
  });

  await test('L-26c Gider silme veritabanına TEK silme gönderir', async () => {
    const istemci = kaydedenIstemci();
    const id = yeniUuid();
    ortamKur({ expenses: [{ id, dbId: id, villa: 'A', date: '2026-09-10', month: '2026-09', category: 'Bakım', type: 'OPEX', amount: 2500 }] }, istemci);
    formKur({});
    await App.deleteExpenseUI(id);
    await new Promise(r => setImmediate(r));
    const w = yazmalar(istemci, 'expenses').filter(k => k.islem === 'delete');
    assert.strictEqual(w.length, 1, `expenses tablosuna ${w.length} silme gitti`);
  });

  // --- L-32 / L-37: ekranlar ayni formulden okur ------------------------------
  // Ekim 2031: 3 gecelik rezervasyon (2 gece Ekim, 1 gece Kasim), 30.000 brut,
  // 1.500 temizlik ucreti, 3.000 indirim, 2.400 OTA; Ekim'de yapilmis 1.000 TL
  // temizlik; 500 TL elle gider.
  const EKIM = () => ({
    bookings: [{ id: 'b1', villa: 'A', propertyId: PROP_A, checkIn: '2031-10-30', checkOut: '2031-11-02',
      gross: 30000, cleanFee: 1500, discount: 3000, otaComm: 2400, status: 'CONFIRMED' }],
    cleaningTasks: [{ id: 't1', villa: 'A', propertyId: PROP_A, date: '2031-10-31', amount: 1000, status: 'DONE', paid: false }],
    expenses: [{ id: 'e1', villa: 'A', date: '2031-10-05', month: '2031-10', category: 'Bakım', type: 'OPEX', amount: 500 }]
  });
  const yakin = (a, b, m) => assert.ok(Math.abs(Number(a) - Number(b)) < 0.011, `${m}: ${a} != ${b}`);

  await test('L-32 Aylık KPI tablosu yapılmış temizliği OPEX\'e katar ve tahakkuk uygular', async () => {
    ortamKur(EKIM(), kaydedenIstemci());
    const m = App.computeMonthActuals('2031-10');
    yakin(m.ciro, (30000 - 3000) * 2 / 3, 'Ekim toplam gelir (2/3 gece)');
    yakin(m.opex, 2400 * 2 / 3 + 1000 + 500, 'Ekim OPEX = OTA payı + yapılmış temizlik + elle');
    yakin(m.roomRevenue, (30000 - 1500 - 3000) * 2 / 3, 'Ekim net oda geliri');
  });

  await test('L-37 Önceki dönem karşılaştırması aynı formülden gelir (tahakkuk + gider alanı)', async () => {
    ortamKur(EKIM(), kaydedenIstemci());
    App.setCurrentFilter({ period: '2031-11', villa: 'ALL' });
    const p = App.computePreviousPeriodTotals();
    const ekim = App.computeMonthLedger('2031-10');
    yakin(p.revenue, ekim.totalRevenue, 'önceki ay geliri = Ekim defteri');
    yakin(p.expense, ekim.totalOpex + ekim.capex, 'önceki ay gideri tanımlı ve defterle aynı');
    yakin(p.netProfit, ekim.netProfit, 'önceki ay net kâr');
  });

  await test('L-32 Seçili dönem defteri = ay defteri (Finans ekranı ile KPI tablosu aynı rakam)', async () => {
    ortamKur(EKIM(), kaydedenIstemci());
    App.setCurrentFilter({ period: '2031-10', villa: 'ALL' });
    const f = App.computeFilterLedger();
    const m = App.computeMonthLedger('2031-10');
    for (const k of ['totalRevenue', 'netRoomRevenue', 'totalOpex', 'netProfit', 'cleaningCost', 'soldNights']) {
      yakin(f[k], m[k], k);
    }
    yakin(f.adr, (30000 - 1500 - 3000) / 3, 'ADR = net oda geliri / gece');
  });

  // --- Temizlik defteri (K-04 durum modeli, L-27 … L-31) ------------------------
  const TASK_DB = '22222222-2222-4222-8222-000000000001';
  const TASK_DB2 = '22222222-2222-4222-8222-000000000002';
  const REZ = '33333333-3333-4333-8333-000000000001';
  const gorev = (ek) => ({ id: TASK_DB, dbId: TASK_DB, villa: 'A', propertyId: PROP_A, date: '2026-09-10',
    cleaner: 'Ayşe', amount: 1200, paid: false, status: 'DONE', ...ek });
  const gorevYazmalari = ist => yazmalar(ist, 'cleaning_tasks').filter(k => k.islem === 'upsert');
  const soruKur = (cevaplar) => {
    const kuyruk = cevaplar.slice();
    global.prompt = () => (kuyruk.length ? kuyruk.shift() : null);
    global.confirm = () => true;
  };

  await test('L-29 "1.500" bin beş yüz olarak DOĞRU göreve yazılır (1,5 TL değil, ilk görev değil)', async () => {
    const ist = kaydedenIstemci();
    ortamKur({ cleaningTasks: [gorev({ id: TASK_DB2, dbId: TASK_DB2, amount: 900 }), gorev()] }, ist);
    formKur({}); soruKur(['1.500']);
    await App.promptEditTaskAmount(TASK_DB);
    const w = gorevYazmalari(ist);
    assert.strictEqual(w.length, 1, `${w.length} görev yazması`);
    assert.strictEqual(w[0].yuk.id, TASK_DB, 'yanlış görev güncellendi');
    assert.strictEqual(w[0].yuk.amount, 1500, `tutar ${w[0].yuk.amount}`);
  });

  await test('K-04 "Ödendi" yalnız görevi yazar; gider defterine satır YAZMAZ', async () => {
    const ist = kaydedenIstemci();
    ortamKur({ cleaningTasks: [gorev()] }, ist);
    formKur({}); soruKur([]);
    await App.toggleTaskPaid(TASK_DB);
    const w = gorevYazmalari(ist);
    assert.strictEqual(w.length, 1);
    assert.strictEqual(w[0].yuk.is_paid, true);
    assert.strictEqual(w[0].yuk.status, 'DONE');
    assert.strictEqual(yazmalar(ist, 'expenses').length, 0, 'gider tablosuna yazma gitti');
  });

  await test('K-04 Planlı görev ödenirken önce "yapıldı" olur ve yapıldığı güne taşınır', async () => {
    const ist = kaydedenIstemci();
    ortamKur({ cleaningTasks: [gorev({ status: 'PLANNED', date: '2026-09-10' })] }, ist);
    formKur({}); soruKur(['2026-09-12']);
    await App.toggleTaskPaid(TASK_DB);
    const y = gorevYazmalari(ist)[0].yuk;
    assert.strictEqual(y.status, 'DONE');
    assert.strictEqual(y.task_date, '2026-09-12', 'gider yapıldığı günün ayına yazılmalı');
    assert.strictEqual(y.is_paid, true);
  });

  await test('K-04 "Tüm borcu öde" yalnız YAPILMIŞ temizlikleri öder; planlıya dokunmaz', async () => {
    const ist = kaydedenIstemci();
    ortamKur({ cleaningTasks: [gorev(), gorev({ id: TASK_DB2, dbId: TASK_DB2, status: 'PLANNED' })] }, ist);
    formKur({}); soruKur([]);
    await App.payAllPendingCleaning();
    const w = gorevYazmalari(ist);
    assert.strictEqual(w.length, 1, `${w.length} görev yazıldı`);
    assert.strictEqual(w[0].yuk.id, TASK_DB);
    assert.strictEqual(yazmalar(ist, 'expenses').length, 0);
  });

  await test('K-04 Eski EXP-CLEAN satırı olan görev "borç"a alınırsa eski satır silinir', async () => {
    const ist = kaydedenIstemci();
    ortamKur({
      cleaningTasks: [gorev({ paid: true })],
      expenses: [{ id: 'e-eski', legacyId: 'EXP-CLEAN-' + TASK_DB, villa: 'A', date: '2026-09-15', category: 'Temizlik', type: 'OPEX', amount: 1200 }]
    }, ist);
    formKur({}); soruKur([]);
    await App.toggleTaskPaid(TASK_DB);
    const sil = yazmalar(ist, 'expenses').filter(k => k.islem === 'delete');
    assert.strictEqual(sil.length, 1, 'eski gider satırı silinmeli');
    assert.ok(sil[0].filtre.some(([k, v]) => k === 'legacy_id' && v === 'EXP-CLEAN-' + TASK_DB));
  });

  await test('L-30 Temizlik silme veritabanını BEKLER; hata olursa kayıt ekrandan kalkmaz', async () => {
    const ist = kaydedenIstemci({ hata: k => (k.tablo === 'cleaning_tasks' && k.islem === 'delete') ? { message: 'CLOSED_PERIOD_VIOLATION' } : null });
    ortamKur({ cleaningTasks: [gorev()] }, ist);
    formKur({}); soruKur([]);
    const mesajlar = [];
    global.window.showToast = (m, tur) => mesajlar.push({ m, tur });
    const sonuc = await App.deleteCleaningTask(TASK_DB);
    konsolHatalari.length = 0; // beklenen hata mesaji
    assert.strictEqual(sonuc, false, 'başarısız silme false dönmeli');
    assert.ok(!mesajlar.some(x => /silindi/.test(x.m)), '"silindi" dendi: ' + JSON.stringify(mesajlar));
    assert.ok(mesajlar.some(x => x.tur === 'error' && /CLOSED_PERIOD/.test(x.m)), 'hata kullanıcıya gösterilmeli');
  });

  await test('L-30 Başarılı silme görev satırını ve eski gider satırını veritabanından siler', async () => {
    const ist = kaydedenIstemci();
    ortamKur({
      cleaningTasks: [gorev({ paid: true })],
      expenses: [{ id: 'e-eski', legacyId: 'EXP-CLEAN-' + TASK_DB, villa: 'A', date: '2026-09-15', category: 'Temizlik', type: 'OPEX', amount: 1200 }]
    }, ist);
    formKur({}); soruKur([]);
    assert.strictEqual(await App.deleteCleaningTask(TASK_DB), true);
    assert.strictEqual(yazmalar(ist, 'cleaning_tasks').filter(k => k.islem === 'delete').length, 1);
    assert.strictEqual(yazmalar(ist, 'expenses').filter(k => k.islem === 'delete').length, 1);
    assert.strictEqual(App.getAppData().cleaningTasks.length, 0);
    assert.strictEqual(App.getAppData().expenses.length, 0);
  });

  await test('L-27/L-28 Rezervasyon kaydı görevi booking_id ve MALİYETLE, planlı olarak yazar', async () => {
    const ist = kaydedenIstemci();
    const rez = { id: REZ, villa: 'A', guest: 'Ada', checkIn: '2026-09-20', checkOut: '2026-09-23', cleanFee: 1500, status: 'CONFIRMED' };
    ortamKur({ bookings: [rez] }, ist);
    formKur({});
    const uyari = await App.syncBookingCleaningTaskToCloud(rez, 1200);
    assert.strictEqual(uyari, '');
    const w = gorevYazmalari(ist);
    assert.strictEqual(w.length, 1);
    assert.strictEqual(w[0].yuk.booking_id, REZ, 'booking_id yazılmalı (L-28)');
    assert.strictEqual(w[0].yuk.amount, 1200, 'maliyet ücretten değil girilen maliyetten (L-27)');
    assert.strictEqual(w[0].yuk.status, 'PLANNED', 'rezervasyon kaydı gider yazmaz (K-04)');
    assert.strictEqual(w[0].yuk.task_date, '2026-09-23');
    assert.strictEqual(yazmalar(ist, 'expenses').length, 0);
  });

  await test('L-27 Maliyeti girilmemiş rezervasyonda ücret maliyet diye KOPYALANMAZ, görev uydurulmaz', async () => {
    const ist = kaydedenIstemci();
    const rez = { id: REZ, villa: 'A', guest: 'Ada', checkIn: '2026-09-20', checkOut: '2026-09-23', cleanFee: 1500, status: 'CONFIRMED' };
    ortamKur({ bookings: [rez] }, ist);
    App.syncBookingCleaningTasks();
    assert.strictEqual(App.getAppData().cleaningTasks.length, 0, 'bellekte görev uyduruldu');
    assert.strictEqual(App.getAppData().bookings[0].cleanCost, null, 'maliyet bilinmiyor olmalı, ücret değil');
    await App.syncBookingCleaningTaskToCloud(rez, null);
    assert.strictEqual(gorevYazmalari(ist)[0].yuk.amount, 0, 'tutar boş (0 = girilmedi), ücret değil');
  });

  await test('K-04 İptal edilen rezervasyonun planlı temizliği "yapılmadı" olur (ne gider ne borç)', async () => {
    const ist = kaydedenIstemci();
    const rez = { id: REZ, villa: 'A', guest: 'Ada', checkIn: '2026-09-20', checkOut: '2026-09-23', status: 'CANCELLED' };
    ortamKur({ bookings: [rez], cleaningTasks: [gorev({ bookingId: REZ, status: 'PLANNED' })] }, ist);
    await App.syncBookingCleaningTaskToCloud(rez, 1200);
    const w = gorevYazmalari(ist);
    assert.strictEqual(w.length, 1);
    assert.strictEqual(w[0].yuk.status, 'SKIPPED');
  });

  await test('K-04 Yapılmış temizlik rezervasyon düzenlemesiyle DEĞİŞMEZ; kullanıcıya söylenir', async () => {
    const ist = kaydedenIstemci();
    const rez = { id: REZ, villa: 'A', guest: 'Ada', checkIn: '2026-09-20', checkOut: '2026-09-25', status: 'CONFIRMED' };
    ortamKur({ bookings: [rez], cleaningTasks: [gorev({ bookingId: REZ, status: 'DONE', amount: 1200 })] }, ist);
    const uyari = await App.syncBookingCleaningTaskToCloud(rez, 1800);
    assert.strictEqual(gorevYazmalari(ist).length, 0, 'yapılmış görev yazıldı');
    assert.match(uyari, /yapıldı olarak işaretli/);
  });

  // --- L-33 / L-34 / L-35: rezervasyon kaydi --------------------------------
  const REZ_GIRDI = { villa: 'A', guest: 'Ada', checkIn: '2031-02-10', checkOut: '2031-02-12', pax: 2, gross: 10000, status: 'CONFIRMED' };

  await test('L-33 Düzenleme net_room_revenue\'yu yükleyiciyle AYNI tanımla yazar (indirim düşülür)', async () => {
    const y = App.mapBookingToDb({ gross: 40000, otaComm: 6000, cleanFee: 1500, discount: 2000, net: 32500, villa: 'A' }, TENANT);
    assert.strictEqual(y.net_room_revenue, 30500);
  });

  await test('L-34 RPC reddi doğrudan insert\'e DÜŞMEZ; RPC\'nin sebebi kullanıcıya gider', async () => {
    const ist = kaydedenIstemci({ rpc: () => ({ data: null, error: { code: '42501', message: 'FORBIDDEN_ROLE: yetki yok' } }) });
    ortamKur({}, ist);
    formKur({});
    await assert.rejects(App.createBooking({ ...REZ_GIRDI }), /FORBIDDEN_ROLE/);
    konsolHatalari.length = 0;
    assert.strictEqual(yazmalar(ist, 'bookings').length, 0, 'ikinci yol (insert) çalıştı');
  });

  await test('L-35 Kayıt yazıldıktan sonraki ekran hatası kaydı "başarısız" göstermez', async () => {
    const ist = kaydedenIstemci({ rpc: (ad, a) => ({ data: { id: REZ, tenant_id: TENANT, property_id: PROP_A, guest_name: 'Ada',
      check_in: a.p_check_in, check_out: a.p_check_out, gross_amount: 10000, pax: 2, status: 'CONFIRMED', booking_code: 'X' }, error: null }) });
    ortamKur({}, ist);
    formKur({});
    const asil = global.document.getElementById;
    global.document.getElementById = () => { throw new Error('ekran bozuk'); };
    try {
      const b = await App.createBooking({ ...REZ_GIRDI });
      assert.strictEqual(b.id, REZ);
    } finally { global.document.getElementById = asil; konsolHatalari.length = 0; }
  });

  await test('L-36 Portföy geneli gider mülk görünümlerine TEKRAR TEKRAR düşmez', async () => {
    const PROP_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    ortamKur({
      villas: { A: { id: PROP_A, slug: 'A', name: 'A' }, B: { id: PROP_B, slug: 'B', name: 'B' } },
      bookings: [
        { id: 'a1', villa: 'A', propertyId: PROP_A, checkIn: '2031-03-01', checkOut: '2031-03-03', gross: 14000, status: 'CONFIRMED' },
        { id: 'b1', villa: 'B', propertyId: PROP_B, checkIn: '2031-03-05', checkOut: '2031-03-07', gross: 19000, status: 'CONFIRMED' }
      ],
      expenses: [
        { id: 'x1', villa: 'ALL', date: '2031-03-10', month: '2031-03', type: 'OPEX', amount: 1000 },
        { id: 'x2', villa: 'A', date: '2031-03-10', month: '2031-03', type: 'OPEX', amount: 500 }
      ]
    }, kaydedenIstemci());
    const kar = villa => { App.setCurrentFilter({ period: '2031-03', villa }); return App.computeFilterLedger().netProfit; };
    const portfoy = kar('ALL'), a = kar('A'), b = kar('B');
    yakin(portfoy, 33000 - 1500, 'portföy');
    yakin(a, 14000 - 500, 'A yalnız kendi gideri');
    yakin(b, 19000, 'B ortak gideri taşımaz');
    yakin(a + b - 1000, portfoy, 'mülkler + ortak gider = portföy');
    const aylik = App.computeMonthLedger('2031-03', 'A');
    yakin(aylik.netProfit, a, 'ay defteri mülk filtresinde aynı');
    App.setCurrentFilter({ period: '2031-03', villa: 'ALL' });
  });

  await test('L-38 Mülkler yüklenmeden eşlenen gider, yükleme bitince mülküne bağlanır', async () => {
    App.setAppData({ villas: {} });
    const erken = App.mapExpenseFromDb({ id: 'e1', tenant_id: TENANT, property_id: PROP_A, expense_date: '2031-03-10',
      category: 'Bakım', expense_type: 'OPEX', amount: 500 });
    assert.notStrictEqual(erken.villa, 'A', 'ön koşul: yarışta kısa ad çözülemiyor');
    const [bagli] = App.attachBookingVillaSlugs([erken], { A: { id: PROP_A, slug: 'A' } });
    assert.strictEqual(bagli.villa, 'A');
    const kaynak = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
    assert.match(kaynak, /expenses: expensesWithSlugs/);
    assert.match(kaynak, /leads: leadsWithSlugs/);
  });

  await test('L-38 loadExpenses hatayı YUTMAZ (eski listeyi "yüklendi" diye döndürmez)', async () => {
    const ist = kaydedenIstemci({ hata: k => (k.tablo === 'expenses' ? { message: 'bağlantı koptu' } : null) });
    ortamKur({ expenses: [{ id: 'eski', villa: 'A', amount: 1 }] }, ist);
    await assert.rejects(App.loadExpenses(TENANT));
    konsolHatalari.length = 0;
  });

  await test('L-31 Görev uyduran villa düzeyi fonksiyonlar yok', async () => {
    assert.strictEqual(App.toggleCleaningPaid, undefined);
    assert.strictEqual(App.promptEditCleaningAmount, undefined);
  });

  console.log(`\n${passed} geçti, ${failed} başarısız`);
  if (failed > 0) process.exit(1);
})();
