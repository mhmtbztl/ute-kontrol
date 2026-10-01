/** phase70 — Istanbul is tarihi varsayilanlari kaynak sozlesmesi. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'supabase', 'migration_phase70_business_date_defaults.sql');
let passed = 0, failed = 0;
const check = (condition, name, detail) => condition
  ? (passed++, console.log(`[PASS] ${name}`))
  : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
try {
  const sql = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n') : '';
  check(!!sql, 'A1. phase70 gocu var', FILE);
  check(/properties[\s\S]*activated_on[\s\S]*Europe\/Istanbul/.test(sql), 'A2. activated_on Istanbul is gununu kullanir', 'ALTER eksik');
  check(/expenses[\s\S]*expense_date[\s\S]*Europe\/Istanbul/.test(sql), 'A3. expense_date Istanbul is gununu kullanir', 'ALTER eksik');
  check(/leads[\s\S]*lead_date[\s\S]*Europe\/Istanbul/.test(sql), 'A4. lead_date Istanbul is gununu kullanir', 'ALTER eksik');
  check(!/SET DEFAULT CURRENT_DATE/.test(sql), 'A5. UTC oturum tarihine donen varsayilan yok', 'CURRENT_DATE kaldi');
  check(/PHASE70_[A-Z_]+/.test(sql) && /RAISE EXCEPTION/.test(sql), 'B1. Goc kendi dogrulama blogunda durur', 'verify eksik');
  check(/VALUES \(70, 'phase70_business_date_defaults'\)/.test(sql), 'B2. schema_migrations kaydi var', 'phase kaydi eksik');
} catch (error) {
  failed++;
  console.error(error.stack);
} finally {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
