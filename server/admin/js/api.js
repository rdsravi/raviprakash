/**
 * Admin API client.
 *
 * - Talks only to the API on the SAME origin (../api/), never to another site.
 * - Sends the session cookie automatically and the CSRF token on every write.
 * - Never stores or sees the password beyond the login request itself.
 */
(function () {
  'use strict';

  class ApiError extends Error {
    constructor(status, code, message, fields) {
      super(message);
      this.status = status;
      this.code = code;
      this.fields = fields || null;
      this.retryAfter = 0;
    }
  }

  const API = {
    base: '../api/',
    csrf: '',
    siteUrl: '',
    onUnauthenticated: null,
    ApiError,

    async call(method, path, body, opts) {
      opts = opts || {};
      const headers = { Accept: 'application/json' };
      let payload;
      if (body instanceof FormData) {
        payload = body;
      } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      if (method !== 'GET' && API.csrf) headers['X-CSRF-Token'] = API.csrf;

      let res;
      try {
        res = await fetch(API.base + path, { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' });
      } catch (e) {
        throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
      }
      let json = null;
      try { json = await res.json(); } catch (e) { /* non-JSON reply */ }

      if (!res.ok || !json || json.ok !== true) {
        const err = (json && json.error) || {};
        const e = new ApiError(res.status, err.code || 'error', err.message || 'The server returned an unexpected response (HTTP ' + res.status + ').', err.fields);
        e.retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10) || 0;
        if (res.status === 401 && !opts.quiet401 && API.onUnauthenticated) API.onUnauthenticated(e);
        throw e;
      }
      if (json.data && json.data.csrf) API.csrf = json.data.csrf;
      return json.data;
    },

    get(path, opts) { return API.call('GET', path, undefined, opts); },
    post(path, body, opts) { return API.call('POST', path, body === undefined ? {} : body, opts); },
    put(path, body, opts) { return API.call('PUT', path, body, opts); },
    del(path, opts) { return API.call('DELETE', path, undefined, opts); },

    /** Loads session state + a fresh CSRF token. Safe to call before login. */
    async status() {
      const s = await API.get('auth.php?action=status', { quiet401: true });
      API.csrf = s.csrf;
      API.siteUrl = s.siteUrl || '';
      return s;
    },

    upload(file) {
      const fd = new FormData();
      fd.append('file', file);
      return API.call('POST', 'upload.php', fd);
    },

    /** Resolve a stored media value to something an <img> in the admin can load. */
    mediaUrl(value) {
      const v = String(value || '').trim();
      if (!v) return '';
      if (/^https?:\/\//i.test(v)) return v;
      return API.siteUrl ? API.siteUrl + '/' + v.replace(/^\/+/, '') : '';
    },
  };

  window.AdminAPI = API;
})();
