<?php
declare(strict_types=1);

namespace Portfolio;

/**
 * Admin-only file uploads (images and a PDF CV).
 *
 * Safety rules:
 *  - type is decided by inspecting the file's bytes (finfo), never by its name or the browser's claim
 *  - the stored name is random and the extension comes from the detected type
 *  - raster images are decoded and re-encoded with GD when available (drops EXIF/GPS and hidden payloads)
 *  - uploads/.htaccess switches PHP off in that folder as a second line of defence
 */
final class Uploads
{
    private const TYPES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'application/pdf' => 'pdf',
    ];

    public static function dir(): string
    {
        $dir = rtrim((string) Config::get('uploads_dir'), '/\\');
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Uploads directory is missing and could not be created.');
        }
        return $dir;
    }

    /** Public URL prefix for uploaded files, without trailing slash. */
    public static function baseUrl(): string
    {
        $cfg = rtrim((string) Config::get('uploads_url', ''), '/');
        if ($cfg !== '') {
            return $cfg;
        }
        $scheme = Http::isHttps() ? 'https' : 'http';
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
        // /something/api/upload.php -> /something
        $base = rtrim(str_replace('\\', '/', dirname(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/x.php')))), '/');
        return $scheme . '://' . $host . $base . '/uploads';
    }

    /** @return array{name:string,url:string,size:int,mime:string} */
    public static function save(array $file): array
    {
        if (!isset($file['error']) || is_array($file['error'])) {
            Http::fail(400, 'upload_failed', 'No file was received.');
        }
        switch ($file['error']) {
            case UPLOAD_ERR_OK:
                break;
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                Http::fail(413, 'file_too_large', 'That file is larger than the server allows.');
                break;
            case UPLOAD_ERR_NO_FILE:
                Http::fail(400, 'upload_failed', 'No file was received.');
                break;
            default:
                Http::fail(500, 'upload_failed', 'The upload failed. Please try again.');
        }
        $maxBytes = (int) Config::get('max_upload_mb', 8) * 1048576;
        if (!is_uploaded_file($file['tmp_name'])) {
            Http::fail(400, 'upload_failed', 'Invalid upload.');
        }
        if ((int) $file['size'] > $maxBytes || (int) $file['size'] <= 0) {
            Http::fail(413, 'file_too_large', 'Files can be at most ' . (int) Config::get('max_upload_mb', 8) . ' MB.');
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file($file['tmp_name']);
        if (!isset(self::TYPES[$mime])) {
            Http::fail(415, 'unsupported_type', 'Only JPG, PNG, WebP, GIF images or a PDF are allowed.');
        }
        $ext = self::TYPES[$mime];
        $dest = self::dir() . '/' . bin2hex(random_bytes(8)) . '.' . $ext;

        if ($mime === 'application/pdf') {
            $head = (string) file_get_contents($file['tmp_name'], false, null, 0, 5);
            if ($head !== '%PDF-') {
                Http::fail(415, 'unsupported_type', 'That file is not a valid PDF.');
            }
            if (!move_uploaded_file($file['tmp_name'], $dest)) {
                Http::fail(500, 'upload_failed', 'Could not save the file.');
            }
        } else {
            $info = @getimagesize($file['tmp_name']);
            if ($info === false || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 60000000) {
                Http::fail(415, 'unsupported_type', 'That image could not be read.');
            }
            if ($mime !== 'image/gif' && function_exists('imagecreatefromstring')) {
                self::reencode($file['tmp_name'], $dest, $mime, (int) $info[0], (int) $info[1]);
            } elseif (!move_uploaded_file($file['tmp_name'], $dest)) {
                Http::fail(500, 'upload_failed', 'Could not save the file.');
            }
        }
        @chmod($dest, 0644);

        return [
            'name' => basename($dest),
            'url' => self::baseUrl() . '/' . basename($dest),
            'size' => (int) filesize($dest),
            'mime' => $mime,
        ];
    }

    /** Decode and re-encode, shrinking anything wider/taller than 1800px. */
    private static function reencode(string $src, string $dest, string $mime, int $w, int $h): void
    {
        $img = @imagecreatefromstring((string) file_get_contents($src));
        if ($img === false) {
            Http::fail(415, 'unsupported_type', 'That image could not be read.');
        }
        $max = 1800;
        if ($w > $max || $h > $max) {
            $k = $max / max($w, $h);
            $nw = max(1, (int) round($w * $k));
            $nh = max(1, (int) round($h * $k));
            $resized = imagecreatetruecolor($nw, $nh);
            if ($mime === 'image/png' || $mime === 'image/webp') {
                imagealphablending($resized, false);
                imagesavealpha($resized, true);
            }
            imagecopyresampled($resized, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
            imagedestroy($img);
            $img = $resized;
        }
        if ($mime === 'image/png') {
            imagealphablending($img, false);
            imagesavealpha($img, true);
            $ok = imagepng($img, $dest, 6);
        } elseif ($mime === 'image/webp' && function_exists('imagewebp')) {
            $ok = imagewebp($img, $dest, 85);
        } else {
            $ok = imagejpeg($img, $dest, 86);
        }
        imagedestroy($img);
        if (!$ok) {
            Http::fail(500, 'upload_failed', 'Could not save the image.');
        }
    }

    /** @return array<int,array{name:string,url:string,size:int,mime:string,modified:string}> newest first */
    public static function listFiles(): array
    {
        $out = [];
        $base = self::baseUrl();
        foreach ((array) glob(self::dir() . '/*') as $path) {
            if (!is_file($path)) {
                continue;
            }
            $name = basename($path);
            if (!preg_match('/^[a-f0-9]{16}\.(jpg|png|webp|gif|pdf)$/', $name)) {
                continue; // only files this uploader created
            }
            $ext = pathinfo($name, PATHINFO_EXTENSION);
            $mime = (string) array_search($ext, self::TYPES, true);
            $out[] = [
                'name' => $name,
                'url' => $base . '/' . $name,
                'size' => (int) filesize($path),
                'mime' => $mime,
                'modified' => gmdate('Y-m-d\TH:i:s\Z', (int) filemtime($path)),
            ];
        }
        usort($out, static function ($a, $b) {
            return strcmp($b['modified'], $a['modified']);
        });
        return $out;
    }

    public static function delete(string $name): void
    {
        if (!preg_match('/^[a-f0-9]{16}\.(jpg|png|webp|gif|pdf)$/', $name)) {
            Http::fail(400, 'bad_name', 'Invalid file name.');
        }
        $path = self::dir() . '/' . $name;
        if (!is_file($path)) {
            Http::fail(404, 'not_found', 'That file no longer exists.');
        }
        @unlink($path);
    }
}
