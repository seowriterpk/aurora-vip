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

    // 1. Pages with most missing alt images
    $stmt = $db->prepare("
        SELECT url, images_count, images_missing_alt
        FROM pages WHERE crawl_id = ? AND images_missing_alt > 0
        ORDER BY images_missing_alt DESC LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $missingAltPages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Individual images missing alt
    $stmt = $db->prepare("
        SELECT i.src, i.alt, i.format, i.has_lazy_loading, p.url as page_url
        FROM images i
        JOIN pages p ON i.page_id = p.id AND i.crawl_id = p.crawl_id
        WHERE i.crawl_id = ? AND (i.alt IS NULL OR i.alt = '')
        LIMIT 100
    ");
    $stmt->execute([$crawlId]);
    $missingAltImages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Images without lazy loading
    $stmt = $db->prepare("
        SELECT COUNT(*) as total, SUM(CASE WHEN has_lazy_loading = 1 THEN 1 ELSE 0 END) as lazy,
               SUM(CASE WHEN has_lazy_loading = 0 THEN 1 ELSE 0 END) as not_lazy
        FROM images WHERE crawl_id = ?
    ");
    $stmt->execute([$crawlId]);
    $lazyStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 4. Image format distribution
    $stmt = $db->prepare("
        SELECT format, COUNT(*) as count
        FROM images WHERE crawl_id = ? AND format IS NOT NULL
        GROUP BY format ORDER BY count DESC
    ");
    $stmt->execute([$crawlId]);
    $formatDist = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 5. Summary
    $stmt = $db->prepare("SELECT SUM(images_count) as total, SUM(images_missing_alt) as missing_alt FROM pages WHERE crawl_id = ?");
    $stmt->execute([$crawlId]);
    $summary = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'summary' => [
            'total_images' => (int) ($summary['total'] ?? 0),
            'missing_alt' => (int) ($summary['missing_alt'] ?? 0),
            'lazy_loading' => $lazyStats,
        ],
        'format_distribution' => $formatDist,
        'pages_with_missing_alt' => $missingAltPages,
        'images_missing_alt' => $missingAltImages,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Image audit query failed.']);
}
?>