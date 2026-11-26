<?php
declare(strict_types=1);
/**
 * Contact-form inquiries.
 *
 *   POST  {name,email,phone,subject,message,_honey,_elapsed}   PUBLIC (CORS + rate limited)
 *   GET   ?status=all|new|read&q=&page=&per_page=              admin
 *   GET   ?id=…                                                admin (one inquiry)
 *   GET   ?export=csv&status=&q=                               admin (CSV download)
 *   PUT   ?id=…   {read:true|false}                            admin + CSRF
 *   POST  ?action=bulk {action:mark_read|mark_unread|delete, ids:[…]}   admin + CSRF
 *   DELETE ?id=…                                               admin + CSRF
 */
require __DIR__ . '/../lib/bootstrap.php';

use Portfolio\ApiError;
use Portfolio\Auth;
use Portfolio\Http;
use Portfolio\Inquiries;
use Portfolio\Store;

Http::init();
$method = Http::method();
$action = Http::query('action');

// ── public: submit the contact form ──
if ($method === 'OPTIONS') {
    Http::preflight();
}
if ($method === 'POST' && $action === null) {
    $originOk = Http::cors();
    if (!$originOk) {
        Http::fail(403, 'origin_not_allowed', 'This website is not allowed to send messages to this server.');
    }
    Inquiries::submit(Http::body());
    Http::json(['received' => true], 201);
}

// ── everything below is admin only (not CORS-enabled) ──
Http::allow(['GET', 'POST', 'PUT', 'DELETE']);
Auth::require($method !== 'GET');
$id = Http::query('id');

if ($method === 'GET') {
    $items = (array) Store::read('inquiries', []);
    if ($id !== null) {
        foreach ($items as $it) {
            if ($it['id'] === $id) {
                Http::json(Inquiries::present($it));
            }
        }
        Http::fail(404, 'not_found', 'That inquiry no longer exists.');
    }
    $status = in_array(Http::query('status', 'all'), ['all', 'new', 'read'], true) ? (string) Http::query('status', 'all') : 'all';
    $q = substr((string) Http::query('q', ''), 0, 200);
    $filtered = Inquiries::filter($items, $status, $q);

    if (Http::query('export') === 'csv') {
        Inquiries::exportCsv($filtered);
    }
    $per = max(1, min(200, (int) Http::query('per_page', 50)));
    $pages = max(1, (int) ceil(count($filtered) / $per));
    $page = max(1, min($pages, (int) Http::query('page', 1)));
    Http::json([
        'items' => array_map([Inquiries::class, 'present'], array_slice($filtered, ($page - 1) * $per, $per)),
        'counts' => Inquiries::counts($items),
        'matches' => count($filtered),
        'page' => $page,
        'pages' => $pages,
        'perPage' => $per,
    ]);
}

if ($method === 'POST' && $action === 'bulk') {
    $b = Http::body();
    $op = (string) ($b['action'] ?? '');
    $ids = isset($b['ids']) && is_array($b['ids']) ? array_map('strval', $b['ids']) : [];
    if (!in_array($op, ['mark_read', 'mark_unread', 'delete'], true) || !$ids || count($ids) > 500) {
        Http::fail(422, 'validation_failed', 'Choose an action and between 1 and 500 inquiries.');
    }
    $changed = 0;
    Store::update('inquiries', static function ($items) use ($op, $ids, &$changed) {
        $out = [];
        foreach ((array) $items as $it) {
            if (!in_array($it['id'], $ids, true)) {
                $out[] = $it;
                continue;
            }
            $changed++;
            if ($op === 'delete') {
                continue;
            }
            $it['read'] = $op === 'mark_read';
            $it['readAt'] = $it['read'] ? Http::nowIso() : null;
            $out[] = $it;
        }
        return $out;
    }, []);
    Http::json(['changed' => $changed, 'counts' => Inquiries::counts((array) Store::read('inquiries', []))]);
}

if ($id === null || $id === '') {
    Http::fail(400, 'missing_id', 'An id is required.');
}

if ($method === 'PUT') {
    $b = Http::body();
    if (!array_key_exists('read', $b)) {
        Http::fail(422, 'validation_failed', 'Nothing to update. Send {"read": true|false}.');
    }
    $read = filter_var($b['read'], FILTER_VALIDATE_BOOLEAN);
    $found = null;
    Store::update('inquiries', static function ($items) use ($id, $read, &$found) {
        $items = (array) $items;
        foreach ($items as $i => $it) {
            if ($it['id'] === $id) {
                $items[$i]['read'] = $read;
                $items[$i]['readAt'] = $read ? Http::nowIso() : null;
                $found = $items[$i];
            }
        }
        if ($found === null) {
            throw new ApiError(404, 'not_found', 'That inquiry no longer exists.');
        }
        return $items;
    }, []);
    Http::json(Inquiries::present($found));
}

if ($method === 'DELETE') {
    Store::update('inquiries', static function ($items) use ($id) {
        $items = (array) $items;
        $out = array_values(array_filter($items, static function ($it) use ($id) {
            return $it['id'] !== $id;
        }));
        if (count($out) === count($items)) {
            throw new ApiError(404, 'not_found', 'That inquiry no longer exists.');
        }
        return $out;
    }, []);
    Http::json(['deleted' => $id]);
}

Http::fail(405, 'method_not_allowed', 'Method not allowed.');
