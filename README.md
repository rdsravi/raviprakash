# Ravi Prakash: Portfolio website + admin panel

A redesigned portfolio website (static, vanilla HTML/CSS/JS) that is managed from a lightweight
**password-protected admin panel** backed by a small **PHP + JSON-file API**. No frameworks, no database,
no Firebase, no third-party authentication.

```
 Visitors ──► Public website  (GitHub Pages, static files)
                  │  reads content / sends the contact form (HTTPS, CORS-restricted)
                  ▼
              PHP API + Admin panel  (Hostinger or any PHP host)  ──►  data/*.json  +  uploads/
                  ▲
 You ─────────────┘  sign in at  https://YOUR-API-HOST/admin/
```

* GitHub Pages can only serve static files, so it cannot run PHP or store inquiries. The public site therefore lives on
  GitHub Pages while the **API and admin live on a PHP host**. The site finds the API through one setting, `apiBase`.
* **Static mode** (no backend at all) still works: the site reads `content.json` from this repository. In that mode there
  is **no admin panel and inquiries are not stored** (see [Static mode](#static-mode-no-backend)).

---

## Contents

1. [What is in this repository](#1-what-is-in-this-repository)
2. [What changed from the original project](#2-what-changed-from-the-original-project)
3. [Run it on your computer](#3-run-it-on-your-computer)
4. [Configuration reference](#4-configuration-reference)
5. [Deploy the public website to GitHub Pages](#5-deploy-the-public-website-to-github-pages)
6. [Deploy the backend + admin to Hostinger (or any PHP host)](#6-deploy-the-backend--admin-to-hostinger-or-any-php-host)
7. [Admin setup and password guide](#7-admin-setup-and-password-guide)
8. [Using the admin panel](#8-using-the-admin-panel)
9. [Security model](#9-security-model)
10. [Testing and deployment checklist](#10-testing-and-deployment-checklist)
11. [Troubleshooting](#11-troubleshooting)
12. [API reference](#12-api-reference)

---

## 1. What is in this repository

```
/                          ← PUBLIC WEBSITE (this is what GitHub Pages publishes)
├── index.html about.html skills.html services.html service.html
├── projects.html experience.html gallery.html contact.html 404.html
├── css/site.css           design system (light + dark theme, left sidebar, responsive drawer)
├── js/config.js           ← the ONLY file you edit to connect the site to your API
├── js/site.js             renders every page from API data (with cache + static fallbacks)
├── js/icons.js            inline SVG icon set
├── content.json           static fallback content (used when the API is unavailable / static mode)
├── uploads/profile.jpg    original profile photo
├── robots.txt  .nojekyll
├── .github/workflows/pages.yml   deploys ONLY the public files to GitHub Pages
│
├── server/                ← BACKEND + ADMIN (upload this folder to your PHP host; never published to GitHub Pages)
│   ├── api/               auth, content (public feed), settings, inquiries, projects, skills, services,
│   │                      experience, education, achievements, testimonials, gallery, upload, dashboard
│   ├── lib/               PHP classes: Config, Http, Store (JSON files + locking), Auth, RateLimit,
│   │                      Validator, Schemas, Collection, Inquiries, Uploads
│   ├── admin/             index.html (sign in) · dashboard.html · css/admin.css · js/*.js   (HTML/CSS/vanilla JS)
│   ├── seed/              starter content imported from your original content.json
│   ├── data/              LIVE data (created on first save): settings, projects, inquiries, admin.json …
│   ├── uploads/           images and CV uploaded from the admin
│   ├── tools/             hash-password.php · import-content.php (CLI helpers)
│   ├── config.example.php copy to config.local.php (git-ignored) and edit
│   └── .htaccess          Apache hardening (each sensitive sub-folder has its own too)
│
└── tests/                 automated tests (API, public site, admin panel) + run_all.sh
```

Pages and navigation: **Home · About · Skills · Services (+ service detail) · Projects · Experience · Gallery · Contact · 404**.
On desktop the navigation is a **fixed left sidebar** (collapsible to icons); on tablets/phones it becomes a slide-in drawer.

---

## 2. What changed from the original project

**Audit result (before any change).** The original was a static site with no build step: `index.html`, `service.html`,
`gallery.html`, `404.html`, `css/site.css`, `js/site.js`, `js/icons.js`, `content.json` (all content: settings, 7 services,
6 projects, 7 skills, 3 experience, 3 education entries, gallery) and an admin that committed changes to GitHub using a
**GitHub personal-access token kept in the browser's localStorage**. The contact form used the third-party FormSubmit
service and stored nothing.

| Area | Result |
|---|---|
| Technology | **Kept** vanilla HTML/CSS/JS and static hosting. No framework or build step added. |
| Content | **All existing content preserved** (imported 1:1 into `server/seed/` and `content.json`). Nothing was dropped. |
| Pages | Every page redesigned. `index` (sections), `service.html?s=…`, `gallery.html` and `404.html` kept; **About, Skills, Services, Projects, Experience, Contact** are now their own pages. |
| Navigation | Top bar replaced by the **left sidebar** you asked for. |
| Old admin | **Replaced.** A GitHub token in browser storage conflicts with "no API tokens in frontend code". Everything it managed (services, projects, skills, gallery, experience, education, site text, CV, uploads) is available in the new admin. Old files remain in git history. |
| Contact form | Now posts to your API and is stored; FormSubmit is kept only as the optional static-mode fallback. |
| Additions | Admin panel, PHP API, dark/light theme, SEO fields, inquiry management, CSV export, media library, achievements and testimonials. |

Small data decisions made during migration (all editable in the admin):

* Projects had a single `link`; it became **Live demo URL** (a separate **GitHub URL** field was added).
* The first three projects were marked **Featured** (the old data had no such flag) so the home page keeps showing three.
* Skills were given categories (Mobile / Web / Programming / Other) so the Skills page can group them.
* The hero text was split into a **hero heading** (first sentence) and **hero description** (the rest); **Interests** were taken from your own About text.
* Achievements and testimonials start **empty**; no fake content was invented. Their sections stay hidden until you add real entries.

---

## 3. Run it on your computer

Requirements: **PHP 7.4 or newer** (extensions `gd`, `fileinfo`, `mbstring`, `json`, `session`, `openssl`).

```bash
# 1) Backend + admin
cd server
cp config.example.php config.local.php        # edit: set setup_key, allow_localhost => true
php -S 127.0.0.1:8099                         # API at http://127.0.0.1:8099/api/  Admin at /admin/

# 2) Public website (second terminal, from the repository root)
#    point it at the backend by editing js/config.js:   apiBase: 'http://127.0.0.1:8099'
python3 -m http.server 8100                   # open http://127.0.0.1:8100/
```

Open `http://127.0.0.1:8099/admin/`, create your password (see [section 7](#7-admin-setup-and-password-guide)), edit something,
and reload the website to see it change. For local development add `'allow_localhost' => true` to `config.local.php`
so the browser may call the API from `http://127.0.0.1:8100` (turn it off in production).

---

## 4. Configuration reference

### Public site: `js/config.js` (public file: never put secrets here)

| Setting | Meaning |
|---|---|
| `apiBase` | URL of the folder on your PHP host that contains `api/`, **no trailing slash**, e.g. `https://api.example.com/portfolio`. Empty = static mode. |
| `staticFormFallback` | Static mode only: `'formsubmit'` (original behaviour) or `'mailto'`. |
| `contentFile` | Static content used when the API is unavailable. Default `content.json`. |
| `requestTimeoutMs` | How long to wait for the API before using cached/static content. Default 7000. |

You can also leave `js/config.js` as is and set the GitHub repository **variable** `PORTFOLIO_API_BASE`
(Settings → Secrets and variables → Actions → *Variables*); the deploy workflow injects it. It is a public URL, not a secret.

### Backend: `server/config.local.php` (private, git-ignored, blocked from the web)

Copy `config.example.php`. Only the first two are required.

| Key | Default | Meaning |
|---|---|---|
| `allowed_origins` | `[]` | **Required.** Exact origin(s) of the public website, e.g. `['https://yourname.github.io']`. Only these may read the content feed or post the contact form. |
| `setup_key` | `''` | **Required for first sign-in.** One-time key to create the admin password. Remove it afterwards. |
| `admin_password_hash` | `''` | Alternative to `setup_key`: a hash from `php tools/hash-password.php`. |
| `public_site_url` | `''` | Your website URL; lets the admin preview relative images and show "View website". |
| `data_dir` | `server/data` | Where JSON data lives. **Best practice: a folder outside the web root.** |
| `uploads_dir` / `uploads_url` | `server/uploads` / auto | Upload folder and its public URL (auto-detected). |
| `max_upload_mb` | `8` | Largest upload. |
| `session_idle_minutes` / `session_max_hours` | `30` / `8` | Admin session limits. |
| `login_max_attempts` / `login_window_minutes` | `5` / `15` | Failed-login lockout per IP. |
| `inquiry_limit_per_hour` / `_per_day` | `5` / `15` | Contact-form limit per visitor IP. |
| `max_inquiries` | `5000` | Inbox capacity; beyond it the form asks visitors to email you. |
| `notify_on_inquiry`, `mail_from` | `true`, auto | E-mail alert (via PHP `mail()`) to the *notification email* in Settings. |
| `trust_proxy_header` | `''` | Only if behind Cloudflare etc., e.g. `HTTP_CF_CONNECTING_IP`. Otherwise leave empty. |
| `allow_localhost` | `false` | Development only. |

---

## 5. Deploy the public website to GitHub Pages

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
3. Set `apiBase` (edit `js/config.js` and commit, **or** add the repository variable `PORTFOLIO_API_BASE`).
4. Push to `main`. The workflow `.github/workflows/pages.yml` publishes **only** the public files
   (`*.html`, `css/`, `js/`, `uploads/`, `content.json`, `robots.txt`). `server/` and `tests/` are never uploaded.
5. Add the resulting origin (e.g. `https://yourname.github.io`) to `allowed_origins` on the backend. For a project site
   (`https://yourname.github.io/repo/`) the origin is still just `https://yourname.github.io`.

Notes
* All links are relative, so the site works at the root (`name.github.io`), under a repo path (`name.github.io/repo/`) or on a custom domain.
* Custom 404: GitHub Pages serves `404.html` for unknown URLs. It computes a `<base>` automatically for user/project sites; for unusual layouts set `<meta name="site-base" content="/your/base/">` in `404.html`.
* If you prefer "Deploy from a branch", it works too, but then `server/` (source code and starter content, **no secrets**) would be public static files. The Actions route is cleaner.

---

## 6. Deploy the backend + admin to Hostinger (or any PHP host)

**Requirements:** PHP 7.4+ (8.x recommended) with `gd`, `fileinfo`, `mbstring`; HTTPS; Apache/LiteSpeed honouring `.htaccess`
(Hostinger shared hosting should; the checklist in step 5 proves it on your account). Nginx users: see the snippet below.

1. In hPanel create a **subdomain**, e.g. `api.yourdomain.com`, and enable the free **SSL** certificate (force HTTPS).
   Choose **PHP 8.1+** under *Advanced → PHP Configuration*.
2. Upload the **contents of the `server/` folder** (File Manager or FTP) into that subdomain's document root, so you get
   `https://api.yourdomain.com/api/`, `/admin/`, `/lib/` … (or a sub-folder such as `/portfolio/`; then `apiBase` ends with `/portfolio`).
   Upload the hidden `.htaccess` files too (enable "show hidden files").
3. Copy `config.example.php` to **`config.local.php`** on the server and set:
   ```php
   return [
     'allowed_origins' => ['https://yourname.github.io'],
     'setup_key'       => 'a-long-random-string',          // php -r "echo bin2hex(random_bytes(20));"
     'public_site_url' => 'https://yourname.github.io/your-repo',
   ];
   ```
4. Make sure `data/` and `uploads/` are **writable** by PHP (permissions 755 on Hostinger is usually enough; use 775 if writes fail).
5. **Verify the protections** (all must return 403 or 404, never file contents):
   ```bash
   curl -I https://api.yourdomain.com/data/settings.json
   curl -I https://api.yourdomain.com/lib/Config.php
   curl -I https://api.yourdomain.com/config.local.php
   curl -I https://api.yourdomain.com/seed/settings.json
   ```
   and `https://api.yourdomain.com/api/` should answer `{"ok":true,...}`.
6. Open `https://api.yourdomain.com/admin/` and [create your password](#7-admin-setup-and-password-guide).
7. **Delete `setup_key`** from `config.local.php`. Open **Dashboard → Website configuration**; every item should be green
   (HTTPS, folders writable, CORS origin set, etc.).
8. Put `https://api.yourdomain.com` (plus your sub-folder, if any) into `apiBase` for the public site ([section 5](#5-deploy-the-public-website-to-github-pages)).

**Even safer:** set `'data_dir' => '/home/USER/portfolio-data'` (a folder *above* `public_html`) and create it there. Then the data files
cannot be requested over the web even if `.htaccess` were ignored. Do the same for `uploads_dir` only if you serve it another way; uploads must stay web-readable.

**Nginx / hosts that ignore `.htaccess`** (add to the server block; adjust the path prefix):
```nginx
location ~ ^/(data|lib|tools|seed)/ { deny all; }
location ~ ^/config(\.local|\.example)?\.php$ { deny all; }
location ^~ /uploads/ { location ~ \.php$ { deny all; } }
add_header X-Content-Type-Options nosniff always;
location ^~ /admin/ {
  add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" always;
  add_header Cache-Control "no-store" always;
}
```

**Importing your original content later:** `php server/tools/import-content.php path/to/content.json [--force]` converts the legacy
single-file format into the data files. A fresh install already shows the migrated content from `server/seed/`.

**Updating the backend:** upload new code over the old. `data/`, `uploads/` and `config.local.php` are never touched by the repository, so your content survives.

### Static mode (no backend)

Leave `apiBase` empty. The site renders from `content.json` and the contact form uses the fallback you chose. To change content you edit
`content.json` and push. **There is no admin panel, no stored inquiries and no authentication in this mode.** A front-end-only password
screen would not be real security, so none is provided.

---

## 7. Admin setup and password guide

**First sign-in (creating the password)**
1. Open `/admin/`. While no password exists you will see *"Create your admin password"*.
2. Enter the `setup_key` from `config.local.php`, then choose a password (**at least 12 characters**; a phrase of several unrelated words works well).
3. You are signed in. Remove `setup_key` from `config.local.php`.

The password is stored **only as a salted Argon2id hash** (bcrypt on old PHP) in `data/admin.json`. It does not exist anywhere in HTML or JavaScript.

**Change password:** Admin → *Security*. Changing it signs out every other browser/device.

**Forgot the password / locked out**
* *Lockout:* after 5 wrong passwords from one IP the sign-in is blocked for 15 minutes; wait, or delete `data/ratelimit.json` on the server.
* *Reset:* delete `data/admin.json`, add a new `setup_key` to `config.local.php`, open `/admin/` and create a new password. (Alternative: run `php tools/hash-password.php` and put the output into `admin_password_hash`, after deleting `data/admin.json`.)

**Sessions** end after 30 minutes of inactivity (8 hours maximum); the admin then returns you to the sign-in page.

---

## 8. Using the admin panel

| Area | What you can do |
|---|---|
| **Overview** | Counts (total / new / read inquiries, total / published / featured projects), configuration health checklist, latest inquiries. |
| **Inquiries** | Search, filter All/New/Read, open details (name, email, phone, subject, message, date), mark read/unread, delete, bulk actions, **Export CSV** (respects the current search/filter; formula-injection safe). Each submission can also be e-mailed to you. |
| **Projects** | Add / edit / delete, reorder (↑ ↓), publish/unpublish, mark featured, technology tags (also the public filter buttons), GitHub and live-demo URLs, thumbnail (upload or choose). |
| **Skills · Services · Experience · Education · Achievements · Testimonials · Gallery** | Add / edit / delete / reorder. Services have an icon picker, a page address and detail sections. Gallery supports multi-photo upload. |
| **Website settings** | Website name and title, designation, tagline, availability, hero heading/description/roles/image/highlight numbers, About text/photo/interests, email, phone, location, social links, CV, default theme, SEO title/description/keywords, footer, private notification email. |
| **Media library** | Uploaded images and PDFs, copy link, delete. |
| **Security** | Change password. |

Changes appear on the public website as soon as the visitor's browser revalidates the content feed (normally the next page load).
Order in the admin = order on the website. Unpublished (draft) items are never sent to the public feed.

**Backups:** copy the `data/` and `uploads/` folders (and `config.local.php`). That is your entire site state.

---

## 9. Security model

| Concern | How it is handled |
|---|---|
| Authentication | Server-side only (`api/auth.php`). Passwords hashed with Argon2id/bcrypt. No credentials in front-end code, no third-party auth, no tokens in the browser. |
| Sessions | PHP session cookie: `HttpOnly`, `SameSite=Strict`, `Secure` on HTTPS, regenerated at login, idle + absolute timeout, invalidated on password change. |
| CSRF | Every state-changing admin request needs a per-session token (`X-CSRF-Token`) **and** a same-origin `Origin` header. Login/setup are covered too. |
| Authorization | Every admin endpoint calls `Auth::require()` server-side. Hiding a button is never the protection (the test suite calls every endpoint anonymously). |
| CORS | Only the public endpoints (content feed, contact form) send CORS headers, and only for `allowed_origins`. Admin endpoints send none. |
| Brute force | Failed logins limited per hashed IP, with `Retry-After`; wrong setup-key guesses are rate-limited too. |
| Contact form | Server-side validation, honeypot field, minimum fill time, link-spam check, duplicate suppression, per-IP hourly/daily limits and a global flood limit. |
| Input | Schema whitelists (unknown fields dropped), length/type/URL checks, path-traversal-safe media paths. |
| Output / XSS | Both front ends insert data with `textContent` or escape it; tested with script/`onerror` payloads. Admin runs under a strict CSP (no inline script/style). |
| Uploads | Admin only; type decided by file **content** (not name); random file names; images re-encoded (strips EXIF/payloads) and capped at 1800 px; PHP execution disabled in `uploads/`; SVG rejected. |
| Data files | Atomic writes under file locks (no lost updates or half-written files); denied to the web by `.htaccess`; secrets (`admin.json`, `secret.key`) `0600/0640`. IPs are stored only as keyed hashes. |
| Secrets in Git | `config.local.php`, `data/*` and `uploads/*` are git-ignored. `js/config.js` holds only a public URL. |

**Honest limitations**
* Shared-hosting file storage fits a personal portfolio (thousands of records), not heavy traffic. Rate limits are per IP.
* There is no two-factor login. Use a long unique password and keep the panel on HTTPS.
* Opening the sign-in page creates a tiny anonymous session file (needed for the CSRF token); PHP cleans these up automatically.
* SEO text edited in the admin is applied by JavaScript. Google runs JavaScript, but **link-preview bots (WhatsApp, LinkedIn, X) read the static `<head>` of each HTML page**, which contains sensible defaults. Edit those `<title>/<meta>` tags in the HTML files if you want previews to change.
* E-mail alerts use PHP `mail()`, which some hosts restrict or spam-filter. The inquiry is always stored regardless.
* The public website's cached copy is served if the API is down; the contact form needs the API.

---

## 10. Testing and deployment checklist

### Automated tests (445 checks)

```bash
pip install requests pillow       # Python deps for the API test
(cd tests && npm install)         # jsdom for the browser-level tests
bash tests/run_all.sh             # API (149) + public site (161) + admin panel (135)
```
The runner starts throw-away copies of the site and backend; your real `data/` is never touched. The suites cover: auth, setup,
lockout, CSRF, CORS, validation, CRUD, reordering, concurrency, uploads, CSV, XSS, dynamic sync, API-down fallback, CSP hygiene.
They were also run against a real Apache + mod_php server (`.htaccess` deny rules and headers verified).
The browser tests use jsdom (no real browser), so **do the short visual pass below on a real device**.

### Public website (manual)
- [ ] Every page loads; sidebar highlights the current page; no console errors
- [ ] Desktop: left sidebar, collapse button works; phone/tablet: menu button opens the drawer, Esc/overlay closes it
- [ ] Theme toggle works and is remembered; default theme from the admin applies for new visitors
- [ ] Projects filter by tag; services open their detail pages; gallery lightbox opens (arrow keys, Esc)
- [ ] Contact form: empty submit shows errors; valid submit shows success and the message appears in the admin
- [ ] Change hero heading / add a project / add a skill / change contact details in the admin → they appear on the site
- [ ] Turn the API off (wrong `apiBase`): the site still renders from cache / `content.json`

### Admin (manual)
- [ ] `/admin/dashboard.html` without signing in redirects to sign-in; protected APIs return 401 (`curl -i https://API/api/settings.php`)
- [ ] Sign in, sign out, change password (old password stops working)
- [ ] Inquiries: search, filter, open, mark read, bulk delete, CSV opens in Excel/Sheets
- [ ] Projects: add, edit, reorder, publish/unpublish, delete; Settings save; image and CV upload

### Deployment
- [ ] GitHub Pages deployed from Actions; `apiBase` points to the API over **HTTPS**
- [ ] `allowed_origins` equals the Pages origin; `setup_key` removed; `allow_localhost` is off
- [ ] `curl -I` on `/data/…`, `/lib/…`, `/config.local.php` returns 403/404
- [ ] Dashboard configuration checklist is all green
- [ ] No `config.local.php`, `data/*` or passwords in the Git repository (`git ls-files server | grep -E "config.local|data/.+json"` prints nothing)

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| Site shows content but admin edits do not appear | `apiBase` empty or wrong, or `allowed_origins` missing the site origin (browser console shows a CORS error). |
| "Could not reach the server" in admin | Open `https://API/api/`; it must return JSON. Check PHP version/extensions and folder permissions. |
| Admin saves fail with "Cannot write data file" | Make `data/` writable (755/775) and owned by the PHP user. |
| Sign-in page says setup is disabled | Add `setup_key` to `config.local.php` (and make sure the file is named exactly that). |
| Uploads fail | Check `uploads/` permissions, `max_upload_mb`, and PHP `upload_max_filesize` / `post_max_size`. |
| Images from relative paths do not preview in admin | Set `public_site_url` in `config.local.php`. |
| No e-mail alerts | Set a notification email in Settings; check the host allows `mail()`. Inquiries are stored either way. |
| Locked out after wrong passwords | Wait 15 minutes, or delete `data/ratelimit.json`. |
| Behind Cloudflare and everyone shares one IP | Set `trust_proxy_header` to `HTTP_CF_CONNECTING_IP`. |

---

## 12. API reference

All responses use `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code", "message", "fields"? } }`.
Admin endpoints need the session cookie; writes also need `X-CSRF-Token` (from `auth.php?action=status`).

| Endpoint | Method | Access | Purpose |
|---|---|---|---|
| `api/` | GET/HEAD | public | Health check |
| `api/content.php` | GET/HEAD | **public**, CORS | Published content for the website (ETag revalidation) |
| `api/inquiries.php` | POST | **public**, CORS, rate-limited | Submit the contact form |
| `api/auth.php?action=status\|login\|setup\|logout\|change_password` | GET/POST | public / session | Authentication |
| `api/inquiries.php` | GET, PUT, DELETE, POST `?action=bulk` | admin | List/search/filter, detail, `?export=csv`, mark read, delete |
| `api/settings.php` | GET, PUT | admin | Website settings |
| `api/projects.php` `skills.php` `services.php` `experience.php` `education.php` `achievements.php` `testimonials.php` `gallery.php` | GET, POST, PUT `?id=`, DELETE `?id=`, POST `?action=reorder` | admin | Content collections |
| `api/upload.php` | GET, POST (multipart `file`), DELETE `?name=` | admin | Media library |
| `api/dashboard.php` | GET | admin | Counts + configuration health |

Schemas (fields, limits, allowed values) live in `server/lib/Schemas.php`, the single source of truth for what can be stored.
