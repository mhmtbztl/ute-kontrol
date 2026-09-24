const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let passed = 0;
let failed = 0;

function check(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${label}`);
    return;
  }
  failed += 1;
  console.error(`[FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
}

const deadBrowserModules = [
  'operations_priority_engine',
  'operations_sla_service',
  'property_readiness_service',
  'operations_engine',
  'recurring_tasks_service',
  'today_operations_service',
  'message_template_engine',
  'messaging_provider',
  'extension_offer_service',
  'guest_messaging_engine',
  'message_delivery_service',
  'pricing_engine',
  'revenue_forecast_service',
  'notification_center_service'
];

for (const moduleName of deadBrowserModules) {
  check(
    !new RegExp(`<script[^>]+src=["']core/${moduleName}\\.js(?:\\?[^"']*)?["']`, 'i').test(html),
    `İlk yükleme ölü ${moduleName} modülünü istemiyor`
  );
}

const requiredBrowserModules = [
  'financial_metrics_service',
  'analysis_export_service',
  'property_analysis_context_service',
  'finance_import_engine',
  'finance_export_engine',
  'property_sales_readiness',
  'guest_contact_utils',
  'guest_crm_engine',
  'gap_night_service',
  'executive_priority_service',
  'executive_dashboard_service',
  'executive_ai_advisor',
  'captcha_gate',
  'property_analysis_context_ui',
  'analysis_center_ui',
  'marketing_ui'
];

for (const moduleName of requiredBrowserModules) {
  check(
    new RegExp(`<script[^>]+src=["']core/${moduleName}\\.js(?:\\?[^"']*)?["']`, 'i').test(html),
    `Görünür akışın ${moduleName} modülü korunuyor`
  );
}

check(
  html.indexOf('core/financial_metrics_service.js') < html.indexOf('core/analysis_center_ui.js'),
  'Analiz Merkezi finans servisi UI modülünden önce yükleniyor'
);
check(
  html.indexOf('core/property_analysis_context_service.js') < html.indexOf('core/property_analysis_context_ui.js'),
  'Analiz bağlam servisi UI modülünden önce yükleniyor'
);
check(
  !/Dinamik fiyatlandırma motoru/i.test(app),
  'Arayüz bağlı olmayan dinamik fiyat motorunu çalışıyor gibi vaat etmiyor'
);

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
