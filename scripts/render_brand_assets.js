'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const BRAND_DIR = path.join(ROOT, 'assets', 'brand');

function browserCandidates() {
  return [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
}

async function renderMark(browser, size, filename) {
  const svg = fs.readFileSync(path.join(BRAND_DIR, 'lexbnb-mark.svg'), 'utf8');
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;width:${size}px;height:${size}px;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.locator('svg').screenshot({ path: path.join(BRAND_DIR, filename), omitBackground: true });
  await page.close();
}

async function main() {
  const executablePath = browserCandidates().find(candidate => fs.existsSync(candidate));
  if (!executablePath) throw new Error('Chrome veya Edge bulunamadı; favicon PNG seti üretilemedi.');
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    await renderMark(browser, 32, 'favicon-32.png');
    await renderMark(browser, 180, 'apple-touch-icon.png');
  } finally {
    await browser.close();
  }
  console.log('[PASS] Lexbnb favicon seti SVG kaynağından üretildi.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
