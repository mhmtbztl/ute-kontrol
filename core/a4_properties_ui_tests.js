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

const App = require('../app.js');
const salesHistory = App.buildPropertyHistoryView({ netRoomRevenue: 10000, totalOpex: 0, capex: 0, netProfit: 10000 }, 'sales');
assert.strictEqual(salesHistory.showLedger, false);
assert.strictEqual(salesHistory.netProfit, null);
const unmeasured = App.buildPropertyHistoryView({ netRoomRevenue: 10000, totalRevenue: 10000, totalOpex: 0, capex: 0, netProfit: 10000 }, 'manager');
assert.strictEqual(unmeasured.showLedger, true);
assert.strictEqual(unmeasured.netProfit, null);
assert.match(unmeasured.reason, /ölçülemedi/i);
const measured = App.buildPropertyHistoryView({ netRoomRevenue: 10000, totalRevenue: 10000, totalOpex: 2000, capex: 0, netProfit: 8000 }, 'viewer');
assert.strictEqual(measured.netProfit, 8000);
console.log('[PASS] Mülkler sekmeli profil, zorunlu alan, konum, sahip, arşiv ve tek-defter raporunu bağlar');
