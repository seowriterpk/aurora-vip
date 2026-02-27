<?php
/**
 * Issues Report — Paginated, filterable list of all auto-detected SEO issues
 */
require_once __DIR__ . '/../config.php';
authenticate();

$crawlId = $_GET['crawl_id'] ?? 0;
$severity = $_GET['severity'] ?? '';
$type = $_GET['type'] ?? '';
$limit = min((int) ($_GET['limit'] ?? 100), 500);
$offset = (int) ($_GET['offset'] ?? 0);

if (!$crawlId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id']);
    exit;
}

try {
    $db = getDb();

    // 1. Issue counts by severity
    $stmt = $db->prepare("SELECT severity, COUNT(*) as count FROM issues WHERE crawl_id = ? GROUP BY severity ORDER BY FIELD(severity, 'Critical', 'High', 'Medium', 'Low')");
    $stmt->execute([$crawlId]);
    $severityCounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Issue counts by type
    $stmt = $db->prepare("SELECT type, severity, COUNT(*) as count FROM issues WHERE crawl_id = ? GROUP BY type, severity ORDER BY count DESC");
    $stmt->execute([$crawlId]);
    $typeCounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Filtered + paginated issues
    $query = "FROM issues WHERE crawl_id = :crawl_id";
    $params = [':crawl_id' => $crawlId];

    if ($severity) {
        $query .= " AND severity = :severity";
        $params[':severity'] = $severity;
    }
    if ($type) {
        $query .= " AND type = :type";
        $params[':type'] = $type;
    }

    // Total count
    $countStmt = $db->prepare("SELECT COUNT(*) " . $query);
    $countStmt->execute($params);
    $totalCount = $countStmt->fetchColumn();

    // Paginated data
    $dataStmt = $db->prepare("SELECT id, url, type, severity, message, description, recommendation " . $query . " ORDER BY FIELD(severity, 'Critical', 'High', 'Medium', 'Low'), id ASC LIMIT :limit OFFSET :offset");
    foreach ($params as $key => $value) {
        $dataStmt->bindValue($key, $value);
    }
    $dataStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $dataStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $dataStmt->execute();
    $issues = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'total' => (int) $totalCount,
        'severity_counts' => $severityCounts,
        'type_counts' => $typeCounts,
        'data' => $issues,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Issues report query failed.']);
}
?>