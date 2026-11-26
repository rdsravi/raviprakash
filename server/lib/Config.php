<?php
declare(strict_types=1);

namespace Portfolio;

/**
 * Central configuration.
 *
 * Defaults live here. Anything you need to change goes into
 * server/config.local.php (copy config.example.php). That file is git-ignored
 * and blocked from the web by .htaccess, so secrets never reach GitHub.
 */
final class Config
{
    /** @var array|null */
    private static $cfg = null;

    public static function defaults(): array
    {
        $root = dirname(__DIR__);
        return [
            // ── storage ─────────────────────────────────────────────
            'data_dir'    => $root . '/data',      // move this OUTSIDE the web root if your host allows
            'uploads_dir' => $root . '/uploads',
            'uploads_url' => '',                   // blank = derived from the request (https://host/path/uploads)
            'max_upload_mb' => 8,

            // ── CORS (public endpoints only: content + contact form) ──
            // Exact origins allowed to call the public API from a browser,
            // e.g. ['https://rdsravi.github.io', 'https://www.example.com'].
            'allowed_origins' => [],
            'allow_localhost' => false,            // set true only while developing

            // ── admin authentication ────────────────────────────────
            'setup_key' => '',                     // one-time key for first password creation
            'admin_password_hash' => '',           // optional alternative to setup_key (see tools/hash-password.php)
            'session_idle_minutes' => 30,
            'session_max_hours' => 8,
            'login_max_attempts' => 5,             // failed logins per IP ...
            'login_window_minutes' => 15,          // ... within this window
            'min_password_length' => 12,

            // ── contact form ────────────────────────────────────────
            'inquiry_limit_per_hour' => 5,         // per visitor IP
            'inquiry_limit_per_day'  => 15,
            'inquiry_global_per_hour' => 60,       // flood guard across all visitors
            'max_inquiries' => 5000,
            'min_form_seconds' => 3,               // faster than this = bot
            'notify_on_inquiry' => true,           // e-mail the notify address via PHP mail()
            'mail_from' => '',                     // blank = no-reply@<host>

            // Public URL of the website itself (GitHub Pages / your domain), no trailing slash.
            // Only used by the admin panel to preview images that are stored as relative paths
            // (e.g. uploads/profile.jpg) and to show a "View site" link.
            'public_site_url' => '',

            // ── environment ─────────────────────────────────────────
            'trust_proxy_header' => '',            // e.g. 'HTTP_CF_CONNECTING_IP' behind Cloudflare
            'cookie_secure' => 'auto',             // 'auto' | true | false
            'timezone' => 'UTC',
        ];
    }

    public static function all(): array
    {
        if (self::$cfg === null) {
            $cfg = self::defaults();
            $local = dirname(__DIR__) . '/config.local.php';
            if (is_file($local)) {
                $override = require $local;
                if (is_array($override)) {
                    $cfg = array_replace($cfg, $override);
                }
            }
            self::$cfg = $cfg;
        }
        return self::$cfg;
    }

    /** @param mixed $default */
    public static function get(string $key, $default = null)
    {
        $all = self::all();
        return array_key_exists($key, $all) ? $all[$key] : $default;
    }
}
