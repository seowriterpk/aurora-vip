<?php
require_once __DIR__ . '/config.php';
authenticate();

$data = json_decode(file_get_contents('php://input'), true);
$action = $data['action'] ?? '';
$crawlId = $data['crawl_id'] ?? 0;

if (!$crawlId || !in_array($action, ['PAUSE', 'RESUME', 'STOP', 'DELETE'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid action or missing crawl_id']);
    exit;
}

try {
    $db = getDb();

    if ($action === 'DELETE') {
        // RISK 18 FIX: Delete child rows in chunks FIRST to prevent 5-15s DB lock
        // CASCADE delete on 500K+ child rows causes a massive single transaction
        // Solution: delete in 10K-row chunks, then delete the parent
        $childTables = ['links', 'crawl_queue', 'issues', 'crawl_logs', 'pages'];

        // First get the crawl's ID to target child tables
        foreach ($childTables as $table) {
            $deleted = 1;
            while ($deleted > 0) {
                $chunkStmt = $db->prepare("DELETE FROM $table WHERE crawl_id = ? LIMIT 10000");
                $chunkStmt->execute([$crawlId]);
                $deleted = $chunkStmt->rowCount();
            }
        }

        // Now delete the crawl record itself (all children already gone)
        $stmt = $db->prepare("DELETE FROM crawls WHERE id = ?");
        $stmt->execute([$crawlId]);
        echo json_encode(['success' => true, 'message' => "Crawl #$crawlId fully deleted from memory."]);
    } else {
        // Handle PAUSE, RESUME, STOP
        // Map abstract actions to actual DB status
        $statusMap = [
            'PAUSE' => 'PAUSED',
            'RESUME' => 'RUNNING',
            'STOP' => 'COMPLETED' // Forced stop marks it completed so we can still view partial data
        ];

        $newStatus = $statusMap[$action];

        $stmt = $db->prepare("UPDATE crawls SET status = ? WHERE id = ?");
        $stmt->execute([$newStatus, $crawlId]);

        // Log the action
        $logStmt = $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'INFO', ?)");
        $logStmt->execute([$crawlId, "User manually triggered $action command. System state is now $newStatus."]);

        echo json_encode(['success' => true, 'message' => "Crawl #$crawlId state changed to $newStatus."]);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'The engine encountered a background database error while attempting to modify the project state.']);
}
?>