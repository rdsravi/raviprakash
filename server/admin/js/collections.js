/**
 * One generic list/editor for the smaller content types. Each is described by a config object;
 * the server (lib/Schemas.php) re-validates everything, so these field lists are only UI hints.
 */
(function () {
  'use strict';
  const { h, icon, btn } = { h: UI.h, icon: UI.icon, btn: UI.btn };
  const API = window.AdminAPI;

  const CONFIGS = [
    {
      id: 'skills', title: 'Skills', icon: 'cpu', singular: 'skill', add: 'Add skill',
      hint: 'Skills are grouped by category on the Skills page. The percentage is a self-assessed level.',
      fields: [
        { name: 'name', label: 'Skill name', type: 'text', required: true, max: 60, wide: true },
        { name: 'category', label: 'Category', type: 'text', max: 60, placeholder: 'e.g. Mobile, Web, Backend', help: 'Skills with the same category are shown together.' },
        { name: 'level', label: 'Level', type: 'range', min: 0, maxValue: 100, default: 50 },
      ],
      label: (i) => i.name,
      summary: (i) => [
        h('h3', null, i.name, i.category ? h('span', { class: 'pill pill-muted', text: i.category }) : null),
        (() => { const m = h('div', { class: 'meter', role: 'img', 'aria-label': i.level + ' percent' }, h('i')); m.firstChild.style.setProperty('--w', i.level + '%'); return m; })(),
      ],
    },
    {
      id: 'services', title: 'Services', icon: 'layers', singular: 'service', add: 'Add service',
      hint: 'Each published service gets its own detail page on the website.',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true, max: 120, wide: true },
        { name: 'slug', label: 'Page address (slug)', type: 'text', max: 60, help: 'Leave empty to create it from the title. Lowercase letters, numbers and hyphens.' },
        { name: 'icon', label: 'Icon', type: 'icon', options: window.RPIcons.SERVICE_ICONS, default: 'layers', wide: true },
        { name: 'summary', label: 'Short summary', type: 'textarea', max: 400, rows: 3, wide: true, help: 'Shown on the service card.' },
        { name: 'sections', label: 'Detail sections', type: 'list', maxItems: 20, addLabel: 'Add section', wide: true,
          itemFields: [{ name: 'heading', label: 'Heading', max: 120 }, { name: 'text', label: 'Text', type: 'textarea', max: 3000, rows: 4 }] },
        { name: 'published', label: 'Published', type: 'checkbox', switchLabel: 'Published (visible on the website)', default: true },
      ],
      label: (i) => i.title,
      summary: (i) => [
        h('h3', null, i.title, i.published ? null : h('span', { class: 'pill pill-muted', text: 'Draft' })),
        i.summary ? h('p', { class: 'muted clamp', text: i.summary }) : null,
        h('p', { class: 'muted small', text: 'service.html?s=' + i.slug }),
      ],
      lead: (i) => h('div', { class: 'thumb thumb-icon' }, icon(i.icon || 'layers', 24)),
    },
    {
      id: 'experience', title: 'Experience', icon: 'briefcase', singular: 'experience entry', add: 'Add experience',
      hint: 'Shown as a timeline on the Experience and About pages, in this order.',
      fields: [
        { name: 'role', label: 'Role / position', type: 'text', required: true, max: 120, wide: true },
        { name: 'org', label: 'Company / organisation', type: 'text', max: 160 },
        { name: 'period', label: 'Period', type: 'text', max: 60, placeholder: 'e.g. 2022 to Present' },
        { name: 'text', label: 'Responsibilities', type: 'textarea', max: 1200, rows: 5, wide: true },
      ],
      label: (i) => i.role,
      summary: (i) => [h('h3', { text: i.role }), h('p', { class: 'muted', text: [i.org, i.period].filter(Boolean).join('  |  ') }), i.text ? h('p', { class: 'muted clamp', text: i.text }) : null],
    },
    {
      id: 'education', title: 'Education', icon: 'book', singular: 'education entry', add: 'Add education',
      hint: 'Shown next to experience on the Experience and About pages.',
      fields: [
        { name: 'title', label: 'Qualification', type: 'text', required: true, max: 160, wide: true },
        { name: 'org', label: 'School / university', type: 'text', max: 200 },
        { name: 'period', label: 'Period', type: 'text', max: 60 },
      ],
      label: (i) => i.title,
      summary: (i) => [h('h3', { text: i.title }), h('p', { class: 'muted', text: [i.org, i.period].filter(Boolean).join('  |  ') })],
    },
    {
      id: 'achievements', title: 'Achievements', icon: 'award', singular: 'achievement', add: 'Add achievement',
      hint: 'Shown on the About and Experience pages once you add at least one.',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true, max: 160, wide: true },
        { name: 'year', label: 'Year', type: 'text', max: 20 },
        { name: 'description', label: 'Description', type: 'textarea', max: 600, rows: 3, wide: true },
      ],
      label: (i) => i.title,
      summary: (i) => [h('h3', null, i.title, i.year ? h('span', { class: 'pill pill-muted', text: i.year }) : null), i.description ? h('p', { class: 'muted clamp', text: i.description }) : null],
    },
    {
      id: 'testimonials', title: 'Testimonials', icon: 'quote', singular: 'testimonial', add: 'Add testimonial',
      hint: 'Only add real feedback from real clients. Published testimonials appear on the Home and About pages.',
      fields: [
        { name: 'name', label: 'Person', type: 'text', required: true, max: 120 },
        { name: 'role', label: 'Role / company', type: 'text', max: 160 },
        { name: 'quote', label: 'Testimonial', type: 'textarea', required: true, max: 800, rows: 5, wide: true },
        { name: 'published', label: 'Published', type: 'checkbox', switchLabel: 'Published (visible on the website)', default: true },
      ],
      label: (i) => i.name,
      summary: (i) => [h('h3', null, i.name, i.published ? null : h('span', { class: 'pill pill-muted', text: 'Draft' })), h('p', { class: 'muted', text: i.role }), h('p', { class: 'clamp', text: i.quote })],
    },
    {
      id: 'gallery', title: 'Gallery', icon: 'image', singular: 'photo', add: 'Add by link', layout: 'grid', bulkUpload: true,
      hint: 'Photos appear on the Gallery page in this order. Uploaded images are resized and cleaned automatically.',
      fields: [
        { name: 'file', label: 'Photo', type: 'media', kind: 'image', required: true, wide: true },
        { name: 'caption', label: 'Caption', type: 'text', max: 160, wide: true },
      ],
      label: (i) => i.caption || 'this photo',
    },
  ];

  CONFIGS.forEach((cfg) => {
    Admin.register(cfg.id, {
      title: cfg.title,
      icon: cfg.icon,
      async render(root, ctx) {
        const ep = cfg.id + '.php';
        let items = (await API.get(ep)).items;
        const list = h('div', { class: cfg.layout === 'grid' ? 'photo-grid' : 'rows' });
        const count = h('p', { class: 'muted small', role: 'status' });

        const reload = async () => { items = (await API.get(ep)).items; draw(); };

        async function edit(item) {
          const saved = await UI.editor({
            title: (item ? 'Edit ' : 'Add ') + cfg.singular, fields: cfg.fields, values: item || {},
            saveText: item ? 'Save changes' : cfg.add,
            onSave: (v) => (item ? API.put(ep + '?id=' + encodeURIComponent(item.id), v) : API.post(ep, v)),
          });
          if (saved) { UI.toast('Saved.'); await reload(); }
        }

        async function move(item, dir) {
          const i = items.indexOf(item), j = i + dir;
          if (j < 0 || j >= items.length) return;
          const next = items.slice();
          next.splice(j, 0, next.splice(i, 1)[0]);
          try { await API.post(ep + '?action=reorder', { ids: next.map((x) => x.id) }); items = next; draw(); }
          catch (e) { UI.error(e); await reload(); }
        }

        async function remove(item) {
          const ok = await UI.confirm({ title: 'Delete ' + cfg.singular + '?', message: '"' + cfg.label(item) + '" will be removed from the website. This cannot be undone.', confirmText: 'Delete', danger: true });
          if (!ok) return;
          try { await API.del(ep + '?id=' + encodeURIComponent(item.id)); UI.toast('Deleted.'); await reload(); }
          catch (e) { UI.error(e); }
        }

        function actions(item, idx) {
          return h('div', { class: 'row-actions' },
            btn('Move earlier', { kind: 'ghost', iconOnly: true, small: true, icon: 'up', disabled: idx === 0, onClick: () => move(item, -1) }),
            UI.flipDown(btn('Move later', { kind: 'ghost', iconOnly: true, small: true, icon: 'up', disabled: idx === items.length - 1, onClick: () => move(item, 1) })),
            btn('Edit ' + cfg.singular, { kind: 'ghost', iconOnly: true, small: true, icon: 'edit', onClick: () => edit(item) }),
            btn('Delete ' + cfg.singular, { kind: 'ghost', iconOnly: true, small: true, icon: 'trash', onClick: () => remove(item) }));
        }

        function draw() {
          UI.clear(list);
          count.textContent = items.length + (items.length === 1 ? ' ' + cfg.singular : ' ' + cfg.singular + 's');
          if (!items.length) { list.appendChild(UI.empty('Nothing here yet.', btn(cfg.add, { kind: 'primary', icon: 'plus', onClick: () => (cfg.bulkUpload ? upload.click() : edit(null)) }))); return; }
          items.forEach((item, idx) => {
            if (cfg.layout === 'grid') {
              const src = API.mediaUrl(item.file);
              list.appendChild(h('figure', { class: 'photo' },
                h('div', { class: 'photo-img' }, src ? h('img', { src, alt: item.caption || '', loading: 'lazy' }) : h('span', { class: 'muted', text: 'Preview unavailable' })),
                h('figcaption', null, h('span', { class: 'clamp', text: item.caption || 'No caption' }), actions(item, idx))));
            } else {
              list.appendChild(h('article', { class: 'row' }, cfg.lead ? cfg.lead(item) : null, h('div', { class: 'row-main' }, cfg.summary(item)), h('div', { class: 'row-side' }, actions(item, idx))));
            }
          });
        }

        // gallery: choose many photos at once
        const upload = h('input', { type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/webp,image/gif', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
        upload.addEventListener('change', async () => {
          const files = Array.from(upload.files || []);
          upload.value = '';
          let ok = 0;
          for (const f of files) {
            try { const r = await API.upload(f); await API.post(ep, { file: r.url, caption: '' }); ok++; }
            catch (e) { UI.toast(f.name + ': ' + e.message, 'err'); }
          }
          if (ok) UI.toast(ok + (ok === 1 ? ' photo' : ' photos') + ' added. Click the pencil to add captions.');
          await reload();
        });

        ctx.actions(
          cfg.bulkUpload ? btn('Upload photos', { kind: 'primary', icon: 'download', onClick: () => upload.click() }) : null,
          btn(cfg.add, { kind: cfg.bulkUpload ? 'ghost' : 'primary', icon: 'plus', onClick: () => edit(null) }),
          cfg.bulkUpload ? upload : null);
        root.append(h('div', { class: 'toolbar' }, count), h('p', { class: 'muted hint', text: cfg.hint }), list);
        draw();
      },
    });
  });
})();
