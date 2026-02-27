<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/engine/fetcher.php';
require_once __DIR__ . '/engine/parser.php';
require_once __DIR__ . '/engine/robots.php';

authenticate();

// ============================================================
// HOSTINGER SAFETY LIMITS
// ============================================================
set_time_limit(55);                     // Hard PHP kill at 55s (Hostinger max is 60s)
$startTime = microtime(true);
$maxExecutionTime = 40;                 // Soft budget: stop accepting new work after 40s
$batchSize = 5;                         // Conservative: 5 concurrent fetches (avoid hammering)
$maxDepth = 15;                         // Prevent infinite depth crawling

// CRITICAL: Release session lock immediately so Dashboard UI polling doesn't freeze
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$crawlId = (int) ($_GET['crawl_id'] ?? 0);

if (!$crawlId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id']);
    exit;
}

// ============================================================
// SERVER-SIDE LOCK — Prevent concurrent worker.php execution
// (Handles multiple browser tabs / accidental double-fires)
// ============================================================
$lockFile = sys_get_temp_dir() . '/aurora_worker_lock_' . $crawlId . '.lock';
$lockHandle = fopen($lockFile, 'w');
if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
    // Another worker is already running for this crawl — exit silently
    fclose($lockHandle);
    echo json_encode(['message' => 'Worker already active for this crawl. Skipped.']);
    exit;
}
// Lock acquired — register cleanup on shutdown
register_shutdown_function(function () use ($lockHandle, $lockFile) {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
    @unlink($lockFile);
});

try {
    $db = getDb();

    // ============================================================
    // 1. CHECK CRAWL STATE
    // ============================================================
    $stmt = $db->prepare("SELECT status FROM crawls WHERE id = ?");
    $stmt->execute([$crawlId]);
    $crawlStatus = $stmt->fetchColumn();

    if ($crawlStatus !== 'RUNNING') {
        echo json_encode(['message' => "Crawl is $crawlStatus. Worker stopped."]);
        exit;
    }

    // ============================================================
    // 2. RECOVER STUCK URLs
    // The file lock (above) guarantees only ONE worker runs at a time,
    // so any PROCESSING URLs here are from a previously crashed worker.
    // ============================================================
    $db->prepare("UPDATE crawl_queue SET status = 'PENDING' WHERE crawl_id = ? AND status = 'PROCESSING'")->execute([$crawlId]);

    // ============================================================
    // 3. GRAB A BATCH OF PENDING URLs
    // ============================================================
    $stmt = $db->prepare("SELECT id, url, depth FROM crawl_queue WHERE crawl_id = ? AND status = 'PENDING' ORDER BY depth ASC, id ASC LIMIT ?");
    $stmt->execute([$crawlId, $batchSize]);
    $queueItems = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($queueItems)) {
        // Check if anything is still processing
        $stmt = $db->prepare("SELECT count(*) FROM crawl_queue WHERE crawl_id = ? AND status = 'PROCESSING'");
        $stmt->execute([$crawlId]);
        $processingCount = $stmt->fetchColumn();

        if ($processingCount == 0) {
            // Crawl is truly complete
            $db->prepare("UPDATE crawls SET status = 'COMPLETED', ended_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$crawlId]);
            $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'SUCCESS', 'Crawl finished successfully.')")->execute([$crawlId]);

            // ---- RISK 2 FIX: Trim old logs to prevent unbounded growth ----
            // Keep the most recent 500 logs per crawl, delete the rest
            try {
                $db->prepare("DELETE FROM crawl_logs WHERE crawl_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM crawl_logs WHERE crawl_id = ? ORDER BY id DESC LIMIT 500) AS keep)")->execute([$crawlId, $crawlId]);
            } catch (\Exception $cleanupErr) {
                // Non-critical — log cleanup failure should never crash the worker
            }

            echo json_encode(['message' => 'Crawl Completed', 'remaining' => 0]);
        } else {
            echo json_encode(['message' => "Waiting on $processingCount URLs", 'remaining' => 0]);
        }
        exit;
    }

    $domain = parse_url($queueItems[0]['url'], PHP_URL_HOST);

    // ============================================================
    // 4. ROBOTS.TXT COMPLIANCE
    // ============================================================
    $robotsLoader = new RobotsTxtParser($domain);
    $robotsLoader->fetchAndParse();

    $urlsToFetch = [];
    $urlMap = [];
    $queueIdsToLock = [];

    foreach ($queueItems as $item) {
        $parsedUrl = parse_url($item['url']);
        $pathArgs = ($parsedUrl['path'] ?? '/') . (isset($parsedUrl['query']) ? '?' . $parsedUrl['query'] : '');

        // Skip if blocked by robots.txt
        if (!$robotsLoader->isAllowed($pathArgs)) {
            $db->prepare("UPDATE crawl_queue SET status = 'SKIPPED_ROBOTS' WHERE id = ?")->execute([$item['id']]);
            $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'INFO', ?)")->execute([$crawlId, "Robots.txt Blocked: " . $item['url']]);
            continue;
        }

        $urlsToFetch[] = $item['url'];
        $urlMap[$item['url']] = $item;
        $queueIdsToLock[] = $item['id'];
    }

    if (empty($urlsToFetch)) {
        echo json_encode(['message' => 'Batch skipped due to robots.txt']);
        exit;
    }

    // ============================================================
    // 5. LOCK QUEUE ROWS AS PROCESSING
    // ============================================================
    $inClause = implode(',', array_fill(0, count($queueIdsToLock), '?'));
    $db->prepare("UPDATE crawl_queue SET status = 'PROCESSING' WHERE id IN ($inClause)")->execute($queueIdsToLock);

    // ============================================================
    // 6. FETCH CONCURRENTLY (Using hardened Fetcher)
    // ============================================================
    $fetcher = new Fetcher();
    $fetcher->queueUrls($urlsToFetch, $domain);
    $results = $fetcher->execute();
    $fetcher->close();

    // ============================================================
    // 7. PARSE & STORE (Transactional for speed + atomicity)
    // ============================================================
    $db->beginTransaction();

    $insertPageStmt = $db->prepare("INSERT IGNORE INTO pages 
        (crawl_id, url, status_code, load_time_ms, size_bytes, word_count, text_ratio_percent, content_hash, title, meta_desc, h1, h2_json, canonical, meta_robots, schema_types, is_indexable, depth, redirect_chain_json) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

    // RISK 1 FIX: INSERT IGNORE prevents duplicate link rows from retries/navigation duplication
    $insertLinkStmt = $db->prepare("INSERT IGNORE INTO links (crawl_id, source_url, target_url, anchor_text, html_snippet, is_external) VALUES (?, ?, ?, ?, ?, ?)");
    $insertQueueStmt = $db->prepare("INSERT IGNORE INTO crawl_queue (crawl_id, url, depth, status) VALUES (?, ?, ?, 'PENDING')");
    $updateQueueSuccessStmt = $db->prepare("UPDATE crawl_queue SET status = 'CRAWLED' WHERE id = ?");
    $updateQueueErrorStmt = $db->prepare("UPDATE crawl_queue SET status = 'ERROR', error_msg = ? WHERE id = ?");

    $processedCount = 0;
    $errorCount = 0;

    foreach ($results as $url => $result) {
        // Time budget check — stop processing if we're running out of time
        if ((microtime(true) - $startTime) > $maxExecutionTime) {
            // Time budget exceeded — stop accepting more work
            // Remaining PROCESSING URLs will be recovered by stuck-URL recovery on next heartbeat
            break;
        }

        $qItem = $urlMap[$url] ?? null;
        if (!$qItem)
            continue; // Safety check

        $info = $result['info'];
        $body = $result['body'] ?? '';
        $chain = $result['chain'] ?? [];
        $curlError = $result['curl_error'] ?? '';

        $statusCode = (int) ($info['http_code'] ?? 0);
        $timeMs = (int) round(($info['total_time'] ?? 0) * 1000);
        $sizeBytes = (int) ($info['size_download'] ?? 0);

        // ---- Handle Network Failures ----
        if ($statusCode == 0) {
            $errorMsg = $curlError ?: 'Network timeout or DNS resolution failed';
            $updateQueueErrorStmt->execute([$errorMsg, $qItem['id']]);
            try {
                $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'ERROR', ?)")->execute([$crawlId, "Fetch Failed ($errorMsg): $url"]);
            } catch (\Exception $logErr) {
            }
            $errorCount++;
            continue;
        }

        // ---- Handle Security Blocks (429, 403, 503) ----
        if ($statusCode == 429 || $statusCode == 503) {
            // Server is rate-limiting us. Mark as PENDING for retry in next batch
            $db->prepare("UPDATE crawl_queue SET status = 'PENDING' WHERE id = ?")->execute([$qItem['id']]);
            try {
                $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'INFO', ?)")->execute([$crawlId, "Rate Limited ($statusCode), will retry: $url"]);
            } catch (\Exception $logErr) {
            }
            continue;
        }

        if ($statusCode == 403) {
            // Forbidden — log it but don't retry endlessly
            $updateQueueErrorStmt->execute(["Server returned 403 Forbidden (likely WAF block)", $qItem['id']]);
            try {
                $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'ERROR', ?)")->execute([$crawlId, "403 Forbidden (WAF blocked): $url"]);
            } catch (\Exception $logErr) {
            }
            $errorCount++;
            continue;
        }

        // ---- Parse HTML Content ----
        $parseData = [
            'word_count' => 0,
            'text_ratio_percent' => 0,
            'content_hash' => '',
            'title' => null,
            'meta_desc' => null,
            'h1' => null,
            'h2_json' => '[]',
            'canonical' => null,
            'meta_robots' => null,
            'schema_types' => null,
            'is_indexable' => 1,
            'internal_links' => [],
            'external_links' => []
        ];

        // Check X-Robots-Tag HTTP Header
        if (!empty($result['headers']) && strpos(strtolower($result['headers']), 'x-robots-tag: noindex') !== false) {
            $parseData['is_indexable'] = 0;
            $parseData['meta_robots'] = 'noindex (HTTP header)';
        }

        // Parse HTML body if content is HTML
        $contentType = $info['content_type'] ?? '';
        if (strpos($contentType, 'text/html') !== false && !empty($body)) {
            try {
                $tmp = Parser::parseHtml($body, $url);
                if ($tmp)
                    $parseData = $tmp;
            } catch (\Exception $parseErr) {
                // Parser crash should never kill the worker — log and continue
                try {
                    $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'ERROR', ?)")->execute([$crawlId, "Parser Error on $url: " . substr($parseErr->getMessage(), 0, 200)]);
                } catch (\Exception $logErr) {
                }
            }
        }

        // ---- Insert Page ----
        $normalizedUrl = Parser::normalizeUrl($url);

        try {
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
        } catch (\Exception $insertErr) {
            // Duplicate or schema error — log but don't crash
            try {
                $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'ERROR', ?)")->execute([$crawlId, "Insert Error for $url: " . substr($insertErr->getMessage(), 0, 200)]);
            } catch (\Exception $logErr) {
            }
        }

        // ---- Insert Links & Queue New URLs ----
        foreach ($parseData['internal_links'] as $link) {
            try {
                $normalizedInternal = Parser::normalizeUrl($link['url']);
                $insertLinkStmt->execute([$crawlId, $normalizedUrl, $normalizedInternal, $link['anchor'] ?? '', $link['snippet'] ?? '', 0]);

                // Only queue if within depth limit
                if ($qItem['depth'] < $maxDepth) {
                    $insertQueueStmt->execute([$crawlId, $normalizedInternal, $qItem['depth'] + 1]);
                }
            } catch (\Exception $linkErr) {
                // Link insert error should never crash worker
            }
        }

        foreach ($parseData['external_links'] as $link) {
            try {
                $insertLinkStmt->execute([$crawlId, $normalizedUrl, $link['url'] ?? '', $link['anchor'] ?? '', $link['snippet'] ?? '', 1]);
            } catch (\Exception $linkErr) {
            }
        }

        $updateQueueSuccessStmt->execute([$qItem['id']]);
        $processedCount++;
    }

    // ---- Update Crawl Counters ----
    if ($processedCount > 0) {
        $db->prepare("UPDATE crawls SET urls_crawled = urls_crawled + ? WHERE id = ?")->execute([$processedCount, $crawlId]);
    }

    $db->commit();

    // ============================================================
    // 8. REPORT STATUS
    // ============================================================
    $stmt = $db->prepare("SELECT count(*) FROM crawl_queue WHERE crawl_id = ? AND status = 'PENDING'");
    $stmt->execute([$crawlId]);
    $remaining = $stmt->fetchColumn();

    $execTime = round(microtime(true) - $startTime, 2);

    // Log batch summary
    try {
        $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'INFO', ?)")->execute([
            $crawlId,
            "Batch: {$processedCount} ok, {$errorCount} errors, {$remaining} pending, {$execTime}s"
        ]);
    } catch (\Exception $logErr) {
    }

    echo json_encode([
        'message' => 'Batch Processed',
        'processed' => $processedCount,
        'errors' => $errorCount,
        'remaining' => $remaining,
        'execution_time_s' => $execTime
    ]);

} catch (\Exception $e) {
    // ============================================================
    // CRASH-PROOF: If ANYTHING fails, rollback, log, and respond gracefully
    // ============================================================
    if (isset($db)) {
        if ($db->inTransaction()) {
            try {
                $db->rollBack();
            } catch (\Exception $rbErr) {
            }
        }
        try {
            $errorMsg = substr($e->getMessage(), 0, 500);
            $db->prepare("INSERT INTO crawl_logs (crawl_id, type, message) VALUES (?, 'ERROR', ?)")->execute([$crawlId, "Worker Crash: " . $errorMsg]);
        } catch (\Exception $logErr) {
        }

        // Reset PROCESSING items back to PENDING (safe because file lock ensures only one worker)
        try {
            $db->prepare("UPDATE crawl_queue SET status = 'PENDING' WHERE crawl_id = ? AND status = 'PROCESSING'")->execute([$crawlId]);
        } catch (\Exception $resetErr) {
        }
    }

    http_response_code(500);
    echo json_encode(['error' => 'Worker encountered an issue. It will auto-recover on next heartbeat.']);
}
?>