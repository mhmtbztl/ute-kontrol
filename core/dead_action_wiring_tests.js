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

const radarStart = appSource.indexOf('function renderTodayRadar()');
const radarEnd = appSource.indexOf('\nfunction renderFunnelStats()', radarStart);
const radarSource = appSource.slice(radarStart, radarEnd);
check(radarStart >= 0 && radarEnd > radarStart, 'Bugunun radari kaynakta bulunmali');
check(
  !radarSource.includes('onclick="alert('),
  'Radar dugmeleri temizleyicinin sildigi alert isleyicisine baglanmamali'
);
check(
  radarSource.includes('data-radar-action') && radarSource.includes("addEventListener('click'"),
  'Radar eylemleri veri ozelligi ve guvenli olay dinleyicisiyle baglanmali'
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
