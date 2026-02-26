<?php
require_once __DIR__ . '/config.php';
authenticate();

$crawlId = $_GET['crawl_id'] ?? 0;
$limit = $_GET['limit'] ?? 100;
$offset = $_GET['offset'] ?? 0;
$search = $_GET['search'] ?? '';

if (!$crawlId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id']);
    exit;
}

try {
    $db = getDb();

    // Base Query
    $query = "FROM pages WHERE crawl_id = :crawl_id";
    $params = [':crawl_id' => $crawlId];

    // Search Parameter
    if (!empty($search)) {
        $query .= " AND (url LIKE :search OR title LIKE :search)";
        $params[':search'] = "%$search%";
    }

    // Get Total Count
    $countStmt = $db->prepare("SELECT count(*) " . $query);
    $countStmt->execute($params);
    $totalCount = $countStmt->fetchColumn();

    // Get Paginated Data
    $dataStmt = $db->prepare("SELECT id, url, status_code, load_time_ms, size_bytes, word_count, text_ratio_percent, title, meta_desc, h1, canonical, meta_robots, is_indexable, depth, crawled_at " . $query . " ORDER BY depth ASC, id ASC LIMIT :limit OFFSET :offset");

    foreach ($params as $key => $value) {
        $dataStmt->bindValue($key, $value);
    }
    $dataStmt->bindValue(':limit', (int) $limit, PDO::PARAM_INT);
    $dataStmt->bindValue(':offset', (int) $offset, PDO::PARAM_INT);
    $dataStmt->execute();

    $pages = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'total' => $totalCount,
        'limit' => $limit,
        'offset' => $offset,
        'data' => $pages
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>