/**
 * Media library: uploaded images and PDFs.
 * Also powers the "Library" button on every image/CV field (Admin.pickMedia).
 */
(function () {
  'use strict';
  const { h, icon, btn } = { h: UI.h, icon: UI.icon, btn: UI.btn };
  const API = window.AdminAPI;

  const isPdf = (f) => f.mime === 'application/pdf';

  /** Grid of files. onPick turns it into a chooser; otherwise cards offer copy/delete. */
  function buildLibrary(opts) {
    opts = opts || {};
    const grid = h('div', { class: 'media-grid' });
    const note = h('p', { class: 'muted small', role: 'status' });
    let files = [];

    async function reload() {
      try { files = (await API.get('upload.php')).files; } catch (e) { UI.clear(grid).appendChild(h('p', { class: 'form-error', text: e.message })); return; }
      draw();
    }

    function draw() {
      UI.clear(grid);
      let shown = files;
      if (opts.kind === 'pdf') shown = files.filter(isPdf);
      else if (opts.kind === 'image') shown = files.filter((f) => !isPdf(f));
      note.textContent = shown.length ? shown.length + (shown.length === 1 ? ' file' : ' files') : '';
      if (!shown.length) { grid.appendChild(UI.empty('No files uploaded yet. Use the Upload button to add one.')); return; }
      shown.forEach((f) => {
        const preview = isPdf(f)
          ? h('div', { class: 'file-ic' }, icon('book', 34), h('span', { text: 'PDF' }))
          : h('img', { src: f.url, alt: '', loading: 'lazy' });
        const card = h('figure', { class: 'media-card' });
        const body = h('div', { class: 'media-prev-box' }, preview);
        if (opts.onPick) {
          const pick = h('button', { type: 'button', class: 'media-pick', 'aria-label': 'Choose ' + f.name }, body);
          pick.addEventListener('click', () => opts.onPick(f));
          card.appendChild(pick);
        } else card.appendChild(body);
        card.appendChild(h('figcaption', null,
          h('span', { class: 'media-name', text: f.name }),
          h('span', { class: 'muted small', text: UI.bytes(f.size) + '  |  ' + UI.ago(f.modified) }),
          opts.onPick ? null : h('div', { class: 'row-actions' },
            btn('Copy link', { kind: 'ghost', small: true, iconOnly: true, icon: 'copy', onClick: async () => {
              try { await navigator.clipboard.writeText(f.url); UI.toast('Link copied.'); }
              catch (e) { window.prompt('Copy this link:', f.url); }
            } }),
            btn('Delete file', { kind: 'ghost', small: true, iconOnly: true, icon: 'trash', onClick: async () => {
              const ok = await UI.confirm({ title: 'Delete file?', message: f.name + ' will be deleted. Any page that still uses it will show a broken image.', confirmText: 'Delete', danger: true });
              if (!ok) return;
              try { await API.del('upload.php?name=' + encodeURIComponent(f.name)); UI.toast('File deleted.'); await reload(); } catch (e) { UI.error(e); }
            } }))));
        grid.appendChild(card);
      });
    }

    const input = h('input', { type: 'file', multiple: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', accept: opts.kind === 'pdf' ? 'application/pdf' : opts.kind === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : 'image/jpeg,image/png,image/webp,image/gif,application/pdf' });
    const uploadBtn = btn('Upload', { kind: 'primary', icon: 'download' });
    uploadBtn.querySelector('svg').classList.add('flip');
    uploadBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const chosen = Array.from(input.files || []);
      input.value = '';
      await UI.busy(uploadBtn, async () => {
        let ok = 0;
        for (const f of chosen) {
          try { await API.upload(f); ok++; } catch (e) { UI.toast(f.name + ': ' + e.message, 'err'); }
        }
        if (ok) UI.toast(ok + (ok === 1 ? ' file' : ' files') + ' uploaded.');
        await reload();
      });
    });

    const el = h('div', null, h('div', { class: 'toolbar' }, note, uploadBtn, input), grid);
    return { el, reload, uploadBtn };
  }

  Admin.register('media', {
    title: 'Media library',
    icon: 'image',
    async render(root) {
      const lib = buildLibrary({});
      root.append(h('p', { class: 'muted hint', text: 'Files you upload from any image field are stored here on your server. Images are re-encoded and capped at 1800 px for safety and speed.' }), h('section', { class: 'card' }, lib.el));
      await lib.reload();
    },
  });

  /** Opens a chooser. Resolves to the chosen file URL, or null if closed. */
  Admin.pickMedia = function (kind) {
    return new Promise((resolve) => {
      const lib = buildLibrary({ kind, onPick: (f) => { chosen = f.url; m.close(); } });
      let chosen = null;
      const m = UI.modal({ title: kind === 'pdf' ? 'Choose a PDF' : 'Choose an image', size: 'xl', body: lib.el });
      m.closed.then(() => resolve(chosen));
      lib.reload();
    });
  };
})();
