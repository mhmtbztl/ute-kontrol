'use strict';

/**
 * A5-G6 UCTAN UCA IS AKISI TURU (L-145, A5 denetimi 03.10.2026).
 *
 * browser_quality_gate.js bellek ici fiksturde ekranlarin ACILDIGINI olcer.
 * Bu tur ise PLAN bolum 0'daki 8 is akisini TEST projesinde, gercek
 * tarayicida, dugmelerin cagirdigi ayni fonksiyonlarla YAZARAK yurutur ve her
 * adimin sonucunu veritabanindan dogrular:
 *
 *   1 rezervasyon + odeme          5 ay kapanisi
 *   2 temizlik Z (personel) / M     6 talep -> teklif -> rezervasyon (satis)
 *   3 gider                         7 ariza -> cozum -> gider
 *   4 finans = sunucu defteri       8 rol sinirlari (satis, personel, izleyici)
 *
 * Her akis bagimsiz raporlanir; biri kirilirsa tur devam eder ve sonunda 1 ile
 * cikar. Fikstur kendi kurulur ve `finally` icinde silinir.
 *
 *   LEXBNB_ALLOW_DESTRUCTIVE_TESTS=1 LEXBNB_CONFIRM_REMOTE_TEST_PROJECT=<host> \
 *     node scripts/a5_e2e_flow_tour.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const { loadTestEnv } = require('../core/test_env.js');

const env = loadTestEnv(); // Uretim kara listede; onay degiskenleri zorunlu.
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const runtime = path.join(os.tmpdir(), 'lexbnb-a4-browser-runtime');
const port = 39007;
const stamp = Date.now();
const password = `E2e!Tour${stamp}`;

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function chromePath() {
  return [
    process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium',
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean).find(candidate => fs.existsSync(candidate));
}

// Europe/Istanbul gunu ve onceki ayin anahtarlari (uygulamanin getTodayStr kurali).
function istanbulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
const today = istanbulToday();
const lastMonthDate = addDays(`${today.slice(0, 7)}-01`, -1);
const lastMonth = lastMonthDate.slice(0, 7);
const [lastYear, lastMonthNo] = lastMonth.split('-').map(Number);

async function waitFor(label, fn, timeout = 40000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await fn();
    if (last) return last;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`${label}: ${timeout} ms icinde gerceklesmedi`);
}

const fixture = { users: [], tenantId: null };

async function setupFixture() {
  for (const role of ['owner', 'sales', 'staff', 'viewer']) {
    const email = `a5_e2e_${role}_${stamp}@lexbnb-e2e.test`;
    const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `${role} kullanicisi`);
    fixture.users.push({ id: created.user.id, email, role });
  }
  const byRole = Object.fromEntries(fixture.users.map(user => [user.role, user]));
  const ownerClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
  must(await ownerClient.auth.signInWithPassword({ email: byRole.owner.email, password }), 'sahip girisi');
  fixture.tenantId = must(await ownerClient.rpc('create_tenant_and_owner', { p_company_name: `A5 Uctan Uca ${stamp}`, p_full_name: 'A5 Sahip' }), 'isletme').tenant_id;
  await ownerClient.auth.signOut();
  must(await admin.from('tenant_members').insert([
    { tenant_id: fixture.tenantId, user_id: byRole.sales.id, role: 'sales' },
    { tenant_id: fixture.tenantId, user_id: byRole.staff.id, role: 'staff' },
    { tenant_id: fixture.tenantId, user_id: byRole.viewer.id, role: 'viewer' }
  ]), 'uyelikler');
  // Faaliyet baslangici gecen aydan once: kapasite ve kapanis o ayi kapsar.
  fixture.property = must(await admin.from('properties').insert({
    tenant_id: fixture.tenantId, name: 'A5 Tur Villasi', slug: `a5-e2e-${stamp}`,
    base_price: 10000, clean_cost: 1500, activated_on: `${lastMonth}-01`
  }).select().single(), 'mulk');
  fixture.cleaner = must(await admin.from('operational_people').insert({
    tenant_id: fixture.tenantId, kind: 'CLEANER', full_name: 'A5 Temizlikci', user_id: byRole.staff.id
  }).select().single(), 'temizlikci');
}

async function cleanupFixture() {
  const errors = [];
  if (fixture.tenantId) {
    const { error } = await admin.from('tenants').delete().eq('id', fixture.tenantId);
    if (error) errors.push(`isletme: ${error.message}`);
  }
  for (const user of fixture.users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error && !/not found/i.test(error.message || '')) errors.push(`${user.role}: ${error.message}`);
  }
  if (errors.length) throw new Error(`Fikstur temizligi tamamlanamadi:\n${errors.join('\n')}`);
}

async function openSession(browser, role) {
  const user = fixture.users.find(item => item.role === role);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const state = { errors: [], toasts: [], dialogs: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  // confirm -> kabul; prompt -> siradaki cevap (yoksa varsayilan).
  page.on('dialog', async dialog => {
    state.messages = (state.messages || []).concat(dialog.type() + ': ' + dialog.message().slice(0, 160));
    if (dialog.type() === 'prompt') {
      const next = state.dialogs.length ? state.dialogs.shift() : dialog.defaultValue();
      await dialog.accept(String(next));
    } else {
      await dialog.accept();
    }
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForSelector('#securityLockOverlay', { state: 'visible' });
  await page.fill('#saasLoginUser', user.email);
  await page.fill('#saasLoginPass', password);
  await page.click('#saasLoginSubmitBtn');
  await page.waitForSelector('#securityLockOverlay', { state: 'hidden', timeout: 30000 });
  await page.waitForFunction(expected => typeof activeTenant !== 'undefined' && activeTenant?.role === expected, role);
  // Giris ekrani kapanir kapanmaz isletme verisi hala yukleniyor olabilir;
  // mulk ve (satista) talep kaynagi listesi dolmadan form doldurmak secimi
  // bos birakir ve form sessizce gonderilmez.
  if (role !== 'staff') {
    await page.waitForFunction(needsSources => typeof appData !== 'undefined'
      && Object.keys(appData.villas || {}).length > 0
      && (!needsSources || (appData.leadSources || []).length > 0), ['owner', 'sales'].includes(role), { timeout: 40000 });
  }
  // Toast metinlerini topla: "kaydedilemedi" gibi hata toast'lari akisi kirar.
  await page.evaluate(() => {
    window.__toasts = [];
    const original = window.showToast;
    window.showToast = function (message, type) { window.__toasts.push({ message: String(message), type: type || 'info' }); return original ? original.apply(this, arguments) : undefined; };
  });
  const session = { context, page, state, role };
  sessions.push(session);
  context.on('close', () => { session.closed = true; });
  return session;
}

async function errorToasts(page) {
  return page.evaluate(() => (window.__toasts || []).filter(t => t.type === 'error').map(t => t.message));
}

const results = [];
const sessions = [];
// Kirilan akista kullanicinin gordugu uyari ve hata mesajlari raporlanir.
async function sessionNotes() {
  const notes = [];
  for (const session of sessions) {
    const toasts = session.closed ? [] : await errorToasts(session.page).catch(() => []);
    const messages = session.state.messages || [];
    if (messages.length || toasts.length) notes.push(session.role + ': ' + messages.concat(toasts).join(' | '));
    session.state.messages = [];
    if (!session.closed) await session.page.evaluate(() => { window.__toasts = []; }).catch(() => {});
  }
  return notes;
}
async function flow(name, fn) {
  try {
    await fn();
    await sessionNotes();
    results.push({ name, ok: true });
    console.log(`[PASS] ${name}`);
  } catch (error) {
    const notes = await sessionNotes();
    results.push({ name, ok: false, error: error.message });
    console.error(`[FAIL] ${name}\n  ${error.message}${notes.length ? `\n  ekranda: ${notes.join('\n  ')}` : ''}`);
  }
}

async function main() {
  const executablePath = chromePath();
  if (!executablePath) throw new Error('Chrome/Edge bulunamadi.');
  execFileSync(process.execPath, [path.join(__dirname, 'prepare_a4_browser_runtime.js')], { stdio: 'ignore', env: process.env });
  await setupFixture();
  const server = spawn(process.execPath, ['server.js'], { cwd: runtime, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Yerel sunucu baslamadi')), 10000);
    server.stdout.on('data', chunk => { if (String(chunk).includes('running at')) { clearTimeout(timer); resolve(); } });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Sunucu kapandi: ${code}`)); });
  });
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const tenantId = fixture.tenantId;
  const villaKey = fixture.property.slug;
  let bookingA = null; // gecen ay: odeme + kapanis
  try {
    const owner = await openSession(browser, 'owner');
    const p = owner.page;

    await flow('1. Rezervasyon (form) + ödeme kaydı', async () => {
      const checkIn = `${lastMonth}-10`, checkOut = `${lastMonth}-13`;
      await p.evaluate(({ villaKey, checkIn, checkOut }) => {
        openBookingModal();
        document.getElementById('resVilla').value = villaKey;
        document.getElementById('resGuest').value = 'Tur Misafiri A';
        document.getElementById('resGross').value = '30000';
        document.getElementById('resPax').value = '2';
        refreshBookingChannelDropdown('WHATSAPP');
        document.getElementById('resChannel').value = 'WHATSAPP';
        setResDateRange(checkIn, checkOut);
        handleBookingChannelChange();
        document.getElementById('bookingForm').requestSubmit();
      }, { villaKey, checkIn, checkOut });
      const invalidBooking = await p.evaluate(() => [...document.querySelectorAll('#bookingForm :invalid')].map(el => el.id + ': ' + el.validationMessage).join(', '));
      bookingA = await waitFor('rezervasyon satiri' + (invalidBooking ? ' (geçersiz alan: ' + invalidBooking + ')' : ''), async () => {
        const { data } = await admin.from('bookings').select('id,gross_amount,check_in,check_out').eq('tenant_id', tenantId).eq('check_in', checkIn).maybeSingle();
        return data;
      });
      const task = await waitFor('rezervasyonun temizlik gorevi', async () => {
        const { data } = await admin.from('cleaning_tasks').select('id,status,task_date,amount').eq('tenant_id', tenantId).eq('booking_id', bookingA.id).maybeSingle();
        return data;
      });
      assert.strictEqual(task.task_date, checkOut, 'Temizlik çıkış gününe planlanmalı');
      await p.waitForFunction(id => (appData.bookings || []).some(b => (b.dbId || b.id) === id), bookingA.id, { timeout: 20000 });
      const saved = await p.evaluate(async ({ bookingId, paidOn }) => {
        const local = appData.bookings.find(b => (b.dbId || b.id) === bookingId);
        openBookingDetailsPanel(local.id);
        document.getElementById('bookingPaymentAmount').value = '10000';
        document.getElementById('bookingPaymentDate').value = paidOn;
        document.getElementById('bookingPaymentKind').value = 'DEPOSIT';
        return saveBookingPayment(bookingId);
      }, { bookingId: bookingA.id, paidOn: `${lastMonth}-05` });
      assert.strictEqual(saved, true, `Ödeme kaydedilmedi: ${(await errorToasts(p)).join(' | ')}`);
      const payments = must(await admin.from('booking_payments').select('amount').eq('booking_id', bookingA.id), 'odemeler');
      assert.deepStrictEqual(payments.map(x => Number(x.amount)), [10000]);
    });

    await flow('2a. Geçen ayın planlı temizliği Operasyon ekranında görünür (L-130)', async () => {
      assert(bookingA, 'akış 1 kırık');
      const visible = await p.evaluate(() => { switchTab('operations'); setOperationsView('cleaning'); return document.getElementById('opsCombinedContainer').textContent; });
      assert(visible.includes('A5 Tur Villası') || visible.includes('A5 Tur Villasi'), 'Geçmiş tarihli temizlik hiçbir grupta yok — ay sonu denetimi yapılamaz (L-130, Codex)');
    });

    let bookingB = null, taskB = null, executionId = null;
    await flow('2b. Temizlik: atama → personel Z imzası → yönetici M onayı → gider', async () => {
      // Bugun cikisli ikinci rezervasyon telefondan hizli formla (L-77 yolu).
      const checkIn = addDays(today, -2);
      await p.evaluate(({ villaKey, checkIn, checkOut }) => {
        openQuickBookingModal();
        document.getElementById('quickBookingVilla').value = villaKey;
        document.getElementById('quickBookingGuest').value = 'Tur Misafiri B';
        document.getElementById('quickBookingGross').value = '20000';
        document.getElementById('quickBookingPax').value = '2';
        document.getElementById('quickBookingCheckIn').value = checkIn;
        document.getElementById('quickBookingCheckOut').value = checkOut;
        document.getElementById('quickBookingForm').requestSubmit();
      }, { villaKey, checkIn, checkOut: today });
      bookingB = await waitFor('hizli rezervasyon satiri', async () => {
        const { data } = await admin.from('bookings').select('id').eq('tenant_id', tenantId).eq('check_in', checkIn).maybeSingle();
        return data;
      });
      taskB = await waitFor('bugunku temizlik gorevi', async () => {
        const { data } = await admin.from('cleaning_tasks').select('id').eq('booking_id', bookingB.id).maybeSingle();
        return data;
      });
      await p.waitForFunction(id => (appData.cleaningTasks || []).some(t => (t.dbId || t.id) === id), taskB.id, { timeout: 20000 });
      const assigned = await p.evaluate(async ({ taskId, personId }) => {
        switchTab('operations'); setOperationsView('cleaning');
        const local = appData.cleaningTasks.find(t => (t.dbId || t.id) === taskId);
        const select = document.getElementById(`opsCleaner-${local.id}`);
        if (!select) return 'atama seçicisi ekranda yok';
        select.value = personId;
        return assignCleaningTaskFromSelect(local.id);
      }, { taskId: taskB.id, personId: fixture.cleaner.id });
      assert.strictEqual(assigned, true, `Atama: ${assigned} ${(await errorToasts(p)).join(' | ')}`);
      const execution = await waitFor('icra kaydi', async () => {
        const { data } = await admin.from('cleaning_task_executions').select('id,status').eq('cleaning_task_id', taskB.id).maybeSingle();
        return data;
      });
      executionId = execution.id;

      const staff = await openSession(browser, 'staff');
      try {
        const signed = await staff.page.evaluate(async id => {
          await loadStaffFieldWork();
          if (!document.getElementById('staffFieldWorkContainer').textContent.includes('A5 Tur')) return 'personel bugünkü temizliği görmüyor';
          return signStaffCleaningDone(id);
        }, executionId);
        assert.strictEqual(signed, true, `Z imzası: ${signed} ${(await errorToasts(staff.page)).join(' | ')}`);
      } finally { await staff.context.close(); }
      const afterZ = must(await admin.from('cleaning_task_executions').select('status').eq('id', executionId).single(), 'Z sonrasi');
      assert.strictEqual(afterZ.status, 'CLEANED');

      await p.evaluate(() => loadTenantAppData(getActiveTenantId()));
      const inspected = await p.evaluate(async id => {
        switchTab('operations'); setOperationsView('cleaning');
        if (!document.getElementById('opsCombinedContainer').innerHTML.includes(id)) return 'M onay düğmesi ekranda yok';
        return inspectCleaningExecution(id, true);
      }, executionId);
      assert.strictEqual(inspected, true, `M onayı: ${inspected} ${(await errorToasts(p)).join(' | ')}`);
      const task = must(await admin.from('cleaning_tasks').select('status,amount').eq('id', taskB.id).single(), 'gorev');
      assert.strictEqual(task.status, 'DONE', 'Denetimden sonra temizlik DONE (gider) olmalı');
    });

    await flow('3. Gider kaydı (form)', async () => {
      await p.evaluate(({ villaKey, date }) => {
        openExpenseModal();
        document.getElementById('expType').value = 'OPEX';
        const category = document.getElementById('expCategory');
        category.value = [...category.options].map(o => o.value).find(v => v && !/reklam/i.test(v)) || category.value;
        document.getElementById('expVilla').value = villaKey;
        document.getElementById('expDate').value = date;
        document.getElementById('expAmount').value = '2500';
        document.getElementById('expDesc').value = 'A5 tur gideri';
        document.getElementById('expenseForm').requestSubmit();
      }, { villaKey, date: `${lastMonth}-15` });
      const expense = await waitFor('gider satiri', async () => {
        const { data } = await admin.from('expenses').select('amount').eq('tenant_id', tenantId).eq('description', 'A5 tur gideri').maybeSingle();
        return data;
      });
      assert.strictEqual(Number(expense.amount), 2500);
    });

    await flow('4. Finans ekranı = sunucu defteri (geçen ay)', async () => {
      const result = await p.evaluate(async month => {
        await loadTenantAppData(getActiveTenantId());
        const select = document.getElementById('globalPeriodFilter');
        if (![...select.options].some(o => o.value === month)) select.insertAdjacentHTML('beforeend', `<option value="${month}">${month}</option>`);
        select.value = month;
        handleFilterChange();
        switchTab('finance');
        await refreshExecutiveDashboardSnapshot(true);
        renderFinanceModule();
        return { screen: document.getElementById('finActualRevenue').textContent, server: executiveSnapshotState.current, period: currentFilter.period };
      }, lastMonth);
      assert.strictEqual(result.period, lastMonth);
      assert(result.server, 'Sunucu anlık görüntüsü gelmedi');
      const screen = Number(String(result.screen).replace(/[^0-9-]/g, ''));
      assert.strictEqual(screen, Math.round(Number(result.server.room_revenue)), `Ekran ${result.screen} ≠ sunucu ${result.server.room_revenue}`);
      assert.strictEqual(screen, 30000, 'Geçen ayın net konaklama cirosu 30.000 olmalı');
    });

    await flow('5. Ay kapanışı (geçen ay)', async () => {
      const message = await p.evaluate(async () => {
        openMonthCloseModal();
        await submitMonthClose();
        const err = document.getElementById('monthCloseError');
        return err && err.style.display !== 'none' ? err.textContent : '';
      });
      assert.strictEqual(message, '', `Kapanış reddedildi: ${message}`);
      const close = must(await admin.from('monthly_financial_closes').select('status').eq('tenant_id', tenantId).eq('year', lastYear).eq('month', lastMonthNo).maybeSingle(), 'kapanis');
      assert(close && close.status === 'CLOSED', 'monthly_financial_closes kaydı CLOSED değil');
    });

    await flow('6. Talep → teklif → rezervasyon (satış rolü)', async () => {
      const sales = await openSession(browser, 'sales');
      try {
        const sp = sales.page;
        const phone = `+90555${String(stamp).slice(-7)}`;
        await sp.evaluate(({ phone, propertyId }) => {
          switchTab('leads');
          document.getElementById('leadQuickPhone').value = phone;
          document.getElementById('leadQuickGuestName').value = 'Tur Talebi';
          // "Telefon" (hizli form) duzenleme formunda "Phone"dur; o kanalla
          // acilan talep duzenlemede bos kanalla acilir (HATALAR L-151, Codex).
          document.getElementById('leadQuickChannel').value = 'WhatsApp';
          const source = document.getElementById('leadQuickSource');
          source.value = [...source.options].map(o => o.value).find(Boolean) || '';
          const property = document.getElementById('leadQuickProperty');
          if ([...property.options].some(o => o.value === propertyId)) property.value = propertyId;
          document.getElementById('leadQuickCaptureForm').requestSubmit();
        }, { phone, propertyId: fixture.property.id });
        const lead = await waitFor('talep satiri', async () => {
          const { data } = await admin.from('leads').select('id,status').eq('tenant_id', tenantId).eq('guest_phone', phone).maybeSingle();
          return data;
        });
        await sp.waitForFunction(id => (appData.leads || []).some(l => (l.dbId || l.id) === id), lead.id, { timeout: 20000 });
        await sp.evaluate(id => {
          const local = appData.leads.find(l => (l.dbId || l.id) === id);
          editLead(local.id);
          document.getElementById('leadStatus').value = 'QUOTE_SENT';
          document.getElementById('leadQuote').value = '18000';
          document.getElementById('leadForm').requestSubmit();
        }, lead.id);
        const invalid = await sp.evaluate(() => [...document.querySelectorAll('#leadForm :invalid')].map(el => `${el.id}: ${el.validationMessage}`).join(', '));
        await waitFor(`teklif durumu${invalid ? ` (geçersiz alan: ${invalid})` : ''}`, async () => {
          const { data } = await admin.from('leads').select('status').eq('id', lead.id).single();
          return data.status === 'QUOTE_SENT';
        });
        const checkIn = addDays(today, 20), checkOut = addDays(today, 23);
        sales.state.dialogs.push(checkIn, checkOut, '2');
        const converted = await sp.evaluate(async id => {
          await loadLeads(getActiveTenantId());
          const local = appData.leads.find(l => (l.dbId || l.id) === id);
          return convertLeadAction(local.id);
        }, lead.id);
        assert.notStrictEqual(converted, false, `Dönüştürme: ${(await errorToasts(sp)).join(' | ')}`);
        const won = await waitFor('kazanilan talep', async () => {
          const { data } = await admin.from('leads').select('status').eq('id', lead.id).single();
          return data.status === 'WON' ? data : null;
        });
        assert(won);
        const booking = must(await admin.from('bookings').select('id').eq('tenant_id', tenantId).eq('check_in', checkIn).maybeSingle(), 'talepten rezervasyon');
        assert(booking, 'Talepten rezervasyon oluşmadı');
      } finally { await sales.context.close(); }
    });

    await flow('7. Arıza → çözüm → gider', async () => {
      await p.evaluate(villaKey => {
        openMaintModal();
        document.getElementById('maintVilla').value = villaKey;
        document.getElementById('maintTitle').value = 'Tur arızası';
        document.getElementById('maintForm').requestSubmit();
      }, villaKey);
      const ticket = await waitFor('ariza satiri', async () => {
        const { data } = await admin.from('maintenance_tickets').select('id').eq('tenant_id', tenantId).eq('title', 'Tur arızası').maybeSingle();
        return data;
      });
      await p.waitForFunction(id => (appData.maintenanceTickets || []).some(t => t.id === id), ticket.id, { timeout: 20000 });
      owner.state.dialogs.push('750');
      const resolved = await p.evaluate(id => resolveMaintenanceFromOperations(id), ticket.id);
      const row = must(await admin.from('maintenance_tickets').select('status').eq('id', ticket.id).single(), 'ariza');
      assert.strictEqual(row.status, 'RESOLVED', 'Arıza çözülmedi');
      const expense = must(await admin.from('expenses').select('amount').eq('tenant_id', tenantId).eq('description', 'Bakım gideri: Tur arızası').maybeSingle(), 'bakim gideri');
      assert(expense && Number(expense.amount) === 750, 'Bakım gideri yazılmadı');
      assert.strictEqual(resolved, true, `Arıza çözüldü ama kullanıcıya hata gösterildi: ${(await errorToasts(p)).join(' | ')}`);
    });

    await flow('8. Rol sınırları: satış finansı, personel menüyü, izleyici yazmayı göremez', async () => {
      const sales = await openSession(browser, 'sales');
      try {
        const s = await sales.page.evaluate(() => ({
          financeHidden: document.querySelector(".tab-btn[data-onclick=\"switchTab('finance')\"]").hidden,
          financeReport: openPageReport('FINANCE'),
          leadCount: (appData.expenses || []).length
        }));
        assert(s.financeHidden && s.financeReport === false, 'Satış finans sekmesini/raporunu görüyor');
        assert.strictEqual(s.leadCount, 0, 'Satış rolü gider kayıtlarını okuyor');
      } finally { await sales.context.close(); }
      const staff = await openSession(browser, 'staff');
      try {
        const s = await staff.page.evaluate(() => ({ nav: document.querySelector('.nav-tabs').hidden, bookings: (appData.bookings || []).length }));
        assert(s.nav, 'Personel menüyü görüyor');
        assert.strictEqual(s.bookings, 0, 'Personel rezervasyon defterini okuyor');
      } finally { await staff.context.close(); }
      const viewer = await openSession(browser, 'viewer');
      try {
        const v = await viewer.page.evaluate(async tenantId => {
          const { error } = await supabaseClient.from('expenses').insert({ tenant_id: tenantId, amount: 1, category: 'Diğer', expense_date: getTodayStr(), description: 'izleyici' });
          return { quick: document.getElementById('mobileQuickBookingBtn').hidden, insertError: !!error };
        }, tenantId);
        assert(v.quick && v.insertError, 'İzleyici yazabiliyor');
      } finally { await viewer.context.close(); }
    });

    if (owner.state.errors.length) console.error(`[WARN] sahip oturumu çalışma zamanı hataları: ${owner.state.errors.join(' | ')}`);
    await owner.context.close();
  } finally {
    await browser.close();
    server.kill();
    await cleanupFixture();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\nTEST SUMMARY: ${results.length - failed.length} / ${results.length} TESTS PASSED (${failed.length} FAILED)`);
  if (failed.length) process.exit(1);
}

main().catch(async error => {
  console.error(error.stack || error.message);
  try { await cleanupFixture(); } catch (cleanupError) { console.error(cleanupError.message); }
  process.exit(1);
});
