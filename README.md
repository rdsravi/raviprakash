# Ravi Prakash — Portfolio (GitHub Pages)

Plain HTML/CSS/JS. **No server, no Firebase, no build step.** Works on GitHub Pages as-is.

```
index.html  service.html  gallery.html  404.html   ← pages (rendered from content.json)
content.json                                       ← ALL your text/data lives here
uploads/                                           ← photos, CV
css/  js/                                          ← design + code
admin/                                             ← admin portal  (yourname.github.io/repo/admin/)
```

## Put it live (5 minutes)

1. Open your repo `rdsravi/raviprakash` on GitHub. Delete the old files
   (`index.html`, `script.js`, `style.css`, `*_service.html`, `gallery*.html`, `resume.html`, `jquery.flipster.*`).
2. Upload everything from this folder to the repo root (**Add file → Upload files**), keep the folder structure,
   and include the hidden `.nojekyll` file. Commit to `main`.
3. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
4. After about a minute the site is live at `https://rdsravi.github.io/raviprakash/`.

## Enquiries → your Gmail

The contact form posts to [FormSubmit](https://formsubmit.co) (free, no account), which emails
**w.ravi.prakash@gmail.com**. One-time step: send one message (or press **Admin → Enquiries → Send test enquiry**),
then open the **"Activate Form"** email FormSubmit sends you and click the button (check Spam).
After that every enquiry arrives with the subject `[Portfolio] …`; replying answers the visitor.

## Admin portal (`/admin/`)

Edit text, services, projects, resume, gallery and the CV without touching code. Changes are saved by
**committing `content.json` and `uploads/` to your repo**, then GitHub Pages redeploys (about 1 minute).

One-time connect on each device:
1. GitHub → Settings → Developer settings → **Fine-grained tokens → Generate new token**
   (https://github.com/settings/personal-access-tokens/new).
2. Repository access: **Only select repositories → raviprakash**. Permissions → Repository → **Contents: Read and write**.
   Set an expiry. Copy the token.
3. Open `/admin/`, paste the token, **Connect**. It is stored only in that browser.

Edit anything, then press **Publish** in the bar at the bottom.

## Move your old images over from Firebase

Your old gallery photos, project covers and CV were in Firebase Storage, so they are not in this package.
Download them from the Firebase console, then upload via Admin → Gallery / Projects / Site content.

## Edit by hand instead

Open `content.json` on GitHub (pencil icon) and edit. Paths such as `uploads/photo.jpg` are relative to the site root.
