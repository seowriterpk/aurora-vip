<?php
// AURORA-X PHP Proxy for Hostinger Shared Hosting
// Place this file in your public_html folder (or wherever your index.html is)

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$url = $_GET['url'] ?? '';

if (!$url) {
    http_response_code(400);
    echo "Missing URL parameter";
    exit;
}

// Validate URL
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo "Invalid URL";
    exit;
}

// Manual Redirect Tracking
$maxRedirects = 5;
$redirectChain = [];
$currentUrl = $url;
$finalBody = '';
$finalContentType = '';
$finalHttpCode = 0;
$error = '';

for ($i = 0; $i <= $maxRedirects; $i++) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $currentUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true); // Need headers to get Location
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false); // Manual follow
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'AURORA-X-Bot/3.0 (Compatible; +https://aurora-x.app)');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    
    if (curl_errno($ch)) {
        $error = curl_error($ch);
        curl_close($ch);
        break;
    }

    $headers = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    
    $redirectChain[] = ['url' => $currentUrl, 'status' => $httpCode];
    
    if ($httpCode >= 300 && $httpCode < 400 && preg_match('/^Location:\s*(.+)$/mi', $headers, $matches)) {
        $location = trim($matches[1]);
        // Handle relative redirects
        $parsedLocation = parse_url($location);
        if (!isset($parsedLocation['host'])) {
            $parsedCurrent = parse_url($currentUrl);
            $scheme = $parsedCurrent['scheme'] ?? 'http';
            $host = $parsedCurrent['host'] ?? '';
            // Very simple relative resolve logic (for robust auditing a full URL resolver is better, but this works for 90% of cases)
            if (strpos($location, '/') === 0) {
                $location = $scheme . '://' . $host . $location;
            } else {
                $path = $parsedCurrent['path'] ?? '/';
                $dir = dirname($path);
                $location = $scheme . '://' . $host . ($dir === '/' ? '/' : $dir . '/') . $location;
            }
        }
        $currentUrl = $location;
        curl_close($ch);
    } else {
        $finalContentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $finalHttpCode = $httpCode;
        $finalBody = $body;
        curl_close($ch);
        break;
    }
}

if ($error) {
    http_response_code(500);
    echo "Proxy Error: " . $error;
    exit;
}

// Forward Content-Type and Redirect Chain
header("Content-Type: " . $finalContentType);
header("X-Proxy-Redirect-Chain: " . json_encode($redirectChain));
http_response_code($finalHttpCode);

echo $finalBody;
?>
