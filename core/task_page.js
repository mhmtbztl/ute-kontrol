'use strict';
// Notion tarzi gorev sayfasi (sadelik 4. tur, kullanici 22.11.2026: "Sayfa (gorev ismi) -
// basliklar - gorev yerleri - to do ve alt to do"). Sayfa = operational_tasks satiri;
// yer = mulk (property_id); basliklar = alanlar (Mutfak, Oda 1 ...); yapilacaklar ve alt
// yapilacaklar. Veri bicimi phase55/96 ile ayni, GOC YOK:
//   checklist = { sections: [{ title, items: [{ text, important, subChecks: [..] }] }],
//                 supplies: [...], result: { "s0.i1": { z: true }, "s0.i1.sub0": { z: true } } }
// Anahtarlar konuma baglidir; taslakta her satirin kalici yerel kimligi vardir ve kayitta
// konum anahtari yeniden uretilir (madde silinince isaretler kaymaz).
// Saf model Node'da test edilir (task_page_tests); cizim yalniz tarayicida.
// CSP: satir ici isleyici yok; olaylar kapsayicida addEventListener ile dinlenir.
(function (root) {
  let sayac = 0;
  const yeniId = () => `tp${Date.now().toString(36)}${(sayac++).toString(36)}`;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function resultOf(checklist) {
    if (checklist && !Array.isArray(checklist) && checklist.result && typeof checklist.result === 'object') return checklist.result;
    return {};
  }

  // Kayitli checklist -> taslak. Eski dizi bicimi (phase9) tek "Genel" basligina doner.
  function fromStored(checklist) {
    if (Array.isArray(checklist)) {
      return [{
        id: yeniId(), title: 'Genel',
        items: checklist.map(item => ({ id: yeniId(), text: String(item?.text || ''), important: item?.important === true || item?.required === true, done: item?.completed === true, subs: [] }))
      }];
    }
    const sections = checklist && Array.isArray(checklist.sections) ? checklist.sections : [];
    const result = resultOf(checklist);
    return sections.map((section, si) => ({
      id: yeniId(),
      title: String(section?.title || ''),
      items: (Array.isArray(section?.items) ? section.items : []).map((item, ii) => {
        const key = `s${si}.i${ii}`;
        return {
          id: yeniId(),
          text: String(item?.text || ''),
          important: item?.important === true,
          done: result[key]?.z === true || item?.completed === true,
          subs: (Array.isArray(item?.subChecks) ? item.subChecks : []).map((sub, k) => ({
            id: yeniId(), text: String(sub || ''), done: result[`${key}.sub${k}`]?.z === true
          }))
        };
      })
    }));
  }

  // Taslak -> kayit. Bos metinli madde/alt madde ve maddesiz baslik kaydedilmez (saha
  // ekraninin okuyucusu bos maddeyi gecersiz sayar). Isaretler yeni konum anahtariyla yazilir.
  // Malzeme listesi (supplies) korunur.
  function toStored(draft, previous) {
    const supplies = previous && !Array.isArray(previous) && Array.isArray(previous.supplies) ? previous.supplies : [];
    const sections = [];
    const result = {};
    (draft || []).forEach(section => {
      const items = (section.items || []).filter(item => String(item.text || '').trim());
      if (!items.length) return;
      const si = sections.length;
      sections.push({
        title: String(section.title || '').trim() || 'Genel',
        items: items.map((item, ii) => {
          const key = `s${si}.i${ii}`;
          if (item.done) result[key] = { z: true };
          const subs = (item.subs || []).filter(sub => String(sub.text || '').trim());
          subs.forEach((sub, k) => { if (sub.done) result[`${key}.sub${k}`] = { z: true }; });
          const out = { text: String(item.text).trim(), important: item.important === true };
          if (subs.length) out.subChecks = subs.map(sub => String(sub.text).trim());
          return out;
        })
      });
    });
    if (!sections.length && !supplies.length) return {};
    return { sections, supplies, result };
  }

  // Ilerleme: her madde ve alt madde bir is. Tamamlama kurali sunucudakiyle ayni:
  // onemli maddeler ve onlarin alt maddeleri isaretli olmali (fn_checklist_critical_complete).
  function progress(draft) {
    let total = 0; let done = 0; const missing = [];
    (draft || []).forEach(section => (section.items || []).forEach(item => {
      if (!String(item.text || '').trim()) return;
      total += 1; if (item.done) done += 1;
      if (item.important && !item.done) missing.push(item.text);
      (item.subs || []).forEach(sub => {
        if (!String(sub.text || '').trim()) return;
        total += 1; if (sub.done) done += 1;
        if (item.important && !sub.done) missing.push(`${item.text} › ${sub.text}`);
      });
    }));
    return { total, done, missing, canComplete: missing.length === 0 };
  }

  // Kayitli checklist uzerinden ilerleme (liste satiri icin).
  function storedProgress(checklist) {
    return progress(fromStored(checklist));
  }

  function find(draft, id) {
    for (const section of draft) {
      if (section.id === id) return { section };
      for (const item of section.items) {
        if (item.id === id) return { section, item };
        for (const sub of item.subs) if (sub.id === id) return { section, item, sub };
      }
    }
    return null;
  }

  // Duzenleme islemleri (saf; taslagi yerinde degistirir, odaklanacak kimligi doner).
  const ops = {
    addSection(draft, afterId) {
      const section = { id: yeniId(), title: '', items: [{ id: yeniId(), text: '', important: false, done: false, subs: [] }] };
      const i = draft.findIndex(s => s.id === afterId);
      draft.splice(i < 0 ? draft.length : i + 1, 0, section);
      return section.id;
    },
    addItem(draft, sectionId, afterItemId) {
      const section = draft.find(s => s.id === sectionId);
      if (!section) return null;
      const item = { id: yeniId(), text: '', important: false, done: false, subs: [] };
      const i = section.items.findIndex(it => it.id === afterItemId);
      section.items.splice(afterItemId ? i + 1 : 0, 0, item);
      return item.id;
    },
    addSub(draft, itemId, afterSubId) {
      const hit = find(draft, itemId);
      if (!hit || !hit.item) return null;
      const sub = { id: yeniId(), text: '', done: false };
      const i = hit.item.subs.findIndex(s => s.id === afterSubId);
      hit.item.subs.splice(afterSubId ? i + 1 : hit.item.subs.length, 0, sub);
      return sub.id;
    },
    // Bir maddeyi ustundeki maddenin alt maddesi yapar (Tab). Alt maddesi olan madde girintilenmez.
    indent(draft, itemId) {
      const hit = find(draft, itemId);
      if (!hit || !hit.item || hit.sub) return null;
      const list = hit.section.items;
      const i = list.indexOf(hit.item);
      if (i <= 0 || hit.item.subs.length) return null;
      const parent = list[i - 1];
      list.splice(i, 1);
      const sub = { id: hit.item.id, text: hit.item.text, done: hit.item.done };
      parent.subs.push(sub);
      return sub.id;
    },
    // Alt maddeyi ana maddeye cikarir (Shift+Tab).
    outdent(draft, subId) {
      const hit = find(draft, subId);
      if (!hit || !hit.sub) return null;
      const list = hit.section.items;
      hit.item.subs.splice(hit.item.subs.indexOf(hit.sub), 1);
      const item = { id: hit.sub.id, text: hit.sub.text, important: false, done: hit.sub.done, subs: [] };
      list.splice(list.indexOf(hit.item) + 1, 0, item);
      return item.id;
    },
    remove(draft, id) {
      const hit = find(draft, id);
      if (!hit) return null;
      if (hit.sub) {
        const i = hit.item.subs.indexOf(hit.sub);
        hit.item.subs.splice(i, 1);
        return (hit.item.subs[i - 1] || hit.item).id;
      }
      if (hit.item) {
        const i = hit.section.items.indexOf(hit.item);
        hit.section.items.splice(i, 1);
        const onceki = hit.section.items[i - 1];
        return onceki ? ((onceki.subs[onceki.subs.length - 1] || onceki).id) : hit.section.id;
      }
      const i = draft.indexOf(hit.section);
      draft.splice(i, 1);
      return draft[i - 1] ? draft[i - 1].id : null;
    },
    setText(draft, id, text) {
      const hit = find(draft, id);
      if (!hit) return false;
      (hit.sub || hit.item || hit.section)[hit.sub || hit.item ? 'text' : 'title'] = String(text || '');
      return true;
    },
    toggleDone(draft, id, on) {
      const hit = find(draft, id);
      if (!hit || !(hit.sub || hit.item)) return false;
      (hit.sub || hit.item).done = !!on;
      return true;
    },
    toggleImportant(draft, id) {
      const hit = find(draft, id);
      if (!hit || !hit.item || hit.sub) return false;
      hit.item.important = !hit.item.important;
      return true;
    }
  };

  // ---------------------------------------------------------------- cizim
  function bodyHtml(draft, canEdit) {
    const ro = canEdit ? '' : ' readonly';
    const dis = canEdit ? '' : ' disabled';
    const satir = (row, cls, placeholder, extra) => `<div class="tp-row ${cls}${row.done ? ' is-done' : ''}" data-tp-id="${escapeHtml(row.id)}">`
      + `<input type="checkbox" class="tp-check" aria-label="Yapıldı"${row.done ? ' checked' : ''}${dis}>`
      + `<input type="text" class="tp-text" value="${escapeHtml(row.text)}" placeholder="${escapeHtml(placeholder)}" maxlength="500" aria-label="${escapeHtml(placeholder)}"${ro}>`
      + extra + '</div>';
    const sections = draft.map(section => {
      const items = section.items.map(item => {
        const yildiz = `<button type="button" class="tp-star${item.important ? ' is-on' : ''}" data-tp-act="star" aria-pressed="${item.important ? 'true' : 'false'}" title="Önemli: tamamlamadan önce işaretlenmeli"${dis}>★</button>`;
        const arac = canEdit ? `${yildiz}<button type="button" class="tp-mini" data-tp-act="add-sub" title="Alt madde ekle">↳</button><button type="button" class="tp-mini" data-tp-act="remove" title="Sil" aria-label="Maddeyi sil">×</button>` : (item.important ? '<span class="tp-star is-on" aria-label="Önemli">★</span>' : '');
        const subs = item.subs.map(sub => satir(sub, 'tp-sub', 'Alt madde', canEdit ? '<button type="button" class="tp-mini" data-tp-act="remove" title="Sil" aria-label="Alt maddeyi sil">×</button>' : '')).join('');
        return satir(item, 'tp-item', 'Yapılacak', arac) + subs;
      }).join('');
      const ekle = canEdit ? `<button type="button" class="tp-add" data-tp-act="add-item" data-tp-section="${escapeHtml(section.id)}">+ Yapılacak</button>` : '';
      return `<section class="tp-section" data-tp-id="${escapeHtml(section.id)}"><div class="tp-heading-row"><input type="text" class="tp-heading" value="${escapeHtml(section.title)}" placeholder="Başlık (ör. Mutfak, Oda 1, Bahçe)" maxlength="120" aria-label="Başlık"${ro}>${canEdit ? '<button type="button" class="tp-mini" data-tp-act="remove" title="Başlığı sil" aria-label="Başlığı sil">×</button>' : ''}</div>${items}${ekle}</section>`;
    }).join('');
    const bos = !draft.length ? `<p class="tp-empty">${canEdit ? 'Başlık ekleyin (ör. Mutfak), altına yapılacakları yazın. Enter yeni satır, Tab alt madde yapar.' : 'Bu sayfada yapılacak yok.'}</p>` : '';
    return `${bos}${sections}${canEdit ? '<button type="button" class="tp-add tp-add--section" data-tp-act="add-section">+ Başlık</button>' : ''}`;
  }

  /**
   * mount(container, { draft, canEdit, onChange(kind) })
   * kind: 'text' (yazim; gecikmeli kayit), 'mark' (isaret; hemen), 'structure' (ekle/sil; hemen).
   * Govdeyi cizer ve olaylari baglar. Yeniden cizim odagi korur.
   */
  function mount(container, { draft, canEdit = true, onChange = () => {} } = {}) {
    if (!container) return null;
    const ciz = focusId => {
      container.innerHTML = bodyHtml(draft, canEdit);
      if (focusId) {
        const row = container.querySelector(`[data-tp-id="${focusId}"]`);
        const input = row && (row.querySelector('.tp-text') || row.querySelector('.tp-heading'));
        if (input) { input.focus(); const n = input.value.length; try { input.setSelectionRange(n, n); } catch (e) { /* yok */ } }
      }
    };
    const idOf = el => { const row = el.closest('[data-tp-id]'); return row ? row.getAttribute('data-tp-id') : null; };
    const yapi = focusId => { ciz(focusId); onChange('structure'); };

    container.addEventListener('input', ev => {
      const t = ev.target;
      if (!t.classList.contains('tp-text') && !t.classList.contains('tp-heading')) return;
      if (ops.setText(draft, idOf(t), t.value)) onChange('text');
    });
    container.addEventListener('change', ev => {
      const t = ev.target;
      if (!t.classList.contains('tp-check')) return;
      if (ops.toggleDone(draft, idOf(t), t.checked)) {
        const row = t.closest('.tp-row');
        if (row) row.classList.toggle('is-done', t.checked);
        onChange('mark');
      }
    });
    container.addEventListener('click', ev => {
      const b = ev.target.closest('[data-tp-act]');
      if (!b || !canEdit) return;
      const act = b.getAttribute('data-tp-act');
      if (act === 'add-section') return yapi(ops.addSection(draft, null));
      if (act === 'add-item') {
        const section = draft.find(s => s.id === b.getAttribute('data-tp-section'));
        const son = section && section.items[section.items.length - 1];
        return yapi(ops.addItem(draft, section && section.id, son ? son.id : null) || null);
      }
      const id = idOf(b);
      if (act === 'add-sub') return yapi(ops.addSub(draft, id, null));
      if (act === 'remove') return yapi(ops.remove(draft, id));
      if (act === 'star' && ops.toggleImportant(draft, id)) { ciz(); onChange('structure'); }
      return undefined;
    });
    container.addEventListener('keydown', ev => {
      const t = ev.target;
      if (!canEdit || (!t.classList.contains('tp-text') && !t.classList.contains('tp-heading'))) return;
      const id = idOf(t);
      const hit = find(draft, id);
      if (!hit) return;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (hit.sub) return yapi(ops.addSub(draft, hit.item.id, hit.sub.id));
        if (hit.item) return yapi(ops.addItem(draft, hit.section.id, hit.item.id));
        return yapi(ops.addItem(draft, hit.section.id, null));
      }
      if (ev.key === 'Tab' && (hit.item || hit.sub)) {
        const yeni = ev.shiftKey ? (hit.sub ? ops.outdent(draft, id) : null) : (!hit.sub ? ops.indent(draft, id) : null);
        if (yeni) { ev.preventDefault(); yapi(yeni); }
        return undefined;
      }
      if (ev.key === 'Backspace' && t.value === '' && (hit.item || hit.sub)) {
        ev.preventDefault();
        return yapi(ops.remove(draft, id));
      }
      return undefined;
    });
    ciz();
    return { redraw: ciz };
  }

  const api = { fromStored, toStored, progress, storedProgress, ops, bodyHtml, mount, escapeHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TaskPage = api;
})(typeof window !== 'undefined' ? window : null);
