'use strict';
// Tek tik baglantilar (kullanici 21.11.2026: "her gerekli seyi birbirine tek tikla bagla").
// Gercek uygulama (yerel fikstur): yonlendirme dugmesi dogru ekrani / pencereyi acar.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { createServer, HOST } = require('../server');

const executablePath = [process.env.CHROME_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, HOST, resolve));
  const browser = await chromium.launch({ executablePath, headless: true });
  let ok = 0;
  const pass = name => { ok++; console.log(`[PASS] ${name}`); };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(`http://${HOST}:${server.address().port}/?ci-browser=1&role=owner`, { waitUntil: 'load' });
    await page.waitForSelector('body[data-browser-quality-ready="true"]');
    const activeTab = () => page.evaluate(() => (document.querySelector('.tab-content.active') || {}).id);
    const closeModals = () => page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach(m => { m.classList.remove('active', 'show'); m.style.display = ''; }));

    // 1. Bugun performans satiri Finans'i acar; hedef yoksa "Hedef gir" hedef penceresini acar.
    await page.evaluate(() => switchTab('executive'));
    await page.click('#todayPerformanceTable .lex-link >> nth=0');
    assert.strictEqual(await activeTab(), 'tab-finance');
    pass('Bugün performans satırı Finans ekranını açar');
    await page.evaluate(() => switchTab('executive'));
    const goalBtn = page.locator('#todayPerformanceTable [data-onclick="goTo(\'goals\')"]').first();
    assert(await goalBtn.count(), 'Hedefi olmayan satırda "Hedef gir" olmalı');
    await goalBtn.click();
    await page.waitForFunction(() => { const m = document.getElementById('goalsModal'); return m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 3000 });
    pass('"Hedef gir" hedef penceresini açar');
    await closeModals();

    // 2. Satis hazirligi satiri mulk profilini acar.
    await page.evaluate(() => switchTab('executive'));
    const ready = page.locator('#portfolioHealthCardsGrid .lex-link').first();
    if (await ready.count()) {
      await ready.click();
      assert.strictEqual(await activeTab(), 'tab-properties');
      pass('Satış hazırlığı satırı mülk profilini açar');
    }

    // 3. Pazarlama → Rapor yukle sayfasinda platform panelleri yeni sekmede acilir.
    await page.evaluate(() => goTo('marketing:import'));
    await page.waitForSelector('[data-ads-dropzone]');
    const panels = await page.evaluate(() => [...document.querySelectorAll('.mk-steps a')].map(a => [a.textContent.trim(), a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]));
    assert(panels.length === 3 && panels.every(p => /^https:\/\//.test(p[1]) && p[2] === '_blank' && /noopener/.test(p[3] || '')), JSON.stringify(panels));
    pass('Rapor yükle: Meta, Google Ads ve TikTok panelleri tek tıkla (yeni sekmede) açılır');

    // 4. Gezinme kapisi alt hedefleri.
    await page.evaluate(() => goTo('operations:people'));
    assert.strictEqual(await activeTab(), 'tab-operations');
    await page.evaluate(() => goTo('settings:channels'));
    assert.strictEqual(await activeTab(), 'tab-settings');
    assert(await page.evaluate(() => !document.querySelector('[data-settings-section="channels"]').hidden));
    await page.evaluate(() => goTo('pricing:rules'));
    assert.strictEqual(await activeTab(), 'tab-pricing');
    pass('goTo: Operasyon › Saha ekibi, Ayarlar › Kanallar, Fiyatlandırma › Kurallar');

    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(`\nTEST SUMMARY: ${ok} PASSED`);
  if (ok < 5) process.exitCode = 1;
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
