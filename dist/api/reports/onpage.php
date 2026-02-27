<?php
require_once __DIR__ . '/../config.php';
authenticate();

$crawlId = $_GET['crawl_id'] ?? 0;
$url = $_GET['url'] ?? '';

if (!$crawlId || !$url) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing crawl_id or url']);
    exit;
}

try {
    $db = getDb();

    // Fetch target page
    $stmt = $db->prepare("SELECT * FROM pages WHERE crawl_id = ? AND url = ? LIMIT 1");
    $stmt->execute([$crawlId, $url]);
    $page = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$page) {
        echo json_encode(['error' => 'Page not found in this crawl']);
        exit;
    }

    $checks = [];
    $score = 100;

    // Helper to evaluate check
    $addCheck = function ($category, $title, $status, $desc, $penalty = 0, $fix = '') use (&$checks, &$score) {
        $checks[] = ['category' => $category, 'title' => $title, 'status' => $status, 'description' => $desc, 'fix' => $fix];
        if ($status === 'FAIL')
            $score -= $penalty;
        if ($status === 'WARN')
            $score -= ($penalty / 2);
    };

    // 1. Meta / Head
    $tLen = strlen($page['title'] ?? '');
    if ($tLen == 0)
        $addCheck('Meta', 'Title Tag', 'FAIL', 'Title tag is completely missing.', 15, 'Add a descriptive <title> tag containing your primary keyword inside the <head> section of your HTML.');
    elseif ($tLen < 20)
        $addCheck('Meta', 'Title Tag', 'WARN', "Title tag is very short ($tLen chars). Recommend 50-60 chars.", 5, 'Expand your title tag to include secondary keywords and your brand name. Aim for 50-60 characters total.');
    elseif ($tLen > 65)
        $addCheck('Meta', 'Title Tag', 'WARN', "Title tag is too long ($tLen chars). Will truncate on Google.", 5, 'Shorten your title tag to under 60 characters so Google does not cut it off with an ellipsis (...) in search results.');
    else
        $addCheck('Meta', 'Title Tag', 'PASS', "Title tag length is optimal ($tLen chars).", 0);

    $dLen = strlen($page['meta_desc'] ?? '');
    if ($dLen == 0)
        $addCheck('Meta', 'Meta Description', 'FAIL', 'Meta description is missing.', 10, 'Add a <meta name="description" content="..."> tag to your <head> summarizing the page for search engine users.');
    elseif ($dLen < 70)
        $addCheck('Meta', 'Meta Description', 'WARN', "Description is too short ($dLen chars). Recommend 150-160 chars.", 5, 'Write a more compelling summary. Expand the description to 150 characters to occupy more vertical space in search results.');
    elseif ($dLen > 165)
        $addCheck('Meta', 'Meta Description', 'WARN', "Description is too long ($dLen chars).", 2, 'Trim your meta description down to around 155 characters to ensure the whole message is visible in Google Search.');
    else
        $addCheck('Meta', 'Meta Description', 'PASS', "Meta description length is optimal ($dLen chars).", 0);

    // 2. Headings
    if (!$page['h1'])
        $addCheck('Headings', 'H1 Tag', 'FAIL', 'Page is missing an H1 tag.', 10, 'Add a single <h1> heading at the very top of your page content. This is a critical relevancy signal for SEO.');
    elseif (strpos($page['h1'], '[MULTIPLE H1 DETECTED]') !== false)
        $addCheck('Headings', 'H1 Tag', 'FAIL', 'Page contains multiple H1 tags. Keep strictly to one.', 10, 'Review your HTML structure and change all secondary <h1> tags to <h2> or <h3> to establish a clear content hierarchy.');
    else
        $addCheck('Headings', 'H1 Tag', 'PASS', 'One clear H1 tag found.', 0);

    $h2s = json_decode($page['h2_json'] ?? '[]');
    if (count($h2s) == 0)
        $addCheck('Headings', 'H2 Tags', 'WARN', 'No H2 tags found. Break content up logically.', 5, 'Use <h2> tags to group your paragraphs into logical sections. This improves readability for users and semantic meaning for Google.');
    else
        $addCheck('Headings', 'H2 Tags', 'PASS', count($h2s) . " H2 tags found.", 0);

    // 3. Technical & Content
    if ($page['status_code'] != 200)
        $addCheck('Technical', 'Status Code', 'FAIL', "Page returning a non-200 code ({$page['status_code']}).", 20, 'Determine why your server is returning an error or redirecting this URL. Only link internally to live 200 OK pages.');
    else
        $addCheck('Technical', 'Status Code', 'PASS', 'Returns 200 OK.', 0);

    if ($page['is_indexable'] == 0)
        $addCheck('Technical', 'Indexability', 'FAIL', 'Page is blocked by noindex.', 20, 'If you want this page to appear in search results, remove the <meta name="robots" content="noindex"> tag or the X-Robots-Tag HTTP header.');
    else
        $addCheck('Technical', 'Indexability', 'PASS', 'Page is indexable.', 0);

    if ($page['word_count'] < 300)
        $addCheck('Content', 'Word Count', 'WARN', "Thin content detected ({$page['word_count']} words). Minimum 300 recommended.", 10, 'Google struggles to rank "Thin Content" pages. Expand the textual depth of this page to significantly over 300 words.');
    else
        $addCheck('Content', 'Word Count', 'PASS', "Sufficient word count ({$page['word_count']} words).", 0);

    if ($page['text_ratio_percent'] < 10)
        $addCheck('Content', 'Text-to-HTML Ratio', 'FAIL', "Ratio is very low ({$page['text_ratio_percent']}%). Code bloat detected.", 5, 'Your raw code heavily outweighs actual readable text. Consider moving inline CSS and JS into external files, or adding more paragraph text.');
    else
        $addCheck('Content', 'Text-to-HTML Ratio', 'PASS', "HTML ratio is acceptable ({$page['text_ratio_percent']}%).", 0);

    // 4. Performance
    if ($page['load_time_ms'] > 2000)
        $addCheck('Performance', 'Load Time', 'FAIL', "Page took {$page['load_time_ms']}ms to respond (Target: < 500ms).", 10, 'Your server is failing the Core Web Vitals TTFB (Time To First Byte) metric. Consider implementing strict output caching or upgrading your hosting container.');
    elseif ($page['load_time_ms'] > 800)
        $addCheck('Performance', 'Load Time', 'WARN', "Page took {$page['load_time_ms']}ms to respond (Target: < 500ms).", 5, 'Your server response is slightly sluggish. Check your WordPress plugins or database query times.');
    else
        $addCheck('Performance', 'Load Time', 'PASS', "Server response is quick ({$page['load_time_ms']}ms).", 0);

    if ($page['size_bytes'] > 200000)
        $addCheck('Performance', 'Raw HTML Size', 'FAIL', "Raw HTML size is massive (" . round($page['size_bytes'] / 1024) . "KB).", 5, 'The pure source HTML is exceptionally large. Ensure you are not base64 encoding giant images directly into your template.');
    else
        $addCheck('Performance', 'Raw HTML Size', 'PASS', "HTML size is compact (" . round($page['size_bytes'] / 1024) . "KB).", 0);

    // Get Links context
    $stmt = $db->prepare("SELECT count(*) as total, sum(case when is_external=1 then 1 else 0 end) as ext FROM links WHERE crawl_id = ? AND source_url = ?");
    $stmt->execute([$crawlId, $url]);
    $links = $stmt->fetch(PDO::FETCH_ASSOC);

    $internalLinksCount = $links['total'] - $links['ext'];
    if ($internalLinksCount == 0)
        $addCheck('Links', 'Internal Links Out', 'FAIL', 'Page contains zero internal links to other pages.', 10, 'This page acts as a "Dead End" for link equity. Add navigational links or in-body anchor links to push ranking power to your other URLs.');
    else
        $addCheck('Links', 'Internal Links Out', 'PASS', "$internalLinksCount internal links found.", 0);

    $score = max(0, $score); // Prevent negative

    // Group checks
    $grouped = [];
    foreach ($checks as $c) {
        $grouped[$c['category']][] = $c;
    }

    echo json_encode([
        'url' => $page['url'],
        'score' => $score,
        'grade' => $score >= 80 ? 'A' : ($score >= 60 ? 'B' : ($score >= 40 ? 'C' : 'F')),
        'page_data' => $page,
        'link_counts' => $links,
        'audit' => $grouped
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'The engine encountered a background database error while grading this URL.']);
}
?>