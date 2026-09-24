'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let assertions = 0;
function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

check(
  /id="securityLockOverlay"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html),
  'Giris katmani ekran okuyucuya modal dialog olarak tanitilmali'
);
check(
  /function setApplicationInert\([\s\S]*?\.inert\s*=/.test(app)
    && /showLockOverlay\([\s\S]*?setApplicationInert\(true\)/.test(app)
    && /hideLockOverlay\([\s\S]*?setApplicationInert\(false\)/.test(app),
  'Giris katmani acikken arka uygulama odak ve etkileşimden cikarilmali'
);
check(
  /@media\s*\(max-width:\s*768px\)[\s\S]*?\.header-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/.test(css),
  'Mobil baslik eylemleri tek satirda belgeyi genisletmek yerine satir kirilmali'
);
check(
  /html,\s*body\s*\{[\s\S]*?max-width:\s*100%[\s\S]*?overflow-x:\s*hidden/.test(css),
  'Sayfa kabugu 390 px gorunumde yatay belge tasmasini engellemeli'
);

check(
  /id="bookingModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="bookingModalTitle"/.test(html),
  'Rezervasyon formu erisilebilir bir modal dialog olmali'
);
check(
  /class="close-btn"[^>]*aria-label="Rezervasyon penceresini kapat"/.test(html),
  'Rezervasyon kapatma dugmesinin erisilebilir adi olmali'
);
check(
  /class="booking-essential-grid"/.test(html)
    && /<details class="booking-optional-details">/.test(html)
    && /<summary>İsteğe bağlı ayrıntılar<\/summary>/.test(html),
  'Mobil hizli kayit alanlari basta, istege bagli ayrintilar acilir bolumde olmali'
);

for (const [id, label] of [
  ['resVilla', 'Villa Seçin'],
  ['resGuest', 'Misafir Adı'],
  ['resDateRangeBtn', 'Konaklama Tarihleri'],
  ['resGross', 'Brüt Tutar'],
  ['resPax', 'Kişi Sayısı'],
  ['resChannel', 'Rezervasyon Kanalı']
]) {
  check(new RegExp(`<label[^>]*for="${id}"[^>]*>[^<]*${label}`).test(html), `${label} kontrolu etiketiyle baglanmali`);
}

const controlTag = id => (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>|<input(?=[^>]*id="${id}")[^>]*>`)) || [''])[0];
check(/inputmode="decimal"/.test(controlTag('resGross')), 'Tutar alani mobilde ondalik sayi klavyesi acmali');
check(/inputmode="numeric"/.test(controlTag('resPax')), 'Kisi sayisi alani mobilde sayisal klavye acmali');
check(/type="tel"/.test(controlTag('resGuestPhone')) && /inputmode="tel"/.test(controlTag('resGuestPhone')), 'Telefon alani telefon klavyesi acmali');
check(
  /@media\s*\(max-width:\s*640px\)[\s\S]*?#bookingModal\s+\.modal-card\s*\{[\s\S]*?100dvh/.test(css)
    && /#bookingModal[\s\S]*?min-height:\s*44px/.test(css),
  'Rezervasyon modali telefon ekranini ve en az 44 px dokunma hedeflerini kullanmali'
);
check(
  /function wireAccessibleFormLabels\([\s\S]*?label\.htmlFor\s*=/.test(app),
  'Mevcut form-group etiketleri iliskili kontrollere programatik olarak baglanmali'
);

console.log(`[PASS] mobile_reservation_ui_tests: ${assertions} assertions`);
