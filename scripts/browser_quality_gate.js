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
      assert(await page.evaluate(() => { switchTab('reservations'); return document.getElementById('tab-reservations').classList.contains('active'); })); passed.push('1. rezervasyon + ödeme görünümü');
      assert(await page.evaluate(() => { switchTab('operations'); setOperationsView('cleaning'); return document.getElementById('opsCombinedContainer').textContent.includes('Temizlik'); })); passed.push('2. temizlik Z/M operasyonu');
      assert(await page.evaluate(() => { switchTab('finance'); return openPageReport('FINANCE'); })); await page.waitForSelector('#pageReportModal', { state: 'visible' }); passed.push('3. gider → finans raporu');
      assert(await page.evaluate(() => { closePageReportModal(); switchTab('finance'); return document.getElementById('tab-finance').classList.contains('active'); })); passed.push('4. ay kapanışı yüzeyi');
      assert(await page.evaluate(() => { switchTab('leads'); return document.getElementById('leadKanbanContainer').textContent.includes('Tarayıcı Talebi'); })); passed.push('5. talep → teklif → rezervasyon');
      assert(await page.evaluate(() => { switchTab('operations'); setOperationsView('maintenance'); return document.getElementById('opsCombinedContainer').textContent.includes('Musluk kontrolü'); })); passed.push('6. arıza → çözüm → gider');
      assert(await page.evaluate(() => { switchTab('finance'); return openChatGptQuestionModal({ tabId: 'finance' }); })); await page.waitForSelector('#chatGptQuestionModal', { state: 'visible' }); passed.push('7. rapor → ChatGPT');
      assert(await page.evaluate(() => { closeChatGptQuestionModal(); return openQuickBookingModal(); })); await page.waitForSelector('#quickBookingModal', { state: 'visible' }); passed.push('8. telefondan hızlı rezervasyon kapısı');
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
