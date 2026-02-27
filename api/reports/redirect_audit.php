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

    // ============================================================
    // 1. LINKS POINTING TO REDIRECTED PAGES (3xx status)
    // These are the EXACT links causing "Page with redirect" in GSC
    // Shows: source page → bad link → what it redirected to
    // ============================================================
    $stmt = $db->prepare("
        SELECT l.source_url, l.target_url, p.status_code,
               p.redirect_chain_json
        FROM links l
        JOIN pages p ON l.target_url = p.url AND l.crawl_id = p.crawl_id
        WHERE l.crawl_id = ? AND l.is_external = 0 
        AND p.status_code >= 300 AND p.status_code < 400
        ORDER BY l.source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $redirectLinks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 2. LINKS CONTAINING .php IN THE URL
    // Old URL patterns like /search.php?q=news still being linked
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND target_url LIKE '%.php%'
        ORDER BY source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $phpLinks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 3. CASE-SENSITIVE SLUG ISSUES (Uppercase in URL path)
    // /country/Indonesia should be /indonesia
    // /category/Online should be /online
    // Linux servers treat these as different URLs → redirect chain
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND BINARY target_url REGEXP 'https?://[^/]+/.*[A-Z]'
        ORDER BY source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $caseIssues = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 4. OLD FOLDER-BASED URL PATTERNS
    // /country/xxx, /category/xxx — if these are known redirect patterns
    // Detects any link using folder prefixes that likely redirect
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND (
            target_url LIKE '%/country/%'
            OR target_url LIKE '%/category/%'
            OR target_url LIKE '%/search.php%'
            OR target_url LIKE '%/tag/%'
            OR target_url LIKE '%/page/%'
        )
        ORDER BY source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $oldPatternLinks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 5. ALL NON-200 INTERNAL PAGES (Broken + Redirected)
    // Complete list of every page that returned non-200 status
    // ============================================================
    $stmt = $db->prepare("
        SELECT url, status_code, redirect_chain_json
        FROM pages
        WHERE crawl_id = ? AND status_code != 200
        ORDER BY status_code ASC, url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $nonOkPages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 6. SUMMARY STATS
    // ============================================================
    $stmt = $db->prepare("SELECT COUNT(*) FROM links WHERE crawl_id = ? AND is_external = 0");
    $stmt->execute([$crawlId]);
    $totalInternalLinks = $stmt->fetchColumn();

    $totalIssues = count($redirectLinks) + count($phpLinks) + count($caseIssues) + count($oldPatternLinks);

    echo json_encode([
        'summary' => [
            'total_internal_links' => (int) $totalInternalLinks,
            'total_issues_found' => $totalIssues,
            'redirect_links' => count($redirectLinks),
            'php_links' => count($phpLinks),
            'case_issues' => count($caseIssues),
            'old_pattern_links' => count($oldPatternLinks),
            'non_ok_pages' => count($nonOkPages),
        ],
        'redirect_links' => $redirectLinks,
        'php_links' => $phpLinks,
        'case_issues' => $caseIssues,
        'old_pattern_links' => $oldPatternLinks,
        'non_ok_pages' => $nonOkPages,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Redirect audit query failed.']);
}
?>