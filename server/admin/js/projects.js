/**
 * Projects: add, edit, delete, reorder, publish/unpublish, feature, tags, links, image.
 * Reorder changes the order shown on the public site.
 */
(function () {
  'use strict';
  const { h, icon, btn } = { h: UI.h, icon: UI.icon, btn: UI.btn };
  const API = window.AdminAPI;

  const FIELDS = [
    { name: 'title', label: 'Title', type: 'text', required: true, max: 120, wide: true },
    { name: 'description', label: 'Description', type: 'textarea', max: 1500, rows: 4, wide: true, help: 'A short summary shown on the project card.' },
    { name: 'tags', label: 'Technology tags', type: 'tags', max: 24, maxItems: 8, wide: true, help: 'Press Enter or comma after each tag. They also become the filter buttons on the public Projects page.' },
    { name: 'liveUrl', label: 'Live demo URL', type: 'url', max: 300, placeholder: 'https://', help: 'Leave empty to hide the button.' },
    { name: 'githubUrl', label: 'GitHub URL', type: 'url', max: 300, placeholder: 'https://github.com/', help: 'Leave empty to hide the button.' },
    { name: 'image', label: 'Thumbnail image', type: 'media', kind: 'image', wide: true, help: 'Optional. Without one, a coloured tile with the first letter is shown.' },
    { name: 'featured', label: 'Featured', type: 'checkbox', switchLabel: 'Featured (shown on the home page)', default: false },
    { name: 'published', label: 'Published', type: 'checkbox', switchLabel: 'Published (visible on the website)', default: true },
  ];

  Admin.register('projects', {
    title: 'Projects',
    icon: 'code',
    async render(root, ctx) {
      let items = (await API.get('projects.php')).items;
      let filter = '';
      const list = h('div', { class: 'rows' });
      const count = h('p', { class: 'muted small', role: 'status' });
      const search = h('input', { type: 'search', placeholder: 'Filter projects', 'aria-label': 'Filter projects', maxlength: 100 });

      async function edit(item) {
        const saved = await UI.editor({
          title: item ? 'Edit project' : 'Add project', size: 'lg', fields: FIELDS, values: item || { published: true },
          saveText: item ? 'Save changes' : 'Add project',
          onSave: (v) => (item ? API.put('projects.php?id=' + encodeURIComponent(item.id), v) : API.post('projects.php', v)),
        });
        if (saved) { UI.toast(item ? 'Project updated.' : 'Project added.'); await reload(); }
      }

      async function reload() {
        items = (await API.get('projects.php')).items;
        draw();
      }

      async function patch(item, changes, okMsg) {
        try {
          const updated = await API.put('projects.php?id=' + encodeURIComponent(item.id), changes);
          Object.assign(item, updated);
          UI.toast(okMsg);
          draw();
        } catch (e) { UI.error(e); draw(); }
      }

      async function move(item, dir) {
        const i = items.indexOf(item);
        const j = i + dir;
        if (j < 0 || j >= items.length) return;
        const next = items.slice();
        next.splice(j, 0, next.splice(i, 1)[0]);
        try {
          await API.post('projects.php?action=reorder', { ids: next.map((x) => x.id) });
          items = next;
          draw();
          const b = list.querySelector('[data-id="' + item.id + '"] .move-' + (dir < 0 ? 'up' : 'down'));
          b && !b.disabled && b.focus();
        } catch (e) { UI.error(e); await reload(); }
      }

      async function remove(item) {
        const ok = await UI.confirm({ title: 'Delete project?', message: '"' + item.title + '" will be removed from the website. This cannot be undone.', confirmText: 'Delete project', danger: true });
        if (!ok) return;
        try { await API.del('projects.php?id=' + encodeURIComponent(item.id)); UI.toast('Project deleted.'); await reload(); }
        catch (e) { UI.error(e); }
      }

      function toggle(item, key, label, okMsg) {
        const input = h('input', { type: 'checkbox', checked: Boolean(item[key]), 'aria-label': label + ': ' + item.title });
        input.addEventListener('change', () => patch(item, { [key]: input.checked }, okMsg(input.checked)));
        return h('label', { class: 'mini-switch' }, input, h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', { class: 'sw-txt', text: label }));
      }

      function row(item, idx) {
        const src = API.mediaUrl(item.image);
        const thumb = h('div', { class: 'thumb' }, src ? h('img', { src, alt: '', loading: 'lazy' }) : h('span', { text: (item.title || '?').charAt(0).toUpperCase() }));
        const up = btn('Move up', { kind: 'ghost', iconOnly: true, small: true, icon: 'up', disabled: idx === 0, onClick: () => move(item, -1) });
        up.classList.add('move-up');
        const down = UI.flipDown(btn('Move down', { kind: 'ghost', iconOnly: true, small: true, icon: 'up', disabled: idx === items.length - 1, onClick: () => move(item, 1) }));
        down.classList.add('move-down');
        return h('article', { class: 'row', dataset: { id: item.id } },
          thumb,
          h('div', { class: 'row-main' },
            h('h3', null, item.title, item.published ? null : h('span', { class: 'pill pill-muted', text: 'Draft' }), item.featured ? h('span', { class: 'pill pill-warn', text: 'Featured' }) : null),
            item.description ? h('p', { class: 'muted clamp', text: item.description }) : null,
            h('div', { class: 'tags-row' }, (item.tags || []).map((t) => h('span', { class: 'tag tag-static', text: t })),
              item.liveUrl ? h('a', { class: 'link small', href: item.liveUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Live' }) : null,
              item.githubUrl ? h('a', { class: 'link small', href: item.githubUrl, target: '_blank', rel: 'noopener noreferrer', text: 'GitHub' }) : null)),
          h('div', { class: 'row-side' },
            toggle(item, 'published', 'Published', (on) => (on ? 'Project published.' : 'Project hidden (draft).')),
            toggle(item, 'featured', 'Featured', (on) => (on ? 'Marked as featured.' : 'Removed from featured.')),
            h('div', { class: 'row-actions' }, up, down,
              btn('Edit project', { kind: 'ghost', iconOnly: true, small: true, icon: 'edit', onClick: () => edit(item) }),
              btn('Delete project', { kind: 'ghost', iconOnly: true, small: true, icon: 'trash', onClick: () => remove(item) }))));
      }

      function draw() {
        UI.clear(list);
        const q = filter.toLowerCase();
        const shown = items.filter((p) => !q || (p.title + ' ' + (p.tags || []).join(' ') + ' ' + p.description).toLowerCase().includes(q));
        count.textContent = shown.length === items.length ? items.length + (items.length === 1 ? ' project' : ' projects') : 'Showing ' + shown.length + ' of ' + items.length;
        if (!items.length) { list.appendChild(UI.empty('No projects yet.', btn('Add your first project', { kind: 'primary', icon: 'plus', onClick: () => edit(null) }))); return; }
        if (!shown.length) { list.appendChild(UI.empty('No projects match that filter.')); return; }
        // reorder arrows act on the full list, so they are only offered when nothing is filtered
        shown.forEach((p) => {
          const r = row(p, items.indexOf(p));
          if (q) r.querySelectorAll('.move-up, .move-down').forEach((b) => { b.disabled = true; b.title = 'Clear the filter to reorder'; });
          list.appendChild(r);
        });
      }

      search.addEventListener('input', () => { filter = search.value.trim(); draw(); });
      ctx.actions(btn('Add project', { kind: 'primary', icon: 'plus', onClick: () => edit(null) }));
      root.append(h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search', 17), search), count),
        h('p', { class: 'muted hint', text: 'The order here is the order on your website. Use the arrows to rearrange.' }), list);
      draw();

      if (sessionStorage.getItem('rp_admin_open_new') === 'projects') { sessionStorage.removeItem('rp_admin_open_new'); edit(null); }
    },
  });
})();
