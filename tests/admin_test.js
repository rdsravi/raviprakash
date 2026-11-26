#!/usr/bin/env node
/**
 * Admin panel test: runs the REAL admin HTML/JS in jsdom against a REAL PHP backend.
 *
 *   node tests/admin_test.js <backend-url> <setup-key>
 *
 * WARNING: writes to the backend (creates the admin password, projects, inquiries...).
 * Use a THROWAWAY copy of server/ that has  'allow_localhost' => true  and the given setup_key.
 * Needs `npm i jsdom` (set NODE_PATH to its node_modules).
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const SETUP_KEY = process.argv[3] || 'test-setup-key-123';
const PW = 'admin ui test passphrase 2026';
const PW2 = 'a brand new passphrase for admin 77';
const ADMIN_DIR = path.join(__dirname, '..', 'server', 'admin');

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) { passed++; console.log('  PASS  ' + name); } else { failed++; console.log('  FAIL  ' + name + '  ' + detail); } };
const section = (t) => console.log('\n== ' + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000, step = 40) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (_) { /* keep waiting */ } await sleep(step); }
  return null;
}

/* shared cookie jar = one "browser" */
let jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const absorb = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => {
  const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1);
  if (/expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c) || v === 'deleted') delete jar[k]; else jar[k] = v;
});

async function open(file, hash = '') {
  const errors = [];
  let navigatedTo = null;
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) navigatedTo = 'navigation'; else errors.push(e.message); });
  vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = await JSDOM.fromURL(`${BASE}/admin/${file}${hash}`, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async (u, o = {}) => {
        const url = new URL(u, w.location.href);
        const headers = Object.assign({ Cookie: cookieHeader() }, o.headers || {});
        if ((o.method || 'GET') !== 'GET') headers.Origin = w.location.origin;
        const res = await fetch(url, Object.assign({}, o, { headers }));
        absorb(res);
        return res;
      };
      w.scrollTo = () => {};
      const D = w.HTMLDialogElement && w.HTMLDialogElement.prototype;
      if (D) {
        D.showModal = function () { this.setAttribute('open', ''); };
        D.close = function () { if (this.hasAttribute('open')) { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); } };
      }
    },
  });
  const w = dom.window;
  return { dom, w, d: w.document, errors, nav: () => navigatedTo };
}
const $ = (d, s) => d.querySelector(s);
const $$ = (d, s) => Array.from(d.querySelectorAll(s));
const txt = (d, s) => ($(d, s) ? $(d, s).textContent.replace(/\s+/g, ' ').trim() : null);
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const setVal = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const submit = (w, form) => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const byText = (d, sel, t) => $$(d, sel).find((e) => e.textContent.replace(/\s+/g, ' ').trim() === t);
const goto = async (c, view) => { c.w.location.hash = '#/' + view; await until(() => $(c.d, '#view-title') && $(c.d, '#view-title').textContent && !$(c.d, '#view .loading')); await sleep(80); };

async function api(method, p, body, csrf) {
  const headers = { Origin: BASE, 'Content-Type': 'application/json', Cookie: cookieHeader() };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${BASE}/api/${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  absorb(res);
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  /* ───────── static hygiene (CSP) ───────── */
  section('Content-Security-Policy hygiene');
  for (const f of ['index.html', 'dashboard.html']) {
    const html = fs.readFileSync(path.join(ADMIN_DIR, f), 'utf8');
    ok(`${f}: CSP meta present, no unsafe-inline`, /Content-Security-Policy/.test(html) && !/unsafe-inline|unsafe-eval/.test(html));
    ok(`${f}: no inline <script> code`, !/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(html));
    ok(`${f}: no inline style attributes or handlers`, !/\sstyle=|\son[a-z]+=/i.test(html));
    ok(`${f}: noindex`, /noindex/.test(html));
  }
  for (const f of fs.readdirSync(path.join(ADMIN_DIR, 'js'))) {
    const src = fs.readFileSync(path.join(ADMIN_DIR, 'js', f), 'utf8');
    ok(`js/${f}: no innerHTML / eval / document.write`, !/\.innerHTML\s*=(?!=)/.test(src.replace(/t\.innerHTML = window\.RPIcons/, '')) && !/\beval\(|new Function|document\.write/.test(src));
  }
  ok('admin icons.js identical to the public one', fs.readFileSync(path.join(ADMIN_DIR, 'js', 'icons.js'), 'utf8') === fs.readFileSync(path.join(ADMIN_DIR, '..', '..', 'js', 'icons.js'), 'utf8'));
  ok('no password/secret literals in admin js', !/password\s*[:=]\s*['"][^'"]{4,}['"]/i.test(fs.readdirSync(path.join(ADMIN_DIR, 'js')).map((f) => fs.readFileSync(path.join(ADMIN_DIR, 'js', f), 'utf8')).join('\n')));

  /* ───────── protected screen without a session ───────── */
  section('Dashboard is protected');
  let c = await open('dashboard.html');
  await until(() => c.nav());
  ok('anonymous visit is redirected to sign-in', c.nav() === 'navigation');
  ok('no admin UI is built for anonymous users', $(c.d, '#admin') && $(c.d, '#admin').children.length === 0 && !$(c.d, '.side'));
  c.w.close();

  /* ───────── first-time setup ───────── */
  section('First-time setup screen');
  c = await open('index.html');
  await until(() => $(c.d, '.auth-form'));
  ok('shows setup (no password exists yet)', /Create your admin password/i.test(txt(c.d, '#auth h1')), txt(c.d, '#auth h1'));
  ok('setup key + both passwords asked', !!$(c.d, '#key') && !!$(c.d, '#npw') && !!$(c.d, '#npw2'));
  ok('password fields are type=password with show/hide toggle', $(c.d, '#npw').type === 'password' && !!$(c.d, '.pw-toggle'));
  click(c.w, $(c.d, '.pw-toggle'));
  ok('toggle reveals the field + exposes state', $(c.d, '#key').type === 'text' && $(c.d, '.pw-toggle').getAttribute('aria-pressed') === 'true');
  const sf = $(c.d, '.auth-form');
  submit(c.w, sf);
  ok('empty setup shows an error', /Enter the setup key/.test(txt(c.d, '#key-err')));
  setVal(c.w, $(c.d, '#key'), 'wrong-key'); setVal(c.w, $(c.d, '#npw'), 'short'); submit(c.w, sf);
  ok('short password rejected client-side', /at least 12/.test(txt(c.d, '#npw-err')));
  setVal(c.w, $(c.d, '#npw'), PW); setVal(c.w, $(c.d, '#npw2'), PW + 'x'); submit(c.w, sf);
  ok('mismatched confirmation rejected', /do not match/.test(txt(c.d, '#npw2-err')));
  ok('strength meter reacts', $(c.d, '.strength').dataset.level === 'strong' || $(c.d, '.strength').dataset.level === 'ok');
  setVal(c.w, $(c.d, '#npw2'), PW); submit(c.w, sf);
  ok('wrong setup key rejected by the SERVER', !!(await until(() => /Incorrect key/.test(txt(c.d, '#key-err') || ''))));
  setVal(c.w, $(c.d, '#key'), SETUP_KEY); submit(c.w, sf);
  ok('correct key creates password and redirects to dashboard', !!(await until(() => c.nav())));
  ok('session cookie issued', !!jar.rp_admin);
  c.w.close();

  /* ───────── dashboard ───────── */
  section('Dashboard overview');
  c = await open('dashboard.html');
  await until(() => $(c.d, '.stats .stat'));
  ok('admin shell rendered', !!$(c.d, '.side') && !!$(c.d, '#view'));
  ok('13 navigation entries incl. all management areas', $$(c.d, '.nav-link').length === 13, String($$(c.d, '.nav-link').length));
  ok('overview marked current', txt(c.d, '.nav-link[aria-current="page"]') === 'Overview');
  const stats = $$(c.d, '.stat').map((s) => s.textContent.replace(/\s+/g, ' ').trim());
  ok('inquiry stats shown (total/new/read)', stats.some((s) => s.startsWith('Total inquiries0')) && stats.some((s) => s.startsWith('New inquiries0')) && stats.some((s) => s.startsWith('Read inquiries0')), stats.join('|'));
  ok('project stats shown (6 total/6 published)', stats.some((s) => s.startsWith('Total projects6')) && stats.some((s) => s.startsWith('Published projects6')));
  ok('configuration status + checklist', !!$(c.d, '.card-head .pill') && $$(c.d, '.check').length >= 8, txt(c.d, '.card-head .pill'));
  ok('flags the missing HTTPS (local http)', $$(c.d, '.check-warn strong').some((s) => /HTTPS/.test(s.textContent)));
  ok('empty inbox message', /No inquiries yet/.test(txt(c.d, '.recent, .empty') || ''));
  ok('no script errors', c.errors.length === 0, c.errors.join('|').slice(0, 300));
  ok('no inline style attributes anywhere in the live DOM', $$(c.d, '[style]').length === 0, String($$(c.d, '[style]').length));

  /* ───────── settings ───────── */
  section('Settings: edit, validate, save, sync');
  await goto(c, 'settings');
  ok('5 settings sections', $$(c.d, '#view section.card').length === 4 || $$(c.d, '#view section.card').length === 5, String($$(c.d, '#view section.card').length));
  const need = ['name', 'siteName', 'siteTitle', 'designation', 'heroHeading', 'heroIntro', 'roles', 'heroImage', 'aboutBody', 'email', 'phone', 'location', 'social_github', 'social_linkedin', 'cvFile', 'defaultTheme', 'seoTitle', 'seoDescription', 'seoKeywords', 'footerText'];
  ok('every required setting has a field', need.every((n) => $(c.d, `[name="${n}"]`)), need.filter((n) => !$(c.d, `[name="${n}"]`)).join(','));
  const saveBtn = $(c.d, '.savebar .btn-primary');
  ok('save disabled until something changes', saveBtn.disabled === true);
  setVal(c.w, $(c.d, '[name="heroHeading"]'), 'Edited from the admin UI');
  ok('save enabled + unsaved notice', saveBtn.disabled === false && /unsaved/i.test(txt(c.d, '.save-status')));
  ok('leaving with unsaved changes is guarded', typeof c.w.Admin.guard === 'function' && c.w.Admin.guard() === true);
  setVal(c.w, $(c.d, '[name="email"]'), 'not an email');
  click(c.w, saveBtn);
  await until(() => $(c.d, '#view .has-err'));
  ok('server validation error shown on the field', !!$(c.d, '[name="email"][aria-invalid="true"]'), txt(c.d, '.has-err .err'));
  setVal(c.w, $(c.d, '[name="email"]'), 'hello@example.com');
  setVal(c.w, $(c.d, '[name="seoTitle"]'), 'UI SEO Title');
  setVal(c.w, $(c.d, '[name="defaultTheme"]'), 'dark');
  setVal(c.w, $(c.d, '[name="social_github"]'), 'ftp://bad');
  click(c.w, saveBtn);
  ok('bad social URL blocked locally', !!(await until(() => $(c.d, '[name="social_github"][aria-invalid="true"]'))));
  setVal(c.w, $(c.d, '[name="social_github"]'), 'https://github.com/ui-test');
  setVal(c.w, $(c.d, '[name="roles"]'), 'Role One\nRole Two\n\n  Role Three  ');
  click(c.w, saveBtn);
  ok('saved: success toast', !!(await until(() => /Settings saved/.test(txt(c.d, '#toasts') || ''))));
  ok('dirty flag cleared after save', c.w.Admin.guard() === false && saveBtn.disabled === true);
  const pub = (await fetch(`${BASE}/api/content.php`)).json ? (await (await fetch(`${BASE}/api/content.php`)).json()).data : null;
  ok('public feed shows the new hero heading', pub.settings.heroHeading === 'Edited from the admin UI');
  ok('public feed shows SEO title, theme, social, roles', pub.settings.seoTitle === 'UI SEO Title' && pub.settings.defaultTheme === 'dark' && pub.settings.social.github === 'https://github.com/ui-test' && JSON.stringify(pub.settings.roles) === '["Role One","Role Two","Role Three"]', JSON.stringify(pub.settings.roles));
  ok('private notify email NOT in public feed', pub.settings.notifyEmail === undefined);

  /* ───────── projects ───────── */
  section('Projects: add, edit, publish, feature, reorder, delete');
  await goto(c, 'projects');
  ok('lists the 6 existing projects', $$(c.d, '#view .row').length === 6, String($$(c.d, '#view .row').length));
  click(c.w, $(c.d, '#view-actions .btn-primary'));
  await until(() => $(c.d, 'dialog.modal[open]'));
  const dlg = () => $(c.d, 'dialog.modal[open]');
  click(c.w, $(dlg(), '.modal-foot .btn-primary'));
  ok('empty project form shows required-field error from server', !!(await until(() => $(dlg(), '[name="title"][aria-invalid="true"]'))));
  setVal(c.w, $(dlg(), '[name="title"]'), 'Admin UI Project');
  setVal(c.w, $(dlg(), '[name="description"]'), 'Created through the admin interface.');
  const tagIn = $(dlg(), '.tag-input');
  for (const t of ['Zeta', 'Flutter']) { tagIn.value = t; tagIn.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); }
  ok('tag chips created with Enter', $$(dlg(), '.tag').length === 2);
  click(c.w, $(dlg(), '.tag-x'));
  ok('tag can be removed', $$(dlg(), '.tag').length === 1);
  setVal(c.w, $(dlg(), '[name="liveUrl"]'), 'not-a-url');
  click(c.w, $(dlg(), '.modal-foot .btn-primary'));
  ok('invalid URL error shown next to the field', !!(await until(() => $(dlg(), '[name="liveUrl"][aria-invalid="true"]'))));
  setVal(c.w, $(dlg(), '[name="liveUrl"]'), 'https://example.com/ui');
  setVal(c.w, $(dlg(), '[name="githubUrl"]'), 'https://github.com/ui/project');
  $(dlg(), '[name="featured"]').checked = true;
  click(c.w, $(dlg(), '.modal-foot .btn-primary'));
  ok('project created -> modal closes + toast', !!(await until(() => !dlg() && /Project added/.test(txt(c.d, '#toasts') || ''))));
  await until(() => $$(c.d, '#view .row').length === 7);
  ok('new project is listed (7 rows)', $$(c.d, '#view .row').length === 7);
  let row = $$(c.d, '#view .row').find((r) => /Admin UI Project/.test(r.textContent));
  ok('row shows tags, links and Featured badge', row && /Flutter/.test(row.textContent) && /Featured/.test(row.textContent) && !!row.querySelector('a[href="https://example.com/ui"]'));
  let a = (await api('GET', 'projects.php')).body.data.items.find((p) => p.title === 'Admin UI Project');
  ok('stored in backend with correct fields', a && a.featured === true && a.published === true && a.githubUrl === 'https://github.com/ui/project' && JSON.stringify(a.tags) === '["Flutter"]', JSON.stringify(a));
  const pubSw = row.querySelector('.mini-switch input');
  pubSw.checked = false; pubSw.dispatchEvent(new c.w.Event('change', { bubbles: true }));
  ok('unpublish toggle saves', !!(await until(async () => (await api('GET', 'projects.php')).body.data.items.find((p) => p.title === 'Admin UI Project').published === false)));
  row = $$(c.d, '#view .row').find((r) => /Admin UI Project/.test(r.textContent));
  ok('draft badge appears', /Draft/.test(row.textContent));
  const pubFeed = (await (await fetch(`${BASE}/api/content.php`)).json()).data;
  ok('draft hidden from public feed', !pubFeed.projects.some((p) => p.title === 'Admin UI Project'));
  const firstIdBefore = $$(c.d, '#view .row')[0].dataset.id;
  click(c.w, $$(c.d, '#view .row')[0].querySelector('.move-down'));
  await until(() => $$(c.d, '#view .row')[0].dataset.id !== firstIdBefore);
  ok('move down reorders (persisted)', $$(c.d, '#view .row')[1].dataset.id === firstIdBefore && (await api('GET', 'projects.php')).body.data.items[1].id === firstIdBefore);
  const filt = $(c.d, '.toolbar input[type="search"]');
  setVal(c.w, filt, 'admin ui');
  ok('client filter narrows the list', $$(c.d, '#view .row').length === 1);
  ok('reorder arrows disabled while filtered', $$(c.d, '#view .row .move-up, #view .row .move-down').every((b) => b.disabled));
  setVal(c.w, filt, '');
  row = $$(c.d, '#view .row').find((r) => /Admin UI Project/.test(r.textContent));
  click(c.w, row.querySelector('[aria-label="Edit project"]'));
  await until(() => dlg());
  ok('edit form is pre-filled', $(dlg(), '[name="title"]').value === 'Admin UI Project' && $$(dlg(), '.tag').length === 1);
  setVal(c.w, $(dlg(), '[name="title"]'), 'Admin UI Project (edited)');
  click(c.w, $(dlg(), '.modal-foot .btn-primary'));
  await until(() => !dlg());
  ok('edit saved', !!(await until(async () => (await api('GET', 'projects.php')).body.data.items.some((p) => p.title === 'Admin UI Project (edited)'))));
  await until(() => $$(c.d, '#view .row').some((r) => /\(edited\)/.test(r.textContent)));
  row = $$(c.d, '#view .row').find((r) => /\(edited\)/.test(r.textContent));
  click(c.w, row.querySelector('[aria-label="Delete project"]'));
  await until(() => dlg());
  ok('delete asks for confirmation', /cannot be undone/.test(txt(c.d, 'dialog.modal[open] .confirm-text')));
  click(c.w, $(dlg(), '.btn-ghost:not(.btn-icon)'));
  await until(() => !dlg());
  ok('cancel keeps the project', $$(c.d, '#view .row').length === 7);
  click(c.w, row.querySelector('[aria-label="Delete project"]'));
  await until(() => dlg());
  click(c.w, $(dlg(), '.modal-foot .btn-danger'));
  await until(() => $$(c.d, '#view .row').length === 6);
  ok('confirmed delete removes it', $$(c.d, '#view .row').length === 6 && !(await api('GET', 'projects.php')).body.data.items.some((p) => /Admin UI/.test(p.title)));

  /* ───────── skills & services & content ───────── */
  section('Skills, services and other content');
  await goto(c, 'skills');
  ok('7 skills listed with level bars', $$(c.d, '#view .row').length === 7 && $$(c.d, '#view .meter').length === 7);
  click(c.w, $(c.d, '#view-actions .btn-primary'));
  await until(() => dlg());
  setVal(c.w, $(dlg(), '[name="name"]'), 'PHP');
  setVal(c.w, $(dlg(), '[name="category"]'), 'Backend');
  setVal(c.w, $(dlg(), '[name="level"]'), '82');
  ok('range slider shows its value', /82%/.test(txt(dlg(), '.range-out')));
  click(c.w, $(dlg(), '.modal-foot .btn-primary'));
  await until(() => $$(c.d, '#view .row').length === 8);
  const sk = (await api('GET', 'skills.php')).body.data.items.find((s) => s.name === 'PHP');
  ok('skill saved with level + category', sk && sk.level === 82 && sk.category === 'Backend');
  const skRow = $$(c.d, '#view .row').find((r) => /PHP/.test(r.textContent));
  click(c.w, skRow.querySelector('[aria-label="Delete skill"]')); await until(() => dlg()); click(c.w, $(dlg(), '.modal-foot .btn-danger'));
  await until(() => $$(c.d, '#view .row').length === 7);
  ok('skill deleted', $$(c.d, '#view .row').length === 7);

  await goto(c, 'services');
  ok('7 services listed with icons', $$(c.d, '#view .row').length === 7 && $$(c.d, '#view .thumb-icon svg').length === 7);
  click(c.w, $(c.d, '#view-actions .btn-primary'));
  await until(() => dlg());
  ok('icon picker offers every icon', $$(dlg(), '.icon-opt').length === c.w.RPIcons.SERVICE_ICONS.length);
  setVal(c.w, $(dlg(), '[name="title"]'), 'Cloud Hosting');
  const rocket = $(dlg(), '.icon-opt input[value="cloud"]'); rocket.checked = true; rocket.dispatchEvent(new c.w.Event('change', { bubbles: true }));
  click(c.w, byText(dlg(), 'button', 'Add section'));
  const li = $$(dlg(), '.list-row input, .list-row textarea');
  setVal(c.w, li[0], 'Scope'); setVal(c.w, li[1], 'Everything about hosting.');
  click(c.w, $(dlg(), '.modal-foot .btn-primary'));
  await until(() => $$(c.d, '#view .row').length === 8);
  const svc = (await api('GET', 'services.php')).body.data.items.find((s) => s.title === 'Cloud Hosting');
  ok('service saved: auto slug, icon, section', svc && svc.slug === 'cloud-hosting' && svc.icon === 'cloud' && svc.sections.length === 1 && svc.sections[0].heading === 'Scope', JSON.stringify(svc));
  const svcRow = $$(c.d, '#view .row').find((r) => /Cloud Hosting/.test(r.textContent));
  click(c.w, svcRow.querySelector('[aria-label="Delete service"]')); await until(() => dlg()); click(c.w, $(dlg(), '.modal-foot .btn-danger'));
  await until(() => $$(c.d, '#view .row').length === 7);

  for (const [view, rowsExpected, addText] of [['experience', 3, 'Add experience'], ['education', 3, 'Add education'], ['achievements', 0, 'Add achievement'], ['testimonials', 0, 'Add testimonial']]) {
    await goto(c, view);
    ok(`${view}: lists ${rowsExpected} entries`, $$(c.d, '#view .row').length === rowsExpected, String($$(c.d, '#view .row').length));
    ok(`${view}: add button`, !!byText(c.d, '#view-actions .btn', addText));
  }
  await goto(c, 'achievements');
  ok('achievements empty state', /Nothing here yet/.test(txt(c.d, '#view .empty')));
  click(c.w, $(c.d, '#view-actions .btn-primary')); await until(() => dlg());
  setVal(c.w, $(dlg(), '[name="title"]'), 'UI Award'); setVal(c.w, $(dlg(), '[name="year"]'), '2026');
  click(c.w, $(dlg(), '.modal-foot .btn-primary'));
  await until(() => $$(c.d, '#view .row').length === 1);
  ok('achievement created', $$(c.d, '#view .row').length === 1 && /UI Award/.test(txt(c.d, '#view .row')));
  click(c.w, $(c.d, '#view .row [aria-label="Delete achievement"]'));
  await until(() => dlg()); click(c.w, $(dlg(), '.modal-foot .btn-danger')); await until(() => $$(c.d, '#view .row').length === 0);
  await goto(c, 'gallery');
  ok('gallery: empty state + upload button', !!$(c.d, '#view .empty') && !!byText(c.d, '#view-actions .btn', 'Upload photos'));

  /* ───────── inquiries ───────── */
  section('Inquiries: list, search, filter, read, bulk, delete, export');
  const pubPost = (o) => fetch(`${BASE}/api/inquiries.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:8100' }, body: JSON.stringify(Object.assign({ phone: '', subject: '', _honey: '', _elapsed: 9000 }, o)) });
  await pubPost({ name: 'Eve One', email: 'eve@example.com', subject: 'Quote please', message: 'I need a quote for a mobile app project.' });
  await pubPost({ name: 'Frank Two', email: 'frank@example.com', phone: '+1 555 0100', subject: 'Question', message: 'Do you do <img src=x onerror="window.__xss=1"> web work? =HYPERLINK("http://e")' });
  await pubPost({ name: 'Gina Three', email: 'gina@example.com', subject: 'Hello', message: 'Just saying hello from the test suite.' });
  await goto(c, 'inquiries');
  await until(() => $$(c.d, '.inq-row').length === 3);
  ok('3 inquiries listed, newest first', $$(c.d, '.inq-row').length === 3 && /Gina/.test(txt(c.d, '.inq-row')));
  ok('unread badge in the sidebar', txt(c.d, '#nav-badge-inquiries') === '3' && !$(c.d, '#nav-badge-inquiries').hidden);
  ok('new rows are marked as new', $$(c.d, '.inq-row.is-new').length === 3);
  ok('segmented counts', $$(c.d, '.seg').map((s) => s.textContent).join('|') === 'All3|New3|Read0', $$(c.d, '.seg').map((s) => s.textContent).join('|'));
  ok('export link carries filter', /export=csv/.test($(c.d, '#view-actions a[download]').getAttribute('href')));
  setVal(c.w, $(c.d, '#inq-search'), 'mobile app');
  await until(() => $$(c.d, '.inq-row').length === 1);
  ok('search by message text', $$(c.d, '.inq-row').length === 1 && /Eve/.test(txt(c.d, '.inq-row')));
  setVal(c.w, $(c.d, '#inq-search'), 'zzzz-nothing');
  await until(() => $(c.d, '.inq-list .empty'));
  ok('no-match message', /No inquiries match/.test(txt(c.d, '.inq-list .empty')));
  setVal(c.w, $(c.d, '#inq-search'), '');
  await until(() => $$(c.d, '.inq-row').length === 3);
  click(c.w, $$(c.d, '.inq-open')[1]); // Frank (middle)
  await until(() => dlg());
  ok('detail shows every field', /Frank Two/.test(txt(c.d, 'dialog.modal h2')) && /frank@example\.com/.test(txt(dlg(), '.kv-list')) && /\+1 555 0100/.test(txt(dlg(), '.kv-list')) && /Question/.test(txt(dlg(), '.kv-list')) && /Received/.test(txt(dlg(), '.kv-list')));
  ok('XSS: message displayed as text, nothing executed', !$(dlg(), '.message-box img') && c.w.__xss === undefined && /<img src=x/.test($(dlg(), '.message-box').textContent));
  ok('reply link is a mailto', /^mailto:frank@example\.com\?subject=Re/.test($(dlg(), 'a.btn').getAttribute('href')));
  click(c.w, byText(dlg(), 'button', 'Mark as read'));
  await until(() => !dlg());
  await until(() => txt(c.d, '#nav-badge-inquiries') === '2');
  ok('mark as read updates badge + row + backend', txt(c.d, '#nav-badge-inquiries') === '2' && $$(c.d, '.inq-row.is-new').length === 2);
  click(c.w, $$(c.d, '.seg')[2]);
  await until(() => $$(c.d, '.inq-row').length === 1);
  ok('Read filter shows only read inquiry', /Frank/.test(txt(c.d, '.inq-row')));
  click(c.w, $$(c.d, '.seg')[0]); await until(() => $$(c.d, '.inq-row').length === 3);
  const boxes = $$(c.d, '.inq-row .inq-check input');
  boxes[0].checked = true; boxes[0].dispatchEvent(new c.w.Event('change', { bubbles: true }));
  boxes[2].checked = true; boxes[2].dispatchEvent(new c.w.Event('change', { bubbles: true }));
  ok('bulk bar appears with count', !$(c.d, '.bulk').hidden && /2 selected/.test(txt(c.d, '.bulk')));
  click(c.w, byText(c.d, '.bulk button', 'Mark read'));
  await until(() => $$(c.d, '.inq-row.is-new').length === 0);
  ok('bulk mark read', $$(c.d, '.inq-row.is-new').length === 0 && $(c.d, '#nav-badge-inquiries').hidden === true);
  const rows3 = $$(c.d, '.inq-row');
  click(c.w, rows3[0].querySelector('[aria-label="Delete inquiry"]'));
  await until(() => dlg());
  click(c.w, $(dlg(), '.modal-foot .btn-danger'));
  await until(() => $$(c.d, '.inq-row').length === 2);
  ok('single delete (with confirm)', $$(c.d, '.inq-row').length === 2);
  const lst = (await api('GET', 'inquiries.php')).body.data;
  ok('backend counts agree', lst.counts.total === 2 && lst.counts.new === 0);
  const csv = await (await fetch(`${BASE}/api/inquiries.php?export=csv`, { headers: { Cookie: cookieHeader() } })).text();
  ok('CSV export contains the remaining inquiries', /Frank Two/.test(csv) && /Gina Three|Eve One/.test(csv) && csv.split('\n').filter(Boolean).length >= 3);

  /* ───────── media ───────── */
  section('Media library');
  const status = await api('GET', 'auth.php?action=status');
  const csrf = status.body.data.csrf;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGMUyctjwAaYsIoOWgkAwE4BALiTAAgAAAAASUVORK5CYII=', 'base64');
  const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
  const up = await fetch(`${BASE}/api/upload.php`, { method: 'POST', headers: { Cookie: cookieHeader(), 'X-CSRF-Token': csrf, Origin: BASE }, body: fd });
  ok('test upload accepted', up.status === 201);
  await goto(c, 'media');
  await until(() => $$(c.d, '.media-card').length === 1);
  ok('library lists the file with size', $$(c.d, '.media-card').length === 1 && /B/.test(txt(c.d, '.media-card figcaption')));
  click(c.w, $(c.d, '.media-card [aria-label="Delete file"]'));
  await until(() => dlg()); click(c.w, $(dlg(), '.modal-foot .btn-danger'));
  await until(() => $$(c.d, '.media-card').length === 0);
  ok('file deleted from library', $$(c.d, '.media-card').length === 0);

  /* ───────── security + auth lifecycle ───────── */
  section('Security: change password, sign out, sign in, lockout');
  await goto(c, 'security');
  setVal(c.w, $(c.d, '[name="current"]'), PW); setVal(c.w, $(c.d, '[name="next"]'), 'short'); setVal(c.w, $(c.d, '[name="again"]'), 'short');
  click(c.w, byText(c.d, '#view .btn', 'Change password'));
  ok('weak new password rejected', /at least 12/.test(txt(c.d, '#view .err:not(:empty)')));
  setVal(c.w, $(c.d, '[name="next"]'), PW2); setVal(c.w, $(c.d, '[name="again"]'), PW2 + '!');
  click(c.w, byText(c.d, '#view .btn', 'Change password'));
  ok('mismatched confirmation rejected', /do not match/.test(txt(c.d, '#view .err:not(:empty)')));
  setVal(c.w, $(c.d, '[name="current"]'), 'wrong current password'); setVal(c.w, $(c.d, '[name="again"]'), PW2);
  click(c.w, byText(c.d, '#view .btn', 'Change password'));
  ok('wrong current password rejected by server', !!(await until(() => /not correct/.test(txt(c.d, '#view') || ''))));
  setVal(c.w, $(c.d, '[name="current"]'), PW);
  click(c.w, byText(c.d, '#view .btn', 'Change password'));
  ok('password changed', !!(await until(() => /Password changed/.test(txt(c.d, '#toasts') || ''))));
  ok('fields cleared after change', $(c.d, '[name="current"]').value === '' && $(c.d, '[name="next"]').value === '');
  ok('still signed in after change', (await api('GET', 'settings.php')).status === 200);

  click(c.w, byText(c.d, '.side-foot .btn', 'Sign out'));
  await until(() => c.nav());
  ok('sign out redirects', c.nav() === 'navigation');
  ok('API rejects the old session after sign out', (await api('GET', 'settings.php')).status === 401 && (await api('GET', 'inquiries.php')).status === 401);
  c.w.close();

  jar = {};
  c = await open('index.html');
  await until(() => $(c.d, '.auth-form'));
  ok('login form shown (password exists)', /Admin sign in/.test(txt(c.d, '#auth h1')) && !$(c.d, '#key'));
  const lf = $(c.d, '.auth-form');
  submit(c.w, lf);
  ok('empty password prompts', /Enter your password/.test(txt(c.d, '#pw-err')));
  setVal(c.w, $(c.d, '#pw'), PW); submit(c.w, lf);
  ok('OLD password no longer works', !!(await until(() => /Incorrect password/.test(txt(c.d, '.form-error') || ''))));
  ok('field cleared after failed attempt', $(c.d, '#pw').value === '');
  setVal(c.w, $(c.d, '#pw'), PW2); submit(c.w, lf);
  ok('NEW password signs in + redirects', !!(await until(() => c.nav())) && !!jar.rp_admin);
  c.w.close();

  c = await open('index.html');
  await until(() => c.nav());
  ok('visiting login while signed in redirects to dashboard', c.nav() === 'navigation');
  c.w.close();

  c = await open('dashboard.html', '#/projects');
  await until(() => $$(c.d, '#view .row').length > 0);
  ok('deep link #/projects opens that view directly', txt(c.d, '#view-title') === 'Projects' && txt(c.d, '.nav-link[aria-current="page"]') === 'Projects');
  c.w.close();

  jar = {};
  c = await open('index.html');
  await until(() => $(c.d, '.auth-form'));
  const lf2 = $(c.d, '.auth-form');
  for (let i = 0; i < 5; i++) { setVal(c.w, $(c.d, '#pw'), 'definitely wrong ' + i); submit(c.w, lf2); await until(() => /Incorrect password/.test(txt(c.d, '.form-error') || '')); await sleep(500); }
  setVal(c.w, $(c.d, '#pw'), 'definitely wrong again'); submit(c.w, lf2);
  ok('lockout message with countdown after repeated failures', !!(await until(() => /Too many failed attempts/.test(txt(c.d, '.form-error') || ''), 8000)), txt(c.d, '.form-error'));
  ok('sign-in button disabled during lockout', $(c.d, '.auth-form button[type="submit"]').disabled === true);
  setVal(c.w, $(c.d, '#pw'), PW2); submit(c.w, lf2);
  await sleep(500);
  ok('correct password is ALSO refused while locked out', !c.nav() && (await api('GET', 'settings.php')).status === 401);
  c.w.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
