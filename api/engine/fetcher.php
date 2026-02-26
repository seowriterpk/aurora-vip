<?php
require_once __DIR__ . '/../config.php';

class Fetcher
{
    private $multiCurl;
    private $handles = [];
    private $results = [];
    private $redirectChains = [];

    public function __construct()
    {
        $this->multiCurl = curl_multi_init();
    }

    // Prepare a list of URLs to be fetched concurrently
    public function queueUrls(array $urls)
    {
        foreach ($urls as $url) {
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false, // We follow manually to track chains
                CURLOPT_TIMEOUT => 20, // 20s timeout per request
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_USERAGENT => 'AURORA-X-Bot/4.0 (SEO Auditor)',
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