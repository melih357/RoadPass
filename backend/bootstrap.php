<?php
declare(strict_types=1);

// WAMP kurulumunda mbstring kapalıysa temel ASCII uyumluluğunu korur.
if (!function_exists('mb_strlen')) {
    function mb_strlen(string $value, ?string $encoding = null): int { return strlen($value); }
}
if (!function_exists('mb_strtolower')) {
    function mb_strtolower(string $value, ?string $encoding = null): string { return strtolower($value); }
}
if (!function_exists('mb_strtoupper')) {
    function mb_strtoupper(string $value, ?string $encoding = null): string { return strtoupper($value); }
}

function loadEnv(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = array_map('trim', explode('=', $line, 2));
        $value = trim($value, "\"'");
        $_ENV[$key] = $value;
        putenv($key . '=' . $value);
    }
}

loadEnv(dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env');

function env(string $key, mixed $default = null): mixed
{
    $value = $_ENV[$key] ?? getenv($key);
    return ($value === false || $value === null || $value === '') ? $default : $value;
}

$sessionName = (string) env('SESSION_NAME', 'ROADPASS_SESSION');
session_name($sessionName);
session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax',
    'use_strict_mode' => true,
]);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

set_exception_handler(function (Throwable $exception): void {
    $debug = filter_var(env('APP_DEBUG', false), FILTER_VALIDATE_BOOL);
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Sunucu tarafında beklenmeyen bir hata oluştu.',
        'error' => $debug ? $exception->getMessage() : null,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
});
