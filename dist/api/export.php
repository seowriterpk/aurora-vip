<?php
require_once __DIR__ . '/config.php';
authenticate();

$crawlId = $_GET['crawl_id'] ?? 0;
$type = $_GET['type'] ?? 'pages'; // pages, links, issues, images

if (!$crawlId) {
    die('Missing crawl_id');
}

try {
    $db = getDb();

    // Verify crawl exists
    $stmt = $db->prepare("SELECT p.domain FROM crawls c JOIN projects p ON c.project_id = p.id WHERE c.id = ?");
    $stmt->execute([$crawlId]);
    $domain = $stmt->fetchColumn();
    if (!$domain) {
        die('Invalid crawl_id');
    }

    $sanitizedDomain = preg_replace('/[^a-zA-Z0-9_-]/', '_', $domain);
    $filename = "aurora_export_{$sanitizedDomain}_{$type}_crawl{$crawlId}.csv";

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $output = fopen('php://output', 'w');

    if ($type === 'pages') {
        fputcsv($output, ['URL', 'Status', 'Load (ms)', 'Size', 'Words', 'Text%', 'Title', 'H1', 'Meta Desc', 'Canonical', 'Canonical Status', 'Indexable', 'Score', 'Soft 404', 'Images', 'ImgNoAlt', 'Depth']);
        $stmt = $db->prepare("SELECT url, status_code, load_time_ms, size_bytes, word_count, text_ratio_percent, title, h1, meta_desc, canonical, canonical_status, is_indexable, indexability_score, soft_404, images_count, images_missing_alt, depth FROM pages WHERE crawl_id = ?");
        $stmt->execute([$crawlId]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, $row);
        }

    } elseif ($type === 'links') {
        fputcsv($output, ['Source URL', 'Target URL', 'Anchor Text', 'Type', 'Discovery Source']);
        $stmt = $db->prepare("SELECT source_url, target_url, anchor_text, is_external, discovery_source FROM links WHERE crawl_id = ?");
        $stmt->execute([$crawlId]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $row['is_external'] = $row['is_external'] ? 'External' : 'Internal';
            fputcsv($output, $row);
        }

    } elseif ($type === 'issues') {
        fputcsv($output, ['URL', 'Type', 'Severity', 'Message', 'Description', 'Recommendation']);
        $stmt = $db->prepare("SELECT url, type, severity, message, description, recommendation FROM issues WHERE crawl_id = ? ORDER BY FIELD(severity, 'Critical', 'High', 'Medium', 'Low')");
        $stmt->execute([$crawlId]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, $row);
        }

    } elseif ($type === 'images') {
        fputcsv($output, ['Page URL', 'Image Src', 'Alt Text', 'Width', 'Height', 'Lazy Loading', 'Format']);
        $stmt = $db->prepare("SELECT p.url as page_url, i.src, i.alt, i.width, i.height, i.has_lazy_loading, i.format FROM images i JOIN pages p ON i.page_id = p.id AND i.crawl_id = p.crawl_id WHERE i.crawl_id = ?");
        $stmt->execute([$crawlId]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $row['has_lazy_loading'] = $row['has_lazy_loading'] ? 'Yes' : 'No';
            fputcsv($output, $row);
        }
    } elseif ($type === 'canonical') {
        fputcsv($output, ['Page URL', 'Canonical Target', 'Status Code']);
        $stmt = $db->prepare("SELECT url, canonical, status_code FROM pages WHERE crawl_id = ? AND canonical IS NOT NULL AND canonical != '' AND ((canonical NOT LIKE CONCAT(url, '%') AND canonical NOT LIKE CONCAT(REPLACE(url, 'http://', 'https://'), '%')) OR status_code >= 300) ORDER BY status_code DESC");
        $stmt->execute([$crawlId]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, $row);
        }

    } elseif ($type === 'redirect_links') {
        fputcsv($output, ['Source Page', 'Bad Link (Redirects)', 'Redirects To', 'Status Code']);
        $stmt = $db->prepare("
            SELECT l.source_url, l.target_url as bad_link, p.redirects_to, p.status_code 
            FROM links l 
            JOIN pages p ON l.target_url = p.url AND l.crawl_id = p.crawl_id 
            WHERE l.crawl_id = ? AND p.status_code >= 300 AND p.status_code < 400
        ");
        $stmt->execute([$crawlId]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, $row);
        }
    }

    fclose($output);

} catch (PDOException $e) {
    die('A backend database error occurred during export.');
}
?>