const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const contextService = fs.readFileSync(path.join(__dirname, 'property_analysis_context_service.js'), 'utf8');

for (const id of ['propName', 'propKey', 'propCapacity', 'propBasePrice', 'propActivatedOn']) {
  const input = html.match(new RegExp(`<input[^>]+id="${id}"[^>]*>`));
  assert(input && /\brequired\b/.test(input[0]), `${id} zorunlu olmalı`);
}
for (const label of ['Genel', 'Fiyatlar', 'Kanallar', 'Geçmiş']) assert(app.includes(`'${label}'`));
for (const id of ['propAnalysisLocality', 'propMapCoordinatesLink', 'propAnalysisLatitude', 'propAnalysisLongitude', 'propAnalysisRadius', 'propOwnerId']) assert(html.includes(`id="${id}"`));
assert(contextService.includes("client.rpc('save_property_location'"));
assert(app.includes('PropertyProfileEngine.buildPropertyReport'));
assert(html.includes('Satıştan Çek / Arşivle'));
assert(!html.includes('>🗑️ Mülkü Sil<'));
console.log('[PASS] Mülkler sekmeli profil, zorunlu alan, konum, sahip, arşiv ve tek-defter raporunu bağlar');
