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

    // 1. Duplicate Titles
    $stmt = $db->prepare("
        SELECT title, COUNT(*) as count, GROUP_CONCAT(url SEPARATOR '|||') as urls
        FROM pages WHERE crawl_id = ? AND title IS NOT NULL AND title != ''
        GROUP BY title HAVING count > 1
        ORDER BY count DESC LIMIT 30
    ");
    $stmt->execute([$crawlId]);
    $dupTitles = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($dupTitles as &$row) {
        $row['urls'] = explode('|||', $row['urls']);
    }

    // 2. Duplicate Meta Descriptions
    $stmt = $db->prepare("
        SELECT meta_desc, COUNT(*) as count, GROUP_CONCAT(url SEPARATOR '|||') as urls
        FROM pages WHERE crawl_id = ? AND meta_desc IS NOT NULL AND meta_desc != ''
        GROUP BY meta_desc HAVING count > 1
        ORDER BY count DESC LIMIT 30
    ");
    $stmt->execute([$crawlId]);
    $dupMetas = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($dupMetas as &$row) {
        $row['urls'] = explode('|||', $row['urls']);
    }

    // 3. Thin Content Pages (word_count < 100)
    $stmt = $db->prepare("
        SELECT url, word_count, text_ratio_percent, title
        FROM pages WHERE crawl_id = ? AND status_code = 200 AND word_count < 100
        ORDER BY word_count ASC LIMIT 50
    ");
    $stmt->execute([$crawlId]);
    $thinPages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Near-Duplicate Content (same SimHash)
    $stmt = $db->prepare("
        SELECT content_hash, COUNT(*) as count, GROUP_CONCAT(url SEPARATOR '|||') as urls
        FROM pages WHERE crawl_id = ? AND content_hash IS NOT NULL AND content_hash != '' AND content_hash != '0'
        GROUP BY content_hash HAVING count > 1
        ORDER BY count DESC LIMIT 20
    ");
    $stmt->execute([$crawlId]);
    $nearDupes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($nearDupes as &$row) {
        $row['urls'] = explode('|||', $row['urls']);
    }

    // 5. Summary stats
    $stmt = $db->prepare("SELECT COUNT(*) FROM pages WHERE crawl_id = ? AND status_code = 200");
    $stmt->execute([$crawlId]);
    $totalPages = $stmt->fetchColumn();

    echo json_encode([
        'total_pages' => (int) $totalPages,
        'duplicate_titles' => $dupTitles,
        'duplicate_metas' => $dupMetas,
        'thin_pages' => $thinPages,
        'near_duplicates' => $nearDupes,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Content audit query failed.']);
}
?>