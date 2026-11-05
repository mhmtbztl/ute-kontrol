'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { createServer, HOST } = require('../server');
const screenshotDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lexbnb-airbnb-browser-'));
const executablePath = [process.env.CHROME_PATH, process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'],'Microsoft/Edge/Application/msedge.exe'), '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, HOST, resolve));
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    for (const width of [1280,390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/airbnb-test', route => route.fulfill({ contentType:'text/html', body:'<!doctype html><html lang="tr" class="lx-styles-ready"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="padding:16px"><main id="test-root"></main><script src="/core/airbnb_performance_service.js"></script><script src="/core/airbnb_performance_ui.js"></script></body></html>' }));
      await page.goto(`http://${HOST}:${server.address().port}/airbnb-test`);
      await page.evaluate(() => {
        const listing = '11111111-1111-4111-8111-111111111111';
        const tenant = '22222222-2222-4222-8222-222222222222';
        const db = { airbnb_performance_records: [{ id:'previous', channel_listing_id:listing, period_start:'2026-09-03', period_end:'2026-10-03', metrics:{views:393,favorites:37},is_current:true }], airbnb_listing_changes:[] };
        window.fixture = { db, listing, tenant, calls:[] };
        const client = {
          from(table) { return { select(){return this;},eq(){return this;},order(){return this;},async range(){return {data:db[table]};} }; },
          async rpc(fn,args) {
            window.fixture.calls.push({fn,args});
            if(fn === 'record_airbnb_performance') {
              const row={id:crypto.randomUUID(),channel_listing_id:args.p_listing_id,period_start:args.p_start,period_end:args.p_end,metrics:args.p_metrics,notes:args.p_notes,supersedes_id:args.p_expected_id,is_current:true};
              db.airbnb_performance_records.push(row);return {data:row};
            }
            const row={id:args.p_request_id,channel_listing_id:args.p_listing_id,change_date:args.p_date,kind:args.p_kind,notes:args.p_notes};db.airbnb_listing_changes.push(row);return {data:row};
          }
        };
        const model={properties:[{id:'p1',slug:'zirve',name:'Zirve <img src=x>'}],selectedProperty:'ALL',listings:[{id:listing,property_id:'p1',channel_code:'AIRBNB',display_name:'Zirve Airbnb'}],snapshots:[],period:{}};
        window.remount=(canManage=true,fail=false)=>AirbnbPerformanceUI.mount(document.getElementById('test-root'),{model,client:fail?{from(){throw {code:'42P01'};}}:client,tenantId:tenant,canManage});
        window.remount();
      });
      await page.getByRole('button',{name:'＋ Veri ekle',exact:true}).click();
      const form = page.locator('[data-ab-form="record"]');
      await form.locator('[name=start]').fill('2026-10-04');
      await form.locator('[name=end]').fill('2026-11-03');
      await form.locator('[name=views]').fill('436');
      await form.locator('[name=favorites]').fill('30');
      await form.locator('[name=bookingConversion]').fill('0,16');
      await form.getByRole('button',{name:'Önizle',exact:true}).click();
      assert(await page.getByText('Kaydetmeden önce kontrol et',{exact:true}).isVisible());
      assert.equal(await page.evaluate(()=>window.fixture.calls.length),0);
      await page.getByRole('button',{name:'Onayla ve kaydet',exact:true}).click();
      await page.getByText('Dönem verisi kaydedildi.',{exact:true}).waitFor();
      assert(await page.getByText('43 artmış',{exact:true}).first().isVisible());
      assert.equal(await page.evaluate(()=>window.fixture.calls[0].args.p_metrics.bookingConversion),0.16);
      assert.equal(await page.locator('#test-root img').count(),0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(screenshotDir,`airbnb-performance-${width}.png`),fullPage:true});
      await page.getByText('Kayıt geçmişi (2)',{exact:true}).click();
      await page.getByRole('button',{name:'Düzelt',exact:true}).first().click();
      await page.locator('[data-ab-form="record"] [name=views]').fill('440');
      await page.getByRole('button',{name:'Önizle',exact:true}).click();
      assert(await page.getByText('Bu dönemin kaydı güncellenecek.',{exact:false}).isVisible());
      await page.getByRole('button',{name:'Onayla ve kaydet',exact:true}).click();
      await page.getByText('Dönem verisi kaydedildi.',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.fixture.db.airbnb_performance_records.length),3);
      await page.getByRole('button',{name:'Değişiklik takibi',exact:true}).click();
      await page.getByRole('button',{name:'＋ Değişiklik ekle',exact:true}).click();
      await page.locator('[name=date]').fill('2026-11-05');
      await page.locator('[name=kind]').selectOption('TITLE');
      await page.locator('[name=notes]').fill('Başlığı değiştirdim');
      await page.getByRole('button',{name:'Değişikliği kaydet',exact:true}).click();
      await page.getByText('Değişiklik kaydedildi.',{exact:true}).waitFor();
      assert(await page.getByText('dönem verisi eksik.',{exact:false}).isVisible());
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(screenshotDir,`airbnb-preview-${width}.png`),fullPage:true});
      // Replace root so the test mimics the application's remount lifecycle.
      await page.evaluate(()=>{document.getElementById('test-root').outerHTML='<main id="test-root"></main>';window.remount(false);});
      await page.getByText('Airbnb İlan Performansı',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'＋ Veri ekle',exact:true}).count(),0);
      await page.evaluate(()=>{document.getElementById('test-root').outerHTML='<main id="test-root"></main>';window.remount(true,true);});
      await page.getByText('Veritabanı güncellemesi gerekiyor.',{exact:false}).waitFor();
      assert.equal(await page.getByRole('button',{name:'＋ Veri ekle',exact:true}).count(),0);
      assert.deepEqual(errors,[]);
      console.log(`PASS Airbnb browser ${width}px: preview/save/edit/history/change notes, permissions, schema fallback, XSS and overflow`);
      await page.close();
    }
    console.log('Screenshots: ' + screenshotDir);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
