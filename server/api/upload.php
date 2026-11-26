<?php
declare(strict_types=1);
/**
 * Admin media library.
 *   GET                       -> list uploaded files
 *   POST (multipart "file")   -> upload an image or PDF
 *   DELETE ?name=<file>       -> delete an uploaded file
 */
require __DIR__ . '/../lib/bootstrap.php';

use Portfolio\Auth;
use Portfolio\Http;
use Portfolio\Uploads;

Http::init();
Http::allow(['GET', 'POST', 'DELETE']);
Auth::require(Http::method() !== 'GET');

switch (Http::method()) {
    case 'GET':
        Http::json(['files' => Uploads::listFiles()]);
        break;
    case 'POST':
        if (!isset($_FILES['file'])) {
            Http::fail(400, 'upload_failed', 'Choose a file to upload.');
        }
        Http::json(Uploads::save($_FILES['file']), 201);
        break;
    case 'DELETE':
        Uploads::delete((string) Http::query('name', ''));
        Http::json(['deleted' => Http::query('name')]);
        break;
}
