<?php
declare(strict_types=1);

namespace Portfolio;

/**
 * One handler for every manageable list (projects, skills, services, experience, ...).
 *
 *   GET    ?                    list all items          (admin)
 *   GET    ?id=…                one item                (admin)
 *   POST   {fields}             create                  (admin + CSRF)
 *   POST   ?action=reorder      {"ids":[…]} new order   (admin + CSRF)
 *   PUT    ?id=…  {fields}      update (partial OK)     (admin + CSRF)
 *   DELETE ?id=…                delete                  (admin + CSRF)
 *
 * The public site never calls this; it reads api/content.php instead.
 */
final class Collection
{
    public static function slugify(string $text): string
    {
        $t = strtolower(trim($text));
        $t = (string) preg_replace('/[^a-z0-9]+/', '-', $t);
        $t = trim($t, '-');
        return substr($t, 0, 60) ?: 'item';
    }

    public static function handle(string $name): void
    {
        Http::init();
        $defs = Schemas::collections();
        if (!isset($defs[$name])) {
            Http::fail(404, 'unknown_collection', 'Unknown collection.');
        }
        $def = $defs[$name];
        $method = Http::method();
        Http::allow(['GET', 'POST', 'PUT', 'DELETE']);
        Auth::require($method !== 'GET');

        $id = Http::query('id');
        $action = Http::query('action');

        if ($method === 'GET') {
            $items = (array) Store::read($name, []);
            if ($id !== null) {
                Http::json(self::find($items, $id));
            }
            Http::json(['items' => array_values($items)]);
        }

        if ($method === 'POST' && $action === 'reorder') {
            $body = Http::body();
            $ids = $body['ids'] ?? null;
            if (!is_array($ids)) {
                Http::fail(422, 'validation_failed', 'ids must be a list.');
            }
            $new = Store::update($name, static function ($items) use ($ids) {
                $items = (array) $items;
                $byId = [];
                foreach ($items as $it) {
                    $byId[$it['id']] = $it;
                }
                $ids = array_values(array_unique(array_map('strval', $ids)));
                if (count($ids) !== count($byId) || array_diff($ids, array_keys($byId))) {
                    throw new ApiError(409, 'stale_order', 'The list changed. Reload and try again.');
                }
                return array_map(static function ($i) use ($byId) {
                    return $byId[$i];
                }, $ids);
            }, []);
            Http::json(['items' => $new]);
        }

        if ($method === 'POST') {
            $clean = Validator::clean($def['schema'], Http::body());
            $created = null;
            Store::update($name, static function ($items) use ($def, $clean, $name, &$created) {
                $items = (array) $items;
                if (count($items) >= $def['max']) {
                    throw new ApiError(409, 'limit_reached', "You can keep at most {$def['max']} entries here.");
                }
                $clean = self::applyUnique($def, $clean, $items, null);
                $now = Http::nowIso();
                $created = ['id' => Http::newId($def['prefix'])] + $clean + ['createdAt' => $now, 'updatedAt' => $now];
                $items[] = $created;
                return $items;
            }, []);
            Http::json($created, 201);
        }

        if ($id === null || $id === '') {
            Http::fail(400, 'missing_id', 'An id is required.');
        }

        if ($method === 'PUT') {
            $body = Http::body();
            $updated = null;
            Store::update($name, static function ($items) use ($def, $body, $id, &$updated) {
                $items = (array) $items;
                $idx = self::indexOf($items, $id);
                $clean = Validator::clean($def['schema'], $body, $items[$idx]);
                $clean = self::applyUnique($def, $clean, $items, $id);
                $updated = array_merge($items[$idx], $clean, ['updatedAt' => Http::nowIso()]);
                $items[$idx] = $updated;
                return $items;
            }, []);
            Http::json($updated);
        }

        // DELETE
        Store::update($name, static function ($items) use ($id) {
            $items = (array) $items;
            $idx = self::indexOf($items, $id);
            array_splice($items, $idx, 1);
            return array_values($items);
        }, []);
        Http::json(['deleted' => $id]);
    }

    private static function indexOf(array $items, string $id): int
    {
        foreach ($items as $i => $it) {
            if (($it['id'] ?? null) === $id) {
                return (int) $i;
            }
        }
        throw new ApiError(404, 'not_found', 'That entry no longer exists.');
    }

    private static function find(array $items, string $id): array
    {
        return $items[self::indexOf($items, $id)];
    }

    /** Make sure a unique field (e.g. a service slug) is filled in and not duplicated. */
    private static function applyUnique(array $def, array $clean, array $items, ?string $selfId): array
    {
        $field = $def['unique'] ?? null;
        if ($field === null) {
            return $clean;
        }
        $base = $clean[$field] !== '' ? $clean[$field] : self::slugify((string) ($clean['title'] ?? 'item'));
        $slug = $base;
        $n = 2;
        $taken = static function (string $s) use ($items, $field, $selfId): bool {
            foreach ($items as $it) {
                if (($it[$field] ?? null) === $s && ($it['id'] ?? null) !== $selfId) {
                    return true;
                }
            }
            return false;
        };
        while ($taken($slug)) {
            $slug = substr($base, 0, 54) . '-' . $n++;
        }
        $clean[$field] = $slug;
        return $clean;
    }
}
