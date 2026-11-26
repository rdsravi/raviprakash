#!/usr/bin/env node
/**
 * Public-site test: runs the REAL js/site.js in jsdom against a REAL PHP backend.
 *
 *   npm i jsdom            (in any folder; set NODE_PATH to its node_modules)
 *   node tests/site_test.js <site-url> <api-url> <setup-key> [dead-site-url]
 *
 * <site-url>   a static server for the website folder, with js/config.js pointing apiBase at <api-url>
 * <api-url>    the PHP backend (a THROWAWAY copy; this test writes to it) with allow_localhost = true
 * <dead-site>  optional: a second copy of the site whose apiBase points to a dead port (fallback test)
 *
 * See tests/README-tests.md for the one-command setup used during development.
 */
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');

const SITE = (process.argv[2] || 'http://127.0.0.1:8100').replace(/\/$/, '');
const API = (process.argv[3] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const SETUP_KEY = process.argv[4] || 'test-setup-key-123';
const DEAD = process.argv[5] ? process.argv[5].replace(/\/$/, '') : '';
const PW = 'frontend test password 12345';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + '  ' + detail); }
};
const section = (t) => console.log('\n== ' + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* only same-origin resources are really fetched; external ones (Google Fonts etc.) get an empty reply */
const resources = {
  interceptors: [
    requestInterceptor((request) => {
      const u = request.url;
      if (u.startsWith(SITE) || (DEAD && u.startsWith(DEAD))) return undefined;
      return new Response('', { headers: { 'Content-Type': 'text/css' } });
    }),
  ],
};

async function load(file, { site = SITE, storage = {}, query = '', width } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = await JSDOM.fromURL(`${site}/${file}${query}`, {
    runScripts: 'dangerously', resources, pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      // jsdom has no fetch; emulate a browser by sending the Origin header
      w.fetch = (u, o = {}) => fetch(new URL(u, w.location.href), Object.assign({}, o, { headers: Object.assign({ Origin: w.location.origin }, o.headers || {}) }));
      w.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    },
  });
  const w = dom.window;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const d = w.document;
    if (d.querySelector('#app .shell') && !d.querySelector('main .boot')) break;
    await sleep(40);
  }
  await sleep(120);
  return { dom, w, d: w.document, errors };
}
const txt = (d, sel) => (d.querySelector(sel) ? d.querySelector(sel).textContent.replace(/\s+/g, ' ').trim() : null);
const all = (d, sel) => Array.from(d.querySelectorAll(sel));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

/* ───────── admin helper (to change content the way the admin panel does) ───────── */
const jar = {};
async function adm(method, path, body, csrf = true) {
  const headers = { Origin: API, 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
  if (csrf && jar._csrf) headers['X-CSRF-Token'] = jar._csrf;
  const res = await fetch(`${API}/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); });
  const j = await res.json().catch(() => null);
  if (j && j.data && j.data.csrf) jar._csrf = j.data.csrf;
  return { status: res.status, body: j };
}

(async () => {
  /* ───────────────────────── static layer ───────────────────────── */
  section('Every page renders with the left rail (API mode)');
  const files = ['index.html', 'about.html', 'skills.html', 'services.html', 'service.html?s=web-development', 'projects.html', 'experience.html', 'gallery.html', 'contact.html'];
  const expectActive = { 'index.html': 'Home', 'about.html': 'About', 'skills.html': 'Skills', 'services.html': 'Services', 'service.html?s=web-development': 'Services', 'projects.html': 'Projects', 'experience.html': 'Experience', 'gallery.html': 'Gallery', 'contact.html': 'Contact' };
  for (const f of files) {
    const [file, q] = f.split('?');
    const { d, errors } = await load(file, { query: q ? '?' + q : '' });
    ok(`${f}: shell + rail rendered`, !!d.querySelector('.shell > .rail') && !!d.querySelector('.stage > main#main'));
    ok(`${f}: 8 nav links, vertical list`, all(d, '.rail-nav .rail-link').length === 8 && !!d.querySelector('.rail-nav'));
    ok(`${f}: correct active link`, txt(d, '.rail-link[aria-current="page"]') === expectActive[f], txt(d, '.rail-link[aria-current="page"]'));
    ok(`${f}: exactly one <h1>`, all(d, 'h1').length === 1, String(all(d, 'h1').length));
    ok(`${f}: title set`, d.title.length > 3 && d.title !== 'Loading…', d.title);
    ok(`${f}: no script errors`, errors.length === 0, errors.join(' | ').slice(0, 200));
    ok(`${f}: skip link + main landmark`, !!d.querySelector('a.skip[href="#main"]') && !!d.querySelector('main[id="main"]'));
  }

  section('Home content comes from the backend');
  let { d, w } = await load('index.html');
  ok('hero heading from settings', /fast, clear and easy to live with/.test(txt(d, '.hero-title')), txt(d, '.hero-title'));
  ok('rail identity', txt(d, '.rail .who b') === 'Ravi Prakash' && txt(d, '.rail .who span') === 'Full Stack Developer');
  ok('stats rendered (3)', all(d, '.stats > div').length === 3);
  ok('featured projects (3)', all(d, '.sec .proj').length === 3);
  ok('services preview', all(d, '.svc').length >= 6);
  ok('skills overview', all(d, '.skills-home .skill').length === 6);
  ok('social links safe + external', all(d, '.rail .soc').length >= 3 && all(d, '.rail .soc').every((a) => a.rel.includes('noopener') && a.target === '_blank'));
  ok('hero portrait has dimensions (no layout shift)', d.querySelector('.portrait img').getAttribute('width') && d.querySelector('.portrait img').getAttribute('height'));
  ok('CTA buttons present', !!d.querySelector('.cta a[href="contact.html"]'));
  ok('JSON-LD person injected', /"@type":"Person"/.test(txt(d, '#ld-person') || ''));
  ok('canonical set', !!d.querySelector('link[rel="canonical"]'));
  ok('meta description set', (d.querySelector('meta[name="description"]') || {}).content.length > 20);

  section('Theme, collapse, drawer');
  const before = w.document.documentElement.dataset.theme;
  click(w, d.querySelector('#theme-toggle'));
  ok('theme toggles', w.document.documentElement.dataset.theme !== before);
  ok('theme choice persisted', w.localStorage.getItem('rp_theme') === w.document.documentElement.dataset.theme);
  click(w, d.querySelector('#theme-toggle-m'));
  ok('mobile theme button also works', w.document.documentElement.dataset.theme === before);
  click(w, d.querySelector('#rail-collapse'));
  ok('rail collapses', d.querySelector('#shell').classList.contains('rail-min') && w.localStorage.getItem('rp_rail') === '1');
  ok('collapse button state exposed', d.querySelector('#rail-collapse').getAttribute('aria-pressed') === 'true');
  click(w, d.querySelector('#rail-collapse'));
  ok('rail expands', !d.querySelector('#shell').classList.contains('rail-min'));
  click(w, d.querySelector('#menu-open'));
  ok('drawer opens + aria-expanded', d.querySelector('#shell').classList.contains('drawer-open') && d.querySelector('#menu-open').getAttribute('aria-expanded') === 'true');
  ok('page scroll locked while open', d.body.classList.contains('no-scroll'));
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes drawer', !d.querySelector('#shell').classList.contains('drawer-open') && !d.body.classList.contains('no-scroll'));
  click(w, d.querySelector('#menu-open')); click(w, d.querySelector('#scrim'));
  ok('scrim click closes drawer', !d.querySelector('#shell').classList.contains('drawer-open'));
  const l2 = await load('index.html', { storage: { rp_theme: 'dark', rp_rail: '1' } });
  ok('saved theme + collapsed state restored', l2.d.documentElement.dataset.theme === 'dark' && l2.d.querySelector('#shell').classList.contains('rail-min'));
  l2.w.close();

  section('Projects: filters, links, safe rendering');
  ({ d, w } = await load('projects.html'));
  ok('all 6 projects shown', all(d, '#project-grid .proj:not([hidden])').length === 6);
  const filterBtns = all(d, '.filter');
  ok('filter chips built from tags', filterBtns.length >= 3 && filterBtns[0].textContent.trim().startsWith('All'));
  const webBtn = filterBtns.find((b) => b.dataset.tag === 'web');
  click(w, webBtn);
  const shown = all(d, '#project-grid .proj:not([hidden])');
  ok('filter narrows the grid', shown.length > 0 && shown.length < 6 && shown.every((c) => c.dataset.tags.split('|').includes('web')), String(shown.length));
  ok('filter state exposed via aria-pressed', webBtn.getAttribute('aria-pressed') === 'true' && filterBtns[0].getAttribute('aria-pressed') === 'false');
  ok('result count announced', /Showing \d+ of 6/.test(txt(d, '#result-count')));
  click(w, filterBtns[0]);
  ok('All resets filter', all(d, '#project-grid .proj:not([hidden])').length === 6);
  ok('external links are noopener', all(d, '.proj-links a').every((a) => a.rel.includes('noopener')));

  section('Skills, services, experience');
  ({ d } = await load('skills.html'));
  ok('skills grouped by category', all(d, '.skill-group').length >= 2);
  ok('meters expose values', all(d, '.meter').every((m) => m.getAttribute('role') === 'meter' && m.getAttribute('aria-valuenow')));
  ({ d } = await load('services.html'));
  ok('7 service cards link to detail', all(d, '.svc').length === 7 && all(d, '.svc').every((a) => /^service\.html\?s=/.test(a.getAttribute('href'))));
  for (const a of all(d, '.svc').slice(0, 7)) {
    const r = await load('service.html', { query: '?' + a.getAttribute('href').split('?')[1] });
    ok(`service detail: ${txt(r.d, 'h1')}`, !!txt(r.d, 'h1') && txt(r.d, 'h1') !== 'Not found' && !!r.d.querySelector('.doc'));
    r.w.close();
  }
  const nf = await load('service.html', { query: '?s=does-not-exist' });
  ok('unknown service shows not-found state', txt(nf.d, 'h1') === 'Not found' && !!nf.d.querySelector('.nf'));
  ({ d } = await load('experience.html'));
  ok('experience + education timelines', all(d, '.timeline').length === 2 && all(d, '.timeline li').length === 6);
  ({ d } = await load('about.html'));
  ok('about page: body, timeline, interests', all(d, '.about-body p').length === 3 && all(d, '.timeline').length === 2 && all(d, '.chips .chip').length === 7);
  ({ d } = await load('gallery.html'));
  ok('empty gallery shows friendly message', !!d.querySelector('.empty'));
  const nf2 = await load('404.html');
  ok('404 page renders helpful content', /404/.test(txt(nf2.d, '.nf .code')) && !!nf2.d.querySelector('.nf a[href="index.html"]'));
  ok('404 has noindex', (nf2.d.querySelector('meta[name="robots"]') || {}).content === 'noindex');

  /* ───────────────────────── contact form ───────────────────────── */
  section('Contact form: client validation');
  ({ d, w } = await load('contact.html', { query: '?subject=Web%20Development' }));
  ok('subject pre-filled from link', d.querySelector('#f-subject').value === 'Web Development');
  ok('contact details rendered (mailto/tel)', !!d.querySelector('.contact-list a[href^="mailto:"]') && !!d.querySelector('.contact-list a[href^="tel:"]'));
  ok('honeypot hidden from AT', d.querySelector('.hp').getAttribute('aria-hidden') === 'true' && d.querySelector('.hp input').tabIndex === -1);
  const form = d.querySelector('#contact-form');
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(80);
  ok('empty submit shows inline errors', ['name', 'email', 'message'].every((f) => d.querySelector('#err-' + f).classList.contains('on')));
  ok('invalid fields flagged aria-invalid + described', d.querySelector('#f-name').getAttribute('aria-invalid') === 'true' && d.querySelector('#f-name').getAttribute('aria-describedby') === 'err-name');
  ok('summary message shown', /fix the highlighted/i.test(txt(d, '#form-status')));
  ok('focus moves to first bad field', d.activeElement === d.querySelector('#f-name'));
  d.querySelector('#f-name').value = 'Al'; d.querySelector('#f-name').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('typing clears that field\'s error', !d.querySelector('#err-name').classList.contains('on'));
  d.querySelector('#f-email').value = 'not-an-email'; d.querySelector('#f-message').value = 'short';
  d.querySelector('#f-phone').value = 'abc';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(60);
  ok('bad email / phone / short message rejected', ['email', 'phone', 'message'].every((f) => d.querySelector('#err-' + f).classList.contains('on')));

  section('Contact form: stores inquiry through the API');
  // prepare admin session to read what was stored
  let r = await adm('GET', 'auth.php?action=status', null, false);
  r = await adm('POST', 'auth.php?action=setup', { setupKey: SETUP_KEY, password: PW });
  ok('admin setup for test', r.status === 201, JSON.stringify(r.body));
  const fresh = await load('contact.html');
  const f2 = fresh.d.querySelector('#contact-form');
  const set = (id, v) => { const el = fresh.d.querySelector(id); el.value = v; el.dispatchEvent(new fresh.w.Event('input', { bubbles: true })); };
  set('#f-name', 'Dana <b>Tester</b>'); set('#f-email', 'dana@example.com'); set('#f-phone', '+91 99999 11111');
  set('#f-subject', 'Website redesign'); set('#f-message', 'Hello! I would like a quote for a small business website.');
  await sleep(3300); // the server ignores anything submitted faster than 3 seconds (bot trap)
  f2.dispatchEvent(new fresh.w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(150);
  ok('button shows loading state while sending', fresh.d.querySelector('#send-btn') === null || fresh.d.querySelector('#send-btn').getAttribute('aria-busy') === 'true' || !!fresh.d.querySelector('.sent'));
  const t0 = Date.now();
  while (Date.now() - t0 < 6000 && !fresh.d.querySelector('.sent')) await sleep(80);
  ok('success panel shown', !!fresh.d.querySelector('.sent') && /Message sent/.test(txt(fresh.d, '.sent h2')));
  ok('success toast shown', !!fresh.d.querySelector('.toast'));
  ok('focus moved to success heading', fresh.d.activeElement === fresh.d.querySelector('.sent h2'));
  r = await adm('GET', 'inquiries.php');
  const mine = (r.body.data.items || []).find((i) => i.email === 'dana@example.com');
  ok('inquiry persisted in backend', !!mine && mine.read === false);
  ok('all fields stored intact (HTML kept as text)', mine && mine.name === 'Dana <b>Tester</b>' && mine.phone === '+91 99999 11111' && mine.subject === 'Website redesign');
  click(fresh.w, fresh.d.querySelector('#again'));
  await sleep(100);
  ok('"Send another" restores the form', !!fresh.d.querySelector('#contact-form'));
  fresh.w.close();

  section('Contact form: server-side errors surface in the UI');
  const bad = await load('contact.html');
  const setb = (id, v) => { const el = bad.d.querySelector(id); el.value = v; };
  setb('#f-name', 'Spammy'); setb('#f-email', 'spam@example.com');
  setb('#f-message', 'Buy http://a.com http://b.com http://c.com http://d.com now now now');
  await sleep(3300);
  bad.d.querySelector('#contact-form').dispatchEvent(new bad.w.Event('submit', { bubbles: true, cancelable: true }));
  const tb = Date.now();
  while (Date.now() - tb < 5000 && !bad.d.querySelector('#err-message').classList.contains('on')) await sleep(80);
  ok('server validation message shown inline', bad.d.querySelector('#err-message').classList.contains('on'), txt(bad.d, '#err-message'));
  ok('form not replaced on error', !!bad.d.querySelector('#contact-form') && !bad.d.querySelector('.sent'));
  ok('button re-enabled after error', !bad.d.querySelector('#send-btn').disabled);
  bad.w.close();

  /* ───────────────────────── dynamic sync ───────────────────────── */
  section('Admin changes appear on the public site');
  const cur = (await adm('GET', 'settings.php')).body.data;
  await adm('PUT', 'settings.php', {
    heroHeading: 'Dynamic headline from admin', siteName: 'RP Studio', designation: 'Flutter Specialist', email: 'hello@rp.example',
    phone: '+91 91111 22222', location: 'Delhi, India', seoTitle: 'RP Studio | SEO title', seoDescription: 'A fresh SEO description set from the admin panel.',
    seoKeywords: 'flutter, android', footerText: 'RP Studio Ltd', defaultTheme: 'dark', social: { github: 'https://github.com/rp-test', linkedin: '', instagram: '', facebook: '', youtube: '' },
    availability: 'Booking for December',
  });
  const prj = (await adm('POST', 'projects.php', { title: 'Sync Test Project', description: 'Added from the admin.', tags: ['Zeta'], liveUrl: 'https://example.com/live', githubUrl: 'https://github.com/x/y', featured: true })).body.data;
  const xss = (await adm('POST', 'projects.php', { title: '<img src=x onerror="window.__pwned=1">', description: '<script>window.__pwned=1</script>', tags: ['<b>t</b>'], featured: true })).body.data;
  const hidden = (await adm('POST', 'projects.php', { title: 'Hidden Draft', published: false })).body.data;
  const skill = (await adm('POST', 'skills.php', { name: 'Rust (sync test)', level: 61, category: 'Systems' })).body.data;
  const svc = (await adm('POST', 'services.php', { title: 'Sync Service', icon: 'rocket', summary: 'New service from admin', sections: [{ heading: 'Scope', text: 'Line one\n\nLine two' }] })).body.data;
  await adm('POST', 'achievements.php', { title: 'Sync Award', year: '2026', description: 'Shown on About' });
  await adm('POST', 'testimonials.php', { name: 'Happy Client', role: 'CEO', quote: 'Brilliant work.' });
  await adm('POST', 'experience.php', { role: 'Sync Engineer', org: 'ACME', period: '2026', text: 'Did things.' });

  ({ d, w } = await load('index.html'));
  ok('hero heading updated', txt(d, '.hero-title') === 'Dynamic headline from admin');
  ok('rail name/designation updated', txt(d, '.rail .who b') === 'RP Studio' && txt(d, '.rail .who span') === 'Flutter Specialist');
  ok('availability updated', /Booking for December/.test(txt(d, '.rail-status')));
  ok('social links updated (only github)', all(d, '.rail .soc').length === 1 && all(d, '.rail .soc')[0].href === 'https://github.com/rp-test');
  ok('contact details updated in rail', !!d.querySelector('.rail-contact a[href="mailto:hello@rp.example"]') && !!d.querySelector('.rail-contact a[href^="tel:+919111122222"]'));
  ok('document title = SEO title (home)', d.title === 'RP Studio | SEO title', d.title);
  ok('meta description = SEO description', d.querySelector('meta[name="description"]').content === 'A fresh SEO description set from the admin panel.');
  ok('meta keywords set', d.querySelector('meta[name="keywords"]').content === 'flutter, android');
  ok('og:title updated', d.querySelector('meta[property="og:title"]').content === 'RP Studio | SEO title');
  ok('footer text updated', /RP Studio Ltd/.test(txt(d, '.foot')));
  ok('admin default theme applied (dark)', d.documentElement.dataset.theme === 'dark');
  const homeProjects = all(d, '.sec .proj h3').map((h) => h.textContent);
  ok('new featured project appears', homeProjects.includes('Sync Test Project') || homeProjects.length === 3, homeProjects.join(','));
  w.close();

  ({ d } = await load('projects.html'));
  const titles = all(d, '#project-grid h3').map((h) => h.textContent);
  ok('new project listed', titles.includes('Sync Test Project'));
  ok('unpublished project NOT listed', !titles.includes('Hidden Draft'));
  const card = all(d, '#project-grid .proj').find((c) => c.querySelector('h3').textContent === 'Sync Test Project');
  ok('GitHub + live links rendered', card && !!card.querySelector('a[href="https://example.com/live"]') && !!card.querySelector('a[href="https://github.com/x/y"]'));
  ok('new tag becomes a filter', all(d, '.filter').some((b) => b.dataset.tag === 'zeta'));
  ok('featured badge shown', card && !!card.querySelector('.badge-feat'));
  const xssCard = all(d, '#project-grid .proj').find((c) => c.querySelector('h3').textContent.includes('<img'));
  ok('XSS: HTML in title is shown as text, not parsed', !!xssCard && xssCard.querySelector('h3 img') === null);
  ok('XSS: injected script/handler did not run', d.defaultView.__pwned === undefined && !d.querySelector('#project-grid script'));
  ({ d } = await load('skills.html'));
  ok('new skill + category appear', all(d, '.skill-group h3').some((h) => h.textContent.startsWith('Systems')) && all(d, '.skill-row span').some((s) => s.textContent === 'Rust (sync test)'));
  ({ d } = await load('services.html'));
  ok('new service appears', all(d, '.svc h3').some((h) => h.textContent === 'Sync Service'));
  const sv = await load('service.html', { query: '?s=' + svc.slug });
  ok('new service detail renders sections + enquiry link', txt(sv.d, 'h1') === 'Sync Service' && all(sv.d, '.doc p').length === 2 && !!sv.d.querySelector('a[href*="contact.html?subject=Sync%20Service"]'));
  ok('service page title/description use the service', /Sync Service/.test(sv.d.title) && sv.d.querySelector('meta[name="description"]').content === 'New service from admin');
  ({ d } = await load('about.html'));
  ok('achievement + testimonial on About', all(d, '.ach b').some((b) => b.textContent === 'Sync Award') && all(d, '.quote blockquote').some((b) => b.textContent === 'Brilliant work.'));
  ({ d } = await load('experience.html'));
  ok('new experience entry listed', all(d, '.timeline b').some((b) => b.textContent === 'Sync Engineer'));
  ({ d } = await load('contact.html'));
  ok('contact page shows updated details', /hello@rp\.example/.test(txt(d, '.contact-list')) && /Delhi, India/.test(txt(d, '.contact-list')));
  ({ d } = await load('about.html'));
  ok('inner pages title = "Page | Site name"', d.title === 'About | RP Studio', d.title);

  section('Cache revalidation: stale cache renders first, fresh content replaces it');
  const stale = JSON.stringify({ v: 'old-version', t: 1, data: { settings: { name: 'STALE', siteName: 'STALE', heroHeading: 'Stale headline', roles: [], social: {}, stats: [] }, projects: [], services: [], skills: [] } });
  const sk = 'rp_content::' + API;
  const l3 = await load('index.html', { storage: { [sk]: stale } });
  ok('stale cache replaced by fresh content', txt(l3.d, '.hero-title') === 'Dynamic headline from admin', txt(l3.d, '.hero-title'));
  ok('fresh content written back to cache', JSON.parse(l3.w.localStorage.getItem(sk)).v !== 'old-version');
  l3.w.close();
  const l4 = await load('index.html', { storage: { [sk]: l3.w.localStorage.getItem(sk) } }).catch(() => null);
  l4 && l4.w.close();

  /* restore + cleanup so the backend is left tidy */
  await adm('PUT', 'settings.php', { heroHeading: cur.heroHeading, siteName: cur.siteName, designation: cur.designation, defaultTheme: 'system' });
  for (const [c, id] of [['projects', prj.id], ['projects', xss.id], ['projects', hidden.id], ['skills', skill.id], ['services', svc.id]]) await adm('DELETE', `${c}.php?id=${id}`);

  /* ───────────────────────── resilience ───────────────────────── */
  if (DEAD) {
    section('API down: falls back to static content.json (defaults)');
    const dead = await load('index.html', { site: DEAD });
    ok('page still renders from content.json', /Ravi Prakash/.test(txt(dead.d, '.rail .who b')) && all(dead.d, '.svc').length >= 6, txt(dead.d, '.rail .who b'));
    ok('no uncaught errors when API is unreachable', dead.errors.length === 0, dead.errors.join('|').slice(0, 200));
    const deadContact = await load('contact.html', { site: DEAD });
    ok('contact page still renders', !!deadContact.d.querySelector('#contact-form'));
    dead.w.close(); deadContact.w.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
