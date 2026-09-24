'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let assertions = 0;
function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

check(
  !/function\s+startWithCleanPortfolio\s*\(/.test(appSource)
    && !indexSource.includes('startWithCleanPortfolio()'),
  'Sahte temizleme yapan yerel portfoy eylemi kaldirilmali'
);
check(
  !/function\s+authenticateSaaSUser\s*\(/.test(appSource),
  'Supabase Auth disindaki olu yerel kimlik dogrulama yolu kaldirilmali'
);
check(
  !indexSource.includes('demo@lexbnb.com'),
  'Profil menusu demo e-posta adresi gostermemeli'
);
check(
  !/demo hesabıyla giriş yapın/i.test(appSource),
  'Dogrulama hatasi var olmayan demo hesabina yonlendirmemeli'
);
check(
  !/Temiz Boş Portföy Başlat|Demo kayıtlarını kaldır|Örnekleri temizleyip/.test(indexSource),
  'Menuler gercekte veri silmeyen demo temizleme vaadi tasimamali'
);
check(
  /id="menuUserEmail">Hesap bilgisi yükleniyor…</.test(indexSource),
  'Profil e-postasi gercek oturum yuklenene kadar notr bir durum gostermeli'
);

console.log(`[PASS] demo_surface_removal_tests: ${assertions} assertions`);
