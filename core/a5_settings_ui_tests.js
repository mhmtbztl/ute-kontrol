'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const actions = fs.readFileSync(path.join(ROOT, 'core', 'action_dispatch.js'), 'utf8');

const settings = (html.match(/<div id="tab-settings"[\s\S]*?<div id="tab-properties"/) || [''])[0];
const sectionNames = [...settings.matchAll(/data-settings-section="([^"]+)"/g)].map(match => match[1]);

assert.deepStrictEqual(sectionNames, ['business', 'team', 'channels', 'templates', 'lead-sources', 'danger']);
assert(!/settingsGoalsTableBody|settingsTableBody|AYLIK CİRO VE KÂR HEDEFLERİ|VİLLA FİYAT BASAMAKLARI/.test(settings),
  'Hedef ve fiyat basamağı yönetimi Ayarlar ekranında kalmamalı');

assert.match(settings, /İşletme adı/);
assert.match(settings, /businessLogoInput/);
assert.match(settings, /businessLogoPreview/);
assert.match(settings, /Mesaj şablonları[\s\S]*Görev şablonları[\s\S]*Kontrol listeleri/);
assert.match(settings, /TALEP KAYNAKLARI[\s\S]*settingsLeadSourcesBody/);
assert.match(settings, /Saha personeli/);

assert.match(app, /function renderSettingsWorkspace\(/);
assert.match(app, /tabId === 'settings'\s*&&\s*!canManageTenantRole\(activeTenant\?\.role\)/);
assert.match(app, /hiddenTabs[\s\S]*settings/);
assert.match(app, /'tab-settings': \['renderSettingsWorkspace', 'renderTeamManagement'\]/);

assert.match(app, /tenant-assets/);
assert.match(app, /business_profile/);
assert.match(app, /function renderBusinessSettings\(/);
assert.match(app, /async function saveBusinessSettings\(/);
assert.match(app, /async function uploadBusinessLogo\(/);

assert.match(app, /function renderSettingsTemplates\(/);
for (const table of ['message_templates', 'task_templates', 'property_checklist_templates']) {
  assert(app.includes(`from('${table}')`), `${table} Ayarlar şablon merkezine bağlı olmalı`);
}
assert.match(app, /Şablonu düzenle →/);

assert.match(app, /function renderSettingsLeadSources\(/);
assert.match(app, /source\.code === 'UNKNOWN'/);
assert.match(app, /Bilinmiyor[\s\S]*(silinemez|kapatılamaz)/i);

for (const action of [
  'saveBusinessSettings', 'uploadBusinessLogo', 'createSettingsMessageTemplate',
  'createSettingsTaskTemplate', 'createSettingsChecklistTemplate',
  'createSettingsLeadSource', 'toggleSettingsLeadSource'
]) {
  assert(actions.includes(`'${action}'`), `${action} EYLEMLER izin listesinde olmalı`);
}

console.log('[PASS] A5-G1 Ayarlar altı bölüm, rol kapısı, logo, şablonlar ve talep kaynakları sözleşmesi');
