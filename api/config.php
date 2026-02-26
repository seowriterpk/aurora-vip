<?php
// AURORA-X Base Configuration
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Absolute path to the SQLite database
define('DB_FILE', __DIR__ . '/aurora.sqlite');

// Basic Authentication
function authenticate()
{
    $headers = getallheaders();
    $token = $headers['Authorization'] ?? '';
    // This is a basic static token for local/shared-hosting protection.
    // In production, pass 'Bearer AURORA_SECRET_2026' from your frontend request.
    if ($token !== 'Bearer AURORA_SECRET_2026') {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

function getDb()
{
    $host = '127.0.0.1';
    $db = 'u824913874_aurora';
    $user = 'u824913874_aurora';
    $pass = 'aurora-L!5deXu&IYI';
    $charset = 'utf8mb4';

    $dsn = "mysql:host=$host;dbname=$db;charset=$charset";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    try {
        return new PDO($dsn, $user, $pass, $options);
    } catch (\PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
        exit;
    }
}
?>