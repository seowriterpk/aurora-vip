<?php
require_once __DIR__ . '/config.php';
authenticate();

$crawlId = $_GET['crawl_id'] ?? 0;

if (!$crawlId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id']);
    exit;
}

try {
    $db = getDb();

    // Fetch last 50 logs for this crawl
    $stmt = $db->prepare("SELECT type, message, created_at FROM crawl_logs WHERE crawl_id = ? ORDER BY id DESC LIMIT 50");
    $stmt->execute([$crawlId]);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Reverse them so chronological is top-down in terminal
    echo json_encode(['logs' => array_reverse($logs)]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'The engine encountered a background database error while fetching logs.']);
}
?>