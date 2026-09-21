/**
 * PHASE 36 — MULK SATIS HAZIRLIGI SOZLESMESI
 *
 * Saf normalize motorunu, finansal odeme durumundan ayrimi ve ileri yonlu
 * sema genisletmesini olcer. Dis sisteme baglanmaz.
 */
const fs = require('fs');
const path = require('path');
const Readiness = require('./property_sales_readiness.js');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migration_phase36_property_sales_readiness.sql'), 'utf8');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d || 'kosul saglanmadi');

const property = { id: 'property-1', key: 'V1', slug: 'V1', name: 'Deniz Evi' };
const build = options => Readiness.buildPropertyReadiness(property, options || {});

function functionBody(source, name) {
  const start = source.indexOf(`async function ${name}`);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

function run() {
  console.log('=============================================================================');
  console.log('PHASE 36 — MULK SATIS HAZIRLIGI TESTLERI');
  console.log('=============================================================================\n');

  check(
    Readiness.SELECTABLE_STATUSES.join('|') ===
      'SALES_READY|NEEDS_CLEANING|BLOCKED_MAINTENANCE|NON_BLOCKING_ISSUE',
    '1. Tek secilebilir durum sozlesmesi dort is durumunu kapsiyor',
    Readiness.SELECTABLE_STATUSES.join(', ')
  );

  check(Readiness.normalizeStatus('READY') === 'SALES_READY'
    && Readiness.normalizeStatus('CLEANING') === 'NEEDS_CLEANING'
    && Readiness.normalizeStatus('OCCUPIED') === 'SALES_READY',
  '2. Phase 31 eski kayitlari ayni view-model sozlesmesine normalize ediliyor');

  check(build({ overrideStatus: null }).status === 'UNSET',
    '3. Kaydi olmayan mulk uydurma bicimde hazir sayilmiyor');

  const selected = build({ overrideStatus: 'NEEDS_CLEANING' });
  check(selected.status === 'NEEDS_CLEANING' && selected.meta.icon === '🟡'
    && selected.propertyName === 'Deniz Evi',
  '4. Elle secilen durum gercek mulk adi ve sari temizlik gostergesiyle donuyor');

  const nonBlocking = build({
    maintenanceTickets: [{ property_id: 'property-1', status: 'OPEN', severity: 'MEDIUM' }]
  });
  check(nonBlocking.status === 'NON_BLOCKING_ISSUE' && nonBlocking.openIssueCount === 1,
    '5. Satisi engellemeyen acik ariza mavi durumu turetiyor');

  const blocking = build({
    overrideStatus: 'SALES_READY',
    maintenanceTickets: [{ property_id: 'property-1', status: 'IN_PROGRESS', severity: 'CRITICAL' }]
  });
  check(blocking.status === 'BLOCKED_MAINTENANCE'
    && blocking.source === 'BLOCKING_MAINTENANCE',
  '6. Kritik acik ariza manuel hazir secimine ustun gelip satisi kapatiyor');

  const resolved = build({
    overrideStatus: 'SALES_READY',
    maintenanceTickets: [{ property_id: 'property-1', status: 'RESOLVED', severity: 'CRITICAL' }]
  });
  check(resolved.status === 'SALES_READY' && resolved.openIssueCount === 0,
    '7. Cozulmus ariza satis hazirligini kapatmiyor');

  const paidFalse = build({ overrideStatus: 'SALES_READY', paid: false });
  const paidTrue = build({ overrideStatus: 'SALES_READY', paid: true });
  check(JSON.stringify(paidFalse) === JSON.stringify(paidTrue),
    '8. Odeme durumu operasyonel satis hazirligini degistirmiyor');

  check(['owner', 'admin', 'manager', 'staff'].every(Readiness.canEdit)
    && !Readiness.canEdit('viewer') && !Readiness.canEdit('accountant'),
  '9. Yalniz yetkili roller ana sayfadan durum degistirebiliyor');

  const persistBody = functionBody(APP, 'setPropertySalesReadiness');
  check(persistBody.includes('await reportStatePersist')
    && persistBody.indexOf('await reportStatePersist') < persistBody.indexOf('appData.housekeepingOverrides[vKey] = status'),
  '10. Yerel durum yalniz bulut yazmasi beklendikten ve basarili olduktan sonra degisiyor',
  persistBody);
  check(persistBody.includes('canManagePropertyReadiness()'),
    '11. Kaydetme yolu arayuz kontrolune ek olarak rol yetkisini de denetliyor');

  for (const status of Readiness.SELECTABLE_STATUSES) {
    check(MIGRATION.includes(`'${status}'`),
      `12. Phase 36 kisiti ${status} degerini kabul ediyor`);
  }
  check(MIGRATION.includes("'CLEANING', 'READY', 'OCCUPIED'")
    && MIGRATION.includes('DROP CONSTRAINT IF EXISTS')
    && MIGRATION.includes('RAISE EXCEPTION'),
  '13. Ileri yonlu goc eski satirlari koruyor ve kendi dogrulama blogunu tasiyor');
  check(!/\bpaid\b\s*(?:=|IN|IS)/i.test(MIGRATION),
    '14. Veritabani hazirlik sozlesmesi odeme durumuna baglanmiyor');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
