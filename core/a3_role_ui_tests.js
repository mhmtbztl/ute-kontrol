/**
 * A3 — P53 istemci rol sinirlari (cevrimdisi)
 *
 * Sales ve staff finans anlik goruntusunu sunucudan istemez. Sales satis
 * ekraninda kendi etiketiyle gorunur ve rezervasyon yazabilir; staff ise
 * mulk ekleme karsilamasina sokulmaz.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n?/g, '\n');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n?/g, '\n');
let passed = 0, failed = 0;
const check = (condition, name, detail) => {
  if (condition) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}\n       ${detail}`); }
};

function body(name) {
  const match = APP.match(new RegExp(`(?:^|\\n)(?:async )?function ${name}\\([^)]*\\) \\{`));
  if (!match) return '';
  const start = match.index;
  let depth = 0, opened = false;
  for (let i = APP.indexOf('{', start); i < APP.length; i++) {
    if (APP[i] === '{') { depth++; opened = true; }
    if (APP[i] === '}' && opened && --depth === 0) return APP.slice(start, i + 1);
  }
  return '';
}

try {
  check(/sales:\s*\{\s*label:\s*'Satış'/.test(APP),
    'A1. TEAM_ROLES sales rolunu Satıs etiketiyle tanir', 'sales/Satış tanimi yok');
  check(/<option value="sales">Satış \(sales\)<\/option>/.test(INDEX),
    'A2. Davet formunda sales secenegi var', 'sales option yok');
  check(/staff:[^\n]*Saha personeli \(temizlik\/usta\): yalnız kendisine atanan işi görür/.test(APP),
    'A3. Staff ipucu saha veri sinirini aciklar', 'staff ipucu eski/genis');

  const guests = body('renderGuestsTab');
  check(/\['owner', 'admin', 'manager', 'sales'\]/.test(guests),
    'A4. Misafir duzenleme kapisi staff yerine sales kullanir', guests.slice(0, 300));

  const context = body('getExecutiveSnapshotContext');
  check(/canReadLedgerRole\(/.test(context),
    'B1. Finans anlik goruntusu rol kapisini RPC oncesi denetler', context.slice(0, 400));
  const refresh = body('refreshExecutiveDashboardSnapshot');
  check(/if \(!context\.supported\)/.test(refresh) && /getExecutiveDashboardSnapshot/.test(refresh),
    'B2. Desteklenmeyen rolde refresh RPC yoluna girmeden doner', refresh.slice(0, 500));

  const session = body('handleAuthenticatedSession');
  check(/propCount === 0 && canManageTenantRole\(/.test(session),
    'C1. Bos portfoy karsilamasi yalniz tenant yonetebilen role acilir', session.slice(-700));

  const ui = body('updateSaaSUi');
  check(/TEAM_ROLES\[activeTenant\?\.role\]/.test(ui),
    'D1. Ust cubuk ham SALES degil rol etiketini kullanir', ui.slice(0, 500));
  check(/applyRoleNavigationVisibility\(\)/.test(ui),
    'D2. UI guncellenirken rol bazli menu gorunurlugu uygulanir', ui.slice(0, 700));
} catch (error) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${error && error.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
