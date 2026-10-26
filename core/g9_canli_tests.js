// Gorev 9 canli kullanici incelemesi (25-26.10.2026) bulgulari agi.
//
// L-304: gider aktarimi yalniz dosya icinde kopya ariyordu; defterdeki
//   giderle ayni satir (duzeltilip yeniden yuklenen dosya, disa aktarilip
//   geri verilen defter) "eklenecek" gorunuyor ve gideri ikiliyordu.
// L-268: rezervasyonun mulku degistirilince "kaydedildi" deniyor ama eski
//   mulkte kaliyordu; cakisma kontrolu de eski mulke bakiyordu.
// L-269: gider formunda cift tiklama iki gider yaziyordu.
// L-270: WhatsApp "Sicak Lead" tarih, kisi ve tutari talebe yazmiyor (yalniz
//   not), sondaki imza adini gormuyor, telefonu bosluklu sakliyordu.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

function functionBody(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return '';
}

const TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PROP_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

function sahteDom(degerler = {}) {
  const elemanlar = new Map();
  const eleman = id => ({
    id, value: Object.prototype.hasOwnProperty.call(degerler, id) ? degerler[id] : '',
    checked: false, disabled: false,
    innerHTML: '', innerText: '', textContent: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, addEventListener() {}, removeEventListener() {},
    appendChild(c) { return c; }, removeChild(c) { return c; }, remove() {}, reset() {},
    options: [], children: [], closest: () => null,
    querySelector: () => null, querySelectorAll: () => [], focus() {}, blur() {}, scrollIntoView() {}
  });
  global.document = {
    getElementById(id) { if (!elemanlar.has(id)) elemanlar.set(id, eleman(id)); return elemanlar.get(id); },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    createElement: () => eleman(''), createElementNS: () => eleman(''), createDocumentFragment: () => eleman(''),
    createTextNode: x => ({ textContent: x }), body: eleman('body'), documentElement: eleman('html')
  };
  global.__uyarilar = [];
  global.alert = msg => { global.__sonUyari = msg; global.__uyarilar.push(msg); };
  global.confirm = () => true;
  global.requestAnimationFrame = fn => { fn(); return 1; };
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = global.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  global.window = global.window || {};
  global.window.showToast = () => {};
  return global.document;
}

function kaydedenIstemci(secimler = {}) {
  const yazmalar = [];
  const client = {
    yazmalar,
    rpc: async (ad, arg) => { yazmalar.push({ tablo: 'rpc:' + ad, islem: 'rpc', yuk: arg, filtre: [] }); return { data: secimler.rpc ? secimler.rpc(ad, arg) : [], error: null }; },
    from(tablo) {
      const k = { tablo, islem: 'select', yuk: null, filtre: [] };
      const cevap = () => {
        if (secimler.cevap) { const c = secimler.cevap(k); if (c) return c; }
        if (k.islem === 'insert' || k.islem === 'update' || k.islem === 'upsert') {
          const y = Array.isArray(k.yuk) ? k.yuk[0] : k.yuk;
          return { data: { id: 'eeeeeeee-eeee-4eee-8eee-' + String(yazmalar.length).padStart(12, '0'), ...y }, error: null };
        }
        return { data: k.islem === 'select' ? [] : null, error: null };
      };
      const q = {
        insert(y) { k.islem = 'insert'; k.yuk = y; yazmalar.push(k); return q; },
        update(y) { k.islem = 'update'; k.yuk = y; yazmalar.push(k); return q; },
        upsert(y) { k.islem = 'upsert'; k.yuk = y; yazmalar.push(k); return q; },
        delete() { k.islem = 'delete'; yazmalar.push(k); return q; },
        select() { return q; }, eq(c, v) { k.filtre.push([c, v]); return q; }, in() { return q; },
        is() { return q; }, gte() { return q; }, lte() { return q; }, lt() { return q; }, gt() { return q; },
        or() { return q; }, not() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; },
        async single() { return cevap(); },
        async maybeSingle() { return cevap(); },
        then(res, rej) { return Promise.resolve(cevap()).then(res, rej); }
      };
      return q;
    }
  };
  return client;
}

function kur(App, veri = {}, rol = 'owner', secimler) {
  App.setActiveTenant({ id: TENANT, role: rol });
  const ist = kaydedenIstemci(secimler);
  App.setSupabaseClient(ist);
  App.setAppData({
    villas: {
      DENE: { id: PROP_A, name: 'Deneme Evi', capacity: 6 },
      SEYIR: { id: PROP_B, name: 'SEYİR', capacity: 8 }
    },
    bookings: [], expenses: [], cleaningTasks: [], leads: [], operationalPeople: [], salesMembers: [],
    ...veri
  });
  return ist;
}

// ---------------------------------------------------------------------------
// L-304 gider aktarimi defterdeki kayitlara karsi kopya denetler
// ---------------------------------------------------------------------------
async function L304() {
  const E = require('./finance_import_engine.js');
  const harita = { date: 'Tarih', category: 'Kategori', amount: 'Tutar', description: 'Açıklama', property: 'Villa' };
  const satirlar = [
    { Tarih: '01.10.2026', Kategori: 'Elektrik', Tutar: '1.234,56', Açıklama: 'Ekim faturası', Villa: 'Deneme Evi' },
    { Tarih: '02.10.2026', Kategori: 'Bakım', Tutar: '500', Açıklama: 'Musluk', Villa: '' },
    { Tarih: '03.10.2026', Kategori: 'Bakım', Tutar: '750', Açıklama: 'Yeni kalem', Villa: '' }
  ];
  const props = [{ id: PROP_A, slug: 'DENE', key: 'DENE', name: 'Deneme Evi' }];
  const defter = [
    { date: '2026-10-01', category: 'Fatura', amount: 1234.56, description: 'EKİM FATURASI', propertyId: PROP_A, villa: 'DENE' },
    { date: '2026-10-02', category: 'Bakım', amount: 500, description: 'Musluk', propertyId: null, villa: 'ALL' }
  ];
  const r = E.validateExpenseRows(satirlar, harita, { properties: props, existingExpenses: defter });
  check(r.duplicateCount === 2 && r.existingDuplicateCount === 2,
    'L-304a Defterde duran iki gider mukerrer sayilir', JSON.stringify({ d: r.duplicateCount, e: r.existingDuplicateCount }));
  const yeni = r.validatedRows.filter(v => !v.isPotentialDuplicate).map(v => v.description);
  check(yeni.length === 1 && yeni[0] === 'Yeni kalem', 'L-304b Yalniz yeni satir eklenecek kalir', JSON.stringify(yeni));
  // Ayni gun, ayni tutar ama farkli aciklama ya da mulk: ayri gider, mukerrer degil.
  const r2 = E.validateExpenseRows([
    { Tarih: '02.10.2026', Kategori: 'Bakım', Tutar: '500', Açıklama: 'Musluk', Villa: 'Deneme Evi' },
    { Tarih: '02.10.2026', Kategori: 'Bakım', Tutar: '500', Açıklama: 'Kapı kolu', Villa: '' }
  ], harita, { properties: props, existingExpenses: defter });
  check(r2.duplicateCount === 0, 'L-304c Farkli mulk ya da aciklama mukerrer sayilmaz', String(r2.duplicateCount));

  // Uygulama defteri motora verir: disa aktarilip geri verilen gider defteri.
  sahteDom();
  const App = require('../app.js');
  kur(App, { expenses: defter.map((e, i) => ({ id: 'x' + i, ...e })) });
  App.parseSourceWithMode({ fileName: 'gider.csv', headers: Object.keys(satirlar[0]), rows: satirlar, sheetNames: [] }, 'EXPENSES');
  const p = App.getPendingImportData();
  const sonuc = p && p.result;
  check(sonuc && sonuc.existingDuplicateCount === 2,
    'L-304d Onizleme defterdeki giderleri mukerrer gosterir', JSON.stringify(sonuc && { d: sonuc.duplicateCount, e: sonuc.existingDuplicateCount }));
}

// ---------------------------------------------------------------------------
// L-268 rezervasyonun mulku degisir; cakisma yeni mulke gore denetlenir
// ---------------------------------------------------------------------------
const BOOK_1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const BOOK_2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
function rezervasyonSatiri(arg) {
  return {
    id: arg.p_booking_id, tenant_id: TENANT, property_id: arg.p_property_id, guest_name: arg.p_guest_name,
    guest_phone: arg.p_guest_phone, channel: arg.p_channel, check_in: arg.p_check_in, check_out: arg.p_check_out,
    pax: arg.p_pax, gross_amount: arg.p_gross_amount, ota_commission: arg.p_ota_commission,
    cleaning_fee: arg.p_cleaning_fee, discount: arg.p_discount, net_room_revenue: arg.p_net_room_revenue,
    status: arg.p_status, notes: arg.p_notes
  };
}
async function L268() {
  sahteDom();
  const App = require('../app.js');
  const mevcut = { id: BOOK_1, dbId: BOOK_1, propertyId: PROP_A, villa: 'DENE', guest: 'TEST Taşıma', checkIn: '2026-11-10', checkOut: '2026-11-12', gross: 20000, pax: 2, channel: 'Direct', status: 'CONFIRMED' };
  const girdi = { villa: 'SEYIR', guest: 'TEST Taşıma', phone: '', checkIn: '2026-11-10', checkOut: '2026-11-12', channel: 'Direct', gross: 20000, otaComm: 0, cleanFee: 0, cleanCost: null, net: 20000, pax: 2, status: 'CONFIRMED' };
  const ist = kur(App, { bookings: [{ ...mevcut }] }, 'owner', { rpc: (ad, arg) => (ad === 'update_booking_atomic' ? rezervasyonSatiri(arg) : []) });
  let sonuc = null, hata = null;
  try { sonuc = await App.updateBooking(BOOK_1, { ...girdi }); } catch (e) { hata = e; }
  const cagri = ist.yazmalar.find(k => k.tablo === 'rpc:update_booking_atomic');
  check(cagri && cagri.yuk.p_property_id === PROP_B, 'L-268a Mulk degisikligi sunucuya yeni mulkle gider', JSON.stringify(cagri && cagri.yuk.p_property_id) + (hata ? ' ' + hata.message : ''));
  check(sonuc && sonuc.propertyId === PROP_B, 'L-268b Bellekteki kayit yeni mulke tasinir', JSON.stringify(sonuc && sonuc.propertyId));
  // Planli temizlik gorevi de yeni mulke tasinir.
  const ist1b = kur(App, { bookings: [{ ...sonuc }], cleaningTasks: [{ id: 'eeeeeeee-eeee-4eee-8eee-000000000001', dbId: 'eeeeeeee-eeee-4eee-8eee-000000000001', bookingId: BOOK_1, villa: 'DENE', propertyId: PROP_A, date: '2026-11-12', status: 'PLANNED', amount: 1500, paid: false }] });
  await App.syncBookingCleaningTaskToCloud(sonuc, null);
  const tYaz = ist1b.yazmalar.find(k => k.tablo === 'cleaning_tasks' && k.islem !== 'select');
  const tYuk = tYaz && (Array.isArray(tYaz.yuk) ? tYaz.yuk[0] : tYaz.yuk);
  check(tYuk && tYuk.property_id === PROP_B, 'L-268e Temizlik gorevi yeni mulke tasinir', JSON.stringify(tYuk));

  // Yeni mulkte ayni gecelerde rezervasyon varsa tasima reddedilir, sunucuya gidilmez.
  const engel = { id: BOOK_2, dbId: BOOK_2, propertyId: PROP_B, villa: 'SEYIR', guest: 'TEST Engel', checkIn: '2026-11-11', checkOut: '2026-11-13', gross: 10000, pax: 2, status: 'CONFIRMED' };
  const ist2 = kur(App, { bookings: [{ ...mevcut }, engel] }, 'owner', { rpc: (ad, arg) => (ad === 'update_booking_atomic' ? rezervasyonSatiri(arg) : []) });
  hata = null;
  try { await App.updateBooking(BOOK_1, { ...girdi }); } catch (e) { hata = e; }
  check(hata && /çakışıyor/.test(hata.message) && !ist2.yazmalar.some(k => k.tablo === 'rpc:update_booking_atomic'),
    'L-268c Cakisma yeni mulke gore denetlenir', hata ? hata.message : 'hata yok');
  // Mulk alani gonderilmezse kayit kendi mulkunde kalir.
  const ist3 = kur(App, { bookings: [{ ...mevcut }] }, 'owner', { rpc: (ad, arg) => (ad === 'update_booking_atomic' ? rezervasyonSatiri(arg) : []) });
  const { villa, ...mulksuz } = girdi;
  await App.updateBooking(BOOK_1, mulksuz);
  const c3 = ist3.yazmalar.find(k => k.tablo === 'rpc:update_booking_atomic');
  check(c3 && c3.yuk.p_property_id === PROP_A, 'L-268d Mulk gonderilmeyen guncelleme mevcut mulku korur');
}

// ---------------------------------------------------------------------------
// L-269 gider formunda cift tiklama tek gider yazar
// ---------------------------------------------------------------------------
async function L269() {
  const App = require('../app.js');
  const deger = { expType: 'OPEX', expCategory: 'Bakım', expVilla: 'ALL', expDate: '2026-10-20', expAmount: '100', expDesc: 'TEST çift tıklama', expRecurFreq: 'NONE' };
  sahteDom(deger);
  const ist = kur(App, {});
  const dugme = { disabled: false, innerText: 'Kaydet' };
  const olay = { preventDefault() {}, target: { querySelector: () => dugme } };
  await Promise.all([App.saveExpense(olay), App.saveExpense(olay)]);
  const yazma = ist.yazmalar.filter(k => k.tablo === 'expenses' && k.islem === 'insert');
  check(yazma.length === 1, 'L-269a Ayni anda iki kaydet tek gider yazar', String(yazma.length) + ' ' + (global.__sonUyari || ''));
  check(dugme.disabled === false, 'L-269b Kayit bitince dugme yeniden etkin');
  // Kayit bittikten sonra yeni bir kaydet yine calisir.
  sahteDom(deger);
  await App.saveExpense(olay);
  check(ist.yazmalar.filter(k => k.tablo === 'expenses' && k.islem === 'insert').length === 2, 'L-269c Sonraki kayit engellenmez');
}

// ---------------------------------------------------------------------------
// L-270 WhatsApp sicak talep alanlari
// ---------------------------------------------------------------------------
const LEAD_1 = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
async function L270() {
  sahteDom();
  const App = require('../app.js');
  const villas = { DENE: { id: PROP_A, name: 'Deneme Evi' } };
  const p = App.parseWhatsAppMessageText('Merhaba, 15-18 Ağustos 2027 için 4 kişi villa fiyatı nedir? 0555 111 22 33 Ayşe', villas, '2026-10-25');
  check(p.guest === 'Ayşe', 'L-270a Mesajin sonundaki imza adi algilanir', JSON.stringify(p.guest));
  check(p.pax === 4 && p.checkIn === '2027-08-15' && p.checkOut === '2027-08-18', 'L-270b Tarih ve kisi ayristirilir', JSON.stringify(p));
  const p2 = App.parseWhatsAppMessageText('Merhaba, 15-18 Ağustos 2027 için 4 kişi fiyat nedir? Teşekkürler', villas, '2026-10-25');
  check(!p2.guest, 'L-270c Kapanis sozcugu ad sanilmaz', JSON.stringify(p2.guest));
  const p3 = App.parseWhatsAppMessageText('Merhaba, 15-18 Ağustos 2027 için 4 kişi fiyat nedir?\nAyşe Yılmaz', villas, '2026-10-25');
  check(p3.guest === 'Ayşe Yılmaz', 'L-270d Son satirdaki ad soyad algilanir', JSON.stringify(p3.guest));

  sahteDom({ waParsedGuest: 'Ayşe', waParsedVilla: 'DENE', waParsedAmount: '25000', waParsedPhone: '0555 111 22 33',
    waParsedSource: 'src-1', waParsedNotes: 'WhatsApp mesajından aktarıldı', waParsedCheckIn: '2027-08-15', waParsedCheckOut: '2027-08-18', waParsedPax: '4' });
  const ist = kur(App, {}, 'owner', { rpc: ad => (ad === 'quick_capture_lead' ? { success: true, lead_id: LEAD_1, created: true } : []) });
  await App.saveWaAsLead();
  const cagri = ist.yazmalar.find(k => k.tablo === 'rpc:quick_capture_lead');
  const a = cagri && cagri.yuk;
  check(a && a.p_check_in === '2027-08-15' && a.p_check_out === '2027-08-18' && a.p_pax === 4,
    'L-270e Tarih ve kisi talebin alanlarina yazilir', JSON.stringify(a) + ' ' + (global.__sonUyari || ''));
  check(a && a.p_phone === '05551112233', 'L-270f Telefon bosluksuz saklanir', JSON.stringify(a && a.p_phone));
  const teklif = ist.yazmalar.find(k => k.tablo === 'leads' && k.islem === 'update');
  check(teklif && teklif.yuk.quote_amount === 25000 && teklif.filtre.some(([c, v]) => c === 'id' && v === LEAD_1),
    'L-270g Tutar talebin teklif alanina yazilir', JSON.stringify(teklif));
  check(a && !/Teklif/.test(a.p_note || ''), 'L-270h Teklif alana yazildiysa nota tekrar yazilmaz', JSON.stringify(a && a.p_note));
  // Mevcut acik talebe eklenen mesaj, talebin kendi teklifini ezmez.
  sahteDom({ waParsedGuest: 'Ayşe', waParsedVilla: 'DENE', waParsedAmount: '30000', waParsedPhone: '05551112233',
    waParsedSource: 'src-1', waParsedNotes: '', waParsedCheckIn: '', waParsedCheckOut: '', waParsedPax: '' });
  const ist2 = kur(App, { leads: [{ id: LEAD_1, dbId: LEAD_1, guestName: 'Ayşe', phone: '05551112233', quote: 25000, quoteAmount: 25000, status: 'QUOTE_SENT' }] }, 'owner',
    { rpc: ad => (ad === 'quick_capture_lead' ? { success: true, lead_id: LEAD_1, created: false } : []) });
  await App.saveWaAsLead();
  const a2 = (ist2.yazmalar.find(k => k.tablo === 'rpc:quick_capture_lead') || {}).yuk;
  check(!ist2.yazmalar.some(k => k.tablo === 'leads' && k.islem === 'update') && a2 && /30.000/.test(a2.p_note || ''),
    'L-270i Mevcut talebin teklifi ezilmez, yeni tutar nota duser', JSON.stringify(a2 && a2.p_note));
}

async function main() {
  try {
    await L304();
    await L268();
    await L269();
    await L270();
  } catch (error) {
    failed++;
    console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
  } finally {
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  }
}
main();
