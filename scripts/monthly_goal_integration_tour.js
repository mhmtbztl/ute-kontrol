'use strict';
// Run explicitly against the dedicated test project; never part of the safe suite.
// Credentials and production protection are owned by test_env.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const env = require('../core/test_env').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const stamp = Date.now(), email = `goal97_${stamp}@lexbnb-e2e.test`, password = `Goal97!${stamp}`;
let uid, tid, browser, server;

(async () => {
  try {
    console.log('Test project:', new URL(env.SUPABASE_URL).hostname, '(synthetic data)');
    uid = must(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
    const owner = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
    must(await owner.auth.signInWithPassword({ email, password }));
    tid = must(await owner.rpc('create_tenant_and_owner', { p_company_name: `Goal97 ${stamp}`, p_full_name: 'Integration test' })).tenant_id;
    const property = must(await admin.from('properties').insert({ tenant_id: tid, name: 'Goal integration test property', slug: `goal97-${stamp}`, base_price: 5000, activated_on: '2026-01-01' }).select().single());
    execFileSync(process.execPath, [path.join(__dirname, 'prepare_a4_browser_runtime.js')], { stdio: 'ignore', env: process.env });
    fs.cpSync(path.join(__dirname, '../assets/brand'), path.join(os.tmpdir(), 'lexbnb-a4-browser-runtime/assets/brand'), { recursive: true });
    server = spawn(process.execPath, ['server.js'], { cwd: path.join(os.tmpdir(), 'lexbnb-a4-browser-runtime'), env: { ...process.env, PORT: '39017' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server timeout')), 10000);
      server.once('error', reject);
      server.stdout.on('data', b => { if (String(b).includes('running at')) { clearTimeout(timer); resolve(); } });
    });
    const executablePath = path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe');
    assert(fs.existsSync(executablePath), 'Real Chrome is required');
    browser = await chromium.launch({ executablePath, headless: true });
    console.log('Chrome:', browser.version());
    const page = await browser.newPage();
    const errors = [], consoleErrors = [], dialogs = [], networkErrors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ text: m.text(), source: m.location().url }); });
    page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
    page.on('response', r => {
      if (r.status() >= 400) {
        const url = new URL(r.url());
        // Do not log third-party challenge tokens embedded in URL paths.
        networkErrors.push({ host: url.hostname, path: url.hostname === 'challenges.cloudflare.com' ? '/challenge' : url.pathname, status: r.status() });
      }
    });
    await page.goto('http://127.0.0.1:39017/', { waitUntil: 'load' });
    await page.fill('#saasLoginUser', email);
    await page.fill('#saasLoginPass', password);
    await page.click('#saasLoginSubmitBtn');
    const ready = () => page.waitForFunction(() => typeof appData !== 'undefined' && appData.loadState?.status === 'READY' && Object.keys(appData.villas || {}).length > 0, null, { timeout: 45000 });
    await ready();
    const tab = name => page.evaluate(name => switchTab(name), name);
    await page.evaluate(() => { currentFilter.period = '2026-10'; currentFilter.villa = 'ALL'; switchTab('finance'); });
    await page.locator('#tab-finance [data-onclick="openGoalsModal()"]').first().click();
    await page.selectOption('#goalPeriodSelect', '2026-10');
    await page.fill('#goalRevenue', '100000');
    await page.fill('#goalADR', '5000');
    await page.fill('#goalMarginPct', '30');
    const saveGoal = async () => {
      await page.locator('#goalsForm button[type="submit"]').click();
      await page.waitForSelector('#goalsModal', { state: 'hidden' });
    };
    await saveGoal();
    const targets = () => admin.from('monthly_targets').select('*').eq('tenant_id', tid).then(must);
    const first = await targets();
    assert.strictEqual(first.length, 1);
    assert.strictEqual(Number(first[0].net_profit_target), 30000);
    assert.strictEqual(first[0].month, 10);
    // Real booking written through the normal application service; commission
    // makes profit measurable under the existing accounting contract.
    await page.evaluate(async slug => {
      await createBooking({ villa: slug, guest: 'Synthetic goal test guest', checkIn: '2026-10-10', checkOut: '2026-10-12', gross: 20000, cleanFee: 1000, otaComm: 1000, discount: 0, pax: 2, channel: 'WHATSAPP', status: 'CONFIRMED' });
      await resyncTenantData();
      currentFilter.period = '2026-10'; currentFilter.villa = 'ALL'; renderFinanceModule();
    }, property.slug);
    assert.strictEqual(await page.textContent('#finActualRevenue'), '19.000 TL');
    assert.strictEqual(await page.textContent('#finTargetRevenue'), '100.000 TL');
    assert.match(await page.textContent('#finTargetStatusBadge'), /19.0/);
    await tab('executive');
    await page.evaluate(() => refreshExecutiveDashboardSnapshot(true));
    assert.strictEqual(await page.textContent('#execKpiRevenue'), '₺19.000');
    assert.strictEqual(await page.textContent('#execRevVariance'), '%-81 Hedef');
    assert.strictEqual(await page.textContent('#execProfitVariance'), '%-37 Hedef');
    assert.strictEqual(await page.evaluate(() => getTargetRecordForPeriod('2026-10').id), first[0].id);
    await page.screenshot({ path: path.join(os.tmpdir(), 'lexbnb-goal97-today.png'), fullPage: false });
    // The actual UI also distinguishes zero from a missing goal.
    for (const [value, expected] of [[0, 'Hedef: ₺0'], [null, 'Hedef belirlenmemiş'], [30000, '%-37 Hedef']]) {
      must(await admin.from('monthly_targets').update({ net_profit_target: value }).eq('id', first[0].id).eq('tenant_id', tid));
      await page.evaluate(async () => { await resyncTenantData(); await refreshExecutiveDashboardSnapshot(true); });
      assert.strictEqual(await page.textContent('#execProfitVariance'), expected);
    }
    console.log('[PASS] 9.7.1 Finance/Today: same October row, revenue 19000, profit target 30000, variance -37%; zero/missing distinct');
    await tab('pricing');
    await page.locator('#tab-pricing [data-onclick="openGoalsModal()"]').click();
    assert.strictEqual(await page.inputValue('#goalPeriodSelect'), '2026-10');
    assert.strictEqual(await page.inputValue('#goalNetProfit'), '30000');
    await page.fill('#goalRevenue', '120000');
    await saveGoal();
    await tab('finance');
    assert.strictEqual(await page.textContent('#finTargetRevenue'), '120.000 TL');
    const second = await targets();
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].id, first[0].id);
    assert.strictEqual(Number(second[0].revenue_target), 120000);
    console.log('[PASS] 9.7.2 Manage Goals: same row/month, pricing edit appears in Finance');
    await tab('pricing');
    await page.fill('#pricingRulePct', '23.5');
    await page.click('[data-onclick="savePricingRuleSettings()"]');
    await page.waitForFunction(() => appData.propertyPricingRules.some(r => Number(r.pct) === 23.5));
    await page.fill('#pricingResearchDate', '2026-10-19');
    await page.fill('#pricingResearchUrl', 'https://example.com/integration97');
    await page.fill('#pricingResearchWeekday', '4200');
    await page.fill('#pricingResearchWeekend', '5700');
    await page.fill('#pricingResearchNote', 'Synthetic goal regression research');
    await page.click('[data-onclick="saveCompetitorResearch()"]');
    await page.waitForFunction(() => appData.competitorPriceResearch.some(r => r.raw_note === 'Synthetic goal regression research'));
    await page.reload({ waitUntil: 'load' });
    await ready();
    await tab('pricing');
    assert.strictEqual(await page.inputValue('#pricingRulePct'), '23.5');
    const history = await page.textContent('#pricingResearchList');
    assert.match(history, /4.200/); assert.match(history, /5.700/);
    assert.match(history, /Synthetic goal regression research/);
    console.log('[PASS] 9.7.3 Rule 23.5% and competitor prices 4200/5700 survive real reload');
    console.log('Network failures:', JSON.stringify(networkErrors));
    console.log('Console diagnostics:', JSON.stringify(consoleErrors.map(e => ({ text: e.text, source: e.source ? new URL(e.source).hostname : '(no source)' }))));
    assert.deepStrictEqual(dialogs, []);
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(networkErrors.filter(e => e.host !== 'challenges.cloudflare.com'), []);
    // Cloudflare's independent iframe may emit PAT/CSP diagnostics in headless
    // Chrome. Keep them visible, while gating all first-party console errors.
    assert.deepStrictEqual(consoleErrors.filter(e => e.source.startsWith('http://127.0.0.1:39017/')), []);
  } catch (error) {
    console.error('[FAIL]', error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    for (const [name, cleanup] of [
      ['tenant', () => tid && admin.from('tenants').delete().eq('id', tid)],
      ['user', () => uid && admin.auth.admin.deleteUser(uid)]
    ]) {
      try { const result = await cleanup(); if (result) must(result); console.log('Cleanup', name, 'OK'); }
      catch (error) { console.error('Cleanup failed:', name, error.message); process.exitCode = 1; }
    }
  }
})();
