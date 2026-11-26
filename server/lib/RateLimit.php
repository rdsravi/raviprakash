<?php
declare(strict_types=1);

namespace Portfolio;

/**
 * Sliding-window rate limiter backed by data/ratelimit.json.
 * Keys are HMAC-hashed IPs, so no raw addresses are stored.
 */
final class RateLimit
{
    /** Remove expired hits and empty buckets. */
    private static function prune(array $all, int $now): array
    {
        foreach ($all as $k => $hits) {
            $hits = array_values(array_filter((array) $hits, static function ($t) use ($now) {
                return is_array($t) ? false : ($now - (int) $t) < 86400;
            }));
            if ($hits) {
                $all[$k] = $hits;
            } else {
                unset($all[$k]);
            }
        }
        return $all;
    }

    /**
     * Seconds the caller must wait, or 0 if under the limit.
     * Does NOT record a hit; use record() for that.
     */
    public static function retryAfter(string $bucket, string $key, int $limit, int $windowSec): int
    {
        $all = (array) Store::read('ratelimit', []);
        $hits = (array) ($all[$bucket . ':' . $key] ?? []);
        $now = time();
        $recent = array_values(array_filter($hits, static function ($t) use ($now, $windowSec) {
            return ($now - (int) $t) < $windowSec;
        }));
        if (count($recent) < $limit) {
            return 0;
        }
        sort($recent);
        $oldestRelevant = $recent[count($recent) - $limit];
        return max(1, $windowSec - ($now - (int) $oldestRelevant));
    }

    public static function record(string $bucket, string $key): void
    {
        $now = time();
        Store::update('ratelimit', static function ($all) use ($bucket, $key, $now) {
            $all = self::prune((array) $all, $now);
            $all[$bucket . ':' . $key][] = $now;
            return $all;
        }, []);
    }

    public static function clear(string $bucket, string $key): void
    {
        Store::update('ratelimit', static function ($all) use ($bucket, $key) {
            $all = (array) $all;
            unset($all[$bucket . ':' . $key]);
            return $all;
        }, []);
    }

    /** Throws a 429 ApiError if the limit is exceeded. */
    public static function enforce(string $bucket, string $key, int $limit, int $windowSec, string $message): void
    {
        $wait = self::retryAfter($bucket, $key, $limit, $windowSec);
        if ($wait > 0) {
            throw new ApiError(429, 'rate_limited', $message, [], ['Retry-After' => (string) $wait]);
        }
    }
}
