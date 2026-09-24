'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let assertions = 0;
function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

check(
  !indexSource.includes('id="tab-marketing-legacy"'),
  'Gizli eski pazarlama sekmesi DOM icinde tutulmamali'
);
check(
  !indexSource.includes('id="marketingCampaignsTableBody"'),
  'Yalniz eski sekmenin kullandigi kampanya tablosu kaldirilmali'
);
check(
  !indexSource.includes('id="otaRankingTableBody"'),
  'Olculmeyen OTA puanlarini gosteren eski siralama tablosu kaldirilmali'
);
check(
  !/function\s+renderMarketingModule\s*\(/.test(appSource),
  'Eski pazarlama sekmesinin app.js render girisi kaldirilmali'
);
check(
  !/\brenderMarketingModule\s*,/.test(appSource),
  'Eski pazarlama render girisi Node disari aktariminda kalmamali'
);
check(
  indexSource.includes('id="tab-marketing"')
    && indexSource.includes('id="marketingWorkspaceContent"')
    && /src="core\/marketing_ui\.js\?v=[a-f0-9]{8}"/.test(indexSource),
  'Dogrulanabilir modern pazarlama calisma alani korunmali'
);

console.log(`[PASS] legacy_marketing_removal_tests: ${assertions} assertions`);
