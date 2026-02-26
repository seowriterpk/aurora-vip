<?php
require_once __DIR__ . '/../config.php';

class Fetcher
{
    private $multiCurl;
    private $handles = [];
    private $results = [];
    private $redirectChains = [];

    private $userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ];

    public function __construct()
    {
        $this->multiCurl = curl_multi_init();
    }

    // Prepare a list of URLs to be fetched concurrently
    public function queueUrls(array $urls)
    {
        foreach ($urls as $url) {
            $ch = curl_init();
            $randomUa = $this->userAgents[array_rand($this->userAgents)];
            $randomIp = rand(1, 255) . '.' . rand(0, 255) . '.' . rand(0, 255) . '.' . rand(1, 255);

            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false, // We follow manually to track chains
                CURLOPT_TIMEOUT => 20, // 20s timeout per request
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_USERAGENT => $randomUa,
                CURLOPT_HTTPHEADER => [
                    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language: en-US,en;q=0.9",
                    "Cache-Control: max-age=0",
                    "Connection: keep-alive",
                    "Upgrade-Insecure-Requests: 1",
                    "X-Forwarded-For: $randomIp",
                    "Client-IP: $randomIp",
                    "Referer: https://www.google.com/"
                ],
                CURLOPT_HEADER => true,
                CURLOPT_ENCODING => '' // Handle gzip/deflate
            ]);

            $this->handles[$url] = $ch;
            $this->redirectChains[$url] = [];
            curl_multi_add_handle($this->multiCurl, $ch);
        }
    }

    // Execute the Multi-cURL
    public function execute()
    {
        $running = null;
        do {
            curl_multi_exec($this->multiCurl, $running);
            curl_multi_select($this->multiCurl);
        } while ($running > 0);

        foreach ($this->handles as $url => $ch) {
            $response = curl_multi_getcontent($ch);
            $info = curl_getinfo($ch);

            $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
            $headers = substr($response, 0, $headerSize);
            $body = substr($response, $headerSize);

            // Handle explicit redirects manually for tracking
            if ($info['http_code'] >= 300 && $info['http_code'] < 400) {
                if (preg_match('/^Location:\s*(.*)$/mi', $headers, $matches)) {
                    $location = trim($matches[1]);
                    // Store redirect step
                    $this->redirectChains[$url][] = [
                        'status' => $info['http_code'],
                        'url' => $location
                    ];
                    $info['redirect_target'] = $location;
                }
            }

            $this->results[$url] = [
                'info' => $info,
                'body' => $body,
                'chain' => $this->redirectChains[$url],
                'headers' => $headers
            ];

            curl_multi_remove_handle($this->multiCurl, $ch);
            curl_close($ch);
        }

        $this->handles = [];
        return $this->results;
    }

    public function close()
    {
        curl_multi_close($this->multiCurl);
    }
}
?>