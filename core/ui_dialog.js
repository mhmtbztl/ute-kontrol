// =============================================================================
// LEXBNB — UYGULAMA ICI PENCERE (L-287)
// Tarayicinin ham prompt/confirm/alert kutulari telefonda kotu gorunuyor,
// sayfayi kilitliyor ve otomasyonu durduruyordu. Bu modul ayni isi uygulamanin
// kendi penceresiyle yapar ve Promise dondurur:
//   askText({ title, label, value, placeholder, inputType }) -> metin | null (vazgecildi)
//   askConfirm({ title, message, okText, danger })          -> true | false
//   notify({ title, message })                              -> undefined (kapaninca)
// Tarayici DOM'u yoksa (Node testleri) yerel prompt/confirm/alert kullanilir.
// Esc ve odak tuzagi app.js'teki pencere klavye destegiyle gelir (.close-btn).
// =============================================================================
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LexbnbDialog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function hasDom() {
    return !!(root && root.document && typeof root.HTMLElement === 'function' && root.document.body);
  }

  function el(tag, attrs, text) {
    const node = root.document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'className') node.className = v;
      else node.setAttribute(k, v);
    });
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function open(options) {
    const o = options || {};
    return new Promise(resolve => {
      const backdrop = el('div', { className: 'modal-backdrop ui-dialog', role: 'dialog', 'aria-modal': 'true' });
      const card = el('div', { className: 'modal-card', style: 'max-width:440px' });
      const header = el('div', { className: 'modal-header' });
      header.appendChild(el('h3', {}, o.title || 'Lexbnb'));
      const close = el('button', { type: 'button', className: 'close-btn', 'aria-label': 'Kapat' }, '×');
      header.appendChild(close);
      const body = el('div', { className: 'modal-body', style: 'padding:16px' });
      if (o.message) {
        String(o.message).split('\n').forEach((line, i) => {
          if (i) body.appendChild(el('br'));
          body.appendChild(root.document.createTextNode(line));
        });
      }
      let input = null;
      if (o.input) {
        const group = el('label', { style: 'display:grid;gap:6px;margin-top:10px;font-size:13px' }, o.label || '');
        input = el('input', { type: o.inputType || 'text', className: 'form-control', placeholder: o.placeholder || '' });
        input.value = o.value === undefined || o.value === null ? '' : String(o.value);
        group.appendChild(input);
        body.appendChild(group);
      }
      const footer = el('div', { className: 'modal-footer' });
      const cancel = o.alertOnly ? null : el('button', { type: 'button', className: 'btn btn-secondary' }, o.cancelText || 'Vazgeç');
      const ok = el('button', { type: 'button', className: o.danger ? 'btn btn-danger' : 'btn btn-primary' }, o.okText || 'Tamam');
      if (cancel) footer.appendChild(cancel);
      footer.appendChild(ok);
      card.appendChild(header); card.appendChild(body); card.appendChild(footer);
      backdrop.appendChild(card);
      let bitti = false;
      const finish = value => {
        if (bitti) return;
        bitti = true;
        backdrop.classList.remove('active');
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(value);
      };
      const tamam = () => finish(o.input ? input.value : true);
      const vazgec = () => finish(o.input ? null : (o.alertOnly ? undefined : false));
      ok.addEventListener('click', tamam);
      if (cancel) cancel.addEventListener('click', vazgec);
      close.addEventListener('click', o.alertOnly ? tamam : vazgec);
      if (input) input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); tamam(); } });
      root.document.body.appendChild(backdrop);
      backdrop.classList.add('active');
      setTimeout(() => (input || ok).focus(), 0);
    });
  }

  function askText(o) {
    const opts = o || {};
    if (!hasDom()) return Promise.resolve(typeof root.prompt === 'function' ? root.prompt(opts.label || opts.title || '', opts.value || '') : null);
    return open({ ...opts, input: true });
  }

  function askConfirm(o) {
    const opts = typeof o === 'string' ? { message: o } : (o || {});
    if (!hasDom()) return Promise.resolve(typeof root.confirm === 'function' ? root.confirm(opts.message || '') : false);
    return open(opts);
  }

  function notify(o) {
    const opts = typeof o === 'string' ? { message: o } : (o || {});
    if (!hasDom()) { if (typeof root.alert === 'function') root.alert(opts.message || ''); return Promise.resolve(); }
    return open({ ...opts, alertOnly: true });
  }

  return { askText, askConfirm, notify };
});
