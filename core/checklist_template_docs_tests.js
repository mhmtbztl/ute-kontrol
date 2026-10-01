const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
try {
  const files = ['ornek_kontrol_listesi_seyir_zirve.json', 'ornek_kontrol_listesi_dogus_nefes_sirin.json'];
  const docs = files.map(name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', name), 'utf8')));
  const templates = docs.flatMap(doc => doc.templates || []);
  const properties = templates.map(t => t.property).filter(Boolean);
  check(['Seyir', 'Zirve', 'Doğuş', 'Nefes', 'Şirin'].every(name => properties.includes(name)), 'A1. Bes kullanici PDF mulkunun sablonu hazir', properties.join(', '));
  check(templates.every(t => t.items && Array.isArray(t.items.sections) && t.items.sections.length > 0), 'A2. Her sablon bolumlu phase55 snapshot biciminde', 'bolumu bos sablon var');
  check(templates.every(t => Array.isArray(t.items.supplies)), 'A3. Her sablon malzeme listesini tasir', 'malzeme listesi eksik');
  check(docs.every(doc => (doc._aciklama || []).join(' ').toLowerCase().includes('onay')), 'A4. Ornekler kendiliginden ice aktarilmaz; onay kapisi belgeli', 'onay metni eksik');
  const expectedPdfRows = { 'Doğuş': 88, 'Nefes': 97, 'Şirin': 81 };
  const rowCounts = Object.fromEntries(templates.map(template => [
    template.property,
    template.items.sections.reduce((sum, section) => sum + section.items.length, 0)
  ]));
  check(
    Object.entries(expectedPdfRows).every(([property, count]) => rowCounts[property] === count),
    'A5. Her PDF satiri bagimsiz Z/M maddesidir',
    Object.entries(expectedPdfRows).map(([property, count]) => `${property}: ${rowCounts[property] || 0}/${count}`).join(', ')
  );
} catch (error) {
  check(false, 'JSON belgeleri okunur', error.stack || error.message);
}
console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed) process.exit(1);
