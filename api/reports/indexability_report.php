<?php
require_once __DIR__ . '/../config.php';
authenticate();

$crawlId = $_GET['crawl_id'] ?? 0;
if (!$crawlId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id']);
    exit;
}

try {
    $db = getDb();

    // 1. Score distribution (0-100)
    $stmt = $db->prepare("
        SELECT 
            SUM(CASE WHEN indexability_score >= 80 THEN 1 ELSE 0 END) as good,
            SUM(CASE WHEN indexability_score >= 50 AND indexability_score < 80 THEN 1 ELSE 0 END) as warning,
            SUM(CASE WHEN indexability_score < 50 THEN 1 ELSE 0 END) as poor,
            SUM(CASE WHEN is_indexable = 1 THEN 1 ELSE 0 END) as indexable,
            SUM(CASE WHEN is_indexable = 0 THEN 1 ELSE 0 END) as not_indexable,
            COUNT(*) as total
        FROM pages WHERE crawl_id = ?
    ");
    $stmt->execute([$crawlId]);
    $summary = $stmt->fetch(PDO::FETCH_ASSOC);

    // 2. Lowest indexability score pages
    $stmt = $db->prepare("
        SELECT url, indexability_score, is_indexable, canonical_status, meta_robots, soft_404, word_count, status_code
        FROM pages WHERE crawl_id = ? AND status_code = 200
        ORDER BY indexability_score ASC LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $lowestPages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Noindex pages
    $stmt = $db->prepare("
        SELECT url, meta_robots, x_robots_tag, canonical
        FROM pages WHERE crawl_id = ? AND is_indexable = 0
        ORDER BY url ASC LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $noindexPages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Soft 404 pages
    $stmt = $db->prepare("
        SELECT url, word_count, status_code
        FROM pages WHERE crawl_id = ? AND soft_404 = 1
        LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $soft404Pages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'summary' => $summary,
        'lowest_score_pages' => $lowestPages,
        'noindex_pages' => $noindexPages,
        'soft_404_pages' => $soft404Pages,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Indexability report query failed.']);
}
?>