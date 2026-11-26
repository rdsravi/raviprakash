/**
 * Login / first-time setup page.
 *
 * There is NO password, hash or secret in this file. The browser only sends what you type to
 * api/auth.php over HTTPS; the server verifies it against a salted hash it keeps privately.
 */
(function () {
  'use strict';
  const { h, btn, icon } = {
    h: UI.h,
    btn: UI.btn,
    icon: UI.icon,
  };
  const root = document.getElementById('auth');
  const API = window.AdminAPI;

  function shell(title, intro, ...content) {
    UI.clear(root);
    root.appendChild(
      h('div', { class: 'auth-card' },
        h('div', { class: 'auth-logo', 'aria-hidden': 'true' }, icon('lock', 26)),
        h('h1', { text: title }),
        intro ? h('p', { class: 'auth-intro', text: intro }) : null,
        content)
    );
  }

  /** Password input with a show/hide toggle. */
  function passwordField(id, label, autocomplete) {
    const input = h('input', { id, type: 'password', autocomplete, required: true, maxlength: 200, spellcheck: 'false', 'aria-describedby': id + '-err' });
    const toggle = h('button', { type: 'button', class: 'pw-toggle', 'aria-label': 'Show ' + label.toLowerCase(), 'aria-pressed': 'false' }, icon('eye', 18));
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', (show ? 'Hide ' : 'Show ') + label.toLowerCase());
    });
    const err = h('span', { class: 'err', id: id + '-err', role: 'alert' });
    const wrap = h('div', { class: 'f' }, h('label', { for: id, text: label }), h('div', { class: 'pw-wrap' }, input, toggle), err);
    return { wrap, input, setError(m) { err.textContent = m || ''; if (m) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); } };
  }

  /* ───────── sign in ───────── */
  function renderLogin(st) {
    const pw = passwordField('pw', 'Password', 'current-password');
    const note = h('p', { class: 'form-error', role: 'alert' });
    const submit = btn('Sign in', { kind: 'primary', type: 'submit' });
    submit.classList.add('btn-block');
    const form = h('form', { class: 'auth-form', novalidate: true }, pw.wrap, note, submit);

    let timer = null;
    const lockout = (seconds) => {
      let left = seconds;
      submit.disabled = true;
      const tick = () => {
        const m = Math.floor(left / 60), s = left % 60;
        note.textContent = 'Too many failed attempts. Try again in ' + (m ? m + ' min ' : '') + s + ' s.';
        if (left-- <= 0) { clearInterval(timer); submit.disabled = false; note.textContent = ''; }
      };
      clearInterval(timer);
      tick();
      timer = setInterval(tick, 1000);
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      note.textContent = ''; pw.setError('');
      if (!pw.input.value) { pw.setError('Enter your password.'); pw.input.focus(); return; }
      let lockFor = 0;
      await UI.busy(submit, async () => {
        try {
          await API.post('auth.php?action=login', { password: pw.input.value });
          location.replace('dashboard.html');
        } catch (err) {
          pw.input.value = '';
          if (err.status === 429) lockFor = err.retryAfter || 60;
          else if (err.status === 403 && err.code === 'bad_csrf') { try { await API.status(); } catch (_) { /* ignore */ } note.textContent = 'Please try again.'; }
          else { note.textContent = err.message; pw.input.focus(); }
        }
      });
      // started after UI.busy has restored the button, otherwise it would be re-enabled
      if (lockFor) lockout(lockFor);
    });

    shell('Admin sign in', 'Sign in to manage your portfolio.', form,
      st.siteUrl ? h('a', { class: 'auth-back', href: st.siteUrl, text: 'Back to the website' }) : null);
    pw.input.focus();
  }

  /* ───────── first-time setup ───────── */
  function renderSetup(st) {
    const min = st.minPasswordLength || 12;
    const key = passwordField('key', 'Setup key', 'off');
    const pw = passwordField('npw', 'New password', 'new-password');
    const pw2 = passwordField('npw2', 'Confirm password', 'new-password');
    const meter = h('div', { class: 'strength', 'aria-hidden': 'true' }, h('i'));
    const hint = h('p', { class: 'help', text: 'Use at least ' + min + ' characters. A short phrase of several random words works well.' });
    const note = h('p', { class: 'form-error', role: 'alert' });
    const submit = btn('Create password and sign in', { kind: 'primary', type: 'submit' });
    submit.classList.add('btn-block');

    pw.input.addEventListener('input', () => {
      const v = pw.input.value;
      let score = Math.min(1, v.length / (min + 6));
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score += 0.1;
      if (/\d/.test(v)) score += 0.1;
      if (/[^A-Za-z0-9]/.test(v)) score += 0.1;
      score = Math.min(1, score);
      meter.firstChild.style.setProperty('--s', Math.round(score * 100) + '%');
      meter.dataset.level = v.length < min ? 'weak' : score < 0.85 ? 'ok' : 'strong';
    });

    const form = h('form', { class: 'auth-form', novalidate: true },
      key.wrap,
      h('p', { class: 'help', text: 'The setup key is the setup_key value in server/config.local.php on your hosting. You only need it once.' }),
      pw.wrap, meter, hint, pw2.wrap, note, submit);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      note.textContent = ''; key.setError(''); pw.setError(''); pw2.setError('');
      if (!key.input.value) { key.setError('Enter the setup key.'); key.input.focus(); return; }
      if (pw.input.value.length < min) { pw.setError('Use at least ' + min + ' characters.'); pw.input.focus(); return; }
      if (pw.input.value !== pw2.input.value) { pw2.setError('The two passwords do not match.'); pw2.input.focus(); return; }
      await UI.busy(submit, async () => {
        try {
          await API.post('auth.php?action=setup', { setupKey: key.input.value, password: pw.input.value });
          location.replace('dashboard.html');
        } catch (err) {
          if (err.fields && err.fields.setupKey) key.setError(err.fields.setupKey);
          else if (err.fields && err.fields.password) pw.setError(err.fields.password);
          else note.textContent = err.message;
          if (err.code === 'already_setup') setTimeout(() => location.reload(), 1200);
        }
      });
    });

    shell('Welcome. Create your admin password', 'This is the first time the admin panel is opened. Choose a strong password; it is stored only as a salted hash on your server.', form);
    key.input.focus();
  }

  function renderProblem(err) {
    const retry = btn('Try again', { kind: 'primary' });
    retry.addEventListener('click', () => location.reload());
    shell('Cannot reach the server', err.message || 'The admin API did not respond.',
      h('p', { class: 'help', text: 'Check that the backend is uploaded, PHP is enabled, and this page is opened from the same site as the api/ folder.' }), retry);
  }

  (async function start() {
    try {
      const st = await API.status();
      if (st.authenticated) { location.replace('dashboard.html'); return; }
      if (st.setupRequired) renderSetup(st); else renderLogin(st);
    } catch (err) {
      renderProblem(err);
    }
  })();
})();
