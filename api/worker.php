<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/engine/fetcher.php';
require_once __DIR__ . '/engine/parser.php';

authenticate();

// Hostinger Safety Limits
set_time_limit(50); // Hard limit to ensure script dies before 60s timeout
$startTime = microtime(true);
$maxExecutionTime = 40; // Aim to finish within 40 seconds
$batchSize = 10; // Number of URLs to process concurrently per heartbeat

require_once __DIR__ . '/engine/robots.php';

// CRITICAL: Ensure session is unlocked so frontend UI polling doesn't freeze
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$crawlId = $_GET['crawl_id'] ?? 0;

if (!$crawlId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id']);
    exit;
}

try {
    $db = getDb();

    // Check if crawl is still meant to be running
    $stmt = $db->prepare("SELECT status FROM crawls WHERE id = ?");
    $stmt->execute([$crawlId]);
    $crawlStatus = $stmt->fetchColumn();

    if ($crawlStatus !== 'RUNNING') {
        echo json_encode(['message' => "Crawl is $crawlStatus. Worker stopped."]);
        exit;
    }

    // Grab a batch of pending URLs
    $stmt = $db->prepare("SELECT id, url, depth FROM crawl_queue WHERE crawl_id = ? AND status = 'PENDING' LIMIT ?");
    $stmt->execute([$crawlId, $batchSize]);
    $queueItems = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($queueItems)) {
        // Complete the crawl if the queue is empty
        $stmt = $db->prepare("SELECT count(*) FROM crawl_queue WHERE crawl_id = ? AND status = 'PROCESSING'");
        $stmt->execute([$crawlId]);
        $processingCount = $stmt->fetchColumn();

        if ($processingCount == 0) {
            $db->prepare("UPDATE crawls SET status = 'COMPLETED', ended_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$crawlId]);
            $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'SUCCESS', 'Crawl finished successfully.')")->execute([$crawlId]);
            echo json_encode(['message' => 'Crawl Completed', 'remaining' => 0]);
        } else {
            echo json_encode(['message' => "Waiting on $processingCount URLs", 'remaining' => 0]);
        }
        exit;
    }

    $domain = parse_url($queueItems[0]['url'], PHP_URL_HOST);

    // Initialize and Fetch Robots.txt rules for this domain
    $robotsLoader = new RobotsTxtParser($domain);
    $robotsLoader->fetchAndParse();

    $urlsToFetch = [];
    $urlMap = []; // map URL to depth and queue id
    $queueIdsStr = [];

    foreach ($queueItems as $item) {
        $parsedUrl = parse_url($item['url']);
        $pathArgs = ($parsedUrl['path'] ?? '/') . (isset($parsedUrl['query']) ? '?' . $parsedUrl['query'] : '');

        // Skip fetching if blocked by robots.txt
        if (!$robotsLoader->isAllowed($pathArgs)) {
            $updateQueueStmt = $db->prepare("UPDATE crawl_queue SET status = 'SKIPPED_ROBOTS' WHERE id = ?");
            $updateQueueStmt->execute([$item['id']]);
            $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'INFO', ?)")->execute([$crawlId, "Robots.txt Blocked: " . $item['url']]);
            continue;
        }

        $urlsToFetch[] = $item['url'];
        $urlMap[$item['url']] = $item;
        $queueIdsStr[] = $item['id'];
    }

    if (empty($urlsToFetch)) {
        // Everything was blocked in this batch
        echo json_encode(['message' => 'Batch skipped due to robots.txt']);
        exit;
    }

    // Lock rows
    $inClause = implode(',', array_fill(0, count($queueIdsStr), '?'));
    $lockStmt = $db->prepare("UPDATE crawl_queue SET status = 'PROCESSING' WHERE id IN ($inClause)");
    $lockStmt->execute($queueIdsStr);

    // 1. Fetch Concurrently
    $fetcher = new Fetcher();
    $fetcher->queueUrls($urlsToFetch);
    $results = $fetcher->execute();
    $fetcher->close();

    // 2. Parse & Store (Use Transaction for ultimate write speed)
    $db->beginTransaction();

    $insertPageStmt = $db->prepare("INSERT IGNORE INTO pages 
        (crawl_id, url, status_code, load_time_ms, size_bytes, word_count, text_ratio_percent, content_hash, title, meta_desc, h1, h2_json, canonical, meta_robots, schema_types, is_indexable, depth, redirect_chain_json) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

    $insertLinkStmt = $db->prepare("INSERT INTO links (crawl_id, source_url, target_url, anchor_text, html_snippet, is_external) VALUES (?, ?, ?, ?, ?, ?)");

    // Add discovered internal links back to queue
    $insertQueueStmt = $db->prepare("INSERT IGNORE INTO crawl_queue (crawl_id, url, depth, status) VALUES (?, ?, ?, 'PENDING')");

    $updateQueueSuccessStmt = $db->prepare("UPDATE crawl_queue SET status = 'CRAWLED' WHERE id = ?");
    $updateQueueErrorStmt = $db->prepare("UPDATE crawl_queue SET status = 'ERROR', error_msg = ? WHERE id = ?");

    foreach ($results as $url => $result) {
        $qItem = $urlMap[$url];
        $info = $result['info'];
        $body = $result['body'];
        $chain = $result['chain'];

        $statusCode = $info['http_code'];
        $timeMs = round($info['total_time'] * 1000);
        $sizeBytes = $info['size_download'];

        if ($statusCode == 0) {
            // Network or Timeout error
            $updateQueueErrorStmt->execute(["Network timeout or unreachable", $qItem['id']]);
            continue;
        }

        $parseData = ['word_count' => 0, 'text_ratio_percent' => 0, 'content_hash' => '', 'title' => null, 'meta_desc' => null, 'h1' => null, 'h2_json' => '[]', 'canonical' => null, 'meta_robots' => null, 'schema_types' => null, 'is_indexable' => 1, 'internal_links' => [], 'external_links' => []];

        // Check X-Robots-Tag HTTP Header
        $isIndexable = 1;
        if (!empty($result['headers']) && strpos(strtolower($result['headers']), 'x-robots-tag: noindex') !== false) {
            $isIndexable = 0;
            $parseData['is_indexable'] = 0;
            $parseData['meta_robots'] = 'noindex (HTTP header)';
        }

        // Parse if it's HTML
        $contentType = $info['content_type'] ?? '';
        if (strpos($contentType, 'text/html') !== false && !empty($body)) {
            $tmp = Parser::parseHtml($body, $url);
            if ($tmp)
                $parseData = $tmp;
        }

        // Insert Page - Ensure URL is normalized!
        $normalizedUrl = Parser::normalizeUrl($url);

        $insertPageStmt->execute([
            $crawlId,
            $normalizedUrl,
            $statusCode,
            $timeMs,
            $sizeBytes,
            $parseData['word_count'],
            $parseData['text_ratio_percent'],
            $parseData['content_hash'],
            $parseData['title'],
            $parseData['meta_desc'],
            $parseData['h1'],
            $parseData['h2_json'],
            $parseData['canonical'],
            $parseData['meta_robots'],
            $parseData['schema_types'] ?? null,
            $parseData['is_indexable'],
            $qItem['depth'],
            json_encode($chain)
        ]);

        // Insert Links & update queue
        foreach ($parseData['internal_links'] as $link) {
            $normalizedInternal = Parser::normalizeUrl($link['url']);
            $insertLinkStmt->execute([$crawlId, $normalizedUrl, $normalizedInternal, $link['anchor'], $link['snippet'], 0]);

            // Limit depth to prevent infinite loops (setting hard cap to 20 for safety)
            if ($qItem['depth'] < 20) {
                $insertQueueStmt->execute([$crawlId, $normalizedInternal, $qItem['depth'] + 1]);
            }
        }
        foreach ($parseData['external_links'] as $link) {
            $insertLinkStmt->execute([$crawlId, $normalizedUrl, $link['url'], $link['anchor'], $link['snippet'], 1]);
        }

        $updateQueueSuccessStmt->execute([$qItem['id']]);
    }

    // Update counts
    $db->exec("UPDATE crawls SET urls_crawled = urls_crawled + " . count($results) . " WHERE id = $crawlId");

    $db->commit();

    // Check Remaining
    $stmt = $db->prepare("SELECT count(*) FROM crawl_queue WHERE crawl_id = ? AND status = 'PENDING'");
    $stmt->execute([$crawlId]);
    $remaining = $stmt->fetchColumn();

    $execTime = microtime(true) - $startTime;

    echo json_encode([
        'message' => 'Batch Processed',
        'processed' => count($results),
        'remaining' => $remaining,
        'execution_time_s' => round($execTime, 2)
    ]);

} catch (Exception $e) {
    if (isset($db)) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        try {
            $errorMsg = substr($e->getMessage(), 0, 500);
            $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'ERROR', ?)")->execute([$crawlId, "Worker Failure: " . $errorMsg]);
        } catch (\Exception $e2) {
            // Cannot even log error
        }
    }
    http_response_code(500);
    echo json_encode(['error' => 'Worker Failure: ' . $e->getMessage()]);
}
?>