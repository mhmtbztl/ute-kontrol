'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { loadTestEnv } = require('../core/test_env.js');

loadTestEnv(); // Merkezi kapı: üretim hedefini ve eksik açık onayı reddeder.
const manifestPath = path.join(os.tmpdir(), 'lexbnb-a4-browser-fixture.json');
const runtime = path.join(os.tmpdir(), 'lexbnb-a4-browser-runtime');
if (!fs.existsSync(manifestPath) || !fs.existsSync(path.join(runtime, 'server.js'))) throw new Error('Önce A4 browser fixture setup ve runtime hazırlığı çalıştırılmalı.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const port = 39005;

function chromePath() {
  return [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome', '/usr/bin/chromium',
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean).find(candidate => fs.existsSync(candidate));
}

async function waitForServer(processHandle) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Yerel tarayıcı sunucusu başlamadı.')), 10000);
    processHandle.stdout.on('data', chunk => {
      if (String(chunk).includes('running at')) { clearTimeout(timeout); resolve(); }
    });
    processHandle.once('exit', code => { clearTimeout(timeout); reject(new Error(`Yerel sunucu erken kapandı: ${code}`)); });
  });
}

async function loginRole(browser, role) {
  const user = manifest.users.find(item => item.role === role);
  assert(user, `${role} fixture kullanıcısı yok`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForSelector('#securityLockOverlay', { state: 'visible' });
  await page.fill('#saasLoginUser', user.email);
  await page.fill('#saasLoginPass', manifest.password);
  await page.click('#saasLoginSubmitBtn');
  await page.waitForSelector('#securityLockOverlay', { state: 'hidden', timeout: 30000 });
  await page.waitForFunction(expected => typeof activeTenant !== 'undefined' && activeTenant?.role === expected, role);
  return { context, page, pageErrors };
}

async function main() {
  const executablePath = chromePath();
  if (!executablePath) throw new Error('Chrome/Edge bulunamadı.');
  const server = spawn(process.execPath, ['server.js'], { cwd: runtime, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  await waitForServer(server);
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    for (const role of ['owner', 'sales', 'staff', 'viewer']) {
      const { context, page, pageErrors } = await loginRole(browser, role);
      if (role === 'owner') {
        assert(await page.evaluate(() => { switchTab('finance'); return openPageReport('FINANCE'); }));
        await page.waitForSelector('#pageReportModal', { state: 'visible' });
      } else if (role === 'sales') {
        assert(await page.evaluate(() => document.querySelector(".tab-btn[data-onclick=\"switchTab('finance')\"]").hidden));
        assert(await page.evaluate(() => !document.getElementById('mobileQuickBookingBtn').hidden));
      } else if (role === 'staff') {
        assert(await page.evaluate(() => document.querySelector('.nav-tabs').hidden));
        assert(await page.evaluate(() => document.getElementById('tab-staff-field').classList.contains('active')));
      } else {
        assert(await page.evaluate(() => document.getElementById('mobileQuickBookingBtn').hidden));
        assert(await page.evaluate(() => document.querySelector(".tab-btn[data-onclick=\"switchTab('settings')\"]").hidden));
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `${role} 390 px görünüm ${overflow}px yatay taşıyor`);
      assert.deepStrictEqual(pageErrors, [], `${role} çalışma zamanı hatası: ${pageErrors.join('; ')}`);
      console.log(`[PASS] ${role}: gerçek test-projesi oturumu, rol sınırı ve 390 px görünüm`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
