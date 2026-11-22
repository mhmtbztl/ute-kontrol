(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./airbnb_performance_service'));
  else root.AirbnbPerformanceUI = factory(root.AirbnbPerformanceService);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  'use strict';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = value => value == null ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 4 }).format(value);
  const date = value => value ? value.split('-').reverse().join('.') : '—';
  const range = r => r ? `${date(r.period_start)} – ${date(r.period_end)}` : 'Kayıt yok';
  const value = (r, key) => fmt(r && r.metrics[key]) + (r && r.metrics[key] != null && !S.COUNTS.includes(key) ? '%' : '');
  const KINDS = { COVER: 'Kapak fotoğrafı', PHOTOS: 'Diğer fotoğraflar', TITLE: 'Başlık', PRICE: 'Fiyat', OTHER: 'Diğer' };
  function delta(a, b, key) {
    const n = S.difference(a, b, key);
    return n === null ? 'Karşılaştırma verisi yok' : n === 0 ? 'Değişmemiş' : `${fmt(Math.abs(n))}${S.COUNTS.includes(key) ? '' : ' yüzde puan'} ${n > 0 ? 'artmış' : 'azalmış'}`;
  }
  function errorText(e) {
    if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(e && e.code)) return 'Airbnb veri kaydı henüz etkin değil. Veritabanı güncellemesi gerekiyor. Mevcut kayıtlar korunuyor.';
    if (e && ['40001', '23505'].includes(e.code)) return 'Bu kayıt başka bir işlemde değişmiş. Yenile düğmesine basıp güncel kaydı açın.';
    if (e && e.code === '42501') return 'Bu işlem için yönetim yetkisi gerekiyor.';
    return e && !e.code && e instanceof Error ? e.message : 'Veriler alınamadı veya kaydedilemedi. Bağlantınızı kontrol edip yeniden deneyin.';
  }
  function listingsForWorkspace(model = {}) {
    return (Array.isArray(model.listings) ? model.listings : [])
      .filter(listing => String(listing.channel_code || listing.channelCode || '').toUpperCase() === 'AIRBNB');
  }
  function chart(records, key) {
    const points = S.currentRecords(records).sort((a, b) => a.period_end.localeCompare(b.period_end));
    const max = Math.max(1, ...points.map(r => Number(r.metrics[key]) || 0));
    if (!points.length) return '<p class="sub-text">Grafik için henüz kayıt yok.</p>';
    return `<div class="ab-chart" role="list" aria-label="${escapeHtml(S.FIELDS[key])}: kayıtlı dönemler">${points.map(r => `<div role="listitem" class="ab-chart-row"><span>${range(r)}</span><span class="ab-bar-track"><span class="ab-bar" style="width:${r.metrics[key] == null ? 0 : Number(r.metrics[key]) / max * 100}%"></span></span><strong>${value(r, key)}</strong></div>`).join('')}</div><p class="sub-text">Her çubuk bir kayıt dönemidir. Çakışan dönemler toplanmaz; farklı uzunluktaki dönemlerin adetleri doğrudan karşılaştırılmamalıdır.</p>`;
  }
  function mount(root, context) {
    if (!root || !S) return;
    const { model, client, tenantId, canManage } = context;
    const listings = listingsForWorkspace(model);
    const listingIds = new Set(listings.map(l => l.id));
    const legacy = model.snapshots.filter(r => listingIds.has(r.channel_listing_id)).map(S.fromLegacy);
    const state = { records: [], changes: [], loading: true, available: false, error: '', message: '', section: 'performance', selected: '', form: null, draft: null, preview: null, busy: false, metric: 'views', period: { ...model.period } };
    function name(id) {
      const l = listings.find(x => x.id === id);
      const property = l && model.properties.find(p => p.id === (l.property_id || l.propertyId));
      return property ? property.name : l && (l.display_name || l.displayName) || 'Airbnb ilanı';
    }
    const allRecords = () => [...(state.legacy || legacy).filter(r => listingIds.has(r.channel_listing_id)), ...state.records.filter(r => listingIds.has(r.channel_listing_id))];
    const buttonHtml = (action, label, attrs = '') => `<button type="button" class="btn btn-secondary btn-sm" data-ab-action="${action}" ${attrs}>${escapeHtml(label)}</button>`;
    const listOptions = selected => listings.map(l => `<option value="${escapeHtml(l.id)}" ${selected === l.id ? 'selected' : ''}>${escapeHtml(name(l.id))}${l.display_name ? ' · ' + escapeHtml(l.display_name) : ''}</option>`).join('');
    function formHtml() {
      if (!state.form) return '';
      const d = state.draft || {};
      const editing = Boolean(d.editing);
      if (state.preview) {
        const p = state.preview;
        return `<section class="card ab-panel"><h3>Bu dönemin kaydı var — değiştirilsin mi?</h3><p><strong>${escapeHtml(name(p.listingId))}</strong> · ${date(p.start)} – ${date(p.end)}</p>${p.existing ? '<p>Bu dönemin kaydı güncellenecek. Önceki sürüm geçmişte korunacak.</p>' : ''}<dl class="ab-metrics">${Object.entries(S.FIELDS).map(([key, label]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value({ metrics: p.metrics }, key)}</dd></div>`).join('')}</dl><p>${escapeHtml(p.notes)}</p><div class="ab-actions">${buttonHtml('back', 'Geri dön')}${buttonHtml('save', state.busy ? 'Kaydediliyor…' : 'Onayla ve kaydet', state.busy ? 'disabled' : '')}</div></section>`;
      }
      if (state.form === 'change') return `<form data-ab-form="change" class="card ab-panel"><h3>Değişiklik ekle</h3><p class="sub-text">Airbnb’de yaptığın değişikliği kaydet. Bu form Airbnb ilanını değiştirmez.</p><div class="ab-form-grid"><label>Mülk / Airbnb ilanı<select name="listingId" class="form-control" required>${listOptions(d.listingId)}</select></label><label>Değişiklik tarihi<input class="form-control" type="date" name="date" required value="${escapeHtml(d.date || '')}"></label><label>Ne değişti?<select class="form-control" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Açıklama<textarea class="form-control" name="notes" maxlength="1000" required>${escapeHtml(d.notes || '')}</textarea></label></div><div class="ab-actions">${buttonHtml('cancel', 'Vazgeç')}<button class="btn btn-primary btn-sm" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Kaydediliyor…' : 'Değişikliği kaydet'}</button></div></form>`;
      const MAIN = ['views', 'favorites', 'bookingConversion'];
      const HINT = { views: 'İlanınızın kaç kez açıldığı', favorites: 'Kaç kişinin favoriye eklediği', bookingConversion: 'İlanı açanların yüzde kaçı rezervasyon yaptı' };
      const listField = listings.length > 1 || editing
        ? `<label>İlan<select name="listingId" class="form-control" ${editing ? 'disabled' : ''} required>${listOptions(d.listingId)}</select></label>`
        : `<input type="hidden" name="listingId" value="${escapeHtml(d.listingId || '')}">`;
      return `<form data-ab-form="record" class="card ab-panel"><h3>${editing ? 'Rakamları düzelt' : 'Airbnb rakamlarını gir'}</h3><p class="lex-note">Airbnb’de ev sahibi panelinde <strong>Performans</strong> bölümünü açın, tek ilanı ve tarih aralığını seçin; gördüğünüz rakamları yazın. Bilmediğinizi boş bırakın.</p><div class="ab-form-grid">${listField}<label>Başlangıç<input class="form-control" type="date" name="start" value="${escapeHtml(d.start || '')}" ${editing ? 'readonly' : ''} required></label><label>Bitiş (bu gün dahil)<input class="form-control" type="date" name="end" value="${escapeHtml(d.end || '')}" ${editing ? 'readonly' : ''} required></label></div><div class="ab-form-grid">${MAIN.map(k => fieldHtml(k, HINT[k])).join('')}</div><details class="ab-more"><summary>Diğer rakamlar ve not (isteğe bağlı)</summary><div class="ab-form-grid">${Object.keys(S.FIELDS).filter(k => !MAIN.includes(k)).map(k => fieldHtml(k)).join('')}</div><label>Not<textarea class="form-control" name="notes" maxlength="1000">${escapeHtml(d.notes || '')}</textarea></label></details><div class="ab-actions">${buttonHtml('cancel', 'Vazgeç')}<button class="btn btn-primary btn-sm" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div></form>`;
      function fieldHtml(key, hint) { return `<label>${S.FIELDS[key]}${S.COUNTS.includes(key) ? '' : ' (%)'}${hint ? `<small class="lex-cell__sub">${escapeHtml(hint)}</small>` : ''}<input class="form-control" type="text" inputmode="${S.COUNTS.includes(key) ? 'numeric' : 'decimal'}" name="${key}" value="${escapeHtml(d.metrics && d.metrics[key] != null ? d.metrics[key] : '')}" placeholder="Bilinmiyorsa boş bırak"></label>`; }
    }
    function detailHtml() {
      if (!state.selected) return '';
      const own = allRecords().filter(r => r.channel_listing_id === state.selected);
      const pair = S.compare(own, state.selected, state.period);
      const history = own.slice().sort((a, b) => b.period_end.localeCompare(a.period_end) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const active = new Set(S.currentRecords(own).map(r => r.id));
      return `<section class="card ab-panel"><div class="ab-heading"><h3>${escapeHtml(name(state.selected))}</h3>${buttonHtml('close-detail', 'Ayrıntıyı kapat')}</div><p>${range(pair.current)}${pair.previous ? ' · Önceki dönem: ' + range(pair.previous) : ''}</p>${pair.current && pair.current.legacy ? '<p class="sub-text">Eski kayıt: Airbnb’den bildirilen dönüşüm yüzdeleri bulunmuyor.</p>' : ''}<dl class="ab-metrics">${Object.entries(S.FIELDS).map(([key, label]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value(pair.current, key)}</dd><small>${delta(pair.current, pair.previous, key)}</small></div>`).join('')}</dl><label>Grafikte göster<select class="form-control" data-ab-metric>${Object.entries(S.FIELDS).map(([key, label]) => `<option value="${key}" ${state.metric === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>${chart(own, state.metric)}<details><summary>Kayıt geçmişi (${history.length})</summary><div class="ab-table-wrap"><table class="data-table"><thead><tr><th>Dönem</th><th>Görüntülenme</th><th>Favori</th><th>Kayıt</th><th></th></tr></thead><tbody>${history.map(r => `<tr><td>${range(r)}<small class="ab-block">${escapeHtml(r.notes || '')}</small></td><td>${value(r, 'views')}</td><td>${value(r, 'favorites')}</td><td>${active.has(r.id) ? r.legacy ? 'Eski sistem kaydı' : 'Güncel sürüm' : 'Önceki sürüm'}<details><summary>Tüm değerler</summary>${Object.entries(S.FIELDS).map(([k,l]) => `<p>${l}: ${value(r,k)}</p>`).join('')}</details></td><td>${canManage && state.available && active.has(r.id) ? buttonHtml('edit', 'Düzelt', `data-id="${escapeHtml(r.id)}"`) : ''}</td></tr>`).join('')}</tbody></table></div></details></section>`;
    }
    // Lex (21.11.2026): ilan · son donem · talimat. Talimat yalniz girilen veriden:
    // kayit yoksa "Yap", onceki esit donem varsa gorüntülenme farki; tahmin yok.
    function performanceRow(l) {
      const { current, previous } = S.compare(allRecords(), l.id, state.period);
      const n = S.difference(current, previous, 'views');
      const tag = !current ? ['up', 'Yap'] : n === null ? null : n > 0 ? ['keep', 'Arttı'] : n < 0 ? ['down', 'Azaldı'] : ['keep', 'Aynı'];
      const reason = !current ? 'Airbnb’den bu ilanın rakamlarını girin.'
        : n === null ? 'Karşılaştırılacak önceki dönem yok.'
          : n === 0 ? 'Görüntülenme önceki dönemle aynı.' : `Görüntülenme önceki döneme göre ${fmt(Math.abs(n))} ${n > 0 ? 'arttı' : 'azaldı'}.`;
      const sub = current ? [`${value(current, 'favorites')} favori`, current.metrics.bookingConversion == null ? null : `%${fmt(current.metrics.bookingConversion)} rezervasyona dönüştü`].filter(Boolean).join(' · ') : '';
      return `<tr><td data-label="İlan"><button type="button" class="lex-link" data-ab-action="detail" data-id="${escapeHtml(l.id)}">${escapeHtml(name(l.id))}</button><span class="lex-cell__sub">${current ? range(current) : 'Henüz rakam girilmedi'}</span></td><td data-label="Son dönem"><span class="lex-cell__value">${current ? `${value(current, 'views')} görüntülenme` : '—'}</span>${sub ? `<span class="lex-cell__sub">${escapeHtml(sub)}</span>` : ''}</td><td data-label="Talimat">${tag ? `<span class="lex-tag lex-tag--${tag[0]}">${tag[1]}</span>` : ''}<span class="lex-cell__sub">${escapeHtml(reason)}</span>${!current && canManage && state.available ? `<button type="button" class="lex-btn lex-btn--inline" data-ab-action="new" data-id="${escapeHtml(l.id)}">Rakamları gir</button>` : ''}</td></tr>`;
    }
    function performanceHtml() {
      return `<table class="lex-table ab-lex-table"><caption class="sr-only">Airbnb ilanları</caption><thead><tr><th scope="col">İlan</th><th scope="col">Son dönem</th><th scope="col">Talimat</th></tr></thead><tbody>${listings.map(performanceRow).join('')}</tbody></table>${detailHtml()}`;
    }
    function changesHtml() {
      const changes = state.changes.filter(c => listingIds.has(c.channel_listing_id)).sort((a, b) => b.change_date.localeCompare(a.change_date));
      return `<p class="lex-note">Fotoğraf, başlık veya fiyatı değiştirdiğinizde not alın; değişiklikten önceki ve sonraki 14 gün yan yana gelir.</p>${changes.length ? changes.map(c => {
        const w = S.changeWindows(c.change_date), before = S.compare(allRecords(), c.channel_listing_id, w.before).current, after = S.compare(allRecords(), c.channel_listing_id, w.after).current;
        const nearby = changes.filter(other => other.id !== c.id && other.channel_listing_id === c.channel_listing_id && other.change_date >= w.before.start && other.change_date < w.after.endExclusive);
        return `<article class="card ab-panel"><h3>${escapeHtml(name(c.channel_listing_id))} · ${escapeHtml(KINDS[c.kind] || c.kind)}</h3><p>${date(c.change_date)} · ${escapeHtml(c.notes)}</p><p>Önce: ${date(w.before.start)} – ${date(S.addDays(w.before.endExclusive, -1))}<br>Sonra: ${date(w.after.start)} – ${date(S.addDays(w.after.endExclusive, -1))}</p>${!before || !after ? `<p>${!before ? 'Önceki' : ''}${!before && !after ? ' ve ' : ''}${!after ? 'sonraki' : ''} dönem verisi eksik. Yukarıdaki tarihler için veri ekle.</p>` : `<dl class="ab-metrics">${Object.entries(S.FIELDS).map(([k,label]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value(before,k)} → ${value(after,k)}</dd><small>${delta(after,before,k)}</small></div>`).join('')}</dl>`}${nearby.length ? '<p>Aynı karşılaştırma aralığında başka değişiklik kayıtları da var.</p>' : ''}<p class="sub-text">Önce/sonra karşılaştırmasıdır. Fiyat ve sezon gibi etkenler sonucu değiştirebilir; tek başına neden-sonuç kanıtı değildir.</p></article>`;
      }).join('') : '<div class="card ab-panel">Henüz değişiklik kaydı yok. Fotoğraf, başlık veya fiyatı değiştirdiğinde buraya not ekle.</div>'}`;
    }
    function draw() {
      if (!root.isConnected) return;
      const perf = state.section === 'performance';
      const canAdd = canManage && listings.length && state.available;
      const actions = listings.length ? `<div class="ab-actions">${canAdd ? `<button type="button" class="lex-btn" data-ab-action="${perf ? 'new' : 'new-change'}"${state.busy ? ' disabled' : ''}>${perf ? 'Rakamları gir' : 'Not ekle'}</button>` : ''}<button type="button" class="lex-btn" data-ab-action="${perf ? 'changes' : 'performance'}">${perf ? 'Değişiklik notları' : 'İlan rakamlarına dön'}</button>${state.error ? buttonHtml('reload', 'Yeniden dene') : ''}</div>` : '';
      root.innerHTML = `<div class="ab-workspace"><p class="lex-note">Airbnb’de ilanınızı kaç kişinin açtığı, kaçının favoriye eklediği ve kaçının rezervasyon yaptığı. Rakamları Airbnb ev sahibi panelinin Performans bölümünden okuyup buraya yazarsınız; Airbnb’ye bir şey gönderilmez.</p><div role="status" aria-live="polite">${state.loading ? '<p class="lex-note">Airbnb kayıtları yükleniyor…</p>' : ''}${state.error ? `<p class="ab-error">${escapeHtml(state.error)}</p>` : ''}${state.message ? `<p class="lex-note">${escapeHtml(state.message)}</p>` : ''}</div>${workspaceBodyHtml()}${actions}</div>`;
      function workspaceBodyHtml() { return !listings.length ? `<p class="lex-note">Bu seçimde Airbnb ilanı yok.</p>${canManage ? '<button type="button" class="lex-btn" data-ab-action="add-listing">Airbnb ilanını ekle</button>' : ''}` : `${formHtml()}${state.section === 'performance' ? performanceHtml() : changesHtml()}`; }
    }
    async function saveRecord(preview) {
      state.busy = true; draw();
      try {
        await S.save(client, tenantId, preview, preview.existing && !preview.existing.legacy ? preview.existing.id : null);
        state.selected = preview.listingId;
        state.period = { start: preview.start, endExclusive: preview.endExclusive };
        state.form = null; state.preview = null; state.message = 'Dönem verisi kaydedildi.';
        await reload();
      } catch (e) { state.preview = null; state.error = errorText(e); }
      finally { state.busy = false; }
    }
    async function reload() {
      state.loading = true; state.error = ''; draw();
      try {
        const data = await S.load(client, tenantId);
        state.records = data.records; state.changes = data.changes; state.legacy = data.legacy; state.available = true;
      } catch (e) { state.error = errorText(e); state.available = false; }
      finally { state.loading = false; draw(); }
    }
    root.addEventListener('click', async event => {
      const target = event.target.closest('[data-ab-action]');
      if (!target || state.busy) return;
      const action = target.dataset.abAction;
      state.error = ''; state.message = '';
      if (action === 'add-listing') { if (typeof window !== 'undefined' && window.openMarketingListingManager) window.openMarketingListingManager(null); return; }
      if (action === 'reload') { state.form = null; state.preview = null; await reload(); return; }
      if (action === 'performance' || action === 'changes') { state.section = action; state.form = null; state.preview = null; }
      if (action === 'detail') state.selected = target.dataset.id;
      if (action === 'close-detail') state.selected = '';
      if (action === 'latest') state.period = {};
      if (action === 'cancel') { state.form = null; state.preview = null; }
      if (action === 'back') state.preview = null;
      if (action === 'new' || action === 'new-change') { state.preview = null; state.form = action === 'new' ? 'record' : 'change'; const today = new Date().toISOString().slice(0, 10); state.draft = { listingId: target.dataset.id || state.selected || listings[0].id, start: state.period.start || S.addDays(today, -30), end: state.period.endExclusive ? S.addDays(state.period.endExclusive, -1) : S.addDays(today, -1), requestId: crypto.randomUUID() }; }
      if (action === 'edit') {
        const r = allRecords().find(x => x.id === target.dataset.id);
        if (r) { state.form = 'record'; state.preview = null; state.draft = { listingId: r.channel_listing_id, start: r.period_start, end: r.period_end, metrics: r.metrics, notes: r.notes, editing: true }; }
      }
      if (action === 'save' && state.preview && canManage && state.available) await saveRecord(state.preview);
      draw();
      if (['new','new-change','edit','back'].includes(action)) root.querySelector('form[data-ab-form="record"] input, form[data-ab-form="change"] select')?.focus();
    });
    root.addEventListener('change', event => { if (event.target.matches('[data-ab-metric]')) { state.metric = event.target.value; draw(); } });
    root.addEventListener('submit', async event => {
      const form = event.target.closest('[data-ab-form]');
      if (!form) return;
      event.preventDefault();
      if (state.busy) return;
      const values = Object.fromEntries(new FormData(form));
      state.error = ''; state.message = '';
      try {
        if (form.dataset.abForm === 'filter') {
          if (S.day(values.start) === null || S.day(values.end) === null || values.end < values.start) throw new Error('Başlangıç ve bitiş tarihlerini seçin.');
          state.period = { start: values.start, endExclusive: S.addDays(values.end, 1) };
        } else if (canManage && state.available && form.dataset.abForm === 'record') {
          state.draft = { ...state.draft, ...values, metrics: Object.fromEntries(Object.keys(S.FIELDS).map(k => [k, values[k]])) };
          const validated = S.validate(state.draft);
          const preview = { ...validated, existing: S.compare(allRecords(), validated.listingId, { start: validated.start, endExclusive: validated.endExclusive }).current };
          if (preview.existing) state.preview = preview;
          else { await saveRecord(preview); return; }
        } else if (canManage && state.available && form.dataset.abForm === 'change') {
          state.draft = { ...state.draft, ...values }; state.busy = true; draw();
          await S.saveChange(client, tenantId, state.draft);
          state.form = null; state.message = 'Değişiklik kaydedildi.'; await reload();
        }
      } catch (e) { state.error = errorText(e); }
      finally { state.busy = false; draw(); }
    });
    draw(); reload();
  }
  return { mount, chart, delta, errorText, listingsForWorkspace };
}));
