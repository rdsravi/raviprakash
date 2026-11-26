<?php
declare(strict_types=1);
/**
 * PUBLIC read-only feed that powers the portfolio website.
 *   GET /api/content.php  ->  { settings, services, projects, skills, experience, education,
 *                               achievements, testimonials, gallery, version }
 * Only published items are returned, and private settings (notify e-mail) are removed.
 * CORS is limited to `allowed_origins` from config.local.php.
 */
require __DIR__ . '/../lib/bootstrap.php';

use Portfolio\Http;
use Portfolio\Schemas;
use Portfolio\Store;

Http::init();
Http::cors();
Http::preflight();
Http::allow(['GET', 'HEAD']);

$settings = array_replace(Schemas::settingsDefaults(), (array) Store::read('settings', []));
foreach (Schemas::privateSettings() as $k) {
    unset($settings[$k]);
}

$live = static function (array $items): array {
    return array_values(array_filter($items, static function ($i) {
        return !array_key_exists('published', $i) || $i['published'] !== false;
    }));
};
// Strip bookkeeping fields the visitor does not need.
$slim = static function (array $items): array {
    return array_map(static function ($i) {
        unset($i['createdAt'], $i['updatedAt']);
        return $i;
    }, $items);
};

$payload = ['settings' => $settings];
foreach (array_keys(Schemas::collections()) as $name) {
    $payload[$name] = $slim($live((array) Store::read($name, [])));
}
$payload['version'] = substr(md5((string) json_encode($payload)), 0, 12);

// Cheap revalidation: browsers send If-None-Match and get a tiny 304 when nothing changed.
$etag = '"' . $payload['version'] . '"';
header('Cache-Control: public, max-age=0, must-revalidate');
header('ETag: ' . $etag);
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim((string) $_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}
Http::json($payload);
