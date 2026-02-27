<?php
require_once __DIR__ . '/config.php';
authenticate();

try {
    $db = getDb();

    // ============================================================
    // AUTO-MIGRATOR (Silently patches Hostinger DB without commands)
    // Checks if the new forensic columns exist, if not, adds them!
    // ============================================================
    try {
        $checkStmt = $db->query("SHOW COLUMNS FROM pages LIKE 'canonical_status'");
        if ($checkStmt->rowCount() === 0) {
            $migrations = [
                "ALTER TABLE pages ADD COLUMN redirect_chain_json TEXT AFTER size_bytes",
                "ALTER TABLE pages ADD COLUMN h_structure_json TEXT AFTER h2_json",
                "ALTER TABLE pages ADD COLUMN hreflang_json TEXT AFTER schema_types",
                "ALTER TABLE pages ADD COLUMN canonical_status VARCHAR(50) DEFAULT NULL AFTER canonical",
                "ALTER TABLE pages ADD COLUMN has_multiple_canonicals TINYINT(1) DEFAULT 0 AFTER canonical_status",
                "ALTER TABLE pages ADD COLUMN soft_404 TINYINT(1) DEFAULT 0 AFTER hreflang_json",
                "ALTER TABLE pages ADD COLUMN is_indexable TINYINT(1) DEFAULT 1 AFTER soft_404",
                "ALTER TABLE pages ADD COLUMN indexability_score INT DEFAULT 100 AFTER is_indexable",
                "ALTER TABLE pages ADD COLUMN form_actions_json TEXT AFTER images_oversized",
            ];
            foreach ($migrations as $sql) {
                try {
                    $db->exec($sql);
                } catch (PDOException $e) {
                }
            }
        }
    } catch (Exception $e) {
        // Ignore check failures safely
    }

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

    // Fetch issue summaries for these projects
    foreach ($projects as &$p) {
        if ($p['latest_crawl_id']) {
            $istmt = $db->prepare("SELECT severity, COUNT(*) as count FROM issues WHERE crawl_id = ? GROUP BY severity");
            $istmt->execute([$p['latest_crawl_id']]);
            $issues = ['Critical' => 0, 'High' => 0, 'Medium' => 0, 'Low' => 0];
            foreach ($istmt->fetchAll(PDO::FETCH_ASSOC) as $irow) {
                $issues[$irow['severity']] = (int) $irow['count'];
            }
            $p['issues'] = $issues;
        } else {
            $p['issues'] = null;
        }
    }
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