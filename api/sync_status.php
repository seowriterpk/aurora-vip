<?php
require_once __DIR__ . '/config.php';
authenticate();

try {
    $db = getDb();

    // Fetch all projects with their latest crawl status
    $stmt = $db->query("
        SELECT p.id as project_id, p.domain, p.created_at, 
               c.id as latest_crawl_id, c.status, c.urls_crawled, c.started_at, c.ended_at
        FROM projects p
        LEFT JOIN crawls c ON c.id = (
            SELECT id FROM crawls WHERE project_id = p.id ORDER BY id DESC LIMIT 1
        )
        ORDER BY p.created_at DESC
    ");

    $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Provide detailed status if a specific crawl is requested
    $detail = [];
    if (isset($_GET['crawl_id'])) {
        $crawlId = (int) $_GET['crawl_id'];

        $cStmt = $db->prepare("SELECT * FROM crawls WHERE id = ?");
        $cStmt->execute([$crawlId]);
        $detail['crawl'] = $cStmt->fetch(PDO::FETCH_ASSOC);

        $qStmt = $db->prepare("SELECT status, count(*) as count FROM crawl_queue WHERE crawl_id = ? GROUP BY status");
        $qStmt->execute([$crawlId]);

        $queueStats = ['total' => 0, 'PENDING' => 0, 'PROCESSING' => 0, 'CRAWLED' => 0, 'ERROR' => 0];
        foreach ($qStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $queueStats[$row['status']] = $row['count'];
            $queueStats['total'] += $row['count'];
        }
        $detail['queue'] = $queueStats;
    }

    echo json_encode([
        'projects' => $projects,
        'detail' => $detail
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'The engine encountered a background database error while synchronizing the project list.']);
}
?>