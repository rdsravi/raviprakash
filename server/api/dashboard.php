<?php
declare(strict_types=1);
/** Admin overview: counts and a configuration health check. GET only. */
require __DIR__ . '/../lib/bootstrap.php';

use Portfolio\Auth;
use Portfolio\Config;
use Portfolio\Http;
use Portfolio\Inquiries;
use Portfolio\Schemas;
use Portfolio\Store;
use Portfolio\Uploads;

Http::init();
Http::allow(['GET']);
Auth::require(false);

$inq = (array) Store::read('inquiries', []);
$projects = (array) Store::read('projects', []);
$published = array_filter($projects, static function ($p) {
    return !isset($p['published']) || $p['published'] !== false;
});
$featured = array_filter($projects, static function ($p) {
    return !empty($p['featured']);
});
$settings = array_replace(Schemas::settingsDefaults(), (array) Store::read('settings', []));

$writable = static function (string $dir): bool {
    return is_dir($dir) && is_writable($dir);
};
$origins = Config::get('allowed_origins', []);

$checks = [];
$add = static function (string $id, string $label, bool $ok, string $detail, string $level = 'warn') use (&$checks): void {
    $checks[] = ['id' => $id, 'label' => $label, 'ok' => $ok, 'level' => $ok ? 'ok' : $level, 'detail' => $detail];
};
$add('https', 'Served over HTTPS', Http::isHttps(), 'Passwords and the session cookie should only travel over HTTPS.');
$add('data', 'Data folder is writable', $writable((string) Config::get('data_dir')), 'The server must be able to write JSON files in data/.', 'bad');
$add('uploads', 'Uploads folder is writable', $writable(Uploads::dir()), 'Needed for images and the CV upload.', 'bad');
$add('cors', 'Public site origin allowed (CORS)', is_array($origins) && count($origins) > 0, 'Add your GitHub Pages / domain URL to allowed_origins in config.local.php or the public site cannot load content.');
$add('setupkey', 'Setup key removed after first login', (string) Config::get('setup_key', '') === '', 'You can delete setup_key from config.local.php now that a password exists.');
$add('gd', 'Image processing (GD) available', function_exists('imagecreatefromstring'), 'Without GD, uploaded images are stored as-is instead of being re-encoded.');
$add('finfo', 'File type detection (fileinfo) available', class_exists('finfo'), 'Required for upload validation.', 'bad');
$add('notify', 'Inquiry notification e-mail set', filter_var((string) ($settings['notifyEmail'] ?: $settings['email']), FILTER_VALIDATE_EMAIL) !== false, 'Set a notify or public e-mail in Settings to get an e-mail for each inquiry.');
$add('seo', 'SEO title and description set', $settings['seoTitle'] !== '' && $settings['seoDescription'] !== '', 'Fill these in under Settings → SEO.');
$add('contact', 'Contact details set', $settings['email'] !== '' && $settings['phone'] !== '', 'Add an email and phone under Settings → Contact.');

$bad = count(array_filter($checks, static function ($c) { return $c['level'] === 'bad'; }));
$warn = count(array_filter($checks, static function ($c) { return $c['level'] === 'warn'; }));

Http::json([
    'inquiries' => Inquiries::counts($inq),
    'projects' => ['total' => count($projects), 'published' => count($published), 'featured' => count($featured)],
    'counts' => [
        'skills' => count((array) Store::read('skills', [])),
        'services' => count((array) Store::read('services', [])),
        'experience' => count((array) Store::read('experience', [])),
        'education' => count((array) Store::read('education', [])),
        'achievements' => count((array) Store::read('achievements', [])),
        'testimonials' => count((array) Store::read('testimonials', [])),
        'gallery' => count((array) Store::read('gallery', [])),
    ],
    'config' => [
        'status' => $bad ? 'attention' : ($warn ? 'review' : 'ready'),
        'problems' => $bad,
        'warnings' => $warn,
        'checks' => $checks,
    ],
    'php' => PHP_VERSION,
]);
