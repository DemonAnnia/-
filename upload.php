<?php
/**
 * upload.php — приём файлов материалов от залогиненных тьюторов.
 *
 * Проверяет подлинность Firebase ID-токена (без Firebase Admin SDK,
 * чисто через openssl + публичные ключи Google — бесплатно, без Blaze),
 * затем сохраняет файл в uploads/{uid}/ и возвращает прямую ссылку.
 *
 * Ожидаемый запрос от фронтенда:
 *   POST /upload.php
 *   Header: Authorization: Bearer <firebase-id-token>
 *   Body (multipart/form-data): file=<файл>
 */

// ---------- НАСТРОЙКИ (поменяй под свой проект, если понадобится) ----------
define('FIREBASE_PROJECT_ID', 'kabinet-repetitora');
define('UPLOAD_ROOT', __DIR__ . '/uploads');
define('MAX_FILE_SIZE', 20 * 1024 * 1024); // 20 МБ
define('ALLOWED_EXT', ['pdf','doc','docx','xls','xlsx','csv','ppt','pptx','png','jpg','jpeg','gif','webp','txt','zip','rar','py']);
// -----------------------------------------------------------------------

// Разрешаем запросы с любого источника (можно сузить до конкретного домена GitHub Pages позже)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond($code, $data) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function base64url_decode($data) {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

/**
 * Получает и кэширует (на 1 час) публичные ключи Google для проверки подписи токена.
 */
function getGooglePublicKeys(&$debug = null) {
    $cacheFile = sys_get_temp_dir() . '/firebase_certs_cache.json';
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 3600)) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if ($cached) return $cached;
    }
    $url = 'https://www.googleapis.com/robot/v1/metadata/x509/[email protected]';
    $json = null;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; kabinet-repetitora-upload/1.0)');
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
        $json = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($json === false || $httpCode !== 200) {
            $debug = 'curl_tried:code=' . $httpCode . ',err=' . curl_error($ch) . ',body=' . substr((string)$json, 0, 200);
            $json = null;
        }
        curl_close($ch);
    } else {
        $debug = 'curl_not_available';
    }

    // запасной вариант, если curl недоступен
    if (!$json && ini_get('allow_url_fopen')) {
        $curlDebug = $debug; // сохраняем, если curl уже что-то сообщил
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 8,
                'protocol_version' => 1.1,
                'method' => 'GET',
                'header' => "Host: www.googleapis.com\r\n" .
                            "User-Agent: Mozilla/5.0 (compatible; kabinet-repetitora-upload/1.0)\r\n" .
                            "Accept: application/json\r\n" .
                            "Connection: close\r\n",
                'ignore_errors' => true, // чтобы получить тело ответа даже при ошибке 4xx/5xx
            ],
        ]);
        $json = @file_get_contents($url, false, $ctx);
        if (isset($http_response_header)) {
            $statusLine = $http_response_header[0] ?? '';
            if (strpos($statusLine, '200') === false) {
                $debug = 'curl:[' . $curlDebug . '] fopen_http_status:' . $statusLine . '|body:' . substr((string)$json, 0, 200);
                $json = null;
            }
        } elseif (!$json) {
            $err = error_get_last();
            $debug = 'curl:[' . $curlDebug . '] fopen_error:' . ($err['message'] ?? 'unknown');
        }
    }

    if (!$json) {
        if (!$debug) $debug = 'no_curl_and_no_fopen';
        return null;
    }

    @file_put_contents($cacheFile, $json);
    return json_decode($json, true);
}

/**
 * Проверяет Firebase ID-токен полностью (подпись + обязательные поля).
 * Возвращает uid пользователя при успехе, либо null при любой проблеме.
 */
function verifyFirebaseToken($idToken, &$debug = null) {
    $parts = explode('.', $idToken);
    if (count($parts) !== 3) { $debug = 'malformed_token'; return null; }
    [$headerB64, $payloadB64, $sigB64] = $parts;

    $header = json_decode(base64url_decode($headerB64), true);
    $payload = json_decode(base64url_decode($payloadB64), true);
    $signature = base64url_decode($sigB64);
    if (!$header || !$payload || !$signature) { $debug = 'bad_decode'; return null; }

    if (($payload['aud'] ?? '') !== FIREBASE_PROJECT_ID) { $debug = 'bad_aud:' . ($payload['aud'] ?? 'none'); return null; }
    if (($payload['iss'] ?? '') !== 'https://securetoken.google.com/' . FIREBASE_PROJECT_ID) { $debug = 'bad_iss:' . ($payload['iss'] ?? 'none'); return null; }
    if (($payload['exp'] ?? 0) < time()) { $debug = 'expired:exp=' . ($payload['exp'] ?? 0) . ',now=' . time(); return null; }
    if (($payload['iat'] ?? PHP_INT_MAX) > time() + 60) { $debug = 'future_iat'; return null; }
    if (empty($payload['sub'])) { $debug = 'no_sub'; return null; }

    $kid = $header['kid'] ?? null;
    if (!$kid) { $debug = 'no_kid'; return null; }

    $certs = getGooglePublicKeys($certsDebug);
    if (!$certs) { $debug = 'certs_fetch_failed:' . ($certsDebug ?? 'unknown'); return null; }
    if (!isset($certs[$kid])) { $debug = 'kid_not_found:' . $kid; return null; }

    $publicKey = openssl_pkey_get_public($certs[$kid]);
    if (!$publicKey) { $debug = 'openssl_pkey_get_public_failed'; return null; }

    $signedData = $headerB64 . '.' . $payloadB64;
    $ok = openssl_verify($signedData, $signature, $publicKey, OPENSSL_ALGO_SHA256);
    if ($ok !== 1) { $debug = 'signature_invalid:ok=' . var_export($ok, true); return null; }

    return $payload['sub']; // это и есть uid тьютора
}

// ---------- 1. Проверяем авторизацию ----------
$headers = function_exists('getallheaders') ? getallheaders() : [];
$authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^Bearer\s+(.+)$/', trim($authHeader), $m)) {
    respond(401, ['error' => 'Нет токена авторизации']);
}
$uid = verifyFirebaseToken($m[1], $debugReason);
if (!$uid) {
    respond(401, ['error' => 'Токен недействителен или истёк. Перезайдите в кабинет и попробуйте снова.', 'debug' => $debugReason]);
}

// ---------- 2. Проверяем файл ----------
if (!isset($_FILES['file'])) {
    respond(400, ['error' => 'Файл не передан']);
}
$file = $_FILES['file'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    respond(400, ['error' => 'Ошибка при загрузке файла (код ' . $file['error'] . ')']);
}
if ($file['size'] > MAX_FILE_SIZE) {
    respond(400, ['error' => 'Файл слишком большой — максимум 20 МБ']);
}

$origName = $file['name'];
$ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
if (!in_array($ext, ALLOWED_EXT, true)) {
    respond(400, ['error' => 'Недопустимый тип файла: .' . $ext]);
}

// ---------- 3. Сохраняем файл в папку, привязанную к uid ----------
$safeUid = preg_replace('/[^a-zA-Z0-9]/', '', $uid); // на всякий случай чистим uid от посторонних символов
$safeBase = preg_replace('/[^a-zA-Zа-яА-Я0-9_\-]/u', '_', pathinfo($origName, PATHINFO_FILENAME));
$materialId = bin2hex(random_bytes(6));
$fileName = $materialId . '-' . $safeBase . '.' . $ext;

$userDir = UPLOAD_ROOT . '/' . $safeUid;
if (!is_dir($userDir)) {
    if (!mkdir($userDir, 0755, true) && !is_dir($userDir)) {
        respond(500, ['error' => 'Не удалось создать папку для файлов']);
    }
}

$destPath = $userDir . '/' . $fileName;
if (!move_uploaded_file($file['tmp_name'], $destPath)) {
    respond(500, ['error' => 'Не удалось сохранить файл на сервере']);
}

// ---------- 4. Отдаём прямую ссылку ----------
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'];
$publicUrl = $protocol . '://' . $host . '/uploads/' . rawurlencode($safeUid) . '/' . rawurlencode($fileName);

respond(200, [
    'success'    => true,
    'materialId' => $materialId,
    'fileName'   => $origName,
    'url'        => $publicUrl,
]);
