'use strict';
// Notion tarzi gorev sayfasi (sadelik 4. tur, 22.11.2026). Saf model: kayitli bicim
// (phase55/96) <-> taslak, isaret anahtarlarinin silme/girintide kaymamasi, ilerleme ve
// tamamlama kurali (sunucudaki fn_checklist_critical_complete ile ayni), kayit yolu.
const fs = require('fs');
const path = require('path');
const TP = require('./task_page.js');
const OPS = require('./operations_engine.js');

let passed = 0;
let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); } else { failed++; console.error(`[FAIL] ${name}${detail ? `\n       ${detail}` : ''}`); }
}

const STORED = {
  sections: [
    { title: 'Mutfak', items: [
      { text: 'Bulaşık', important: true, subChecks: ['Tabaklar', 'Bardaklar'] },
      { text: 'Çöp', important: false }
    ] },
    { title: 'Oda 1', items: [{ text: 'Çarşaf', important: false }] }
  ],
  supplies: [{ area: 'Mutfak', item: 'Çay' }],
  result: { 's0.i0.sub1': { z: true }, 's0.i1': { z: true }, 's1.i0': { z: true } }
};

try {
  // A. Gidis-donus
  const d = TP.fromStored(STORED);
  check(d.length === 2 && d[0].title === 'Mutfak' && d[0].items[0].subs.length === 2 && d[0].items[0].important === true,
    'A1. Kayitli bicim basliklar, maddeler ve alt maddelerle taslaga doner');
  check(d[0].items[0].subs[1].done === true && d[0].items[0].subs[0].done === false && d[0].items[1].done === true && d[1].items[0].done === true,
    'A2. Isaretler konum anahtarindan okunur (s0.i0.sub1, s0.i1, s1.i0)');
  const geri = TP.toStored(d, STORED);
  check(JSON.stringify(geri.sections) === JSON.stringify([
    { title: 'Mutfak', items: [{ text: 'Bulaşık', important: true, subChecks: ['Tabaklar', 'Bardaklar'] }, { text: 'Çöp', important: false }] },
    { title: 'Oda 1', items: [{ text: 'Çarşaf', important: false }] }
  ]) && JSON.stringify(geri.result) === JSON.stringify(STORED.result) && geri.supplies === STORED.supplies,
  'A3. Taslak -> kayit birebir; malzeme listesi korunur', JSON.stringify(geri));
  check(OPS.normalizeChecklistTemplate(geri).valid === true, 'A4. Kayit saha ekraninin okuyucusundan gecerli gecer');
  const eski = TP.fromStored([{ text: 'Kapı', required: true, completed: true }]);
  check(eski.length === 1 && eski[0].title === 'Genel' && eski[0].items[0].important && eski[0].items[0].done, 'A5. Eski dizi bicimi (phase9) tek "Genel" basligina doner');
  check(JSON.stringify(TP.toStored([], null)) === '{}' && TP.fromStored({}).length === 0, 'A6. Bos sayfa {} olarak kalir');

  // B. Duzenleme: silme ve girintide isaretler kaymaz
  const d2 = TP.fromStored(STORED);
  TP.ops.remove(d2, d2[0].items[0].id); // Bulasik (ve alt maddeleri) silinir
  const k2 = TP.toStored(d2, STORED);
  check(k2.sections[0].items[0].text === 'Çöp' && k2.result['s0.i0'] && k2.result['s0.i0'].z === true && !k2.result['s0.i1'] && k2.result['s1.i0'],
    'B1. Ust madde silinince alttaki maddenin isareti yeni konumuna tasinir', JSON.stringify(k2.result));
  const d3 = TP.fromStored(STORED);
  const yeniAlt = TP.ops.indent(d3, d3[0].items[1].id); // Cop -> Bulasik'in alt maddesi
  const k3 = TP.toStored(d3, STORED);
  check(yeniAlt && JSON.stringify(k3.sections[0].items[0].subChecks) === '["Tabaklar","Bardaklar","Çöp"]' && k3.result['s0.i0.sub2'] && k3.result['s0.i0.sub2'].z === true,
    'B2. Tab: madde ust maddenin alt maddesi olur, isareti korunur', JSON.stringify(k3));
  TP.ops.outdent(d3, yeniAlt);
  check(JSON.stringify(TP.toStored(d3, STORED)) === JSON.stringify(Object.assign({}, STORED, { supplies: STORED.supplies })),
    'B3. Shift+Tab geri alir; kayit ilk haline doner');
  const d4 = [];
  const sec = TP.ops.addSection(d4, null);
  TP.ops.setText(d4, sec, 'Bahçe');
  const ilk = d4[0].items[0].id;
  TP.ops.setText(d4, ilk, 'Sulama');
  const ikinci = TP.ops.addItem(d4, sec, ilk);
  TP.ops.setText(d4, ikinci, '   ');
  const alt = TP.ops.addSub(d4, ilk, null);
  TP.ops.setText(d4, alt, 'Damla hattı');
  TP.ops.toggleDone(d4, alt, true);
  TP.ops.toggleImportant(d4, ilk);
  const k4 = TP.toStored(d4, null);
  check(JSON.stringify(k4) === JSON.stringify({ sections: [{ title: 'Bahçe', items: [{ text: 'Sulama', important: true, subChecks: ['Damla hattı'] }] }], supplies: [], result: { 's0.i0.sub0': { z: true } } }),
    'B4. Baslik + madde + alt madde + onemli; bos madde kaydedilmez', JSON.stringify(k4));
  const d5 = [];
  const bos = TP.ops.addSection(d5, null);
  TP.ops.setText(d5, bos, 'Boş başlık');
  check(JSON.stringify(TP.toStored(d5, null)) === '{}', 'B5. Maddesiz baslik kaydedilmez (saha okuyucusu bos bolumu gecersiz sayar)');

  // C. Ilerleme ve tamamlama kurali
  const p = TP.progress(TP.fromStored(STORED));
  check(p.total === 5 && p.done === 3 && !p.canComplete && p.missing.length === 2,
    'C1. Ilerleme madde + alt madde sayar; onemli madde ve alt maddesi eksikse tamamlanamaz', JSON.stringify(p));
  const tam = TP.fromStored(STORED);
  tam[0].items[0].done = true; tam[0].items[0].subs.forEach(s => { s.done = true; });
  const kt = TP.toStored(tam, STORED);
  check(TP.progress(tam).canComplete === true && OPS.checklistCompletionState(kt, kt.result).canComplete === true,
    'C2. Istemcinin tamamlama karari operasyon motoruyla (sunucu kurali) ayni');
  check(OPS.checklistCompletionState(TP.toStored(TP.fromStored(STORED), STORED), STORED.result).canComplete === false,
    'C3. Eksik onemli madde motor tarafinda da tamamlamayi engeller');

  // D. Cizim ve kacis
  const html = TP.bodyHtml(TP.fromStored({ sections: [{ title: '<img src=x>', items: [{ text: '"><script>', important: false }] }] }), true);
  check(!/<img|<script/.test(html) && /&lt;img src=x&gt;/.test(html) && /data-tp-act="add-section"/.test(html), 'D1. Baslik ve madde metni kacislanir');
  const ro = TP.bodyHtml(TP.fromStored(STORED), false);
  check(!/data-tp-act=/.test(ro) && /readonly/.test(ro) && /disabled/.test(ro), 'D2. Duzenleme yetkisi yoksa salt okunur (ekle/sil/isaret yok)');
  check(!/\son[a-z]+=/i.test(html + ro), 'D3. Satir ici olay isleyicisi yok (CSP)');

  // E. Uygulama baglantisi (kaynak)
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const flush = (app.match(/async function flushOperationalTaskPage\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
  check(/requireCloudForWrite\('Görev sayfası'/.test(flush) && /updateOperationalTask\(taskId, patch\)/.test(flush) && /toStored\(/.test(flush) && /loadTenantAppData/.test(flush),
    'E1. Kayit bulut kapisindan gecer, kayitli bicime cevrilir, hata olursa ekran gercege cekilir');
  check(/core\/task_page\.js\?v=[0-9a-f]{8}/.test(index) && index.indexOf('core/task_page.js') < index.indexOf('src="app.js'), 'E2. Modul app.js\'ten once, damgali yuklenir');
  const complete = (app.match(/async function completeOperationalTaskPage\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
  check(/canComplete/.test(complete) && /setOperationalTaskStatus\(task\.id, 'DONE'\)/.test(complete), 'E3. Tamamla once kurali denetler, sonra mevcut durum yolunu kullanir');
} catch (error) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${error && error.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
