<?php
require_once __DIR__ . '/config.php';
// Authenticate via session cookie (browser sends it automatically on <a> download clicks)
authenticate();

$crawlId = $_GET['crawl_id'] ?? 0;
$type = $_GET['type'] ?? 'pages'; // pages, links, issues

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
        fputcsv($output, ['URL', 'Status Code', 'Load Time (ms)', 'Size (Bytes)', 'Word Count', 'Text Ratio (%)', 'Title', 'H1', 'Meta Description', 'Canonical', 'Indexable', 'Depth']);
        $stmt = $db->prepare("SELECT url, status_code, load_time_ms, size_bytes, word_count, text_ratio_percent, title, h1, meta_desc, canonical, is_indexable, depth FROM pages WHERE crawl_id = ?");
        $stmt->execute([$crawlId]);

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, $row);
        }
    } elseif ($type === 'links') {
        fputcsv($output, ['Source URL', 'Target URL', 'Anchor Text', 'Internal/External']);
        $stmt = $db->prepare("SELECT source_url, target_url, anchor_text, is_external FROM links WHERE crawl_id = ?");
        $stmt->execute([$crawlId]);

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $row['is_external'] = $row['is_external'] ? 'External' : 'Internal';
            fputcsv($output, $row);
        }
    }

    fclose($output);

} catch (PDOException $e) {
    die('A backend database error occurred during export.');
}
?>