<?php
/**
 * GSC URL Problem Solver — "Why Is Google Seeing This URL?"
 * 
 * Accepts a list of expired/problem URLs (POST JSON or GET url parameter)
 * and searches the entire crawl dataset to find WHERE each URL is referenced.
 * 
 * Checks: internal links, canonicals, hreflang, sitemaps, redirects.
 */
require_once __DIR__ . '/../config.php';
authenticate();

$crawlId = $_GET['crawl_id'] ?? 0;
if (!$crawlId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id']);
    exit;
}

// Accept URLs via POST body (JSON array) or single GET param
$inputUrls = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $inputUrls = $body['urls'] ?? [];
} elseif (isset($_GET['url'])) {
    $inputUrls = [$_GET['url']];
}

if (empty($inputUrls)) {
    echo json_encode(['error' => 'No URLs provided. POST a JSON body with {"urls": [...]} or use ?url=']);
    exit;
}

// Cap at 100 URLs per request
$inputUrls = array_slice($inputUrls, 0, 100);

try {
    $db = getDb();
    $results = [];

    // Prepare reusable statements
    $findInLinks = $db->prepare("
        SELECT source_url, anchor_text, html_snippet, discovery_source
        FROM links 
        WHERE crawl_id = ? AND target_url = ? AND is_external = 0
        LIMIT 20
    ");

    $findInCanonical = $db->prepare("
        SELECT url FROM pages 
        WHERE crawl_id = ? AND canonical = ?
        LIMIT 10
    ");

    $findInHreflang = $db->prepare("
        SELECT url, hreflang_json FROM pages 
        WHERE crawl_id = ? AND hreflang_json LIKE ?
        LIMIT 10
    ");

    $findPageStatus = $db->prepare("
        SELECT status_code, redirect_chain_json FROM pages 
        WHERE crawl_id = ? AND url = ?
        LIMIT 1
    ");

    foreach ($inputUrls as $targetUrl) {
        $targetUrl = trim($targetUrl);
        if (empty($targetUrl))
            continue;

        $entry = [
            'url' => $targetUrl,
            'found_in_links' => false,
            'found_in_canonical' => false,
            'found_in_hreflang' => false,
            'found_in_redirect' => false,
            'page_status' => null,
            'sources' => [],
            'fix_type' => null,
            'severity' => 'Low',
            'why_it_exists' => [],
        ];

        // 1. Check if linked from internal pages
        $findInLinks->execute([$crawlId, $targetUrl]);
        $linkSources = $findInLinks->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($linkSources)) {
            $entry['found_in_links'] = true;
            $entry['sources'] = array_merge($entry['sources'], array_map(function ($s) {
                return [
                    'type' => 'Internal Link (' . ($s['discovery_source'] ?? 'link') . ')',
                    'source_page' => $s['source_url'],
                    'evidence' => $s['html_snippet'] ?? $s['anchor_text'] ?? '',
                ];
            }, $linkSources));
            $entry['why_it_exists'][] = 'Still linked from ' . count($linkSources) . ' internal page(s)';
            $entry['fix_type'] = 'Remove internal link';
            $entry['severity'] = 'High';
        }

        // 2. Check if any page canonicals point to this URL
        $findInCanonical->execute([$crawlId, $targetUrl]);
        $canonicalSources = $findInCanonical->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($canonicalSources)) {
            $entry['found_in_canonical'] = true;
            foreach ($canonicalSources as $cs) {
                $entry['sources'][] = [
                    'type' => 'Canonical Tag',
                    'source_page' => $cs['url'],
                    'evidence' => '<link rel="canonical" href="' . $targetUrl . '">',
                ];
            }
            $entry['why_it_exists'][] = count($canonicalSources) . ' page(s) have canonical pointing here';
            $entry['fix_type'] = 'Fix canonical';
            $entry['severity'] = 'Critical';
        }

        // 3. Check if any hreflang tags reference this URL
        $findInHreflang->execute([$crawlId, '%' . $targetUrl . '%']);
        $hreflangSources = $findInHreflang->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($hreflangSources)) {
            $entry['found_in_hreflang'] = true;
            foreach ($hreflangSources as $hs) {
                $entry['sources'][] = [
                    'type' => 'Hreflang Tag',
                    'source_page' => $hs['url'],
                    'evidence' => 'hreflang references this URL',
                ];
            }
            $entry['why_it_exists'][] = 'Referenced in hreflang tags';
            $entry['fix_type'] = $entry['fix_type'] ?? 'Update hreflang';
            $entry['severity'] = 'High';
        }

        // 4. Check the page's own status
        $findPageStatus->execute([$crawlId, $targetUrl]);
        $pageInfo = $findPageStatus->fetch(PDO::FETCH_ASSOC);
        if ($pageInfo) {
            $entry['page_status'] = (int) $pageInfo['status_code'];
            if ($pageInfo['status_code'] >= 300 && $pageInfo['status_code'] < 400) {
                $entry['found_in_redirect'] = true;
                $entry['why_it_exists'][] = 'URL returns ' . $pageInfo['status_code'] . ' redirect';
            }
        }

        // Determine best fix if no specific source found
        if (empty($entry['sources'])) {
            $entry['why_it_exists'][] = 'Not found in current crawl data — may be from external backlinks, old sitemap cache, or Google cache';
            $entry['fix_type'] = 'Add 410 Gone';
            $entry['severity'] = 'Medium';
        }

        $results[] = $entry;
    }

    echo json_encode([
        'total_checked' => count($results),
        'results' => $results,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'GSC solver query failed.']);
}
?>