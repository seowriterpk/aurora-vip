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

    // 1. Canonical Status Distribution
    $stmt = $db->prepare("SELECT canonical_status, COUNT(*) as count FROM pages WHERE crawl_id = ? AND canonical_status IS NOT NULL GROUP BY canonical_status");
    $stmt->execute([$crawlId]);
    $statusDist = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Pages with canonical mismatch (pointing elsewhere)
    $stmt = $db->prepare("
        SELECT p.url, p.canonical, p.canonical_status, p.status_code
        FROM pages p 
        WHERE p.crawl_id = ? AND p.canonical_status = 'mismatch'
        ORDER BY p.url ASC LIMIT 100
    ");
    $stmt->execute([$crawlId]);
    $mismatches = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Pages with multiple canonical tags
    $stmt = $db->prepare("
        SELECT url, canonical
        FROM pages 
        WHERE crawl_id = ? AND has_multiple_canonicals = 1
        LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $multiples = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Missing canonical (no self-referencing)
    $stmt = $db->prepare("
        SELECT url
        FROM pages 
        WHERE crawl_id = ? AND canonical_status = 'missing' AND status_code = 200
        LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $missing = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 5. Canonical pointing to non-200 target
    $stmt = $db->prepare("
        SELECT p1.url, p1.canonical, p2.status_code as target_status
        FROM pages p1
        LEFT JOIN pages p2 ON p1.canonical = p2.url AND p1.crawl_id = p2.crawl_id
        WHERE p1.crawl_id = ? AND p1.canonical_status = 'mismatch'
        AND (p2.status_code IS NULL OR p2.status_code >= 300)
        LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $badTargets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status_distribution' => $statusDist,
        'mismatches' => $mismatches,
        'multiples' => $multiples,
        'missing' => $missing,
        'bad_targets' => $badTargets,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Canonical audit query failed.']);
}
?>