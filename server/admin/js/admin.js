/**
 * Admin shell: sidebar, hash router and shared helpers.
 * Each view file (dashboard.js, inquiries.js, ...) registers itself with Admin.register().
 *
 * Access control is enforced by the SERVER on every API call. The check in start() only decides
 * which screen to show; hiding the UI is never what protects the data.
 */
(function () {
  'use strict';
  const { h, icon, btn } = { h: UI.h, icon: UI.icon, btn: UI.btn };
  const API = window.AdminAPI;

  const GROUPS = [
    { label: null, ids: ['overview'] },
    { label: 'Inbox', ids: ['inquiries'] },
    { label: 'Content', ids: ['projects', 'skills', 'services', 'experience', 'education', 'achievements', 'testimonials', 'gallery'] },
    { label: 'Site', ids: ['settings', 'media'] },
    { label: 'Account', ids: ['security'] },
  ];

  const Admin = {
    views: {},
    /** A view may set this to a function returning true while it has unsaved changes. */
    guard: null,
    unread: 0,

    register(id, def) { Admin.views[id] = def; },

    /** Replaced by media.js. */
    pickMedia() { return Promise.resolve(null); },

    setUnread(n) {
      Admin.unread = n;
      const b = document.getElementById('nav-badge-inquiries');
      if (!b) return;
      b.textContent = n > 99 ? '99+' : String(n);
      b.hidden = n <= 0;
      b.setAttribute('aria-label', n + ' new');
    },

    go(id) { location.hash = '#/' + id; },

    async start() {
      let st;
      try {
        st = await API.status();
      } catch (e) {
        document.body.classList.remove('is-booting');
        document.getElementById('admin').appendChild(h('div', { class: 'auth-card' },
          h('h1', { text: 'Cannot reach the server' }), h('p', { text: e.message }),
          btn('Try again', { kind: 'primary', onClick: () => location.reload() })));
        return;
      }
      if (!st.authenticated) { location.replace('index.html'); return; }
      API.onUnauthenticated = () => {
        UI.toast('Your session has expired. Taking you to the sign-in page…', 'err');
        setTimeout(() => location.replace('index.html'), 1400);
      };
      Admin.siteUrl = st.siteUrl;
      Admin.buildShell();
      window.addEventListener('hashchange', Admin.route);
      window.addEventListener('beforeunload', (e) => { if (Admin.guard && Admin.guard()) { e.preventDefault(); e.returnValue = ''; } });
      document.body.classList.remove('is-booting');
      Admin.route();
      // unread badge (cheap call)
      API.get('inquiries.php?per_page=1').then((d) => Admin.setUnread(d.counts.new)).catch(() => {});
    },

    buildShell() {
      const root = document.getElementById('admin');
      UI.clear(root);

      const nav = h('nav', { 'aria-label': 'Admin' });
      GROUPS.forEach((g) => {
        const ul = h('ul', { class: 'nav-list' });
        g.ids.forEach((id) => {
          const v = Admin.views[id];
          if (!v) return;
          const a = h('a', { class: 'nav-link', href: '#/' + id, dataset: { id } },
            icon(v.icon, 18), h('span', { class: 'nav-txt', text: v.nav || v.title }),
            id === 'inquiries' ? h('span', { class: 'nav-badge', id: 'nav-badge-inquiries', hidden: true }) : null);
          a.addEventListener('click', async (e) => {
            if (Admin.guard && Admin.guard() && location.hash !== '#/' + id) {
              e.preventDefault();
              const ok = await UI.confirm({ title: 'Discard unsaved changes?', message: 'You have changes that have not been saved. If you leave this page they will be lost.', confirmText: 'Discard changes', danger: true });
              if (ok) { Admin.guard = null; location.hash = '#/' + id; }
              return;
            }
            Admin.closeDrawer();
          });
          ul.appendChild(h('li', null, a));
        });
        nav.appendChild(h('div', { class: 'nav-group' }, g.label ? h('p', { class: 'nav-label', text: g.label }) : null, ul));
      });

      const signOut = btn('Sign out', { kind: 'ghost', icon: 'logout' });
      signOut.addEventListener('click', () => UI.busy(signOut, async () => {
        try { await API.post('auth.php?action=logout'); } catch (e) { /* already signed out */ }
        location.replace('index.html');
      }));

      const side = h('aside', { class: 'side', id: 'side', 'aria-label': 'Admin navigation' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('check', 18)), h('span', { class: 'brand-name', text: 'Portfolio admin' })),
        nav,
        h('div', { class: 'side-foot' },
          Admin.siteUrl ? h('a', { class: 'btn btn-ghost', href: Admin.siteUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('up', 17), h('span', { text: 'View website' })) : null,
          signOut));

      const burger = btn('Open menu', { kind: 'ghost', iconOnly: true, icon: 'menu' });
      burger.id = 'burger';
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-controls', 'side');
      burger.addEventListener('click', Admin.openDrawer);

      const title = h('h1', { id: 'view-title', tabindex: '-1' });
      const actions = h('div', { class: 'bar-actions', id: 'view-actions' });
      const scrim = h('div', { class: 'scrim', id: 'scrim' });
      scrim.addEventListener('click', Admin.closeDrawer);

      root.append(
        h('div', { class: 'layout', id: 'layout' },
          side, scrim,
          h('div', { class: 'col' },
            h('header', { class: 'bar' }, burger, title, actions),
            h('main', { id: 'view', class: 'view' }))));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Admin.closeDrawer(); });
    },

    openDrawer() {
      document.getElementById('layout').classList.add('drawer-open');
      document.getElementById('burger').setAttribute('aria-expanded', 'true');
      const first = document.querySelector('#side .nav-link');
      first && first.focus();
    },
    closeDrawer() {
      const l = document.getElementById('layout');
      if (!l || !l.classList.contains('drawer-open')) return;
      l.classList.remove('drawer-open');
      document.getElementById('burger').setAttribute('aria-expanded', 'false');
    },

    cleanup: null,
    token: 0,

    async route() {
      const id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'overview';
      const def = Admin.views[id] || Admin.views.overview;
      const view = document.getElementById('view');
      const mine = ++Admin.token;

      if (Admin.cleanup) { try { Admin.cleanup(); } catch (e) { /* ignore */ } Admin.cleanup = null; }
      Admin.guard = null;
      document.querySelectorAll('.nav-link').forEach((a) => {
        if (a.dataset.id === (Admin.views[id] ? id : 'overview')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      document.getElementById('view-title').textContent = def.title;
      document.title = def.title + ' · Portfolio admin';
      const actions = UI.clear(document.getElementById('view-actions'));
      UI.clear(view).appendChild(UI.spinner());

      const ctx = {
        actions(...nodes) { if (mine === Admin.token) nodes.flat().forEach((n) => n && actions.appendChild(n)); },
        isCurrent() { return mine === Admin.token; },
      };
      try {
        const box = h('div', { class: 'view-in' });
        const cleanup = await def.render(box, ctx);
        if (mine !== Admin.token) { if (typeof cleanup === 'function') cleanup(); return; } // user navigated away meanwhile
        UI.clear(view).appendChild(box);
        Admin.cleanup = typeof cleanup === 'function' ? cleanup : null;
        view.scrollTop = 0; window.scrollTo(0, 0);
      } catch (e) {
        if (mine !== Admin.token) return;
        const retry = btn('Try again', { kind: 'primary', icon: 'refresh', onClick: () => Admin.route() });
        UI.clear(view).appendChild(h('div', { class: 'error-state', role: 'alert' }, h('h2', { text: 'Could not load this page' }), h('p', { text: e.message || 'Unexpected error.' }), retry));
      }
    },
  };

  window.Admin = Admin;
})();
