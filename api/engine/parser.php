<?php
require_once __DIR__ . '/../config.php';

class Parser
{
    // Basic Simhash implementation for 64-bit fuzzy text matching
    public static function simhash($text)
    {
        // Cap tokens at 10,000 to prevent CPU spike on massive text bodies
        $tokens = str_word_count(strtolower($text), 1);
        if (count($tokens) > 10000) {
            $tokens = array_slice($tokens, 0, 10000);
        }
        $v = array_fill(0, 64, 0);

        foreach ($tokens as $token) {
            // Get 64-bit hash of token
            $hash = hexdec(substr(md5($token), 0, 16));
            for ($i = 0; $i < 64; $i++) {
                $bit = ($hash >> $i) & 1;
                $v[$i] += ($bit ? 1 : -1);
            }
        }

        $fingerprint = 0;
        for ($i = 0; $i < 64; $i++) {
            if ($v[$i] > 0) {
                // Set the i-th bit to 1
                $fingerprint |= (1 << $i);
            }
        }
        return (string) $fingerprint; // Return as string for DB safety
    }

    // Ensure URLs are stripped of fragments, have consistent trailing slashes, and lowercase domains
    public static function normalizeUrl($url)
    {
        // 1. Strip fragments (#anchor)
        $url = preg_replace('/#.*$/', '', $url);

        // 2. Parse the URL
        $parsed = parse_url($url);
        if (!$parsed)
            return $url;

        $scheme = isset($parsed['scheme']) ? strtolower($parsed['scheme']) : 'http';
        $host = isset($parsed['host']) ? strtolower($parsed['host']) : ''; // Lowercase domain
        if (!$host)
            return $url;

        $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
        $path = $parsed['path'] ?? '/';

        // 3. Trailing slash consistency: force trailing slash on root, remove it on files
        if ($path === '' || $path === '/') {
            $path = '/';
        } else {
            // Remove trailing slash if it's not the root path
            $path = rtrim($path, '/');
        }

        // RISK 14 FIX: Sort query parameters alphabetically to prevent
        // scope explosion from permutations (?a=1&b=2 vs ?b=2&a=1)
        $query = '';
        if (isset($parsed['query']) && $parsed['query'] !== '') {
            parse_str($parsed['query'], $params);
            ksort($params);
            $query = '?' . http_build_query($params);
        }

        return "$scheme://$host$port$path$query";
    }

    // Standardizes URLs relative to base
    public static function absoluteUrl($href, $base)
    {
        if (preg_match('/^https?:\/\//i', $href))
            return $href;
        if (strpos($href, '//') === 0)
            return 'https:' . $href;

        $parsedBase = parse_url($base);
        $scheme = $parsedBase['scheme'] ?? 'http';
        $host = $parsedBase['host'] ?? '';
        $port = isset($parsedBase['port']) ? ':' . $parsedBase['port'] : '';

        if (strpos($href, '/') === 0) {
            return "$scheme://$host$port$href";
        }

        $path = $parsedBase['path'] ?? '/';
        $dir = dirname($path);
        if ($dir === '.')
            $dir = '';
        if (substr($dir, -1) !== '/')
            $dir .= '/';

        return "$scheme://$host$port$dir$href";
    }

    public static function parseHtml($html, $url)
    {
        if (empty($html))
            return null;

        // RISK 4 FIX: Truncate HTML to 500KB for DOM parsing
        // All SEO signals (title, meta, H1, canonical, schema) are in <head> or early <body>
        // This prevents 3-5x memory amplification on 1MB+ pages
        $originalSize = strlen($html);
        if ($originalSize > 512000) {
            $html = substr($html, 0, 512000);
        }

        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        // Ensure UTF-8 HTML loading
        @$doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NOBLANKS | LIBXML_COMPACT);
        libxml_clear_errors();

        $xpath = new DOMXPath($doc);

        // --- 1. Meta / Head ---
        $titleNodes = $doc->getElementsByTagName('title');
        $title = $titleNodes->length > 0 ? trim($titleNodes->item(0)->textContent) : null;

        $metaDesc = '';
        $metaRobots = '';
        $canonical = '';

        foreach ($doc->getElementsByTagName('meta') as $meta) {
            if (!($meta instanceof DOMElement))
                continue;
            $name = strtolower($meta->getAttribute('name'));
            if ($name === 'description')
                $metaDesc = trim($meta->getAttribute('content'));
            if ($name === 'robots')
                $metaRobots = strtolower(trim($meta->getAttribute('content')));
        }

        foreach ($doc->getElementsByTagName('link') as $link) {
            if (!($link instanceof DOMElement))
                continue;
            if (strtolower($link->getAttribute('rel')) === 'canonical') {
                $canonical = trim($link->getAttribute('href'));
            }
        }

        // --- 2. Headings ---
        $h1Nodes = $doc->getElementsByTagName('h1');
        $h1 = $h1Nodes->length > 0 ? trim($h1Nodes->item(0)->textContent) : null;
        // multiple H1s checker
        if ($h1Nodes->length > 1) {
            $h1 .= " [MULTIPLE H1 DETECTED]";
        }

        $h2s = [];
        foreach ($doc->getElementsByTagName('h2') as $h2node) {
            $h2txt = trim($h2node->textContent);
            if ($h2txt)
                $h2s[] = $h2txt;
        }

        // --- 3. Body Content & Size ---
        $bodyNodes = $doc->getElementsByTagName('body');
        $bodyText = $bodyNodes->length > 0 ? $bodyNodes->item(0)->textContent : '';
        $cleanText = preg_replace('/\s+/', ' ', trim($bodyText));

        $wordCount = str_word_count($cleanText);
        $textSizeBytes = strlen($cleanText);
        $totalSizeBytes = strlen($html);
        $textRatio = $totalSizeBytes > 0 ? round(($textSizeBytes / $totalSizeBytes) * 100) : 0;

        // Use custom Simhash for fuzzy duplicate detection (replaces fragile MD5)
        $contentHash = self::simhash($cleanText);

        // --- 4. Schema.org (JSON-LD) Extraction ---
        $schemas = [];
        foreach ($doc->getElementsByTagName('script') as $script) {
            if (!($script instanceof DOMElement))
                continue;
            if (strtolower($script->getAttribute('type')) === 'application/ld+json') {
                $jsonText = trim($script->textContent);
                if ($jsonText) {
                    $decoded = @json_decode($jsonText, true);
                    if (is_array($decoded)) {
                        // Extract just the @type to keep DB lightweight
                        if (isset($decoded['@type'])) {
                            $schemas[] = is_array($decoded['@type']) ? implode(',', $decoded['@type']) : $decoded['@type'];
                        } elseif (isset($decoded['@graph']) && is_array($decoded['@graph'])) {
                            foreach ($decoded['@graph'] as $graphItem) {
                                if (isset($graphItem['@type'])) {
                                    $schemas[] = is_array($graphItem['@type']) ? implode(',', $graphItem['@type']) : $graphItem['@type'];
                                }
                            }
                        }
                    }
                }
            }
        }
        $schemaTypesRaw = implode(', ', array_unique($schemas));

        // --- 5. Links Construction ---
        $internalLinks = [];
        $externalLinks = [];
        $baseHost = parse_url($url, PHP_URL_HOST);

        foreach ($doc->getElementsByTagName('a') as $a) {
            if (!($a instanceof DOMElement))
                continue;
            $href = trim($a->getAttribute('href'));
            if (empty($href) || preg_match('/^(javascript|mailto|tel|#):/i', $href))
                continue;

            $absUrl = self::absoluteUrl($href, $url);
            $parsedAbs = parse_url($absUrl);
            $absHost = $parsedAbs['host'] ?? '';

            $anchor = trim($a->textContent);
            if (empty($anchor)) {
                // check if image is anchor
                $imgs = $a->getElementsByTagName('img');
                if ($imgs->length > 0) {
                    $img = $imgs->item(0);
                    $anchor = ($img instanceof DOMElement) ? trim($img->getAttribute('alt')) : 'Empty/Image';
                    if (!$anchor)
                        $anchor = 'Empty/Image';
                }
            }

            // Extract HTML Snippet for precise audits
            $snippet = $doc->saveHTML($a);
            if (strlen($snippet) > 250) {
                // truncate large nodes
                $snippet = preg_replace('/^(<a[^>]*>).*$/is', '$1...</a>', $snippet);
            }

            // Normalize before saving to prevent infinite loop duplicate traps
            $finalUrl = self::normalizeUrl($absUrl);

            $linkData = [
                'url' => $finalUrl,
                'anchor' => $anchor,
                'snippet' => $snippet,
            ];

            if ($absHost === $baseHost) {
                $internalLinks[] = $linkData;
            } else {
                $externalLinks[] = $linkData;
            }
        }

        // --- 5. Indexability ---
        $isIndexable = 1;
        if (strpos($metaRobots, 'noindex') !== false) {
            $isIndexable = 0;
        }

        return [
            'title' => $title,
            'meta_desc' => $metaDesc,
            'h1' => $h1,
            'h2_json' => json_encode($h2s),
            'canonical' => $canonical,
            'meta_robots' => $metaRobots,
            'word_count' => $wordCount,
            'text_ratio_percent' => $textRatio,
            'content_hash' => $contentHash,
            'schema_types' => $schemaTypesRaw,
            'is_indexable' => $isIndexable,
            'internal_links' => $internalLinks,
            'external_links' => $externalLinks
        ];
    }
}
?>