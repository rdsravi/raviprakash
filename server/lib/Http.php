<?php
declare(strict_types=1);

namespace Portfolio;

/** An error that is safe to show to API clients. */
final class ApiError extends \Exception
{
    /** @var string */
    public $errorCode;
    /** @var array */
    public $fields;
    /** @var array */
    public $headers;

    public function __construct(int $status, string $errorCode, string $message, array $fields = [], array $headers = [])
    {
        parent::__construct($message, $status);
        $this->errorCode = $errorCode;
        $this->fields = $fields;
        $this->headers = $headers;
    }
}

/**
 * Request/response helpers. Every response uses one envelope:
 *   success: { "ok": true,  "data": ... }
 *   failure: { "ok": false, "error": { "code": "...", "message": "...", "fields": {...} } }
 */
final class Http
{
    /** Call first in every endpoint. */
    public static function init(): void
    {
        ini_set('display_errors', '0');
        ini_set('log_errors', '1');
        error_reporting(E_ALL);
        date_default_timezone_set((string) Config::get('timezone', 'UTC'));

        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        header('X-Frame-Options: DENY');
        header('Cache-Control: no-store');

        set_exception_handler(static function (\Throwable $e): void {
            if ($e instanceof ApiError) {
                Http::sendError($e);
            }
            error_log('[portfolio] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            Http::sendError(new ApiError(500, 'server_error', 'Something went wrong on the server. Please try again.'));
        });
    }

    public static function method(): string
    {
        return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    }

    /** @param string[] $allowed */
    public static function allow(array $allowed): void
    {
        if (!in_array(self::method(), $allowed, true)) {
            throw new ApiError(405, 'method_not_allowed', 'Method not allowed.', [], ['Allow' => implode(', ', $allowed)]);
        }
    }

    /** @param mixed $default */
    public static function query(string $key, $default = null)
    {
        return isset($_GET[$key]) && is_string($_GET[$key]) ? $_GET[$key] : $default;
    }

    /** Parsed JSON request body (max 1 MB). */
    public static function body(): array
    {
        $len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($len > 1048576) {
            throw new ApiError(413, 'payload_too_large', 'Request body is too large.');
        }
        $raw = file_get_contents('php://input', false, null, 0, 1048577);
        if ($raw === false || $raw === '') {
            return [];
        }
        if (strlen($raw) > 1048576) {
            throw new ApiError(413, 'payload_too_large', 'Request body is too large.');
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
        }
        return $data;
    }

    public static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
            return true;
        }
        if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
            return true;
        }
        // Many shared hosts terminate TLS at a proxy.
        return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    }

    /** Best-effort visitor IP. Only honours a proxy header you explicitly configure. */
    public static function clientIp(): string
    {
        $hdr = (string) Config::get('trust_proxy_header', '');
        if ($hdr !== '' && !empty($_SERVER[$hdr])) {
            $parts = explode(',', (string) $_SERVER[$hdr]);
            $ip = trim($parts[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    /** Origin header host:port equals the Host the request was sent to. */
    public static function isSameOrigin(): bool
    {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($origin === '') {
            return true; // no Origin header: not a cross-site browser request
        }
        $host = parse_url($origin, PHP_URL_HOST);
        $port = parse_url($origin, PHP_URL_PORT);
        if (!is_string($host)) {
            return false;
        }
        $o = strtolower($host . ($port ? ':' . $port : ''));
        $h = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        // Treat default ports as equivalent.
        $strip = static function (string $v): string {
            return preg_replace('/:(80|443)$/', '', $v) ?? $v;
        };
        return $strip($o) === $strip($h);
    }

    /**
     * CORS for PUBLIC endpoints only (content feed, contact form).
     * Admin endpoints never call this, so they are not callable cross-origin.
     *
     * @return bool true if the request's Origin is allowed (or there is none / same origin)
     */
    public static function cors(): bool
    {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        header('Vary: Origin');
        if ($origin === '' || self::isSameOrigin()) {
            return true;
        }
        $allowed = Config::get('allowed_origins', []);
        $ok = is_array($allowed) && in_array(rtrim($origin, '/'), array_map(static function ($o) {
            return rtrim((string) $o, '/');
        }, $allowed), true);
        if (!$ok && Config::get('allow_localhost', false)) {
            $ok = (bool) preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin);
        }
        if ($ok) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type');
            header('Access-Control-Max-Age: 86400');
        }
        return $ok;
    }

    /** Handles CORS preflight for public endpoints. */
    public static function preflight(): void
    {
        if (self::method() !== 'OPTIONS') {
            return;
        }
        if (!self::cors()) {
            http_response_code(403);
            exit;
        }
        http_response_code(204);
        exit;
    }

    /** @param mixed $data */
    public static function json($data, int $status = 200): void
    {
        http_response_code($status);
        echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    public static function sendError(ApiError $e): void
    {
        foreach ($e->headers as $k => $v) {
            header($k . ': ' . $v);
        }
        http_response_code($e->getCode());
        $err = ['code' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->fields) {
            $err['fields'] = $e->fields;
        }
        echo json_encode(['ok' => false, 'error' => $err], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function fail(int $status, string $code, string $message, array $fields = []): void
    {
        throw new ApiError($status, $code, $message, $fields);
    }

    /** Random identifier such as "prj_k3j9x2ab". */
    public static function newId(string $prefix): string
    {
        return $prefix . '_' . bin2hex(random_bytes(5));
    }

    public static function nowIso(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }
}
