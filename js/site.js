(() => {
  'use strict';
  const { icon } = window.RPIcons;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ───────── helpers ─────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Allow only http(s), mailto and relative paths in links/images.
  const safeUrl = (u) => {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return '';
    return u; // relative path such as uploads/photo.jpg
  };
  const paras = (t) => String(t || '').split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const num = (i) => String(i + 1).padStart(2, '0');
  const hue = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const SOCIAL = ['linkedin', 'github', 'instagram', 'facebook', 'youtube'];

  const socials = (s) => SOCIAL.filter((k) => safeUrl(s.social?.[k]))
    .map((k) => `<a class="soc" href="${esc(safeUrl(s.social[k]))}" target="_blank" rel="noopener noreferrer" aria-label="${k}">${icon(k, 20)}</a>`).join('');

  // ───────── layout ─────────
  function layout(c, body) {
    const s = c.settings;
    const nav = [['index.html#top', 'Home', 'rocket'], ['index.html#about', 'About', 'cpu'], ['index.html#services', 'Services', 'layers'], ['index.html#work', 'Projects', 'chart'], ['index.html#resume', 'Resume', 'pen'], ['gallery.html', 'Gallery', 'image']];
    const initials = (s.name || 'R').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
    return `
<a class="skip" href="#main">Skip to content</a>
<aside class="sidebar" id="nav">
  <a class="side-brand" href="index.html#top"><span class="brand-mark">${esc(initials)}</span><span><b>${esc(s.name || s.brand)}</b><small>PORTFOLIO</small></span></a>
  <div class="side-caption">MENU</div>
  <nav class="side-links" id="links" aria-label="Main navigation">
    ${nav.map(([h, l, ic]) => `<a href="${h}" class="${(l === 'Home' && document.body.dataset.page === 'home') || (l === 'Gallery' && document.body.dataset.page === 'gallery') ? 'active' : ''}"><span class="side-icon">${icon(ic, 18)}</span><span>${l}</span><span class="side-arrow">↗</span></a>`).join('')}
  </nav>
  <div class="side-bottom">
    <div class="side-availability"><i></i>${esc(s.availability || 'Open to opportunities')}</div>
    <div class="soc-row">${socials(s)}</div>
    <a class="side-contact" href="index.html#contact">Let's work together ${icon('arrow', 16)}</a>
    <small>© ${new Date().getFullYear()} ${esc(s.name || s.brand)}</small>
  </div>
</aside>
<button class="mobile-menu" id="burger" aria-label="Open navigation" aria-expanded="false">${icon('menu', 22)}</button>
<div class="site-shell"><main id="main">${body}</main>
<footer class="foot"><div class="wrap foot-in"><div><div class="foot-brand">${esc(s.footerText || s.brand)}</div><p class="muted">Designed & built with care · © ${new Date().getFullYear()}</p></div><div class="soc-row">${socials(s)}</div><a class="to-top" href="#top" aria-label="Back to top">${icon('up', 18)}<span>Back to top</span></a></div></footer></div>
<div class="nav-scrim" id="nav-scrim"></div>`;
  }

  function contactSection(s) {
    return `
<section class="sec contact" id="contact">
  <div class="wrap contact-grid">
    <div class="reveal">
      <p class="kicker">Contact</p>
      <h2 class="h2">Have a project in mind?<br><em>Let's talk.</em></h2>
      <p class="lead">Tell me what you need. I read every message and reply personally, usually within a day.</p>
      <ul class="contact-list">
        ${s.email ? `<li>${icon('mail', 20)}<a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ''}
        ${s.phone ? `<li>${icon('call', 20)}<a href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a></li>` : ''}
        ${s.location ? `<li>${icon('pin', 20)}<span>${esc(s.location)}</span></li>` : ''}
      </ul>
      <div class="soc-row">${socials(s)}</div>
    </div>
    <form class="card form reveal" id="enquiry" novalidate>
      <div class="row2">
        <label><span>Full name</span><input name="name" required maxlength="120" autocomplete="name"></label>
        <label><span>Email</span><input name="email" type="email" required maxlength="200" autocomplete="email"></label>
      </div>
      <div class="row2">
        <label><span>Phone <span class="opt">(optional)</span></span><input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>
        <label><span>Subject</span><input name="subject" maxlength="160"></label>
      </div>
      <label><span>Message</span><textarea name="message" rows="6" required maxlength="5000"></textarea></label>
      <div class="hp" aria-hidden="true"><label>Leave this empty<input name="_honey" tabindex="-1" autocomplete="off"></label></div>
      <button class="btn" type="submit"><span>Send message</span>${icon('arrow', 18)}</button>
      <p class="form-status" id="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>`;
  }

  const projectCover = (p) => safeUrl(p.image)
    ? `<img src="${esc(safeUrl(p.image))}" alt="${esc(p.title)}" loading="lazy">`
    : `<div class="cover-gen" style="--h:${hue(p.title)}"><span>${esc(String(p.title).trim().slice(0, 1).toUpperCase())}</span></div>`;

  // ───────── pages ─────────
  function home(c) {
    const s = c.settings;
    const services = c.services.filter((x) => x.published !== false);
    const projects = c.projects.filter((x) => x.published !== false);
    const cv = safeUrl(s.cvFile);
    const roles = s.roles?.length ? s.roles : ['Developer'];
    const stats = (s.stats || []).filter((x) => x.value || x.label);
    document.title = s.seoTitle || `${s.name} — ${roles[0]}`;
    document.querySelector('meta[name=description]')?.setAttribute('content', s.seoDescription || s.heroIntro || '');
    if (s.seoKeywords) { let m = document.querySelector('meta[name=keywords]'); if (!m) { m = document.createElement('meta'); m.name = 'keywords'; document.head.append(m); } m.content = s.seoKeywords; }

    return layout(c, `
<section class="hero" id="top">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      ${s.availability ? `<p class="chip"><span class="dot"></span>${esc(s.availability)}</p>` : ''}
      <p class="kicker">${esc(s.eyebrow)}</p>
      <h1 class="display">${esc(s.name)}</h1>
      <p class="role-line">I'm a <span class="role" id="role" data-roles="${esc(JSON.stringify(roles))}">${esc(roles[0])}</span><span class="caret"></span></p>
      <p class="lead">${esc(s.heroIntro)}</p>
      <div class="cta">
        <a class="btn" href="#contact"><span>Start a project</span>${icon('arrow', 18)}</a>
        ${cv ? `<a class="btn btn-ghost" href="${esc(cv)}" target="_blank" rel="noopener">${icon('download', 18)}<span>Download CV</span></a>` : `<a class="btn btn-ghost" href="#resume"><span>View resume</span></a>`}
      </div>
      <div class="soc-row">${socials(s)}</div>
    </div>
    <div class="hero-photo">
      <div class="arch-bg"></div>
      <figure class="arch">${safeUrl(s.heroImage) ? `<img src="${esc(safeUrl(s.heroImage))}" alt="Portrait of ${esc(s.name)}" fetchpriority="high">` : ''}</figure>
      <div class="badge b1"><b>${services.length}</b><span>services</span></div>
      <div class="badge b2">${icon('code', 18)}<span>Mobile · Web · Design</span></div>
    </div>
  </div>
  ${stats.length ? `<div class="wrap stats">${stats.map((x) => `<div><b>${esc(x.value)}</b><span>${esc(x.label)}</span></div>`).join('')}</div>` : ''}
</section>

${services.length ? `<div class="marquee" aria-hidden="true"><div class="marquee-track">${[...services, ...services].map((x) => `<span>${esc(x.title)}</span><i></i>`).join('')}</div></div>` : ''}

<section class="sec about" id="about">
  <div class="wrap about-grid">
    <div class="reveal"><p class="kicker">About</p><h2 class="h2">${esc(s.aboutTitle)}</h2></div>
    <div class="reveal about-body">
      ${paras(s.aboutBody)}
      <div class="about-actions"><a class="btn btn-ghost" href="gallery.html">${icon('image', 18)}<span>See the gallery</span></a></div>
    </div>
  </div>
</section>

<section class="sec services" id="services">
  <div class="wrap">
    <div class="sec-head reveal"><p class="kicker">Services</p><h2 class="h2">What I can do <em>for you.</em></h2></div>
    <ul class="svc-list">
      ${services.map((x, i) => `
      <li class="reveal"><a class="svc" href="service.html?s=${encodeURIComponent(x.slug)}">
        <span class="svc-n">${num(i)}</span><span class="svc-ic">${icon(x.icon, 26)}</span>
        <span class="svc-t"><b>${esc(x.title)}</b><span>${esc(x.summary)}</span></span>
        <span class="svc-go">${icon('arrow', 22)}</span>
      </a></li>`).join('')}
    </ul>
  </div>
</section>

<section class="sec work" id="work">
  <div class="wrap">
    <div class="sec-head reveal"><p class="kicker">Selected work</p><h2 class="h2">Things I've <em>built.</em></h2></div>
    <div class="proj-grid">
      ${projects.map((p) => {
      const link = safeUrl(p.link);
      const inner = `<div class="cover">${projectCover(p)}</div>
          <div class="proj-body"><div class="tags">${(p.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          <h3>${esc(p.title)}${link ? icon('up', 18) : ''}</h3><p>${esc(p.description)}</p></div>`;
      return link ? `<a class="proj reveal" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<article class="proj reveal">${inner}</article>`;
    }).join('')}
    </div>
  </div>
</section>

<section class="sec resume" id="resume">
  <div class="wrap">
    <div class="sec-head reveal"><p class="kicker">Resume</p><h2 class="h2">Experience, <em>education</em> &amp; skills.</h2></div>
    <div class="res-grid">
      <div class="reveal"><h3 class="h3">Experience</h3><ol class="timeline">
        ${(c.experience || []).map((e) => `<li><span class="when">${esc(e.period)}</span><b>${esc(e.role)}</b><span class="org">${esc(e.org)}</span>${e.text ? `<p>${esc(e.text)}</p>` : ''}</li>`).join('')}
      </ol></div>
      <div class="reveal"><h3 class="h3">Education</h3><ol class="timeline">
        ${(c.education || []).map((e) => `<li>${e.period ? `<span class="when">${esc(e.period)}</span>` : ''}<b>${esc(e.title)}</b><span class="org">${esc(e.org)}</span></li>`).join('')}
      </ol></div>
      <div class="reveal"><h3 class="h3">Skills</h3><ul class="skills">
        ${(c.skills || []).map((k) => `<li><div><span>${esc(k.name)}</span><em>${Number(k.level) || 0}%</em></div><i style="--w:${Math.max(0, Math.min(100, Number(k.level) || 0))}%"></i></li>`).join('')}
      </ul></div>
    </div>
    ${cv ? `<div class="res-cta reveal"><a class="btn" href="${esc(cv)}" target="_blank" rel="noopener">${icon('download', 18)}<span>Download full CV</span></a></div>` : ''}
  </div>
</section>

${contactSection(s)}`);
  }

  function servicePage(c) {
    const s = c.settings;
    const slug = new URLSearchParams(location.search).get('s');
    const live = c.services.filter((x) => x.published !== false);
    const svc = live.find((x) => x.slug === slug);
    if (!svc) return notFound(c);
    const others = live.filter((x) => x.id !== svc.id);
    const subj = encodeURIComponent('Enquiry: ' + svc.title);
    document.title = `${svc.title} — ${s.name}`;
    document.querySelector('meta[name=description]')?.setAttribute('content', svc.summary || '');
    return layout(c, `
<section class="page-hero"><div class="wrap">
  <a class="back" href="index.html#services">${icon('arrow', 16)}<span>All services</span></a>
  <div class="ph-ic">${icon(svc.icon, 34)}</div>
  <h1 class="display sm">${esc(svc.title)}</h1>
  <p class="lead">${esc(svc.summary)}</p>
  <div class="cta"><a class="btn" href="index.html?subject=${subj}#contact"><span>Enquire about this</span>${icon('arrow', 18)}</a></div>
</div></section>
<section class="sec tight"><div class="wrap narrow">
  <ol class="doc">${(svc.sections || []).map((x, i) => `<li class="reveal"><span class="doc-n">${num(i)}</span><div><h2>${esc(x.heading)}</h2>${paras(x.text)}</div></li>`).join('')}</ol>
  <div class="card cta-card reveal"><h3 class="h3">Ready to get started?</h3>
    <p class="muted">Send a short description of what you need and I'll come back with questions, a plan and a quote.</p>
    <a class="btn" href="index.html?subject=${subj}#contact"><span>Send an enquiry</span>${icon('arrow', 18)}</a></div>
</div></section>
${others.length ? `<section class="sec tight"><div class="wrap"><h3 class="h3">Other services</h3>
  <div class="chips">${others.map((x) => `<a class="chip-link" href="service.html?s=${encodeURIComponent(x.slug)}">${icon(x.icon, 18)}<span>${esc(x.title)}</span></a>`).join('')}</div></div></section>` : ''}`);
  }

  function galleryPage(c) {
    const s = c.settings;
    const items = (c.gallery || []).filter((g) => safeUrl(g.file));
    document.title = `Gallery — ${s.name}`;
    return layout(c, `
<section class="page-hero"><div class="wrap">
  <a class="back" href="index.html">${icon('arrow', 16)}<span>Back home</span></a>
  <h1 class="display sm">Gallery</h1><p class="lead">A few frames from work, travel and life.</p>
</div></section>
<section class="sec tight"><div class="wrap">
  ${items.length ? `<div class="masonry">${items.map((g, i) => `
    <button class="shot reveal" data-i="${i}" aria-label="Open photo ${i + 1}${g.caption ? ': ' + esc(g.caption) : ''}">
      <img src="${esc(safeUrl(g.file))}" alt="${esc(g.caption || 'Gallery photo ' + (i + 1))}" loading="lazy">${g.caption ? `<span>${esc(g.caption)}</span>` : ''}
    </button>`).join('')}</div>` : `<div class="card empty"><p>No photos yet. Check back soon.</p></div>`}
</div></section>
<div class="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="Photo viewer">
  <button class="lb-x" id="lb-x" aria-label="Close">${icon('close', 26)}</button>
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous">${icon('arrow', 26)}</button>
  <figure><img id="lb-img" alt=""><figcaption id="lb-cap"></figcaption></figure>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Next">${icon('arrow', 26)}</button>
</div>`);
  }

  function notFound(c) {
    document.title = `Not found — ${c.settings.name}`;
    return layout(c, `<section class="page-hero"><div class="wrap"><p class="kicker">404</p><h1 class="display sm">Page not found</h1>
      <p class="lead">That page doesn't exist or has moved.</p><div class="cta"><a class="btn" href="index.html"><span>Go home</span>${icon('arrow', 18)}</a></div></div></section>`);
  }

  // ───────── behaviours ─────────
  function initNav() {
    const nav = $('#nav'), links = $('#links'), burger = $('#burger'), scrim = $('#nav-scrim');
    const setMenu = (open) => { nav.classList.toggle('open', open); scrim?.classList.toggle('show', open); burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); };
    burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
    scrim?.addEventListener('click', () => setMenu(false));
    links.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
    const activeHash = () => { const hash = location.hash || '#top'; links.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href').endsWith(hash))); }
    addEventListener('hashchange', activeHash); activeHash();
  }

  function initReveal() {
    const items = $$('.reveal');
    if ('IntersectionObserver' in window && !reduce) {
      const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      items.forEach((el, i) => { el.style.transitionDelay = (i % 3) * 70 + 'ms'; io.observe(el); });
    } else items.forEach((el) => el.classList.add('in'));
  }

  function initRoles() {
    const el = $('#role');
    if (!el || reduce) return;
    let roles = []; try { roles = JSON.parse(el.dataset.roles || '[]'); } catch (e) { /* ignore */ }
    if (roles.length < 2) return;
    let w = 0, n = roles[0].length, del = true;
    const tick = () => {
      const word = roles[w];
      n += del ? -1 : 1;
      el.textContent = word.slice(0, n);
      let wait = del ? 45 : 85;
      if (!del && n === word.length) { del = true; wait = 1600; }
      else if (del && n === 0) { del = false; w = (w + 1) % roles.length; wait = 280; }
      setTimeout(tick, wait);
    };
    setTimeout(tick, 1800);
  }

  // Contact enquiries are stored by the first-party PHP API when configured.
  function initForm(c) {
    const form = $('#enquiry');
    if (!form) return;
    const status = $('#form-status');
    const subj = new URLSearchParams(location.search).get('subject');
    if (subj) form.elements.subject.value = subj.slice(0, 160);
    const say = (m, k) => { status.textContent = m; status.className = 'form-status ' + (k || ''); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      ['name', 'email', 'message'].forEach(k => f[k].removeAttribute('aria-invalid'));
      const bad = [];
      if (!f.name.value.trim()) bad.push('name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) bad.push('email');
      if (f.message.value.trim().length < 5) bad.push('message');
      if (bad.length) { bad.forEach(k => f[k].setAttribute('aria-invalid', 'true')); f[bad[0]].focus(); return say('Please check the highlighted fields.', 'err'); }
      if (f._honey.value) return say('Thank you! Your message has been sent.', 'ok');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true; say('Sending…');
      try {
        const response = await fetch(window.RP_API_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'inquiry', name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), subject: f.subject.value.trim(), message: f.message.value.trim(), website: f._honey.value }) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to submit');
        form.reset(); say("Thank you! Your message has been received. I'll reply soon.", 'ok');
      } catch (err) { say('The contact form is temporarily unavailable. Please email ' + (c.settings.email || 'me') + ' directly.', 'err'); }
      finally { btn.disabled = false; }
    });
  }

  function initLightbox() {
    const lb = $('#lightbox');
    if (!lb) return;
    const shots = $$('.shot'), img = $('#lb-img'), cap = $('#lb-cap');
    if (!shots.length) return;
    let cur = 0, opener = null;
    const show = (i) => { cur = (i + shots.length) % shots.length; const s = shots[cur].querySelector('img'); img.src = s.src; img.alt = s.alt; cap.textContent = shots[cur].querySelector('span')?.textContent || ''; };
    const open = (i, el) => { opener = el; show(i); lb.hidden = false; document.body.style.overflow = 'hidden'; $('#lb-x').focus(); };
    const close = () => { lb.hidden = true; document.body.style.overflow = ''; opener?.focus(); };
    shots.forEach((s, i) => s.addEventListener('click', () => open(i, s)));
    $('#lb-x').addEventListener('click', close);
    $('#lb-prev').addEventListener('click', () => show(cur - 1));
    $('#lb-next').addEventListener('click', () => show(cur + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    addEventListener('keydown', (e) => { if (lb.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
  }

  // ───────── boot ─────────
  (async () => {
    const app = $('#app');
    let c;
    try {
      let res;
      try { res = await fetch(window.RP_API_URL + '?action=content', { cache: 'no-store' }); } catch (_) { }
      if (res && res.ok) { const payload = await res.json(); c = payload.content || payload; }
      else { res = await fetch('content.json?v=' + Date.now(), { cache: 'no-store' }); if (!res.ok) throw new Error(res.status); c = await res.json(); }
    } catch (e) {
      app.innerHTML = '<p class="boot">Could not load site content. Please refresh the page.</p>';
      return;
    }
    const page = document.body.dataset.page;
    app.innerHTML = page === 'service' ? servicePage(c) : page === 'gallery' ? galleryPage(c) : page === '404' ? notFound(c) : home(c);
    initNav(); initReveal(); initRoles(); initForm(c); initLightbox();
    // jump to #hash target after render (home sections are created by JS)
    if (location.hash && $(location.hash)) setTimeout(() => $(location.hash).scrollIntoView(), 50);
  })();
})();
