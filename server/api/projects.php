<?php
declare(strict_types=1);
// Admin CRUD for "projects". Logic lives in lib/Collection.php; schema in lib/Schemas.php.
require __DIR__ . '/../lib/bootstrap.php';
Portfolio\Collection::handle('projects');
