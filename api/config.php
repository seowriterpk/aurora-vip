<?php
session_start();

// AURORA-X Base Configuration
// IMPORTANT: Access-Control-Allow-Origin: * is incompatible with credentials:include.
// For same-origin (Hostinger), we don't actually need CORS headers, but in case of
// dev proxy or subdomains, we dynamically reflect the requesting origin.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header("Access-Control-Allow-Origin: *");
}
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Define Master Password
define('MASTER_PASSWORD', 'Gary+786');

// Basic Authentication via Session
function authenticate()
{
    // Check if the user is authenticated via session
    if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized. Please log in.']);
        exit;
    }
    // CRITICAL: Release session lock immediately so Hostinger can process concurrent requests
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
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
        echo json_encode(['error' => 'Database connection failed. Please check your credentials in api/config.php']);
        exit;
    }
}
?>