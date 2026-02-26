<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/engine/parser.php';

authenticate();

$data = json_decode(file_get_contents('php://input'), true);
$crawlId = $_GET['crawl_id'] ?? $data['crawl_id'] ?? 0;

if (!$crawlId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id']);
    exit;
}

try {
    $db = getDb();

    // Get domain for this crawl
    $stmt = $db->prepare("SELECT p.domain FROM crawls c JOIN projects p ON c.project_id = p.id WHERE c.id = ?");
    $stmt->execute([$crawlId]);
    $domain = $stmt->fetchColumn();

    if (!$domain) {
        http_response_code(404);
        echo json_encode(['error' => 'Crawl not found.']);
        exit;
    }

    // 1. Fetch Sitemap
    $sitemapUrl = "https://" . $domain . "/sitemap.xml";
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $sitemapUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'AURORA SEO Auditor (Hostinger)');
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $content = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode < 200 || $httpCode >= 300 || !$content) {
        echo json_encode(['message' => 'No readable sitemap.xml found at root.', 'orphans_found' => 0]);
        exit;
    }

    // Try parsing as simple XML first (ignoring sitemap indexes for now to reduce Hostinger memory load)
    $sitemapUrls = [];
    $xml = @simplexml_load_string($content);

    if ($xml && isset($xml->url)) {
        foreach ($xml->url as $urlNode) {
            if (isset($urlNode->loc)) {
                $loc = trim((string) $urlNode->loc);
                // Normalize it identically to crawler logic
                $normalizedLoc = Parser::normalizeUrl($loc);
                $sitemapUrls[] = $normalizedLoc;
            }
        }
    }

    $sitemapUrls = array_unique($sitemapUrls);

    if (empty($sitemapUrls)) {
        echo json_encode(['message' => 'Sitemap was empty or was an unsupported index file.', 'orphans_found' => 0]);
        exit;
    }

    // 2. Identify Orphans (In Sitemap but NOT in our crawled Pages DB)
    // We fetch all crawled normalized URLs for this project
    $stmt = $db->prepare("SELECT url FROM pages WHERE crawl_id = ?");
    $stmt->execute([$crawlId]);
    $crawledUrls = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // Create lookup array for O(1) speed
    $crawledLookup = array_flip($crawledUrls);

    $orphanUrls = [];
    foreach ($sitemapUrls as $sUrl) {
        if (!isset($crawledLookup[$sUrl])) {
            $orphanUrls[] = $sUrl;
        }
    }

    // 3. Mark them in the database for the Insight Reports to read
    $db->beginTransaction();
    $insertOrphan = $db->prepare("INSERT IGNORE INTO issues (crawl_id, url, issue_type, severity, description) VALUES (?, ?, 'orphan_page', 'High', 'URL found in XML Sitemap but contains zero incoming internal links from a standard web crawl.')");

    foreach ($orphanUrls as $orphan) {
        $insertOrphan->execute([$crawlId, $orphan]);
    }
    $db->commit();

    echo json_encode([
        'message' => 'Sitemap analysis complete.',
        'sitemap_urls_found' => count($sitemapUrls),
        'orphans_found' => count($orphanUrls)
    ]);

} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Sitemap parser failed: ' . $e->getMessage()]);
}
?>