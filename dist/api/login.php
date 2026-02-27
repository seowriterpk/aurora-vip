<?php
require_once __DIR__ . '/config.php';

// If already logged in
if (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) {
    echo json_encode(['success' => true]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$username = $data['username'] ?? '';
$password = $data['password'] ?? '';

// Check against the master credentials
if ($username === 'Admin' && $password === MASTER_PASSWORD) {
    $_SESSION['authenticated'] = true;
    echo json_encode(['success' => true]);
} else {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
}
?>