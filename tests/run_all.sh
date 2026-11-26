#!/usr/bin/env bash
# Runs every automated test against THROWAWAY copies of the site and backend.
# Your real server/data and server/uploads are never touched.
#
# Needs: php (7.4+, with gd + fileinfo), python3 with `requests` and `pillow`, node 18+.
# One-time setup:   pip install requests pillow   and   (cd tests && npm install)
#
# Usage:  bash tests/run_all.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
export NODE_PATH="$ROOT/tests/node_modules"
KEY="test-setup-key-123"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; rm -rf "$TMP"; }
trap cleanup EXIT

[ -d "$NODE_PATH/jsdom" ] || { echo "jsdom missing: run  (cd tests && npm install)"; exit 2; }
command -v php >/dev/null || { echo "php not found"; exit 2; }

api_pid=""
start_backend() {   # $1 = inquiry limit per hour
  [ -n "$api_pid" ] && kill "$api_pid" 2>/dev/null && wait "$api_pid" 2>/dev/null
  rm -rf "$TMP/srv" && cp -r "$ROOT/server" "$TMP/srv"
  rm -f "$TMP/srv/config.local.php"; rm -rf "$TMP/srv/data/"*.json "$TMP/srv/data/"*.lock "$TMP/srv/data/secret.key"
  cat > "$TMP/srv/config.local.php" <<PHP
<?php return [
  'allowed_origins' => ['https://rdsravi.github.io'],
  'allow_localhost' => true,
  'setup_key' => '$KEY',
  'inquiry_limit_per_hour' => $1, 'inquiry_limit_per_day' => 200, 'inquiry_global_per_hour' => 400,
  'notify_on_inquiry' => false,
];
PHP
  php -S 127.0.0.1:8099 -t "$TMP/srv" >"$TMP/php.log" 2>&1 & api_pid=$!
  PIDS+=("$api_pid")
  for _ in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8099/api/ && break; sleep 0.2; done
}

make_site() {       # $1 = dir, $2 = api base
  mkdir -p "$1" && (cd "$ROOT" && cp -r *.html content.json css js uploads "$1/")
  sed -i "s|apiBase: ''|apiBase: '$2'|" "$1/js/config.js"
}
make_site "$TMP/site" http://127.0.0.1:8099
make_site "$TMP/dead" http://127.0.0.1:8998
(cd "$TMP/site" && python3 -m http.server 8100 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > "$TMP/p1")
(cd "$TMP/dead" && python3 -m http.server 8101 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > "$TMP/p2")
PIDS+=("$(cat "$TMP/p1")" "$(cat "$TMP/p2")")
sleep 1

FAIL=0
echo "################ 1/3  PHP API ################"
start_backend 12
python3 "$ROOT/tests/api_test.py" http://127.0.0.1:8099 "$KEY" >"$TMP/api.out" 2>&1; rc=$?
grep -v '^  PASS' "$TMP/api.out"
[ "$rc" -ne 0 ] && FAIL=1

echo; echo "################ 2/3  PUBLIC WEBSITE ################"
start_backend 40
node "$ROOT/tests/site_test.js" http://127.0.0.1:8100 http://127.0.0.1:8099 "$KEY" http://127.0.0.1:8101 | grep -v '^  PASS'
[ "${PIPESTATUS[0]}" -ne 0 ] && FAIL=1

echo; echo "################ 3/3  ADMIN PANEL ################"
start_backend 40
node "$ROOT/tests/admin_test.js" http://127.0.0.1:8099 "$KEY" | grep -v '^  PASS'
[ "${PIPESTATUS[0]}" -ne 0 ] && FAIL=1

echo
[ "$FAIL" -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME TESTS FAILED"
exit "$FAIL"
