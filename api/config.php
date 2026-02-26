<?php
session_start();

// AURORA-X Base Configuration
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Absolute path to the SQLite database
define('DB_FILE', __DIR__ . '/aurora.sqlite');

// Define Master Password
define('MASTER_PASSWORD', 'Gary+786');

// Basic Authentication via Session
function authenticate()
{
    // Check if the user is authenticated via session
    if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
        $headers = getallheaders();
        $token = $headers['Authorization'] ?? '';

        // Fallback or explicit programmatic token for scheduled cron jobs (Worker script)
        if ($token !== 'Bearer AURORA_SECRET_2026') {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
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
        echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
        exit;
    }
}
?>