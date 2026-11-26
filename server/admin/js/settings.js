/**
 * Website settings. Saving here updates the public site (it reads the same data through api/content.php).
 * Sections: identity, hero, about, contact + social + CV, appearance + SEO + footer.
 */
(function () {
  'use strict';
  const { h, icon, btn } = { h: UI.h, icon: UI.icon, btn: UI.btn };
  const API = window.AdminAPI;

  const SOCIAL = [['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube']];

  const SECTIONS = [
    {
      id: 'identity', title: 'Identity', blurb: 'Your name and the title shown in the sidebar.',
      fields: [
        { name: 'name', label: 'Your name', type: 'text', required: true, max: 120 },
        { name: 'siteName', label: 'Website name', type: 'text', required: true, max: 80, help: 'Shown at the top of the sidebar and in page titles.' },
        { name: 'designation', label: 'Professional designation', type: 'text', max: 120, placeholder: 'e.g. Full Stack Developer' },
        { name: 'siteTitle', label: 'Website title', type: 'text', max: 120, help: 'Fallback browser title, used if the SEO title below is empty.' },
        { name: 'eyebrow', label: 'Short tagline', type: 'text', max: 160, wide: true },
        { name: 'availability', label: 'Availability message', type: 'text', max: 80, placeholder: 'e.g. Available for freelance work', wide: true, help: 'Shown with a pulsing dot. Leave empty to hide it.' },
      ],
    },
    {
      id: 'hero', title: 'Home page hero', blurb: 'The first thing visitors see.',
      fields: [
        { name: 'heroHeading', label: 'Hero heading', type: 'text', max: 200, wide: true },
        { name: 'heroIntro', label: 'Hero description', type: 'textarea', max: 1200, rows: 4, wide: true },
        { name: 'roles', label: 'Rotating roles', type: 'lines', max: 60, rows: 5, wide: true, help: 'One per line. They are typed out one after another under the heading.' },
        { name: 'heroImage', label: 'Profile image', type: 'media', kind: 'image', wide: true, help: 'Used in the hero, the sidebar avatar and link previews. A portrait (3:4) works best.' },
        { name: 'stats', label: 'Highlight numbers', type: 'list', maxItems: 4, addLabel: 'Add number', wide: true,
          itemFields: [{ name: 'value', label: 'Number (e.g. 6+)', max: 12 }, { name: 'label', label: 'Label', max: 40 }] },
      ],
    },
    {
      id: 'about', title: 'About', blurb: 'The About page text and photo.',
      fields: [
        { name: 'aboutTitle', label: 'Page heading', type: 'text', max: 200, wide: true },
        { name: 'aboutBody', label: 'About text', type: 'textarea', max: 6000, rows: 10, wide: true, help: 'Separate paragraphs with a blank line.' },
        { name: 'aboutImage', label: 'About photo', type: 'media', kind: 'image', wide: true, help: 'Optional. The profile image is used if empty.' },
        { name: 'interests', label: 'Personal and professional interests', type: 'lines', max: 60, rows: 5, wide: true, help: 'One per line. Shown as chips on the About page.' },
      ],
    },
    {
      id: 'contact', title: 'Contact, social links and CV', blurb: 'Used on the Contact page, the sidebar and the contact form.',
      fields: [
        { name: 'email', label: 'Email address', type: 'email', max: 200 },
        { name: 'phone', label: 'Phone number', type: 'tel', max: 40 },
        { name: 'location', label: 'Location', type: 'text', max: 120 },
        { name: 'notifyEmail', label: 'Inquiry notification email', type: 'email', max: 200, help: 'Private. New contact-form messages are emailed here. Falls back to the address above. Never shown publicly.' },
        ...SOCIAL.map(([k, label]) => ({ name: 'social_' + k, label: label + ' URL', type: 'url', max: 300, placeholder: 'https://' })),
        { name: 'cvFile', label: 'Resume / CV', type: 'media', kind: 'pdf', wide: true, help: 'Upload a PDF or paste a link. The "Download CV" button appears when this is set.' },
      ],
    },
    {
      id: 'appearance', title: 'Appearance, SEO and footer', blurb: 'Theme default, search-engine text and footer line.',
      fields: [
        { name: 'defaultTheme', label: 'Default theme', type: 'select', options: [{ value: 'system', label: 'Follow visitor device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], default: 'system', help: 'Visitors can still switch themes; their choice is remembered.' },
        { name: 'footerText', label: 'Footer text', type: 'text', max: 200 },
        { name: 'seoTitle', label: 'SEO title', type: 'text', max: 120, wide: true, help: 'The home page title in search results and browser tabs (aim for under 60 characters).' },
        { name: 'seoDescription', label: 'SEO description', type: 'textarea', max: 320, rows: 3, wide: true, help: 'Aim for 120 to 160 characters.' },
        { name: 'seoKeywords', label: 'SEO keywords', type: 'text', max: 300, wide: true, help: 'Comma separated. Search engines give these little weight, but they are available.' },
      ],
    },
  ];

  /** Flatten the nested social object into social_* form fields and back. */
  const toForm = (s) => { const o = Object.assign({}, s); SOCIAL.forEach(([k]) => { o['social_' + k] = (s.social && s.social[k]) || ''; }); return o; };
  const fromForm = (v) => {
    const o = Object.assign({}, v);
    o.social = {};
    SOCIAL.forEach(([k]) => { o.social[k] = o['social_' + k] || ''; delete o['social_' + k]; });
    return o;
  };

  Admin.register('settings', {
    title: 'Website settings',
    icon: 'cog',
    async render(root, ctx) {
      let saved = await API.get('settings.php');
      const forms = SECTIONS.map((sec) => UI.form(sec.fields, toForm(saved)));
      let dirty = false;

      const status = h('span', { class: 'save-status', role: 'status', 'aria-live': 'polite' });
      const saveBtn = btn('Save changes', { kind: 'primary', icon: 'check', disabled: true });
      const discard = btn('Discard', { kind: 'ghost', disabled: true });

      const setDirty = (d) => {
        dirty = d;
        saveBtn.disabled = !d; discard.disabled = !d;
        status.textContent = d ? 'You have unsaved changes' : '';
        status.classList.toggle('is-dirty', d);
      };
      Admin.guard = () => dirty;
      forms.forEach((f) => f.onChange(() => setDirty(true)));

      const collect = () => fromForm(Object.assign({}, ...forms.map((f) => f.get())));

      function checkLocal(v) {
        const errs = {};
        SOCIAL.forEach(([k, label]) => {
          const val = v.social[k];
          if (val && !/^https?:\/\//i.test(val)) errs['social_' + k] = 'Enter a full link starting with https://';
        });
        return errs;
      }

      async function save() {
        forms.forEach((f) => f.clearErrors());
        const body = collect();
        const local = checkLocal(body);
        if (Object.keys(local).length) { forms.forEach((f) => f.setErrors(local)); UI.toast('Please fix the highlighted fields.', 'err'); return; }
        let ok = false;
        await UI.busy(saveBtn, async () => {
          try {
            saved = await API.put('settings.php', body);
            forms.forEach((f) => f.setValues(toForm(saved)));
            ok = true;
            UI.toast('Settings saved. The website now shows your changes.');
          } catch (e) {
            if (e.fields) {
              const map = Object.assign({}, e.fields);
              if (map.social) { map.social_linkedin = map.social; delete map.social; }
              let any = false;
              forms.forEach((f) => { any = f.setErrors(map) || any; });
              UI.toast(any ? 'Please fix the highlighted fields.' : e.message, 'err');
            } else UI.error(e);
          }
        });
        // after UI.busy has restored the button, so it is not re-enabled by mistake
        if (ok) { setDirty(false); status.textContent = 'Saved just now'; }
      }

      saveBtn.addEventListener('click', save);
      discard.addEventListener('click', async () => {
        const ok = await UI.confirm({ title: 'Discard changes?', message: 'Your unsaved edits will be reset to the last saved settings.', confirmText: 'Discard', danger: true });
        if (!ok) return;
        forms.forEach((f) => { f.setValues(toForm(saved)); f.clearErrors(); });
        setDirty(false);
      });

      ctx.actions(Admin.siteUrl ? h('a', { class: 'btn btn-ghost', href: Admin.siteUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('up', 17), h('span', { text: 'View website' })) : null);

      root.append(
        ...SECTIONS.map((sec, i) => h('section', { class: 'card', 'aria-labelledby': 'set-' + sec.id },
          h('div', { class: 'card-head' }, h('div', null, h('h2', { id: 'set-' + sec.id, text: sec.title }), h('p', { class: 'muted', text: sec.blurb })))),
          ),
      );
      // attach each form inside its section card
      Array.from(root.querySelectorAll('section.card')).forEach((card, i) => card.appendChild(forms[i].el));

      root.appendChild(h('div', { class: 'savebar' }, status, discard, saveBtn));
      return () => { Admin.guard = null; };
    },
  });
})();
