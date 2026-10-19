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

async function assertBookingFinance(page, mobile) {
  await page.evaluate(() => {
    switchTab('reservations');
    appData.tenantSettings = { ...appData.tenantSettings, booking_tax_profiles: [{ name:'Test profile', dateBasis:'checkIn', validFrom:'2020-01-01',validTo:'2040-12-31',
      vat:{rate:10,room:true,cleaning:true,includesOther:false}, accommodation:{rate:2,room:true,cleaning:false,includesOther:false} }] };
    openBookingModal();
    setResDateRange('2031-01-01','2031-01-05');
  });
  await page.fill('#resGuest','Finance browser');
  await page.fill('#resGross','12200');
  await page.fill('#resPax','2');
  await page.locator('.booking-optional-details > summary').click();
  await page.fill('#resCleanFee','1000');
  await page.fill('#resCleanCost','500');
  await page.fill('#resCommission','1500');
  await page.fill('#resPaymentCommission','100');
  assert.equal(await page.evaluate(() => readExtendedBookingEconomics().financeResult.adr),2800);
  await page.check('#resTaxEnabled');
  await page.selectOption('#resTaxMode','exclusive');
  await page.selectOption('#resTaxProfile','0');
  for (const key of ['vat','accommodation']) {
    await page.selectOption('#financeCollector_'+key,'none');
    await page.selectOption('#financeLiability_'+key,'all');
  }
  assert.equal(await page.textContent('#resFinanceError'),'');
  assert.equal(await page.evaluate(() => readExtendedBookingEconomics().financeResult.gross),13644);
  await page.fill('#resGross','12300');
  assert.equal(await page.inputValue('#resCommission'),'1500','manual commission changed when gross changed');
  await page.fill('#resGross','12200');
  await page.check('#resExtrasEnabled');
  await page.click('[data-onclick="addBookingExtraExpense()"]');
  await page.locator('.finance-extra-name').fill('Akaryakıt');
  await page.locator('.finance-extra-amount').fill('300');
  assert.equal(await page.evaluate(() => readExtendedBookingEconomics().financeResult.remaining),9800);
  await page.selectOption('#financeCollector_vat','split');
  await page.fill('#financeCollected_vat','400');
  assert.equal(await page.evaluate(() => readExtendedBookingEconomics().financeResult.remaining),9800);
  await page.selectOption('#resTaxMode','inclusive');
  await page.fill('#resGross','13644');
  await page.fill('#resCleanFee','1100');
  assert.equal(await page.evaluate(() => readExtendedBookingEconomics().financeResult.netRoomRevenue),11200);
  await assertNoHorizontalOverflow(page,'booking finance '+(mobile ? 'mobile' : 'desktop'));
  const fit = await page.locator('#bookingModal .modal-card').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  assert(fit,'finance modal has horizontal overflow');
  await page.locator('#prevNetToUs').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(__dirname,'..','tmp',`booking-finance-${mobile ? 'mobile' : 'desktop'}.png`)});
  // Round trip uses the persisted snapshot, not today's settings/profile.
  const roundTrip = await page.evaluate(() => {
    const e = readExtendedBookingEconomics();
    const b = { id:'finance-browser',villa:'test',propertyId:appData.villas.test.id,guest:'Finance browser',checkIn:e.financeInput.checkIn,checkOut:e.financeInput.checkOut,
      gross:e.gross,cleanFee:e.cleanFee,cleanCost:500,otaComm:e.otaComm,paymentCommission:e.paymentComm,discount:0,pax:2,channel:'AIRBNB',status:'CONFIRMED',financialDetails:JSON.parse(JSON.stringify({input:e.financeInput,result:e.financeResult})) };
    appData.bookings.push(b); closeBookingModal();
    appData.tenantSettings.booking_tax_profiles[0].vat.rate = 90;
    openBookingModal(b.id);
    return readExtendedBookingEconomics().financeResult;
  });
  assert.equal(roundTrip.vat,1220); assert.equal(roundTrip.remaining,9800);
  await page.evaluate(() => { closeBookingModal(); appData.bookings = appData.bookings.filter(b => b.id !== 'finance-browser'); });
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
      await assertBookingFinance(page,false); passed.push('15. rezervasyon finansı: vergi, gider, manuel komisyon ve kayıt turu');
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
      // M3: mulk formunda konum alanina yapistirilan Plus Code / koordinat
      // enlem ve boylami kendiliginden doldurur.
      await page.evaluate(() => openPropertyModal());
      const filled = await page.evaluate(() => {
        const input = document.getElementById('propMapCoordinatesLink');
        const out = [];
        for (const value of ['8G8F6J2V+F6', '36.2012, 29.6431']) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          out.push([document.getElementById('propAnalysisLatitude').value, document.getElementById('propAnalysisLongitude').value]);
        }
        closePropertyModal();
        return out;
      });
      assert(filled.every(([lat, lng]) => Math.abs(Number(lat) - 36.2012) < 0.001 && Math.abs(Number(lng) - 29.6431) < 0.001), `Konum doldurmadı: ${JSON.stringify(filled)}`);
      passed.push('13. mülk konumu Plus Code ya da koordinattan dolar');
      // M4 (kullanici, 06.10): davet e-postasi yalniz GitHub'in gecikebilen
      // zamanlayicisina birakilmamali. Tarayici yetkili Edge Function'i hemen
      // cagirir; servis rolu ya da baska bir gizli anahtar istemciye verilmez.
      const invitationCalls = [];
      await page.route('**/functions/v1/**', async route => {
        assert(route.request().url().endsWith('/functions/v1/send-tenant-invitation'), `Beklenmeyen function cagrisi: ${route.request().url()}`);
        invitationCalls.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            invitation: { invitation_id: '00000000-0000-4000-8000-000000000099' },
            delivery: 'sent'
          })
        });
      });
      await page.evaluate(async () => {
        switchTab('settings');
        openInviteMemberModal();
        document.getElementById('inviteMemberEmail').value = 'm4-yonetici@browser.test';
        document.getElementById('inviteMemberRole').value = 'admin';
        await submitMemberInvite({ preventDefault() {} });
      });
      assert.deepStrictEqual(invitationCalls, [{
        tenantId: '00000000-0000-4000-8000-000000000001',
        email: 'm4-yonetici@browser.test',
        role: 'admin'
      }], `Davet Edge Function'a aninda gitmedi: ${JSON.stringify(invitationCalls)}`);
      passed.push('14. ekip daveti e-posta sunucu fonksiyonuna anında gider');
      // Gorev 9 (14.10): M6 — Hizli Ekle "Yeni talep" hata vermeden hizli
      // kayit formuna gider; M7 — saha ekibine kisi eklenir ve tabloya yazilir.
      const dialogs = [];
      const onDialog = dialog => { dialogs.push(dialog.message()); dialog.dismiss().catch(() => {}); };
      page.on('dialog', onDialog);
      await page.click('#quickAddBtn');
      await page.click('#quickAddMenu [data-onclick^="openQuickLeadCapture"]');
      const leadState = await page.evaluate(() => ({
        tab: document.getElementById('tab-leads').classList.contains('active'),
        focus: document.activeElement && document.activeElement.id,
        modal: document.getElementById('leadModal')?.classList.contains('active') || false
      }));
      assert(leadState.tab && leadState.focus === 'leadQuickPhone' && !leadState.modal && !dialogs.length,
        `Yeni talep hizli forma gitmedi: ${JSON.stringify({ leadState, dialogs })}`);
      const personWrites = [];
      await page.route('**/rest/v1/operational_people**', async route => {
        if (route.request().method() === 'POST') personWrites.push(route.request().postDataJSON());
        await route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, contentType: 'application/json', body: '[]' });
      });
      await page.evaluate(() => { switchTab('operations'); document.querySelector('[data-operations-view="people"]').click(); });
      await page.waitForSelector('#opsPersonName', { state: 'visible', timeout: 5000 });
      await page.selectOption('#opsPersonKind', 'TECHNICIAN');
      await page.fill('#opsPersonName', 'Tarayici Usta');
      await page.fill('#opsPersonSpecialty', 'elektrik');
      await page.click('[data-onclick="saveOperationalPerson()"]');

      await page.waitForTimeout(300);
      page.off('dialog', onDialog);
      const written = Array.isArray(personWrites[0]) ? personWrites[0][0] : personWrites[0];
      assert(written && written.full_name === 'Tarayici Usta' && written.kind === 'TECHNICIAN' && written.tenant_id === '00000000-0000-4000-8000-000000000001' && !dialogs.length,
        `Saha ekibi kaydi yazilmadi: ${JSON.stringify({ personWrites, dialogs })}`);
      passed.push('15. yeni talep hızlı forma gider; saha ekibine usta eklenir');
      // L-191 (M21): Ara / Komut ekrana ve alt gorunume goturur, kanal kelimesini tanir.
      await page.evaluate(() => openCommandPalette());
      await page.fill('#commandPaletteInput', 'arıza');
      await page.press('#commandPaletteInput', 'Enter');
      const paletteState = await page.evaluate(() => ({
        tab: document.getElementById('tab-operations').classList.contains('active'),
        view: operationsViewState,
        closed: getComputedStyle(document.getElementById('commandPaletteModal')).display === 'none'
      }));
      assert(paletteState.tab && paletteState.view === 'maintenance' && paletteState.closed, `Arama arizaya gitmedi: ${JSON.stringify(paletteState)}`);
      await page.evaluate(() => openCommandPalette());
      await page.fill('#commandPaletteInput', 'airbnb');
      const airbnbText = await page.textContent('#commandPaletteResults');
      assert(/Kanallar ve Pazarlama/.test(airbnbText), `"airbnb" kanal ekranini bulmadi: ${airbnbText}`);
      await page.evaluate(() => closeCommandPalette());
      passed.push('16. Ara / Komut ekrana ve alt görünüme götürür; "airbnb" kanal ekranını bulur');
      // L-192 (M22): zil gercek olaydan bildirim gosterir, ne zaman bildirim
      // gelecegini anlatir ve "Git" kaydin ekranina goturur.
      const syncPayloads = [];
      await page.route('**/rest/v1/rpc/sync_my_notifications', async route => {
        const body = route.request().postDataJSON();
        syncPayloads.push(body);
        const rows = (body.p_events || []).map((e, i) => ({ ...e, id: `n-${i}`, tenant_id: body.p_tenant_id, status: 'UNREAD' }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      });
      await page.evaluate(() => {
        appData.maintenance = [{ id: 'browser-new-ticket', title: 'Kombi arızası', villa: 'test', status: 'OPEN', priority: 'P2', created_at: getTodayStr() + 'T09:00:00Z' }];
        toggleNotificationDrawer();
      });
      await page.waitForFunction(() => /Kombi arızası/.test(document.getElementById('notificationList').textContent));
      const drawerText = await page.textContent('#notificationList');
      const badge = await page.textContent('#notificationBellBadge');
      assert(/Bildirimler neye göre gelir/.test(drawerText) && /Kazanç fırsatı/.test(drawerText) && Number(badge) >= 1,
        `Bildirim merkezi olay ya da aciklama gostermedi: ${JSON.stringify({ drawerText, badge })}`);
      await page.click('#notificationList [data-onclick^="openUserNotification"]');
      const notifState = await page.evaluate(() => ({
        tab: document.getElementById('tab-operations').classList.contains('active'),
        view: operationsViewState
      }));
      assert(syncPayloads.length >= 1 && syncPayloads.every(x => Array.isArray(x.p_events) && x.p_events.every(e => !('at' in e))), `sync_my_notifications yuku: ${JSON.stringify(syncPayloads)}`);
      assert(notifState.tab && notifState.view === 'maintenance', `Bildirim arizaya gotumedi: ${JSON.stringify(notifState)}`);
      passed.push('17. bildirim merkezi gerçek olayı gösterir, neye göre geldiğini anlatır, Git kayda götürür');
      // L-194 (M24): ice aktarma ekrani gecerli degerleri gosterir; uygulama
      // ici sablon uc sayfadir ve veri sayfasi yalniz basliktir; ChatGPT
      // istemi isletmenin mulk kodunu tasir.
      await page.evaluate(() => {
        // Onceki adimlar veriyi bos sahte sunucudan yeniden yukleyebilir.
        appData.villas = { test: { id: '00000000-0000-4000-8000-000000000010', name: 'Test Villası', slug: 'test', isActive: true } };
        openImportModal();
      });
      const validText = await page.textContent('#importValidValues');
      assert(/test/.test(validText) && /Test Villası/.test(validText) && /AIRBNB/.test(validText) && /Fatura/.test(validText),
        `Gecerli degerler gorunmedi: ${validText}`);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('[data-onclick="downloadSampleTemplate(\'EXPENSES\')"]')
      ]);
      const XLSXN = require('../xlsx.full.min.js');
      const tplWb = XLSXN.read(fs.readFileSync(await download.path()), { type: 'buffer' });
      const tplRows = XLSXN.utils.sheet_to_json(tplWb.Sheets[tplWb.SheetNames[0]], { header: 1 });
      const tplValid = XLSXN.utils.sheet_to_json(tplWb.Sheets['GEÇERLİ DEĞERLER'] || {}, { header: 1 }).map(r => r.join('|')).join('\n');
      assert(tplWb.SheetNames.join() === 'Giderler,NASIL DOLDURULUR,GEÇERLİ DEĞERLER' && tplRows.length === 1 && /test\|Test Villası/.test(tplValid),
        `Gider sablonu: ${JSON.stringify({ sheets: tplWb.SheetNames, rows: tplRows.length, tplValid })}`);
      await page.click('[data-onclick="openImportConvertPrompt(\'BOOKINGS\')"]');
      const convertPrompt = await page.inputValue('#chatGptQuestionPrompt');
      assert(/IMPORT_TEMPLATE_CONVERT/.test(convertPrompt) && /"code":"test"/.test(convertPrompt) && /Misafirden Temizlik Ücreti/.test(convertPrompt),
        `ChatGPT donusum istemi: ${convertPrompt.slice(0, 300)}`);
      await page.evaluate(() => { closeChatGptQuestionModal(); closeImportModal(); });
      passed.push('18. içe aktarma ekranı geçerli değerleri gösterir; şablon 3 sayfa ve boş; ChatGPT dönüşüm istemi kod taşır');
      // L-195 (M25): gecmis temizlik CSV'si otomatik algilanir, onizlenir ve
      // cleaning_tasks'a "yapildi" yazilir; aktarim bagi temizligi tasir.
      const cleaningWrites = [];
      const linkWrites = [];
      await page.route('**/rest/v1/cleaning_tasks**', async route => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          cleaningWrites.push(...(Array.isArray(body) ? body : [body]));
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(Array.isArray(body) ? body : [body]) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });
      await page.route('**/rest/v1/finance_import_batches**', async route => {
        if (route.request().method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'batch-browser' }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      });
      await page.route('**/rest/v1/finance_import_batch_rows**', async route => {
        if (route.request().method() === 'POST') linkWrites.push(...[].concat(route.request().postDataJSON()));
        return route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, contentType: 'application/json', body: '[]' });
      });
      await page.evaluate(() => {
        appData.villas = { test: { id: '00000000-0000-4000-8000-000000000010', name: 'Test Villası', slug: 'test', isActive: true } };
        appData.cleaningTasks = [];
        openImportModal();
      });
      const csv = '﻿Tarih;Villa;Tutar (TL);Temizlikçi;Ödendi;Açıklama\r\n2026-01-10;test;1200;Ayşe;;Eski temizlik\r\n2026-01-12;Test Villası;900;;Hayır;\r\n';
      await page.setInputFiles('#excelFileInput', { name: 'temizlik.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
      await page.waitForFunction(() => /2 kaydı içe aktar/.test(document.getElementById('importConfirmBtn')?.innerText || ''));
      const previewMode = await page.inputValue('#importModeSelect');
      await page.click('#importConfirmBtn');
      await page.waitForFunction(() => !document.getElementById('importModal').classList.contains('active'), null, { timeout: 10000 });
      assert(previewMode === 'CLEANING' && cleaningWrites.length === 2
        && cleaningWrites.every(w => w.status === 'DONE' && w.property_id === '00000000-0000-4000-8000-000000000010')
        && cleaningWrites[0].is_paid === true && cleaningWrites[1].is_paid === false && cleaningWrites[0].amount === 1200
        && linkWrites.length === 2 && linkWrites.every(l => l.cleaning_task_id && !('expense_id' in l)),
        `Gecmis temizlik aktarimi: ${JSON.stringify({ previewMode, cleaningWrites, linkWrites })}`);
      passed.push('19. geçmiş temizlik CSV\'si algılanır, cleaning_tasks\'a "yapıldı" yazılır, geri alma bağı kurulur');
      // L-196 (M26): gelir tablosu indirilir; TOPLAM satirindaki ciro Finans
      // ekraninda yazan ciroyla ayni.
      const screenRevenue = await page.evaluate(() => {
        appData.villas = { test: { id: '00000000-0000-4000-8000-000000000010', name: 'Test Villası', slug: 'test', isActive: true } };
        appData.bookings = [{ id: 'browser-income', villa: 'test', propertyId: '00000000-0000-4000-8000-000000000010', guest: 'Gelir Tablosu', checkIn: getTodayStr().slice(0, 7) + '-02', checkOut: getTodayStr().slice(0, 7) + '-05', gross: 30000, cleanFee: 1000, otaComm: 0, discount: 0, status: 'CONFIRMED' }];
        currentFilter.period = getCurrentMonthKey();
        currentFilter.villa = 'ALL';
        switchTab('finance');
        return document.getElementById('finActualRevenue').textContent;
      });
      const incomeVisible = await page.evaluate(() => !document.querySelector('[data-onclick^="exportIncomeStatement"]').hidden);
      const [incomeDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.evaluate(() => exportIncomeStatement())
      ]);
      const XLSXI = require('../xlsx.full.min.js');
      const incomeWb = XLSXI.read(fs.readFileSync(await incomeDownload.path()), { type: 'buffer' });
      const incomeRows = XLSXI.utils.sheet_to_json(incomeWb.Sheets['Gelir Tablosu'], { header: 1 });
      const totalRow = incomeRows.find(r => r[0] === 'TOPLAM') || [];
      assert(incomeVisible && incomeWb.SheetNames.join() === 'Gelir Tablosu,Mülk Bazında,Açıklama'
        && Math.round(totalRow[2]) === screenNumber(screenRevenue),
        `Gelir tablosu: ${JSON.stringify({ incomeVisible, sheets: incomeWb.SheetNames, totalRow, screenRevenue })}`);
      passed.push('20. gelir tablosu indirilir; TOPLAM cirosu Finans ekranıyla aynı');
      // L-197 (M27): takvim ve liste tek donem + mulk secicisini izler.
      await page.evaluate(() => {
        const ay = getTodayStr().slice(0, 7);
        appData.villas = {
          test: { id: '00000000-0000-4000-8000-000000000010', name: 'Test Villası', slug: 'test', isActive: true },
          deniz: { id: '00000000-0000-4000-8000-000000000011', name: 'Deniz Evi', slug: 'deniz', isActive: true }
        };
        appData.bookings = [
          { id: 'scope-a', villa: 'test', propertyId: '00000000-0000-4000-8000-000000000010', guest: 'Ayşe Takvim', checkIn: ay + '-03', checkOut: ay + '-06', gross: 9000, cleanFee: 0, otaComm: 0, discount: 0, channel: 'WHATSAPP', status: 'CONFIRMED' },
          { id: 'scope-b', villa: 'deniz', propertyId: '00000000-0000-4000-8000-000000000011', guest: 'Bora Liste', checkIn: ay + '-08', checkOut: ay + '-10', gross: 7000, cleanFee: 0, otaComm: 0, discount: 0, channel: 'WHATSAPP', status: 'CONFIRMED' }
        ];
        updateAllVillaDropdowns();
        switchTab('reservations');
        resetReservationRange();
      });
      await page.selectOption('#rezVillaFilter', 'deniz');
      const scopeVilla = await page.evaluate(() => ({
        calendar: document.getElementById('tapeChartContainer').textContent,
        list: document.getElementById('manageBookingsTableBody').textContent
      }));
      assert(/Deniz Evi/.test(scopeVilla.calendar) && !/Test Villası/.test(scopeVilla.calendar) && /Bora/.test(scopeVilla.list) && !/Ayşe/.test(scopeVilla.list),
        `Mulk secimi takvim ve listeye birlikte uygulanmadi: ${JSON.stringify(scopeVilla).slice(0, 400)}`);
      const labelBefore = await page.textContent('#reservationRangeLabel');
      await page.click('[data-onclick="stepReservationPeriod(1)"]');
      const scopeNext = await page.evaluate(() => ({
        label: document.getElementById('reservationRangeLabel').textContent,
        list: document.getElementById('manageBookingsTableBody').textContent,
        firstDay: document.querySelector('#tapeChartContainer .tape-day-th')?.textContent.trim().split(/\s+/)[0]
      }));
      assert(scopeNext.label !== labelBefore && !/Bora/.test(scopeNext.list) && scopeNext.firstDay === '1',
        `Sonraki donem takvimi ve listeyi birlikte kaydirmadi: ${JSON.stringify({ labelBefore, scopeNext })}`);
      await page.click('[data-onclick="setTapeChartView(\'WEEK_1\')"]');
      const weekCols = await page.evaluate(() => document.querySelectorAll('#tapeChartContainer .tape-day-th').length);
      const weekLabel = await page.textContent('#reservationRangeLabel');
      assert(weekCols === 7 && weekLabel !== scopeNext.label, `1 hafta gorunumu donemi 7 gune cekmedi: ${JSON.stringify({ weekCols, weekLabel })}`);
      await page.evaluate(() => { document.getElementById('rezVillaFilter').value = 'ALL'; resetReservationRange(); });
      passed.push('21. rezervasyonlar: tek dönem + mülk seçicisi takvimi ve listeyi birlikte değiştirir');
      // L-198 (M28): gecmis ay toplu girisi formdan kaydedilir; takvimde gece
      // ve tutarli rozet, gun hucrelerine cizilmez.
      const bulkWrites = [];
      const cleaningAfterBulk = [];
      await page.route('**/rest/v1/bookings**', async route => {
        if (route.request().method() === 'POST') bulkWrites.push(route.request().postDataJSON());
        return route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, contentType: 'application/json', body: '[]' });
      });
      await page.route('**/rest/v1/cleaning_tasks**', async route => {
        if (route.request().method() === 'POST') cleaningAfterBulk.push(route.request().postDataJSON());
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });
      await page.evaluate(() => {
        appData.villas = { test: { id: '00000000-0000-4000-8000-000000000010', name: 'Test Villası', slug: 'test', isActive: true } };
        appData.bookings = [];
        updateAllVillaDropdowns();
        switchTab('reservations');
      });
      await page.click('[data-onclick="openBulkSummaryModal()"]');
      const bulkMonth = await page.evaluate(() => document.getElementById('bulkMonth').value);
      await page.selectOption('#bulkVilla', 'test');
      await page.selectOption('#bulkChannel', 'AIRBNB');
      await page.fill('#bulkNights', '18');
      await page.fill('#bulkGross', '144000');
      await page.fill('#bulkOta', '21600');
      await page.click('#bulkSummaryForm button[type="submit"]');
      await page.waitForFunction(() => !document.getElementById('bulkSummaryModal').classList.contains('active'), null, { timeout: 10000 });
      const bw = Array.isArray(bulkWrites[0]) ? bulkWrites[0][0] : bulkWrites[0];
      assert(bw && /^TOPLU AKTARIM — /.test(bw.guest_name) && bw.check_in === bulkMonth + '-01' && Number(bw.gross_amount) === 144000
        && bw.channel === 'AIRBNB' && bw.status === 'CHECKED_OUT' && cleaningAfterBulk.length === 0,
        `Toplu giris kaydi: ${JSON.stringify({ bulkMonth, bulkWrites, cleaningAfterBulk })}`);
      const bulkCalendar = await page.evaluate(m => {
        // Kayittan sonra veri bos sahte sunucudan yeniden yuklendi.
        appData.villas = { test: { id: '00000000-0000-4000-8000-000000000010', name: 'Test Villası', slug: 'test', isActive: true } };
        appData.bookings = [{ id: 'bulk-1', villa: 'test', propertyId: '00000000-0000-4000-8000-000000000010', guest: 'TOPLU AKTARIM — Test', checkIn: m + '-01', checkOut: m + '-19', gross: 144000, cleanFee: 0, otaComm: 21600, discount: 0, channel: 'AIRBNB', status: 'CHECKED_OUT' }];
        const r = reservationMonthRange(m);
        setReservationScopeRange(r.start, r.end);
        const c = document.getElementById('tapeChartContainer');
        return { note: c.querySelector('.tape-chart-note')?.textContent || '', booked: c.querySelectorAll('.tape-booked').length };
      }, bulkMonth);
      assert(/18 gece · ₺144\.000/.test(bulkCalendar.note) && bulkCalendar.booked === 0, `Takvim rozeti: ${JSON.stringify(bulkCalendar)}`);
      await page.evaluate(() => resetReservationRange());
      passed.push('22. geçmiş ay toplu girişi formdan kaydedilir; takvimde gece ve tutarlı rozet, günlere çizilmez');
      // L-215 (M44): Google Haritalar'in 15 ondalikli koordinati formu
      // "gecerli bir deger girin" ile durduruyordu.
      await page.evaluate(() => { switchTab('properties'); openPropertyModal('test'); });
      await page.fill('#propMapCoordinatesLink', '36.794852353716564, 28.24900388719855');
      const coord = await page.evaluate(() => ({
        lat: document.getElementById('propAnalysisLatitude').value, lng: document.getElementById('propAnalysisLongitude').value,
        valid: document.getElementById('propAnalysisLatitude').checkValidity() && document.getElementById('propAnalysisLongitude').checkValidity()
      }));
      assert(coord.lat === '36.794852' && coord.lng === '28.249004' && coord.valid, `Koordinat: ${JSON.stringify(coord)}`);
      await page.evaluate(() => closePropertyModal());
      // L-214 (M43): kanal ilani profilden kaydedilir ve Kanallar sekmesinde listelenir.
      const listingRpc = [];
      const listingRows = [];
      await page.route('**/rest/v1/rpc/save_property_channel_listing', async route => {
        const body = route.request().postDataJSON();
        listingRpc.push(body);
        listingRows.push({ id: '00000000-0000-4000-8000-000000000077', property_id: body.p_property_id, channel_code: body.p_channel_code, external_listing_id: body.p_external_listing_id, display_name: body.p_display_name, external_url: body.p_external_url, payout_currency: body.p_payout_currency, status: 'ACTIVE' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ listingId: '00000000-0000-4000-8000-000000000077', reused: false }) });
      });
      await page.route('**/rest/v1/property_channel_listings**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listingRows) }));
      await page.evaluate(() => openPropertyChannelForm('test'));
      await page.fill('#channelListingUrl', 'https://www.airbnb.com.tr/rooms/12345678?adults=2');
      await page.selectOption('#channelListingCurrency', 'EUR');
      await page.click('[data-onclick^="savePropertyChannelListing("]');
      await page.waitForFunction(() => /ID: 12345678/.test(document.getElementById('propertyProfileWorkspace').textContent), null, { timeout: 10000 });
      const channelText = await page.evaluate(() => document.getElementById('propertyProfileWorkspace').textContent);
      assert(listingRpc.length === 1 && listingRpc[0].p_external_listing_id === '12345678' && listingRpc[0].p_payout_currency === 'EUR'
        && /Airbnb/.test(channelText) && /Ödeme: EUR/.test(channelText) && /İlanı aç/.test(channelText),
        `Kanal ilani: ${JSON.stringify({ listingRpc, channelText: channelText.slice(0, 300) })}`);
      passed.push('24. mülkler: uzun koordinat formu durdurmaz; kanal ilanı bağlantıdan ID okunarak kaydedilir ve profilde listelenir');
      // L-217 (M46): Bugun ekraninda doluluk / ADR / RevPAR, ev ev secilebilir.
      await page.evaluate(() => { updateAllVillaDropdowns(); switchTab('executive'); renderTodayPerformance(); });
      const perfAll = await page.evaluate(() => ({ visible: !document.getElementById('todayPerformance').hidden && document.getElementById('todayPerformance').offsetHeight > 0, cards: document.querySelectorAll('#todayPerformanceCards .today-performance__card').length, options: [...document.getElementById('todayPerfVilla').options].map(o => o.value) }));
      assert(perfAll.visible && perfAll.cards === 5 && perfAll.options.includes('ALL') && perfAll.options.includes('test'), 'Bugun performans: ' + JSON.stringify(perfAll));
      await page.selectOption('#todayPerfVilla', 'test');
      const perfOne = await page.evaluate(() => document.getElementById('todayPerformancePeriod').textContent);
      assert(/Test Villası/.test(perfOne), 'Bugun mulk secimi: ' + perfOne);
      await page.selectOption('#todayPerfVilla', 'ALL');
      passed.push('25. Bugün: doluluk, ADR, RevPAR kartları; mülk seçici ev ev değiştirir');
      // G9 M47–M49 (L-218…L-220): talep ekrani — ek mulk adi okunur, hizli talep
      // pencerede kaydedilebilir (form gecerli), liste kanbanin yerinde acilir.
      await page.evaluate(() => {
        appData.villas.ikinci = { id: '00000000-0000-4000-8000-000000000011', name: 'İkinci Ev', slug: 'ikinci', isActive: true, capacity: 4 };
        appData.leads = [{ id: 'browser-lead', guest: 'Ad girilmedi (05339294514)', guestName: '', phone: '05339294514', villa: 'ALL', status: 'NEW', quote: 0, createdAt: getTodayStr() }];
        updateAllVillaDropdowns();
        switchTab('leads');
      });
      const picker = await page.evaluate(() => [...document.querySelectorAll('#leadQuickExtraProperties .lead-extra-property')].map(label => {
        const box = label.querySelector('input').getBoundingClientRect();
        const row = label.getBoundingClientRect();
        return { w: box.width, h: box.height, rowH: row.height, text: label.textContent.trim(), textW: row.right - box.right };
      }));
      assert(picker.length === 2 && picker.every(p => p.w <= 20 && p.h <= 20 && p.rowH <= 36 && p.text && p.textW > 30),
        'Ek mulk secimi: ' + JSON.stringify(picker));
      await page.click('#leadKanbanContainer [data-onclick^="editLead("]');
      const leadModal = await page.evaluate(() => ({
        active: document.getElementById('leadModal').classList.contains('active'),
        valid: document.getElementById('leadForm').checkValidity(),
        status: document.getElementById('leadStatus').value,
        villa: document.getElementById('leadVilla').value,
        guest: document.getElementById('leadGuest').value,
        quote: document.getElementById('leadQuote').value
      }));
      assert(leadModal.active && leadModal.valid && leadModal.status === 'NEW' && leadModal.villa === 'ALL' && leadModal.guest === '' && leadModal.quote === '',
        'Talep penceresi: ' + JSON.stringify(leadModal));
      await page.evaluate(() => closeLeadModal());
      await page.click('#leadViewList');
      const leadList = await page.evaluate(() => {
        const list = document.getElementById('leadLegacyListSection');
        const workspace = document.querySelector('.lead-workspace').getBoundingClientRect();
        const rect = list.getBoundingClientRect();
        return { visible: !list.hidden && rect.height > 0, inside: rect.top >= workspace.top && rect.bottom <= workspace.bottom,
          kanbanHidden: document.getElementById('leadKanbanContainer').hidden, text: document.getElementById('manageLeadsTableBody').textContent };
      });
      assert(leadList.visible && leadList.inside && leadList.kanbanHidden && /Yeni/.test(leadList.text) && /—/.test(leadList.text) && !/₺0/.test(leadList.text),
        'Talep listesi: ' + JSON.stringify(leadList));
      await page.click('#leadViewKanban');
      passed.push('26. talepler: ek mülk adı okunur; hızlı talep pencerede kaydedilebilir; liste kanbanın yerinde açılır');
      // G9 M50 (L-221): rezervasyondaki kisi Misafirler ekranindan deftere eklenir.
      const guestRpc = [];
      await page.route('**/rest/v1/rpc/upsert_booking_guest_atomic', async route => {
        const body = route.request().postDataJSON();
        guestRpc.push(body);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-0000000000e1', tenant_id: body.p_tenant_id, first_name: body.p_first_name, last_name: body.p_last_name, phone: body.p_phone, email: body.p_email }) });
      });
      await page.evaluate(() => {
        appData.guests = [];
        appData.bookings = [{ id: '00000000-0000-4000-8000-0000000000b1', villa: 'test', propertyId: appData.villas.test.id, guest: 'Onur Bey', phone: '0532 111 22 33', checkIn: getTodayStr(), checkOut: getTodayStr(), gross: 1000, channel: 'WHATSAPP', status: 'CONFIRMED' }];
        switchTab('guests');
      });
      await page.click('#guestDataNotice [data-onclick="toggleGuestUnlinkedPanel()"]');
      await page.waitForSelector('#guestUnlinkedPanel:not([hidden]) #guestLinkPhone_0');
      await page.click('#guestUnlinkedPanel [data-onclick="linkUnlinkedBookingGuest(0)"]');
      await page.waitForFunction(() => document.getElementById('guestUnlinkedPanel').hidden === true, null, { timeout: 10000 });
      const guestState = await page.evaluate(() => ({ linked: appData.bookings[0].primaryGuestId, guests: appData.guests.length }));
      assert(guestRpc.length === 1 && guestRpc[0].p_phone === '+905321112233' && guestRpc[0].p_first_name === 'Onur'
        && guestState.linked === '00000000-0000-4000-8000-0000000000e1' && guestState.guests === 1,
        'Rezervasyondan misafir: ' + JSON.stringify({ guestRpc, guestState }));
      passed.push('27. misafirler: rezervasyondaki kişi panelden telefonla deftere eklenir ve rezervasyona bağlanır');
      // Kullanici 19.10.2026: Finans'ta portfoy secilebilir; "+ Gelir Ekle" iki
      // secenek (rezervasyon formu / diger gelir), gelir aciklamasiyla kaydedilir.
      const incomePosts = [];
      await page.route('**/rest/v1/income_entries**', async route => {
        if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        const body = route.request().postDataJSON();
        incomePosts.push(body);
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-0000000000f1', ...body }) });
      });
      await page.evaluate(() => {
        appData.bookings = [];
        appData.expenses = [];
        appData.incomeEntries = [];
        appData.phase97SchemaReady = true;
        currentFilter.period = getTodayStr().slice(0, 7);
        switchTab('finance');
        handleFilterChange();
        document.getElementById('financeIncomeDisclosure').open = true;
      });
      await page.selectOption('#finTopVillaFilter', 'test');
      const portfoy = await page.evaluate(() => ({ villa: currentFilter.villa, global: document.getElementById('globalVillaFilter').value }));
      assert(portfoy.villa === 'test' && portfoy.global === 'test', 'Finans portfoy secici: ' + JSON.stringify(portfoy));
      await page.selectOption('#finTopVillaFilter', 'ALL');
      await page.click('[data-onclick="toggleIncomeAddMenu(event)"]');
      await page.click('#incomeAddMenu [data-onclick="startIncomeEntry(\'BOOKING\')"]');
      assert(await page.evaluate(() => document.getElementById('bookingModal').classList.contains('active')), 'Rezervasyon secenegi rezervasyon formunu acmadi');
      await page.evaluate(() => closeBookingModal());
      await page.click('[data-onclick="toggleIncomeAddMenu(event)"]');
      await page.click('#incomeAddMenu [data-onclick="startIncomeEntry(\'OTHER\')"]');
      await page.fill('#incAmount', '2500');
      await page.fill('#incDesc', 'Havalimanı transferi');
      await page.click('#incomeForm button[type="submit"]');
      await page.waitForFunction(() => (appData.incomeEntries || []).length === 1, null, { timeout: 10000 });
      const gelir = await page.evaluate(() => ({
        other: document.getElementById('incomeOtherVal').textContent,
        bridge: document.getElementById('brOtherIncome').textContent,
        stepVisible: !document.getElementById('brOtherIncomeStep').hidden,
        rows: document.querySelectorAll('#incomeEntriesBody [data-onclick^="deleteIncomeEntry("]').length,
        modalOpen: document.getElementById('incomeModal').classList.contains('active')
      }));
      assert(incomePosts.length === 1 && incomePosts[0].income_type === 'OTHER_INCOME' && incomePosts[0].description === 'Havalimanı transferi'
        && incomePosts[0].amount === 2500 && /2\.500 TL/.test(gelir.other) && /\+2\.500 TL/.test(gelir.bridge) && gelir.stepVisible
        && gelir.rows === 1 && !gelir.modalOpen, 'Gelir ekleme: ' + JSON.stringify({ incomePosts, gelir }));
      passed.push('28. finans: portföy seçilir; "+ Gelir Ekle" rezervasyon formunu ya da açıklamalı diğer gelir formunu açar, kâr köprüsüne girer');

      // Kullanici 19.10.2026 (Gorev 9.4): kesirli komisyon gecerli, vergi profili
      // formdan cikmadan eklenir, OTA'da kapora sorulmaz, listede donem payi ve
      // kesintiler, takvim buyur.
      const settingPosts = [];
      await page.route('**/rest/v1/tenant_settings**', async route => {
        if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        settingPosts.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      });
      await page.evaluate(() => { appData.tenantSettings = {}; switchTab('reservations'); openBookingModal(); });
      await page.selectOption('#resChannel', 'AIRBNB');
      await page.fill('#resGross', '40000');
      await page.fill('#resDiscount', '2500');
      await page.fill('#resCommissionRate', '15.5');
      const komisyon = await page.evaluate(() => ({
        value: document.getElementById('resCommission').value,
        valid: document.getElementById('resCommission').checkValidity(),
        depositHidden: getComputedStyle(document.getElementById('resDepositGroup')).display === 'none'
      }));
      assert(komisyon.value === '5812.5' && komisyon.valid && komisyon.depositHidden, 'Kesirli komisyon / OTA kaporasi: ' + JSON.stringify(komisyon));
      await page.check('#resTaxEnabled');
      await page.click('[data-onclick="openBookingTaxProfileCreator()"]');
      await page.fill('#resNewProfileName', 'Bodrum 2026');
      await page.selectOption('#resNewProfileDateBasis', 'checkIn');
      await page.fill('#resNewProfileFrom', '2026-01-01');
      await page.fill('#resNewProfileTo', '2026-12-31');
      for (const [key, rate, base] of [['vat', '10', 'both'], ['accommodation', '2', 'room']]) {
        await page.fill(`#resNewProfileRate_${key}`, rate);
        await page.selectOption(`#resNewProfileBase_${key}`, base);
        await page.selectOption(`#resNewProfileOther_${key}`, 'no');
      }
      await page.click('[data-onclick="saveBookingTaxProfileInline()"]');
      await page.waitForFunction(() => (appData.tenantSettings.booking_tax_profiles || []).length === 1, null, { timeout: 10000 });
      const profil = await page.evaluate(() => ({
        selected: document.getElementById('resTaxProfile').value,
        creatorHidden: document.getElementById('resTaxProfileCreator').hidden,
        gross: document.getElementById('resGross').value,
        modalOpen: document.getElementById('bookingModal').classList.contains('active')
      }));
      assert(settingPosts.length === 1 && settingPosts[0].key === 'booking_tax_profiles' && profil.selected === '0' && profil.creatorHidden
        && profil.gross === '40000' && profil.modalOpen, 'Satir ici vergi profili: ' + JSON.stringify({ settingPosts, profil }));
      await page.evaluate(() => closeBookingModal());
      await page.evaluate(() => {
        const r = reservationMonthRange(getTodayStr().slice(0, 7));
        const pid = appData.villas.test.id;
        appData.bookings = [
          { id: 'g94-ayse', villa: 'test', propertyId: pid, guest: 'TEST Ayşe', channel: 'AIRBNB', checkIn: r.start, checkOut: addDaysToDateKey(r.start, 3), gross: 40000, discount: 2500, cleanFee: 0, otaComm: 5812.5, status: 'CONFIRMED' },
          { id: 'g94-mehmet', villa: 'test', propertyId: pid, guest: 'TEST Mehmet', channel: 'WHATSAPP', checkIn: addDaysToDateKey(r.end, -1), checkOut: addDaysToDateKey(r.end, 3), gross: 40000, discount: 0, cleanFee: 0, otaComm: 0, status: 'CONFIRMED' }
        ];
        appData.cleaningTasks = [{ id: 'g94-t1', bookingId: 'g94-ayse', villa: 'test', date: addDaysToDateKey(r.start, 3), amount: 2500, status: 'PLANNED' }];
        appData.bookingPayments = []; appData.bookingPaymentBalances = [];
        resetReservationRange();
      });
      const liste = await page.evaluate(() => ({
        rows: document.getElementById('manageBookingsTableBody').textContent.replace(/\s+/g, ' '),
        pill: document.getElementById('rezTableSummaryPill').textContent
      }));
      assert(/29\.187,5 ₺/.test(liste.rows) && /Komisyon −5\.812,5 ₺/.test(liste.rows) && /Toplam 40\.000 ₺ · 2\/4 gece bu dönemde/.test(liste.rows)
        && /20\.000 ₺/.test(liste.rows) && /57\.500 TL/.test(liste.pill), 'Liste donem payi / kesintiler: ' + JSON.stringify(liste).slice(0, 700));
      const once = await page.evaluate(() => document.querySelector('#tapeChartContainer .tape-cell').getBoundingClientRect().height);
      await page.click('#tapeZoomBtn');
      const sonra = await page.evaluate(() => document.querySelector('#tapeChartContainer .tape-cell').getBoundingClientRect().height);
      await page.click('#tapeZoomBtn');
      assert(sonra >= 55 && sonra > once, `Takvim buyutme: ${once} -> ${sonra}`);
      await page.evaluate(() => openBookingDetailsPanel('g94-ayse'));
      const odeme = await page.evaluate(() => ({
        kinds: Array.from(document.querySelectorAll('#bookingPaymentKind option')).map(o => o.value),
        method: document.getElementById('bookingPaymentMethod').value
      }));
      assert(!odeme.kinds.includes('DEPOSIT') && odeme.method === 'OTA', 'OTA odeme takibi kapora sunmamali: ' + JSON.stringify(odeme));
      await page.evaluate(() => SidePanel.close && SidePanel.close());
      // Profil Ayarlar'da duzenlenir: ayni kimlik, yeni oran; yeni profil eklenmez.
      await page.evaluate(() => { switchTab('settings'); openSettingsSection('channels'); renderBookingFinanceSettings(); });
      await page.click('[data-onclick="editBookingTaxProfile(0)"]');
      await page.fill('#profileRate_vat', '20');
      await page.click('#profileSubmitBtn');
      await page.waitForFunction(() => appData.tenantSettings.booking_tax_profiles[0].vat.rate === '20', null, { timeout: 10000 });
      const duzenle = await page.evaluate(() => ({ count: appData.tenantSettings.booking_tax_profiles.length, list: document.querySelector('.booking-tax-profile-list').textContent }));
      assert(settingPosts.length === 2 && duzenle.count === 1 && /KDV %20/.test(duzenle.list), 'Profil duzenleme: ' + JSON.stringify({ duzenle, posts: settingPosts.length }));
      passed.push('29. rezervasyon (9.4): kesirli komisyon geçerli; vergi profili formdan eklenip seçilir, Ayarlar\'da düzenlenir; OTA\'da kapora yok; liste dönem payı ve kesintileri; takvim büyür');
    });

    await withPage(browser, baseUrl, 'owner', { width: 390, height: 844 }, async page => {
      await assertBookingFinance(page,true); passed.push('16. rezervasyon finansı 390 px mobil görünüm');
      await page.evaluate(() => { switchTab('executive'); renderTodayPerformance(); });
      await assertNoHorizontalOverflow(page, 'Bugun performans mobil');
      passed.push('25b. Bugün performans kartları 390 px mobilde taşmaz');
      // G9 L-207: teknik metin DSL'si yerine gercek gorsel checklist
      // duzenleyicisi mobilde bolum, onemli madde ve alt kontrolu korur.
      // Ayarlar sekmesi acilinca ekip, sablon ve talep kaynagi okumalari
      // buluta gider; fikstur oturumsuz oldugu icin 401 doner ve konsol
      // kapisi zamanlamaya bagli olarak kirmizi olurdu. Okumalar bos doner.
      await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.evaluate(() => {
        switchTab('settings');
        appData.settingsChecklistTemplates = [];
        renderSettingsTemplates();
      });
      await page.waitForSelector('#settingsChecklistTemplateForm', { state: 'visible' });
      await page.fill('#settingsChecklistName', 'Misafir öncesi tarayıcı kontrolü');
      await page.selectOption('#settingsChecklistType', 'CHECKIN_PREP');
      await page.selectOption('#settingsChecklistProperty', '00000000-0000-4000-8000-000000000010');
      await page.fill('[data-checklist-section-title]', 'Giriş');
      await page.fill('[data-checklist-item-text]', 'Kapı kodu denendi');
      await page.check('[data-checklist-important]');
      await page.click('[data-onclick^="addChecklistBuilderSubCheck"]');
      await page.fill('[data-checklist-sub] input', 'Kod misafir gibi denendi');
      const checklistDraft = await page.evaluate(() => ({
        draft: readSettingsChecklistBuilder(),
        suppliesHidden: document.getElementById('settingsChecklistSupplies').hidden,
        preview: document.getElementById('settingsChecklistMergePreview').textContent,
        labelled: [...document.querySelectorAll('#settingsChecklistTemplateForm input, #settingsChecklistTemplateForm select')]
          .every(control => !!control.closest('label') || (!!control.id && !!document.querySelector(`label[for="${control.id}"]`)))
      }));
      assert.strictEqual(checklistDraft.draft.sections[0].items[0].important, true);
      assert.deepStrictEqual(checklistDraft.draft.sections[0].items[0].subChecks, ['Kod misafir gibi denendi']);
      assert(checklistDraft.suppliesHidden && checklistDraft.labelled && checklistDraft.preview.includes('birleşme'),
        `Checklist mobil durumu: ${JSON.stringify(checklistDraft)}`);
      await assertNoHorizontalOverflow(page, 'zengin checklist mobil');
      await page.screenshot({ path: path.join(__dirname, '..', 'tmp', 'rich-checklist-mobile.png') });
      passed.push('23. zengin kontrol listesi görsel düzenleyicisi 390 px mobil görünüm');
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
