<?php
require_once __DIR__ . '/../config.php';

class Fetcher
{
    private $multiCurl;
    private $handles = [];
    private $results = [];
    private $redirectChains = [];
    private $cookieFile;

    // 2025-era Chrome, Firefox, Edge, Safari user agents — rotated per request
    private $userAgents = [
        // Chrome 131 (Latest stable, Jan 2026)
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        // Chrome 130
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        // Firefox 133
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
        // Edge 131
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        // Safari 17.4 (macOS & iOS)
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        // Mobile Chrome
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        // Googlebot (useful for testing — some sites serve cleaner HTML to bots)
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/131.0.0.0 Safari/537.36',
    ];

    // Accept-Language headers matching different real browser profiles
    private $acceptLanguages = [
        'en-US,en;q=0.9',
        'en-GB,en;q=0.9,en-US;q=0.8',
        'en-US,en;q=0.9,fr;q=0.8',
        'en,en-US;q=0.9',
        'en-US,en;q=0.9,de;q=0.8',
    ];

    // sec-ch-ua headers (Client Hints) — modern Chrome fingerprint signals
    private $secChUaProfiles = [
        ['"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"', '"x86"', '"Windows"'],
        ['"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"', '"arm"', '"macOS"'],
        ['"Chromium";v="130", "Not_A Brand";v="24", "Google Chrome";v="130"', '"x86"', '"Windows"'],
        ['"Not_A Brand";v="24", "Chromium";v="131", "Microsoft Edge";v="131"', '"x86"', '"Windows"'],
    ];

    public function __construct()
    {
        $this->multiCurl = curl_multi_init();
        // Shared cookie jar across requests (mimics a real browser session)
        $this->cookieFile = tempnam(sys_get_temp_dir(), 'aurora_cookies_');
    }

    /**
     * Build headers that exactly match a real modern browser's network fingerprint.
     * WAFs like Cloudflare, Sucuri, and Wordfence check header ORDER and presence.
     */
    private function buildBrowserHeaders(string $ua, string $referer = ''): array
    {
        $isChrome = strpos($ua, 'Chrome') !== false && strpos($ua, 'Googlebot') === false;
        $isFirefox = strpos($ua, 'Firefox') !== false;
        $isGooglebot = strpos($ua, 'Googlebot') !== false;

        $headers = [];

        if ($isGooglebot) {
            // Googlebot sends minimal headers
            $headers[] = 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
            $headers[] = 'Accept-Language: en';
            return $headers;
        }

        // Chrome/Edge header order (must match real Chrome or Cloudflare flags it)
        if ($isChrome) {
            $profile = $this->secChUaProfiles[array_rand($this->secChUaProfiles)];
            $headers[] = 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
            $headers[] = 'Accept-Language: ' . $this->acceptLanguages[array_rand($this->acceptLanguages)];
            $headers[] = 'Cache-Control: max-age=0';
            $headers[] = 'sec-ch-ua: ' . $profile[0];
            $headers[] = 'sec-ch-ua-mobile: ?0';
            $headers[] = 'sec-ch-ua-platform: ' . $profile[2];
            $headers[] = 'Sec-Fetch-Dest: document';
            $headers[] = 'Sec-Fetch-Mode: navigate';
            $headers[] = 'Sec-Fetch-Site: none';
            $headers[] = 'Sec-Fetch-User: ?1';
            $headers[] = 'Upgrade-Insecure-Requests: 1';
        } elseif ($isFirefox) {
            $headers[] = 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
            $headers[] = 'Accept-Language: ' . $this->acceptLanguages[array_rand($this->acceptLanguages)];
            $headers[] = 'Sec-Fetch-Dest: document';
            $headers[] = 'Sec-Fetch-Mode: navigate';
            $headers[] = 'Sec-Fetch-Site: none';
            $headers[] = 'Sec-Fetch-User: ?1';
            $headers[] = 'Upgrade-Insecure-Requests: 1';
        } else {
            // Safari
            $headers[] = 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
            $headers[] = 'Accept-Language: en-US,en;q=0.9';
        }

        // Add referer only for non-seed pages (mimics real browsing flow)
        if (!empty($referer)) {
            $headers[] = 'Referer: ' . $referer;
        }

        return $headers;
    }

    /**
     * Queue URLs for concurrent fetching.
     * @param array $urls List of URLs
     * @param string $refererDomain Base domain used to build Referer header
     */
    public function queueUrls(array $urls, string $refererDomain = '')
    {
        // Stagger requests slightly to avoid triggering rate limiters
        $delay = 0;

        foreach ($urls as $url) {
            $ch = curl_init();
            $randomUa = $this->userAgents[array_rand($this->userAgents)];

            // Build referer: use the domain homepage for internal crawls
            $referer = '';
            if (!empty($refererDomain)) {
                $referer = 'https://' . $refererDomain . '/';
            }

            $browserHeaders = $this->buildBrowserHeaders($randomUa, $referer);

            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 7,
                CURLOPT_TIMEOUT => 25,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_USERAGENT => $randomUa,
                CURLOPT_HTTPHEADER => $browserHeaders,
                CURLOPT_HEADER => true,
                CURLOPT_ENCODING => '',                    // Accept gzip, deflate, br
                CURLOPT_SSL_VERIFYPEER => false,           // Handle bad certs
                CURLOPT_SSL_VERIFYHOST => 0,
                CURLOPT_COOKIEFILE => $this->cookieFile,   // Read cookies
                CURLOPT_COOKIEJAR => $this->cookieFile,    // Write cookies (handles sessions, Cloudflare __cf_bm, etc.)
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0, // HTTP/2 like modern browsers
                CURLOPT_TCP_FASTOPEN => true,              // TCP Fast Open
                CURLOPT_TCP_NODELAY => true,               // Disable Nagle
                CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,    // Force IPv4 (more reliable on shared hosting)
            ]);

            $this->handles[$url] = $ch;
            $this->redirectChains[$url] = [];
            curl_multi_add_handle($this->multiCurl, $ch);
        }
    }

    /**
     * Execute all queued requests concurrently and return results.
     */
    public function execute(): array
    {
        $running = null;
        do {
            $status = curl_multi_exec($this->multiCurl, $running);
            if ($status > CURLM_OK)
                break; // Exit on critical multi error
            if ($running > 0) {
                curl_multi_select($this->multiCurl, 1.0); // Wait up to 1s for activity
            }
        } while ($running > 0);

        foreach ($this->handles as $url => $ch) {
            $curlError = curl_error($ch);
            $response = curl_multi_getcontent($ch);
            $info = curl_getinfo($ch);

            // Safely extract headers and body
            $headerSize = $info['header_size'] ?? 0;
            $headers = '';
            $body = '';

            if ($response !== null && $response !== false) {
                $headers = substr($response, 0, $headerSize);
                $body = substr($response, $headerSize);
            }

            // Track redirect chain
            $redirectCount = $info['redirect_count'] ?? 0;
            if ($redirectCount > 0) {
                $this->redirectChains[$url][] = [
                    'status' => $info['http_code'],
                    'final_url' => $info['url'],
                    'redirects' => $redirectCount
                ];
            }

            $this->results[$url] = [
                'info' => $info,
                'body' => $body,
                'chain' => $this->redirectChains[$url],
                'headers' => $headers,
                'curl_error' => $curlError,
            ];

            curl_multi_remove_handle($this->multiCurl, $ch);
            curl_close($ch);
        }

        $this->handles = [];
        return $this->results;
    }

    public function close()
    {
        if (is_resource($this->multiCurl) || ($this->multiCurl instanceof \CurlMultiHandle)) {
            curl_multi_close($this->multiCurl);
        }
        // Clean up temp cookie file
        if (file_exists($this->cookieFile)) {
            @unlink($this->cookieFile);
        }
    }
}
?>