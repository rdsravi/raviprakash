/**
 * Admin UI toolkit (vanilla JS).
 *
 * Everything is built with DOM methods and textContent, never innerHTML with data,
 * so content from the server (including visitor-submitted inquiries) can never run as HTML.
 * No inline styles or scripts are produced, so the strict Content-Security-Policy holds.
 */
(function () {
  'use strict';

  const UI = {};
  let uid = 0;
  const nextId = (p) => (p || 'u') + '-' + ++uid;

  /* ───────── DOM builder ───────── */
  UI.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    let deferredValue;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') deferredValue = v; // set after <option>s exist
      else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required' || k === 'readOnly' || k === 'multiple') el[k] = Boolean(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    const add = (kid) => {
      if (kid === null || kid === undefined || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else if (kid instanceof Node) el.appendChild(kid);
      else el.appendChild(document.createTextNode(String(kid)));
    };
    kids.forEach(add);
    if (deferredValue !== undefined) el.value = deferredValue;
    return el;
  };
  const h = UI.h;

  UI.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /** Static, trusted SVG markup from icons.js -> element. */
  UI.icon = function (name, size) {
    const t = document.createElement('template');
    t.innerHTML = window.RPIcons.icon(name, size || 18).trim();
    return t.content.firstChild;
  };

  UI.btn = function (label, o) {
    o = o || {};
    const b = h('button', {
      type: o.type || 'button',
      class: 'btn' + (o.kind ? ' btn-' + o.kind : '') + (o.small ? ' btn-sm' : '') + (o.iconOnly ? ' btn-icon' : ''),
      'aria-label': o.label || (o.iconOnly ? label : null),
      title: o.title || (o.iconOnly ? label : null),
      onClick: o.onClick,
      disabled: o.disabled,
    }, o.icon ? UI.icon(o.icon, o.small ? 15 : 17) : null, o.iconOnly ? null : h('span', { text: label }));
    return b;
  };

  /** Disable a button and show a spinner while an async action runs. */
  UI.busy = async function (btn, fn) {
    if (!btn) return fn();
    const prev = btn.disabled;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('is-busy');
    try { return await fn(); }
    finally { btn.disabled = prev; btn.removeAttribute('aria-busy'); btn.classList.remove('is-busy'); }
  };

  /* ───────── dates ───────── */
  UI.date = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };
  UI.ago = (iso) => {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (isNaN(s)) return '';
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
    return UI.date(iso).split(',')[0];
  };
  UI.bytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

  /* ───────── toast ───────── */
  UI.toast = function (message, kind) {
    let box = document.getElementById('toasts');
    if (!box) {
      box = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(box);
    }
    const t = h('div', { class: 'toast' + (kind === 'err' ? ' toast-err' : ''), text: message });
    box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 7000 : 4000);
  };
  UI.error = (e) => UI.toast(e && e.message ? e.message : 'Something went wrong.', 'err');

  /* ───────── modal (native <dialog>) ───────── */
  UI.modal = function (o) {
    const titleId = nextId('dlg');
    const dlg = h('dialog', { class: 'modal modal-' + (o.size || 'md'), 'aria-labelledby': titleId });
    const closeBtn = UI.btn('Close', { kind: 'ghost', iconOnly: true, icon: 'close', small: true });
    const footer = o.footer ? h('div', { class: 'modal-foot' }, o.footer) : null;
    dlg.append(
      h('div', { class: 'modal-head' }, h('h2', { id: titleId, text: o.title }), closeBtn),
      h('div', { class: 'modal-body' }, o.body),
      footer
    );
    document.body.appendChild(dlg);
    let done;
    const closed = new Promise((r) => { done = r; });
    let result;
    const finish = () => { dlg.remove(); done(result); if (o.onClose) o.onClose(result); };
    dlg.addEventListener('close', finish);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) api.close(); }); // backdrop
    closeBtn.addEventListener('click', () => api.close());
    const api = {
      el: dlg,
      closed,
      close(r) {
        result = r;
        if (dlg.close) dlg.close(); else { dlg.removeAttribute('open'); finish(); }
      },
    };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    return api;
  };

  UI.confirm = function (o) {
    return new Promise((resolve) => {
      const yes = UI.btn(o.confirmText || 'Confirm', { kind: o.danger ? 'danger' : 'primary' });
      const no = UI.btn(o.cancelText || 'Cancel', { kind: 'ghost' });
      const m = UI.modal({
        title: o.title || 'Are you sure?', size: 'sm',
        body: h('p', { class: 'confirm-text', text: o.message || '' }),
        footer: [no, yes],
      });
      yes.addEventListener('click', () => m.close(true));
      no.addEventListener('click', () => m.close(false));
      m.closed.then((r) => resolve(r === true));
      no.focus();
    });
  };

  /** The "up" arrow icon, turned upside down, serves as "down". */
  const flipDown = (btn) => { const s = btn.querySelector('svg'); if (s) s.classList.add('flip'); return btn; };
  UI.flipDown = flipDown;

  /* ───────── form engine ───────── */
  /**
   * fields: [{ name, label, type, help, placeholder, required, max, rows, min, options, wide, kind, itemFields, maxItems }]
   * types: text url email tel textarea number range select checkbox tags lines media list icon
   */
  UI.form = function (fields, values) {
    values = values || {};
    const root = h('div', { class: 'form-grid' });
    const ctl = {};

    const fire = (el) => el.dispatchEvent(new Event('input', { bubbles: true }));

    function build(f) {
      const id = nextId('f');
      const errId = id + '-err';
      const v = values[f.name] !== undefined ? values[f.name] : f.default;
      const common = { id, name: f.name, 'aria-describedby': errId, maxlength: f.max || null, placeholder: f.placeholder || null };
      let input, get, set, el;

      switch (f.type) {
        case 'textarea': case 'lines': {
          input = h('textarea', Object.assign({}, common, { rows: f.rows || (f.type === 'lines' ? 5 : 4) }));
          set = (x) => { input.value = f.type === 'lines' ? (x || []).join('\n') : x || ''; };
          get = () => (f.type === 'lines' ? input.value.split('\n').map((s) => s.trim()).filter(Boolean) : input.value);
          el = input; break;
        }
        case 'number': case 'range': {
          input = h('input', { id, name: f.name, type: f.type, min: f.min, max: f.maxValue, step: f.step || 1, 'aria-describedby': errId });
          set = (x) => { input.value = x === undefined || x === null || x === '' ? (f.default !== undefined ? f.default : '') : x; };
          get = () => (input.value === '' ? '' : Number(input.value));
          if (f.type === 'range') {
            const out = h('output', { class: 'range-out', for: id });
            const sync = () => { out.textContent = input.value + '%'; };
            input.addEventListener('input', sync);
            el = h('div', { class: 'range' }, input, out);
            const baseSet = set; set = (x) => { baseSet(x); sync(); };
          } else el = input;
          break;
        }
        case 'select': {
          input = h('select', { id, name: f.name, 'aria-describedby': errId },
            (f.options || []).map((o) => { const ov = typeof o === 'string' ? o : o.value; const ol = typeof o === 'string' ? o : o.label; return h('option', { value: ov, text: ol }); }));
          set = (x) => { input.value = x !== undefined && x !== null ? x : (f.default !== undefined ? f.default : (input.options[0] || {}).value); };
          get = () => input.value;
          el = input; break;
        }
        case 'checkbox': {
          input = h('input', { id, name: f.name, type: 'checkbox', 'aria-describedby': errId });
          set = (x) => { input.checked = x === undefined ? Boolean(f.default) : Boolean(x); };
          get = () => input.checked;
          el = h('label', { class: 'switch', for: id }, input, h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', { class: 'sw-txt', text: f.switchLabel || f.label }));
          break;
        }
        case 'icon': {
          const grid = h('div', { class: 'icon-grid', role: 'radiogroup', 'aria-label': f.label, id });
          const radios = (f.options || []).map((name) => {
            const r = h('input', { type: 'radio', name: f.name + '-' + id, value: name });
            const lab = h('label', { class: 'icon-opt', title: name }, r, UI.icon(name, 22), h('span', { class: 'sr-only', text: name }));
            grid.appendChild(lab);
            return r;
          });
          input = radios[0];
          set = (x) => { const want = x || f.default || (f.options || [])[0]; radios.forEach((r) => { r.checked = r.value === want; }); };
          get = () => { const c = radios.find((r) => r.checked); return c ? c.value : ''; };
          el = grid; break;
        }
        case 'tags': {
          let tags = [];
          const chips = h('span', { class: 'chips' });
          input = h('input', { id, type: 'text', class: 'tag-input', placeholder: f.placeholder || 'Type and press Enter', 'aria-describedby': errId, maxlength: f.max || 24 });
          const draw = () => {
            UI.clear(chips);
            tags.forEach((t, i) => chips.appendChild(h('span', { class: 'tag' }, t,
              h('button', { type: 'button', class: 'tag-x', 'aria-label': 'Remove ' + t, onClick: () => { tags.splice(i, 1); draw(); fire(wrap); input.focus(); } }, UI.icon('close', 12)))));
          };
          const addFromInput = () => {
            const parts = input.value.split(',').map((s) => s.trim()).filter(Boolean);
            parts.forEach((p) => { if (!tags.some((t) => t.toLowerCase() === p.toLowerCase()) && tags.length < (f.maxItems || 10)) tags.push(p); });
            input.value = ''; draw(); if (parts.length) fire(wrap);
          };
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFromInput(); }
            else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); fire(wrap); }
          });
          input.addEventListener('blur', addFromInput);
          const wrap = h('div', { class: 'tags-box' }, chips, input);
          set = (x) => { tags = Array.isArray(x) ? x.slice() : []; draw(); };
          get = () => { addFromInput(); return tags.slice(); };
          el = wrap; break;
        }
        case 'media': {
          input = h('input', { id, name: f.name, type: 'text', 'aria-describedby': errId, placeholder: f.placeholder || (f.kind === 'pdf' ? 'Upload a PDF or paste a link' : 'Upload an image or paste a link'), maxlength: f.max || 300 });
          const prev = h('div', { class: 'media-prev', hidden: true });
          const img = h('img', { alt: '', loading: 'lazy' });
          prev.appendChild(img);
          const refresh = () => {
            const val = input.value.trim();
            const src = f.kind === 'pdf' ? '' : window.AdminAPI.mediaUrl(val);
            prev.hidden = !(src);
            if (src) img.src = src;
          };
          img.addEventListener('error', () => { prev.hidden = true; });
          input.addEventListener('input', refresh);
          const file = h('input', { type: 'file', class: 'sr-only', tabindex: '-1', accept: f.kind === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/gif', 'aria-hidden': 'true' });
          const up = UI.btn('Upload', { icon: 'download', small: true, kind: 'ghost' });
          up.querySelector('svg').classList.add('flip');
          const lib = UI.btn('Library', { icon: 'image', small: true, kind: 'ghost' });
          const clr = UI.btn('Clear', { icon: 'close', small: true, kind: 'ghost' });
          up.addEventListener('click', () => file.click());
          file.addEventListener('change', async () => {
            if (!file.files[0]) return;
            await UI.busy(up, async () => {
              try { const r = await window.AdminAPI.upload(file.files[0]); input.value = r.url; refresh(); fire(wrap); UI.toast('Uploaded.'); }
              catch (e) { UI.error(e); }
            });
            file.value = '';
          });
          lib.addEventListener('click', async () => {
            const pick = await window.Admin.pickMedia(f.kind || 'image');
            if (pick) { input.value = pick; refresh(); fire(wrap); }
          });
          clr.addEventListener('click', () => { input.value = ''; refresh(); fire(wrap); });
          const wrap = h('div', { class: 'media-field' }, h('div', { class: 'media-row' }, input), h('div', { class: 'media-actions' }, up, lib, clr, file), prev);
          set = (x) => { input.value = x || ''; refresh(); };
          get = () => input.value.trim();
          el = wrap; break;
        }
        case 'list': {
          const items = [];
          const holder = h('div', { class: 'list-editor' });
          const rowsEl = h('div', { class: 'list-rows' });
          const add = UI.btn(f.addLabel || 'Add item', { icon: 'check', small: true, kind: 'ghost' });
          const draw = () => {
            UI.clear(rowsEl);
            items.forEach((it, i) => {
              const subs = f.itemFields.map((sf) => {
                const sid = nextId('li');
                const ctrl = sf.type === 'textarea'
                  ? h('textarea', { id: sid, rows: sf.rows || 3, maxlength: sf.max || null, placeholder: sf.placeholder || null })
                  : h('input', { id: sid, type: 'text', maxlength: sf.max || null, placeholder: sf.placeholder || null });
                ctrl.value = it[sf.name] || '';
                ctrl.addEventListener('input', () => { it[sf.name] = ctrl.value; });
                return h('div', { class: 'f' }, h('label', { for: sid, text: sf.label }), ctrl);
              });
              rowsEl.appendChild(h('div', { class: 'list-row' },
                h('div', { class: 'list-fields' }, subs),
                h('div', { class: 'list-ctl' },
                  UI.btn('Move up', { iconOnly: true, icon: 'up', small: true, kind: 'ghost', disabled: i === 0, onClick: () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); draw(); fire(holder); } }),
                  flipDown(UI.btn('Move down', { iconOnly: true, icon: 'up', small: true, kind: 'ghost', disabled: i === items.length - 1, onClick: () => { items.splice(i + 1, 0, items.splice(i, 1)[0]); draw(); fire(holder); } })),
                  UI.btn('Remove', { iconOnly: true, icon: 'close', small: true, kind: 'ghost', onClick: () => { items.splice(i, 1); draw(); fire(holder); } }))));
            });
            add.disabled = items.length >= (f.maxItems || 20);
          };
          rowsEl.addEventListener('input', () => fire(holder));
          add.addEventListener('click', () => { items.push({}); draw(); fire(holder); const first = rowsEl.querySelector('.list-row:last-child input, .list-row:last-child textarea'); first && first.focus(); });
          holder.append(rowsEl, add);
          input = add;
          set = (x) => { items.length = 0; (Array.isArray(x) ? x : []).forEach((o) => items.push(Object.assign({}, o))); draw(); };
          get = () => items.map((o) => Object.assign({}, o));
          el = holder;
          break;
        }
        default: { // text url email tel
          input = h('input', Object.assign({}, common, { type: f.type === 'text' || !f.type ? 'text' : f.type, autocomplete: f.autocomplete || 'off' }));
          set = (x) => { input.value = x || ''; };
          get = () => input.value;
          el = input;
        }
      }
      set(v);
      const err = h('span', { class: 'err', id: errId, role: 'alert' });
      const labelEl = f.type === 'checkbox' ? null : h('label', { for: id, text: f.label }, f.required ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null);
      const wrapper = h('div', { class: 'f f-' + (f.type || 'text') + (f.wide ? ' wide' : '') },
        labelEl, el, f.help ? h('p', { class: 'help', text: f.help }) : null, err);
      return {
        wrapper, input, get, set,
        error(msg) {
          err.textContent = msg || '';
          const target = f.type === 'tags' || f.type === 'media' ? input : input;
          if (target && target.setAttribute) { if (msg) target.setAttribute('aria-invalid', 'true'); else target.removeAttribute('aria-invalid'); }
          wrapper.classList.toggle('has-err', Boolean(msg));
        },
      };
    }

    fields.forEach((f) => {
      const c = build(f);
      ctl[f.name] = c;
      root.appendChild(c.wrapper);
      c.wrapper.addEventListener('input', () => c.error(''));
    });

    return {
      el: root,
      get() { const o = {}; fields.forEach((f) => { o[f.name] = ctl[f.name].get(); }); return o; },
      setValues(vals) { fields.forEach((f) => ctl[f.name].set(vals[f.name])); },
      setErrors(map) {
        let first = null;
        fields.forEach((f) => { const m = map && map[f.name]; ctl[f.name].error(m || ''); if (m && !first) first = f.name; });
        if (first && ctl[first].input && ctl[first].input.focus) ctl[first].input.focus();
        return Boolean(first);
      },
      clearErrors() { fields.forEach((f) => ctl[f.name].error('')); },
      onChange(fn) { root.addEventListener('input', fn); root.addEventListener('change', fn); },
      focus() { const f = fields[0]; f && ctl[f.name].input && ctl[f.name].input.focus(); },
    };
  };

  /**
   * Modal form with Save / Cancel. `onSave(values)` must return a promise.
   * Server-side field errors (HTTP 422) are shown next to the matching fields.
   * Resolves with whatever onSave returned, or null when cancelled.
   */
  UI.editor = function (o) {
    return new Promise((resolve) => {
      const form = UI.form(o.fields, o.values || {});
      const status = h('p', { class: 'form-error', role: 'alert' });
      const save = UI.btn(o.saveText || 'Save', { kind: 'primary' });
      const cancel = UI.btn('Cancel', { kind: 'ghost' });
      const formEl = h('form', { class: 'editor', novalidate: true }, form.el, status,
        h('button', { type: 'submit', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' })); // lets Enter submit
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        status.textContent = '';
        form.clearErrors();
        await UI.busy(save, async () => {
          try {
            const res = await o.onSave(form.get());
            m.close(res === undefined ? true : res);
          } catch (err) {
            if (err && err.fields) { form.setErrors(err.fields); status.textContent = 'Please fix the highlighted fields.'; }
            else { status.textContent = err.message || 'Could not save.'; }
          }
        });
      });
      cancel.addEventListener('click', () => m.close(null));
      const m = UI.modal({ title: o.title, size: o.size || 'md', body: formEl, footer: [cancel, save] });
      // the footer sits outside <form>, so the Save button submits it explicitly
      save.addEventListener('click', () => (formEl.requestSubmit ? formEl.requestSubmit() : formEl.dispatchEvent(new Event('submit', { cancelable: true }))));
      m.closed.then((r) => resolve(r === undefined ? null : r));
      setTimeout(() => form.focus(), 30);
    });
  };

  UI.empty = (text, action) => h('div', { class: 'empty' }, h('p', { text }), action || null);
  UI.spinner = (label) => h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), h('span', { text: label || 'Loading…' }));

  window.UI = UI;
})();
