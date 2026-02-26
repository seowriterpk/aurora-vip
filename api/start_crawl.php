<?php
require_once __DIR__ . '/config.php';
authenticate();

$data = json_decode(file_get_contents('php://input'), true);
$targetUrl = $data['url'] ?? '';

if (empty($targetUrl) || !filter_var($targetUrl, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid URL provided']);
    exit;
}

try {
    $db = getDb();

    // Parse the domain to act as the project identifier
    $domain = parse_url($targetUrl, PHP_URL_HOST);

    // Insert or get project
    $stmt = $db->prepare("INSERT IGNORE INTO projects (domain) VALUES (?)");
    $stmt->execute([$domain]);

    $stmt = $db->prepare("SELECT id FROM projects WHERE domain = ?");
    $stmt->execute([$domain]);
    $projectId = $stmt->fetchColumn();

    // Create a new Crawl session
    $stmt = $db->prepare("INSERT INTO crawls (project_id, status, started_at) VALUES (?, 'RUNNING', CURRENT_TIMESTAMP)");
    $stmt->execute([$projectId]);
    $crawlId = $db->lastInsertId();

    // Insert the seed URL into the queue at depth 0
    $stmt = $db->prepare("INSERT INTO crawl_queue (crawl_id, url, depth, status) VALUES (?, ?, 0, 'PENDING')");
    $stmt->execute([$crawlId, $targetUrl]);

    echo json_encode([
        'message' => 'Crawl initiated successfully',
        'crawl_id' => $crawlId,
        'domain' => $domain
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>