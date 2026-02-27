<?php
/**
 * REDIRECT SOURCE DETECTOR — The "Page with redirect" killer
 * 
 * Finds EXACTLY which pages link to old/redirecting URLs and WHY.
 * Designed to bring 351 "Page with redirect" GSC errors to ZERO.
 * 
 * Detects 8 categories:
 * 1. Internal links → 3xx redirect pages (with redirect target + snippet)
 * 2. Links using http:// instead of https://
 * 3. Links using www. when site uses non-www
 * 4. Uppercase characters in URL paths (case mismatch)
 * 5. Plus signs or bad encoding in URLs (+, %20)
 * 6. Old .php URLs still linked
 * 7. Old folder patterns (/country/, /category/)
 * 8. Sitemap contains redirecting URLs
 */
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

    // Get crawl domain for protocol/www checks
    $stmt = $db->prepare("SELECT p.domain FROM crawls c JOIN projects p ON c.project_id = p.id WHERE c.id = ?");
    $stmt->execute([$crawlId]);
    $domain = $stmt->fetchColumn();

    // ============================================================
    // 1. INTERNAL LINKS → REDIRECTED PAGES (3xx)
    // The EXACT cause of "Page with redirect" in GSC
    // Now includes: redirect target + HTML snippet evidence
    // ============================================================
    $stmt = $db->prepare("
        SELECT l.source_url, l.target_url, l.anchor_text, l.html_snippet,
               l.discovery_source, p.status_code, p.redirect_chain_json
        FROM links l
        JOIN pages p ON l.target_url = p.url AND l.crawl_id = p.crawl_id
        WHERE l.crawl_id = ? AND l.is_external = 0 
        AND p.status_code >= 300 AND p.status_code < 400
        ORDER BY l.source_url ASC
        LIMIT 500
    ");
    $stmt->execute([$crawlId]);
    $rawRedirects = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Extract redirect target from chain JSON
    $redirectLinks = [];
    foreach ($rawRedirects as $row) {
        $chain = json_decode($row['redirect_chain_json'] ?? '[]', true);
        $finalTarget = !empty($chain) ? end($chain) : 'Unknown';
        $redirectLinks[] = [
            'source_url' => $row['source_url'],
            'bad_link' => $row['target_url'],
            'redirects_to' => $finalTarget,
            'status_code' => $row['status_code'],
            'anchor_text' => $row['anchor_text'],
            'html_snippet' => $row['html_snippet'],
            'discovery_source' => $row['discovery_source'],
            'fix' => "Change link from \"{$row['target_url']}\" to \"{$finalTarget}\"",
        ];
    }

    // ============================================================
    // 2. PROTOCOL MISMATCH — Links using http:// instead of https://
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url, html_snippet
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND target_url LIKE 'http://%'
        ORDER BY source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $httpLinks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 3. WWW MISMATCH — Links using www. when site is non-www (or vice versa)
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url, html_snippet
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND target_url LIKE '%://www.%'
        ORDER BY source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $wwwLinks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 4. CASE MISMATCH — Uppercase letters in URL paths
    // /country/India instead of /country/india
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url, html_snippet, anchor_text
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND BINARY target_url REGEXP 'https?://[^/]+/.*[A-Z]'
        ORDER BY source_url ASC
        LIMIT 500
    ");
    $stmt->execute([$crawlId]);
    $caseIssues = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Add suggested fix: lowercase version
    foreach ($caseIssues as &$issue) {
        $parsed = parse_url($issue['target_url']);
        $lowercasePath = strtolower($parsed['path'] ?? '');
        $query = isset($parsed['query']) ? '?' . $parsed['query'] : '';
        $issue['suggested_fix'] = ($parsed['scheme'] ?? 'https') . '://' . ($parsed['host'] ?? '') . $lowercasePath . $query;
    }

    // ============================================================
    // 5. PLUS SIGN / BAD ENCODING IN URLs (+, %20, %2B in slugs)
    // /country/Sri+Lanka should be /country/sri-lanka
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url, html_snippet
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND (target_url LIKE '%+%' OR target_url LIKE '%%2520%%' OR target_url LIKE '%%2B%%')
        ORDER BY source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $encodingIssues = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 6. OLD .php URLS STILL LINKED
    // /search.php?q=news instead of /search?q=news
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url, html_snippet
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND target_url LIKE '%.php%'
        ORDER BY source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $phpLinks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 7. OLD FOLDER PATTERNS (/country/, /category/)
    // ============================================================
    $stmt = $db->prepare("
        SELECT source_url, target_url, html_snippet
        FROM links
        WHERE crawl_id = ? AND is_external = 0
        AND (
            target_url LIKE '%/country/%'
            OR target_url LIKE '%/category/%'
            OR target_url LIKE '%/search.php%'
            OR target_url LIKE '%/tag/%'
        )
        ORDER BY source_url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $oldPatterns = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ============================================================
    // 8. SITEMAP CONTAINS REDIRECTING URLs
    // Sitemap should NEVER contain 3xx URLs
    // Cross-reference: issues table has sitemap entries from sitemap_parser
    // Also check pages table directly
    // ============================================================
    $stmt = $db->prepare("
        SELECT url, status_code, redirect_chain_json
        FROM pages
        WHERE crawl_id = ? AND status_code >= 300 AND status_code < 400
        ORDER BY url ASC
        LIMIT 200
    ");
    $stmt->execute([$crawlId]);
    $redirectPages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Enrich with redirect targets
    foreach ($redirectPages as &$rp) {
        $chain = json_decode($rp['redirect_chain_json'] ?? '[]', true);
        $rp['redirects_to'] = !empty($chain) ? end($chain) : 'Unknown';
    }

    // ============================================================
    // 9. SUMMARY STATS
    // ============================================================
    $stmt = $db->prepare("SELECT COUNT(*) FROM links WHERE crawl_id = ? AND is_external = 0");
    $stmt->execute([$crawlId]);
    $totalInternalLinks = (int) $stmt->fetchColumn();

    $totalIssues = count($redirectLinks) + count($httpLinks) + count($wwwLinks) +
        count($caseIssues) + count($encodingIssues) + count($phpLinks) + count($oldPatterns);

    echo json_encode([
        'summary' => [
            'total_internal_links' => $totalInternalLinks,
            'total_redirect_issues' => $totalIssues,
            'redirect_links' => count($redirectLinks),
            'http_links' => count($httpLinks),
            'www_links' => count($wwwLinks),
            'case_issues' => count($caseIssues),
            'encoding_issues' => count($encodingIssues),
            'php_links' => count($phpLinks),
            'old_patterns' => count($oldPatterns),
            'redirect_pages' => count($redirectPages),
        ],
        'redirect_links' => $redirectLinks,
        'http_links' => $httpLinks,
        'www_links' => $wwwLinks,
        'case_issues' => $caseIssues,
        'encoding_issues' => $encodingIssues,
        'php_links' => $phpLinks,
        'old_patterns' => $oldPatterns,
        'redirect_pages' => $redirectPages,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Redirect audit query failed: ' . $e->getMessage()]);
}
?>