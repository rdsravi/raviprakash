<?php
declare(strict_types=1);
// Health check: GET /api/  ->  {"ok":true,"data":{"service":"portfolio-api",...}}
require __DIR__ . '/../lib/bootstrap.php';

use Portfolio\Http;

Http::init();
Http::cors();
Http::preflight();
Http::allow(['GET', 'HEAD']);
Http::json(['service' => 'portfolio-api', 'version' => '1.0.0']);
