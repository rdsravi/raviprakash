<?php
declare(strict_types=1);
/**
 * Admin authentication.
 *   GET  ?action=status           -> { authenticated, setupRequired, csrf }
 *   POST ?action=login            { password }
 *   POST ?action=setup            { setupKey, password }     (only while no password exists)
 *   POST ?action=logout
 *   POST ?action=change_password  { current, new }
 * Not CORS-enabled on purpose: only the admin pages on this same origin can use it.
 */
require __DIR__ . '/../lib/bootstrap.php';

use Portfolio\Auth;
use Portfolio\Http;

Http::init();
Http::allow(['GET', 'POST']);
$action = (string) Http::query('action', 'status');

if ($action === 'status') {
    Http::allow(['GET']);
    $authed = Auth::isLoggedIn();
    Http::json([
        'authenticated' => $authed,
        'setupRequired' => !Auth::hasPassword(),
        'csrf' => Auth::csrfToken(),
        'minPasswordLength' => (int) Portfolio\Config::get('min_password_length', 12),
        'siteUrl' => rtrim((string) Portfolio\Config::get('public_site_url', ''), '/'),
    ]);
}

Http::allow(['POST']);
Auth::start();
Auth::requireCsrf(); // even login/setup: blocks cross-site login forgery
$body = Http::body();
$str = static function (string $k) use ($body): string {
    return isset($body[$k]) && is_string($body[$k]) ? $body[$k] : '';
};

switch ($action) {
    case 'login':
        Auth::login($str('password'));
        Http::json(['authenticated' => true, 'csrf' => Auth::csrfToken()]);
        break;

    case 'setup':
        Auth::setup($str('setupKey'), $str('password'));
        Http::json(['authenticated' => true, 'csrf' => Auth::csrfToken()], 201);
        break;

    case 'logout':
        Auth::logout();
        Http::json(['authenticated' => false]);
        break;

    case 'change_password':
        Auth::require(true);
        Auth::changePassword($str('current'), $str('new'));
        Http::json(['changed' => true, 'csrf' => Auth::csrfToken()]);
        break;

    default:
        Http::fail(404, 'unknown_action', 'Unknown action.');
}
