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

    // 1. Crawl Depth Distribution
    $stmt = $db->prepare("SELECT depth, COUNT(*) as count FROM pages WHERE crawl_id = ? GROUP BY depth ORDER BY depth ASC");
    $stmt->execute([$crawlId]);
    $depthDistribution = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. True Orphan Pages (Cross-referenced from XML Sitemap)
    // We now fetch these directly from the `issues` table populated by `sitemap_parser.php`
    $stmt = $db->prepare("
        SELECT message as url 
        FROM issues 
        WHERE crawl_id = ? AND type = 'orphan_page'
        ORDER BY id DESC
        LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $lowLinkedPages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Broken Internal Links (Links pointing to non-200 pages)
    $stmt = $db->prepare("
        SELECT l.source_url, l.target_url, p.status_code 
        FROM links l
        JOIN pages p ON l.target_url = p.url AND l.crawl_id = p.crawl_id
        WHERE l.crawl_id = ? AND l.is_external = 0 AND p.status_code != 200
        LIMIT 20
    ");
    $stmt->execute([$crawlId]);
    $brokenInternalLinks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Case-Sensitive Slug Mismatches (Links with uppercase in URL paths)
    $stmt = $db->prepare("
        SELECT source_url, target_url 
        FROM links 
        WHERE crawl_id = ? AND is_external = 0 
        AND target_url COLLATE utf8mb4_bin REGEXP '[A-Z]'
        LIMIT 10
    ");
    $stmt->execute([$crawlId]);
    $caseIssues = $stmt->fetchAll(PDO::FETCH_ASSOC);


    echo json_encode([
        'depth_distribution' => $depthDistribution,
        'low_linked_pages' => $lowLinkedPages,
        'broken_internal_links' => $brokenInternalLinks,
        'case_issues' => $caseIssues
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'The engine encountered a background database error while crunching site architecture insights.']);
}
?>