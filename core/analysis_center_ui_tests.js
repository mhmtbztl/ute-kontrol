const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const analysisUiJs = fs.readFileSync(path.join(root, 'core', 'analysis_center_ui.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

test('analysis center is reachable from the primary navigation', () => {
  assert(indexHtml.includes("switchTab('analysis')"));
  assert(indexHtml.includes('id="tab-analysis"'));
  assert(indexHtml.includes('Analiz Merkezi'));
});

test('analysis controls use labelled native form fields and live feedback', () => {
  for (const id of [
    'analysisStartDate', 'analysisEndDate', 'analysisComparison',
    'analysisPropertyList', 'analysisSectionList', 'analysisPromptPreview',
    'analysisSummary', 'analysisSummaryReservations', 'analysisSummaryNights'
  ]) {
    assert(indexHtml.includes(`id="${id}"`), `missing #${id}`);
  }
  assert(indexHtml.includes('id="analysisStatus" role="status" aria-live="polite"'));
  assert(indexHtml.includes('id="analysisError" role="alert"'));
});

test('canonical browser dependencies load before app.js', () => {
  const financeIndex = indexHtml.indexOf('core/financial_metrics_service.js');
  const marketingIndex = indexHtml.indexOf('core/marketing_engine.js');
  const exportIndex = indexHtml.indexOf('core/analysis_export_service.js');
  const appIndex = indexHtml.indexOf('app.js');
  const uiIndex = indexHtml.indexOf('core/analysis_center_ui.js');
  assert(financeIndex >= 0);
  assert(marketingIndex > financeIndex);
  assert(exportIndex > marketingIndex);
  assert(appIndex > exportIndex);
  assert(uiIndex > appIndex);
});

test('UI exposes generation, copy and JSON download actions', () => {
  assert(analysisUiJs.includes('function renderAnalysisCenter()'));
  assert(analysisUiJs.includes('function generateAnalysisExport()'));
  assert(analysisUiJs.includes('async function copyAnalysisPrompt()'));
  assert(analysisUiJs.includes('function downloadAnalysisJson()'));
  assert(appJs.includes("if (tabId === 'analysis') renderAnalysisCenter();"));
  assert(analysisUiJs.includes('isUUID(getActiveTenantId())'));
  assert(analysisUiJs.includes('navigator.clipboard.writeText(latestAnalysisExports.prompt)'));
});

test('analysis center has scoped responsive styles and a visible focus state', () => {
  assert(styleCss.includes('.analysis-layout'));
  assert(styleCss.includes('.analysis-field'));
  assert(styleCss.includes('.analysis-field:focus'));
  assert(styleCss.includes('@media (max-width: 800px)'));
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
