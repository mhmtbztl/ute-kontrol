/**
 * LEXBNB — KISI BAZINDA IZIN MATRISI (L-211, CEVRIMDISI)
 *
 *   A. Istemci varsayilanlari phase107'deki fn_permission_default ile birebir.
 *   B. Etkin izin: sahip her zaman, kisi bazindaki kayit, rol; yazma okumayi icerir.
 *   C. Uygulama: yetki yardimcilari aktif kullanicinin izinlerini okur, sekmeler
 *      ve dugmeler izne gore, giriste izinler yuklenir, sahip ekip ekranindan
 *      izin verir. Sunucunun kendisi canli: phase107_member_permissions_live_tests.
 */
const fs = require('fs');
const path = require('path');
const M = require('./permission_matrix.js');

const KOK = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(KOK, rel), 'utf8');
let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d || ''}`); } };

// --- A. Sunucuyla ayni varsayilanlar ----------------------------------------
const goc = read('supabase/migration_phase107_member_permissions.sql');
const govde = (goc.match(/FUNCTION public\.fn_permission_default[\s\S]*?\$\$([\s\S]*?)\$\$/) || [])[1] || '';
const sunucu = {};
for (const m of govde.matchAll(/WHEN '([a-z.]+)'\s+THEN p_role IN \(([^)]*)\)/g)) sunucu[m[1]] = m[2].split(',').map(x => x.trim().replace(/'/g, ''));
check(Object.keys(sunucu).length === 5 && JSON.stringify(sunucu) === JSON.stringify(M.DEFAULTS),
  'A1. Istemci varsayilanlari sunucudaki fn_permission_default ile birebir', JSON.stringify({ sunucu, istemci: M.DEFAULTS }));
const kontrol = (goc.match(/permission IN \(([^)]*)\)/) || [])[1] || '';
check(M.PERMISSIONS.map(p => p.key).join(',') === kontrol.split(',').map(x => x.trim().replace(/'/g, '')).join(','),
  'A2. Izin katalogu tablonun CHECK listesiyle ayni');

// --- B. Etkin izin -------------------------------------------------------------
check(M.PERMISSIONS.every(p => M.allows('owner', p.key, { [p.key]: false })), 'B1. Sahip her zaman her izne sahip (kayit onu kisitlamaz)');
check(!M.allows('sales', 'ledger.read', {}) && M.allows('sales', 'ledger.read', { 'ledger.read': true }), 'B2. Kisi bazindaki kayit rol varsayilaninin ustune cikar');
check(M.allows('manager', 'ledger.write', {}) && !M.allows('manager', 'ledger.write', { 'ledger.write': false }), 'B3. Yoneticiden yazma geri alinabilir');
check(M.allows('viewer', 'ledger.read', { 'ledger.read': false, 'ledger.write': true }), 'B4. Yazma okumayi icerir (sunucudaki can_read_ledger ile ayni)');
check(!M.allows('', 'sales.read', {}) && !M.allows(undefined, 'ledger.read', { 'ledger.read': true }), 'B5. Uye olmayan hicbir izne sahip degil');
const istek = M.requestFromSelection('sales', { 'sales.write': false, 'ledger.write': true });
check(istek['ledger.read'] === true && istek['ledger.write'] === true && istek['sales.write'] === false && istek['sales.read'] === null && istek['operations.manage'] === null,
  'B6. Istek: yazma okumayi acar; varsayilana esit izin null (kayit kalkar)', JSON.stringify(istek));
const istek2 = M.requestFromSelection('manager', { 'sales.read': false, 'sales.write': true, 'ledger.read': true, 'ledger.write': true, 'operations.manage': true });
check(istek2['sales.read'] === false && istek2['sales.write'] === false, 'B7. Okuma kapatilinca yazma da kapanir', JSON.stringify(istek2));
check(JSON.stringify(M.overridesFromRows([{ permission: 'ledger.read', granted: true }, { permission: 'x', granted: true }, { permission: 'sales.write', granted: null }])) === '{"ledger.read":true}',
  'B8. Satirlardan yalniz bilinen ve kesin izinler okunur');

// --- C. Uygulama ---------------------------------------------------------------
const app = read('app.js');
const html = read('index.html');
const fb = sig => { const i = app.indexOf(sig); if (i < 0) return ''; const a = app.indexOf('{', i); let d = 0; for (let k = a; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}' && --d === 0) return app.slice(a, k + 1); } return ''; };
check(['canReadLedgerRole', 'canReadSalesRole', 'canWriteSalesRole', 'canWriteLedgerRole', 'canManageOperationsRole'].every(n => /allows\(/.test(fb(`function ${n}(`))),
  'C1. Yetki yardimcilari izin matrisinden gecer (yeni: finans yazma, operasyon)');
check(/\['owner', 'admin', 'manager'\]\.includes\(role\)/.test(fb('function canManageTenantRole(')) && !/allows\(/.test(fb('function canManageTenantRole(')), 'C2. Yonetim role bagli kalir (izinle verilemez)');
check(/loadActiveMemberPermissions\(/.test(fb('async function loadTenantAppData(')), 'C3. Giriste ve yenilemede aktif kullanicinin izinleri yuklenir');
const nav = fb('function applyRoleNavigationVisibility(');
check(/canReadLedgerRole\(role\)[\s\S]*'finance'|'finance'[\s\S]*canReadLedgerRole\(role\)/.test(nav) && /data-ledger-write-only/.test(nav) && /data-operations-only/.test(nav),
  'C4. Finans sekmesi okuma iznine, finans ve operasyon dugmeleri yazma izinlerine gore');
check(['function openIncomeModal(', 'function saveIncomeEntry(', 'function deleteIncomeEntry(', 'function renderIncomeSection('].every(s => /canWriteLedgerRole\(/.test(fb(s))),
  'C5. Gelir defteri finans yazma iznine bagli');
check(['function renderOperationsPeopleView(', 'function refreshUnstartedCleaningChecklists('].every(s => /canManageOperationsRole\(/.test(fb(s))),
  'C6. Saha ekibi ve kontrol listesi yenileme operasyon iznine bagli (Ayarlar baglantilari yonetimde)');
const giderDugme = (html.match(/<button[^>]*data-onclick="openExpenseModal\(\)[^>]*>/g) || []);
const opsDugme = (html.match(/<button[^>]*data-onclick="(openNewCleaningTaskModal|openMaintModal)\([^>]*>/g) || []);
check(giderDugme.length >= 3 && giderDugme.every(b => /data-ledger-write-only/.test(b)) && opsDugme.length >= 4 && opsDugme.every(b => /data-operations-only/.test(b)),
  'C7. Gider, temizlik ve ariza ekleme dugmeleri izne gore gorunur', JSON.stringify({ giderDugme: giderDugme.length, opsDugme: opsDugme.length }));
const kaydet = fb('async function saveMemberPermissions(');
check(/set_member_permissions/.test(kaydet) && /requestFromSelection\(/.test(kaydet) && /'owner'/.test(kaydet), 'C8. Izinler yalniz sahip tarafindan, sunucu RPC\'siyle kaydedilir');
check(/data-action="permissions"/.test(fb('async function renderTeamManagement(')) && /id="memberPermissionsModal"/.test(html), 'C9. Ekip ekraninda sahibe "Izinler" dugmesi ve penceresi');
check(['saveMemberPermissionsFromModal', 'closeMemberPermissionsModal', 'onMemberPermissionToggle', 'resetMemberPermissionsToRole'].every(a => read('core/action_dispatch.js').includes(`'${a}'`)), 'C10. Eylemler izin listesinde');
check(/core\/permission_matrix\.js\?v=/.test(html) && html.indexOf('core/permission_matrix.js') < html.indexOf('src="app.js'), 'C11. Modul app.js\'ten once yuklenir');

// --- D. Davranis (Node) -----------------------------------------------------------
(async () => {
  global.window = global.window || {};
  const App = require('../app.js');
  App.setActiveTenant({ id: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'sales', permissions: { 'ledger.read': true } });
  check(App.canReadLedgerRole() === true && App.canWriteLedgerRole() === false && App.canWriteSalesRole() === true,
    'D1. Satisa verilen finans okuma izni aktif kullanicida etkin; yazma vermez');
  check(App.canReadLedgerRole('viewer') === true && App.canWriteLedgerRole('viewer') === false && App.canReadLedgerRole('staff') === false,
    'D2. Baska rol icin sorulan yetki aktif kullanicinin kaydiyla karismaz');
  App.setActiveTenant({ id: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'manager', permissions: { 'ledger.write': false, 'operations.manage': false } });
  check(App.canWriteLedgerRole() === false && App.canReadLedgerRole() === true && App.canManageOperationsRole() === false && App.canManageTenantRole() === true,
    'D3. Yoneticiden geri alinan yazma ve operasyon etkin; yonetim yetkisi kalir');

  const cagri = [];
  App.setSupabaseClient({ rpc: async (ad, arg) => { cagri.push({ ad, arg }); return { data: { success: true, effective: {} }, error: null }; },
    from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }) }) });
  App.setActiveTenant({ id: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'manager' });
  const r1 = App.saveMemberPermissions ? await App.saveMemberPermissions('u-2', 'sales', { 'ledger.read': true }) : true;
  check(r1 === false && cagri.length === 0, 'D4. Sahip olmayan izin kaydedemez (istek gitmez)');
  App.setActiveTenant({ id: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'owner' });
  const r2 = App.saveMemberPermissions ? await App.saveMemberPermissions('u-2', 'sales', { 'sales.read': true, 'sales.write': true, 'ledger.read': true, 'ledger.write': false, 'operations.manage': false }) : false;
  check(r2 === true && cagri.length === 1 && cagri[0].ad === 'set_member_permissions' && cagri[0].arg.p_user_id === 'u-2'
    && cagri[0].arg.p_permissions['ledger.read'] === true && cagri[0].arg.p_permissions['sales.write'] === null,
    'D5. Sahip izni kaydeder: yalniz varsayilandan farkli olanlar kesin deger tasir', JSON.stringify(cagri));

  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
})();
