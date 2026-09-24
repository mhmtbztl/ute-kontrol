const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(__dirname, 'marketing_ui.js'), 'utf8');
const contextUi = fs.readFileSync(path.join(__dirname, 'property_analysis_context_ui.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'marketing-workers.yml'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let assertions = 0;
function check(value, message) {
  assertions += 1;
  assert.ok(value, message);
  console.log(`[PASS] ${message}`);
}

check(!/data-marketing-request-analysis|AI ile analiz et|Analiz sürüyor/.test(ui), 'Fotoğraf AI analiz düğmesi kaldırılmalı');
check(!/renderPhotoAnalysisResult|renderAnalysisRuns|handleAnalysisRequest/.test(ui), 'Fotoğraf AI sonuç ve kuyruk UI kodu kaldırılmalı');
check(!/marketing:photo-worker|GEMINI_API_KEY|AI_DATA_PROCESSING_APPROVED/.test(workflow), 'Atlanan Gemini worker adımı ve sırları Actions işinden kaldırılmalı');
check(/tab-analysis/.test(index) && /analysis_center_ui\.js/.test(index), 'ChatGPT Analiz Merkezi korunmalı');
check(!/name="confidence" value="0\.7"/.test(ui), 'Güven alanı kanıtsız 0,7 varsayımıyla gelmemeli');
check(!/Villa Azure/.test(ui), 'Örnek mülk adı kullanıcı formunda yer tutucu olmamalı');
check(!/\$\{error\.message\}/.test(ui), 'İngilizce hata kodları doğrudan kullanıcıya gösterilmemeli');
check(!/contextError\.message/.test(app), 'Bağlam kayıt hatası teknik kodu kullanıcıya sızmamalı');
check(/propertyAnalysisContextDirty[\s\S]{0,500}setPropertyAnalysisContextStatus\('Yazdığınız/.test(contextUi), 'Geç yüklenen bağlam, kullanıcının yazdığı formu ezmemeli');

console.log(`\nTEST SUMMARY: ${assertions} / ${assertions} TESTS PASSED`);
