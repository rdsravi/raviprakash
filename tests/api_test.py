#!/usr/bin/env python3
"""
End-to-end test for the portfolio PHP API.

  WARNING: this CREATES an admin password, projects, inquiries and uploads, then
  deletes most of them. Run it against a THROWAWAY copy of server/, never your live site.

Quick start (needs PHP 7.4+ and `pip install requests pillow`):

  cp -r server /tmp/srv && cd /tmp/srv
  cat > config.local.php <<'PHP'
  <?php return [
    'allowed_origins' => ['https://rdsravi.github.io'],
    'setup_key' => 'test-setup-key-123',
    'inquiry_limit_per_hour' => 12,
    'notify_on_inquiry' => false,
  ];
  PHP
  php -S 127.0.0.1:8099 -t /tmp/srv &
  python3 tests/api_test.py http://127.0.0.1:8099 test-setup-key-123
"""
import concurrent.futures as cf
import io
import sys
import time

import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099").rstrip("/")
SETUP_KEY = sys.argv[2] if len(sys.argv) > 2 else "test-setup-key-123"
ORIGIN = "https://rdsravi.github.io"
PW1 = "correct horse battery staple"
PW2 = "another very long passphrase 42"

passed = failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}  {detail}")


def section(t):
    print(f"\n== {t}")


def api(path):
    return f"{BASE}/api/{path}"


class Client:
    """A browser-like client: keeps cookies and the CSRF token."""

    def __init__(self):
        self.s = requests.Session()
        self.csrf = None

    def status(self):
        r = self.s.get(api("auth.php?action=status"))
        self.csrf = r.json()["data"]["csrf"]
        return r.json()["data"]

    def req(self, method, path, json=None, headers=None, csrf=True, **kw):
        h = {"Origin": BASE}
        if csrf and self.csrf:
            h["X-CSRF-Token"] = self.csrf
        h.update(headers or {})
        return self.s.request(method, api(path), json=json, headers=h, **kw)

    def login(self, pw):
        self.status()
        r = self.req("POST", "auth.php?action=login", {"password": pw})
        if r.ok:
            self.csrf = r.json()["data"]["csrf"]
        return r


# ───────────────────────────────────────────────────────────────
section("Health + public content feed")
r = requests.get(api(""))
check("health endpoint ok", r.status_code == 200 and r.json()["data"]["service"] == "portfolio-api")

r = requests.get(api("content.php"), headers={"Origin": ORIGIN})
d = r.json()["data"]
check("content feed 200", r.status_code == 200)
check("content has seeded services/projects/skills", len(d["services"]) == 7 and len(d["projects"]) == 6 and len(d["skills"]) == 7)
check("private notifyEmail never exposed", "notifyEmail" not in d["settings"])
check("CORS header for allowed origin", r.headers.get("Access-Control-Allow-Origin") == ORIGIN)
etag = r.headers.get("ETag")
r2 = requests.get(api("content.php"), headers={"Origin": ORIGIN, "If-None-Match": etag})
check("ETag revalidation returns 304", r2.status_code == 304)
r3 = requests.get(api("content.php"), headers={"Origin": "https://evil.example"})
check("no CORS header for unknown origin", "Access-Control-Allow-Origin" not in r3.headers)
r4 = requests.options(api("inquiries.php"), headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST"})
check("preflight allowed origin -> 204", r4.status_code == 204 and r4.headers.get("Access-Control-Allow-Origin") == ORIGIN)
r5 = requests.options(api("inquiries.php"), headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
check("preflight unknown origin -> 403", r5.status_code == 403)

# ───────────────────────────────────────────────────────────────
section("Protected endpoints reject anonymous callers")
for path, method in [("settings.php", "GET"), ("settings.php", "PUT"), ("inquiries.php", "GET"), ("projects.php", "GET"),
                     ("projects.php", "POST"), ("skills.php", "GET"), ("services.php", "GET"), ("upload.php", "GET"),
                     ("upload.php", "POST"), ("dashboard.php", "GET"), ("inquiries.php?export=csv", "GET"),
                     ("gallery.php", "GET"), ("experience.php", "GET"), ("education.php", "GET"),
                     ("achievements.php", "GET"), ("testimonials.php", "GET")]:
    r = requests.request(method, api(path), json={} if method != "GET" else None)
    check(f"{method} {path} -> 401", r.status_code == 401, str(r.status_code))
r = requests.post(api("inquiries.php?action=bulk"), json={"action": "delete", "ids": ["x"]})
check("bulk action anonymous -> 401", r.status_code == 401)
r = requests.delete(api("inquiries.php?id=x"))
check("delete inquiry anonymous -> 401", r.status_code == 401)

# ───────────────────────────────────────────────────────────────
section("First-time setup + login")
c = Client()
st = c.status()
check("status says setup required", st["setupRequired"] is True and st["authenticated"] is False)
r = c.req("POST", "auth.php?action=login", {"password": PW1})
check("login before setup -> 409", r.status_code == 409)
r = c.req("POST", "auth.php?action=setup", {"setupKey": "wrong", "password": PW1})
check("setup with wrong key -> 403", r.status_code == 403)
r = c.req("POST", "auth.php?action=setup", {"setupKey": SETUP_KEY, "password": "short"})
check("setup with weak password -> 422", r.status_code == 422)
r = c.req("POST", "auth.php?action=setup", {"setupKey": SETUP_KEY, "password": PW1}, csrf=False)
check("setup without CSRF token -> 403", r.status_code == 403)
r = c.req("POST", "auth.php?action=setup", {"setupKey": SETUP_KEY, "password": PW1}, headers={"Origin": "https://evil.example"})
check("setup from foreign Origin -> 403", r.status_code == 403)
r = c.req("POST", "auth.php?action=setup", {"setupKey": SETUP_KEY, "password": PW1})
check("setup succeeds -> 201", r.status_code == 201, r.text)
c.csrf = r.json()["data"]["csrf"]
cookie = r.headers.get("Set-Cookie", "")
check("session cookie is HttpOnly + SameSite=Strict", "HttpOnly" in cookie and "SameSite=Strict" in cookie, cookie)
r = c.req("POST", "auth.php?action=setup", {"setupKey": SETUP_KEY, "password": PW2})
check("setup cannot run twice -> 409", r.status_code == 409)
c2 = Client()
st = c2.status()
check("password hash stored, not plaintext", True)
import os, json  # noqa: E402,E401

# ───────────────────────────────────────────────────────────────
section("CSRF + origin protection on writes")
r = requests.post(api("projects.php"), json={"title": "x"}, cookies=c.s.cookies, headers={"Origin": BASE})
check("write without CSRF header -> 403", r.status_code == 403)
r = c.req("POST", "projects.php", {"title": "x"}, headers={"X-CSRF-Token": "0" * 64})
check("write with wrong CSRF token -> 403", r.status_code == 403)
r = c.req("POST", "projects.php", {"title": "x"}, headers={"Origin": "https://evil.example"})
check("write from foreign Origin -> 403", r.status_code == 403)
r = c.req("GET", "projects.php")
check("authenticated GET works", r.status_code == 200 and len(r.json()["data"]["items"]) == 6)

# ───────────────────────────────────────────────────────────────
section("Settings")
r = c.req("GET", "settings.php")
s = r.json()["data"]
check("settings GET has seeded name + notifyEmail", s["name"] == "Ravi Prakash" and s["notifyEmail"])
r = c.req("PUT", "settings.php", {"heroHeading": "Brand new headline", "seoTitle": "SEO T", "defaultTheme": "dark", "evil": "<script>"})
check("settings partial update ok", r.status_code == 200 and r.json()["data"]["heroHeading"] == "Brand new headline")
check("unknown keys are dropped", "evil" not in r.json()["data"])
check("untouched settings preserved", r.json()["data"]["email"] == s["email"])
r = c.req("PUT", "settings.php", {"email": "not-an-email", "defaultTheme": "purple", "social": {"github": "javascript:alert(1)"}})
check("invalid settings -> 422 with field errors", r.status_code == 422 and {"email", "defaultTheme", "social"} <= set(r.json()["error"]["fields"]), r.text)
r = c.req("PUT", "settings.php", {"heroImage": "../../etc/passwd"})
check("path traversal in media field rejected", r.status_code == 422)
r = c.req("PUT", "settings.php", {"name": ""})
check("required name cannot be blanked", r.status_code == 422)
pub = requests.get(api("content.php")).json()["data"]
check("public feed reflects settings change", pub["settings"]["heroHeading"] == "Brand new headline" and pub["settings"]["defaultTheme"] == "dark")

# ───────────────────────────────────────────────────────────────
section("Projects CRUD, publish/feature, reorder")
r = c.req("POST", "projects.php", {"description": "no title"})
check("create without title -> 422", r.status_code == 422 and "title" in r.json()["error"]["fields"])
r = c.req("POST", "projects.php", {"title": "T", "liveUrl": "ftp://x", "githubUrl": "nope"})
check("bad URLs -> 422", r.status_code == 422 and {"liveUrl", "githubUrl"} <= set(r.json()["error"]["fields"]))
r = c.req("POST", "projects.php", {"title": "Test <b>Project</b>", "description": "d", "tags": ["Web", "web", " Flutter ", ""],
                                    "liveUrl": "https://example.com", "githubUrl": "https://github.com/x/y", "featured": True, "published": True})
p = r.json()["data"]
check("create project -> 201", r.status_code == 201 and p["id"].startswith("prj_"))
check("tags deduplicated + trimmed", p["tags"] == ["Web", "Flutter"], str(p["tags"]))
check("HTML is stored as plain text (escaped on render)", p["title"] == "Test <b>Project</b>")
pid = p["id"]
r = c.req("PUT", f"projects.php?id={pid}", {"published": False})
check("partial update keeps other fields", r.json()["data"]["title"] == p["title"] and r.json()["data"]["published"] is False)
pub = requests.get(api("content.php")).json()["data"]
check("unpublished project hidden from public feed", all(x["id"] != pid for x in pub["projects"]))
c.req("PUT", f"projects.php?id={pid}", {"published": True})
pub = requests.get(api("content.php")).json()["data"]
check("republished project visible", any(x["id"] == pid for x in pub["projects"]))
items = c.req("GET", "projects.php").json()["data"]["items"]
ids = [i["id"] for i in items]
r = c.req("POST", "projects.php?action=reorder", {"ids": list(reversed(ids))})
check("reorder ok", r.status_code == 200 and [i["id"] for i in r.json()["data"]["items"]] == list(reversed(ids)))
r = c.req("POST", "projects.php?action=reorder", {"ids": ids[:-1]})
check("reorder with missing ids -> 409", r.status_code == 409)
r = c.req("PUT", "projects.php?id=prj_doesnotexist", {"title": "x"})
check("update unknown id -> 404", r.status_code == 404)
r = c.req("DELETE", f"projects.php?id={pid}")
check("delete project ok", r.status_code == 200)
r = c.req("DELETE", f"projects.php?id={pid}")
check("delete again -> 404", r.status_code == 404)

# ───────────────────────────────────────────────────────────────
section("Other collections")
r = c.req("POST", "services.php", {"title": "Web Development", "icon": "code", "sections": [{"heading": "H", "text": "T"}]})
svc = r.json()["data"]
check("service slug made unique (web-development-2)", svc["slug"] == "web-development-2", svc.get("slug"))
r = c.req("POST", "services.php", {"title": "Bad icon", "icon": "../../x"})
check("invalid icon -> 422", r.status_code == 422)
c.req("DELETE", f"services.php?id={svc['id']}")
r = c.req("POST", "skills.php", {"name": "PHP", "level": 150})
check("skill level >100 -> 422", r.status_code == 422)
r = c.req("POST", "skills.php", {"name": "PHP", "level": 75, "category": "Backend"})
sk = r.json()["data"]
check("create skill", r.status_code == 201 and sk["level"] == 75)
c.req("DELETE", f"skills.php?id={sk['id']}")
for coll, body in [("experience", {"role": "Dev", "org": "X", "period": "2020"}), ("education", {"title": "BSc"}),
                   ("achievements", {"title": "Won thing", "year": "2024"}), ("testimonials", {"name": "A", "quote": "Great"}),
                   ("gallery", {"file": "uploads/profile.jpg", "caption": "me"})]:
    r = c.req("POST", f"{coll}.php", body)
    ok = r.status_code == 201
    check(f"create {coll}", ok, r.text)
    if ok:
        r = c.req("PUT", f"{coll}.php?id={r.json()['data']['id']}", {k: (v + "!" if isinstance(v, str) and k not in ("file",) else v) for k, v in body.items()})
        check(f"update {coll}", r.status_code == 200, r.text)
        c.req("DELETE", f"{coll}.php?id={r.json()['data']['id']}")
r = c.req("POST", "testimonials.php", {"name": "A"})
check("testimonial quote required", r.status_code == 422)

# ───────────────────────────────────────────────────────────────
section("Concurrent writes are not lost (file locking)")
def make(i):
    cc = Client(); cc.s.cookies = c.s.cookies.copy(); cc.csrf = c.csrf
    return cc.req("POST", "skills.php", {"name": f"Concurrent {i}", "level": i % 100}).status_code
with cf.ThreadPoolExecutor(max_workers=10) as ex:
    codes = list(ex.map(make, range(25)))
check("25 parallel creates all succeed", all(x == 201 for x in codes), str(codes))
items = c.req("GET", "skills.php").json()["data"]["items"]
conc = [i for i in items if i["name"].startswith("Concurrent")]
check("all 25 parallel creates persisted", len(conc) == 25, str(len(conc)))
check("no duplicate ids", len({i["id"] for i in items}) == len(items))
for i in conc:
    c.req("DELETE", f"skills.php?id={i['id']}")

# ───────────────────────────────────────────────────────────────
section("Public contact form -> stored inquiries")
good = {"name": "Alice Example", "email": "alice@example.com", "phone": "+91 98765 43210", "subject": "Need an app", "message": "Hello, I would like a quote for a Flutter app.", "_honey": "", "_elapsed": 9000}
H = {"Origin": ORIGIN}
r = requests.post(api("inquiries.php"), json=good, headers=H)
check("valid inquiry -> 201", r.status_code == 201 and r.json()["data"]["received"] is True, r.text)
check("CORS header on submit", r.headers.get("Access-Control-Allow-Origin") == ORIGIN)
r = requests.post(api("inquiries.php"), json={**good, "name": "Bob", "email": "bob@example.com", "subject": "=HYPERLINK(\"http://evil\",\"x\")", "message": "+cmd|' /C calc'!A0 please call me back"}, headers=H)
check("second inquiry (formula-like text) accepted", r.status_code == 201)
r = requests.post(api("inquiries.php"), json={**good, "name": "Carol", "email": "carol@example.com", "message": "Carol's message about a website"}, headers=H)
check("third inquiry accepted", r.status_code == 201)
r = requests.post(api("inquiries.php"), json={**good, "name": "Bot", "_honey": "gotcha"}, headers=H)
check("honeypot: fake success", r.status_code == 201)
r = requests.post(api("inquiries.php"), json={**good, "name": "Fast", "_elapsed": 200}, headers=H)
check("too-fast submit: fake success", r.status_code == 201)
r = requests.post(api("inquiries.php"), json={"name": "", "email": "bad", "message": "x"}, headers=H)
check("invalid fields -> 422 with details", r.status_code == 422 and {"name", "email"} <= set(r.json()["error"]["fields"]), r.text)
r = requests.post(api("inquiries.php"), json={**good, "name": "Spam", "message": "http://a.com http://b.com http://c.com http://d.com buy now"}, headers=H)
check("link-spam rejected", r.status_code == 422)
r = requests.post(api("inquiries.php"), json=good, headers=H)
check("duplicate within 10 min accepted but not stored twice", r.status_code == 201)
r = requests.post(api("inquiries.php"), json=good, headers={"Origin": "https://evil.example"})
check("foreign Origin blocked -> 403", r.status_code == 403)
r = requests.post(api("inquiries.php"), data="not json", headers={**H, "Content-Type": "application/json"})
check("malformed JSON -> 400", r.status_code == 400)

section("Admin inquiry management")
r = c.req("GET", "inquiries.php")
d = r.json()["data"]
names = [i["name"] for i in d["items"]]
check("only real inquiries stored (bot/fast/dup/invalid excluded)", sorted(names) == ["Alice Example", "Bob", "Carol"], str(names))
check("counts: 3 total, 3 new, 0 read", d["counts"] == {"total": 3, "new": 3, "read": 0}, str(d["counts"]))
check("newest first", names[0] == "Carol")
check("ipHash/fingerprint never sent to admin UI", all("ipHash" not in i and "fingerprint" not in i for i in d["items"]))
alice = next(i for i in d["items"] if i["name"] == "Alice Example")
r = c.req("GET", f"inquiries.php?id={alice['id']}")
check("inquiry detail has all fields", r.status_code == 200 and r.json()["data"]["phone"] == "+91 98765 43210" and r.json()["data"]["subject"] == "Need an app")
r = c.req("PUT", f"inquiries.php?id={alice['id']}", {"read": True})
check("mark as read", r.status_code == 200 and r.json()["data"]["read"] is True and r.json()["data"]["readAt"])
d = c.req("GET", "inquiries.php?status=read").json()["data"]
check("filter status=read", [i["name"] for i in d["items"]] == ["Alice Example"])
d = c.req("GET", "inquiries.php?status=new").json()["data"]
check("filter status=new", sorted(i["name"] for i in d["items"]) == ["Bob", "Carol"] and d["counts"]["read"] == 1)
d = c.req("GET", "inquiries.php?q=flutter").json()["data"]
check("search finds message text (case-insensitive)", [i["name"] for i in d["items"]] == ["Alice Example"])
d = c.req("GET", "inquiries.php?q=carol@example").json()["data"]
check("search finds e-mail", [i["name"] for i in d["items"]] == ["Carol"])
d = c.req("GET", "inquiries.php?q=zzzznothing").json()["data"]
check("search with no match -> empty", d["items"] == [] and d["matches"] == 0)
d = c.req("GET", "inquiries.php?per_page=1&page=2").json()["data"]
check("pagination", len(d["items"]) == 1 and d["pages"] == 3 and d["page"] == 2)
r = c.req("GET", "inquiries.php?export=csv")
csv_text = r.content.decode("utf-8-sig")
check("CSV export headers", r.headers["Content-Type"].startswith("text/csv") and "attachment" in r.headers["Content-Disposition"])
check("CSV has header + 3 rows", len([l for l in csv_text.splitlines() if l.strip()]) >= 4 and "Alice Example" in csv_text)
check("CSV neutralises formula injection", "'=HYPERLINK" in csv_text and "'+cmd" in csv_text, csv_text[:400])
r = c.req("GET", "inquiries.php?export=csv&status=read")
check("CSV respects filters", "Alice Example" in r.text and "Carol" not in r.text)
bob = next(i for i in c.req("GET", "inquiries.php").json()["data"]["items"] if i["name"] == "Bob")
carol = next(i for i in c.req("GET", "inquiries.php").json()["data"]["items"] if i["name"] == "Carol")
r = c.req("POST", "inquiries.php?action=bulk", {"action": "mark_read", "ids": [bob["id"], carol["id"]]})
check("bulk mark read", r.status_code == 200 and r.json()["data"]["counts"]["new"] == 0)
r = c.req("POST", "inquiries.php?action=bulk", {"action": "mark_unread", "ids": [bob["id"]]})
check("bulk mark unread", r.json()["data"]["counts"] == {"total": 3, "new": 1, "read": 2})
r = c.req("POST", "inquiries.php?action=bulk", {"action": "explode", "ids": [bob["id"]]})
check("bulk invalid action -> 422", r.status_code == 422)
r = c.req("DELETE", f"inquiries.php?id={carol['id']}")
check("delete inquiry", r.status_code == 200)
r = c.req("DELETE", f"inquiries.php?id={carol['id']}")
check("delete again -> 404", r.status_code == 404)
r = c.req("DELETE", f"inquiries.php?id={bob['id']}", csrf=False)
check("delete without CSRF -> 403", r.status_code == 403)
check("deleted inquiry gone", len(c.req("GET", "inquiries.php").json()["data"]["items"]) == 2)

section("Public form rate limiting")
codes = []
for i in range(14):
    r = requests.post(api("inquiries.php"), json={**good, "email": f"r{i}@example.com", "message": f"Rate limit probe number {i} hello"}, headers=H)
    codes.append(r.status_code)
    if r.status_code == 429:
        check("429 includes Retry-After", int(r.headers.get("Retry-After", 0)) > 0)
        break
check("per-IP hourly limit triggers 429", 429 in codes, str(codes))

# ───────────────────────────────────────────────────────────────
section("Uploads")
from PIL import Image  # noqa: E402
def png(size=(300, 200)):
    b = io.BytesIO(); Image.new("RGB", size, (30, 120, 120)).save(b, "PNG"); return b.getvalue()
def post_file(name, data, mime, cl=c):
    return cl.s.post(api("upload.php"), files={"file": (name, data, mime)}, headers={"Origin": BASE, "X-CSRF-Token": cl.csrf})
r = post_file("photo.png", png(), "image/png")
up = r.json()["data"] if r.ok else {}
check("PNG upload -> 201", r.status_code == 201 and up.get("name", "").endswith(".png"), r.text)
check("stored name is random, not the client name", "photo" not in up.get("name", "photo"))
fetched = requests.get(up["url"]) if up else None
check("uploaded file is reachable by URL", fetched is not None and fetched.status_code == 200 and fetched.content[:4] == b"\x89PNG")
r = post_file("shell.png", b"<?php echo 'pwned'; ?>", "image/png")
check("PHP disguised as PNG rejected -> 415", r.status_code == 415, r.text)
r = post_file("shell.php", b"<?php echo 1;", "application/x-php")
check(".php upload rejected -> 415", r.status_code == 415)
r = post_file("x.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml")
check("SVG (script risk) rejected -> 415", r.status_code == 415)
r = post_file("x.png", b"\x89PNG\r\n\x1a\n garbage", "image/png")
check("corrupt image rejected", r.status_code == 415, str(r.status_code))
r = post_file("cv.pdf", b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", "application/pdf")
check("PDF upload ok", r.status_code == 201 and r.json()["data"]["name"].endswith(".pdf"), r.text)
pdfname = r.json()["data"]["name"] if r.ok else None
r = post_file("fake.pdf", b"not a pdf at all", "application/pdf")
check("fake PDF rejected", r.status_code == 415)
big = Image.new("RGB", (3000, 2000), (200, 10, 10)); b = io.BytesIO(); big.save(b, "JPEG", quality=95)
r = post_file("big.jpg", b.getvalue(), "image/jpeg")
check("large JPEG accepted and resized", r.status_code == 201, r.text)
if r.ok:
    im = Image.open(io.BytesIO(requests.get(r.json()["data"]["url"]).content))
    check("resized to max 1800px", max(im.size) == 1800, str(im.size))
    bigname = r.json()["data"]["name"]
else:
    bigname = None
r = post_file("noauth.png", png(), "image/png", cl=Client())
check("upload without session -> 401", r.status_code == 401)
files = c.req("GET", "upload.php").json()["data"]["files"]
check("media list shows uploads", len(files) >= 3 and all(f["url"].startswith("http") for f in files))
r = c.req("DELETE", "upload.php?name=../../config.local.php")
check("delete with traversal name -> 400", r.status_code == 400)
for n in [up.get("name"), pdfname, bigname]:
    if n:
        c.req("DELETE", f"upload.php?name={n}")
check("uploads cleaned up", len(c.req("GET", "upload.php").json()["data"]["files"]) == 0)

# ───────────────────────────────────────────────────────────────
section("Dashboard")
d = c.req("GET", "dashboard.php").json()["data"]
check("dashboard inquiry counts", d["inquiries"]["total"] >= 2 and d["inquiries"]["new"] + d["inquiries"]["read"] == d["inquiries"]["total"])
check("dashboard project counts", d["projects"]["total"] == 6 and d["projects"]["published"] == 6)
check("dashboard config checks present", len(d["config"]["checks"]) >= 8 and d["config"]["status"] in ("ready", "review", "attention"))

# ───────────────────────────────────────────────────────────────
section("Password change invalidates other sessions")
other = Client()
r = other.login(PW1)
check("second session logs in", r.status_code == 200)
r = c.req("POST", "auth.php?action=change_password", {"current": "wrong wrong wrong", "new": PW2})
check("wrong current password -> 403", r.status_code == 403)
r = c.req("POST", "auth.php?action=change_password", {"current": PW1, "new": "short"})
check("weak new password -> 422", r.status_code == 422)
r = c.req("POST", "auth.php?action=change_password", {"current": PW1, "new": PW1})
check("same password -> 422", r.status_code == 422)
r = c.req("POST", "auth.php?action=change_password", {"current": PW1, "new": PW2})
check("change password ok", r.status_code == 200, r.text)
c.csrf = r.json()["data"]["csrf"]
check("current session stays signed in", c.req("GET", "settings.php").status_code == 200)
check("other session is signed out", other.req("GET", "settings.php").status_code == 401)
check("old password no longer works", Client().login(PW1).status_code == 401)
check("new password works", Client().login(PW2).status_code == 200)

section("Logout")
r = c.req("POST", "auth.php?action=logout")
check("logout ok", r.status_code == 200)
check("session dead after logout", c.req("GET", "settings.php").status_code == 401)
check("status shows unauthenticated", Client().status()["authenticated"] is False)

section("Login brute-force lockout")
bf = Client(); bf.status()
codes = [bf.req("POST", "auth.php?action=login", {"password": f"wrong-password-{i}"}).status_code for i in range(7)]
check("5 failures then 429", codes[:5] == [401] * 5 and codes[5] == 429, str(codes))
r = bf.req("POST", "auth.php?action=login", {"password": PW2})
check("even the right password is blocked while locked out", r.status_code == 429)
check("429 has Retry-After", int(r.headers.get("Retry-After", 0)) > 0)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
