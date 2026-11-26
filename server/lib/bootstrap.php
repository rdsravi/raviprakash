<?php
declare(strict_types=1);

/**
 * Loads every library class. Each endpoint in api/ starts with:
 *     require __DIR__ . '/../lib/bootstrap.php';
 */
require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Store.php';
require_once __DIR__ . '/RateLimit.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Validator.php';
require_once __DIR__ . '/Schemas.php';
require_once __DIR__ . '/Collection.php';
require_once __DIR__ . '/Inquiries.php';
require_once __DIR__ . '/Uploads.php';
