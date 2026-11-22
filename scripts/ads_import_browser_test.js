'use strict';
// Reklam verisi ekleme uctan uca (kullanici 21.11.2026: "Meta ve Google reklamlarini
// eklemeyi test edip en kolay hale getirmeliyiz"). Gercek uygulama (yerel fikstur),
// gercek dosya secimi ve onay; yalniz Supabase istemcisi taklittir — veritabanina dokunmaz.
// Meta ve Google raporu ayni kutuya birakilir, platform dosyadan anlasilir; elle giris
// kampanya acmadan ayni onizlemeden gecer. Her yol import_ad_metric_batch'e dogru satiri yollar.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { createServer, HOST } = require('../server');

const executablePath = [process.env.CHROME_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));

const META_CSV = 'Rapor Başlangıcı,Rapor Sonu,Kampanya Adı,Kampanya yayını,Sonuçlar,Sonuç Göstergesi,Harcanan Tutar (TRY),Gösterim,Bağlantı Tıklamaları\n'
  + '2026-10-01,2026-10-31,Yaz mesaj kampanyası,active,22,actions:onsite_conversion.messaging_conversation_started_7d,3100.50,31000,620\n';
const GOOGLE_CSV = 'Campaign performance report\n"October 1, 2026 - October 31, 2026"\n'
  + 'Campaign status,Campaign,Currency code,Impr.,Clicks,Cost,Conversions,Phone calls\n'
  + 'Enabled,Villa arama,TRY,"12,345","1,020","3,456.78",12.00,7\n'
  + 'Total: Campaigns,--,TRY,"12,345","1,020","3,456.78",12.00,7\n';

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, HOST, resolve));
  const browser = await chromium.launch({ executablePath, headless: true });
  let passed = 0;
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.goto(`http://${HOST}:${server.address().port}/?ci-browser=1&role=owner`, { waitUntil: 'load' });
      await page.waitForSelector('body[data-browser-quality-ready="true"]');
      await page.evaluate(() => {
        window.__rpc = [];
        const result = { data: [], error: null };
        const chain = () => new Proxy(function () {}, {
          get: (_, key) => key === 'then' ? (resolve => resolve(result)) : () => chain(),
          apply: () => chain()
        });
        setSupabaseClient({
          from: () => chain(),
          rpc: async (fn, args) => {
            window.__rpc.push({ fn, args });
            if (fn === 'import_ad_metric_batch') {
              return { data: { inserted_periods: args.p_rows.length, spend_total: args.p_rows.reduce((s, r) => s + (r.spend || 0), 0), created_campaigns: args.p_new_campaigns, replaced_periods: 0 }, error: null };
            }
            return { data: null, error: null };
          },
          storage: { from: () => chain() },
          auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) }
        });
        window.getActiveTenantId = () => '22222222-2222-4222-8222-222222222222';
        currentFilter.period = '2026-10';
        switchTab('marketing');
      });
      await page.waitForSelector('#mkAdsTitle');

      const openImport = async () => {
        if (await page.locator('[data-marketing-home]').count()) await page.click('[data-marketing-home]');
        await page.click('#marketingWorkspaceContent .mk-section-head [data-ads-view="import"]');
        await page.waitForSelector('[data-ads-dropzone]');
      };
      const confirmAndRead = async () => {
        await page.waitForSelector('form[data-ads-import-confirm] button[type="submit"]:not([disabled])', { timeout: 5000 });
        const before = await page.evaluate(() => window.__rpc.filter(c => c.fn === 'import_ad_metric_batch').length);
        await page.click('form[data-ads-import-confirm] button[type="submit"]');
        await page.waitForFunction(n => window.__rpc.filter(c => c.fn === 'import_ad_metric_batch').length > n, before, { timeout: 5000 }).catch(async e => { console.log('DEBUG', await page.evaluate(() => [document.getElementById('marketingWorkspaceStatus').textContent, document.getElementById('marketingWorkspaceContent').innerText.slice(0, 1500), JSON.stringify(window.__rpc.map(c => c.fn))])); throw e; });
        await page.waitForSelector('#mkAdsTitle');
        assert(await page.locator('.mk-saved').isVisible(), 'Kayıttan sonra ana sayfada "Kaydedildi" notu görünmeli');
        return page.evaluate(() => window.__rpc.filter(c => c.fn === 'import_ad_metric_batch').pop().args);
      };

      // 1. Meta raporu: dosyayı kutuya bırak, platform kendiliğinden META.
      await openImport();
      await page.setInputFiles('[data-ads-import-file]', { name: 'meta.csv', mimeType: 'text/csv', buffer: Buffer.from(META_CSV, 'utf8') });
      const meta = await confirmAndRead();
      assert.strictEqual(meta.p_rows[0].platform, 'META');
      assert.strictEqual(meta.p_rows[0].spend, 3100.5);
      assert.strictEqual(meta.p_rows[0].messages, 22);
      assert.strictEqual(meta.p_rows[0].source, 'CSV');
      assert.strictEqual(meta.p_new_campaigns[0].name, 'Yaz mesaj kampanyası');

      // 2. Google Ads raporu: aynı kutu; başlık satırları ve toplam satırı atlanır.
      await openImport();
      await page.setInputFiles('[data-ads-import-file]', { name: 'google.csv', mimeType: 'text/csv', buffer: Buffer.from(GOOGLE_CSV, 'utf8') });
      const google = await confirmAndRead();
      assert.strictEqual(google.p_rows.length, 1, 'Toplam satırı kayıt olmamalı');
      assert.strictEqual(google.p_rows[0].platform, 'GOOGLE');
      assert.strictEqual(google.p_rows[0].spend, 3456.78);
      assert.strictEqual(google.p_rows[0].calls, 7);
      assert.strictEqual(google.p_rows[0].period_start, '2026-10-01');
      assert.strictEqual(google.p_rows[0].period_end, '2026-10-31');

      // 2b. TikTok raporu: aynı kutu; tarih aralığı dosya adından.
      await openImport();
      await page.setInputFiles('[data-ads-import-file]', { name: 'Campaign Report(2026-10-01 to 2026-10-31).csv', mimeType: 'text/csv', buffer: Buffer.from('Campaign name,Cost,Impressions,Clicks (destination),Results,Currency\nVilla TikTok,1250.40,54000,820,31,TRY\n', 'utf8') });
      const tiktok = await confirmAndRead();
      assert.deepStrictEqual([tiktok.p_rows[0].platform, tiktok.p_rows[0].spend, tiktok.p_rows[0].results, tiktok.p_new_campaigns[0].platform], ['TIKTOK', 1250.4, 31, 'TIKTOK']);

      // 3. Dosya yok: elle giriş, önce kampanya açmadan.
      await openImport();
      const quick = page.locator('form[data-ads-quick-form]');
      await quick.locator('[name=platform]').selectOption('GOOGLE');
      await quick.locator('[name=campaignName]').fill('Elle Google');
      await quick.locator('[name=periodStart]').fill('2026-10-01');
      await quick.locator('[name=periodEnd]').fill('2026-10-31');
      await quick.locator('[name=spend]').fill('2.500');
      await quick.locator('[name=resultType]').selectOption('CALL');
      await quick.locator('[name=results]').fill('4');
      await quick.locator('button[type="submit"]').click();
      const manual = await confirmAndRead();
      assert.deepStrictEqual([manual.p_rows[0].platform, manual.p_rows[0].spend, manual.p_rows[0].calls, manual.p_rows[0].source], ['GOOGLE', 2500, 4, 'MANUAL']);
      assert.strictEqual(manual.p_new_campaigns[0].name, 'Elle Google');

      // 4. Tanınmayan dosya anlaşılır biçimde reddedilir ve elle girişe yönlendirir.
      await openImport();
      await page.setInputFiles('[data-ads-import-file]', { name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n', 'utf8') });
      await page.getByText('hangi reklam platformundan geldiği anlaşılamadı', { exact: false }).waitFor();

      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px yatay taşma`);
      assert.deepStrictEqual(errors, []);
      console.log(`[PASS] Reklam ekleme ${width}px: Meta, Google Ads ve TikTok CSV, elle giriş, tanınmayan dosya`);
      passed++;
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  if (passed !== 2) process.exitCode = 1;
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
