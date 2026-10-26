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
// L-305: rezervasyon aktarim onizlemesi kisi sayisi eksikligini ve mulk
//   takvimindeki cakismayi gormuyor, yazma ham Postgres hatasiyla dusuyordu.
// L-302: rezervasyon, gider ve temizlik aramalari toLowerCase kullaniyor; SEYİR/ÇİFT
//   gibi Turkce buyuk harfli kayitlar kucuk harfle bulunmuyordu.
// L-308: iki ayri bos gece tanimi; Bugun firsati ve misafire giden metin 1-4 gece,
//   sabit %20 ile takvimle (en cok 2 gece, ozel gun, taban) celisiyordu.
// L-272: kanal eklenince "Cannot read properties of null (reading 'reset')";
//   await sonrasi olayin currentTarget'i bosaliyordu.
// L-273: kisi sayisi pax'ta, ama phase10'un guest_count/adults sutunlari varsayilan
//   2 kaliyor ve misafir mesaj motoru once guest_count'u okuyordu.
// L-274: iptal edilen kaporali rezervasyonun detayi "Tahsil edilecek 20.000 · Kalan
//   15.000" diyordu; iade/mahsup soylenmiyordu.
// L-275: kanal ekonomisinde Dogrudan adedi 0; toplu aktarim ozetleri donem
//   suzulmeden tum gecmisten sayilip adetten dusuluyordu.
// L-276: gelecek tarihli satisa kapatan bakim bugun "Acik ariza mulku satisa
//   kapatiyor" diye kritik eylemde ve bildirimde gorunuyordu.
// L-278: uygulama ici rezervasyon sablonu degistirilmeden yuklenince Gider Defteri
//   saniliyordu (yalniz baslikli Excel'de basliklar okunmuyordu).
// L-279: talep neden secilmeden Kaybedildi kaydediliyor, DB'ye lost_reason "-"
//   (kanbandan "Diger") yaziliyordu.
// L-280: Bugun kartlari giris/cikis yapildiktan sonra da "Giris 1" diyordu; giris
//   gunu "Cikis Yapti" uyarisiz kabul ediliyor, temizlik eski cikis gununde kaliyordu.
// L-281: "Arsivle" cozulmus onarimi IPTAL yapiyordu; genel gorev iptali onay sormuyor,
//   iptal edilen gorev arayuzde hic gorunmuyordu.
// L-282: kapatilan talep kaynaginin adi gecmis talep satirinda kayboluyordu
//   (yalniz etkin kaynaklar yukleniyordu).
// L-283: dolu formda tarayici geri tusu veriyi uyarisiz siliyordu (beforeunload yok).
// L-284: rezervasyon listesi ozeti iptal kayitlari rezervasyon sayiyordu.
// L-292: bilinmeyen deger 0 yaziliyordu (teklif, ariza maliyeti) ve "−0 ₺" gosteriliyordu.
// L-298: odemeli rezervasyon silinirken once "emin misiniz?" soruluyor, sonra reddediliyordu.
// L-296: rezervasyon detay paneli silmeden sonra ve sekme degisince acik kaliyordu.
// L-297: sifirlama menusu admin rolune de gorunuyordu (yalniz owner calistirabilir).
// L-303: misafir aramasi "0555 000 00 02" / "+90 555 000 00 02" bicimli telefonu bulmuyordu.
// L-306: ice aktarma onizlemesi tutarlari kurussuz yuvarliyordu (101,50 -> "102").
// L-307: ayni adrese ikinci davet rolu sessizce degistiriyor, mesaj yine "Davet e-postasi
//   gonderildi" diyordu.
// L-309: fiyat kurali -%100'e kadar kabul ediliyor; tabansiz mulkte oneri 0'a iniyordu.
// L-310: yillik hedef karti tek ayin hedefini yilin tum cirosuyla oranliyordu (%1315).
// L-299: Finans'ta "Hedefin %70 altinda" yesil; "Kapsama: %60" anlasilmiyor; huni
//   snapshot'i gelecek gunleri kapsayan donemi kabul ediyordu.
// L-291: ice aktarma: gecmis yenilenmiyor, geri alma sonucu ve donem donusu yok, kayitlari
//   silinmis parti "geri alinamaz" diyor, gelecek tarihli aktarilan rezervasyona temizlik acilmiyordu.
// L-293: "+1 yalniz fiyat sorusu" sayaci 0 iken Geri al "Girilen degerlerden biri gecersiz" diyordu.
// L-294: ariza duzenleme penceresindeki "Sorumlu" alani atanan ustayi gostermiyordu.
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
        neq() { return q; }, ilike() { return q; }, like() { return q; }, contains() { return q; }, filter() { return q; }, match() { return q; },
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
    bookingPayments: [], bookingPaymentBalances: [], maintenanceTickets: [], maintenance: [], operationalTasks: [],
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

// ---------------------------------------------------------------------------
// L-305 rezervasyon aktarim onizlemesi kisi sayisini ve takvim cakismasini gorur
// ---------------------------------------------------------------------------
async function L305() {
  const E = require('./finance_import_engine.js');
  const props = [{ id: PROP_A, slug: 'DENE', key: 'DENE', name: 'Deneme Evi' }];
  const harita = { property: 'Villa', guest: 'Misafir Adı', checkIn: 'Giriş', checkOut: 'Çıkış', gross: 'Brüt', pax: 'Kişi Sayısı', status: 'Durum' };
  const { pax: _p, ...paxsiz } = harita;
  const satir = (g, c, ad, ek = {}) => ({ Villa: 'Deneme Evi', 'Misafir Adı': ad, Giriş: g, Çıkış: c, Brüt: '9000', 'Kişi Sayısı': '2', Durum: '', ...ek });
  const r1 = E.validateBookingRows([satir('2026-12-10', '2026-12-12', 'TEST Paxsız')], paxsiz, { properties: props });
  check(r1.validCount === 0 && r1.errors.length === 1 && /Kişi sayısı/.test(r1.errors[0].errors.join(' ')),
    'L-305a Kisi sayisi olmayan satir onizlemede reddedilir (varsayilmaz)', JSON.stringify(r1.errors));
  const mevcut = [{ propertyId: PROP_A, villa: 'DENE', guest: 'TEST Mevcut', checkIn: '2026-12-02', checkOut: '2026-12-04', gross: 18000, pax: 2, status: 'CONFIRMED' }];
  const r2 = E.validateBookingRows([
    satir('2026-12-03', '2026-12-05', 'TEST Çakışan'),
    satir('2026-12-03', '2026-12-05', 'TEST İptal', { Durum: 'CANCELLED' }),
    satir('2026-12-01', '2026-12-02', 'TEST Bitişik')
  ], harita, { properties: props, existingBookings: mevcut });
  const cak = r2.validatedRows.find(v => v.guest === 'TEST Çakışan');
  check(cak && cak.hasLedgerOverlap === true && (r2.overlaps || []).some(o => /TEST Mevcut/.test(o.errors.join(' '))),
    'L-305b Mulk takvimindeki rezervasyonla cakisan satir isaretlenir ve nedeni yazilir', JSON.stringify(r2.overlaps));
  check(!r2.validatedRows.find(v => v.guest === 'TEST İptal').hasLedgerOverlap && !r2.validatedRows.find(v => v.guest === 'TEST Bitişik').hasLedgerOverlap,
    'L-305c Iptal satir ve mevcut girisin gunu cikan satir cakisma sayilmaz');

  // Uygulama: Kisi Sayisi sutunu yoksa zorunlu sutun eksik der; cakisan satir yazilacaklara girmez.
  const dom = sahteDom();
  const App = require('../app.js');
  kur(App, { bookings: mevcut.map((b, i) => ({ id: 'b' + i, ...b })) });
  const basliklar = ['Villa', 'Misafir Adı', 'Giriş Tarihi', 'Çıkış Tarihi', 'Brüt Tutar'];
  App.parseSourceWithMode({ fileName: 'rez.csv', headers: basliklar, rows: [{ Villa: 'Deneme Evi', 'Misafir Adı': 'TEST', 'Giriş Tarihi': '2026-12-10', 'Çıkış Tarihi': '2026-12-12', 'Brüt Tutar': '9000' }], sheetNames: [] }, 'BOOKINGS');
  const btn = dom.getElementById('importConfirmBtn');
  check(btn.disabled === true && /Zorunlu/.test(btn.innerText) && /Kişi Sayısı/.test(dom.getElementById('importPreviewTableBody').innerHTML),
    'L-305d Kisi Sayisi sutunu olmayan dosya zorunlu sutun eksik der', btn.innerText);
  sahteDom();
  kur(App, { bookings: mevcut.map((b, i) => ({ id: 'b' + i, ...b })) });
  const b2 = basliklar.concat('Kişi Sayısı');
  App.parseSourceWithMode({ fileName: 'rez.csv', headers: b2, rows: [{ Villa: 'Deneme Evi', 'Misafir Adı': 'TEST Çakışan', 'Giriş Tarihi': '2026-12-03', 'Çıkış Tarihi': '2026-12-05', 'Brüt Tutar': '9000', 'Kişi Sayısı': '2' }], sheetNames: [] }, 'BOOKINGS');
  const st = global.document.getElementById('importFileStats').innerText;
  check(/0 kayıt eklenecek/.test(st) && /çakışma/.test(st), 'L-305e Onizleme cakisan satiri eklenecek saymaz', st);
  const G = require('./import_template_guide.js');
  check(/ZORUNLU:[^.]*Kişi Sayısı/.test(G.buildGuide('BOOKINGS', {}).steps.join(' ')), 'L-305f Sablon rehberi kisi sayisini zorunlu yazar');
}

// ---------------------------------------------------------------------------
// L-302 aramalar Turkce buyuk/kucuk harfi esler; Ingilizce adlar bozulmaz
// ---------------------------------------------------------------------------
async function L302() {
  sahteDom();
  const App = require('../app.js');
  kur(App, {});
  const rez = { villa: 'SEYIR', guest: 'TEST-EK İĞÜŞÖÇ O\'Brien <b>KALIN</b>', channel: 'Booking' };
  const rezAra = q => typeof App.reservationSearchMatches === 'function' && App.reservationSearchMatches(rez, q);
  check(['seyir', 'Seyir', 'SEYİR', 'iğüşöç', 'test-ek iğ', 'kalın', 'KALIN', 'o\'brien', 'booking', 'BOOKING'].every(rezAra),
    'L-302a Rezervasyon aramasi mulk, misafir ve kanalda harf buyuklugunden bagimsiz', ['seyir', 'iğüşöç', 'kalın'].map(q => q + '=' + rezAra(q)).join(' '));
  check(!rezAra('zirve'), 'L-302b Eslesmeyen arama elenir');
  const gider = { description: 'TEST-EK çift tıklama', category: 'Bakım' };
  const giderAra = q => typeof App.expenseSearchMatches === 'function' && App.expenseSearchMatches(gider, q);
  check(['ÇİFT', 'TIKLAMA', 'çift', 'tıklama', 'BAKIM', 'bakım'].every(giderAra), 'L-302c Gider aramasi Turkce harfleri esler',
    ['ÇİFT', 'TIKLAMA', 'BAKIM'].map(q => q + '=' + giderAra(q)).join(' '));
  const gorev = { villa: 'SEYIR', guest: 'İĞÜŞÖÇ', cleaner: 'Invoice Team', notes: 'ZİRVE çıkış' };
  const tAra = q => typeof App.cleaningTaskSearchMatches === 'function' && App.cleaningTaskSearchMatches(gorev, q);
  check(['seyir', 'iğüşöç', 'zirve', 'invoice', 'INVOICE', 'Invoice'].every(tAra), 'L-302d Temizlik aramasi Turkce harfleri ve Ingilizce adlari esler',
    ['seyir', 'iğüşöç', 'zirve', 'invoice'].map(q => q + '=' + tAra(q)).join(' '));
  // Talep ve misafir aramasi ayni katlamayi kullanir; Ingilizce "I" bozulmaz.
  const ST = require('./search_text.js');
  check(ST.fold('SEYİR') === ST.fold('seyir') && ST.fold('Invoice') === ST.fold('invoice') && ST.fold('Bozatlı') === ST.fold('bozatli'),
    'L-302e Ortak katlama iki tarafi ayni anahtara indirir');
  const G = require('./guest_crm_engine.js');
  const satir = { name: 'Mehmet BOZATLI', phone: '', email: 'INFO@EXAMPLE.COM', bookings: [], lifecycle: { code: 'POST_STAY' } };
  check(G.filterGuestRows([satir], { query: 'bozatli' }).length === 1 && G.filterGuestRows([satir], { query: 'info@example' }).length === 1,
    'L-302f Misafir aramasi ayni katlamayi kullanir (sapkasiz yazim, Ingilizce I)');
  const src = read('app.js');
  const leadGovde = functionBody(src, 'function renderManageLeadsTable(');
  check(/LexbnbSearchText|searchFold|searchMatches/.test(leadGovde), 'L-302g Talep aramasi ortak katlamayi kullanir');
  check(/core\/search_text\.js\?v=/.test(read('index.html')) && read('index.html').indexOf('core/search_text.js') < read('index.html').indexOf('core/guest_crm_engine.js'),
    'L-302h Katlama modulu misafir motorundan once yuklenir');
}

// ---------------------------------------------------------------------------
// L-308 bos gece tek tanim: fiyat takvimi (gapDates + takvim fiyati)
// ---------------------------------------------------------------------------
function gunEkle(gun, n) { const d = new Date(gun + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
async function L308() {
  sahteDom();
  const App = require('../app.js');
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const r = (ad, g, c) => ({ id: 'r-' + ad, villa: 'DENE', propertyId: PROP_A, guest: ad, checkIn: gunEkle(bugun, g), checkOut: gunEkle(bugun, c), gross: 1000, pax: 2, status: 'CONFIRMED' });
  kur(App, {
    villas: { DENE: { id: PROP_A, name: 'Deneme Evi', capacity: 6, basePrice: 10000, isActive: true } },
    bookings: [r('A', 10, 14), r('B', 15, 20), r('C', 24, 28)],
    tenantSettings: {}, propertyPricingRules: []
  });
  const gaps = App.detectGapNights();
  const takvim = App.computePricingCalendar({ key: 'DENE', property: App.getAppData().villas.DENE }, bugun);
  const takvimBos = takvim.suggestions.gapDates;
  check(gaps.length === 1 && gaps[0].checkIn === gunEkle(bugun, 14) && gaps[0].checkOut === gunEkle(bugun, 15) && gaps[0].nights === 1,
    'L-308a Firsat listesi yalniz takvimin bos gecelerini sayar (4 gecelik bosluk bos gece degil)', JSON.stringify(gaps.map(g => [g.checkIn, g.nights])) + ' takvim ' + JSON.stringify(takvimBos));
  const gun = takvim.suggestions.days.find(d => d.date === gunEkle(bugun, 14));
  check(gaps[0] && gun && gaps[0].discountPrice === gun.price, 'L-308b Firsat fiyati takvimin o gece onerdigi fiyattir', JSON.stringify({ firsat: gaps[0] && gaps[0].discountPrice, takvim: gun && gun.price }));
  check(gaps[0] && gaps[0].regularPrice > gaps[0].discountPrice && gaps[0].discountPct === Math.round((1 - gaps[0].discountPrice / gaps[0].regularPrice) * 100),
    'L-308c Liste fiyati ayni takvimin bos gece kurali olmadan fiyati; indirim orani ondan', JSON.stringify(gaps[0]));
  const src = read('app.js');
  check(!/regularTotal \* 0\.8/.test(src), 'L-308d Sabit %20 indirim kalmadi');
  // Minimum gece kurali bosluga izin vermiyorsa firsat da yoktur (KF-6).
  App.getAppData().tenantSettings = { pricing_min_stay: { rules: [{ id: 'k', name: 'Kural', propertyId: PROP_A, start: null, end: null, minNights: 2, enabled: true }] } };
  check(App.detectGapNights().length === 0, 'L-308e Minimum gece kuralina takilan bosluk firsat sayilmaz');
}

// ---------------------------------------------------------------------------
// L-272 kanal ekleme: await sonrasi event.currentTarget bos
// ---------------------------------------------------------------------------
async function L272() {
  const dom = sahteDom({ newBookingChannelName: 'TEST Kanal', newBookingChannelType: 'OTA', newBookingChannelRate: '12' });
  const App = require('../app.js');
  kur(App, {}, 'owner', { rpc: ad => (ad === 'save_tenant_booking_channel' ? { id: 'c1', display_name: 'TEST Kanal', code: 'CUSTOM_C1' } : []) });
  let sifirlandi = false;
  const form = { reset() { sifirlandi = true; }, querySelector: () => ({ disabled: false }) };
  // Tarayici: olay isleyicisi ilk await'ten sonra currentTarget null olur.
  let erisim = 0;
  const olay = { preventDefault() {}, get currentTarget() { erisim++; return erisim === 1 ? form : null; } };
  await App.createBookingChannelFromSettings(olay);
  check(sifirlandi, 'L-272a Kanal kaydedilince form sifirlanir (await sonrasi null currentTarget hatasi yok)');
}

// ---------------------------------------------------------------------------
// L-273 kisi sayisinin tek kaynagi pax
// ---------------------------------------------------------------------------
async function L273() {
  const M = require('./guest_messaging_engine.js');
  // phase10'un guest_count sutunu uygulamaca yazilmaz, varsayilani 2 kalir.
  const c = M.buildTemplateContext({ guest_name: 'TEST Ayşe', check_in: '2026-11-10', check_out: '2026-11-12', pax: 7, guest_count: 2 });
  check(String(c.guest_count) === '7', 'L-273a Mesaj sablonundaki kisi sayisi pax\'tan gelir (guest_count varsayilani 2 degil)', String(c.guest_count));
  const c2 = M.buildTemplateContext({ guest_name: 'TEST', check_in: '2026-11-10', check_out: '2026-11-12' });
  check(c2.guest_count === '', 'L-273b Kisi sayisi bilinmiyorsa 2 uydurulmaz', JSON.stringify(c2.guest_count));
}

// ---------------------------------------------------------------------------
// L-274 iptal edilen kaporali rezervasyon tahsilat beklemez, iade/mahsup soylenir
// ---------------------------------------------------------------------------
async function L274() {
  sahteDom();
  const App = require('../app.js');
  let panel = null;
  global.SidePanel = { open(o) { panel = o; }, close() {} };
  const rez = { id: BOOK_1, dbId: BOOK_1, propertyId: PROP_A, villa: 'DENE', guest: 'TEST Kısmi', checkIn: '2026-11-20', checkOut: '2026-11-22', gross: 20000, pax: 2, channel: 'Direct', status: 'CANCELLED' };
  kur(App, {
    bookings: [rez],
    bookingPayments: [{ id: 'p1', booking_id: BOOK_1, kind: 'DEPOSIT', amount: 5000, paid_on: '2026-10-20', method: 'CASH' }],
    bookingPaymentBalances: [{ booking_id: BOOK_1, amount_due: 20000, paid_total: 5000, remaining: 15000 }]
  });
  App.openBookingDetailsPanel(BOOK_1);
  const html = panel ? panel.bodyHtml : '';
  check(!/Kalan<\/span><strong>15\.000/.test(html) && !/Tahsil edilecek<\/span><strong>20\.000/.test(html),
    'L-274a Iptal rezervasyonda tahsil edilecek ve kalan gosterilmez', (html.match(/booking-payment-summary[\s\S]{0,400}/) || [''])[0]);
  check(/iade/i.test(html) && /5\.000/.test(html), 'L-274b Alinan kapora icin iade/mahsup uyarisi cikar');
  check(!/data-onclick="saveBookingPayment/.test(html), 'L-274c Iptal rezervasyona yeni tahsilat formu sunulmaz');
  // Iptal edilmemis rezervasyonda ozet aynen kalir.
  App.getAppData().bookings[0].status = 'CONFIRMED';
  App.openBookingDetailsPanel(BOOK_1);
  check(/Kalan<\/span><strong>15\.000/.test(panel.bodyHtml), 'L-274d Aktif rezervasyonda kalan tutar gorunur');
  delete global.SidePanel;
  check(/CANCELLED[\s\S]{0,300}paid_total[\s\S]{0,300}iade/.test(functionBody(read('app.js'), 'async function saveBooking(')), 'L-274e Iptal kaydedilirken tahsilat varsa iade/mahsup notu verilir');
}

// ---------------------------------------------------------------------------
// L-275 kanal ekonomisi: donem disindaki toplu aktarim ozetleri adetten dusulmez
// ---------------------------------------------------------------------------
async function L275() {
  const UI = require('./marketing_ui.js');
  const rez = (id, kanal, g, c, ad) => ({ id, propertyId: PROP_A, villa: 'DENE', guest: ad || ('TEST ' + id), channel: kanal, checkIn: g, checkOut: c, gross: 10000, pax: 2, status: 'CONFIRMED' });
  const bookings = [
    rez('d1', 'Direct', '2026-10-05', '2026-10-07'), rez('d2', 'WhatsApp', '2026-10-10', '2026-10-12'),
    rez('a1', 'Airbnb', '2026-10-15', '2026-10-18'),
    // Gecmis aylarin toplu aktarim ozetleri (Ekim disinda)
    ...['01', '02', '03', '04', '05'].map(ay => rez('t' + ay, 'Direct', `2026-${ay}-01`, `2026-${ay}-28`, `TOPLU AKTARIM — 2026-${ay}`)),
    // Ekim'e dusen bir toplu ozet: geliri sayilir, adede girmez
    rez('t10', 'Airbnb', '2026-10-20', '2026-10-22', 'TOPLU AKTARIM — Ekim 2026')
  ];
  const m = UI.buildWorkspaceModel({ bookings, villas: { DENE: { id: PROP_A, name: 'Deneme Evi' } }, filter: { period: 'CUSTOM', startDate: '2026-10-01', endDate: '2026-10-31' } });
  const dogrudan = m.economics.channels.find(r => r.channel === 'DIRECT');
  const airbnb = m.economics.channels.find(r => r.channel === 'AIRBNB');
  check(dogrudan && dogrudan.reservationCount === 2, 'L-275a Dogrudan satirinin rezervasyon adedi donemdeki rezervasyonlardir', JSON.stringify(dogrudan && dogrudan.reservationCount));
  check(airbnb && airbnb.reservationCount === 1 && airbnb.bookedNights === 5, 'L-275b Donemdeki toplu ozet gece/ciroda kalir, adetten duser', JSON.stringify(airbnb && [airbnb.reservationCount, airbnb.bookedNights]));
  check(m.economics.totals.reservationCount === 3 && m.economics.mix.directReservationSharePercent === 66.67 && m.bulkSummaryCount === 1,
    'L-275c Toplam adet ve dogrudan pay yalniz donemi sayar', JSON.stringify([m.economics.totals.reservationCount, m.economics.mix.directReservationSharePercent, m.bulkSummaryCount]));
}

// ---------------------------------------------------------------------------
// L-276 gelecek tarihli bakim bugunu satisa kapatmaz; kritik eylemde degildir
// ---------------------------------------------------------------------------
async function L276() {
  sahteDom();
  const App = require('../app.js');
  kur(App, {});
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ileri = n => { const d = new Date(bugun + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const aday = typeof App.maintenanceTicketPriorityCandidate === 'function' ? App.maintenanceTicketPriorityCandidate : null;
  const planli = { id: 't1', title: 'TEST boya bakımı', severity: 'MEDIUM', status: 'OPEN', propertyId: PROP_A, villa: 'DENE', blocks_availability: true, downtime_start: ileri(2), downtime_end: ileri(3) };
  const c1 = aday && aday(planli, bugun);
  check(c1 && !/satışa kapatıyor/.test(c1.rationale) && c1.revenueImpact !== 'HIGH' && /Planlı kapatma/.test(c1.rationale),
    'L-276a Gelecek tarihli bakim bugun "satisa kapatiyor" denmez, planli kapatma olarak yazilir', JSON.stringify(c1));
  const bugunKapali = { ...planli, id: 't2', downtime_start: bugun, downtime_end: ileri(1) };
  const c2 = aday && aday(bugunKapali, bugun);
  check(c2 && /satışa kapatıyor/.test(c2.rationale) && c2.revenueImpact === 'HIGH', 'L-276b Bugunu kapatan bakim kritik eylemde kalir', JSON.stringify(c2));
  // Bildirim akisi da ayni tanimi kullanir.
  const NF = require('./notification_feed.js');
  const olaylar = NF.deriveNotifications({ today: bugun, role: 'owner', maintenance: [{ ...planli, priority: 'P2', created_at: bugun }],
    isTicketOpen: () => true, isTicketBlockingToday: t => t.id === 't2' });
  const ariza = olaylar.find(o => String(o.event_key || '').includes('maintenance_open'));
  check(ariza && !/satışa kapatıyor/.test(ariza.message) && ariza.severity !== 'CRITICAL', 'L-276c Bildirim gelecek bakimi bugun kapatiyor demez', JSON.stringify(ariza));
}

// ---------------------------------------------------------------------------
// L-278 uygulama ici sablon degistirilmeden yuklenince gider defteri sanilmaz
// ---------------------------------------------------------------------------
async function L278() {
  const dom = sahteDom();
  global.XLSX = require('../xlsx.full.min.js');
  const App = require('../app.js');
  const E = require('./finance_import_engine.js');
  kur(App, {});
  const basliklar = E.SABLON_SUTUNLARI.BOOKINGS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([basliklar]), 'Rezervasyonlar');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['NASIL DOLDURULUR']]), 'NASIL DOLDURULUR');
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const kaynak = App.buildImportSource(bytes, 'LexBnB_Rezervasyon_Sablonu.xlsx');
  check(kaynak.headers.length === basliklar.length && kaynak.headers[0] === basliklar[0],
    'L-278a Yalniz baslik satiri olan Excel dosyasinin basliklari okunur', JSON.stringify(kaynak.headers));
  App.analyzeAndPreviewSource(kaynak);
  const p = App.getPendingImportData();
  check(p && p.mode === 'BOOKINGS', 'L-278b Degistirilmemis rezervasyon sablonu rezervasyon defteri olarak taninir', p && p.mode);
  check(/kayıt satırı yok/i.test(dom.getElementById('importFileStats').innerText) && dom.getElementById('importConfirmBtn').disabled === true,
    'L-278c Bos sablon "kayit satiri yok" der, ice aktarma dugmesi kapali', dom.getElementById('importFileStats').innerText);
  // Turu anlasilamayan dosya gider defteri sanilmaz.
  sahteDom();
  kur(App, {});
  App.analyzeAndPreviewSource({ kind: 'CSV', fileName: 'x.csv', sheetNames: ['CSV'], headers: ['Kolon A', 'Kolon B'], rows: [{ 'Kolon A': '1', 'Kolon B': '2' }] });
  const p2 = App.getPendingImportData();
  const rozet = global.document.getElementById('importTypeBadge').innerText;
  check(p2 && p2.mode !== 'EXPENSES' && !/Gider/.test(rozet) && global.document.getElementById('importConfirmBtn').disabled === true,
    'L-278d Turu anlasilamayan dosya gider defteri sanilmaz; tur secilmeden aktarilmaz', (p2 && p2.mode) + ' / ' + rozet);
  // Uygulama ici sablonun rehberi "ornek satirlari silin" demez (veri sayfasi yalniz baslik).
  const G = require('./import_template_guide.js');
  const adim = G.buildGuide('BOOKINGS', { properties: [{ code: 'DENE', name: 'Deneme Evi' }], headerOnly: true }).steps.join('\n');
  check(!/örnek satırları silin/.test(adim) && /başlığın altına/.test(adim), 'L-278e Uygulama ici sablon rehberi olmayan ornek satirlardan soz etmez');
  check(/headerOnly: true/.test(functionBody(read('app.js'), 'function downloadSampleTemplate(')), 'L-278f Uygulama ici sablon rehberi headerOnly ile uretilir');
  delete global.XLSX;
}

// ---------------------------------------------------------------------------
// L-279 Kaybedildi nedeni secilmeden kaydedilmez; "-" ya da "Diger" uydurulmaz
// ---------------------------------------------------------------------------
async function L279() {
  const App = require('../app.js');
  const talep = { id: LEAD_1, dbId: LEAD_1, guestName: 'TEST Kayıp', guest: 'TEST Kayıp', phone: '05550000001', status: 'QUOTE_SENT', villa: 'DENE' };
  const dom = sahteDom({ leadEditId: LEAD_1, leadGuest: 'TEST Kayıp', leadVilla: 'DENE', leadChannel: 'Phone', leadQuote: '', leadStatus: 'LOST', leadLostReason: '-', leadNotes: '' });
  const ist = kur(App, { leads: [{ ...talep }] });
  await App.saveLead({ preventDefault() {} });
  const yazma = ist.yazmalar.find(k => k.tablo === 'leads' && k.islem === 'update');
  check(!yazma && /neden/i.test(global.__sonUyari || ''), 'L-279a Neden secilmeden Kaybedildi kaydedilmez, kullaniciya soylenir', JSON.stringify(yazma && yazma.yuk) + ' ' + global.__sonUyari);
  check(!/<option value="-">/.test(read('index.html')), 'L-279b Formda "-" bir neden degeri degildir');
  // Kanban'dan Kaybedildi secilince neden sorulmadan yazilmaz; "Diger" uydurulmaz.
  sahteDom();
  const ist2 = kur(App, { leads: [{ ...talep }] });
  await App.updateLeadStatusFromKanban(LEAD_1, 'LOST');
  const y2 = ist2.yazmalar.find(k => k.tablo === 'leads' && k.islem === 'update');
  check(!y2 || (y2.yuk.lost_reason && y2.yuk.lost_reason !== 'Diğer' && y2.yuk.lost_reason !== '-'), 'L-279c Kanban Kaybedildi nedensiz yazmaz', JSON.stringify(y2 && y2.yuk.lost_reason));
  check(!/lost_reason: \(status === 'LOST' \? \(lead\.lostReason \|\| lead\.lost_reason \|\| 'Diğer'\)/.test(read('app.js')), 'L-279d Nedeni olmayan kayba "Diger" yazilmaz');
}

// ---------------------------------------------------------------------------
// L-280 Bugun kartlari rezervasyon durumunu izler; erken cikis uyarilir
// ---------------------------------------------------------------------------
async function L280() {
  const dom = sahteDom();
  const App = require('../app.js');
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ileri = n => { const d = new Date(bugun + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const r = (id, g, c, durum) => ({ id, villa: 'DENE', propertyId: PROP_A, guest: 'TEST ' + id, checkIn: g, checkOut: c, gross: 1000, pax: 2, status: durum });
  kur(App, { bookings: [r('a', bugun, ileri(3), 'CHECKED_IN'), r('b', bugun, ileri(2), 'CONFIRMED'), r('c', ileri(-2), bugun, 'CHECKED_OUT')] });
  App.renderTodayDateStrip(App.getAppData().bookings, []);
  const ozet = dom.getElementById('todayShiftSummary').innerHTML;
  check(/<strong>1<\/strong><span>Giriş<\/span>/.test(ozet) && /1 yapıldı/.test(ozet) && /<strong>0<\/strong><span>Çıkış<\/span>/.test(ozet),
    'L-280a Bugun seridi giris/cikis yapilanlari bekleyenlerden ayirir', ozet);
  // Erken cikis: temizlik bugune alinir.
  const erken = r('d', ileri(-1), ileri(3), 'CHECKED_OUT');
  check(App.bookingCleaningDate(erken, ileri(3), bugun) === bugun, 'L-280b Erken cikista temizlik bugune alinir');
  check(App.bookingCleaningDate({ ...erken, status: 'CONFIRMED' }, ileri(3), bugun) === ileri(3), 'L-280c Normal rezervasyonda temizlik cikis gunudur');
  check(App.bookingCleaningDate(erken, bugun, ileri(1)) === bugun, 'L-280d Erken cikista one alinmis temizlik sonraki duzenlemede geri tasinmaz');
  let soruldu = false;
  global.confirm = () => { soruldu = true; return false; };
  check(App.confirmEarlyCheckout(ileri(-1), ileri(3), 'CHECKED_OUT', { status: 'CHECKED_IN' }, bugun) === false && soruldu,
    'L-280e Cikis tarihinden once "Cikis yapti" onay ister; vazgecilirse kaydedilmez');
  let hata = null;
  try { App.confirmEarlyCheckout(ileri(1), ileri(3), 'CHECKED_OUT', null, bugun); } catch (e) { hata = e; }
  check(hata && /Giriş tarihi gelmemiş/.test(hata.message), 'L-280f Giris gunu gelmemis rezervasyon "Cikis yapti" olamaz');
  check(/confirmEarlyCheckout\(checkIn, checkOut, status, eskiKayit\)/.test(functionBody(read('app.js'), 'async function saveBooking(')), 'L-280g Rezervasyon kaydi erken cikis kapisindan gecer');
  global.confirm = () => true;
}

// ---------------------------------------------------------------------------
// L-281 cozulmus ariza iptal edilmez; gorev iptali onay ister ve izi gorunur
// ---------------------------------------------------------------------------
async function L281() {
  sahteDom();
  const App = require('../app.js');
  const cozulmus = { id: 'm1', title: 'TEST musluk', status: 'RESOLVED', property_id: PROP_A, severity: 'HIGH' };
  const ist = kur(App, { maintenanceTickets: [cozulmus], maintenance: [{ id: 'm1', status: 'RESOLVED', villa: 'DENE', title: 'TEST musluk' }] });
  await App.deleteMaint('m1');
  check(!ist.yazmalar.some(k => k.tablo === 'maintenance_tickets' && k.islem === 'update') && /çözül/i.test(global.__sonUyari || ''),
    'L-281a Cozulmus ariza "Arsivle" ile IPTAL yapilmaz; nedeni soylenir', JSON.stringify(ist.yazmalar.map(k => k.tablo + ':' + k.islem)) + ' ' + global.__sonUyari);
  // Genel gorev iptali onay ister.
  let soru = null;
  global.confirm = m => { soru = m; return false; };
  const ist2 = kur(App, { operationalTasks: [{ id: 'g1', title: 'TEST görev', status: 'TODO' }] });
  await App.setOperationalTaskStatus('g1', 'CANCELLED');
  check(soru && !ist2.yazmalar.some(k => k.tablo === 'operational_tasks'), 'L-281b Genel gorev iptali onay ister; vazgecince yazilmaz', soru);
  global.confirm = () => true;
  // Iptal/tamamlanan gorev Operasyon'da gorunur (iz yalniz DB'de kalmaz).
  const dom = sahteDom();
  kur(App, { operationalTasks: [{ id: 'g2', title: 'TEST iptal görevi', status: 'CANCELLED', updated_at: new Date().toISOString() }, { id: 'g3', title: 'TEST açık', status: 'TODO' }] });
  App.setOperationsView('tasks');
  App.renderOperationsTab();
  const html = dom.getElementById('opsCombinedContainer').innerHTML;
  check(/TEST iptal görevi/.test(html) && /İptal edildi/.test(html), 'L-281c Iptal edilen gorev kapanan gorevler listesinde gorunur', html.slice(0, 300));
}

// ---------------------------------------------------------------------------
// L-282 kapatilan talep kaynaginin adi gecmis talepte kalir
// ---------------------------------------------------------------------------
async function L282() {
  sahteDom();
  const App = require('../app.js');
  const kaynaklar = [
    { id: 's1', tenant_id: TENANT, code: 'UNKNOWN', label: 'Bilinmiyor', is_active: true, sort_order: 0 },
    { id: 's2', tenant_id: TENANT, code: 'CUSTOM', label: 'TEST Kaynak', is_active: false, sort_order: 1 }
  ];
  kur(App, { leads: [{ id: LEAD_1, guestName: 'TEST', phone: '05550000044', status: 'NEW', channel: 'Phone' }] }, 'owner', {
    cevap: k => {
      if (k.islem !== 'select') return null;
      if (k.tablo === 'lead_source_catalog') {
        const yalnizAktif = k.filtre.some(([c, v]) => c === 'is_active' && v === true);
        return { data: kaynaklar.filter(s => !yalnizAktif || s.is_active), error: null };
      }
      if (k.tablo === 'lead_acquisition') return { data: [{ lead_id: LEAD_1, tenant_id: TENANT, source_id: 's2' }], error: null };
      return null;
    }
  });
  await App.refreshLeadSalesContext();
  const satir = App.getLeadSalesView().rows.find(r => r.id === LEAD_1);
  check(satir && /TEST Kaynak/.test(satir.sourceLabel), 'L-282a Kapatilan kaynagin adi gecmis talep satirinda kalir', JSON.stringify(satir && satir.sourceLabel));
  check((App.getAppData().leadSources || []).every(s => s.is_active !== false), 'L-282b Yeni kayit formu yalniz etkin kaynaklari sunar');
}

// ---------------------------------------------------------------------------
// L-283 dolu pencere varken sayfadan cikis (geri tusu) uyarir
// ---------------------------------------------------------------------------
async function L283() {
  sahteDom();
  const App = require('../app.js');
  const modal = { classList: { contains: c => c === 'active' }, dataset: {} };
  global.document.querySelectorAll = sel => (/\.active/.test(sel) ? [modal] : []);
  const guard = typeof App.hasUnsavedModalForm === 'function' ? App.hasUnsavedModalForm : () => 'yok';
  check(guard() === false, 'L-283a Kullanici yazmadiysa uyari yok', String(guard()));
  if (typeof App.markModalFormDirty === 'function') App.markModalFormDirty({ target: { closest: () => modal } });
  check(guard() === true, 'L-283b Acik pencerede yazilmis veri varken cikis uyarisi gerekir', String(guard()));
  const olay = { preventDefault() { this.durdu = true; }, returnValue: undefined };
  if (typeof App.unsavedFormBeforeUnload === 'function') App.unsavedFormBeforeUnload(olay);
  check(olay.durdu === true && olay.returnValue === '', 'L-283c beforeunload tarayicinin "sayfadan ayril?" uyarisini acar');
  delete modal.dataset.dirty;
  check(guard() === false, 'L-283d Pencere kapaninca (kirli isaret silinince) uyari kalkar');
  check(/beforeunload/.test(read('app.js')) && /installUnsavedFormGuard\(\)/.test(read('app.js')), 'L-283e Uyari uygulama acilisinda kurulur');
}

// ---------------------------------------------------------------------------
// L-284 rezervasyon listesi ozeti iptali rezervasyon saymaz
// ---------------------------------------------------------------------------
async function L284() {
  const dom = sahteDom();
  const App = require('../app.js');
  const r = (id, durum, ad) => ({ id, villa: 'DENE', propertyId: PROP_A, guest: ad || ('TEST ' + id), checkIn: '2026-11-10', checkOut: '2026-11-12', gross: 1000, pax: 2, status: durum });
  kur(App, { bookings: [r('a', 'CONFIRMED'), r('b', 'CHECKED_OUT'), r('c', 'CANCELLED'), r('d', 'CANCELLED')] });
  App.setReservationScopeRange('2026-11-01', '2026-11-30');
  App.renderManageBookingsTable();
  const ozet = dom.getElementById('rezTableSummaryPill').innerHTML;
  check(/<strong>2 Rezervasyon<\/strong>/.test(ozet) && /2 iptal/.test(ozet), 'L-284a Ozet iptalleri rezervasyon saymaz, ayrica yazar', ozet.slice(0, 160));
}

// ---------------------------------------------------------------------------
// L-292 bilinmeyen deger 0 yazilmaz / "−0 ₺" gosterilmez
// ---------------------------------------------------------------------------
async function L292() {
  sahteDom();
  const App = require('../app.js');
  kur(App, {});
  const satir = App.mapLeadToDb({ guestName: 'TEST', phone: '05550000000', status: 'NEW', quote: 0 }, TENANT);
  check(satir.quote_amount === null, 'L-292a Teklif girilmemis talebe quote_amount 0 yazilmaz', JSON.stringify(satir.quote_amount));
  // Ariza formu: maliyet bos = bilinmiyor.
  sahteDom({ maintEditId: '', maintVilla: 'DENE', maintPriority: 'P2', maintTitle: 'TEST arıza', maintAssignee: '', maintDowntimeStart: '', maintDowntimeEnd: '', maintCost: '', maintStatus: 'OPEN' });
  const ist = kur(App, { maintenance: [] });
  await App.saveMaint({ preventDefault() {} });
  const ariza = ist.yazmalar.find(k => k.tablo === 'maintenance_tickets' && k.islem === 'insert');
  check(ariza && ariza.yuk.estimated_cost === null, 'L-292b Bos tahmini maliyet 0 degil bos yazilir', JSON.stringify(ariza && ariza.yuk.estimated_cost) + ' ' + (global.__sonUyari || ''));
  check(!/id="maintCost" value="0"/.test(read('index.html')), 'L-292c Ariza formunda maliyet varsayilani 0 degil');
  // Cozuldu: gerceklesen maliyet bos birakilirsa 0 yazilmaz.
  sahteDom();
  global.prompt = () => '';
  const ist2 = kur(App, { maintenanceTickets: [{ id: 't9', title: 'TEST', status: 'OPEN', property_id: PROP_A }] });
  await App.resolveMaintenanceFromOperations('t9');
  const coz = ist2.yazmalar.find(k => k.tablo === 'maintenance_tickets' && k.islem === 'update');
  check(coz && coz.yuk.status === 'RESOLVED' && coz.yuk.actual_cost === null, 'L-292d Gerceklesen maliyet bos birakilinca 0 yazilmaz', JSON.stringify(coz && coz.yuk));
  delete global.prompt;
  // Rezervasyon detayi: komisyon yoksa "− 0 ₺" yazmaz; maliyeti girilmemis temizlik "−0 ₺" degil.
  let panel = null;
  global.SidePanel = { open(o) { panel = o; }, close() {} };
  sahteDom();
  kur(App, {
    bookings: [{ id: BOOK_1, villa: 'DENE', propertyId: PROP_A, guest: 'TEST', checkIn: '2026-11-10', checkOut: '2026-11-12', gross: 10000, otaComm: 0, cleanFee: 0, pax: 2, channel: 'Direct', status: 'CONFIRMED' }],
    cleaningTasks: [{ id: 'c1', bookingId: BOOK_1, villa: 'DENE', date: '2026-11-12', status: 'PLANNED', amount: 0, paid: false }]
  });
  App.openBookingDetailsPanel(BOOK_1);
  const html = panel ? panel.bodyHtml : '';
  check(!/−\s*0\s*₺/.test(html) && !/− 0 ₺/.test(html), 'L-292e Detayda "−0 ₺" gosterilmez', (html.match(/komisyon[\s\S]{0,120}/) || [''])[0]);
  check(/Temizlik maliyeti \(personele, gider\)<\/span><strong>Bilinmiyor/.test(html), 'L-292f Maliyeti girilmemis temizlik "Bilinmiyor" yazar', (html.match(/Temizlik maliyeti[\s\S]{0,80}/) || [''])[0]);
  delete global.SidePanel;
}

// ---------------------------------------------------------------------------
// L-298 odemeli rezervasyon silinmeden once "emin misiniz" sorulmaz; once reddedilir
// ---------------------------------------------------------------------------
async function L298() {
  sahteDom();
  const App = require('../app.js');
  let soruldu = false;
  global.confirm = () => { soruldu = true; return true; };
  const ist = kur(App, {
    bookings: [{ id: BOOK_1, dbId: BOOK_1, villa: 'DENE', propertyId: PROP_A, guest: 'TEST Ödemeli', checkIn: '2026-11-10', checkOut: '2026-11-12', gross: 10000, pax: 2, status: 'CONFIRMED' }],
    bookingPayments: [{ id: 'p1', booking_id: BOOK_1, amount: 5000, kind: 'DEPOSIT', paid_on: '2026-10-20' }]
  });
  const sonuc = await App.deleteBookingUI(BOOK_1);
  check(sonuc === false && !soruldu && /Ödemesi bulunan/.test(global.__sonUyari || '') && !ist.yazmalar.some(k => /delete/.test(k.tablo + k.islem)),
    'L-298a Odemeli rezervasyonda once onay sorulmaz; silinemeyecegi hemen soylenir', `soruldu=${soruldu} ${global.__sonUyari}`);
  global.confirm = () => true;
}

// ---------------------------------------------------------------------------
// L-296 detay paneli silmeden sonra ve sekme degisince kapanir
// ---------------------------------------------------------------------------
async function L296() {
  sahteDom();
  const App = require('../app.js');
  let kapandi = 0;
  global.SidePanel = { open() {}, close() { kapandi++; }, isOpen: () => true };
  kur(App, { bookings: [{ id: BOOK_1, dbId: BOOK_1, villa: 'DENE', propertyId: PROP_A, guest: 'TEST Sil', checkIn: '2026-11-10', checkOut: '2026-11-12', gross: 10000, pax: 2, status: 'CONFIRMED' }] },
    'owner', { rpc: ad => (ad === 'delete_booking_atomic' ? { success: true } : []) });
  const silindi = await App.deleteBookingUI(BOOK_1);
  check(silindi === true && kapandi > 0, 'L-296a Rezervasyon silinince detay paneli kapanir', `silindi=${silindi} kapandi=${kapandi} ${global.__sonUyari}`);
  kapandi = 0;
  try { App.switchTab('finance'); } catch (e) { /* sahte DOM'da cizim hatasi onemsiz */ }
  check(kapandi > 0, 'L-296b Sekme degisince detay paneli kapanir');
  delete global.SidePanel;
}

// ---------------------------------------------------------------------------
// L-297 sifirlama menusu yalniz isletme sahibine gorunur
// ---------------------------------------------------------------------------
async function L297() {
  const html = read('index.html');
  const sifirlaDugmeleri = html.match(/<button[^>]*openResetModal\(\)[^>]*>/g) || [];
  check(sifirlaDugmeleri.length >= 2 && sifirlaDugmeleri.every(b => /data-owner-only/.test(b)), 'L-297a Sifirlama dugmeleri yalniz sahibe isaretli', JSON.stringify(sifirlaDugmeleri));
  const elemanlar = [];
  const dom = sahteDom();
  const eleman = () => { const e = { hidden: false }; elemanlar.push(e); return e; };
  const sahip = eleman(), not = eleman();
  dom.querySelectorAll = sel => (sel === '[data-owner-only]' ? [sahip] : sel === '[data-owner-only-note]' ? [not] : []);
  const App = require('../app.js');
  kur(App, {}, 'admin');
  App.applyRoleNavigationVisibility();
  check(sahip.hidden === true && not.hidden === false, 'L-297b Yonetici (admin) sifirlama dugmesini gormez, yalniz sahibin yapabilecegini okur');
  kur(App, {}, 'owner');
  App.applyRoleNavigationVisibility();
  check(sahip.hidden === false && not.hidden === true, 'L-297c Isletme sahibi sifirlama dugmesini gorur');
  kur(App, {}, 'admin');
  const modal = dom.getElementById('resetModal');
  let acildi = false;
  modal.classList = { add() { acildi = true; }, remove() {}, contains: () => false, toggle() {} };
  App.openResetModal();
  check(!acildi, 'L-297d Admin sifirlama penceresini acamaz');
}

// ---------------------------------------------------------------------------
// L-303 misafir aramasi bicimli telefonu bulur
// ---------------------------------------------------------------------------
async function L303() {
  const G = require('./guest_crm_engine.js');
  const satir = { name: 'TEST Misafir', phone: '+905550000002', email: '', bookings: [], lifecycle: { code: 'POST_STAY' } };
  const bul = q => G.filterGuestRows([satir], { query: q }).length === 1;
  check(['0555 000 00 02', '+90 555 000 00 02', '5550000002', '0555-000-0002', '000 00 02'].every(bul),
    'L-303a Misafir aramasi bosluklu, +90 ve 0 ile baslayan telefonu bulur', ['0555 000 00 02', '+90 555 000 00 02'].map(q => q + '=' + bul(q)).join(' '));
  check(!bul('0555 000 00 03'), 'L-303b Farkli numara eslesmez');
  check(G.filterGuestRows([satir], { query: 'bozatli' }).length === 0 && G.filterGuestRows([{ ...satir, name: 'Bozatlı' }], { query: 'bozatli' }).length === 1,
    'L-303c Sapkasiz yazim ayni katlamayla bulunur');
  // Talep aramasi ayni telefon kuralini kullanir.
  const ST = require('./search_text.js');
  check(typeof ST.phoneMatches === 'function' && ST.phoneMatches('+90 555 000 0044', '05550000044') && ST.phoneMatches('0555 000 0044', '+905550000044'),
    'L-303d Ortak telefon eslesmesi ulke kodu ve bastaki 0 farkini tolere eder');
  check(/phoneMatches/.test(functionBody(read('app.js'), 'function renderManageLeadsTable(')), 'L-303e Talep aramasi ortak telefon eslesmesini kullanir');
}

// ---------------------------------------------------------------------------
// L-306 ice aktarma onizlemesi kurusu yuvarlamaz
// ---------------------------------------------------------------------------
async function L306() {
  const dom = sahteDom();
  const App = require('../app.js');
  kur(App, {});
  const satirlar = [
    { Tarih: '01.10.2026', Kategori: 'Fatura', Tutar: '101,50', Açıklama: 'a' },
    { Tarih: '02.10.2026', Kategori: 'Fatura', Tutar: '1.234,56', Açıklama: 'b' }
  ];
  App.parseSourceWithMode({ fileName: 'g.csv', headers: Object.keys(satirlar[0]), rows: satirlar, sheetNames: [] }, 'EXPENSES');
  const st = dom.getElementById('importFileStats').innerText;
  check(/1\.336,06 TL/.test(st), 'L-306a Onizleme toplami kurusuyla yazilir', st);
  const govde = functionBody(read('app.js'), 'function renderImportPreviewBox(');
  check(!/const tl = n => Math\.round\(/.test(govde), 'L-306b Onizleme satir tutarlari yuvarlanmaz');
}

// ---------------------------------------------------------------------------
// L-307 ayni adrese ikinci davet: rol degisikligi soylenir, mesaj dogrudur
// ---------------------------------------------------------------------------
async function L307() {
  sahteDom({ inviteMemberEmail: ' MrLexiago+TestEk@gmail.com ', inviteMemberRole: 'sales' });
  const App = require('../app.js');
  const ist = kur(App, {}, 'owner', { rpc: ad => (ad === 'get_tenant_invitations'
    ? [{ id: 'i1', email: 'mrlexiago+testek@gmail.com', role: 'viewer', status: 'PENDING', expires_at: '2026-11-08T00:00:00Z' }] : []) });
  let gonderildi = 0;
  ist.functions = { invoke: async () => { gonderildi++; return { data: { delivery: 'sent' }, error: null }; } };
  let soru = '';
  global.confirm = m => { soru = m; return false; };
  await App.submitMemberInvite({ preventDefault() {} });
  check(gonderildi === 0 && /İzleyici/.test(soru) && /Satış/.test(soru), 'L-307a Bekleyen davetin rolu degisecekse once sorulur; vazgecilirse gonderilmez', soru);
  global.confirm = () => true;
  sahteDom({ inviteMemberEmail: 'mrlexiago+testek@gmail.com', inviteMemberRole: 'sales' });
  await App.submitMemberInvite({ preventDefault() {} });
  check(gonderildi === 1 && /güncellendi/.test(global.__sonUyari || '') && /Satış/.test(global.__sonUyari || '') && /önceki/i.test(global.__sonUyari || ''),
    'L-307b Mesaj davetin guncellendigini, yeni rolu ve onceki baglantinin durumunu soyler', global.__sonUyari);
}

// ---------------------------------------------------------------------------
// L-309 indirim fiyati sifira/eksiye indiremez; -%100 kural kabul edilmez
// ---------------------------------------------------------------------------
async function L309() {
  const P = require('./suggested_price_engine.js');
  const bugun = '2026-10-26';
  const kurallar = { ...P.DEFAULTS, weekend: { ...P.DEFAULTS.weekend, enabled: false }, specialDay: { ...P.DEFAULTS.specialDay, enabled: false },
    demand: { ...P.DEFAULTS.demand, enabled: false }, gapNight: { ...P.DEFAULTS.gapNight, enabled: false },
    lastMinute: { enabled: true, pct: -100, withinDays: 30 } };
  const s = P.suggest({ property: { id: PROP_A, basePrice: 10000, floorPrice: null }, bookings: [], rules: kurallar, today: bugun, days: 5 });
  const gunler = s.days.filter(d => d.status === 'OPEN');
  check(gunler.length && gunler.every(d => d.price === null), 'L-309a Tabansiz mulkte indirim fiyati 0 yapamaz; oneri "bilinmiyor" olur', JSON.stringify(gunler.map(d => d.price)));
  check(s.warnings.some(w => w.code === 'NON_POSITIVE_PRICE'), 'L-309b Sifir/eksi oneride uyari verilir', JSON.stringify(s.warnings.map(w => w.code)));
  const src = read('app.js');
  check(!/pct < -100 \|\| pct > 1000/.test(src) && /pct <= -100/.test(src), 'L-309c Kural ve etkinlik formu -%100\'u reddeder');
  check(/id="pricingRulePct" type="number" min="-99"/.test(read('index.html')), 'L-309d Form alani -%99 altina inmez');
}

// ---------------------------------------------------------------------------
// L-310 yillik hedef karti hedefli aylarin cirosunu hedefle karsilastirir
// ---------------------------------------------------------------------------
async function L310() {
  const src = read('app.js');
  const i = src.indexOf("// Yillik hedef = secili yilin aylik portfoy hedeflerinin toplami (L-253).");
  const blok = i >= 0 ? src.slice(i, i + 2600) : '';
  check(/hedefliAylar\.map\(/.test(blok) && !/Array\.from\(\{ length: 12 \}, \(_, i\) => computeMonthLedger/.test(blok),
    'L-310a Gerceklesme yalniz hedef girilmis aylarin cirosundan hesaplanir (12 ayin cirosu tek ayin hedefine oranlanmaz)');
  check(/hedefli aylarda ciro/.test(blok), 'L-310b Kart neyin neyle karsilastirildigini yazar');
}

// ---------------------------------------------------------------------------
// L-299 hedef altinda kirmizi; kapsama acik; huni donemi gelecegi kapsamaz
// ---------------------------------------------------------------------------
async function L299() {
  const src = read('app.js');
  check(/finRevTargetDelta[\s\S]{0,400}className = `kpi-trend \$\{/.test(src) || /hedefRengi/.test(src), 'L-299a "Hedefin altinda" yesil degil; rozet rengi hedefe gore');
  check(/\.kpi-trend\.negative\s*\{/.test(read('style.css')), 'L-299b Olumsuz rozet stili var');
  const ui = read('core/marketing_ui.js');
  check(!/`Kapsama: \$\{number\(derived\.validation\.coveragePercent, '%'\)\}`/.test(ui) && /sayaçtan/.test(ui), 'L-299c Huni karti kapsamayi "N sayactan M tanesi girildi" diye aciklar');
  const S = require('./marketing_snapshot_service.js');
  let hata = null;
  try {
    S.validateInput({ tenantId: TENANT, channelListingId: PROP_A, periodStart: '2026-10-01', periodEndExclusive: '2026-11-02', listingViews: 100, today: '2026-10-26' });
  } catch (e) { hata = e; }
  check(hata && /FUTURE/.test(hata.message), 'L-299d Gelecek gunleri kapsayan huni donemi reddedilir', hata ? hata.message : 'hata yok');
  let hata2 = null;
  try { S.validateInput({ tenantId: TENANT, channelListingId: PROP_A, periodStart: '2026-10-01', periodEndExclusive: '2026-10-27', listingViews: 100, today: '2026-10-26' }); } catch (e) { hata2 = e; }
  check(!hata2, 'L-299e Bugunu kapsayan donem kabul edilir', hata2 && hata2.message);
}

// ---------------------------------------------------------------------------
// L-291 ice aktarma gecmisi, geri alma sonucu ve donem, gelecek rezervasyon temizligi
// ---------------------------------------------------------------------------
async function L291() {
  const dom = sahteDom();
  const App = require('../app.js');
  const BATCH = '99999999-9999-4999-8999-999999999991';
  const ist = kur(App, {}, 'owner', {
    cevap: k => (k.tablo === 'finance_import_batches' && k.islem === 'select'
      ? { data: [{ id: BATCH, filename: 'TEST.csv', imported_at: '2026-10-26T10:00:00Z', row_count: 5, imported_amount: 1641, finance_import_batch_rows: [{ count: 0 }] }], error: null } : null),
    rpc: ad => (ad === 'undo_finance_import' ? { deleted_bookings: 2, deleted_expenses: 0, deleted_cleaning_tasks: 0, skipped_modified: 0 } : [])
  });
  dom.getElementById('importHistoryBox');
  await App.refreshImportHistory();
  const liste = dom.getElementById('importHistoryList').innerHTML;
  check(!/geri alınamaz/.test(liste) && /geri alınacak kayıt yok/.test(liste), 'L-291a Kayitlari kalmayan parti "geri alinamaz" degil "geri alinacak kayit yok" der', liste.slice(0, 200));
  // Geri alma: sonuc kutuda yazar, aktarimin degistirdigi donem geri gelir.
  App.setCurrentFilter({ period: '2026-12', startDate: '2026-12-01', endDate: '2026-12-31' });
  App.rememberImportPeriod(BATCH, { period: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31' }, '2026-12');
  App.getAppData().importBatches = [{ id: BATCH, filename: 'TEST.csv', linkedCount: 2 }];
  await App.undoImportBatch(BATCH);
  const mesaj = dom.getElementById('importHistoryMessage').textContent;
  check(/2 kayıt geri alındı/.test(mesaj), 'L-291b Geri alma sonucu ice aktarma penceresinde yazar', mesaj);
  check(App.setCurrentFilter({}).period === '2026-10', 'L-291c Geri alininca aktarimin degistirdigi donem eski haline doner', App.setCurrentFilter({}).period);
  const govde = functionBody(read('app.js'), 'async function applyImportedData(');
  check(/refreshImportHistory\(\)/.test(govde), 'L-291d Aktarim bitince "Son ice aktarimlar" yenilenir');
  check(/syncBookingCleaningTaskToCloud\(/.test(govde), 'L-291e Gelecek tarihli aktarilan rezervasyona planli temizlik acilir');
  check(/rememberImportPeriod\(/.test(govde), 'L-291f Aktarim donemi degistirirken eskisini hatirlar');
}

// ---------------------------------------------------------------------------
// L-293 sayac 0'dayken geri al anlamsiz hata vermez
// ---------------------------------------------------------------------------
async function L293() {
  const dom = sahteDom({ leadQuickSource: 's1', leadQuickChannel: 'Phone' });
  const App = require('../app.js');
  const ist = kur(App, { leadInterests: [] });
  global.SalesWorkflowService = require('./sales_workflow_service.js');
  const sonuc = await App.bumpLeadInterestFromQuick(-1);
  const mesaj = dom.getElementById('leadQuickMessage').textContent || dom.getElementById('leadQuickMessage').innerText;
  check(sonuc === false && !ist.yazmalar.some(k => k.tablo === 'rpc:bump_lead_interest') && /geri alınacak/.test(mesaj),
    'L-293a Sayac 0 iken geri al sunucuya gitmez, anlasilir mesaj verir', mesaj);
  delete global.SalesWorkflowService;
}

// ---------------------------------------------------------------------------
// L-294 ariza duzenleme penceresi atanan ustayi gosterir
// ---------------------------------------------------------------------------
async function L294() {
  const dom = sahteDom();
  const App = require('../app.js');
  kur(App, {
    maintenance: [{ id: 'm5', villa: 'DENE', title: 'TEST', priority: 'P2', status: 'IN_PROGRESS', assignee: '', cost: null }],
    maintenanceAssignments: [{ maintenance_ticket_id: 'm5', person_id: 'u1' }],
    operationalPeople: [{ id: 'u1', kind: 'TECHNICIAN', full_name: 'TEST Ünal Usta', is_active: true }]
  });
  App.openMaintModal('m5');
  const metin = dom.getElementById('maintAssignedTechnician').textContent;
  check(/TEST Ünal Usta/.test(metin), 'L-294a Duzenleme penceresi atanan ustayi gosterir', metin);
  check(/Not \/ dış sorumlu|Sorumlu \(not\)/.test(read('index.html')), 'L-294b Serbest "Sorumlu" alani usta atamasiyla karistirilmayacak sekilde adlandirilir');
}

async function main() {
  try {
    await L304();
    await L268();
    await L269();
    await L270();
    await L305();
    await L302();
    await L308();
    await L272();
    await L273();
    await L274();
    await L275();
    await L276();
    await L278();
    await L279();
    await L280();
    await L281();
    await L282();
    await L283();
    await L284();
    await L292();
    await L298();
    await L296();
    await L297();
    await L303();
    await L306();
    await L307();
    await L309();
    await L310();
    await L299();
    await L291();
    await L293();
    await L294();
  } catch (error) {
    failed++;
    console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
  } finally {
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  }
}
main();
