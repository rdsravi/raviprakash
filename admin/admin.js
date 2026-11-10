(() => {
  'use strict';
  const app = document.getElementById('app');
  const LS_KEY = 'rp_admin_github';
  const SERVICE_ICONS = window.RPIcons.SERVICE_ICONS;
  const SITE_ROOT = '../'; // admin lives in /admin/, site content paths are relative to the site root

  const state = { cfg: null, data: null, sha: null, tab: 'site', dirty: false, previews: {}, pendingDeletes: [] };

  // ───────── helpers ─────────
  // DOM builder. Never uses innerHTML, so content can't inject markup into the admin.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const clip = (v, n) => String(v ?? '').trim().slice(0, n);

  function toast(msg, bad) {
    const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), bad ? 6000 : 2800);
  }
  const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); return undefined; } };

  // path stored in content.json -> something the admin can show right now
  const src = (p) => state.previews[p] || (/^(https?:|data:|blob:|\/)/.test(p) ? p : SITE_ROOT + p);

  function markDirty() { state.dirty = true; paintPubBar(); }
  addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ───────── GitHub API ─────────
  const b64 = (str) => { let s = ''; new TextEncoder().encode(str).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const unb64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  async function gh(method, path, body) {
    const c = state.cfg;
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token,
          'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { throw new Error('Could not reach GitHub. Check your internet connection.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) throw new Error('GitHub rejected the token. It may be wrong or expired. Disconnect and add a new one.');
      if (res.status === 403) throw new Error(data.message && /rate/i.test(data.message) ? 'GitHub rate limit hit. Wait a minute and retry.' : 'The token is not allowed to change this repository. It needs "Contents: Read and write".');
      if (res.status === 404) throw new Error('Repository or file not found. Check owner/repo name, and that the token has access to it.');
      if (res.status === 409 || res.status === 422) throw new Error('The file changed on GitHub since you opened it. Reload this page and try again.');
      throw new Error(data.message || 'GitHub error ' + res.status);
    }
    return data;
  }
  const branchQ = () => `?ref=${encodeURIComponent(state.cfg.branch)}`;

  async function loadContent() {
    const d = await gh('GET', '/contents/content.json' + branchQ());
    state.data = JSON.parse(unb64(d.content));
    state.sha = d.sha;
    state.data.gallery ||= [];
    state.dirty = false;
    state.pendingDeletes = [];
  }

  async function publish() {
    const d = state.data;
    const r = await gh('PUT', '/contents/content.json', {
      message: 'Update site content (admin)', content: b64(JSON.stringify(d, null, 2) + '\n'),
      sha: state.sha, branch: state.cfg.branch,
    });
    state.sha = r.content.sha;
    for (const path of state.pendingDeletes) { // best effort: remove files that are no longer used
      try {
        const f = await gh('GET', '/contents/' + path + branchQ());
        await gh('DELETE', '/contents/' + path, { message: 'Remove unused file (admin)', sha: f.sha, branch: state.cfg.branch });
      } catch (e) { /* already gone */ }
    }
    state.pendingDeletes = [];
    state.dirty = false;
    return true;
  }

  const fileToB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

  // Shrinks big photos in the browser so the repo and the site stay fast.
  async function processImage(file) {
    if (file.type === 'application/pdf' || file.type === 'image/gif') return { blob: file, ext: file.type === 'image/gif' ? 'gif' : 'pdf' };
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error('Could not read that image');
    const max = 1800, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const toBlob = (t, q) => new Promise((r) => cv.toBlob(r, t, q));
    if (file.type === 'image/png') { const png = await toBlob('image/png'); if (png && png.size < 1.2e6) return { blob: png, ext: 'png' }; }
    return { blob: await toBlob('image/jpeg', 0.86), ext: 'jpg' };
  }

  async function uploadFile(file) {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!ok.includes(file.type)) throw new Error('Only JPG, PNG, WebP, GIF or PDF files are allowed');
    if (file.size > 25e6) throw new Error('File is larger than 25 MB');
    const { blob, ext } = await processImage(file);
    const path = `uploads/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
    await gh('PUT', '/contents/' + path, { message: 'Upload ' + path + ' (admin)', content: await fileToB64(blob), branch: state.cfg.branch });
    state.previews[path] = URL.createObjectURL(blob);
    return path;
  }

  // ───────── connect screen ─────────
  function guessRepo() {
    const host = location.hostname, seg = location.pathname.split('/').filter(Boolean);
    if (host.endsWith('.github.io')) {
      const owner = host.split('.')[0];
      return { owner, repo: seg[0] && seg[0] !== 'admin' ? seg[0] : host };
    }
    return { owner: 'rdsravi', repo: 'raviprakash' };
  }

  function renderConnect(msg) {
    clear(app);
    const g = guessRepo();
    const owner = h('input', { type: 'text', value: g.owner, autocomplete: 'off' });
    const repo = h('input', { type: 'text', value: g.repo, autocomplete: 'off' });
    const branch = h('input', { type: 'text', value: 'main', autocomplete: 'off' });
    const token = h('input', { type: 'password', autocomplete: 'off', placeholder: 'github_pat_…' });
    const err = h('p', { class: 'err-text', role: 'alert' }, msg || '');
    const form = h('form', { class: 'login-card', style: 'width:min(520px,100%)', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      state.cfg = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', token: token.value.trim() };
      try {
        const info = await gh('GET', '');
        if (info.permissions && !info.permissions.push) throw new Error('This token can read but not write to the repository. Give it "Contents: Read and write".');
        await loadContent();
        localStorage.setItem(LS_KEY, JSON.stringify(state.cfg));
        render();
      } catch (ex) { state.cfg = null; err.textContent = ex.message; }
    } },
      h('h1', {}, 'Admin sign in'),
      h('p', {}, 'This portal edits your site by saving to your GitHub repository. Connect it once on this device with a GitHub token.'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Open ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → New fine-grained token'), '.'),
        h('li', {}, 'Repository access: ', h('b', {}, 'Only select repositories'), ' → pick your portfolio repo.'),
        h('li', {}, 'Permissions → Repository → ', h('b', {}, 'Contents: Read and write'), '. Nothing else.'),
        h('li', {}, 'Generate, copy the token, paste below.')),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', {}, 'GitHub username'), owner),
        h('div', { class: 'field' }, h('label', {}, 'Repository name'), repo)),
      h('div', { class: 'field' }, h('label', {}, 'Branch'), branch),
      h('div', { class: 'field' }, h('label', {}, 'Token', h('span', { class: 'hint' }, ' — stored only in this browser')), token),
      h('button', { class: 'btn pri', type: 'submit' }, 'Connect'), err);
    app.append(h('div', { class: 'login' }, form));
    token.focus();
  }

  // ───────── image / PDF field ─────────
  function imageField(f, value) {
    let val = value || '';
    const isPdf = f.accept === 'pdf';
    const img = h('img', { alt: '' }), ph = h('div', { class: 'ph' }, isPdf ? 'PDF' : 'No image');
    const prev = h('div', {});
    const text = h('input', { type: 'text', value: val, placeholder: 'uploads/… or https://…' });
    const file = h('input', { type: 'file', accept: isPdf ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
    const paint = () => {
      clear(prev);
      if (isPdf) { ph.textContent = val ? 'PDF ✓' : 'No file'; prev.append(ph); }
      else if (val) { img.src = src(val); prev.append(img); } else prev.append(ph);
    };
    text.addEventListener('input', () => { val = text.value.trim(); paint(); });
    file.addEventListener('change', async () => {
      const fl = file.files[0]; if (!fl) return;
      toast('Uploading…');
      const p = await act(() => uploadFile(fl), 'Uploaded');
      if (p) { val = p; text.value = p; paint(); }
      file.value = '';
    });
    paint();
    return { el: h('div', { class: 'imgf' }, prev, h('div', { class: 'col' }, text,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => file.click() }, 'Upload ' + (isPdf ? 'PDF' : 'image')),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { val = ''; text.value = ''; paint(); } }, 'Remove')), file)), get: () => val };
  }

  function sectionsField(value) {
    const items = (value || []).map((x) => ({ ...x }));
    const box = h('div', { class: 'rep' });
    const paint = () => {
      clear(box);
      items.forEach((it, i) => {
        const hd = h('input', { type: 'text', value: it.heading, placeholder: 'Heading', oninput: (e) => { it.heading = e.target.value; } });
        const tx = h('textarea', { rows: 3, placeholder: 'Text (blank line = new paragraph)', oninput: (e) => { it.text = e.target.value; } });
        tx.value = it.text;
        box.append(h('div', { class: 'rep-item' }, hd, tx, h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Section ' + (i + 1)),
          h('span', { class: 'row' },
            h('button', { type: 'button', class: 'btn sm', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; paint(); } }, '↑'),
            h('button', { type: 'button', class: 'btn sm', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; paint(); } }, '↓'),
            h('button', { type: 'button', class: 'btn sm bad', onclick: () => { items.splice(i, 1); paint(); } }, 'Remove')))));
      });
      box.append(h('div', {}, h('button', { type: 'button', class: 'btn sm', onclick: () => { items.push({ heading: '', text: '' }); paint(); } }, '+ Add section')));
    };
    paint();
    return { el: box, get: () => items };
  }

  function buildFields(fields, values = {}) {
    const getters = {};
    const els = fields.map((f) => {
      let ctl, wrap = true;
      const v = values[f.k];
      switch (f.t) {
        case 'textarea': ctl = h('textarea', { rows: f.rows || 4 }); ctl.value = v ?? ''; getters[f.k] = () => ctl.value; break;
        case 'number': ctl = h('input', { type: 'number', min: f.min ?? 0, max: f.max ?? 100, value: v ?? f.def ?? 0 }); getters[f.k] = () => ctl.value; break;
        case 'check': ctl = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: v !== false }), f.l); getters[f.k] = () => ctl.querySelector('input').checked; wrap = false; break;
        case 'icon': ctl = h('select', {}, ...SERVICE_ICONS.map((i) => h('option', { value: i, selected: i === (v || 'layers') }, i))); getters[f.k] = () => ctl.value; break;
        case 'tags': ctl = h('input', { type: 'text', value: (v || []).join(', '), placeholder: 'Android, Web, …' }); getters[f.k] = () => ctl.value.split(','); break;
        case 'image': { const r = imageField(f, v); ctl = r.el; getters[f.k] = r.get; break; }
        case 'sections': { const r = sectionsField(v); ctl = r.el; getters[f.k] = r.get; break; }
        default: ctl = h('input', { type: 'text', value: v ?? '', maxlength: f.max || 300, placeholder: f.ph || '' }); getters[f.k] = () => ctl.value;
      }
      if (!wrap) return h('div', { class: 'field' }, ctl);
      return h('div', { class: 'field' }, h('label', {}, f.l, f.hint ? h('span', { class: 'hint' }, ' — ' + f.hint) : null), ctl);
    });
    return { els, get: () => Object.fromEntries(Object.entries(getters).map(([k, g]) => [k, g()])) };
  }

  // ───────── collections ─────────
  const slugify = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'service';
  const SCHEMAS = {
    services: {
      noun: 'service', prefix: 'svc', required: 'title',
      fields: [
        { k: 'title', l: 'Title', t: 'text' }, { k: 'slug', l: 'URL slug', t: 'text', hint: 'leave blank to generate from title' },
        { k: 'icon', l: 'Icon', t: 'icon' }, { k: 'summary', l: 'Short summary', t: 'textarea', rows: 2, hint: 'shown on the home page' },
        { k: 'sections', l: 'Detail page sections', t: 'sections' }, { k: 'published', l: 'Published (visible on the site)', t: 'check' },
      ],
      clean: (b, cur) => {
        const out = { title: clip(b.title, 120), summary: clip(b.summary, 400), icon: SERVICE_ICONS.includes(b.icon) ? b.icon : 'layers', published: b.published !== false,
          sections: (b.sections || []).map((x) => ({ heading: clip(x.heading, 120), text: clip(x.text, 3000) })).filter((x) => x.heading || x.text).slice(0, 20) };
        const base = slugify(b.slug || out.title); let slug = base, n = 2;
        while (state.data.services.some((x) => x.slug === slug && x.id !== cur?.id)) slug = `${base}-${n++}`;
        out.slug = slug; return out;
      },
      row: (x) => ({ t: x.title, s: x.summary, pill: x.published === false ? ['Draft', 'warn'] : null }),
    },
    projects: {
      noun: 'project', prefix: 'prj', required: 'title',
      fields: [
        { k: 'title', l: 'Title', t: 'text' }, { k: 'description', l: 'Description', t: 'textarea', rows: 3 },
        { k: 'tags', l: 'Tags', t: 'tags', hint: 'comma separated' }, { k: 'link', l: 'Link', t: 'text', hint: 'optional — makes the card clickable', ph: 'https://…' },
        { k: 'image', l: 'Cover image', t: 'image', hint: 'optional — a colourful cover is generated if empty' }, { k: 'published', l: 'Published', t: 'check' },
      ],
      clean: (b) => ({ title: clip(b.title, 120), description: clip(b.description, 600), link: clip(b.link, 300), image: clip(b.image, 300),
        tags: (b.tags || []).map((t) => clip(t, 24)).filter(Boolean).slice(0, 5), published: b.published !== false }),
      row: (x) => ({ t: x.title, s: x.description, img: x.image || '', pill: x.published === false ? ['Draft', 'warn'] : null }),
    },
    skills: {
      noun: 'skill', prefix: 'skl', required: 'name',
      fields: [{ k: 'name', l: 'Skill', t: 'text' }, { k: 'level', l: 'Level (0–100)', t: 'number', max: 100 }],
      clean: (b) => ({ name: clip(b.name, 60), level: Math.max(0, Math.min(100, parseInt(b.level, 10) || 0)) }),
      row: (x) => ({ t: x.name, s: x.level + '%' }),
    },
    experience: {
      noun: 'experience', prefix: 'exp', required: 'role',
      fields: [{ k: 'role', l: 'Role', t: 'text' }, { k: 'org', l: 'Organisation', t: 'text' }, { k: 'period', l: 'Period', t: 'text', ph: 'Jan 2023 – Present' }, { k: 'text', l: 'Details', t: 'textarea', rows: 3 }],
      clean: (b) => ({ role: clip(b.role, 120), org: clip(b.org, 160), period: clip(b.period, 60), text: clip(b.text, 800) }),
      row: (x) => ({ t: x.role, s: [x.org, x.period].filter(Boolean).join(' · ') }),
    },
    education: {
      noun: 'education', prefix: 'edu', required: 'title',
      fields: [{ k: 'title', l: 'Qualification', t: 'text' }, { k: 'org', l: 'Institution', t: 'text' }, { k: 'period', l: 'Period', t: 'text' }],
      clean: (b) => ({ title: clip(b.title, 160), org: clip(b.org, 200), period: clip(b.period, 60) }),
      row: (x) => ({ t: x.title, s: [x.org, x.period].filter(Boolean).join(' · ') }),
    },
  };

  function openEditor(col, item, onDone) {
    const sc = SCHEMAS[col];
    const form = buildFields(sc.fields, item || {});
    const dlg = h('dialog', {});
    const shut = () => { dlg.close(); dlg.remove(); };
    dlg.append(
      h('div', { class: 'dlg-h' }, h('h3', {}, (item ? 'Edit ' : 'Add ') + sc.noun), h('button', { class: 'btn sm', type: 'button', onclick: shut }, 'Close')),
      h('div', { class: 'dlg-b' }, ...form.els),
      h('div', { class: 'dlg-f' }, h('button', { class: 'btn', type: 'button', onclick: shut }, 'Cancel'),
        h('button', { class: 'btn pri', type: 'button', onclick: () => {
          const clean = sc.clean(form.get(), item);
          if (!clean[sc.required]) return toast(`${sc.required[0].toUpperCase() + sc.required.slice(1)} is required`, true);
          const list = state.data[col];
          if (item) list[list.findIndex((x) => x.id === item.id)] = { id: item.id, ...clean };
          else list.push({ id: uid(sc.prefix), ...clean });
          markDirty(); shut(); onDone(); toast('Saved. Press Publish to put it live.');
        } }, 'Save')));
    dlg.addEventListener('cancel', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
  }

  function collectionList(col, rerender) {
    const sc = SCHEMAS[col], list = state.data[col];
    const box = h('div', { class: 'list' });
    if (!list.length) box.append(h('div', { class: 'empty' }, `No ${sc.noun} entries yet.`));
    list.forEach((x, i) => {
      const r = sc.row(x);
      const move = (d) => { const j = i + d; [list[i], list[j]] = [list[j], list[i]]; markDirty(); rerender(); };
      box.append(h('div', { class: 'item' },
        r.img !== undefined ? (r.img ? h('img', { class: 'thumb', src: src(r.img), alt: '' }) : h('div', { class: 'thumb' })) : null,
        h('div', { class: 't' }, h('b', {}, r.t), h('span', {}, r.s || '')),
        r.pill ? h('span', { class: 'pill ' + r.pill[1] }, r.pill[0]) : null,
        h('button', { class: 'btn sm', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(-1) }, '↑'),
        h('button', { class: 'btn sm', disabled: i === list.length - 1, 'aria-label': 'Move down', onclick: () => move(1) }, '↓'),
        h('button', { class: 'btn sm', onclick: () => openEditor(col, x, rerender) }, 'Edit'),
        h('button', { class: 'btn sm bad', onclick: () => { if (!confirm(`Delete "${r.t}"?`)) return; list.splice(i, 1); markDirty(); rerender(); } }, 'Delete')));
    });
    return box;
  }

  // ───────── views ─────────
  const pageHead = (title, sub, ...actions) => h('div', { class: 'top' }, h('div', {}, h('h2', {}, title), sub ? h('p', {}, sub) : null), h('div', { class: 'row' }, ...actions));

  function viewEnquiries(main) {
    const s = state.data.settings, to = s.notifyEmail || s.email;
    main.append(pageHead('Enquiries', 'Messages from your contact form arrive in your email inbox.'));
    const test = h('button', { class: 'btn', onclick: async () => {
      test.disabled = true;
      await act(async () => {
        const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ name: 'Admin test', email: to, subject: 'Test enquiry', message: 'This is a test sent from your admin portal.', _subject: '[Portfolio] Test enquiry', _template: 'table', _captcha: 'false' }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || String(d.success) === 'false') throw new Error(d.message || 'Sending failed');
      }, 'Test sent. Check ' + to);
      test.disabled = false;
    } }, 'Send test enquiry');
    main.append(
      h('div', { class: 'panel' }, h('h3', {}, 'Where enquiries go'),
        h('p', {}, 'Every enquiry is emailed to ', h('b', {}, to || '(not set)'), '. Replying to the email answers the visitor directly.'),
        h('div', { class: 'row' }, h('a', { class: 'btn pri', href: 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent('formsubmit'), target: '_blank', rel: 'noopener' }, 'Open Gmail ↗'), test)),
      h('div', { class: 'panel' }, h('h3', {}, 'First-time activation (do this once)'),
        h('ol', { class: 'steps' },
          h('li', {}, 'Click ', h('b', {}, 'Send test enquiry'), ' above, or submit the form on your live site.'),
          h('li', {}, 'FormSubmit emails you an ', h('b', {}, '"Activate Form"'), ' message. Open it and click the button. Check Spam if you can\'t find it.'),
          h('li', {}, 'After that, every enquiry lands in your inbox with the subject starting "[Portfolio]".')),
        h('p', { class: 'hint' }, 'Why no list here? A static site has no database, so the inbox is where enquiries live. Use a Gmail label or filter on "[Portfolio]" to keep them together.')));
  }

  function viewSite(main) {
    const s = state.data.settings;
    main.append(pageHead('Site content', 'Text, images and links shown on the home page.'));
    const P = (title, fields, vals) => { const b = buildFields(fields, vals); main.append(h('div', { class: 'panel' }, h('h3', {}, title), ...b.els)); return b; };

    const hero = P('Hero', [
      { k: 'name', l: 'Name', t: 'text' }, { k: 'eyebrow', l: 'Small line above the name', t: 'text' },
      { k: 'roles', l: 'Rotating roles', t: 'textarea', rows: 5, hint: 'one per line' },
      { k: 'heroIntro', l: 'Intro paragraph', t: 'textarea', rows: 3 },
      { k: 'availability', l: 'Availability badge', t: 'text', hint: 'leave blank to hide' },
      { k: 'heroImage', l: 'Portrait photo', t: 'image' },
    ], { ...s, roles: (s.roles || []).join('\n') });
    const about = P('About', [{ k: 'aboutTitle', l: 'Heading', t: 'text' }, { k: 'aboutBody', l: 'Body', t: 'textarea', rows: 9, hint: 'blank line = new paragraph' }], s);
    const contact = P('Contact', [
      { k: 'notifyEmail', l: 'Send enquiries to', t: 'text', hint: 'the inbox that receives contact-form messages' },
      { k: 'email', l: 'Public email', t: 'text', hint: 'shown on the site' }, { k: 'phone', l: 'Phone', t: 'text' },
      { k: 'location', l: 'Location', t: 'text' }, { k: 'footerText', l: 'Footer name', t: 'text' },
    ], s);
    const social = P('Social links', SOCIAL_KEYS.map((k) => ({ k, l: k[0].toUpperCase() + k.slice(1), t: 'text', ph: 'https://…' })), s.social || {});
    const files = P('CV / resume file', [{ k: 'cvFile', l: 'PDF', t: 'image', accept: 'pdf', hint: 'adds a "Download CV" button on the home page' }], s);

    const rows = [0, 1, 2].map((i) => ({ v: h('input', { type: 'text', maxlength: 12, value: s.stats?.[i]?.value || '', placeholder: '7' }), l: h('input', { type: 'text', maxlength: 40, value: s.stats?.[i]?.label || '', placeholder: 'Services offered' }) }));
    main.append(h('div', { class: 'panel' }, h('h3', {}, 'Highlight numbers'), h('p', { class: 'hint' }, 'Shown under the hero. Leave a row empty to hide it.'),
      ...rows.map((r) => h('div', { class: 'grid2' }, h('div', { class: 'field' }, r.v), h('div', { class: 'field' }, r.l)))));

    main.append(h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => {
      const a = hero.get(), b = about.get(), c = contact.get(), f = files.get();
      Object.assign(s, {
        name: clip(a.name, 120), eyebrow: clip(a.eyebrow, 160), heroIntro: clip(a.heroIntro, 1200), availability: clip(a.availability, 80), heroImage: clip(a.heroImage, 300),
        roles: a.roles.split('\n').map((r) => clip(r, 60)).filter(Boolean).slice(0, 12),
        aboutTitle: clip(b.aboutTitle, 200), aboutBody: clip(b.aboutBody, 6000),
        notifyEmail: clip(c.notifyEmail, 200), email: clip(c.email, 200), phone: clip(c.phone, 40), location: clip(c.location, 120), footerText: clip(c.footerText, 80),
        cvFile: clip(f.cvFile, 300),
        stats: rows.map((r) => ({ value: clip(r.v.value, 12), label: clip(r.l.value, 40) })).filter((x) => x.value || x.label),
      });
      s.social = { ...s.social, ...Object.fromEntries(Object.entries(social.get()).map(([k, v]) => [k, clip(v, 300)])) };
      s.brand = s.name;
      markDirty(); toast('Applied. Press Publish to put it live.');
    } }, 'Apply changes')));
  }
  const SOCIAL_KEYS = ['linkedin', 'github', 'instagram', 'facebook', 'youtube'];

  function viewCollection(main, col, title, sub) {
    const box = h('div', {});
    const paint = () => { clear(box); box.append(collectionList(col, paint)); };
    main.append(pageHead(title, sub, h('button', { class: 'btn pri', onclick: () => openEditor(col, null, paint) }, '+ Add ' + SCHEMAS[col].noun)), box);
    paint();
  }

  function viewResume(main) {
    main.append(pageHead('Resume', 'Experience, education and skills shown in the resume section.'));
    [['experience', 'Experience'], ['education', 'Education'], ['skills', 'Skills']].forEach(([col, label]) => {
      const box = h('div', {});
      const paint = () => { clear(box); box.append(collectionList(col, paint)); };
      main.append(h('div', { class: 'panel' }, h('div', { class: 'top', style: 'margin-bottom:14px' }, h('h3', {}, label), h('button', { class: 'btn sm pri', onclick: () => openEditor(col, null, paint) }, '+ Add')), box));
      paint();
    });
  }

  function viewGallery(main) {
    const list = state.data.gallery;
    const grid = h('div', { class: 'gal' });
    const input = h('input', { type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
    const drop = h('div', { class: 'drop' }, 'Drag photos here, or ', h('button', { class: 'btn sm', onclick: () => input.click() }, 'choose files'),
      h('div', { class: 'hint', style: 'margin-top:8px' }, 'JPG, PNG, WebP or GIF. Large photos are shrunk automatically. Each photo uploads straight to GitHub.'));
    let busy = false;
    const upload = async (files) => {
      files = [...files].filter((f) => f.type.startsWith('image/'));
      if (!files.length || busy) return;
      busy = true; drop.classList.add('over');
      let done = 0;
      for (const f of files) {
        try { const p = await uploadFile(f); list.push({ id: uid('gal'), file: p, caption: '' }); done++; markDirty(); paint(); toast(`Uploaded ${done} of ${files.length}`); }
        catch (e) { toast(f.name + ': ' + e.message, true); }
      }
      busy = false; drop.classList.remove('over');
    };
    input.addEventListener('change', () => { upload(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); if (!busy) drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => upload(e.dataTransfer.files));

    const paint = () => {
      clear(grid);
      if (!list.length) grid.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, 'No photos yet. Add some above.'));
      list.forEach((g, i) => {
        const cap = h('input', { type: 'text', value: g.caption || '', placeholder: 'Caption (optional)', maxlength: 160 });
        cap.addEventListener('change', () => { g.caption = clip(cap.value, 160); markDirty(); });
        const move = (d) => { const j = i + d; [list[i], list[j]] = [list[j], list[i]]; markDirty(); paint(); };
        grid.append(h('div', { class: 'gcard' }, h('img', { src: src(g.file), alt: g.caption || '', loading: 'lazy' }),
          h('div', { class: 'gb' }, cap, h('div', { class: 'row' },
            h('button', { class: 'btn sm', disabled: i === 0, onclick: () => move(-1) }, '←'),
            h('button', { class: 'btn sm', disabled: i === list.length - 1, onclick: () => move(1) }, '→'),
            h('button', { class: 'btn sm bad', onclick: () => {
              if (!confirm('Delete this photo?')) return;
              if (g.file.startsWith('uploads/')) state.pendingDeletes.push(g.file);
              list.splice(i, 1); markDirty(); paint();
            } }, 'Delete')))));
      });
    };
    main.append(pageHead('Gallery', 'Photos shown on the public Gallery page.', h('a', { class: 'btn', href: SITE_ROOT + 'gallery.html', target: '_blank', rel: 'noopener' }, 'View gallery ↗')), drop, input, grid);
    paint();
  }

  function viewSettings(main) {
    const c = state.cfg;
    main.append(pageHead('Connection'));
    main.append(h('div', { class: 'panel' }, h('h3', {}, 'GitHub'),
      h('p', {}, 'Saving to ', h('code', {}, `${c.owner}/${c.repo}`), ' on branch ', h('code', {}, c.branch), '.'),
      h('p', { class: 'hint' }, 'After you press Publish, GitHub Pages rebuilds the site. Changes are usually live within a minute or two.'),
      h('div', { class: 'row' },
        h('a', { class: 'btn', href: `https://github.com/${c.owner}/${c.repo}/actions`, target: '_blank', rel: 'noopener' }, 'See deploy status ↗'),
        h('a', { class: 'btn', href: SITE_ROOT, target: '_blank', rel: 'noopener' }, 'View live site ↗'),
        h('button', { class: 'btn bad', onclick: () => {
          if (state.dirty && !confirm('You have unpublished changes. Disconnect anyway?')) return;
          localStorage.removeItem(LS_KEY); state.cfg = null; state.dirty = false; renderConnect();
        } }, 'Disconnect this device'))));
    main.append(h('div', { class: 'panel' }, h('h3', {}, 'Good to know'),
      h('ul', { class: 'steps' },
        h('li', {}, 'Your token is stored only in this browser. Anyone who opens /admin without it sees just the sign-in page and cannot change anything.'),
        h('li', {}, 'Use a fine-grained token limited to this one repository, with an expiry date. If it ever leaks, delete it on GitHub and nothing else is at risk.'),
        h('li', {}, 'Every Publish is a normal Git commit, so you can always undo a change from your repo history.'))));
  }

  // ───────── shell ─────────
  const TABS = [['site', 'Site content'], ['services', 'Services'], ['projects', 'Projects'], ['resume', 'Resume'], ['gallery', 'Gallery'], ['enquiries', 'Enquiries'], ['settings', 'Connection']];

  function paintPubBar() {
    let bar = document.getElementById('pubbar');
    if (!state.dirty) { bar?.remove(); return; }
    if (bar) return;
    bar = h('div', { class: 'pubbar', id: 'pubbar' }, h('span', {}, 'You have unpublished changes.'), h('span', { class: 'row' },
      h('button', { class: 'btn ghost sm', onclick: async () => {
        if (!confirm('Discard all unpublished changes?')) return;
        await act(loadContent); render();
      } }, 'Discard'),
      h('button', { class: 'btn pri sm', id: 'pubbtn', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Publishing…';
        const ok = await act(publish);
        b.disabled = false; b.textContent = 'Publish';
        if (!ok) return;
        toast('Published! Your site will update in about a minute.');
        paintPubBar(); render();
      } }, 'Publish')));
    document.body.append(bar);
  }

  function render() {
    clear(app);
    const main = h('main', { class: 'main' });
    const side = h('aside', { class: 'side' }, h('div', { class: 'logo' }, h('i', {}, 'A'), 'Admin'),
      ...TABS.map(([k, l]) => h('button', { class: 'tab' + (state.tab === k ? ' on' : ''), onclick: () => { state.tab = k; render(); scrollTo(0, 0); } }, l)),
      h('div', { class: 'sp' }),
      h('a', { class: 'tab', href: SITE_ROOT, target: '_blank', rel: 'noopener' }, 'View site ↗'));
    app.append(h('div', { class: 'shell' }, side, main));
    ({
      site: () => viewSite(main),
      services: () => viewCollection(main, 'services', 'Services', 'Each service gets its own detail page.'),
      projects: () => viewCollection(main, 'projects', 'Projects', 'Shown in the "Selected work" grid.'),
      resume: () => viewResume(main), gallery: () => viewGallery(main), enquiries: () => viewEnquiries(main), settings: () => viewSettings(main),
    })[state.tab]();
    paintPubBar();
  }

  // ───────── boot ─────────
  (async () => {
    try { state.cfg = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { state.cfg = null; }
    if (!state.cfg || !state.cfg.token) return renderConnect();
    try { await loadContent(); render(); }
    catch (e) { state.cfg = null; renderConnect(e.message); }
  })();
})();
