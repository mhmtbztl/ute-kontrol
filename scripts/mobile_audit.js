'use strict';

// Mobil ölçüm turu (mobil uyum planı, PR 1). Bir kapı değil, ölçümdür:
// her rolde görünen her sekmeyi ve her modalı 390 ve 360 px genişlikte açar,
// ekran görüntüsü alır ve "telefonda kullanışsız" iddiasını sayıya çevirir.
// Belge düzeyinde yatay taşma (browser_quality_gate) yetmez: tablo kendi
// kutusunda kayınca belge taşmaz ama ekran yine okunmaz.
//
//   node scripts/mobile_audit.js            -> tmp/mobile-audit/ (png + report.md + report.json)
//   node scripts/mobile_audit.js --tab executive --width 390

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { createServer, HOST } = require('../server.js');

const OUT = path.join(__dirname, '..', 'tmp', 'mobile-audit');
const args = process.argv.slice(2);
const argOf = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ONLY_TAB = argOf('--tab');
const WIDTHS = argOf('--width') ? [Number(argOf('--width'))] : [390, 360];
const ROLES = argOf('--role') ? [argOf('--role')] : ['owner', 'staff'];
const SKIP_MODALS = args.includes('--no-modals');

function findChrome() {
  return [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium'
  ].filter(Boolean).find(p => fs.existsSync(p)) || null;
}

// Sayfa içinde çalışır: görünen alanın ölçümü.
function measure(scopeSelector) {
  const vw = window.innerWidth;
  const scope = document.querySelector(scopeSelector) || document.body;
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const label = el => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return t ? `${s} "${t}"` : s;
  };
  const all = [...scope.querySelectorAll('*')].filter(visible);
  const scrollers = all.filter(el => {
    const ox = getComputedStyle(el).overflowX;
    return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 4;
  }).map(el => `${label(el)} (${el.scrollWidth}/${el.clientWidth})`);
  const offscreen = all.filter(el => {
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1) return false;
    // Kaydırılan kutunun içindeki öge taşma değildir; kutu ayrıca sayılır.
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return false;
    }
    return true;
  }).map(label);
  const targets = all.filter(el => el.matches('button, a[href], [data-onclick], select, input:not([type=hidden]), [role=button]'));
  const smallTargets = targets.filter(el => {
    const r = el.getBoundingClientRect();
    if (el.matches('input[type=checkbox], input[type=radio]')) return r.width < 20;
    return r.height < 36;
  }).map(label);
  const zoomInputs = all.filter(el => el.matches('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea'))
    .filter(el => parseFloat(getComputedStyle(el).fontSize) < 16).map(label);
  const tinyText = all.filter(el => el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
    .filter(el => parseFloat(getComputedStyle(el).fontSize) < 12).length;
  const header = document.querySelector('.app-header');
  const nav = document.querySelector('.nav-tabs');
  const chrome = Math.round(Math.max(header ? header.getBoundingClientRect().bottom : 0, nav ? nav.getBoundingClientRect().bottom : 0) + window.scrollY);
  const headerItems = [...document.querySelectorAll('.app-header .header-actions > *, #mobileFilterChip')].map(el => {
    const r = el.getBoundingClientRect();
    return `${el.id || el.className}:${Math.round(r.x)}+${Math.round(r.width)}x${Math.round(r.height)}${getComputedStyle(el).display === 'none' ? ' (yok)' : ''}`;
  });
  return {
    headerItems,
    docOverflow: document.documentElement.scrollWidth - vw,
    pageScreens: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(1),
    chromeHeight: chrome,
    scrollers, offscreen: [...new Set(offscreen)].slice(0, 12), offscreenCount: offscreen.length,
    smallTargetCount: smallTargets.length, smallTargets: [...new Set(smallTargets)].slice(0, 10),
    zoomInputCount: zoomInputs.length, tinyText
  };
}

async function auditRole(browser, baseUrl, role, width, report) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(`${baseUrl}/?ci-browser=1&role=${role}`, { waitUntil: 'load' });
  await page.waitForSelector('body[data-browser-quality-ready="true"]');
  const tabs = await page.evaluate(() => {
    // Rol kapısının gizlediği sekme `hidden` taşır; telefonda şeridin kendisi
    // CSS ile gizli olduğundan görünürlüğe (offsetParent) bakılmaz.
    const nav = document.querySelector('.nav-tabs');
    const out = [...document.querySelectorAll('.nav-tabs .tab-btn')]
      .filter(b => !b.hidden && !(nav && nav.hidden))
      .map(b => (b.getAttribute('data-onclick') || '').match(/switchTab\('([^']+)'\)/)).filter(Boolean).map(m => m[1]);
    const active = document.querySelector('.tab-content.active');
    if (active && !out.includes(active.id.replace('tab-', ''))) out.unshift(active.id.replace('tab-', ''));
    return out;
  });
  for (const tab of tabs) {
    if (ONLY_TAB && tab !== ONLY_TAB) continue;
    await page.evaluate(t => { switchTab(t); window.scrollTo(0, 0); }, tab);
    await page.waitForTimeout(150);
    const m = await page.evaluate(measure, `#tab-${tab}`);
    const file = `${role}-${width}-${tab}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    // İlk ekran: kullanıcının kaydırmadan gördüğü alan.
    await page.screenshot({ path: path.join(OUT, file.replace('.png', '-ilk.png')) });
    report.push({ kind: 'tab', role, width, id: tab, file, ...m });
  }
  // Kabuk durumları: dönem paneli ve "Daha fazla" menüsü açık.
  if (role === 'owner' && !ONLY_TAB) {
    await page.evaluate(() => { switchTab('finance'); toggleMobileFilters(); });
    await page.screenshot({ path: path.join(OUT, `kabuk-${width}-filtre.png`) });
    await page.evaluate(() => { toggleMobileFilters(); openMobileMoreSheet(); });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `kabuk-${width}-menu.png`) });
    await page.evaluate(() => closeMobileMoreSheet());
  }
  if (!SKIP_MODALS && role === 'owner' && width === WIDTHS[0] && !ONLY_TAB) {
    const modals = await page.evaluate(() => [...document.querySelectorAll('.modal-backdrop[id], .modal-overlay[id]')].map(m => m.id));
    for (const id of modals) {
      const m = await page.evaluate(mid => {
        document.querySelectorAll('.modal-backdrop.active, .modal-overlay.active').forEach(x => x.classList.remove('active'));
        const el = document.getElementById(mid);
        el.classList.add('active');
        const card = el.querySelector('.modal-card, .modal-content') || el.firstElementChild;
        if (!card) return null;
        const r = card.getBoundingClientRect();
        return { cardWidth: Math.round(r.width), cardHeight: Math.round(r.height), sideGap: Math.round(r.left), topGap: Math.round(r.top) };
      }, id);
      if (!m) continue;
      await page.waitForTimeout(350); // açılış animasyonu (appleSheetIn)
      const detail = await page.evaluate(measure, `#${id}`);
      const file = `modal-${width}-${id}.png`;
      await page.screenshot({ path: path.join(OUT, file) });
      await page.evaluate(mid => document.getElementById(mid).classList.remove('active'), id);
      report.push({ kind: 'modal', role, width, id, file, ...m, ...detail });
    }
  }
  report.push({ kind: 'errors', role, width, errors });
  await page.close();
}

function toMarkdown(report) {
  const lines = ['# Mobil ölçüm', '', `Tarih: ${new Date().toISOString().slice(0, 10)} · fikstür \`?ci-browser=1\` · genişlik ${WIDTHS.join(', ')} px`, '',
    'Sütunlar: **taşma** belge yatay taşması px · **ekran** sayfa boyu / ekran boyu · **üst** başlık+menünün kapladığı px · **kayan** yatay kayan kutu · **dışarıda** ekranın dışına çıkan öge · **küçük** <36px dokunma hedefi · **zoom** iOS yakınlaştırması yapan (<16px) alan', '',
    '| rol | px | ekran | taşma | boy | üst | kayan | dışarıda | küçük | zoom |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of report.filter(x => x.kind === 'tab')) {
    lines.push(`| ${r.role} | ${r.width} | ${r.id} | ${r.docOverflow} | ${r.pageScreens} | ${r.chromeHeight} | ${r.scrollers.length} | ${r.offscreenCount} | ${r.smallTargetCount} | ${r.zoomInputCount} |`);
  }
  const modals = report.filter(x => x.kind === 'modal');
  if (modals.length) {
    lines.push('', '## Modallar', '', '| modal | genişlik | yükseklik | yan boşluk | kayan | dışarıda | küçük | zoom |', '|---|---|---|---|---|---|---|---|');
    for (const r of modals) lines.push(`| ${r.id} | ${r.cardWidth} | ${r.cardHeight} | ${r.sideGap} | ${r.scrollers.length} | ${r.offscreenCount} | ${r.smallTargetCount} | ${r.zoomInputCount} |`);
  }
  lines.push('', '## Ayrıntı (sekmeler)');
  for (const r of report.filter(x => x.kind === 'tab')) {
    if (!r.scrollers.length && !r.offscreen.length) continue;
    lines.push('', `### ${r.role} ${r.width} ${r.id}`);
    if (r.scrollers.length) lines.push('- kayan: ' + r.scrollers.slice(0, 8).join('; '));
    if (r.offscreen.length) lines.push('- dışarıda: ' + r.offscreen.join('; '));
  }
  const errs = report.filter(x => x.kind === 'errors' && x.errors.length);
  if (errs.length) lines.push('', '## Konsol hataları', ...errs.map(e => `- ${e.role} ${e.width}: ${e.errors.slice(0, 5).join(' | ')}`));
  return lines.join('\n') + '\n';
}

async function main() {
  const executablePath = findChrome();
  if (!executablePath) throw new Error('Chrome/Edge bulunamadı (CHROME_PATH).');
  fs.mkdirSync(OUT, { recursive: true });
  const server = createServer();
  await new Promise((res, rej) => server.listen(0, HOST, e => e ? rej(e) : res()));
  const baseUrl = `http://${HOST}:${server.address().port}`;
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const report = [];
  try {
    for (const width of WIDTHS) for (const role of ROLES) await auditRole(browser, baseUrl, role, width, report);
  } finally {
    await browser.close();
    await new Promise(res => server.close(res));
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, 'report.md'), toMarkdown(report));
  console.log(`[OK] mobile_audit: ${report.filter(r => r.kind !== 'errors').length} ölçüm -> ${path.relative(process.cwd(), OUT)}`);
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
