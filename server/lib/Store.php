<?php
declare(strict_types=1);

namespace Portfolio;

/**
 * Tiny JSON-file database.
 *
 *  - read()   : lock-free. Safe because writes replace the file atomically (rename).
 *  - update() : takes an exclusive lock, reads the current value, hands it to your
 *               callback, then writes the result to a temp file and renames it over
 *               the original. Concurrent writers queue on the lock, so no update is lost
 *               and a crash can never leave a half-written file.
 */
final class Store
{
    private static function dir(): string
    {
        $dir = rtrim((string) Config::get('data_dir'), '/\\');
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new \RuntimeException('Data directory is missing and could not be created.');
        }
        return $dir;
    }

    public static function path(string $name): string
    {
        if (!preg_match('/^[a-z0-9_-]{1,40}$/', $name)) {
            throw new \InvalidArgumentException('Bad store name.');
        }
        return self::dir() . '/' . $name . '.json';
    }

    /**
     * @param mixed $default value returned when the file does not exist yet
     * @return mixed
     */
    public static function read(string $name, $default = [])
    {
        $file = self::path($name);
        if (!is_file($file)) {
            // First run: fall back to the starter content shipped in server/seed/.
            // The live file in data/ is created on the first admin save, so redeploying
            // the code never overwrites content you have edited.
            $seed = dirname(__DIR__) . '/seed/' . $name . '.json';
            if (!is_file($seed)) {
                return $default;
            }
            $file = $seed;
        }
        $raw = @file_get_contents($file);
        if ($raw === false || trim($raw) === '') {
            return $default;
        }
        $data = json_decode($raw, true);
        if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
            error_log('[portfolio] corrupt JSON in ' . $file);
            throw new \RuntimeException('Stored data is unreadable.');
        }
        return $data;
    }

    /**
     * Read-modify-write under an exclusive lock.
     *
     * @param callable $fn  function ($current): $new  (throw to abort without writing)
     * @param mixed $default value used as $current when the file does not exist yet
     * @return mixed the value that was written
     */
    public static function update(string $name, callable $fn, $default = [])
    {
        $file = self::path($name);
        $lockFile = $file . '.lock';
        $lock = fopen($lockFile, 'c');
        if ($lock === false) {
            throw new \RuntimeException('Cannot open lock file.');
        }
        try {
            if (!flock($lock, LOCK_EX)) {
                throw new \RuntimeException('Cannot lock data file.');
            }
            $current = self::read($name, $default);
            $new = $fn($current);

            $json = json_encode($new, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
            $tmp = $file . '.tmp.' . bin2hex(random_bytes(4));
            if (file_put_contents($tmp, $json, LOCK_EX) === false) {
                @unlink($tmp);
                throw new \RuntimeException('Cannot write data file.');
            }
            @chmod($tmp, 0640);
            if (!@rename($tmp, $file)) {
                // Windows cannot rename over an existing file.
                @unlink($file);
                if (!@rename($tmp, $file)) {
                    @unlink($tmp);
                    throw new \RuntimeException('Cannot replace data file.');
                }
            }
            return $new;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** Overwrite a whole file (still locked + atomic). @param mixed $value */
    public static function write(string $name, $value): void
    {
        self::update($name, static function () use ($value) {
            return $value;
        });
    }

    /** Server-side secret used to hash IPs. Created on first use, never leaves the server. */
    public static function secret(): string
    {
        $file = self::dir() . '/secret.key';
        if (!is_file($file)) {
            $key = bin2hex(random_bytes(32));
            // 'x' mode: fails if another request created it first, then we just read theirs.
            $fh = @fopen($file, 'x');
            if ($fh) {
                fwrite($fh, $key);
                fclose($fh);
                @chmod($file, 0600);
            }
        }
        $v = trim((string) @file_get_contents($file));
        if ($v === '') {
            throw new \RuntimeException('Secret key unreadable.');
        }
        return $v;
    }

    public static function hashIp(string $ip): string
    {
        return substr(hash_hmac('sha256', $ip, self::secret()), 0, 20);
    }
}
