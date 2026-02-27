<?php
/**
 * AURA AUDIT ENGINE
 * Independent, standalone crawler and link-auditor.
 * No Database Required. State is stored in local JSON files.
 */

// We don't require the master config because this is standalone, 
// but we will require it just for generic file paths and helper auth if needed.
require_once __DIR__ . '/config.php';
authenticate();

header('Content-Type: application/json; charset=UTF-8');

$action = $_GET['action'] ?? '';
$sessionId = $_GET['session_id'] ?? '';

// Handle startup
if ($action === 'start' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $url = $data['url'] ?? '';

    if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid or missing URL']);
        exit;
    }

    $sessionHash = md5($url . time());
    $stateFile = sys_get_temp_dir() . '/aura_state_' . $sessionHash . '.json';

    $initialState = [
        'base_url' => $url,
        'domain' => parse_url($url, PHP_URL_HOST),
        'scheme' => parse_url($url, PHP_URL_SCHEME),
        'queue' => [$url],
        'visited' => [],
        'crawled_count' => 0,
        'issues' => [],
        'status' => 'running',
        'started_at' => time()
    ];

    file_put_contents($stateFile, json_encode($initialState));

    echo json_encode(['session_id' => $sessionHash, 'message' => 'Started Aura Audit']);
    exit;
}

if (empty($sessionId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing session_id']);
    exit;
}

$stateFile = sys_get_temp_dir() . '/aura_state_' . $sessionId . '.json';
if (!file_exists($stateFile)) {
    http_response_code(404);
    echo json_encode(['error' => 'Session not found.']);
    exit;
}

// Helper: Normalize URL
function normalizeAuraUrl($url)
{
    if (empty($url))
        return '';
    $url = preg_replace('/#.*$/', '', $url);
    $parsed = parse_url($url);
    if (!$parsed)
        return $url;

    $scheme = isset($parsed['scheme']) ? strtolower($parsed['scheme']) : 'https';
    $host = isset($parsed['host']) ? strtolower($parsed['host']) : '';
    if (!$host)
        return $url;

    $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
    $path = $parsed['path'] ?? '/';
    if ($path === '')
        $path = '/';

    $query = '';
    if (isset($parsed['query']) && $parsed['query'] !== '') {
        parse_str($parsed['query'], $params);
        ksort($params);
        $query = '?' . http_build_query($params);
    }
    return "$scheme://$host$port$path$query";
}

// Helper: Absolute URL
function absoluteAuraUrl($href, $base)
{
    if (preg_match('/^https?:\/\//i', $href))
        return $href;
    if (strpos($href, '//') === 0)
        return 'https:' . $href;

    $parsedBase = parse_url($base);
    $scheme = $parsedBase['scheme'] ?? 'http';
    $host = $parsedBase['host'] ?? '';

    if (strpos($href, '/') === 0)
        return "$scheme://$host$href";

    $path = $parsedBase['path'] ?? '/';
    $dir = dirname($path);
    if ($dir === '.')
        $dir = '';
    if (substr($dir, -1) !== '/')
        $dir .= '/';

    return "$scheme://$host$dir$href";
}

$state = json_decode(file_get_contents($stateFile), true);

if ($action === 'status') {
    echo json_encode([
        'status' => $state['status'],
        'stats' => [
            'crawled' => $state['crawled_count'],
            'pending' => count($state['queue']),
            'issues' => count($state['issues'])
        ]
    ]);
    exit;
}

if ($action === 'report') {
    echo json_encode([
        'report' => $state['issues'],
        'stats' => [
            'crawled' => $state['crawled_count']
        ]
    ]);
    exit;
}

if ($action === 'process' && $state['status'] === 'running') {
    $batchSize = 5;
    $processed = 0;

    $mh = curl_multi_init();
    $curlHandles = [];
    $activeUrls = [];

    // Pop from queue
    while ($processed < $batchSize && count($state['queue']) > 0) {
        $target = array_shift($state['queue']);
        $normalizedTarget = normalizeAuraUrl($target);

        // Skip if visited
        if (isset($state['visited'][$normalizedTarget])) {
            continue;
        }
        $state['visited'][$normalizedTarget] = true;

        $ch = curl_init($target);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_USERAGENT, 'AURA AuditBot/1.0 (Standalone)');
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

        curl_multi_add_handle($mh, $ch);
        $curlHandles[] = $ch;
        $activeUrls[] = ['raw' => $target, 'normalized' => $normalizedTarget];
        $processed++;
    }

    if ($processed === 0) {
        $state['status'] = 'completed';
        file_put_contents($stateFile, json_encode($state));
        echo json_encode(['message' => 'Completed']);
        exit;
    }

    // Execute batch
    $running = null;
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh, 0.5);
    } while ($running > 0);

    // Process responses
    foreach ($curlHandles as $idx => $ch) {
        $info = curl_getinfo($ch);
        $html = curl_multi_getcontent($ch);
        $urlData = $activeUrls[$idx];
        $originalUrl = $urlData['raw'];

        $statusCode = $info['http_code'];
        $effectiveUrl = $info['url'];

        $state['crawled_count']++;

        if ($statusCode >= 400 || $statusCode == 0) {
            $state['issues'][] = [
                'source_page' => 'External/Seed',
                'raw_href' => $originalUrl,
                'normalized_href' => $urlData['normalized'],
                'resolved_url' => $effectiveUrl,
                'status_code' => $statusCode,
                'redirect_chain' => [],
                'canonical_url' => '',
                'error_type' => 'broken',
                'recommendation' => 'Remove or fix broken link. Target returned ' . $statusCode,
                'priority' => 'high'
            ];
            continue;
        }

        // Parse HTML for new links AND canonical
        if (strpos($info['content_type'], 'text/html') !== false && !empty($html)) {
            $doc = new DOMDocument();
            @$doc->loadHTML('<?xml encoding="UTF-8">' . substr($html, 0, 500000), LIBXML_NOBLANKS | LIBXML_COMPACT);

            $canonical = '';
            foreach ($doc->getElementsByTagName('link') as $link) {
                if ($link instanceof DOMElement && strtolower($link->getAttribute('rel')) === 'canonical') {
                    $canonical = $link->getAttribute('href');
                    break;
                }
            }

            // Check if canonical differs from effective URL
            if ($canonical && normalizeAuraUrl(absoluteAuraUrl($canonical, $effectiveUrl)) !== normalizeAuraUrl($effectiveUrl)) {
                $state['issues'][] = [
                    'source_page' => $originalUrl,
                    'raw_href' => 'N/A',
                    'normalized_href' => $urlData['normalized'],
                    'resolved_url' => $effectiveUrl,
                    'status_code' => 200,
                    'redirect_chain' => [],
                    'canonical_url' => $canonical,
                    'error_type' => 'canonical_mismatch',
                    'recommendation' => 'Page canonical target differs from its actual URL. Either update canonical or redirect to it.',
                    'priority' => 'high'
                ];
            }

            // Extract internal links
            foreach ($doc->getElementsByTagName('a') as $a) {
                if ($a instanceof DOMElement) {
                    $href = trim($a->getAttribute('href'));
                    if (empty($href) || preg_match('/^(javascript|mailto|tel|#):/i', $href))
                        continue;

                    $absUrl = absoluteAuraUrl($href, $effectiveUrl);
                    $parsedExtracted = parse_url($absUrl);
                    $hostExtracted = strtolower($parsedExtracted['host'] ?? '');

                    // Only queue internal domain
                    if ($hostExtracted === $state['domain']) {
                        $normExtracted = normalizeAuraUrl($absUrl);

                        // Heuristic Issue detection
                        $errorType = null;
                        $recommendation = '';
                        $priority = 'low';

                        // 1. Case mismatch
                        if (preg_match('/[A-Z]/', $parsedExtracted['path'] ?? '')) {
                            $errorType = 'mis-cased';
                            $recommendation = 'Link path contains uppercase letters. Normalize to lowercase (e.g. ' . strtolower($href) . ').';
                            $priority = 'high';
                        }

                        // 2. Trailing slash inconsistency
                        $path = $parsedExtracted['path'] ?? '';
                        if (strlen($path) > 1 && substr($path, -1) !== '/' && strpos(basename($path), '.') === false) {
                            $errorType = 'trailing_slash';
                            $recommendation = 'Missing trailing slash on directory URL. Add slash to avoid redirect.';
                            $priority = 'medium';
                        }

                        // 3. HTTP usage on HTTPS site
                        if (isset($parsedExtracted['scheme']) && strtolower($parsedExtracted['scheme']) === 'http' && $state['scheme'] === 'https') {
                            $errorType = 'protocol_mismatch';
                            $recommendation = 'Update link from http:// to secure https://.';
                            $priority = 'high';
                        }

                        // 4. Session Parameters
                        if (isset($parsedExtracted['query']) && preg_match('/(PHPSESSID|JSESSIONID|sessionid)=/i', $parsedExtracted['query'])) {
                            $errorType = 'param_session';
                            $recommendation = 'Remove session ID from query string to avoid duplicate content indexing.';
                            $priority = 'high';
                        }

                        if ($errorType) {
                            $state['issues'][] = [
                                'source_page' => $effectiveUrl,
                                'raw_href' => $href,
                                'normalized_href' => $normExtracted,
                                'resolved_url' => 'Pending check',
                                'status_code' => 0,
                                'redirect_chain' => [],
                                'canonical_url' => '',
                                'error_type' => $errorType,
                                'recommendation' => $recommendation,
                                'priority' => $priority
                            ];
                        }

                        // Add to queue if not visited
                        if (!isset($state['visited'][$normExtracted]) && !in_array($absUrl, $state['queue'])) {
                            $state['queue'][] = $absUrl;
                        }
                    }
                }
            }
        }
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);

    if (count($state['queue']) === 0) {
        $state['status'] = 'completed';
    }

    file_put_contents($stateFile, json_encode($state));
    echo json_encode(['message' => 'Processed batch', 'processed' => $processed]);
    exit;
}
?>