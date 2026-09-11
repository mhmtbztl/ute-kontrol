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
  'multi_tenant_e2e_tests.js'
];

console.log('=============================================================================');
console.log(`🚀 LEXBNB FINAL MASTER REGRESSION RUNNER — 43 TEST SUITES`);
console.log('=============================================================================\n');

let totalPassedAcrossSuites = 0;
let totalFailedAcrossSuites = 0;
let totalWarningsAcrossSuites = 0;
let suiteResults = [];

for (let i = 0; i < testFiles.length; i++) {
  const file = testFiles[i];
  const filePath = path.join(__dirname, 'core', file);
  process.stdout.write(`[${String(i + 1).padStart(2, ' ')}/43] Running ${file.padEnd(40, ' ')} ... `);

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
      passes = 1;
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
    console.error(errMsg.substring(0, 1000));
    console.error('------------------------\n');
  }
}

console.log('\n=============================================================================');
console.log('🏁 GRAND FINAL REGRESSION SUMMARY');
console.log('=============================================================================');
console.log(`Total Test Suites Run:    43 / 43`);
console.log(`Suites Passed:            ${suiteResults.filter(r => r.status === 'PASS').length} / 43`);
console.log(`Suites Failed:            ${totalFailedAcrossSuites}`);
console.log(`Total Assertion Passes:   ${totalPassedAcrossSuites}`);
console.log(`Total Failures:           ${totalFailedAcrossSuites}`);
console.log(`Total Warnings:           ${totalWarningsAcrossSuites}`);
console.log('=============================================================================');

if (totalFailedAcrossSuites > 0) {
  console.log('❌ REGRESSION FAILED — Please inspect error output above.');
  process.exit(1);
} else {
  console.log('✅ ALL 43 TEST SUITES PASSED CLEANLY (FAIL: 0, WARNING: 0)');
}
