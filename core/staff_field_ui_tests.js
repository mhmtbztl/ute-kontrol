/** A3-G2 — staff tek sayfa ve dar RPC istemcisi. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n?/g, '\n');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n?/g, '\n');
const STYLE = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').replace(/\r\n?/g, '\n');
const App = require('../app.js');
let passed = 0, failed = 0;
const check = (condition, name, detail) => condition
  ? (passed++, console.log(`[PASS] ${name}`))
  : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const body = name => (APP.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`)) || [''])[0];

try {
  check(/id="tab-staff-field"/.test(INDEX), 'A1. Staff icin ayri tek sayfa var', 'tab-staff-field yok');
  const session = body('handleAuthenticatedSession');
  check(/activeTenant\?\.role === 'staff'/.test(session) && /loadStaffFieldWork/.test(session) && /switchTab\('staff-field'\)/.test(session),
    'A2. Staff girisi normal tenant yuklemesi yerine saha sayfasina gider', session.slice(-1200));
  const nav = body('applyRoleNavigationVisibility');
  check(/role === 'staff'/.test(nav) && /nav\.hidden/.test(nav),
    'A3. Staff rolunde ana menu tamamen gizlidir', nav);

  const load = body('loadStaffFieldWork');
  check(/get_my_field_work/.test(load) && !/get_executive_dashboard_snapshot/.test(load),
    'B1. Staff verisi yalniz get_my_field_work ile okunur', load.slice(0, 700));
  const range = App.getStaffFieldWorkRange('2026-10-03');
  check(range.from === '2026-08-04' && range.to === '2026-10-03' && /getStaffFieldWorkRange/.test(load),
    'B1b. Saha RPC araligi sunucunun 62 gunluk kapisini asmaz', JSON.stringify(range));
  const save = body('saveStaffCleaningProgress');
  check(/save_cleaning_progress/.test(save), 'B2. Kontrol listesi, malzeme ve not dar RPC ile yazilir', save.slice(0, 700));
  const sign = body('signStaffCleaningDone');
  check(/sign_cleaning_done/.test(sign), 'B3. Yaptim dugmesi Z imzasini dar RPC ile yazar', sign.slice(0, 700));
  const render = body('renderStaffFieldWork');
  check(/Var/.test(render) && /Az var/.test(render) && /Yok/.test(render)
    && /Kapı kodu/.test(render) && /Adres/.test(render),
    'B4. Saha karti erisim bilgisi ve uc malzeme durumunu gosterir', render.slice(0, 1200));
  check(!/amount|is_paid|guest_name|gross_amount/.test(render),
    'B5. Staff render finansal tutar, odeme veya misafir adi istemez/gostermez', render.match(/amount|is_paid|guest_name|gross_amount/g));
  check(/staffFieldWork\.tasks/.test(render) && /set_my_task_status/.test(APP),
    'B5b. Personele atanan genel gorev gorunur ve dar RPC ile tamamlanir', render.slice(-1200));
  check(/important|Önemli/.test(render) && /subChecks/.test(render),
    'B5c. Onemli ve oda alt isaretleri personel kartinda korunur', render.slice(0, 1800));
  check(/Onaylandı/.test(render) && /Denetim bekliyor/.test(render),
    'B5d. Personel karti INSPECTED isi onaylandi, CLEANED isi denetim bekliyor diye ayirir', render.slice(0, 2200));
  const managerFlags = body('renderCleaningExecutionFlags');
  check(/supplies_result/.test(managerFlags) && /LOW/.test(managerFlags) && /OUT/.test(managerFlags) && /note/.test(managerFlags),
    'B6. Yonetici denetiminde az/yok malzeme ve personel notu gorunur', managerFlags);
  const inspect = body('inspectCleaningExecution');
  check(/manager_marks/.test(inspect) && /p_m_marks/.test(inspect),
    'B7. M denetimi madde bazindaki isaretleri RPCye yollar', inspect);
  check(/@media\s*\(max-width:\s*768px\)[\s\S]*?#headerCompanyName\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*max-width:\s*100%/m.test(STYLE),
    'C1. Uzun rol adi telefon genisliginde yatay tasma yapmaz', 'Mobil headerCompanyName kisaltma kurali yok');
} catch (error) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${error && error.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
