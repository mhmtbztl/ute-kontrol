const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testFiles = [
  // Prior 29 Regression Suites (Phases 1-10)
  'auth_lifecycle_tests.js',
  'booking_crud_tests.js',
  'booking_operations_tests.js',
  'cleaning_workflow_tests.js',
  'extension_offer_tests.js',
  'finance_ai_payload_tests.js',
  'finance_analytics_tests.js',
  'finance_crud_tests.js',
  'finance_import_tests.js',
  'financial_metrics_tests.js',
  'guest_domain_tests.js',
  'lead_crud_tests.js',
  'maintenance_tests.js',
  'message_automation_tests.js',
  'message_delivery_tests.js',
  'message_scheduling_tests.js',
  'message_template_tests.js',
  'messaging_security_tests.js',
  'monthly_target_tests.js',
  'month_close_tests.js',
  'operations_priority_tests.js',
  'operations_security_tests.js',
  'operations_task_tests.js',
  'property_crud_tests.js',
  'recurring_operations_tests.js',
  'supabase_live_integration_tests.js',
  'supabase_security_tests.js',
  'tenant_session_tests.js',
  'tests.js',

  // 7 Phase 11 Pricing Suites
  'pricing_engine_tests.js',
  'pricing_rules_tests.js',
  'gap_night_tests.js',
  'pricing_booking_integration_tests.js',
  'revenue_forecast_tests.js',
  'pricing_security_tests.js',
  'pricing_concurrency_tests.js',

  // 7 Phase 12 Executive & Final Product Suites
  'executive_dashboard_tests.js',
  'executive_priority_tests.js',
  'executive_ai_context_tests.js',
  'notification_center_tests.js',
  'final_security_audit_tests.js',
  'end_to_end_product_tests.js',
  'multi_tenant_e2e_tests.js',

  // Gercek tarayici kayit/giris akisi (anon key) - diger suitler bu yolu atliyor
  'registration_flow_tests.js',

  // Ekip daveti ve rol yonetimi (Phase 16)
  'team_management_tests.js'
];

console.log('=============================================================================');
console.log(`🚀 LEXBNB FINAL MASTER REGRESSION RUNNER — ${testFiles.length} TEST SUITES`);
console.log('=============================================================================\n');

let totalPassedAcrossSuites = 0;
let totalFailedAcrossSuites = 0;
let totalWarningsAcrossSuites = 0;
let suiteResults = [];
let unparsedSuites = [];

for (let i = 0; i < testFiles.length; i++) {
  const file = testFiles[i];
  const filePath = path.join(__dirname, 'core', file);
  process.stdout.write(`[${String(i + 1).padStart(2, ' ')}/${testFiles.length}] Running ${file.padEnd(40, ' ')} ... `);

  try {
    const output = execSync(`node "${filePath}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    
    // Parse pass count from output: [PASS] or X / X TESTS PASSED
    const passMatches = output.match(/\[PASS\]/g);
    const summaryMatch = output.match(/TEST SUMMARY:\s*(\d+)\s*\/\s*(\d+)\s*TESTS PASSED/i) ||
                         output.match(/(\d+)\s*\/\s*(\d+)\s*PASS/i);

    let passes = 0;
    if (summaryMatch) {
      passes = parseInt(summaryMatch[1], 10);
    } else if (passMatches) {
      passes = passMatches.length;
    } else {
      // Cikti ayristirilamadi. Gecis SAYMA - uydurulmus bir "1 test gecti"
      // suitin gercekten bir sey dogruladigini gizler.
      passes = 0;
      unparsedSuites.push(file);
    }

    // Bir suit [FAIL] basip yine de 0 ile cikabilir; ciktiya da bak.
    const failMarkers = (output.match(/\[FAIL\]/g) || []).length;
    if (failMarkers > 0) {
      totalFailedAcrossSuites++;
      suiteResults.push({ file, status: 'FAIL', passes, error: 'Suit [FAIL] bastirdi ama sifir cikis kodu dondurdu' });
      console.log(`FAIL (${failMarkers} basarisiz iddia, cikis kodu 0)`);
      continue;
    }

    totalPassedAcrossSuites += passes;
    suiteResults.push({ file, status: 'PASS', passes, error: null });
    console.log(`PASS (${passes} tests)`);
  } catch (err) {
    totalFailedAcrossSuites++;
    const errMsg = err.stderr || err.stdout || err.message;
    suiteResults.push({ file, status: 'FAIL', passes: 0, error: errMsg });
    console.log(`FAIL ❌`);
    console.error(`\n--- ERROR IN ${file} ---`);
    // Kor bir substring, ciktinin SONUNDAKI temizlik hatalarini gizliyordu.
    // Once her [FAIL] satirini goster, sonra baglam icin bir ozet parca ver.
    const failLines = errMsg.split(/\r?\n/).filter(l => l.includes('[FAIL]'));
    if (failLines.length) {
      console.error(failLines.join('\n'));
      console.error('  ...');
    }
    console.error(errMsg.substring(0, 1200));
    console.error('------------------------\n');
  }
}

// -----------------------------------------------------------------------------
// SIZINTI DENETIMI
// Suitler uretim Supabase projesine karsi calisiyor ve gercek kullanici aciyor.
// Temizlik hatalari Supabase JS'te FIRLATMAZ, {error} doner; kontrol edilmezse
// gorunmez kalir. 2026-09-11'de bu sekilde 525 artik hesap birikmisti.
// Bu denetim, hangi suit sizdirirsa sizdirsin durumu gorunur kilar.
// -----------------------------------------------------------------------------
const TEST_EMAIL_RE = /@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$/i;
let leakedAccounts = null;

async function auditLeakedTestAccounts() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const envPath = path.join(__dirname, '.env');
    const env = {};
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
    });
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;

    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return null;
    return data.users.filter(u => TEST_EMAIL_RE.test(u.email || '')).map(u => u.email);
  } catch (e) {
    return null;
  }
}

(async () => {
leakedAccounts = await auditLeakedTestAccounts();

console.log('\n=============================================================================');
console.log('🏁 GRAND FINAL REGRESSION SUMMARY');
console.log('=============================================================================');
console.log(`Total Test Suites Run:    ${testFiles.length} / ${testFiles.length}`);
console.log(`Suites Passed:            ${suiteResults.filter(r => r.status === 'PASS').length} / ${testFiles.length}`);
console.log(`Suites Failed:            ${totalFailedAcrossSuites}`);
console.log(`Total Assertion Passes:   ${totalPassedAcrossSuites}`);
console.log(`Total Failures:           ${totalFailedAcrossSuites}`);
console.log(`Total Warnings:           ${totalWarningsAcrossSuites}`);
console.log('=============================================================================');

if (unparsedSuites.length) {
  console.log(`⚠️  Ciktisi ayristirilamayan suitler (gecis sayilmadi): ${unparsedSuites.join(', ')}`);
}

let leakFailed = false;
if (leakedAccounts === null) {
  console.log('⚠️  Sizinti denetimi calistirilamadi (.env veya servis anahtari okunamadi).');
} else if (leakedAccounts.length > 0) {
  leakFailed = true;
  console.log(`\n❌ SIZINTI: uretim projesinde ${leakedAccounts.length} temizlenmemis test hesabi var.`);
  console.log(`   Ornek: ${leakedAccounts.slice(0, 5).join(', ')}${leakedAccounts.length > 5 ? ' ...' : ''}`);
  console.log('   Temizlik: supabase/cleanup_test_accounts.sql');
  console.log('   Silme bloke oluyorsa migration_phase13 + migration_phase14 calistirilmamis olabilir.');
} else {
  console.log('✅ Sizinti denetimi temiz — artik test hesabi yok.');
}

if (totalFailedAcrossSuites > 0 || leakFailed) {
  console.log('❌ REGRESSION FAILED — Please inspect error output above.');
  process.exit(1);
} else {
  console.log(`✅ ALL ${testFiles.length} TEST SUITES PASSED CLEANLY`);
}
})();
