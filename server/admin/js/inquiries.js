/**
 * Inquiries: list, search, filter, detail, mark read/unread, bulk actions, delete, CSV export.
 * Visitor-supplied text is only ever inserted with textContent (never as HTML).
 */
(function () {
  'use strict';
  const { h, icon, btn } = { h: UI.h, icon: UI.icon, btn: UI.btn };
  const API = window.AdminAPI;

  Admin.register('inquiries', {
    title: 'Inquiries',
    icon: 'inbox',
    async render(root, ctx) {
      const S = { status: 'all', q: '', page: 1, per: 25, selected: new Set(), data: null };
      let searchTimer = null;
      let alive = true;

      const list = h('div', { class: 'inq-list', 'aria-live': 'polite' });
      const bulk = h('div', { class: 'bulk', hidden: true });
      const pager = h('div', { class: 'pager' });
      const segs = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter by status' });
      const search = h('input', { type: 'search', id: 'inq-search', placeholder: 'Search name, email, subject or message', 'aria-label': 'Search inquiries', maxlength: 100 });
      const exportLink = h('a', { class: 'btn btn-ghost', href: '#', download: '' }, icon('download', 17), h('span', { text: 'Export CSV' }));

      const qs = () => {
        const p = new URLSearchParams({ status: S.status, q: S.q, page: String(S.page), per_page: String(S.per) });
        return p.toString();
      };

      async function load(keepSelection) {
        if (!keepSelection) S.selected.clear();
        let d;
        try { d = await API.get('inquiries.php?' + qs()); }
        catch (e) { UI.clear(list).appendChild(h('div', { class: 'error-state', role: 'alert' }, h('p', { text: e.message }), btn('Retry', { kind: 'primary', onClick: () => load() }))); return; }
        if (!alive) return;
        S.data = d;
        S.page = d.page;
        Admin.setUnread(d.counts.new);
        draw();
      }

      function drawSegs() {
        UI.clear(segs);
        const c = S.data ? S.data.counts : { total: 0, new: 0, read: 0 };
        [['all', 'All', c.total], ['new', 'New', c.new], ['read', 'Read', c.read]].forEach(([key, label, n]) => {
          const b = h('button', { type: 'button', class: 'seg', 'aria-pressed': String(S.status === key) }, label, h('span', { class: 'seg-n', text: String(n) }));
          b.addEventListener('click', () => { S.status = key; S.page = 1; load(); });
          segs.appendChild(b);
        });
        exportLink.href = '../api/inquiries.php?export=csv&' + new URLSearchParams({ status: S.status, q: S.q }).toString();
      }

      function row(i) {
        const cb = h('input', { type: 'checkbox', 'aria-label': 'Select inquiry from ' + i.name, checked: S.selected.has(i.id) });
        cb.addEventListener('change', () => { if (cb.checked) S.selected.add(i.id); else S.selected.delete(i.id); drawBulk(); });
        const open = h('button', { type: 'button', class: 'inq-open' },
          h('span', { class: 'inq-who' }, h('strong', { text: i.name }), h('span', { class: 'muted', text: i.email })),
          h('span', { class: 'inq-sub' }, h('span', { class: i.read ? '' : 'inq-subject', text: i.subject || '(no subject)' }), h('span', { class: 'muted inq-snip', text: ' ' + i.message.replace(/\s+/g, ' ').slice(0, 90) })),
          h('span', { class: 'muted small inq-date', title: UI.date(i.createdAt), text: UI.ago(i.createdAt) }));
        open.addEventListener('click', () => detail(i.id));
        return h('div', { class: 'inq-row' + (i.read ? '' : ' is-new') },
          h('label', { class: 'inq-check' }, cb),
          h('span', { class: 'dot' + (i.read ? '' : ' dot-new'), role: 'img', 'aria-label': i.read ? 'Read' : 'New' }),
          open,
          h('div', { class: 'row-actions' },
            btn(i.read ? 'Mark as unread' : 'Mark as read', { kind: 'ghost', iconOnly: true, small: true, icon: i.read ? 'mail' : 'mailopen', onClick: () => setRead([i.id], !i.read) }),
            btn('Delete inquiry', { kind: 'ghost', iconOnly: true, small: true, icon: 'trash', onClick: () => remove([i.id], i.name) })));
      }

      function draw() {
        drawSegs();
        UI.clear(list);
        const d = S.data;
        if (!d.items.length) {
          list.appendChild(UI.empty(S.q || S.status !== 'all'
            ? 'No inquiries match your search or filter.'
            : 'No inquiries yet. Messages sent from your contact form will appear here.'));
        } else {
          const all = h('input', { type: 'checkbox', 'aria-label': 'Select all on this page' });
          all.checked = d.items.every((i) => S.selected.has(i.id));
          all.addEventListener('change', () => { d.items.forEach((i) => (all.checked ? S.selected.add(i.id) : S.selected.delete(i.id))); draw(); });
          list.appendChild(h('div', { class: 'inq-head' }, h('label', { class: 'inq-check' }, all), h('span', { text: d.matches + (d.matches === 1 ? ' inquiry' : ' inquiries') })));
          d.items.forEach((i) => list.appendChild(row(i)));
        }
        drawBulk();
        UI.clear(pager);
        if (d.pages > 1) {
          pager.append(
            btn('Previous', { kind: 'ghost', small: true, disabled: d.page <= 1, onClick: () => { S.page--; load(); } }),
            h('span', { class: 'muted', text: 'Page ' + d.page + ' of ' + d.pages }),
            btn('Next', { kind: 'ghost', small: true, disabled: d.page >= d.pages, onClick: () => { S.page++; load(); } }));
        }
      }

      function drawBulk() {
        UI.clear(bulk);
        const n = S.selected.size;
        bulk.hidden = n === 0;
        if (!n) return;
        const ids = Array.from(S.selected);
        bulk.append(
          h('strong', { text: n + ' selected' }),
          btn('Mark read', { small: true, kind: 'ghost', icon: 'mailopen', onClick: () => setRead(ids, true) }),
          btn('Mark unread', { small: true, kind: 'ghost', icon: 'mail', onClick: () => setRead(ids, false) }),
          btn('Delete', { small: true, kind: 'danger', icon: 'trash', onClick: () => remove(ids) }),
          btn('Clear selection', { small: true, kind: 'ghost', onClick: () => { S.selected.clear(); draw(); } }));
      }

      async function setRead(ids, read) {
        try {
          await API.post('inquiries.php?action=bulk', { action: read ? 'mark_read' : 'mark_unread', ids });
          UI.toast(ids.length === 1 ? (read ? 'Marked as read.' : 'Marked as unread.') : ids.length + ' inquiries updated.');
          S.selected.clear();
          await load();
        } catch (e) { UI.error(e); }
      }

      async function remove(ids, name) {
        const ok = await UI.confirm({
          title: ids.length === 1 ? 'Delete this inquiry?' : 'Delete ' + ids.length + ' inquiries?',
          message: (name ? 'The message from ' + name : 'The selected messages') + ' will be permanently deleted. This cannot be undone.',
          confirmText: 'Delete', danger: true,
        });
        if (!ok) return;
        try {
          await API.post('inquiries.php?action=bulk', { action: 'delete', ids });
          UI.toast('Deleted.');
          S.selected.clear();
          await load();
        } catch (e) { UI.error(e); }
      }

      async function detail(id) {
        let i;
        try { i = await API.get('inquiries.php?id=' + encodeURIComponent(id)); } catch (e) { UI.error(e); return; }
        const field = (label, node) => h('div', { class: 'kv' }, h('dt', { text: label }), h('dd', null, node));
        const mail = h('a', { href: 'mailto:' + i.email, text: i.email });
        const dl = h('dl', { class: 'kv-list' },
          field('Name', i.name),
          field('Email', mail),
          field('Phone', i.phone ? h('a', { href: 'tel:' + i.phone.replace(/[^\d+]/g, ''), text: i.phone }) : h('span', { class: 'muted', text: 'Not provided' })),
          field('Subject', i.subject || h('span', { class: 'muted', text: 'Not provided' })),
          field('Received', UI.date(i.createdAt)),
          field('Status', h('span', { class: 'pill ' + (i.read ? 'pill-muted' : 'pill-ok'), text: i.read ? 'Read' : 'New' })));
        const message = h('div', { class: 'message-box', tabindex: '0', 'aria-label': 'Message' }, i.message);
        const reply = h('a', { class: 'btn btn-ghost', href: 'mailto:' + i.email + '?subject=' + encodeURIComponent('Re: ' + (i.subject || 'Your enquiry')) }, icon('send', 17), h('span', { text: 'Reply by email' }));
        const toggle = btn(i.read ? 'Mark as unread' : 'Mark as read', { kind: 'primary', icon: i.read ? 'mail' : 'check' });
        const del = btn('Delete', { kind: 'danger', icon: 'trash' });
        const m = UI.modal({ title: 'Inquiry from ' + i.name, size: 'lg', body: h('div', null, dl, h('h3', { class: 'sub', text: 'Message' }), message), footer: [del, reply, toggle] });
        toggle.addEventListener('click', () => UI.busy(toggle, async () => { await setRead([i.id], !i.read); m.close(); }));
        del.addEventListener('click', async () => { m.close(); await remove([i.id], i.name); });
        toggle.focus();
      }

      let t;
      search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { S.q = search.value.trim(); S.page = 1; load(); }, 280);
      });

      ctx.actions(exportLink, btn('Refresh', { kind: 'ghost', icon: 'refresh', onClick: () => load(true) }));
      root.append(
        h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search', 17), search), segs),
        bulk, h('section', { class: 'card flush' }, list), pager);

      await load();
      t = sessionStorage.getItem('rp_admin_open_inquiry');
      if (t) { sessionStorage.removeItem('rp_admin_open_inquiry'); detail(t); }
      return () => { alive = false; clearTimeout(searchTimer); };
    },
  });
})();
