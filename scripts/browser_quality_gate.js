'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { createServer, HOST } = require('../server.js');

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean);
}

function findChrome() {
  return chromeCandidates().find(candidate => fs.existsSync(candidate)) || null;
}

async function withPage(browser, baseUrl, role, viewport, run) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/?ci-browser=1&role=${role}`, { waitUntil: 'load' });
  try {
    await page.waitForSelector('body[data-browser-quality-ready="true"]');
  } catch (error) {
    throw new Error(`${role} fixture hazırlanamadı: ${errors.join(' | ') || error.message}`);
  }
  await run(page);
  assert.deepStrictEqual(errors, [], `${role} tarayıcı konsol hataları:\n${errors.join('\n')}`);
  await page.close();
}

// Ekrandaki "12.345 TL" metninden tam sayi; "—" ise null.
function screenNumber(text) {
  const digits = String(text || '').replace(/[^0-9-]/g, '');
  return digits ? Number(digits) : null;
}

// A5 denetimi (L-146e): "rapor toplami = ekran toplami" motorun kendi
// kendine esitligi degil, ekranda yazan rakamla rapordaki rakamin esitligidir.
async function assertReportMatchesScreen(page) {
  const result = await page.evaluate(() => {
    switchTab('finance');
    const finance = {
      revenue: document.getElementById('finActualRevenue').textContent,
      profit: document.getElementById('finNetProfit').textContent,
      nights: document.getElementById('finSoldNights').textContent
    };
    openPageReport('FINANCE');
    const items = Object.fromEntries(currentPageReport.sections[0].items.map(item => [item.id, item.value]));
    closePageReportModal();
    switchTab('reservations');
    const pill = document.getElementById('rezTableSummaryPill').textContent;
    openPageReport('BOOKINGS');
    const bookings = currentPageReport.chatGptContext.summary;
    closePageReportModal();
    return { finance, items, pill, bookings };
  });
  assert.strictEqual(screenNumber(result.finance.revenue), Math.round(result.items.netRoomRevenue), 'Finans cirosu ekran ≠ rapor');
  assert.strictEqual(result.finance.profit.trim() === '—' ? null : screenNumber(result.finance.profit), result.items.netProfit === null ? null : Math.round(result.items.netProfit), 'Finans net kârı ekran ≠ rapor');
  assert.strictEqual(screenNumber(result.finance.nights), result.items.soldNights, 'Finans satılan gece ekran ≠ rapor');
  assert(result.pill.includes(`${result.bookings.soldNights} Gece`), `Rezervasyon geceleri ekran ≠ rapor: ${result.pill}`);
  assert(result.pill.includes(`${Math.round(result.bookings.netRoomRevenue).toLocaleString('tr-TR')} TL`), `Rezervasyon cirosu ekran ≠ rapor: ${result.pill}`);
}

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  assert(result.scroll <= result.width + 1, `${label}: ${result.scroll}px belge, ${result.width}px ekran`);
}

async function main() {
  const executablePath = findChrome();
  if (!executablePath) throw new Error(`Chrome/Edge bulunamadı. Denenen yollar: ${chromeCandidates().join(', ')}`);
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, HOST, error => error ? reject(error) : resolve()));
  const baseUrl = `http://${HOST}:${server.address().port}`;
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const passed = [];
  try {
    await withPage(browser, baseUrl, 'owner', { width: 1280, height: 900 }, async page => {
      // Bu kapi bellek ici fiksturde EKRANLARIN acildigini olcer; is akisinin
      // kendisini (yazma, Z/M, kapanis) olcmez. Uctan uca tur ayri betiktir:
      // scripts/a5_e2e_flow_tour.js (test projesi). Etiketler bunu soyler (L-145).
      assert(await page.evaluate(() => { switchTab('reservations'); return document.getElementById('tab-reservations').classList.contains('active'); })); passed.push('1. rezervasyon ekranı açılır');
      assert(await page.evaluate(() => { switchTab('operations'); setOperationsView('cleaning'); return document.getElementById('opsCombinedContainer').textContent.includes('Temizlik'); })); passed.push('2. temizlik görünümü açılır');
      assert(await page.evaluate(() => { switchTab('finance'); return openPageReport('FINANCE'); })); await page.waitForSelector('#pageReportModal', { state: 'visible' }); passed.push('3. finans raporu açılır');
      await page.evaluate(() => closePageReportModal());
      await assertReportMatchesScreen(page); passed.push('4. rapor toplamı = ekran toplamı (Finans, Rezervasyonlar)');
      assert(await page.evaluate(() => { switchTab('leads'); return document.getElementById('leadKanbanContainer').textContent.includes('Tarayıcı Talebi'); })); passed.push('5. talep hunisi görünür');
      assert(await page.evaluate(() => { switchTab('operations'); setOperationsView('maintenance'); return document.getElementById('opsCombinedContainer').textContent.includes('Musluk kontrolü'); })); passed.push('6. arıza listesi görünür');
      assert(await page.evaluate(() => { switchTab('finance'); return openChatGptQuestionModal({ tabId: 'finance' }); })); await page.waitForSelector('#chatGptQuestionModal', { state: 'visible' }); passed.push('7. rapor → ChatGPT');
      assert(await page.evaluate(() => { closeChatGptQuestionModal(); return openQuickBookingModal(); })); await page.waitForSelector('#quickBookingModal', { state: 'visible' }); passed.push('8. telefondan hızlı rezervasyon kapısı');
      await page.evaluate(() => closeQuickBookingModal());
      // L-143: yazdirma penceresi gercekten acilir ve rapor + logo icerir.
      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 10000 }),
        page.evaluate(() => { switchTab('finance'); openPageReport('FINANCE'); return printCurrentReport(); })
      ]);
      await popup.waitForLoadState();
      const printed = await popup.evaluate(() => ({ text: document.body.textContent, logo: document.images[0]?.getAttribute('src') || '', opener: window.opener }));
      assert(printed.text.includes('Finans raporu') && printed.text.includes('Net konaklama geliri'), 'Yazdırma penceresi raporu içermiyor');
      assert(/assets\/brand\/lexbnb-logo\.svg$/.test(printed.logo), `Baskıda logo yok: ${printed.logo}`);
      assert.strictEqual(printed.opener, null, 'Yazdırma penceresi opener bağını taşıyor');
      await popup.close();
      await page.evaluate(() => closePageReportModal());
      passed.push('9. Yazdır / PDF penceresi logolu açılır');
      // L-144: fiyat basamaklari yonetim rolunde duzenlenebilir.
      assert(await page.evaluate(() => { switchTab('properties'); setPropertyProfileTab('PRICES'); return !!document.querySelector('.property-ladder-form #ladder_floor'); }), 'Fiyat basamağı formu yok');
      passed.push('10. fiyat basamakları mülk profilinde düzenlenir');
      // M2 (kullanici, 04.10): global innerHTML temizleyicisi FORM ogesini
      // siliyordu; pazarlamanin sekiz formu (kanal ilani, snapshot, deney,
      // referans, dort reklam formu) hic acilmiyordu. Fikstur bulut okumalari
      // bos dondurulur ki konsol kapisi ag hatasi gormesin.
      await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.evaluate(() => { switchTab('marketing'); document.querySelector('[data-marketing-view="funnel"]').click(); });
      await page.waitForSelector('[data-marketing-open-listing]');
      await page.click('[data-marketing-open-listing]');
      await page.waitForSelector('[data-marketing-listing-form] [name="externalUrl"]', { timeout: 5000 });
      await page.evaluate(() => document.querySelector('[data-marketing-view="ads"]').click());
      await page.waitForSelector('[data-ads-manual-form], [data-ads-campaign-form]', { timeout: 5000 });
      // Form izinlidir ama hicbir yere gonderemez: gezinme oznitelikleri silinir.
      const stripped = await page.evaluate(() => {
        const box = document.createElement('div');
        box.innerHTML = '<form action="https://kotu.example" method="post" target="_blank"><button formaction="https://kotu.example">x</button></form>';
        const form = box.querySelector('form');
        return !!form && ['action', 'method', 'target'].every(a => !form.hasAttribute(a)) && !box.querySelector('button').hasAttribute('formaction');
      });
      assert(stripped, 'innerHTML formu gezinme öznitelikleriyle bırakıyor');
      passed.push('12. pazarlama formları açılır (kanal ilanı, reklam); form dışarı gönderemez');
    });

    await withPage(browser, baseUrl, 'owner', { width: 390, height: 844 }, async page => {
      // L-147b/c: ust cubuk telefonda ekranin ucte birini gecmez; pencere
      // acikken yuzen dugme pencere dugmelerini ortmez.
      const header = await page.evaluate(() => document.querySelector('.app-header').getBoundingClientRect().height);
      assert(header <= 844 * 0.34, `Mobil üst çubuk ${Math.round(header)} px`);
      const fabHidden = await page.evaluate(() => { switchTab('finance'); openPageReport('FINANCE'); return getComputedStyle(document.getElementById('mobileQuickBookingBtn')).display === 'none'; });
      assert(fabHidden, 'Rapor penceresi açıkken yüzen düğme görünür');
      await page.evaluate(() => closePageReportModal());
      assert(await page.evaluate(() => getComputedStyle(document.getElementById('mobileQuickBookingBtn')).display !== 'none'), 'Pencere kapanınca yüzen düğme dönmeli');
      await assertNoHorizontalOverflow(page, 'owner mobil');
      // A6: Baslangic Rehberi ust menuden acilir, her sekmesi kendi bolmesini
      // gosterir ve telefonda pencere ekrandan tasmaz.
      await page.evaluate(() => document.querySelector('.header-guide-btn').click());
      await page.waitForSelector('#helpModal.active', { state: 'visible' });
      assert(await page.evaluate(() => getComputedStyle(document.getElementById('mobileQuickBookingBtn')).display === 'none'), 'Rehber açıkken yüzen düğme görünür');
      const guide = await page.evaluate(() => [...document.querySelectorAll('#helpModal .help-tab-btn')].map(btn => {
        btn.click();
        const key = btn.id.replace('helpTabBtn-', '');
        const pane = document.getElementById('helpTab-' + key);
        const card = document.querySelector('#helpModal .modal-card').getBoundingClientRect();
        return { key, shown: !!pane && pane.style.display !== 'none' && pane.textContent.trim().length > 40, fits: card.right <= window.innerWidth + 1 };
      }));
      assert(guide.length >= 5 && guide.every(tab => tab.shown && tab.fits), `Rehber sekmeleri: ${JSON.stringify(guide)}`);
      await page.evaluate(() => closeHelpModal());
      await assertNoHorizontalOverflow(page, 'owner rehber');
      passed.push('11. Başlangıç Rehberi telefonda açılır, her sekme dolu');
    });

    await withPage(browser, baseUrl, 'sales', { width: 390, height: 844 }, async page => {
      assert(await page.evaluate(() => !document.getElementById('mobileQuickBookingBtn').hidden));
      assert(await page.evaluate(() => canExportReportPage('BOOKINGS') && !canExportReportPage('FINANCE')));
      await assertNoHorizontalOverflow(page, 'sales başlangıç');
    });
    await withPage(browser, baseUrl, 'staff', { width: 390, height: 844 }, async page => {
      assert(await page.evaluate(() => document.querySelector('.nav-tabs').hidden));
      assert(await page.evaluate(() => canExportReportPage('OPERATIONS') && !canExportReportPage('BOOKINGS')));
      await assertNoHorizontalOverflow(page, 'staff saha');
    });
    await withPage(browser, baseUrl, 'viewer', { width: 390, height: 844 }, async page => {
      assert(await page.evaluate(() => document.getElementById('mobileQuickBookingBtn').hidden));
      assert(await page.evaluate(() => { switchTab('properties'); setPropertyProfileTab('PRICES'); return !document.querySelector('.property-ladder-form'); }), 'İzleyici fiyat basamağı formunu görmemeli');
      const tabs = ['executive', 'reservations', 'properties', 'operations', 'leads', 'pricing', 'finance', 'marketing'];
      for (const tab of tabs) {
        await page.evaluate(value => switchTab(value), tab);
        await page.waitForTimeout(30);
        await assertNoHorizontalOverflow(page, `viewer ${tab}`);
      }
    });
    console.log(`[PASS] browser_quality_gate: ${passed.length} akış, 4 rol, 390 px taşma ve konsol kapısı`);
    passed.forEach(item => console.log(`[PASS] ${item}`));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
