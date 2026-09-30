'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let assertions = 0;
function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

check(
  !appSource.includes('openReservationModal('),
  'Rezervasyon detay eylemleri tanimsiz openReservationModal fonksiyonunu cagirmamali'
);

// "Bugunun radari" yalniz hicbir yoldan acilamayan tab-dashboard'daydi; sekme
// ve radar A1-G1'de silindi. Bugun ekrani kendi eylemlerini
// renderExecutiveControlCenter icinde baglar.
check(
  !appSource.includes('function renderTodayRadar()') && !appSource.includes('handleTodayRadarAction('),
  'Olu sekmenin radari ve eylem isleyicisi kaynakta kalmamali'
);
check(
  !appSource.includes('onclick="alert('),
  'Hicbir dugme temizleyicinin sildigi alert isleyicisine baglanmamali'
);

check(
  /from\('operational_tasks'\)[\s\S]*?appData\s*=\s*\{[\s\S]*?operationalTasks/.test(appSource),
  'operasyon gorevleri tenant yuklemesinde alinip appData.operationalTasks alanina yazilmali'
);

check(
  !/l\.stage\s*===\s*'PROPOSAL'|l\.stage\s*===\s*'QUALIFIED'/.test(appSource),
  'Komuta merkezi veri modelinde bulunmayan PROPOSAL/QUALIFIED asamalarini kullanmamali'
);
check(
  /leads\.filter\(l\s*=>\s*l\.status\s*===\s*'FOLLOW_UP'\s*\|\|\s*l\.status\s*===\s*'QUOTE_SENT'\)/.test(appSource),
  'Komuta merkezi gercek talep durumlariyla sicak talepleri secmeli'
);

check(
  /onclick="deleteExpenseUI\(/.test(appSource),
  'Gider tablosu kapali donem ve veritabani hatalarini kullaniciya gosteren UI sarmalayicisini cagirmali'
);

check(
  /onclick="deleteBookingUI\(/.test(appSource),
  'Rezervasyon tablosu silme hatalarini kullaniciya gosteren UI sarmalayicisini cagirmali'
);

console.log(`[PASS] dead_action_wiring_tests: ${assertions} assertions`);
