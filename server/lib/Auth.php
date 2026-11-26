<?php
declare(strict_types=1);

namespace Portfolio;

/**
 * Admin authentication.
 *
 *  - The password is stored only as a salted hash (Argon2id when available, else bcrypt)
 *    in data/admin.json. Nothing secret exists in any JavaScript or HTML file.
 *  - Login state lives in a server-side PHP session (HttpOnly, SameSite=Strict, Secure on HTTPS).
 *  - Every state-changing admin request needs a CSRF token (X-CSRF-Token header) AND a same-origin Origin header.
 *  - Failed logins are rate-limited per IP.
 *  - Changing the password invalidates every other session.
 */
final class Auth
{
    private static $started = false;

    public static function start(): void
    {
        if (self::$started) {
            return;
        }
        if (session_status() === PHP_SESSION_NONE) {
            $secure = Config::get('cookie_secure', 'auto');
            $secure = $secure === 'auto' ? Http::isHttps() : (bool) $secure;
            session_name('rp_admin');
            ini_set('session.use_strict_mode', '1');
            ini_set('session.use_only_cookies', '1');
            ini_set('session.cookie_httponly', '1');
            session_set_cookie_params([
                'lifetime' => 0,
                'path' => '/',
                'secure' => $secure,
                'httponly' => true,
                'samesite' => 'Strict',
            ]);
            session_start();
        }
        self::$started = true;

        // Expire idle / old sessions.
        if (!empty($_SESSION['uid'])) {
            $now = time();
            $idle = (int) Config::get('session_idle_minutes', 30) * 60;
            $max = (int) Config::get('session_max_hours', 8) * 3600;
            $expired = ($now - (int) ($_SESSION['last'] ?? 0)) > $idle
                || ($now - (int) ($_SESSION['started'] ?? 0)) > $max
                || (string) ($_SESSION['pwv'] ?? '') !== self::passwordVersion();
            if ($expired) {
                self::destroy();
                session_start();
                self::$started = true;
            } else {
                $_SESSION['last'] = $now;
            }
        }
    }

    private static function destroy(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    // ── password storage ─────────────────────────────────────────

    /** @return array{hash:string,version:string}|null */
    private static function record(): ?array
    {
        $rec = Store::read('admin', null);
        if (is_array($rec) && !empty($rec['hash'])) {
            return ['hash' => (string) $rec['hash'], 'version' => (string) ($rec['version'] ?? '1')];
        }
        $cfgHash = (string) Config::get('admin_password_hash', '');
        if ($cfgHash !== '') {
            return ['hash' => $cfgHash, 'version' => 'cfg'];
        }
        return null;
    }

    public static function hasPassword(): bool
    {
        return self::record() !== null;
    }

    private static function passwordVersion(): string
    {
        $r = self::record();
        return $r ? $r['version'] : '';
    }

    public static function hashPassword(string $password): string
    {
        $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        return password_hash($password, $algo);
    }

    private static function savePassword(string $password): void
    {
        Store::write('admin', [
            'hash' => self::hashPassword($password),
            'version' => bin2hex(random_bytes(8)),
            'updatedAt' => Http::nowIso(),
        ]);
    }

    private static function checkStrength(string $password): void
    {
        $min = (int) Config::get('min_password_length', 12);
        if (strlen($password) < $min) {
            Http::fail(422, 'weak_password', "Use at least {$min} characters.", ['password' => "Use at least {$min} characters."]);
        }
        if (strlen($password) > 200) {
            Http::fail(422, 'weak_password', 'Password is too long (max 200 characters).', ['password' => 'Too long.']);
        }
        if (preg_match('/^(.)\1+$/', $password)) {
            Http::fail(422, 'weak_password', 'Choose a less repetitive password.', ['password' => 'Too repetitive.']);
        }
    }

    // ── session state ────────────────────────────────────────────

    public static function isLoggedIn(): bool
    {
        self::start();
        return !empty($_SESSION['uid']);
    }

    public static function csrfToken(): string
    {
        self::start();
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return (string) $_SESSION['csrf'];
    }

    /** Use at the top of every admin endpoint. Pass $write = true for anything that changes data. */
    public static function require(bool $write = false): void
    {
        self::start();
        if (empty($_SESSION['uid'])) {
            Http::fail(401, 'unauthenticated', 'Please sign in.');
        }
        if ($write) {
            self::requireCsrf();
        }
    }

    public static function requireCsrf(): void
    {
        self::start();
        if (!Http::isSameOrigin()) {
            Http::fail(403, 'bad_origin', 'Cross-site request blocked.');
        }
        $sent = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        $have = (string) ($_SESSION['csrf'] ?? '');
        if ($have === '' || $sent === '' || !hash_equals($have, $sent)) {
            Http::fail(403, 'bad_csrf', 'Your session token is invalid or expired. Reload the page and try again.');
        }
    }

    // ── actions ──────────────────────────────────────────────────

    public static function setup(string $setupKey, string $password): void
    {
        if (self::hasPassword()) {
            Http::fail(409, 'already_setup', 'An admin password is already set.');
        }
        $expected = (string) Config::get('setup_key', '');
        if ($expected === '') {
            Http::fail(403, 'setup_disabled', 'First-time setup is disabled. Add setup_key to config.local.php (see README).');
        }
        $ip = Store::hashIp(Http::clientIp());
        RateLimit::enforce('setup', $ip, 5, 900, 'Too many attempts. Try again later.');
        if (!hash_equals($expected, $setupKey)) {
            RateLimit::record('setup', $ip);
            Http::fail(403, 'bad_setup_key', 'That setup key is not correct.', ['setupKey' => 'Incorrect key.']);
        }
        self::checkStrength($password);
        self::savePassword($password);
        self::loginSession();
    }

    public static function login(string $password): void
    {
        if (!self::hasPassword()) {
            Http::fail(409, 'setup_required', 'No admin password has been created yet.');
        }
        $ip = Store::hashIp(Http::clientIp());
        $max = (int) Config::get('login_max_attempts', 5);
        $win = (int) Config::get('login_window_minutes', 15) * 60;
        RateLimit::enforce('login', $ip, $max, $win, 'Too many failed sign-in attempts. Try again later.');

        $rec = self::record();
        $ok = $rec !== null && password_verify($password, $rec['hash']);
        if (!$ok) {
            RateLimit::record('login', $ip);
            usleep(random_int(150000, 400000)); // blunt timing probes
            Http::fail(401, 'bad_credentials', 'Incorrect password.');
        }
        RateLimit::clear('login', $ip);
        if ($rec !== null && password_needs_rehash($rec['hash'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT) && $rec['version'] !== 'cfg') {
            Store::update('admin', static function ($cur) use ($password) {
                $cur = (array) $cur;
                $cur['hash'] = Auth::hashPassword($password);
                return $cur;
            }, []);
        }
        self::loginSession();
    }

    private static function loginSession(): void
    {
        self::start();
        session_regenerate_id(true);
        $_SESSION['uid'] = 'admin';
        $_SESSION['started'] = time();
        $_SESSION['last'] = time();
        $_SESSION['pwv'] = self::passwordVersion();
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }

    public static function logout(): void
    {
        self::start();
        $params = session_get_cookie_params();
        self::destroy();
        if (!headers_sent()) {
            setcookie(session_name(), '', [
                'expires' => time() - 3600,
                'path' => $params['path'],
                'secure' => $params['secure'],
                'httponly' => true,
                'samesite' => 'Strict',
            ]);
        }
    }

    public static function changePassword(string $current, string $new): void
    {
        $rec = self::record();
        if ($rec === null || !password_verify($current, $rec['hash'])) {
            $ip = Store::hashIp(Http::clientIp());
            RateLimit::record('login', $ip);
            Http::fail(403, 'bad_credentials', 'Your current password is not correct.', ['current' => 'Incorrect password.']);
        }
        self::checkStrength($new);
        if (hash_equals($current, $new)) {
            Http::fail(422, 'weak_password', 'The new password must be different from the current one.', ['password' => 'Choose a different password.']);
        }
        self::savePassword($new);
        // Keep this session, drop all others (their stored version no longer matches).
        $_SESSION['pwv'] = self::passwordVersion();
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}
