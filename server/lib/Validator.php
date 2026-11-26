<?php
declare(strict_types=1);

namespace Portfolio;

/**
 * Schema-driven validation and sanitising.
 *
 * Only fields named in the schema are ever copied from the request, so clients
 * cannot inject extra keys (mass-assignment). Output is plain data; escaping for
 * HTML happens where it is displayed (both front ends use textContent / escaping).
 */
final class Validator
{
    private static function len(string $s): int
    {
        return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
    }

    /** Strip control characters (keeps \n and \t) and invalid UTF-8. */
    private static function scrub(string $s): string
    {
        if (function_exists('mb_convert_encoding')) {
            $s = (string) mb_convert_encoding($s, 'UTF-8', 'UTF-8');
        }
        $s = str_replace("\r\n", "\n", $s);
        $s = str_replace("\r", "\n", $s);
        return (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $s);
    }

    /**
     * Validate a single value.
     *
     * @param mixed $v
     * @return mixed cleaned value
     * @throws \InvalidArgumentException with a user-facing message
     */
    public static function value(array $spec, $v)
    {
        $type = $spec['type'] ?? 'text';
        $max = (int) ($spec['max'] ?? 300);
        $required = !empty($spec['required']);

        switch ($type) {
            case 'bool':
                if (is_bool($v)) {
                    return $v;
                }
                if ($v === 1 || $v === '1' || $v === 'true') {
                    return true;
                }
                if ($v === 0 || $v === '0' || $v === 'false' || $v === '' || $v === null) {
                    return false;
                }
                throw new \InvalidArgumentException('Must be true or false.');

            case 'int':
                if ($v === '' || $v === null) {
                    if ($required) {
                        throw new \InvalidArgumentException('This field is required.');
                    }
                    return (int) ($spec['default'] ?? 0);
                }
                if (is_bool($v) || !is_numeric($v)) {
                    throw new \InvalidArgumentException('Must be a whole number.');
                }
                $n = (int) $v;
                $min = (int) ($spec['min'] ?? PHP_INT_MIN);
                $hi = (int) ($spec['maxValue'] ?? PHP_INT_MAX);
                if ($n < $min || $n > $hi) {
                    throw new \InvalidArgumentException("Must be between {$min} and {$hi}.");
                }
                return $n;

            case 'enum':
                $values = (array) ($spec['values'] ?? []);
                $s = is_string($v) ? trim($v) : '';
                if ($s === '' && !$required) {
                    return $spec['default'] ?? ($values[0] ?? '');
                }
                if (!in_array($s, $values, true)) {
                    throw new \InvalidArgumentException('Choose one of: ' . implode(', ', $values) . '.');
                }
                return $s;

            case 'tags':
                if ($v === null || $v === '') {
                    return [];
                }
                if (!is_array($v)) {
                    throw new \InvalidArgumentException('Must be a list.');
                }
                $maxItems = (int) ($spec['maxItems'] ?? 10);
                $out = [];
                foreach ($v as $t) {
                    if (!is_string($t) && !is_numeric($t)) {
                        throw new \InvalidArgumentException('Each item must be text.');
                    }
                    $t = trim(self::scrub((string) $t));
                    $t = (string) preg_replace('/\s+/', ' ', $t);
                    if ($t === '') {
                        continue;
                    }
                    if (self::len($t) > $max) {
                        throw new \InvalidArgumentException("Each item can be at most {$max} characters.");
                    }
                    $key = strtolower($t);
                    if (!isset($out[$key])) {
                        $out[$key] = $t; // de-duplicate case-insensitively, keeping the first spelling
                    }
                }
                $out = array_values($out);
                if (count($out) > $maxItems) {
                    throw new \InvalidArgumentException("At most {$maxItems} items.");
                }
                return $out;

            case 'sections':
                if ($v === null || $v === '') {
                    return [];
                }
                if (!is_array($v)) {
                    throw new \InvalidArgumentException('Must be a list.');
                }
                $maxItems = (int) ($spec['maxItems'] ?? 20);
                if (count($v) > $maxItems) {
                    throw new \InvalidArgumentException("At most {$maxItems} sections.");
                }
                $out = [];
                foreach ($v as $sec) {
                    if (!is_array($sec)) {
                        throw new \InvalidArgumentException('Invalid section.');
                    }
                    $h = trim(self::scrub((string) ($sec['heading'] ?? '')));
                    $t = trim(self::scrub((string) ($sec['text'] ?? '')));
                    if ($h === '' && $t === '') {
                        continue;
                    }
                    if (self::len($h) > 120) {
                        throw new \InvalidArgumentException('Section headings can be at most 120 characters.');
                    }
                    if (self::len($t) > 3000) {
                        throw new \InvalidArgumentException('Section text can be at most 3000 characters.');
                    }
                    $out[] = ['heading' => $h, 'text' => $t];
                }
                return $out;

            case 'lines': // list of short strings (e.g. rotating roles)
                if ($v === null || $v === '') {
                    return [];
                }
                if (!is_array($v)) {
                    throw new \InvalidArgumentException('Must be a list.');
                }
                $maxItems = (int) ($spec['maxItems'] ?? 12);
                $out = [];
                foreach ($v as $line) {
                    $line = trim(self::scrub((string) $line));
                    if ($line === '') {
                        continue;
                    }
                    if (self::len($line) > $max) {
                        throw new \InvalidArgumentException("Each line can be at most {$max} characters.");
                    }
                    $out[] = $line;
                }
                if (count($out) > $maxItems) {
                    throw new \InvalidArgumentException("At most {$maxItems} lines.");
                }
                return $out;

            case 'social':
                if ($v === null || $v === '') {
                    $v = [];
                }
                if (!is_array($v)) {
                    throw new \InvalidArgumentException('Must be an object.');
                }
                $out = [];
                foreach ((array) ($spec['keys'] ?? []) as $k) {
                    $out[$k] = self::value(['type' => 'url', 'max' => 300], $v[$k] ?? '');
                }
                return $out;

            case 'stats':
                if ($v === null || $v === '') {
                    return [];
                }
                if (!is_array($v)) {
                    throw new \InvalidArgumentException('Must be a list.');
                }
                $out = [];
                foreach ($v as $row) {
                    if (!is_array($row)) {
                        continue;
                    }
                    $val = trim(self::scrub((string) ($row['value'] ?? '')));
                    $lab = trim(self::scrub((string) ($row['label'] ?? '')));
                    if ($val === '' && $lab === '') {
                        continue;
                    }
                    if (self::len($val) > 12 || self::len($lab) > 40) {
                        throw new \InvalidArgumentException('Stat values max 12 characters, labels max 40.');
                    }
                    $out[] = ['value' => $val, 'label' => $lab];
                }
                if (count($out) > 4) {
                    throw new \InvalidArgumentException('At most 4 highlight numbers.');
                }
                return $out;
        }

        // ── string-ish types ──
        if ($v === null) {
            $v = '';
        }
        if (is_array($v) || is_object($v)) {
            throw new \InvalidArgumentException('Must be text.');
        }
        $s = self::scrub((string) $v);
        $s = $type === 'textarea' ? trim($s) : trim((string) preg_replace('/\s*\n\s*/', ' ', $s));

        if ($s === '') {
            if ($required) {
                throw new \InvalidArgumentException('This field is required.');
            }
            return '';
        }
        if (self::len($s) > $max) {
            throw new \InvalidArgumentException("Too long (max {$max} characters).");
        }

        switch ($type) {
            case 'email':
                if (!filter_var($s, FILTER_VALIDATE_EMAIL)) {
                    throw new \InvalidArgumentException('Enter a valid email address.');
                }
                return $s;
            case 'phone':
                if (!preg_match('/^[0-9+().\-\s]{5,40}$/', $s)) {
                    throw new \InvalidArgumentException('Enter a valid phone number.');
                }
                return $s;
            case 'url':
                if (!self::isHttpUrl($s)) {
                    throw new \InvalidArgumentException('Enter a full link starting with http:// or https://');
                }
                return $s;
            case 'media': // http(s) URL or a safe relative path like uploads/photo.jpg
                if (self::isHttpUrl($s)) {
                    return $s;
                }
                if (preg_match('#^[A-Za-z0-9_\-][A-Za-z0-9_\-./]*$#', $s) && strpos($s, '..') === false) {
                    return $s;
                }
                throw new \InvalidArgumentException('Use an uploaded file, an https:// link or a relative path such as uploads/photo.jpg');
            case 'slug':
                $s = strtolower($s);
                if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $s)) {
                    throw new \InvalidArgumentException('Use lowercase letters, numbers and hyphens only.');
                }
                return $s;
            case 'text':
            case 'textarea':
            default:
                return $s;
        }
    }

    public static function isHttpUrl(string $s): bool
    {
        if (!preg_match('#^https?://#i', $s)) {
            return false;
        }
        $parts = parse_url($s);
        return is_array($parts) && !empty($parts['host']) && filter_var($s, FILTER_VALIDATE_URL) !== false;
    }

    /**
     * Clean a whole record.
     *
     * @param array<string,array> $schema field => spec
     * @param array $input   request data
     * @param array|null $existing current record (partial update: absent keys keep their value)
     * @return array cleaned record containing exactly the schema's keys
     */
    public static function clean(array $schema, array $input, ?array $existing = null): array
    {
        $out = [];
        $errors = [];
        foreach ($schema as $field => $spec) {
            $present = array_key_exists($field, $input);
            if (!$present && $existing !== null && array_key_exists($field, $existing)) {
                $out[$field] = $existing[$field];
                continue;
            }
            if (!$present) {
                if (!empty($spec['required']) && $existing === null) {
                    $errors[$field] = 'This field is required.';
                    continue;
                }
                $out[$field] = self::defaultFor($spec);
                continue;
            }
            try {
                $out[$field] = self::value($spec, $input[$field]);
            } catch (\InvalidArgumentException $e) {
                $errors[$field] = $e->getMessage();
            }
        }
        if ($errors) {
            throw new ApiError(422, 'validation_failed', 'Please fix the highlighted fields.', $errors);
        }
        return $out;
    }

    /** @return mixed */
    private static function defaultFor(array $spec)
    {
        if (array_key_exists('default', $spec)) {
            return $spec['default'];
        }
        switch ($spec['type'] ?? 'text') {
            case 'bool':
                return false;
            case 'int':
                return 0;
            case 'tags':
            case 'sections':
            case 'lines':
            case 'stats':
                return [];
            case 'social':
                return self::value($spec, []);
            default:
                return '';
        }
    }
}
