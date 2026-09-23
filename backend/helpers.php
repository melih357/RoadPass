<?php
declare(strict_types=1);

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestData(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($contentType, 'application/json')) {
        $decoded = json_decode(file_get_contents('php://input') ?: '{}', true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function requireMethod(string ...$allowed): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, $allowed, true)) {
        jsonResponse(['success' => false, 'message' => 'Bu işlem için HTTP metodu desteklenmiyor.'], 405);
    }
}

function currentUserId(): ?int
{
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

function requireAuth(): int
{
    $userId = currentUserId();
    if (!$userId) {
        jsonResponse(['success' => false, 'message' => 'Bu işlem için giriş yapmalısınız.'], 401);
    }
    return $userId;
}

function validateEmail(string $email): bool
{
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

function normalizePlateCompact(string $plate): string
{
    $plate = mb_strtoupper(trim($plate), 'UTF-8');
    return preg_replace('/[^A-Z0-9]/u', '', $plate) ?? '';
}

function validateTurkishPlate(string $plate): bool
{
    $compact = normalizePlateCompact($plate);
    return preg_match('/^(0[1-9]|[1-7][0-9]|8[01])[A-Z]{1,3}[0-9]{2,4}$/', $compact) === 1;
}

function formatTurkishPlate(string $plate): string
{
    $compact = normalizePlateCompact($plate);
    if (!preg_match('/^(0[1-9]|[1-7][0-9]|8[01])([A-Z]{1,3})([0-9]{2,4})$/', $compact, $matches)) {
        return mb_strtoupper(trim($plate), 'UTF-8');
    }
    return $matches[1] . ' ' . $matches[2] . ' ' . $matches[3];
}

function normalizeHgsTag(string $tag): string
{
    $tag = mb_strtoupper(trim($tag), 'UTF-8');
    return preg_replace('/\s+/', '', $tag) ?? '';
}

function validateHgsTag(string $tag): bool
{
    if ($tag === '') {
        return true;
    }
    $min = (int) env('HGS_TAG_MIN_LENGTH', 6);
    $max = (int) env('HGS_TAG_MAX_LENGTH', 32);
    $length = mb_strlen($tag, 'UTF-8');
    return $length >= $min && $length <= $max && preg_match('/^[A-Z0-9-]+$/', $tag) === 1;
}

function money(float $amount): string
{
    return number_format($amount, 2, ',', '.') . ' ₺';
}

function boolEnv(string $key, bool $default = false): bool
{
    return filter_var(env($key, $default), FILTER_VALIDATE_BOOL);
}

function randomReference(string $prefix = 'RP'): string
{
    return $prefix . '-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function postJsonRequest(string $url, array $payload, array $headers = [], int $timeout = 25): array
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('PHP cURL eklentisi etkin değil. WAMP PHP Extensions menüsünden php_curl eklentisini açın.');
    }

    $curl = curl_init($url);
    $httpHeaders = ['Content-Type: application/json'];
    foreach ($headers as $name => $value) {
        $httpHeaders[] = $name . ': ' . $value;
    }

    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $httpHeaders,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 8,
    ]);

    $body = curl_exec($curl);
    $curlError = curl_error($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($body === false) {
        throw new RuntimeException('Harici servis bağlantısı başarısız: ' . $curlError);
    }

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Harici servis geçersiz JSON yanıtı döndürdü.');
    }

    if ($status < 200 || $status >= 300) {
        $message = $decoded['error']['message'] ?? $decoded['message'] ?? ('HTTP ' . $status);
        throw new RuntimeException('Harici servis hatası: ' . $message);
    }

    return $decoded;
}

function userLanguage(PDO $pdo, int $userId): string
{
    $stmt = $pdo->prepare('SELECT language FROM user_settings WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    return $stmt->fetchColumn() === 'en' ? 'en' : 'tr';
}

function localized(string $tr, string $en, string $language): string
{
    return $language === 'en' ? $en : $tr;
}

function activeSubscription(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare('SELECT s.id, s.status, s.starts_at, s.ends_at, s.cancelled_at, s.auto_renew, s.payment_method_id, s.is_demo, p.id AS plan_id, p.code, p.name_tr, p.name_en, p.billing_period, p.price, p.currency, pm.card_brand, pm.card_last4 FROM subscriptions s JOIN premium_plans p ON p.id=s.plan_id LEFT JOIN payment_methods pm ON pm.id=s.payment_method_id WHERE s.user_id=? AND s.status IN ("active","trial") AND s.ends_at > NOW() ORDER BY s.ends_at DESC LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function validateLuhn(string $number): bool
{
    $digits = preg_replace('/\D+/', '', $number) ?? '';
    if (strlen($digits) < 13 || strlen($digits) > 19) {
        return false;
    }
    $sum = 0;
    $double = false;
    for ($i = strlen($digits) - 1; $i >= 0; $i--) {
        $digit = (int) $digits[$i];
        if ($double) {
            $digit *= 2;
            if ($digit > 9) $digit -= 9;
        }
        $sum += $digit;
        $double = !$double;
    }
    return $sum % 10 === 0;
}

function detectCardBrand(string $number): string
{
    $digits = preg_replace('/\D+/', '', $number) ?? '';
    if (preg_match('/^4/', $digits)) return 'Visa';
    if (preg_match('/^(5[1-5]|2[2-7])/', $digits)) return 'Mastercard';
    if (preg_match('/^3[47]/', $digits)) return 'Amex';
    return 'Card';
}

function validateCardExpiry(string $expiry): ?array
{
    if (!preg_match('/^(0[1-9]|1[0-2])\/(\d{2})$/', trim($expiry), $m)) return null;
    $month = (int) $m[1];
    $year = 2000 + (int) $m[2];
    $expiresAt = DateTimeImmutable::createFromFormat('!Y-n-j H:i:s', $year . '-' . $month . '-1 00:00:00');
    if (!$expiresAt) return null;
    $expiresAt = $expiresAt->modify('last day of this month 23:59:59');
    if ($expiresAt < new DateTimeImmutable('now')) return null;
    return ['month' => $month, 'year' => $year];
}
