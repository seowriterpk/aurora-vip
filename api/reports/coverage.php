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

    // 1. Index Coverage Stats
    $stmt = $db->prepare("SELECT 
        SUM(CASE WHEN is_indexable = 1 AND status_code = 200 THEN 1 ELSE 0 END) as indexed,
        SUM(CASE WHEN is_indexable = 0 AND status_code = 200 THEN 1 ELSE 0 END) as excluded_noindex,
        SUM(CASE WHEN status_code >= 300 AND status_code < 400 THEN 1 ELSE 0 END) as excluded_redirect,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as excluded_error,
        SUM(CASE WHEN is_indexable = 1 AND canonical IS NOT NULL AND canonical != url THEN 1 ELSE 0 END) as excluded_canonical
        FROM pages WHERE crawl_id = ?");
    $stmt->execute([$crawlId]);
    $coverage = $stmt->fetch(PDO::FETCH_ASSOC);

    // 2. Canonical Mismatch Examples (Top 10)
    $stmt = $db->prepare("SELECT url, canonical FROM pages WHERE crawl_id = ? AND is_indexable = 1 AND canonical IS NOT NULL AND canonical != url LIMIT 10");
    $stmt->execute([$crawlId]);
    $mismatches = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Status Code Distribution
    $stmt = $db->prepare("SELECT status_code, COUNT(*) as count FROM pages WHERE crawl_id = ? GROUP BY status_code ORDER BY count DESC LIMIT 10");
    $stmt->execute([$crawlId]);
    $statusDistribution = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'coverage' => [
            'valid' => (int) $coverage['indexed'],
            'excluded' => (int) $coverage['excluded_noindex'] + (int) $coverage['excluded_redirect'] + (int) $coverage['excluded_error'] + (int) $coverage['excluded_canonical'],
            'breakdown' => [
                'noindex' => (int) $coverage['excluded_noindex'],
                'redirects' => (int) $coverage['excluded_redirect'],
                'not_found_40x' => (int) $coverage['excluded_error'],
                'alternate_page_proper_canonical' => (int) $coverage['excluded_canonical']
            ]
        ],
        'mismatches' => $mismatches,
        'status_distribution' => $statusDistribution
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>