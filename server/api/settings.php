<?php
declare(strict_types=1);
/**
 * Website settings (admin only).
 *   GET        -> all settings
 *   PUT {...}  -> update any subset of settings
 */
require __DIR__ . '/../lib/bootstrap.php';

use Portfolio\Auth;
use Portfolio\Http;
use Portfolio\Schemas;
use Portfolio\Store;
use Portfolio\Validator;

Http::init();
Http::allow(['GET', 'PUT']);
Auth::require(Http::method() !== 'GET');

if (Http::method() === 'GET') {
    Http::json(array_replace(Schemas::settingsDefaults(), (array) Store::read('settings', [])));
}

$body = Http::body();
$saved = Store::update('settings', static function ($current) use ($body) {
    $current = array_replace(Schemas::settingsDefaults(), (array) $current);
    return Validator::clean(Schemas::settings(), $body, $current);
}, []);
Http::json($saved);
