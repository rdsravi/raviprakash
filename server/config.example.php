<?php
/**
 * Copy this file to  config.local.php  and edit the values.
 *
 *   cp config.example.php config.local.php
 *
 * config.local.php is git-ignored and blocked from the web by .htaccess.
 * NEVER commit it and never put real secrets in this example file.
 */
return [
    // ── REQUIRED ─────────────────────────────────────────────────
    // Exact origin(s) of your PUBLIC website (scheme + host, no path, no trailing slash).
    // Only these sites may load content from, and send the contact form to, this server.
    'allowed_origins' => [
        'https://YOUR-USERNAME.github.io',
        // 'https://www.yourdomain.com',
    ],

    // One-time key used to create the admin password the first time you open /admin.
    // Use a long random string (e.g. run: php -r "echo bin2hex(random_bytes(20)), PHP_EOL;").
    // Delete this line once you have signed in for the first time.
    'setup_key' => 'CHANGE-ME-to-a-long-random-string',

    // ── OPTIONAL ─────────────────────────────────────────────────
    // Alternative to setup_key: paste a hash made with `php tools/hash-password.php`.
    // 'admin_password_hash' => '',

    // Keep data outside the web root if your host allows it (most secure):
    // 'data_dir' => '/home/USER/portfolio-data',

    // Public URL of the uploads folder, only needed if auto-detection is wrong:
    // 'uploads_url' => 'https://api.yourdomain.com/uploads',

    // Your public website address; lets the admin panel preview images and link to the site.
    // 'public_site_url' => 'https://YOUR-USERNAME.github.io/YOUR-REPO',

    // 'allow_localhost' => false,        // true only on your own computer while developing
    // 'notify_on_inquiry' => true,       // e-mail an alert for each new inquiry
    // 'mail_from' => 'no-reply@yourdomain.com',
    // 'trust_proxy_header' => 'HTTP_CF_CONNECTING_IP',   // only if you really are behind Cloudflare
    // 'max_upload_mb' => 8,
    // 'session_idle_minutes' => 30,
    // 'inquiry_limit_per_hour' => 5,
];
