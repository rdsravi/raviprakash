/* ==========================================================================
   Portfolio site runtime
   - Loads content from the PHP API (js/config.js -> apiBase) or content.json
   - Layers: fresh API -> last good cache -> static content.json -> built-in defaults
   - Renders the left rail + the current page (body[data-page]) into #app
   - Every piece of dynamic text is HTML-escaped before it reaches the page
   ========================================================================== */
(() => {
  'use strict';

  const CFG = Object.assign(
    { apiBase: '', staticFormFallback: 'formsubmit', contentFile: 'content.json', requestTimeoutMs: 7000 },
    window.PORTFOLIO_CONFIG || {}
  );
  const API = String(CFG.apiBase || '').replace(/\/+$/, '');
  const { icon } = window.RPIcons;
  const app = document.getElementById('app');
  const page = document.body.dataset.page || 'home';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───────── tiny helpers ───────── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  /** Only allow http(s), mailto, tel and plain relative paths in href/src. */
  const safeUrl = (u) => {
    const s = String(u == null ? '' : u).trim();
    if (!s) return '';
    if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return '';
    return s;
  };
  const paras = (text) =>
    String(text || '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
  const hue = (str) => {
    let h = 0;
    for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  };
  const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
  const timers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()); };

  /* ───────── data layer ───────── */
  const DEFAULTS = {
    settings: {
      name: 'Portfolio', siteName: 'Portfolio', siteTitle: 'Portfolio', designation: '', eyebrow: '', availability: '',
      heroHeading: '', heroIntro: '', roles: [], heroImage: '', stats: [], aboutTitle: 'About', aboutBody: '', aboutImage: '',
      interests: [], email: '', phone: '', location: '', social: {}, cvFile: '', defaultTheme: 'system',
      seoTitle: '', seoDescription: '', seoKeywords: '', footerText: '',
    },
    services: [], projects: [], skills: [], experience: [], education: [], achievements: [], testimonials: [], gallery: [],
  };

  /** Make any payload (API, cache, legacy content.json) safe to render. */
  function normalize(raw) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const out = { settings: Object.assign({}, DEFAULTS.settings, c.settings || {}), version: c.version || '' };
    out.settings.social = Object.assign({}, c.settings && c.settings.social);
    if (!out.settings.siteName) out.settings.siteName = out.settings.brand || out.settings.name;
    for (const k of Object.keys(DEFAULTS)) {
      if (k !== 'settings') out[k] = Array.isArray(c[k]) ? c[k].filter((i) => i && typeof i === 'object') : [];
    }
    const live = (i) => i.published !== false;
    out.projects = out.projects.filter(live).map((p) => Object.assign({}, p, { liveUrl: p.liveUrl || p.link || '', tags: Array.isArray(p.tags) ? p.tags : [] }));
    out.services = out.services.filter(live).map((s) => Object.assign({}, s, { sections: Array.isArray(s.sections) ? s.sections : [] }));
    out.testimonials = out.testimonials.filter(live);
    out.skills = out.skills.map((k) => Object.assign({}, k, { level: Math.max(0, Math.min(100, Number(k.level) || 0)) }));
    return out;
  }

  const cacheKey = 'rp_content::' + (API || 'static');
  const readCache = () => {
    try {
      const v = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      return v && v.data ? v : null;
    } catch (_) { return null; }
  };
  const writeCache = (data, version) => {
    try { localStorage.setItem(cacheKey, JSON.stringify({ v: version, t: Date.now(), data })); } catch (_) { /* storage full/blocked: fine */ }
  };

  async function fetchJson(url, opts = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), CFG.requestTimeoutMs);
    try {
      const res = await fetch(url, Object.assign({ signal: ctl.signal, cache: 'no-cache', headers: { Accept: 'application/json' } }, opts));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  /** Try the API first, then the static content.json. Returns { data, version, source }. */
  async function fetchFresh() {
    if (API) {
      try {
        const j = await fetchJson(API + '/api/content.php');
        if (j && j.ok && j.data) return { data: j.data, version: j.data.version || '', source: 'api' };
        throw new Error('Unexpected API response');
      } catch (err) {
        console.warn('[portfolio] API unavailable, using fallback content:', err.message);
      }
    }
    const data = await fetchJson(CFG.contentFile);
    return { data, version: 'static:' + JSON.stringify(data).length, source: 'static' };
  }

  /* ───────── theme ───────── */
  const root = document.documentElement;
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
  const storedTheme = () => { try { return localStorage.getItem('rp_theme'); } catch (_) { return null; } };
  function setTheme(mode) {
    root.dataset.theme = mode;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'dark' ? '#0b1416' : '#f1f4f4');
  }
  function applyDefaultTheme(pref) {
    try { localStorage.setItem('rp_theme_default', pref || 'system'); } catch (_) { /* ignore */ }
    if (storedTheme()) return; // a visitor's own choice always wins
    setTheme(pref === 'dark' || pref === 'light' ? pref : sysDark.matches ? 'dark' : 'light');
  }
  sysDark.addEventListener && sysDark.addEventListener('change', () => {
    if (storedTheme()) return;
    let def = 'system';
    try { def = localStorage.getItem('rp_theme_default') || 'system'; } catch (_) { /* ignore */ }
    if (def === 'system') setTheme(sysDark.matches ? 'dark' : 'light');
  });
  function toggleTheme() {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('rp_theme', next); } catch (_) { /* ignore */ }
    const b = $('#theme-toggle');
    if (b) b.setAttribute('aria-label', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  /* ───────── shared fragments ───────── */
  const NAV = [
    ['home', 'index.html', 'Home', 'home'],
    ['about', 'about.html', 'About', 'user'],
    ['skills', 'skills.html', 'Skills', 'cpu'],
    ['services', 'services.html', 'Services', 'layers'],
    ['projects', 'projects.html', 'Projects', 'code'],
    ['experience', 'experience.html', 'Experience', 'briefcase'],
    ['gallery', 'gallery.html', 'Gallery', 'image'],
    ['contact', 'contact.html', 'Contact', 'mail'],
  ];
  const SOCIALS = [['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube']];

  const initial = (s) => esc(String(s || '?').trim().charAt(0).toUpperCase());
  const avatarHtml = (s) => {
    const src = safeUrl(s.heroImage);
    return src
      ? `<span class="avatar"><img src="${esc(src)}" alt="" width="48" height="48"></span>`
      : `<span class="avatar" aria-hidden="true">${initial(s.siteName || s.name)}</span>`;
  };
  const socialsHtml = (s) =>
    SOCIALS.filter(([k]) => safeUrl(s.social[k]))
      .map(([k, label]) => `<a class="soc" href="${esc(safeUrl(s.social[k]))}" target="_blank" rel="noopener noreferrer" aria-label="${label}" title="${label}">${icon(k, 18)}</a>`)
      .join('');
  const themeLabel = () => (root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  const themeIcons = `<span class="ic-sun">${icon('sun', 18)}</span><span class="ic-moon">${icon('moon', 18)}</span>`;

  function railHtml(c) {
    const s = c.settings;
    const active = page === 'service' ? 'services' : page;
    const links = NAV.map(
      ([key, href, label, ic]) =>
        `<li><a class="rail-link" href="${href}" title="${label}"${key === active ? ' aria-current="page"' : ''}>${icon(ic, 20)}<span class="lbl">${label}</span></a></li>`
    ).join('');
    const contact = [
      s.email && `<a href="mailto:${esc(s.email)}" title="${esc(s.email)}">${icon('mail', 18)}<span class="lbl">${esc(s.email)}</span></a>`,
      s.phone && `<a href="${esc(telHref(s.phone))}" title="${esc(s.phone)}">${icon('call', 18)}<span class="lbl">${esc(s.phone)}</span></a>`,
    ].filter(Boolean).join('');
    const soc = socialsHtml(s);
    return `
      <aside class="rail" id="rail" aria-label="Site navigation">
        <div class="rail-id">
          <a class="rail-home" href="index.html" aria-label="${esc(s.siteName)} home">
            ${avatarHtml(s)}
            <span class="who"><b>${esc(s.siteName)}</b><span>${esc(s.designation)}</span></span>
          </a>
          <button class="tool-btn rail-close" id="rail-close" type="button" aria-label="Close menu">${icon('close', 18)}</button>
        </div>
        <nav aria-label="Main"><ul class="rail-nav">${links}</ul></nav>
        <div class="rail-foot">
          ${s.availability ? `<div class="rail-status"><span class="dot" aria-hidden="true"></span><span class="txt">${esc(s.availability)}</span></div>` : ''}
          ${contact ? `<div class="rail-contact">${contact}</div>` : ''}
          ${soc ? `<div class="soc-row rail-soc">${soc}</div>` : ''}
          <div class="rail-tools">
            <button class="tool-btn grow" id="theme-toggle" type="button" aria-label="${themeLabel()}">${themeIcons}<span class="lbl">Theme</span></button>
            <button class="tool-btn" id="rail-collapse" type="button" aria-label="Collapse sidebar" aria-pressed="false" title="Collapse sidebar">${icon('panel', 18)}</button>
          </div>
        </div>
      </aside>`;
  }

  function footHtml(c) {
    const s = c.settings;
    return `
      <footer class="foot">
        <div class="foot-in">
          <p><b>${esc(s.footerText || s.name)}</b> &copy; ${new Date().getFullYear()}. All rights reserved.</p>
          <a class="to-top" href="#main">Back to top ${icon('up', 16)}</a>
        </div>
      </footer>`;
  }

  function shell(c, inner) {
    const s = c.settings;
    let min = false;
    try { min = localStorage.getItem('rp_rail') === '1'; } catch (_) { /* ignore */ }
    return `
      <a class="skip" href="#main">Skip to content</a>
      <div class="shell${min ? ' rail-min' : ''}" id="shell">
        ${railHtml(c)}
        <div class="scrim" id="scrim"></div>
        <div class="stage" id="stage">
          <header class="topbar">
            <a class="brand" href="index.html">${avatarHtml(s)}<span>${esc(s.siteName)}</span></a>
            <div class="actions">
              <button class="tool-btn" id="theme-toggle-m" type="button" aria-label="${themeLabel()}">${themeIcons}</button>
              <button class="tool-btn" id="menu-open" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="rail">${icon('menu', 20)}</button>
            </div>
          </header>
          <main class="main" id="main" tabindex="-1">${inner}</main>
          ${footHtml(c)}
        </div>
      </div>`;
  }

  const sectionHead = (title, sub, linkHref, linkText) => `
    <div class="sec-head">
      <div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
      ${linkHref ? `<a class="more" href="${linkHref}">${esc(linkText)} ${icon('chevright', 18)}</a>` : ''}
    </div>`;

  const projectCard = (p) => {
    const img = safeUrl(p.image);
    const live = safeUrl(p.liveUrl);
    const gh = safeUrl(p.githubUrl);
    const cover = img
      ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" width="640" height="400">`
      : `<div class="cover-gen" data-h="${hue(p.title)}"><span>${initial(p.title)}</span></div>`;
    return `
      <article class="card proj" data-tags="${esc((p.tags || []).map((t) => String(t).toLowerCase()).join('|'))}">
        <div class="cover">${cover}${p.featured ? '<span class="badge-feat">Featured</span>' : ''}</div>
        <div class="proj-body">
          <h3>${esc(p.title)}</h3>
          ${p.description ? `<p>${esc(p.description)}</p>` : ''}
          ${p.tags && p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
          ${live || gh ? `<div class="proj-links">
            ${live ? `<a class="btn btn-sm" href="${esc(live)}" target="_blank" rel="noopener noreferrer">Live demo ${icon('up', 16)}</a>` : ''}
            ${gh ? `<a class="btn btn-sm btn-ghost" href="${esc(gh)}" target="_blank" rel="noopener noreferrer">${icon('github', 16)} GitHub</a>` : ''}
          </div>` : ''}
        </div>
      </article>`;
  };

  const serviceCard = (x) => `
    <a class="card svc" href="service.html?s=${encodeURIComponent(x.slug || x.id)}">
      <span class="svc-ic">${icon(x.icon, 26)}</span>
      <h3>${esc(x.title)}</h3>
      ${x.summary ? `<p>${esc(x.summary)}</p>` : ''}
      <span class="more">Learn more ${icon('chevright', 16)}</span>
    </a>`;

  const skillRow = (k) => `
    <li class="skill">
      <div class="skill-row"><span>${esc(k.name)}</span><em>${k.level}%</em></div>
      <div class="meter" role="meter" aria-label="${esc(k.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${k.level}"><i></i></div>
    </li>`;

  const groupSkills = (skills) => {
    const map = new Map();
    for (const k of skills) {
      const g = (k.category || '').trim() || 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(k);
    }
    return Array.from(map, ([name, items]) => ({ name, items }));
  };

  const timeline = (items, titleKey) => `
    <ol class="timeline">${items.map((i) => `
      <li>
        ${i.period ? `<span class="when">${esc(i.period)}</span>` : ''}
        <b>${esc(i[titleKey])}</b>
        ${i.org ? `<span class="org">${esc(i.org)}</span>` : ''}
        ${i.text ? `<p>${esc(i.text)}</p>` : ''}
      </li>`).join('')}
    </ol>`;

  const achievementCards = (items) => `
    <div class="grid c2">${items.map((a) => `
      <div class="card ach">${icon('award', 26)}<div>
        <b>${esc(a.title)}</b>${a.year ? `<small>${esc(a.year)}</small>` : ''}
        ${a.description ? `<p>${esc(a.description)}</p>` : ''}
      </div></div>`).join('')}</div>`;

  const testimonialCards = (items) => `
    <div class="grid c3">${items.map((t) => `
      <figure class="card quote">${icon('quote', 26)}
        <blockquote>${esc(t.quote)}</blockquote>
        <figcaption><b>${esc(t.name)}</b>${esc(t.role)}</figcaption>
      </figure>`).join('')}</div>`;

  const ctaCard = (s, text) => `
    <div class="card cta-card">
      <div><h3>${esc(text || 'Have a project in mind?')}</h3><p>Tell me what you are building and I will reply with next steps.</p></div>
      <a class="btn" href="contact.html">Start a conversation ${icon('send', 18)}</a>
    </div>`;

  const header = (title, lead, crumb) => `
    <header class="page-head rise">
      ${crumb ? `<a class="crumb" href="${crumb[0]}">${icon('chevright', 16)} ${esc(crumb[1])}</a>` : ''}
      <h1>${esc(title)}</h1>
      ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
    </header>`;

  /* ───────── pages ───────── */
  const PAGES = {
    home(c) {
      const s = c.settings;
      const feat = c.projects.filter((p) => p.featured);
      const showcase = (feat.length ? feat : c.projects).slice(0, 3);
      const topSkills = [...c.skills].sort((a, b) => b.level - a.level).slice(0, 6);
      const img = safeUrl(s.heroImage);
      const cv = safeUrl(s.cvFile);
      return {
        title: s.seoTitle || s.siteTitle || `${s.name} | ${s.designation}`.trim(),
        desc: s.seoDescription || s.heroIntro,
        html: `
        <section class="hero" aria-labelledby="hero-title">
          <div class="hero-copy rise">
            ${s.availability ? `<span class="chip"><span class="dot" aria-hidden="true"></span>${esc(s.availability)}</span>` : ''}
            <h1 class="hero-title" id="hero-title">${esc(s.heroHeading || s.name)}</h1>
            ${s.roles.length ? `<p class="role-line" aria-label="${esc(s.roles.join(', '))}">${esc(s.name)} <span aria-hidden="true">&mdash; </span><span class="role" id="role" aria-hidden="true">${esc(s.roles[0])}</span><span class="caret" aria-hidden="true"></span></p>` : `<p class="role-line">${esc(s.designation)}</p>`}
            ${s.heroIntro ? `<p class="lead">${esc(s.heroIntro)}</p>` : ''}
            <div class="cta">
              <a class="btn" href="contact.html">Start a project ${icon('send', 18)}</a>
              ${cv ? `<a class="btn btn-ghost" href="${esc(cv)}" target="_blank" rel="noopener noreferrer" download>${icon('download', 18)} Download CV</a>` : `<a class="btn btn-ghost" href="projects.html">View projects</a>`}
            </div>
            ${socialsHtml(s) ? `<div class="soc-row">${socialsHtml(s)}</div>` : ''}
          </div>
          ${img ? `<div class="hero-media rise">
            <figure class="portrait"><img src="${esc(img)}" alt="Portrait of ${esc(s.name)}" width="760" height="1013" fetchpriority="high" decoding="async"></figure>
            ${s.location ? `<div class="float-card">${icon('pin', 20)}<span>${esc(s.location)}</span></div>` : ''}
          </div>` : ''}
        </section>

        ${s.stats.length ? `<div class="stats" role="list">${s.stats.map((x) => `<div role="listitem"><b>${esc(x.value)}</b><span>${esc(x.label)}</span></div>`).join('')}</div>` : ''}

        ${showcase.length ? `<section class="sec" aria-labelledby="h-feat">
          ${sectionHead('Featured work', 'A few things I have built recently.', 'projects.html', 'All projects').replace('<h2>', '<h2 id="h-feat">')}
          <div class="grid c3">${showcase.map(projectCard).join('')}</div>
        </section>` : ''}

        ${topSkills.length ? `<section class="sec" aria-labelledby="h-skill">
          ${sectionHead('What I work with', 'Where I am strongest.', 'skills.html', 'All skills').replace('<h2>', '<h2 id="h-skill">')}
          <ul class="grid c2 skills-home">${topSkills.map(skillRow).join('')}</ul>
        </section>` : ''}

        ${c.services.length ? `<section class="sec" aria-labelledby="h-svc">
          ${sectionHead('Services', 'How I can help.', 'services.html', 'All services').replace('<h2>', '<h2 id="h-svc">')}
          <div class="grid c3">${c.services.slice(0, 6).map(serviceCard).join('')}</div>
        </section>` : ''}

        ${c.testimonials.length ? `<section class="sec">
          ${sectionHead('Kind words')}
          ${testimonialCards(c.testimonials.slice(0, 3))}
        </section>` : ''}

        <section class="sec">${ctaCard(s)}</section>`,
      };
    },

    about(c) {
      const s = c.settings;
      const img = safeUrl(s.aboutImage || s.heroImage);
      const cv = safeUrl(s.cvFile);
      return {
        title: 'About',
        desc: (s.aboutBody || '').split(/\n/)[0].slice(0, 200) || s.seoDescription,
        html: `
        ${header(s.aboutTitle || 'About me', s.designation ? `${s.designation}${s.location ? ', ' + s.location : ''}` : '')}
        <section class="sec"><div class="about-grid">
          ${img ? `<figure class="portrait"><img src="${esc(img)}" alt="${esc(s.name)}" width="640" height="800" loading="lazy" decoding="async"></figure>` : ''}
          <div class="about-body">
            ${paras(s.aboutBody)}
            <div class="about-actions">
              <a class="btn" href="contact.html">Work with me ${icon('send', 18)}</a>
              ${cv ? `<a class="btn btn-ghost" href="${esc(cv)}" target="_blank" rel="noopener noreferrer" download>${icon('download', 18)} Download CV</a>` : ''}
            </div>
          </div>
        </div></section>
        ${c.experience.length || c.education.length ? `<section class="sec"><div class="two-col">
          ${c.experience.length ? `<div><h2>${icon('briefcase', 24)} Experience</h2>${timeline(c.experience, 'role')}</div>` : ''}
          ${c.education.length ? `<div><h2>${icon('cap', 24)} Education</h2>${timeline(c.education, 'title')}</div>` : ''}
        </div></section>` : ''}
        ${c.achievements.length ? `<section class="sec">${sectionHead('Achievements')}${achievementCards(c.achievements)}</section>` : ''}
        ${s.interests.length ? `<section class="sec">${sectionHead('Interests', 'What I like to read, build and think about.')}<div class="chips">${s.interests.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div></section>` : ''}
        ${c.testimonials.length ? `<section class="sec">${sectionHead('Kind words')}${testimonialCards(c.testimonials)}</section>` : ''}
        <section class="sec">${ctaCard(s)}</section>`,
      };
    },

    skills(c) {
      const groups = groupSkills(c.skills);
      return {
        title: 'Skills',
        desc: `Skills and technologies used by ${c.settings.name}.`,
        html: `
        ${header('Skills', 'The tools and areas I work in. Bars show my own confidence level, not a certification.')}
        <section class="sec">
          ${groups.length
            ? `<div class="grid c2">${groups.map((g) => `
                <section class="card skill-group" aria-label="${esc(g.name)}">
                  <h3>${esc(g.name)} <small>${g.items.length} ${g.items.length === 1 ? 'skill' : 'skills'}</small></h3>
                  <ul>${g.items.map(skillRow).join('')}</ul>
                </section>`).join('')}</div>`
            : '<p class="empty">Skills will appear here soon.</p>'}
        </section>
        <section class="sec">${ctaCard(c.settings, 'Need these skills on your project?')}</section>`,
      };
    },

    services(c) {
      return {
        title: 'Services',
        desc: `Services offered by ${c.settings.name}: ${c.services.slice(0, 5).map((x) => x.title).join(', ')}.`,
        html: `
        ${header('Services', 'Choose a service to see the scope, how I work and what you get.')}
        <section class="sec">
          ${c.services.length ? `<div class="grid c3">${c.services.map(serviceCard).join('')}</div>` : '<p class="empty">Services will appear here soon.</p>'}
        </section>
        <section class="sec">${ctaCard(c.settings)}</section>`,
      };
    },

    service(c) {
      const slug = new URLSearchParams(location.search).get('s') || '';
      const x = c.services.find((i) => i.slug === slug || i.id === slug);
      if (!x) return PAGES.notfound(c, 'That service could not be found.');
      const others = c.services.filter((i) => i !== x).slice(0, 6);
      return {
        title: x.title,
        desc: x.summary,
        html: `
        <header class="page-head rise">
          <a class="crumb" href="services.html">${icon('chevright', 16)} All services</a>
          <span class="svc-ic">${icon(x.icon, 28)}</span>
          <h1 class="svc-h1">${esc(x.title)}</h1>
          ${x.summary ? `<p class="lead">${esc(x.summary)}</p>` : ''}
        </header>
        ${x.sections.length ? `<section class="sec"><div class="doc">${x.sections.map((sec) => `
          <div><h2>${esc(sec.heading)}</h2><div>${paras(sec.text)}</div></div>`).join('')}</div></section>` : ''}
        <section class="sec"><div class="card cta-card">
          <div><h3>Interested in ${esc(x.title)}?</h3><p>Send a few details and I will get back to you.</p></div>
          <a class="btn" href="contact.html?subject=${encodeURIComponent(x.title)}">Enquire about this ${icon('send', 18)}</a>
        </div></section>
        ${others.length ? `<section class="sec">${sectionHead('Other services')}<div class="chips">${others.map((o) => `<a class="chip" href="service.html?s=${encodeURIComponent(o.slug || o.id)}">${icon(o.icon, 16)} ${esc(o.title)}</a>`).join('')}</div></section>` : ''}`,
      };
    },

    projects(c) {
      const counts = new Map();
      c.projects.forEach((p) => p.tags.forEach((t) => counts.set(t.toLowerCase(), { label: t, n: (counts.get(t.toLowerCase()) || { n: 0 }).n + 1 })));
      const tags = Array.from(counts, ([key, v]) => ({ key, ...v })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, 12);
      return {
        title: 'Projects',
        desc: `Selected projects by ${c.settings.name}.`,
        html: `
        ${header('Projects', 'Apps, websites and systems I have built. Filter by technology or type.')}
        <section class="sec">
          ${c.projects.length ? `
            <div class="filters" role="group" aria-label="Filter projects">
              <button class="filter" type="button" data-tag="" aria-pressed="true">All <small>${c.projects.length}</small></button>
              ${tags.map((t) => `<button class="filter" type="button" data-tag="${esc(t.key)}" aria-pressed="false">${esc(t.label)} <small>${t.n}</small></button>`).join('')}
            </div>
            <p class="result-count" id="result-count" role="status" aria-live="polite"></p>
            <div class="grid c3" id="project-grid">${c.projects.map(projectCard).join('')}</div>
            <p class="empty" id="no-match" hidden>No projects match that filter.</p>`
            : '<p class="empty">Projects will appear here soon.</p>'}
        </section>
        <section class="sec">${ctaCard(c.settings, 'Like what you see?')}</section>`,
      };
    },

    experience(c) {
      return {
        title: 'Experience',
        desc: `Professional experience and education of ${c.settings.name}.`,
        html: `
        ${header('Experience', 'Where I have worked and studied.')}
        <section class="sec"><div class="two-col">
          <div><h2>${icon('briefcase', 24)} Experience</h2>${c.experience.length ? timeline(c.experience, 'role') : '<p class="empty">Nothing here yet.</p>'}</div>
          <div><h2>${icon('cap', 24)} Education</h2>${c.education.length ? timeline(c.education, 'title') : '<p class="empty">Nothing here yet.</p>'}</div>
        </div></section>
        ${c.achievements.length ? `<section class="sec">${sectionHead('Achievements')}${achievementCards(c.achievements)}</section>` : ''}
        <section class="sec">${ctaCard(c.settings)}</section>`,
      };
    },

    gallery(c) {
      return {
        title: 'Gallery',
        desc: `Photos from ${c.settings.name}.`,
        html: `
        ${header('Gallery', 'A few moments from work and life.')}
        <section class="sec">
          ${c.gallery.length
            ? `<div class="masonry">${c.gallery.map((g, i) => `
                <button class="shot" type="button" data-i="${i}" aria-label="Open photo${g.caption ? ': ' + esc(g.caption) : ' ' + (i + 1)}">
                  <img src="${esc(safeUrl(g.file))}" alt="${esc(g.caption || '')}" loading="lazy" decoding="async">
                  ${g.caption ? `<span>${esc(g.caption)}</span>` : ''}
                </button>`).join('')}</div>`
            : '<p class="empty">Photos will appear here soon.</p>'}
        </section>`,
      };
    },

    contact(c) {
      const s = c.settings;
      const items = [
        s.email && `<li>${icon('mail', 22)}<div><small>Email</small><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></div></li>`,
        s.phone && `<li>${icon('call', 22)}<div><small>Phone</small><a href="${esc(telHref(s.phone))}">${esc(s.phone)}</a></div></li>`,
        s.location && `<li>${icon('pin', 22)}<div><small>Location</small><span>${esc(s.location)}</span></div></li>`,
      ].filter(Boolean).join('');
      return {
        title: 'Contact',
        desc: `Get in touch with ${s.name}.`,
        html: `
        ${header('Let\u2019s talk', 'Tell me about your project, idea or question. I read every message myself.')}
        <section class="contact-grid">
          <div>
            ${s.availability ? `<span class="chip chip-top"><span class="dot" aria-hidden="true"></span>${esc(s.availability)}</span>` : ''}
            <ul class="contact-list">${items}</ul>
            ${socialsHtml(s) ? `<div class="soc-row">${socialsHtml(s)}</div>` : ''}
          </div>
          <div id="form-slot">
            <form class="card form" id="contact-form" novalidate>
              <div class="row2">
                <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" autocomplete="name" maxlength="120" required aria-describedby="err-name"><span class="err" id="err-name"></span></div>
                <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" maxlength="200" required aria-describedby="err-email"><span class="err" id="err-email"></span></div>
              </div>
              <div class="row2">
                <div class="field"><label for="f-phone">Phone <span class="opt">(optional)</span></label><input id="f-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" aria-describedby="err-phone"><span class="err" id="err-phone"></span></div>
                <div class="field"><label for="f-subject">Subject <span class="opt">(optional)</span></label><input id="f-subject" name="subject" maxlength="160" aria-describedby="err-subject"><span class="err" id="err-subject"></span></div>
              </div>
              <div class="field"><label for="f-message">Message</label><textarea id="f-message" name="message" maxlength="5000" required aria-describedby="err-message"></textarea><span class="err" id="err-message"></span><span class="count" id="msg-count" aria-hidden="true">0 / 5000</span></div>
              <div class="hp" aria-hidden="true"><label>Leave this empty<input name="_honey" tabindex="-1" autocomplete="off"></label></div>
              <p class="form-status" id="form-status" role="status" aria-live="polite"></p>
              <button class="btn" type="submit" id="send-btn">Send message ${icon('send', 18)}</button>
            </form>
          </div>
        </section>`,
      };
    },

    notfound(c, message) {
      return {
        title: 'Page not found',
        desc: '',
        noindex: true,
        html: `
        <section class="nf rise">
          <div class="code" aria-hidden="true">404</div>
          <h1>${esc(message ? 'Not found' : 'This page does not exist')}</h1>
          <p class="lead">${esc(message || 'The link may be old or mistyped.')}</p>
          <div class="cta"><a class="btn" href="index.html">Back to home</a><a class="btn btn-ghost" href="contact.html">Contact me</a></div>
        </section>`,
      };
    },
  };

  /* ───────── SEO ───────── */
  function setMeta(selector, attr, name, content) {
    let el = $(selector);
    if (!content) { if (el && !el.hasAttribute('data-static')) el.remove(); return; }
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
    el.setAttribute('content', content);
  }
  function applySeo(c, view) {
    const s = c.settings;
    const title = page === 'home' ? view.title : `${view.title} | ${s.siteName}`;
    document.title = title;
    const desc = String(view.desc || s.seoDescription || '').slice(0, 300);
    const img = safeUrl(s.heroImage);
    const abs = img ? new URL(img, location.href).href : '';
    setMeta('meta[name="description"]', 'name', 'description', desc);
    setMeta('meta[name="keywords"]', 'name', 'keywords', s.seoKeywords);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', desc);
    setMeta('meta[property="og:image"]', 'property', 'og:image', abs);
    setMeta('meta[property="og:type"]', 'property', 'og:type', page === 'home' ? 'website' : 'article');
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', s.siteName);
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', abs ? 'summary_large_image' : 'summary');
    setMeta('meta[name="robots"]', 'name', 'robots', view.noindex ? 'noindex' : '');
    let canon = $('link[rel="canonical"]');
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
    canon.href = location.origin + location.pathname.replace(/index\.html$/, '') + (page === 'service' ? location.search : '');

    let ld = $('#ld-person');
    if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-person'; document.head.appendChild(ld); }
    const sameAs = SOCIALS.map(([k]) => safeUrl(s.social[k])).filter(Boolean);
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Person', name: s.name, jobTitle: s.designation || undefined,
      image: abs || undefined, url: location.origin + location.pathname.replace(/[^/]*$/, ''), sameAs: sameAs.length ? sameAs : undefined,
    });
  }

  /* ───────── behaviours ───────── */
  function bindShell() {
    const shellEl = $('#shell');
    const rail = $('#rail');
    const stage = $('#stage');
    const openBtn = $('#menu-open');
    const closeBtn = $('#rail-close');
    const scrim = $('#scrim');
    const desktop = window.matchMedia('(min-width: 1024px)');
    let lastFocus = null;

    const trap = (e) => {
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (e.key !== 'Tab') return;
      const f = $$('a[href], button:not([disabled])', rail).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    function openDrawer() {
      lastFocus = document.activeElement;
      shellEl.classList.add('drawer-open');
      document.body.classList.add('no-scroll');
      openBtn.setAttribute('aria-expanded', 'true');
      stage.inert = true;
      document.addEventListener('keydown', trap);
      later(() => { const a = $('.rail-link[aria-current="page"]', rail) || $('.rail-link', rail); a && a.focus(); }, 60);
    }
    function closeDrawer() {
      if (!shellEl.classList.contains('drawer-open')) return;
      shellEl.classList.remove('drawer-open');
      document.body.classList.remove('no-scroll');
      openBtn.setAttribute('aria-expanded', 'false');
      stage.inert = false;
      document.removeEventListener('keydown', trap);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    openBtn.addEventListener('click', openDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    scrim.addEventListener('click', closeDrawer);
    $$('.rail-link', rail).forEach((a) => a.addEventListener('click', () => { if (!desktop.matches) closeDrawer(); }));
    desktop.addEventListener && desktop.addEventListener('change', (e) => { if (e.matches) closeDrawer(); });

    const collapse = $('#rail-collapse');
    const syncCollapse = () => {
      const min = shellEl.classList.contains('rail-min');
      collapse.setAttribute('aria-pressed', String(min));
      collapse.setAttribute('aria-label', min ? 'Expand sidebar' : 'Collapse sidebar');
      collapse.title = min ? 'Expand sidebar' : 'Collapse sidebar';
    };
    collapse.addEventListener('click', () => {
      const min = shellEl.classList.toggle('rail-min');
      try { localStorage.setItem('rp_rail', min ? '1' : '0'); } catch (_) { /* ignore */ }
      syncCollapse();
    });
    syncCollapse();

    ['theme-toggle', 'theme-toggle-m'].forEach((id) => { const b = document.getElementById(id); b && b.addEventListener('click', toggleTheme); });
    // keep both theme buttons' labels in sync
    const sync = () => ['theme-toggle', 'theme-toggle-m'].forEach((id) => { const b = document.getElementById(id); b && b.setAttribute('aria-label', themeLabel()); });
    $$('#theme-toggle, #theme-toggle-m').forEach((b) => b.addEventListener('click', sync));
  }

  function bindDecor() {
    $$('.rise').forEach((box) => Array.from(box.children).forEach((el, i) => el.style.setProperty('--i', i)));
    $$('.cover-gen').forEach((el) => el.style.setProperty('--h', el.dataset.h));
    const meters = $$('.meter');
    meters.forEach((m) => m.style.setProperty('--w', m.getAttribute('aria-valuenow') + '%'));
    if (!meters.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) { meters.forEach((m) => m.classList.add('on')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('on'); io.unobserve(en.target); }
    }), { threshold: 0.4 });
    meters.forEach((m) => io.observe(m));
  }

  /** Types out the rotating roles in the hero. Static when the visitor prefers reduced motion. */
  function bindRoles(c) {
    const el = $('#role');
    const roles = c.settings.roles;
    if (!el || roles.length < 2 || reduceMotion) return;
    let ri = 0, ci = roles[0].length, del = true;
    const tick = () => {
      const word = roles[ri];
      if (del) { ci--; el.textContent = word.slice(0, ci); if (ci <= 0) { del = false; ri = (ri + 1) % roles.length; later(tick, 260); return; } later(tick, 38); }
      else { const w = roles[ri]; ci++; el.textContent = w.slice(0, ci); if (ci >= w.length) { del = true; later(tick, 1900); return; } later(tick, 75); }
    };
    later(tick, 2200);
  }

  function bindFilters() {
    const btns = $$('.filter');
    if (!btns.length) return;
    const cards = $$('#project-grid .proj');
    const count = $('#result-count');
    const none = $('#no-match');
    const apply = (tag) => {
      let shown = 0;
      cards.forEach((card) => {
        const ok = !tag || card.dataset.tags.split('|').includes(tag);
        card.hidden = !ok;
        if (ok) shown++;
      });
      btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === tag)));
      count.textContent = `Showing ${shown} of ${cards.length} ${cards.length === 1 ? 'project' : 'projects'}`;
      none.hidden = shown > 0;
    };
    btns.forEach((b) => b.addEventListener('click', () => apply(b.dataset.tag)));
    const want = (new URLSearchParams(location.search).get('tag') || '').toLowerCase();
    apply(btns.some((b) => b.dataset.tag === want) ? want : '');
  }

  function bindGallery(c) {
    const shots = $$('.shot');
    if (!shots.length) return;
    let i = 0, box = null, opener = null;
    const items = c.gallery;
    const draw = () => {
      const g = items[i];
      $('img', box).src = safeUrl(g.file);
      $('img', box).alt = g.caption || '';
      $('figcaption', box).textContent = g.caption || '';
    };
    const key = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Tab') { // trap focus inside the dialog
        const f = $$('button', box); const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const step = (d) => { i = (i + d + items.length) % items.length; draw(); };
    function close() {
      box && box.remove(); box = null;
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', key);
      opener && opener.focus();
    }
    shots.forEach((b) => b.addEventListener('click', () => {
      opener = b; i = Number(b.dataset.i);
      box = document.createElement('div');
      box.className = 'lightbox';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo viewer');
      box.innerHTML = `<button class="lb-btn lb-x" type="button" aria-label="Close">${icon('close', 22)}</button>
        ${items.length > 1 ? `<button class="lb-btn lb-prev" type="button" aria-label="Previous photo">${icon('chevleft', 22)}</button><button class="lb-btn lb-next" type="button" aria-label="Next photo">${icon('chevright', 22)}</button>` : ''}
        <figure><img alt=""><figcaption></figcaption></figure>`;
      document.body.appendChild(box);
      document.body.classList.add('no-scroll');
      draw();
      $('.lb-x', box).addEventListener('click', close);
      const p = $('.lb-prev', box), n = $('.lb-next', box);
      p && p.addEventListener('click', () => step(-1));
      n && n.addEventListener('click', () => step(1));
      box.addEventListener('click', (e) => { if (e.target === box) close(); });
      document.addEventListener('keydown', key);
      $('.lb-x', box).focus();
    }));
  }

  /* ───────── toast ───────── */
  function toast(msg, kind) {
    let box = $('.toast-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toast-box'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (kind === 'err' ? ' err' : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 5200);
  }

  /* ───────── contact form ───────── */
  function bindForm(c) {
    const form = $('#contact-form');
    if (!form) return;
    const s = c.settings;
    const shownAt = Date.now();
    const status = $('#form-status');
    const btn = $('#send-btn');
    const msg = $('#f-message');
    const counter = $('#msg-count');
    const pre = new URLSearchParams(location.search).get('subject');
    if (pre) $('#f-subject').value = pre.slice(0, 160);
    msg.addEventListener('input', () => { counter.textContent = `${msg.value.length} / 5000`; });

    const setErr = (field, text) => {
      const input = form.elements[field];
      const err = document.getElementById('err-' + field);
      if (!input || !err) return;
      err.textContent = text || '';
      err.classList.toggle('on', Boolean(text));
      if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    };
    const clearErrs = () => ['name', 'email', 'phone', 'subject', 'message'].forEach((f) => setErr(f, ''));
    const say = (kind, text) => { status.className = 'form-status' + (kind ? ' ' + kind : ''); status.textContent = text || ''; };
    ['name', 'email', 'phone', 'subject', 'message'].forEach((f) => form.elements[f].addEventListener('input', () => setErr(f, '')));

    function validate(v) {
      const errs = {};
      if (v.name.trim().length < 2) errs.name = 'Please enter your name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errs.email = 'Enter a valid email address, e.g. name@example.com.';
      if (v.phone.trim() && !/^[0-9+().\-\s]{5,40}$/.test(v.phone.trim())) errs.phone = 'Use digits, spaces, + ( ) or - only.';
      if (v.message.trim().length < 10) errs.message = 'Please write at least 10 characters so I can help.';
      return errs;
    }

    function done() {
      $('#form-slot').innerHTML = `
        <div class="card sent" role="status">
          <span class="tick">${icon('check', 30)}</span>
          <h2>Message sent</h2>
          <p>Thank you. I will reply to the email address you provided as soon as I can.</p>
          <button class="btn btn-ghost" type="button" id="again">Send another message</button>
        </div>`;
      $('#again').addEventListener('click', () => { app.innerHTML = shell(c, PAGES.contact(c).html); bindAll(c); });
      toast('Message sent. Thank you!');
      $('.sent h2').setAttribute('tabindex', '-1');
      $('.sent h2').focus();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrs(); say('');
      const v = Object.fromEntries(new FormData(form).entries());
      v.name = v.name || ''; v.email = v.email || ''; v.phone = v.phone || ''; v.subject = v.subject || ''; v.message = v.message || '';
      const errs = validate(v);
      const keys = Object.keys(errs);
      if (keys.length) {
        keys.forEach((k) => setErr(k, errs[k]));
        say('err', 'Please fix the highlighted fields.');
        form.elements[keys[0]].focus();
        return;
      }
      btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      const label = btn.innerHTML;
      btn.innerHTML = '<span class="spin" aria-hidden="true"></span> Sending…';
      say('busy', 'Sending your message…');
      try {
        if (API) {
          const res = await fetch(API + '/api/inquiries.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: v.name, email: v.email, phone: v.phone, subject: v.subject, message: v.message, _honey: v._honey || '', _elapsed: Date.now() - shownAt }),
          });
          let j = null;
          try { j = await res.json(); } catch (_) { /* non-JSON error page */ }
          if (!res.ok || !j || !j.ok) {
            const er = (j && j.error) || {};
            if (er.fields) Object.keys(er.fields).forEach((k) => setErr(k, er.fields[k]));
            const e2 = new Error(er.message || 'The server could not accept your message.');
            e2.validation = Boolean(er.fields);
            throw e2;
          }
        } else if (CFG.staticFormFallback === 'formsubmit' && s.email) {
          const res = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(s.email), {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ name: v.name, email: v.email, phone: v.phone, _subject: v.subject || `New enquiry from ${v.name}`, message: v.message, _honey: v._honey || '', _captcha: 'false', _template: 'table' }),
          });
          if (!res.ok) throw new Error('The message service is unavailable.');
        } else {
          const body = `${v.message}\n\n${v.name}\n${v.email}${v.phone ? '\n' + v.phone : ''}`;
          location.href = `mailto:${s.email}?subject=${encodeURIComponent(v.subject || 'Enquiry from website')}&body=${encodeURIComponent(body)}`;
          say('ok', 'Your email app should open with the message ready to send.');
          return;
        }
        done();
      } catch (err) {
        const offline = err.name === 'TypeError';
        const text = offline
          ? 'Could not reach the server. Check your connection' + (s.email ? ` or email ${s.email} directly.` : '.')
          : err.message + (!err.validation && s.email ? ` You can also email ${s.email}.` : '');
        say('err', text);
        toast(err.validation ? 'Please check the highlighted fields.' : 'Message not sent.', 'err');
        if (err.validation) { const bad = $('[aria-invalid="true"]', form); bad && bad.focus(); }
      } finally {
        if (form.isConnected) { btn.removeAttribute('aria-busy'); btn.disabled = false; btn.innerHTML = label; }
      }
    });
  }

  function bindAll(c) {
    bindShell();
    bindDecor();
    bindRoles(c);
    bindFilters();
    bindGallery(c);
    bindForm(c);
  }

  /* ───────── mount ───────── */
  function mount(c) {
    clearTimers();
    document.body.classList.remove('no-scroll');
    const view = (PAGES[page] || PAGES.home)(c);
    applyDefaultTheme(c.settings.defaultTheme);
    app.innerHTML = shell(c, view.html);
    applySeo(c, view);
    bindAll(c);
  }

  async function boot() {
    const cached = readCache();
    let shown = null;
    if (cached) { shown = normalize(cached.data); mount(shown); }
    else { app.innerHTML = shell(normalize(null), '<p class="boot" role="status">Loading…</p>'); bindShell(); }

    let fresh = null;
    try { fresh = await fetchFresh(); }
    catch (err) {
      console.error('[portfolio] could not load any content:', err);
      if (!shown) {
        const c = normalize(null);
        app.innerHTML = shell(c, `<section class="nf"><h1>Content unavailable</h1><p class="lead">The page content could not be loaded. Please refresh, or try again in a moment.</p></section>`);
        bindShell();
      }
      return;
    }
    // Re-render only when there was nothing cached yet, or the content really changed.
    if (!cached || cached.v !== fresh.version) {
      const y = window.scrollY;
      writeCache(fresh.data, fresh.version);
      mount(normalize(fresh.data));
      if (cached) window.scrollTo(0, y);
    }
  }

  boot();
})();
