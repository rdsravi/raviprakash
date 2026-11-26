<?php
/**
 * Import a legacy content.json (the old single-file format) into the data/ folder.
 *
 *   php tools/import-content.php [path/to/content.json] [--force]
 *
 * Existing non-empty data files are left alone unless --force is given.
 * Every record passes through the same validation the admin API uses.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

use Portfolio\Schemas;
use Portfolio\Store;
use Portfolio\Validator;

$args = array_slice($argv, 1);
$force = in_array('--force', $args, true);
$args = array_values(array_filter($args, static function ($a) { return $a !== '--force'; }));
$src = $args[0] ?? dirname(__DIR__, 2) . '/content.json';
if (!is_file($src)) {
    fwrite(STDERR, "Cannot find $src\n");
    exit(1);
}
$old = json_decode((string) file_get_contents($src), true);
if (!is_array($old)) {
    fwrite(STDERR, "content.json is not valid JSON\n");
    exit(1);
}
$s = (array) ($old['settings'] ?? []);

// ── settings ─────────────────────────────────────────────────────
$roles = array_values(array_filter((array) ($s['roles'] ?? [])));
$first = $roles[0] ?? 'Developer';
$intro = (string) ($s['heroIntro'] ?? '');
// Split the existing intro into a headline (first sentence) and supporting text (the rest).
$heading = $intro;
$rest = '';
if (preg_match('/^(.+?[.!?])\s+(.+)$/s', $intro, $m)) {
    $heading = $m[1];
    $rest = $m[2];
}
$settingsIn = [
    'name' => $s['name'] ?? 'Portfolio',
    'siteName' => $s['brand'] ?? ($s['name'] ?? 'Portfolio'),
    'siteTitle' => ($s['name'] ?? 'Portfolio') . ' | ' . $first,
    'designation' => $first,
    'eyebrow' => $s['eyebrow'] ?? '',
    'availability' => $s['availability'] ?? '',
    'heroHeading' => $heading,
    'heroIntro' => $rest !== '' ? $rest : $intro,
    'roles' => $roles,
    'heroImage' => $s['heroImage'] ?? '',
    'stats' => $s['stats'] ?? [],
    'aboutTitle' => $s['aboutTitle'] ?? '',
    'aboutBody' => $s['aboutBody'] ?? '',
    'aboutImage' => $s['aboutImage'] ?? '',
    'interests' => $s['interests'] ?? [],
    'email' => $s['email'] ?? '',
    'phone' => $s['phone'] ?? '',
    'location' => $s['location'] ?? '',
    'notifyEmail' => $s['notifyEmail'] ?? '',
    'social' => $s['social'] ?? [],
    'cvFile' => $s['cvFile'] ?? '',
    'defaultTheme' => 'system',
    'seoTitle' => ($s['name'] ?? 'Portfolio') . ' | ' . $first,
    'seoDescription' => 'Portfolio of ' . ($s['name'] ?? '') . ': ' . strtolower(implode(', ', array_slice($roles, 0, 4))) . '.',
    'seoKeywords' => implode(', ', array_merge([(string) ($s['name'] ?? '')], array_slice($roles, 0, 5))),
    'footerText' => $s['footerText'] ?? ($s['name'] ?? ''),
];
$settings = Validator::clean(Schemas::settings(), $settingsIn);

// ── collections ──────────────────────────────────────────────────
$categoryOf = [
    'flutter' => 'Mobile', 'android' => 'Mobile', 'ios' => 'Mobile',
    'web development' => 'Web', 'html & css' => 'Web', 'javascript' => 'Web',
    'c' => 'Programming',
];
$out = ['settings' => $settings];
foreach (Schemas::collections() as $name => $def) {
    $rows = [];
    foreach ((array) ($old[$name] ?? []) as $i => $row) {
        $row = (array) $row;
        if ($name === 'projects') {
            $row['liveUrl'] = $row['liveUrl'] ?? ($row['link'] ?? '');
            $row['featured'] = $i < 3; // legacy data had no "featured" flag: start with the first three
        }
        if ($name === 'skills') {
            $row['category'] = $row['category'] ?? ($categoryOf[strtolower((string) ($row['name'] ?? ''))] ?? 'Other');
        }
        $clean = Validator::clean($def['schema'], $row);
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $rows[] = ['id' => (string) ($row['id'] ?? Portfolio\Http::newId($def['prefix']))] + $clean + ['createdAt' => $now, 'updatedAt' => $now];
    }
    $out[$name] = $rows;
}

foreach ($out as $name => $value) {
    $existing = is_file(Store::path($name)) ? Store::read($name, null) : null; // live file only, not the seed fallback
    if (!$force && !empty($existing)) {
        echo "skip   $name (already has data; use --force to overwrite)\n";
        continue;
    }
    Store::write($name, $value);
    echo 'wrote  ' . $name . ' (' . (is_array($value) && array_keys($value) === range(0, count($value) - 1) ? count($value) . ' items' : 'object') . ")\n";
}
