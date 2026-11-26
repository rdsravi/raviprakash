/** Account security: change password and sign out. */
(function () {
  'use strict';
  const { h, icon, btn } = { h: UI.h, icon: UI.icon, btn: UI.btn };
  const API = window.AdminAPI;

  Admin.register('security', {
    title: 'Security',
    icon: 'shield',
    async render(root) {
      const st = await API.status();
      const min = st.minPasswordLength || 12;
      const form = UI.form([
        { name: 'current', label: 'Current password', type: 'password', autocomplete: 'current-password', max: 200, required: true, wide: true },
        { name: 'next', label: 'New password', type: 'password', autocomplete: 'new-password', max: 200, required: true, wide: true, help: 'At least ' + min + ' characters. A phrase of several unrelated words is strong and easy to remember.' },
        { name: 'again', label: 'Confirm new password', type: 'password', autocomplete: 'new-password', max: 200, required: true, wide: true },
      ]);
      const note = h('p', { class: 'form-error', role: 'alert' });
      const save = btn('Change password', { kind: 'primary', icon: 'lock' });

      const submit = async () => {
        note.textContent = '';
        form.clearErrors();
        const v = form.get();
        const errs = {};
        if (!v.current) errs.current = 'Enter your current password.';
        if (v.next.length < min) errs.next = 'Use at least ' + min + ' characters.';
        if (v.next !== v.again) errs.again = 'The two passwords do not match.';
        if (Object.keys(errs).length) { form.setErrors(errs); return; }
        await UI.busy(save, async () => {
          try {
            await API.post('auth.php?action=change_password', { current: v.current, new: v.next });
            form.setValues({ current: '', next: '', again: '' });
            UI.toast('Password changed. Any other devices have been signed out.');
          } catch (e) {
            if (e.fields) form.setErrors({ current: e.fields.current, next: e.fields.password });
            note.textContent = e.message;
          }
        });
      };
      save.addEventListener('click', submit);
      const formEl = h('form', { novalidate: true }, form.el, note, h('div', { class: 'form-actions' }, save));
      formEl.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

      root.append(
        h('section', { class: 'card narrow' },
          h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Change password' }), h('p', { class: 'muted', text: 'Changing it signs out every other browser or device.' }))),
          formEl),
        h('section', { class: 'card narrow' },
          h('div', { class: 'card-head' }, h('h2', { text: 'Good practice' })),
          h('ul', { class: 'plain-list' },
            h('li', { text: 'Open this panel only over HTTPS.' }),
            h('li', { text: 'Delete setup_key from config.local.php after your first sign-in.' }),
            h('li', { text: 'Use a password you do not use anywhere else.' }),
            h('li', { text: 'Sessions end automatically after a period of inactivity.' }))));
    },
  });
})();
