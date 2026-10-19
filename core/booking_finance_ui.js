/* Reservation finance UI; persisted state lives in bookings.financial_details.
 * No fiscal defaults: profiles and collection/liability choices are explicit. */
let bookingFinanceDraft = null;
let bookingFinanceCommissionMode = 'rate';
let bookingCleaningIsManual = false;
const financeEl = id => document.getElementById(id);
const financeValue = id => financeEl(id)?.value ?? '';
const financeSet = (id, value) => { if (financeEl(id)) financeEl(id).value = value ?? ''; };
const financeText = (id, value) => { if (financeEl(id)) financeEl(id).textContent = value; };

function bookingTaxRowsHtml() {
  return [['vat','KDV'],['accommodation','Konaklama vergisi']].map(([key,label]) => `<fieldset class="booking-tax-card"><legend>${escapeHtml(label)}</legend>
    <p id="financeTaxResult_${key}" class="field-note">—</p>
    <div class="finance-manual-tax"><label for="financeTaxAmount_${key}">Manuel vergi tutarı (₺)</label><input id="financeTaxAmount_${key}" type="number" min="0" step="0.01" data-oninput="calculateLivePreview()">
    <label for="financeCleaningTax_${key}">Bu verginin temizlik gelirine ait payı (₺)</label><input id="financeCleaningTax_${key}" type="number" min="0" step="0.01" data-oninput="calculateLivePreview()"></div>
    <label for="financeCollector_${key}">Vergiyi kim tahsil ediyor?</label><select id="financeCollector_${key}" data-onchange="toggleBookingFinanceSections()"><option value="">Seçin</option><option value="none">İşletmem</option><option value="all">Rezervasyon platformu</option><option value="split">Bir kısmını platform, bir kısmını işletmem</option></select>
    <label class="finance-collector-split" for="financeCollected_${key}">Platformun tahsil ettiği tutar (₺)</label><input class="finance-collector-split" id="financeCollected_${key}" type="number" min="0" step="0.01" data-oninput="calculateLivePreview()">
    <label for="financeLiability_${key}">Vergiyi ödeme yükümlülüğü</label><select id="financeLiability_${key}" data-onchange="toggleBookingFinanceSections()"><option value="">Seçin</option><option value="all">Tamamı işletmemde</option><option value="none">Tamamı platformda</option><option value="split">Paylaşımlı</option></select>
    <label class="finance-liability-split" for="financeLiabilityAmount_${key}">İşletmeme ait yükümlülük (₺)</label><input class="finance-liability-split" id="financeLiabilityAmount_${key}" type="number" min="0" step="0.01" data-oninput="calculateLivePreview()">
  </fieldset>`).join('');
}

function initBookingFinanceForm(booking) {
  if (!financeEl('resTaxEnabled')) return;
  bookingFinanceDraft = booking?.financialDetails ? JSON.parse(JSON.stringify(booking.financialDetails.input)) : null;
  bookingFinanceCommissionMode = bookingFinanceDraft?.commissionMode || (booking ? 'amount' : 'rate');
  bookingCleaningIsManual = !!booking;
  financeEl('resTaxRows').innerHTML = bookingTaxRowsHtml();
  fillBookingTaxProfileOptions();
  closeBookingTaxProfileCreator();
  const tax = bookingFinanceDraft?.tax || { enabled: false };
  financeEl('resTaxEnabled').checked = tax.enabled === true;
  financeSet('resTaxMode', tax.mode || 'inclusive');
  financeSet('resTaxProfile', tax.profile ? 'saved' : '');
  financeSet('resInvoiceDate', bookingFinanceDraft?.invoiceDate);
  financeSet('resDiscount', booking?.discount || 0);
  if (bookingFinanceDraft) {
    financeSet('resGross', bookingFinanceDraft.amount);
    financeSet('resCleanFee', bookingFinanceDraft.cleanFee);
    financeSet('resCleanCost', booking?.cleanCost ?? bookingFinanceDraft.cleanCost);
    financeSet('resCommissionRate', bookingFinanceDraft.commissionRate);
  }
  for (const key of ['vat','accommodation']) {
    const t = tax[key] || {};
    financeSet('financeTaxAmount_'+key, t.amount);
    financeSet('financeCleaningTax_'+key, t.cleaningAmount);
    for (const [source,select,input] of [['platformCollected','financeCollector_','financeCollected_'],['businessLiability','financeLiability_','financeLiabilityAmount_']]) {
      const v = t[source];
      financeSet(select+key, v === undefined ? '' : ['all','none'].includes(v) ? v : 'split');
      financeSet(input+key, typeof v === 'number' || (v !== undefined && !['all','none'].includes(v)) ? v : '');
    }
  }
  const extras = bookingFinanceDraft?.extras || [];
  // A posted expense may subsequently have been edited in the expense ledger.
  extras.forEach(e => {
    const posted = (appData.expenses || []).find(x => (x.legacyId || x.legacy_id) === `BF:${booking.id}:${e.id}`);
    if (posted) { e.amount = posted.amount; e.name = posted.description || e.name; e.posted = true; }
  });
  financeEl('resExtrasEnabled').checked = extras.length > 0;
  financeEl('resExtraRows').innerHTML = extras.map(bookingExtraRowHtml).join('');
  financeEl('resPostExpenses').hidden = !(booking && extras.length && canManageTenantRole(activeTenant?.role));
  financeSet('resExpensePostDate','');
  if (!booking) handleBookingPropertyFinanceChange();
  toggleBookingFinanceSections();
}

function fillBookingTaxProfileOptions() {
  const profiles = appData.tenantSettings?.booking_tax_profiles || [];
  financeEl('resTaxProfile').innerHTML = '<option value="">Profil seçin</option>'
    + (bookingFinanceDraft?.tax?.profile ? '<option value="saved">Rezervasyona kaydedilen profil</option>' : '')
    + profiles.map((p,i) => `<option value="${i}">${escapeHtml(p.name)} · ${escapeHtml(p.validFrom)} – ${escapeHtml(p.validTo)}</option>`).join('');
}

// Vergi profili rezervasyon formundan ayrilmadan eklenir (M55, Gorev 9.4.1):
// eskiden profil yalniz Ayarlar'da aciliyordu ve formdan cikinca girilen her
// alan kayboluyordu. Ic ice <form> olamayacagi icin alanlar "required"
// tasimaz (gizli zorunlu alan rezervasyon kaydini kilitlerdi); dogrulama
// Ayarlar'daki formla ayni okuyucudan (readBookingTaxProfileForm) gecer.
function openBookingTaxProfileCreator() {
  const host = financeEl('resTaxProfileCreator'); if (!host) return false;
  host.hidden = false;
  if (!canManageTenantRole(activeTenant?.role)) {
    host.innerHTML = '<p class="field-note">Vergi profilini yalnız işletme yöneticileri tanımlayabilir. Yöneticinizden Ayarlar → Kanallar bölümünde profil eklemesini isteyin.</p>';
    return false;
  }
  host.innerHTML = `<fieldset class="booking-tax-profile-creator" data-onkeydown="handleBookingTaxProfileCreatorKey(event)"><legend>Yeni vergi profili</legend>${bookingTaxProfileFieldsHtml('resNewProfile', false)}
    <p id="resNewProfileError" role="alert" class="text-negative"></p>
    <div class="booking-tax-profile-actions"><button type="button" class="btn btn-primary" data-onclick="saveBookingTaxProfileInline()">Profili kaydet ve seç</button>
    <button type="button" class="btn btn-secondary" data-onclick="closeBookingTaxProfileCreator()">Vazgeç</button></div>
    <p class="field-note">Profil işletme ayarlarına kaydedilir (Ayarlar → Kanallar); rezervasyon formuna girdiğiniz bilgiler korunur.</p></fieldset>`;
  financeEl('resNewProfileName')?.focus?.();
  return true;
}
// Profil alaninda Enter rezervasyon formunu gondermesin; profili kaydeder.
function handleBookingTaxProfileCreatorKey(event) {
  if (event?.key !== 'Enter' || event.target?.tagName === 'BUTTON') return;
  event.preventDefault();
  saveBookingTaxProfileInline();
}
function closeBookingTaxProfileCreator() {
  const host = financeEl('resTaxProfileCreator'); if (!host) return;
  host.hidden = true; host.innerHTML = '';
}
async function saveBookingTaxProfileInline() {
  try {
    const profiles = await appendBookingTaxProfile(readBookingTaxProfileForm('resNewProfile'));
    fillBookingTaxProfileOptions();
    financeSet('resTaxProfile', String(profiles.length - 1));
    closeBookingTaxProfileCreator();
    renderBookingFinanceSettings();
    calculateLivePreview();
    return true;
  } catch (e) {
    financeText('resNewProfileError', 'Vergi profili kaydedilemedi: ' + e.message);
    return false;
  }
}

function bookingExtraRowHtml(e) {
  return `<div class="booking-extra-row" data-extra-id="${escapeHtml(e.id)}"><label>Gider adı<input class="finance-extra-name" maxlength="100" value="${escapeHtml(e.name || '')}" data-oninput="calculateLivePreview()" ${e.posted ? 'readonly' : ''}></label><label>Tutar (₺)<input class="finance-extra-amount" type="number" min="0" step="0.01" value="${escapeHtml(e.amount ?? '')}" data-oninput="calculateLivePreview()" ${e.posted ? 'readonly' : ''}></label>${e.posted ? '<span>Deftere aktarıldı</span>' : `<button type="button" class="btn btn-secondary" data-onclick="removeBookingExtraExpense('${encodeActionArg(e.id)}')">Sil</button>`}</div>`;
}
function addBookingExtraExpense() {
  const host = financeEl('resExtraRows');
  const holder = document.createElement('div');
  holder.innerHTML = bookingExtraRowHtml({ id: crypto.randomUUID(), name: '', amount: '' });
  host.appendChild(holder.firstElementChild);
  host.lastElementChild.querySelector('input').focus();
  calculateLivePreview();
}
function removeBookingExtraExpense(id) {
  Array.from(financeEl('resExtraRows').children).find(row => row.dataset.extraId === id)?.remove();
  calculateLivePreview();
}
function markBookingCleaningManual() { bookingCleaningIsManual = true; calculateLivePreview(); }
function handleBookingGrossFinanceInput() { calculateLivePreview(); }
function handleBookingPropertyFinanceChange() {
  if (!financeValue('resEditId') && !bookingCleaningIsManual) {
    const key = financeValue('resVilla');
    const p = appData.villas?.[key] || Object.values(appData.villas || {}).find(x => x.id === key);
    financeSet('resCleanCost', p?.cleanCost ?? '');
  }
  calculateLivePreview();
}
function toggleBookingFinanceSections() {
  financeEl('resTaxFields').hidden = !financeEl('resTaxEnabled').checked;
  financeEl('resExtrasFields').hidden = !financeEl('resExtrasEnabled').checked;
  const mode = financeValue('resTaxMode');
  financeText('resGrossExplanation', financeEl('resTaxEnabled').checked && mode === 'exclusive'
    ? 'Vergisiz rezervasyon bedeli; temizlik geliri bu tutara dahildir. İndirim düşüldükten sonra vergiler eklenir.'
    : 'Misafirin ödeyeceği vergi dahil tutar; temizlik geliri içindedir. İndirim ayrıca düşülür.');
  financeEl('resTaxProfileFields').hidden = mode === 'manual';
  document.querySelectorAll('.finance-manual-tax').forEach(el => { el.hidden = mode !== 'manual'; });
  for (const key of ['vat','accommodation']) {
    const card = financeEl('financeCollector_'+key)?.closest('fieldset');
    card?.querySelectorAll('.finance-collector-split').forEach(el => { el.hidden = financeValue('financeCollector_'+key) !== 'split'; });
    card?.querySelectorAll('.finance-liability-split').forEach(el => { el.hidden = financeValue('financeLiability_'+key) !== 'split'; });
  }
  financeText('resTaxExplanation', { inclusive: 'Misafirin ödediği toplam tutara vergiler dahildir. Vergiler bu tutarın içinden hesaplanır, toplam rezervasyon bedeli değişmez.', exclusive: 'Girilen tutar vergisiz rezervasyon bedelidir; temizlik geliri bu tutarın içindedir. Uygulanabilir vergiler üzerine eklenir.', manual: 'Fatura veya platform dökümündeki vergileri ve bunların temizlik gelirine ait payını girin. Vergiler girilen toplam tutarın içindedir.' }[mode]);
  calculateLivePreview();
}

function readExtendedBookingEconomics() {
  const profileKey = financeValue('resTaxProfile');
  const profile = profileKey === 'saved' ? bookingFinanceDraft?.tax?.profile : (appData.tenantSettings?.booking_tax_profiles || [])[Number(profileKey)];
  const tax = { enabled: financeEl('resTaxEnabled').checked, mode: financeValue('resTaxMode'), profile: profileKey === '' ? undefined : profile };
  for (const key of ['vat','accommodation']) {
    const collector = financeValue('financeCollector_'+key), liability = financeValue('financeLiability_'+key);
    tax[key] = { amount: financeValue('financeTaxAmount_'+key), cleaningAmount: financeValue('financeCleaningTax_'+key),
      platformCollected: collector === 'split' ? financeValue('financeCollected_'+key) : collector,
      businessLiability: liability === 'split' ? financeValue('financeLiabilityAmount_'+key) : liability };
  }
  const extras = financeEl('resExtrasEnabled').checked ? Array.from(financeEl('resExtraRows').children).map(row => ({
    id: row.dataset.extraId, name: row.querySelector('.finance-extra-name').value.trim(), amount: row.querySelector('.finance-extra-amount').value
  })) : [];
  const input = { amount: financeValue('resGross') || 0, cleanFee: financeValue('resCleanFee') || 0, discount: financeValue('resDiscount') || 0,
    commission: financeValue('resCommission') || 0, paymentCommission: financeValue('resPaymentCommission') || 0,
    cleanCost: financeValue('resCleanCost') || null, checkIn: financeValue('resCheckIn'), checkOut: financeValue('resCheckOut'), invoiceDate: financeValue('resInvoiceDate'),
    nights: calculateNightsBetween(financeValue('resCheckIn'),financeValue('resCheckOut')), tax, extras,
    commissionMode: bookingFinanceCommissionMode, commissionRate: financeValue('resCommissionRate'),
    commissionBasis: bookingFinanceDraft?.commissionBasis || appData.tenantSettings?.booking_commission_bases?.[financeValue('resChannel')] || 'gross' };
  let result = BookingFinance.calculate(input);
  if (bookingFinanceCommissionMode === 'rate') {
    const base = input.commissionBasis === 'room' ? result.netRoomRevenue : input.commissionBasis === 'excluding_tax' ? result.gross-result.taxTotal : result.gross;
    const rate = input.commissionRate === '' ? getChannelCommissionRate(financeValue('resChannel')) : Number(input.commissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Komisyon oranı 0–100 arasında olmalı.');
    input.commission = BookingFinance.money(base*rate/100); input.commissionRate = rate;
    result = BookingFinance.calculate(input);
    financeSet('resCommission',input.commission);
  }
  return { ...result, gross: result.gross+Number(input.discount), cleanFee: result.cleaningRevenue+result.cleaningTax,
    cleanCost: result.cleanCost, paymentComm: result.paymentCommission, otaComm: result.commission, nights: input.nights,
    netAfterCommission: result.afterCommission, netToUs: result.remaining, roomRevenue: result.netRoomRevenue,
    nightlyNet: result.adr, commissionRate: input.commissionRate, financeInput: input, financeResult: result };
}

function renderBookingFinancePreview() {
  const ids = ['prevNights','prevRoomRevenue','prevCleanRevenue','prevGrossTotal','prevCommissionRate','prevCommission','prevPaymentCommission','prevNetAfterCommission','prevCleanCost','prevNetToUs','prevNetRevenue','prevNightlyNet','prevPlatformTax','prevBusinessTax','prevTaxTotal','prevAfterTax','prevAfterCleaning','prevOtherExpenses','prevAfterExtras'];
  try {
    const e = readExtendedBookingEconomics(), r = e.financeResult;
    const cash = n => n === null ? '—' : Number(n).toLocaleString('tr-TR',{style:'currency',currency:'TRY'});
    financeText('resFinanceError','');
    const values = { prevNights: e.nights > 0 ? e.nights+' gece' : '—', prevRoomRevenue: cash(r.netRoomRevenue), prevCleanRevenue: cash(r.cleaningRevenue), prevGrossTotal: cash(r.gross),
      prevCommissionRate: e.financeInput.commissionMode === 'rate' ? '%'+e.commissionRate : '(manuel tutar)', prevCommission: '− '+cash(r.commission), prevPaymentCommission: '− '+cash(r.paymentCommission),
      prevNetAfterCommission: cash(r.afterCommission), prevCleanCost: r.cleanCost === null ? 'Bilinmiyor' : '− '+cash(r.cleanCost), prevNetToUs: cash(r.remaining), prevNetRevenue: cash(r.netRoomRevenue), prevNightlyNet: cash(r.adr),
      prevPlatformTax: '− '+cash(r.platformTax), prevBusinessTax: '− '+cash(r.businessTaxCash), prevTaxTotal: e.financeInput.tax.enabled ? cash(r.taxTotal) : 'Vergi hesaplanmadı', prevAfterTax: cash(r.afterTax),
      prevAfterCleaning: cash(r.afterCleaning), prevOtherExpenses: '− '+cash(r.otherExpenses), prevAfterExtras: cash(r.remaining) };
    Object.entries(values).forEach(([id,text]) => financeText(id,text));
    financeEl('prevNetToUs').className = r.remaining < 0 ? 'text-negative' : 'text-positive';
    financeText('resFinanceCompleteness', (r.remaining < 0 ? 'Negatif kalan: tanımlı kesintiler geliri aşıyor. ' : '') + (r.cleanCost === null ? 'Temizlik maliyeti bilinmiyor; gösterilen tahmine dahil edilmedi. ' : '') + 'Yükümlülük bilgisi verginin ödendiğini göstermez.');
    for (const [key,amount] of [['vat',r.vat],['accommodation',r.accommodation]]) {
      const rate = e.financeInput.tax.mode === 'manual' ? 'Manuel tutar; oran türetilmedi' : '%'+(e.financeInput.tax.profile?.[key]?.rate ?? '—');
      financeText('financeTaxResult_'+key,rate+' · '+cash(amount));
    }
  } catch (error) {
    ids.forEach(id => financeText(id,'—')); financeText('resFinanceError',error.message);
    financeText('resFinanceCompleteness','Eksik veya geçersiz alanları tamamlayın.');
  }
}

function financeProfileTaxHtml(key,label,prefix='profile',req=' required') {
  return `<fieldset class="booking-tax-card"><legend>${escapeHtml(label)}</legend><label for="${prefix}Rate_${key}">Oran (%)</label><input id="${prefix}Rate_${key}" type="number" min="0" max="100" step="0.01"${req}>
    <label for="${prefix}Base_${key}">Matrah</label><select id="${prefix}Base_${key}"${req}><option value="">Açıkça seçin</option><option value="room">Yalnız oda bedeli</option><option value="cleaning">Yalnız temizlik bedeli</option><option value="both">Oda ve temizlik bedeli</option><option value="none">Hiçbiri / uygulanmaz</option></select>
    <label for="${prefix}Other_${key}">Diğer vergi matraha eklenir mi?</label><select id="${prefix}Other_${key}"${req}><option value="">Açıkça seçin</option><option value="no">Hayır</option><option value="yes">Evet</option></select></fieldset>`;
}
function bookingTaxProfileFieldsHtml(prefix, required) {
  const req = required ? ' required' : '';
  return `<div class="booking-optional-grid">
      <div class="form-group"><label for="${prefix}Name">Profil adı</label><input id="${prefix}Name" maxlength="100"${req}></div>
      <div class="form-group"><label for="${prefix}DateBasis">Oran tarihinin kaynağı</label><select id="${prefix}DateBasis"${req}><option value="">Seçin</option><option value="checkIn">Giriş tarihi</option><option value="checkOut">Çıkış tarihi</option><option value="invoiceDate">Fatura / vergi işlem tarihi</option></select></div>
      <div class="form-group"><label for="${prefix}From">Geçerlilik başlangıcı</label><input id="${prefix}From" type="date"${req}></div><div class="form-group"><label for="${prefix}To">Geçerlilik sonu</label><input id="${prefix}To" type="date"${req}></div>
    </div><div class="booking-tax-grid">${financeProfileTaxHtml('vat','KDV',prefix,req)}${financeProfileTaxHtml('accommodation','Konaklama vergisi',prefix,req)}</div>`;
}
function renderBookingFinanceSettings() {
  const host = financeEl('bookingFinanceSettings'); if (!host) return;
  const profiles = appData.tenantSettings?.booking_tax_profiles || [];
  const canEdit = canManageTenantRole(activeTenant?.role);
  host.innerHTML = `<h3>İsteğe bağlı vergi profilleri</h3><p class="field-note">Doğruladığınız oranları, matrahı ve geçerlilik tarihini tanımlayın. Vergi hesabı rezervasyonda ayrıca açılır. Kaydedilen rezervasyon kendi profil kopyasını korur.</p>
    <ul>${profiles.map(p => `<li>${escapeHtml(p.name)} · ${escapeHtml(p.validFrom)} – ${escapeHtml(p.validTo)}</li>`).join('')}</ul>
    <form data-onsubmit="saveBookingTaxProfile(event)"><fieldset ${canEdit ? '' : 'disabled'}><legend>Yeni profil / yeni geçerlilik dönemi</legend>${bookingTaxProfileFieldsHtml('profile', true)}<button type="submit" class="btn btn-primary">Profili kaydet</button></fieldset></form>
    <h3>Komisyon matrahı</h3><form data-onsubmit="saveBookingCommissionBases(event)"><fieldset ${canEdit ? '' : 'disabled'}><legend>Kanal bazında hesaplama</legend>${getBookingChannelCatalog().map((c,i) => `<div class="form-group"><label for="financeChannelBase_${i}">${escapeHtml(c.displayName)}</label><select id="financeChannelBase_${i}" data-finance-channel="${escapeHtml(c.code)}">${[['gross','Misafirin toplam ödemesi (mevcut davranış)'],['excluding_tax','Vergi hariç oda ve temizlik geliri'],['room','Vergi ve temizlik geliri hariç oda geliri']].map(([v,label]) => `<option value="${v}" ${escapeHtml(((appData.tenantSettings?.booking_commission_bases || {})[c.code] || 'gross') === v ? 'selected' : '')}>${escapeHtml(label)}</option>`).join('')}</select></div>`).join('')}<button type="submit" class="btn btn-primary">Matrahları kaydet</button></fieldset></form>
    <h3>Kapora</h3><p class="field-note">Kapora alınan kanallarda yeni rezervasyon formu ve ödeme takibi "Kapora" seçeneğini gösterir. İşaretsiz kanallarda (çoğu OTA) ödemeyi platform tahsil eder; kapora alanı gizlenir.</p>
    <form data-onsubmit="saveBookingDepositChannels(event)"><fieldset ${canEdit ? '' : 'disabled'}><legend>Kapora alınan kanallar</legend>${getBookingChannelCatalog().map((c,i) => `<label class="finance-toggle" for="financeDepositChannel_${i}"><input type="checkbox" id="financeDepositChannel_${i}" data-deposit-channel="${escapeHtml(c.code)}" ${channelTakesDeposit(c.code) ? 'checked' : ''}> ${escapeHtml(c.displayName)}</label>`).join('')}<button type="submit" class="btn btn-primary">Kapora ayarını kaydet</button></fieldset></form>`;
}
function readBookingTaxProfileForm(prefix) {
  const p = { id: crypto.randomUUID(), name: financeValue(prefix+'Name').trim(), dateBasis: financeValue(prefix+'DateBasis'), validFrom: financeValue(prefix+'From'), validTo: financeValue(prefix+'To') };
  if (!p.name || !p.dateBasis || !p.validFrom || !p.validTo) throw new Error('Profil alanlarını tamamlayın.');
  for (const key of ['vat','accommodation']) {
    const base = financeValue(prefix+'Base_'+key), other = financeValue(prefix+'Other_'+key);
    if (!base || !other || financeValue(prefix+'Rate_'+key) === '') throw new Error('Profil alanlarını tamamlayın.');
    p[key] = { rate: financeValue(prefix+'Rate_'+key), room: ['room','both'].includes(base), cleaning: ['cleaning','both'].includes(base), includesOther: other === 'yes' };
  }
  BookingFinance.validateProfile(p);
  return p;
}
async function appendBookingTaxProfile(p) {
  if (!canManageTenantRole(activeTenant?.role)) throw new Error('Vergi profilini yalnız işletme yöneticileri tanımlayabilir.');
  const profiles = [...(appData.tenantSettings?.booking_tax_profiles || []),p];
  await cloudSaveTenantSetting('booking_tax_profiles',profiles);
  appData.tenantSettings = { ...appData.tenantSettings, booking_tax_profiles: profiles };
  return profiles;
}
async function saveBookingTaxProfile(event) {
  event.preventDefault();
  try {
    await appendBookingTaxProfile(readBookingTaxProfileForm('profile'));
    renderBookingFinanceSettings();
    if (financeEl('resTaxProfile')) fillBookingTaxProfileOptions();
  } catch (e) { alert('Vergi profili kaydedilemedi: '+e.message); }
}
async function saveBookingCommissionBases(event) {
  event.preventDefault();
  try {
    const bases = {};
    document.querySelectorAll('[data-finance-channel]').forEach(el => { bases[el.dataset.financeChannel] = el.value; });
    await cloudSaveTenantSetting('booking_commission_bases',bases);
    appData.tenantSettings = { ...appData.tenantSettings, booking_commission_bases: bases };
    alert('Komisyon matrahları kaydedildi. Geçmiş rezervasyonlar değişmedi.');
  } catch (e) { alert('Komisyon matrahları kaydedilemedi: '+e.message); }
}
async function saveBookingDepositChannels(event) {
  event.preventDefault();
  try {
    if (!canManageTenantRole(activeTenant?.role)) throw new Error('Yalnız işletme yöneticileri değiştirebilir.');
    const kanallar = {};
    document.querySelectorAll('[data-deposit-channel]').forEach(el => { kanallar[String(el.dataset.depositChannel).toUpperCase()] = el.checked === true; });
    await cloudSaveTenantSetting('booking_deposit_channels', kanallar);
    appData.tenantSettings = { ...appData.tenantSettings, booking_deposit_channels: kanallar };
    alert('Kapora ayarı kaydedildi. Mevcut ödeme kayıtları değişmedi.');
  } catch (e) { alert('Kapora ayarı kaydedilemedi: ' + e.message); }
}
async function postBookingExtraExpenses() {
  const id = financeValue('resEditId');
  try {
    const date = financeValue('resExpensePostDate');
    if (!id || !date) throw new Error('Kaydedilmiş rezervasyon ve gerçekleşen gider tarihi gerekli.');
    const saved = (appData.bookings || []).find(b => b.id === id || b.dbId === id)?.financialDetails?.input?.extras || [];
    const current = readExtendedBookingEconomics().financeInput.extras;
    const normalize = rows => rows.map(e => ({id:e.id,name:e.name,amount:Number(e.amount)}));
    if (JSON.stringify(normalize(saved)) !== JSON.stringify(normalize(current))) throw new Error('Gider değişikliklerini önce rezervasyona kaydedin, sonra deftere aktarın.');
    const { data,error } = await supabaseClient.rpc('post_booking_extra_expenses',{ p_booking_id:id,p_tenant_id:getActiveTenantId(),p_date:date });
    if (error) throw error;
    invalidateExecutiveSnapshotCache();
    await loadTenantAppData();
    alert(`${data} gider deftere aktarıldı. Mevcut satırlar tekrar oluşturulmadı.`);
    closeBookingModal();
  } catch (e) { alert('Gider aktarımı tamamlanamadı: '+e.message); }
}
