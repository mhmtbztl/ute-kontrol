// Pages yayin klasoru agi (L-19, A6-G3; 03.10.2026).
//
// Site eskiden deponun kokunu yayinliyordu (CLAUDE.md, schema.sql, testler,
// core/test_env.js herkese acikti). Bu ag iki yonu birden olcer: ic dosya
// yayina girmez, uygulamanin yukledigi her dosya yayindadir.
const fs = require('fs');
const path = require('path');
const { listPublishFiles, trackedFiles } = require('../scripts/build_pages.js');

const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}
const localRefs = (text, base = '') => [...text.matchAll(/(?:src|href)="([^"#:]+)"/g)]
  .map(m => path.posix.normalize(path.posix.join(base, m[1].replace(/\?.*$/, ''))))
  .filter(ref => ref && ref !== '.' && !ref.startsWith('..'));

try {
  const tracked = trackedFiles();
  const published = listPublishFiles(tracked);
  const set = new Set(published);

  // --- Ic dosyalar yayina girmez ---
  const forbidden = published.filter(rel =>
    /\.(md|sql|bat|gs)$/i.test(rel) ||
    /^(supabase|docs|scripts|apps_script|tasks|\.github|node_modules)\//.test(rel) ||
    /_tests\.js$/.test(rel) || rel === 'core/test_env.js' ||
    ['server.js', 'package.json', 'package-lock.json', 'run_all_tests.js', 'stamp_assets.js', '.gitignore', '.gitattributes'].includes(rel));
  check(forbidden.length === 0, 'P1. Ic belge, gocler, testler ve araclar yayinlanmaz', forbidden.join(', '));
  check(!set.has('CLAUDE.md') && !set.has('supabase/schema.sql') && !set.has('core/test_env.js'), 'P2. L-19 orneklerinin ucu de disarida');

  // --- Uygulamanin ihtiyaci yayindadir ---
  check(set.has('CNAME') && fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim() === 'lexbnb.space', 'P3. Ozel alan adi (CNAME) korunur');
  for (const must of ['index.html', 'app.js', 'style.css', 'robots.txt']) check(set.has(must), `P4. ${must} yayinlanir`);

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const missing = localRefs(html).filter(ref => !set.has(ref));
  check(missing.length === 0, 'P5. index.html\'in yukledigi her yerel dosya yayinda', missing.join(', '));

  const marketing = fs.readFileSync(path.join(root, 'core/marketing_ui.js'), 'utf8');
  const runtime = [...marketing.matchAll(/'(core\/[a-z0-9_]+\.js)\?v=/g)].map(m => m[1]);
  check(runtime.length > 0 && runtime.every(ref => set.has(ref)), 'P6. Calisma aninda yuklenen moduller yayinda', runtime.filter(ref => !set.has(ref)).join(', '));

  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const appAssets = [...new Set([...app.matchAll(/'((?:assets\/brand|sablonlar|yasal)\/[a-z0-9._-]+)'/g)].map(m => m[1]))];
  check(appAssets.every(ref => set.has(ref)), 'P7. app.js\'in andigi marka/sablon/yasal dosyalari yayinda', appAssets.filter(ref => !set.has(ref)).join(', '));

  for (const page of published.filter(rel => /^yasal\/.+\.html$/.test(rel))) {
    const refs = localRefs(fs.readFileSync(path.join(root, page), 'utf8'), path.posix.dirname(page)).filter(ref => ref !== '');
    const gone = refs.filter(ref => !set.has(ref) && ref !== '.' && !ref.endsWith('/'));
    check(gone.length === 0, `P8. ${page} baglantilari yayinda`, gone.join(', '));
  }

  // --- Yalniz izlenen dosyalar ---
  check(published.every(rel => tracked.includes(rel)), 'P9. Yalniz git\'in izledigi dosyalar yayinlanir');

  // --- Is akisi ---
  const wf = path.join(root, '.github/workflows/pages.yml');
  const workflow = fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8') : '';
  check(/node scripts\/build_pages\.js _site/.test(workflow), 'P10. Pages is akisi bu betikle yayin klasorunu uretir');
  check(/upload-pages-artifact@[0-9a-f]{40}/.test(workflow) && /deploy-pages@[0-9a-f]{40}/.test(workflow), 'P11. Pages eylemleri tam SHA ile sabit (L-23)');
  check(/branches:\s*\[master\]/.test(workflow), 'P12. Yalniz master yayinlanir');
  check(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/).includes('_site/'), 'P13. Uretilen klasor commit edilmez');
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
