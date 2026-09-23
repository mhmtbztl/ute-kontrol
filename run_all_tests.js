const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const allTestFiles = [
  // Prior 29 Regression Suites (Phases 1-10)
  'auth_lifecycle_tests.js',
  'captcha_gate_tests.js',
  'booking_crud_tests.js',
  'booking_channel_settings_tests.js',
  'booking_channel_schema_tests.js',
  'booking_channel_live_tests.js',
  'booking_operations_tests.js',
  'cleaning_workflow_tests.js',
  'extension_offer_tests.js',
  'finance_ai_payload_tests.js',
  'finance_analytics_tests.js',
  'finance_crud_tests.js',
  'finance_import_tests.js',
  'financial_metrics_tests.js',
  'analysis_export_service_tests.js',
  'analysis_center_ui_tests.js',
  'property_analysis_context_service_tests.js',
  'phase40_property_analysis_context_tests.js',
  'guest_domain_tests.js',
  'guest_crm_tests.js',
  'guest_linking_schema_tests.js',
  'guest_profile_context_schema_tests.js',
  'guest_ui_integration_tests.js',
  'lead_edit_preservation_tests.js',
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
  'executive_ai_ui_tests.js',
  'notification_center_tests.js',
  'final_security_audit_tests.js',
  'end_to_end_product_tests.js',
  'multi_tenant_e2e_tests.js',

  // Gercek tarayici kayit/giris akisi (anon key) - diger suitler bu yolu atliyor
  'registration_flow_tests.js',

  // Ekip daveti ve rol yonetimi (Phase 16)
  'team_management_tests.js',

  // Phase 17 Revenue & Distribution Intelligence (pure unit suite)
  'marketing_engine_tests.js',
  'marketing_schema_tests.js',
  'marketing_anon_grant_tests.js',
  'marketing_tenant_isolation_tests.js',
  'marketing_funnel_tests.js',
  'marketing_media_schema_tests.js',
  'marketing_action_tests.js',
  'marketing_actions_schema_tests.js',
  'marketing_impact_tests.js',
  'marketing_impact_schema_tests.js',
  'photo_intelligence_tests.js',
  'marketing_health_tests.js',
  'marketing_priority_tests.js',
  'seasonal_marketing_tests.js',
  'photo_analysis_job_tests.js',
  'marketing_ui_tests.js',
  'marketing_data_service_tests.js',
  'marketing_review_service_tests.js',
  'marketing_manual_snapshot_schema_tests.js',
  'marketing_snapshot_service_tests.js',
  'marketing_channel_listing_schema_tests.js',
  'marketing_channel_listing_service_tests.js',
  'marketing_media_upload_service_tests.js',
  'marketing_photo_analysis_service_tests.js',
  'marketing_experiment_service_tests.js',
  'marketing_finding_orchestrator_tests.js',
  'photo_analysis_worker_tests.js',
  'photo_analysis_worker_schema_tests.js',
  'photo_analysis_supabase_repository_tests.js',
  'gemini_photo_analysis_provider_tests.js',
  'photo_analysis_worker_entrypoint_tests.js',
  'marketing_photo_results_service_tests.js',
  'marketing_health_results_service_tests.js',
  'marketing_experiment_worker_tests.js',
  'marketing_experiment_worker_repository_tests.js',
  'marketing_experiment_worker_schema_tests.js',
  'marketing_experiment_worker_entrypoint_tests.js',
  'seasonal_marketing_worker_tests.js',
  'seasonal_marketing_worker_repository_tests.js',
  'seasonal_marketing_worker_entrypoint_tests.js',
  'marketing_health_input_service_tests.js',
  'marketing_health_worker_tests.js',
  'marketing_health_worker_repository_tests.js',
  'marketing_health_worker_schema_tests.js',
  'marketing_health_worker_entrypoint_tests.js',
  'marketing_benchmark_service_tests.js',
  'marketing_health_source_collector_tests.js',
  'marketing_health_source_repository_tests.js',
  'marketing_health_source_entrypoint_tests.js',
  'marketing_funnel_worker_tests.js',
  'marketing_funnel_worker_entrypoint_tests.js',
  'marketing_economics_finding_service_tests.js',
  'marketing_economics_worker_repository_tests.js',
  'marketing_economics_worker_tests.js',
  'marketing_economics_worker_entrypoint_tests.js',
  'marketing_cover_change_service_tests.js',
  'marketing_scheduler_tests.js',

  // Hesap kapatma / KVKK silme (Phase 18)
  'account_deletion_tests.js',

  // Yeni musteriye demo verisi sizmasi regresyonu
  'fresh_tenant_isolation_tests.js',

  // USALI gelir/gider siniflandirmasi (yonetici-finans tutarliligi)
  'usali_revenue_treatment_tests.js',

  // Veri gibi gorunen statik arayuz degerleri denetimi
  'static_ui_value_tests.js',

  // Rezervasyon silme atomikligi (Phase 19)
  'booking_delete_atomicity_tests.js',

  // Gelirin doneme dagitilmasi (aylari kesen rezervasyonda cift sayim)
  'revenue_attribution_tests.js',
  'period_filter_tests.js',

  // Rezervasyon ekrani: temizlik geliri/gideri ayrimi, komisyon seffafligi,
  // tek takvimli tarih araligi
  'booking_form_economics_tests.js',

  // Ay kapanisi butunlugu (Phase 20)
  'month_close_integrity_tests.js',

  // Yonetici anlik goruntu RPC: tahakkuk, gece sayimi, USALI siniflandirmasi
  'executive_snapshot_tests.js',

  // Phase 32: yonetici UI finansal KPI'lari sunucu snapshot'ina bagli mi
  'executive_snapshot_ui_tests.js',

  // Bildirim/uyari RPC yetki sirasi ve anon iptali (Phase 29)
  'notification_authz_tests.js',

  // Bildirim merkezi her iki uctan da bagli mi (yukleme + kalici okundu)
  'notification_wiring_tests.js',

  // Ekip daveti: hesabi olan adrese de e-posta gidiyor mu, davetle gelene sifre belirletiliyor mu
  'invitation_worker_tests.js',

  // Temizlik & gider defteri gercekten Postgres'e yaziliyor mu
  'cleaning_ledger_persistence_tests.js',

  // "Kaydettim" diyen her yer yaziyor mu + sabit YYYY-MM ay taramasi
  'persistence_wiring_tests.js',
  'whatsapp_parser_tests.js',
  'action_truthfulness_tests.js',
  'property_archive_tests.js',

  // Yerel kalan son alti defter Postgres'e tasindi mi (Phase 31)
  'phase31_persistence_tests.js',

  // Phase 36: ana sayfa mulk satis hazirligi sozlesmesi ve rol kapisi
  'property_sales_readiness_tests.js',

  // Phase 31 tablolarinin RLS'i ve anon kapisi (canli — test projesine kosar)
  'phase31_isolation_tests.js',

  // Phase 40 pazar baglami RLS'i, anon kapisi ve capraz kiraci korumasi
  'property_analysis_context_isolation_tests.js',

  // Phase 35: ice aktarimi geri alma — bag, kaynak taramasi ve goc icerigi
  'import_undo_tests.js',

  // Phase 35 geri almanin GERCEK davranisi (canli — test projesine kosar):
  // atlanan duzenlemeler, kapanmis donem reddi, capraz kiraci, anon kapisi
  'import_undo_live_tests.js',

  // Demo artigi denetimi (uydurma villa/rakam/tarih kaynak taramasi)
  'demo_residue_tests.js',

  // Isletme verisini sifirlama (Phase 21)
  'tenant_reset_tests.js',

  // Ice aktarma motoru (ayristirma, dogrulama, mukerrer, cakisma)
  'import_engine_tests.js',

  // CSV / metin dosyasi yolu (phase33): kod sayfasi, ayirici, tirnakli satir
  // sonu ve surukle-birak. Metin yolu yokken "72.500,50" -> 72.5005 oluyordu.
  'csv_import_tests.js',

  // Defter disa aktarma: indirilen dosya GERI YUKLENEBILIYOR mu. Eskiden
  // tek disa aktarim appData'nin ham JSON dokumuydu ve geri okunamiyordu.
  'finance_export_tests.js',

  // Canli test kapisi: suitler hangi projeye yaziyor (kara liste + siniflandirma)
  'test_gate_tests.js',

  // Tarayici render hatti — sahte DOM ile renderAll GERCEKTEN calisir.
  // setEl gibi tanimsiz referanslari yalnizca bu suit yakalar.
  'render_pipeline_tests.js',
  'audit_remediation_tests.js',

  // phase41: rol ve kiraci yetkileri. Canli suit gercek rollerle olcer;
  // kural suiti sonraki goclerin tenant_id tetikleyicisini unutmasini engeller.
  'phase41_authz_live_tests.js',
  'phase41_rules_tests.js',

  // phase43: ay kapanisi, sifirlama, hesap kapatma, sahipsiz fotograf temizligi
  'phase43_period_reset_live_tests.js',
  'storage_orphan_cleanup_tests.js',

  // Yerel sunucu yalnizca 127.0.0.1 ve izin listesi (.env / .git / supabase verilmez)
  'local_server_tests.js',

  // Tarayici kutuphaneleri depoya gomulu ve ozetle sabit (SheetJS, Supabase SDK)
  'vendor_pin_tests.js',

  // GitHub Actions eylemleri tam commit SHA'sina sabit
  'workflow_pin_tests.js',

  // Clickjacking: yabanci cercevede belge gizlenir (Pages baslik veremiyor)
  'frame_guard_tests.js'
];

const testEnv = require('./core/test_env.js');

const allowLiveTests = testEnv.destructiveTestsAllowed();

// -----------------------------------------------------------------------------
// CANLI SUIT SINIFLANDIRMASI
// Eskiden bu ayrim kaba bir metin taramasiydi:
//   source.includes('@supabase/supabase-js') || source.includes('SUPABASE_SERVICE_ROLE_KEY')
// Worker giris noktasi suitleri o dizgiyi assert.match(...) IDDIASININ ICINDE
// tasiyordu; yani hicbir baglanti acmadiklari halde 8 cevrimdisi suit guvenli
// kosudan atiliyordu.
//
// Olcut artik tek ve kesin: bir suit ancak Supabase ISTEMCISINI require
// ediyorsa veritabanina dokunabilir. Kapiyi (test_env.js) require etmek olcut
// DEGILDIR — kapinin kendi denetim suiti de onu require eder ama hicbir
// baglanti acmaz; olcut o olsaydi denetim suiti kendini guvenli kosudan
// atardi ve CI'da hic calismazdi.
// -----------------------------------------------------------------------------
const GATE_REQUIRE = /require\((['"])\.\/test_env\.js\1\)/;
const CLIENT_REQUIRE = /require\((['"])@supabase\/supabase-js\1\)/;

const liveTestFiles = new Set();
const ungatedSuites = [];
for (const file of allTestFiles) {
  const source = fs.readFileSync(path.join(__dirname, 'core', file), 'utf8');
  if (!CLIENT_REQUIRE.test(source)) continue;
  liveTestFiles.add(file);
  // Supabase istemcisi yaratip kapidan gecmeyen bir suit, kapinin hic
  // olmadigi eski duruma geri donustur. Sessizce siniflandirmak yerine dur.
  if (!GATE_REQUIRE.test(source)) ungatedSuites.push(file);
}
if (ungatedSuites.length) {
  throw new Error(
    'LIVE_TEST_GUARD: su suitler Supabase istemcisi yaratiyor ama core/test_env.js\n' +
    '  kapisini kullanmiyor — kimlik bilgisini oradan alacak sekilde duzeltin:\n  ' +
    ungatedSuites.join('\n  ')
  );
}

// Hedef dogrulamasi tek yerde: core/test_env.js. Koruma burada tekrar
// yazilsaydi iki kopya kacinilmaz olarak ayrisirdi.
if (allowLiveTests) {
  testEnv.loadTestEnv();
}

const testFiles = allowLiveTests
  ? allTestFiles
  : allTestFiles.filter(file => !liveTestFiles.has(file));

console.log('=============================================================================');
console.log(`🚀 LEXBNB SAFE REGRESSION RUNNER — ${testFiles.length} TEST SUITES`);
if (!allowLiveTests && liveTestFiles.size) {
  console.log(`🔒 ${liveTestFiles.size} live database suites skipped. They require an explicit dedicated test project.\n`);
}
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
    // stderr'i de yakala. [FAIL] satirlari console.error ile yazildigi icin
    // yalnizca stdout okunursa asagidaki "sifir cikis koduyla [FAIL]" agi
    // HIC calismaz - bu kontrolun var olma sebebi tam olarak buydu.
    const output = execSync(`node "${filePath}" 2>&1`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

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
// Suitler gercek auth kullanicisi acar. Temizlik hatalari Supabase JS'te
// FIRLATMAZ, {error} doner; kontrol edilmezse gorunmez kalir — 2026-09-11'de bu
// sekilde 525 artik hesap birikmisti. Bu denetim, hangi suit sizdirirsa
// sizdirsin durumu gorunur kilar.
//
// Denetlenen proje, kapinin ONAYLADIGI hedeftir; yani ayri test projesi.
// Uretim artik hedeflenemez (core/test_env.js kara listesi), dolayisiyla
// mesajlar "uretim" demez: yanlis projeyi isaret eden bir uyari, insani
// gereksiz yere uretimde temizlik aramaya gonderir.
// -----------------------------------------------------------------------------
const TEST_EMAIL_RE = /@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$/i;
let leakedAccounts = null;
let auditedHost = 'test';

async function auditLeakedTestAccounts() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    // Suitlerin yazdigi projeyi denetler — kapinin onayladigi hedefin aynisi.
    const env = testEnv.loadTestEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
    auditedHost = new URL(env.SUPABASE_URL).hostname;

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
leakedAccounts = allowLiveTests ? await auditLeakedTestAccounts() : [];

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
if (!allowLiveTests) {
  console.log('🔒 Canlı hesap sızıntısı denetimi atlandı; güvenli test koşusu dış sisteme bağlanmaz.');
} else if (leakedAccounts === null) {
  console.log('⚠️  Sizinti denetimi calistirilamadi (.env veya servis anahtari okunamadi).');
} else if (leakedAccounts.length > 0) {
  leakFailed = true;
  console.log(`\n❌ SIZINTI: ${auditedHost} projesinde ${leakedAccounts.length} temizlenmemis test hesabi var.`);
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
