<?php
declare(strict_types=1);

namespace Portfolio;

/** Contact-form submissions stored in data/inquiries.json. */
final class Inquiries
{
    private const SCHEMA = [
        'name'    => ['type' => 'text', 'max' => 120, 'required' => true],
        'email'   => ['type' => 'email', 'max' => 200, 'required' => true],
        'phone'   => ['type' => 'phone', 'max' => 40],
        'subject' => ['type' => 'text', 'max' => 160],
        'message' => ['type' => 'textarea', 'max' => 5000, 'required' => true],
    ];

    /**
     * Public submission. Returns normally for bots (so they learn nothing),
     * throws ApiError for real validation / rate-limit problems.
     */
    public static function submit(array $in): void
    {
        $ipHash = Store::hashIp(Http::clientIp());

        // 1. Rate limits first: cheap, and they apply to invalid attempts too.
        RateLimit::enforce('inq-global', 'all', (int) Config::get('inquiry_global_per_hour', 60), 3600,
            'The form is busy right now. Please try again later or email directly.');
        RateLimit::enforce('inq-hour', $ipHash, (int) Config::get('inquiry_limit_per_hour', 5), 3600,
            'You have sent several messages recently. Please wait a while before sending another.');
        RateLimit::enforce('inq-day', $ipHash, (int) Config::get('inquiry_limit_per_day', 15), 86400,
            'Daily message limit reached. Please try again tomorrow or email directly.');
        RateLimit::record('inq-global', 'all');
        RateLimit::record('inq-hour', $ipHash);
        RateLimit::record('inq-day', $ipHash);

        // 2. Bot traps: a filled honeypot or an impossibly fast submit is silently "accepted".
        if (!empty($in['_honey'])) {
            return;
        }
        // `_elapsed` is milliseconds the form was open, measured in the visitor's browser
        // (so their clock being wrong cannot cause a false positive). Absent = old cached page: allow.
        if (isset($in['_elapsed']) && is_numeric($in['_elapsed'])) {
            if ((float) $in['_elapsed'] / 1000 < (float) Config::get('min_form_seconds', 3)) {
                return;
            }
        }

        // 3. Validate.
        $clean = Validator::clean(self::SCHEMA, $in);
        if (self::strlen($clean['message']) < 10) {
            throw new ApiError(422, 'validation_failed', 'Please fix the highlighted fields.', ['message' => 'Write a little more so I can help.']);
        }
        if (preg_match_all('#https?://|www\.#i', $clean['message'] . ' ' . $clean['subject']) > 3) {
            throw new ApiError(422, 'validation_failed', 'Your message looks like spam (too many links).', ['message' => 'Please remove some links.']);
        }

        // 4. Store (drop exact duplicates sent within 10 minutes, e.g. a double click).
        $fingerprint = hash('sha256', strtolower($clean['email']) . '|' . $clean['message']);
        $max = (int) Config::get('max_inquiries', 5000);
        $record = null;
        Store::update('inquiries', static function ($items) use ($clean, $fingerprint, $ipHash, $max, &$record) {
            $items = (array) $items;
            $cutoff = time() - 600;
            foreach ($items as $it) {
                if (($it['fingerprint'] ?? '') === $fingerprint && strtotime((string) ($it['createdAt'] ?? '')) > $cutoff) {
                    return $items; // duplicate: keep as is
                }
            }
            if (count($items) >= $max) {
                throw new ApiError(503, 'inbox_full', 'The inbox is full right now. Please email directly.');
            }
            $record = ['id' => Http::newId('inq')] + $clean + [
                'read' => false,
                'createdAt' => Http::nowIso(),
                'readAt' => null,
                'ipHash' => $ipHash,
                'fingerprint' => $fingerprint,
            ];
            array_unshift($items, $record); // newest first
            return $items;
        }, []);

        if ($record !== null) {
            self::notify($record);
        }
    }

    private static function strlen(string $s): int
    {
        return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
    }

    /** Best-effort e-mail alert. Never blocks or fails the visitor's submission. */
    private static function notify(array $r): void
    {
        if (!Config::get('notify_on_inquiry', true) || !function_exists('mail')) {
            return;
        }
        $settings = (array) Store::read('settings', []);
        $to = (string) ($settings['notifyEmail'] ?? '') ?: (string) ($settings['email'] ?? '');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        $host = preg_replace('/[^a-z0-9.\-]/i', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost';
        $from = (string) Config::get('mail_from', '') ?: 'no-reply@' . preg_replace('/:\d+$/', '', $host);
        if (!filter_var($from, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        // Header values never contain user-controlled newlines (Validator strips them for single-line fields).
        $clean = static function (string $s): string {
            return trim((string) preg_replace('/[\r\n]+/', ' ', $s));
        };
        $subject = '[Portfolio] ' . ($r['subject'] !== '' ? $clean($r['subject']) : 'New enquiry') . ' - ' . $clean($r['name']);
        $body = "New enquiry from your portfolio\n\n"
            . 'Name:    ' . $r['name'] . "\n"
            . 'Email:   ' . $r['email'] . "\n"
            . 'Phone:   ' . ($r['phone'] ?: '-') . "\n"
            . 'Subject: ' . ($r['subject'] ?: '-') . "\n"
            . 'Date:    ' . $r['createdAt'] . "\n\n"
            . $r['message'] . "\n\n-- Manage this in your admin dashboard.\n";
        $headers = [
            'From: ' . $from,
            'Reply-To: ' . $clean($r['email']),
            'Content-Type: text/plain; charset=UTF-8',
            'X-Mailer: portfolio-api',
        ];
        try {
            @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
        } catch (\Throwable $e) {
            error_log('[portfolio] notify mail failed: ' . $e->getMessage());
        }
    }

    // ── admin side ───────────────────────────────────────────────

    /** Fields the admin UI is allowed to see (never the fingerprint / ip hash). */
    public static function present(array $r): array
    {
        return [
            'id' => $r['id'],
            'name' => $r['name'],
            'email' => $r['email'],
            'phone' => $r['phone'] ?? '',
            'subject' => $r['subject'] ?? '',
            'message' => $r['message'],
            'read' => (bool) ($r['read'] ?? false),
            'createdAt' => $r['createdAt'],
            'readAt' => $r['readAt'] ?? null,
        ];
    }

    public static function counts(array $items): array
    {
        $read = 0;
        foreach ($items as $it) {
            if (!empty($it['read'])) {
                $read++;
            }
        }
        return ['total' => count($items), 'read' => $read, 'new' => count($items) - $read];
    }

    /** Apply ?status=all|new|read and ?q= search. */
    public static function filter(array $items, string $status, string $q): array
    {
        $q = trim(function_exists('mb_strtolower') ? mb_strtolower($q, 'UTF-8') : strtolower($q));
        return array_values(array_filter($items, static function ($it) use ($status, $q) {
            if ($status === 'new' && !empty($it['read'])) {
                return false;
            }
            if ($status === 'read' && empty($it['read'])) {
                return false;
            }
            if ($q === '') {
                return true;
            }
            $hay = ($it['name'] ?? '') . ' ' . ($it['email'] ?? '') . ' ' . ($it['phone'] ?? '') . ' ' . ($it['subject'] ?? '') . ' ' . ($it['message'] ?? '');
            $hay = function_exists('mb_strtolower') ? mb_strtolower($hay, 'UTF-8') : strtolower($hay);
            return strpos($hay, $q) !== false;
        }));
    }

    /** Streams a CSV download. Cells that start with = + - @ are prefixed so Excel cannot run them as formulas. */
    public static function exportCsv(array $items): void
    {
        $name = 'inquiries-' . gmdate('Y-m-d') . '.csv';
        header_remove('Content-Type');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Cache-Control: no-store');
        http_response_code(200);
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // BOM so Excel opens UTF-8 correctly
        $safe = static function ($v): string {
            $s = (string) $v;
            return $s !== '' && strpos("=+-@\t\r", $s[0]) !== false ? "'" . $s : $s;
        };
        fputcsv($out, ['ID', 'Status', 'Received (UTC)', 'Name', 'Email', 'Phone', 'Subject', 'Message']);
        foreach ($items as $it) {
            fputcsv($out, [
                $it['id'],
                !empty($it['read']) ? 'read' : 'new',
                $it['createdAt'],
                $safe($it['name']),
                $safe($it['email']),
                $safe($it['phone'] ?? ''),
                $safe($it['subject'] ?? ''),
                $safe($it['message']),
            ]);
        }
        fclose($out);
        exit;
    }
}
