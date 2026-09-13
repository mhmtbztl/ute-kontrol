/**
 * LEXBNB FRESH TENANT ISOLATION TEST SUITE
 *
 * Yeni bir musterinin defterine DEMO VERISI SIZMAMALIDIR.
 *
 * Bu suit, 2026-09-12'de uretimde bulunan su hatanin regresyon agidir:
 * syncBookingCleaningTasks(), gider defteri BOS olan her tenant'a
 * DEFAULT_EXPENSES'i (12 kayit / 271.900 TL sentetik demo gideri) enjekte
 * ediyordu. Yani her YENI musteri, ilk rezervasyonunu ekler eklemez
 * defterinde uydurma giderler buluyordu. Kayitlar veritabaninda olmadigi
 * icin sayfa yenilenince kayboluyor, arada net kar/marj raporlarini
 * sapitiyor ve veri kaybi izlenimi veriyordu.
 *
 * Fonksiyon 9 ayri yerden cagriliyor (rezervasyon ekleme/guncelleme/silme,
 * temizlik senkronu...), dolayisiyla tetiklenmesi kacinilmazdi.
 *
 * Kapsam:
 *  1. app.js'te bos gider defterine demo enjeksiyonu YOK
 *  2. syncBookingCleaningTasks bos defteri bos birakir (davranis testi)
 *  3. Bos defter, rezervasyon eklendikten sonra da bos kalir
 *  4. Var olan giderler korunur (asiri duzeltme yapilmadi)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

let testsPassed = 0;
let testsFailed = 0;
function recordPass(n) { testsPassed++; console.log(`[PASS] ${n}`); }
function recordFail(n, d) { testsFailed++; console.error(`[FAIL] ${n}\n       ${d}`); }
function check(c, n, d) { if (c) recordPass(n); else recordFail(n, d || 'beklenen kosul saglanmadi'); }

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB FRESH TENANT ISOLATION TESTS');
  console.log('=============================================================================\n');

  try {
    // ---------------------------------------------------------------------
    console.log('--- 1. KAYNAK KODU DENETIMI ---');

    // syncBookingCleaningTasks govdesini ayikla
    const start = APP.indexOf('function syncBookingCleaningTasks()');
    check(start !== -1, '0. syncBookingCleaningTasks bulunur', 'fonksiyon yok');
    const body = APP.slice(start, start + 2500);

    check(
      !/appData\.expenses\s*=\s*JSON\.parse\(JSON\.stringify\(DEFAULT_EXPENSES\)\)/.test(body),
      '1. Boş gider defterine DEFAULT_EXPENSES enjeksiyonu yok',
      'syncBookingCleaningTasks hala demo giderleri enjekte ediyor'
    );

    // Genel tarama: hicbir yerde "gider defteri bossa demo yukle" olmasin
    const risky = [];
    const lines = APP.split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/appData\.expenses\s*=\s*JSON\.parse\(JSON\.stringify\((DEFAULT_EXPENSES|COMPANY_EXCEL_DATABASE\.expensesList)\)\)/.test(l)) {
        // Kullanicinin bilerek istedigi yollar disinda olmamali
        const ctx = lines.slice(Math.max(0, i - 25), i).join('\n');
        const kasitli = /function restoreExcelData|function confirmFactoryReset|function loadAppData|function initDefaultDemoData/.test(ctx);
        if (!kasitli) risky.push('satir ' + (i + 1));
      }
    });
    check(risky.length === 0,
      '1b. Demo gider yüklemesi yalnızca kullanıcının açıkça istediği yerlerde',
      'beklenmedik enjeksiyon: ' + risky.join(', '));

    // ---------------------------------------------------------------------
    console.log('\n--- 2. DAVRANIŞ TESTI ---');

    // syncBookingCleaningTasks'i izole calistir
    const fnSrc = (() => {
      const s = APP.indexOf('function syncBookingCleaningTasks()');
      let depth = 0, i = APP.indexOf('{', s), end = -1;
      for (let j = i; j < APP.length; j++) {
        if (APP[j] === '{') depth++;
        else if (APP[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      return APP.slice(s, end + 1);
    })();

    const sandbox = {
      appData: { expenses: [], bookings: [], cleaningTasks: [], villas: {} },
      DEFAULT_EXPENSES: [{ id: 'EXP-SYN-001', amount: 14500 }, { id: 'EXP-SYN-002', amount: 32000 }],
      DEFAULT_CLEANING_TASKS: []
    };
    const factory = new Function('appData', 'DEFAULT_EXPENSES', 'DEFAULT_CLEANING_TASKS',
      fnSrc + '; return syncBookingCleaningTasks;');

    let fn;
    try {
      fn = factory(sandbox.appData, sandbox.DEFAULT_EXPENSES, sandbox.DEFAULT_CLEANING_TASKS);
      fn();
      recordPass('2b. Fonksiyon izole ortamda çalışır');
    } catch (e) {
      recordFail('2b. Fonksiyon izole ortamda çalışır', e.message);
    }

    check(sandbox.appData.expenses.length === 0,
      '2. Boş gider defteri boş kalır',
      `${sandbox.appData.expenses.length} demo gideri enjekte edildi`);

    // Rezervasyon ekle, yine bos kalmali
    sandbox.appData.bookings.push({
      id: 'b1', villa: 'V1', guest: 'Test', checkin: '2027-06-01', checkout: '2027-06-03',
      cleanCost: 500
    });
    try { fn(); } catch (e) {}
    const autoOnly = sandbox.appData.expenses.filter(e => !String(e.id || '').startsWith('EXP-SYN'));
    const demoLeak = sandbox.appData.expenses.filter(e => String(e.id || '').startsWith('EXP-SYN'));
    check(demoLeak.length === 0,
      '3. Rezervasyon eklendikten sonra da demo gideri sızmaz',
      `${demoLeak.length} demo gideri sizdi`);

    // Var olan gider korunmali
    sandbox.appData.expenses = [{ id: 'GERCEK-1', amount: 999, category: 'Temizlik' }];
    try { fn(); } catch (e) {}
    check(sandbox.appData.expenses.some(e => e.id === 'GERCEK-1'),
      '4. Var olan gerçek giderler korunur',
      'kullanicinin gideri silindi - asiri duzeltme');

  } catch (err) {
    recordFail('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} / ${testsPassed + testsFailed} TESTS PASSED (${testsFailed} FAILED)`);
  console.log('=============================================================================\n');
  if (testsFailed > 0) process.exit(1);
}

run();
