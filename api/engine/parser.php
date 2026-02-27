<?php
require_once __DIR__ . '/../config.php';

class Parser
{
    // ============================================================
    // SIMHASH — 64-bit fuzzy text fingerprint for duplicate detection
    // ============================================================
    public static function simhash($text)
    {
        $tokens = str_word_count(strtolower($text), 1);
        if (count($tokens) > 10000) {
            $tokens = array_slice($tokens, 0, 10000);
        }
        $v = array_fill(0, 64, 0);

        foreach ($tokens as $token) {
            $hash = hexdec(substr(md5($token), 0, 16));
            for ($i = 0; $i < 64; $i++) {
                $bit = ($hash >> $i) & 1;
                $v[$i] += ($bit ? 1 : -1);
            }
        }

        $fingerprint = 0;
        for ($i = 0; $i < 64; $i++) {
            if ($v[$i] > 0) {
                $fingerprint |= (1 << $i);
            }
        }
        return (string) $fingerprint;
    }

    // ============================================================
    // URL NORMALIZATION — Consistent URLs, sorted query params
    // ============================================================
    public static function normalizeUrl($url)
    {
        $url = preg_replace('/#.*$/', '', $url);
        $parsed = parse_url($url);
        if (!$parsed)
            return $url;

        $scheme = isset($parsed['scheme']) ? strtolower($parsed['scheme']) : 'http';
        $host = isset($parsed['host']) ? strtolower($parsed['host']) : '';
        if (!$host)
            return $url;

        $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
        $path = $parsed['path'] ?? '/';

        if ($path === '') {
            $path = '/';
        }

        $query = '';
        if (isset($parsed['query']) && $parsed['query'] !== '') {
            parse_str($parsed['query'], $params);
            ksort($params);
            $query = '?' . http_build_query($params);
        }

        return "$scheme://$host$port$path$query";
    }

    // ============================================================
    // ABSOLUTE URL — Resolve relative URLs to absolute
    // ============================================================
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

    // ============================================================
    // MAIN HTML PARSER — Extracts ALL forensic SEO signals
    // ============================================================
    public static function parseHtml($html, $url)
    {
        if (empty($html))
            return null;

        // Truncate to 500KB for DOM safety
        $originalSize = strlen($html);
        if ($originalSize > 512000) {
            $html = substr($html, 0, 512000);
        }

        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        @$doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NOBLANKS | LIBXML_COMPACT);
        libxml_clear_errors();

        $xpath = new DOMXPath($doc);

        // ==========================================================
        // 1. META / HEAD SIGNALS
        // ==========================================================
        $titleNodes = $doc->getElementsByTagName('title');
        $title = $titleNodes->length > 0 ? trim($titleNodes->item(0)->textContent) : null;

        $metaDesc = '';
        $metaRobots = '';

        foreach ($doc->getElementsByTagName('meta') as $meta) {
            if (!($meta instanceof DOMElement))
                continue;
            $name = strtolower($meta->getAttribute('name'));
            if ($name === 'description')
                $metaDesc = trim($meta->getAttribute('content'));
            if ($name === 'robots')
                $metaRobots = strtolower(trim($meta->getAttribute('content')));
        }

        // ==========================================================
        // 2. CANONICAL — Detect multiples + canonical status
        // ==========================================================
        $canonical = '';
        $canonicalCount = 0;

        foreach ($doc->getElementsByTagName('link') as $link) {
            if (!($link instanceof DOMElement))
                continue;
            if (strtolower($link->getAttribute('rel')) === 'canonical') {
                $canonicalCount++;
                if ($canonicalCount === 1) {
                    $canonical = trim($link->getAttribute('href'));
                }
            }
        }

        $hasMultipleCanonicals = ($canonicalCount > 1) ? 1 : 0;

        // Determine canonical status
        $canonicalStatus = null;
        if (empty($canonical)) {
            $canonicalStatus = 'missing';
        } else {
            $normalizedCanonical = self::normalizeUrl(self::absoluteUrl($canonical, $url));
            $normalizedSelf = self::normalizeUrl($url);
            if ($normalizedCanonical === $normalizedSelf) {
                $canonicalStatus = 'self';
            } else {
                $canonicalStatus = 'mismatch';
            }
        }

        // ==========================================================
        // 3. HREFLANG TAGS
        // ==========================================================
        $hreflangs = [];
        foreach ($doc->getElementsByTagName('link') as $link) {
            if (!($link instanceof DOMElement))
                continue;
            if (strtolower($link->getAttribute('rel')) === 'alternate') {
                $hreflang = $link->getAttribute('hreflang');
                $href = $link->getAttribute('href');
                if ($hreflang && $href) {
                    $hreflangs[] = [
                        'lang' => $hreflang,
                        'url' => self::normalizeUrl(self::absoluteUrl($href, $url))
                    ];
                }
            }
        }

        // ==========================================================
        // 4. HEADINGS — Full H1-H6 hierarchy for structure audit
        // ==========================================================
        $h1Text = null;
        $h1Count = 0;
        $h2s = [];
        $hStructure = [];

        foreach (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as $htag) {
            foreach ($doc->getElementsByTagName($htag) as $hnode) {
                $text = trim($hnode->textContent);
                if (!$text)
                    continue;

                $hStructure[] = ['tag' => $htag, 'text' => mb_substr($text, 0, 200)];

                if ($htag === 'h1') {
                    $h1Count++;
                    if ($h1Count === 1)
                        $h1Text = $text;
                }
                if ($htag === 'h2') {
                    $h2s[] = $text;
                }
            }
        }

        // Flag multiple H1s
        if ($h1Count > 1) {
            $h1Text .= " [MULTIPLE H1 DETECTED]";
        }

        // ==========================================================
        // 5. BODY CONTENT & METRICS
        // ==========================================================
        $bodyNodes = $doc->getElementsByTagName('body');
        $bodyText = $bodyNodes->length > 0 ? $bodyNodes->item(0)->textContent : '';
        $cleanText = preg_replace('/\s+/', ' ', trim($bodyText));

        $wordCount = str_word_count($cleanText);
        $textSizeBytes = strlen($cleanText);
        $totalSizeBytes = strlen($html);
        $textRatio = $totalSizeBytes > 0 ? round(($textSizeBytes / $totalSizeBytes) * 100) : 0;
        $contentHash = self::simhash($cleanText);

        // ==========================================================
        // 6. SOFT 404 DETECTION
        // ==========================================================
        $soft404 = 0;
        $lowerBody = strtolower($cleanText);
        $soft404Patterns = [
            'page not found',
            'not found',
            '404 error',
            'page doesn\'t exist',
            'no longer available',
            'no results found',
            'this page has been removed',
            'we couldn\'t find',
            'page you requested was not found'
        ];
        foreach ($soft404Patterns as $pattern) {
            if (strpos($lowerBody, $pattern) !== false && $wordCount < 150) {
                $soft404 = 1;
                break;
            }
        }

        // ==========================================================
        // 7. SCHEMA.ORG (JSON-LD) EXTRACTION
        // ==========================================================
        $schemas = [];
        foreach ($doc->getElementsByTagName('script') as $script) {
            if (!($script instanceof DOMElement))
                continue;
            if (strtolower($script->getAttribute('type')) === 'application/ld+json') {
                $jsonText = trim($script->textContent);
                if ($jsonText) {
                    $decoded = @json_decode($jsonText, true);
                    if (is_array($decoded)) {
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

        // ==========================================================
        // 8. IMAGE SEO EXTRACTION
        // ==========================================================
        $images = [];
        $imagesCount = 0;
        $imagesMissingAlt = 0;
        $imagesOversized = 0;

        foreach ($doc->getElementsByTagName('img') as $img) {
            if (!($img instanceof DOMElement))
                continue;
            $src = trim($img->getAttribute('src'));
            if (empty($src))
                continue;

            $alt = $img->getAttribute('alt');
            $width = $img->getAttribute('width') ?: null;
            $height = $img->getAttribute('height') ?: null;
            $loading = strtolower($img->getAttribute('loading'));
            $hasLazy = ($loading === 'lazy') ? 1 : 0;

            // Detect format from extension
            $pathParts = pathinfo(parse_url($src, PHP_URL_PATH) ?: '');
            $format = strtolower($pathParts['extension'] ?? 'unknown');

            $imagesCount++;
            if ($alt === null || $alt === '') {
                $imagesMissingAlt++;
            }

            // Cap at 100 images per page for DB storage
            if (count($images) < 100) {
                $images[] = [
                    'src' => self::normalizeUrl(self::absoluteUrl($src, $url)),
                    'alt' => $alt,
                    'width' => $width ? (int) $width : null,
                    'height' => $height ? (int) $height : null,
                    'has_lazy_loading' => $hasLazy,
                    'format' => $format,
                ];
            }
        }

        // ==========================================================
        // 9. FORM ACTION URL EXTRACTION
        // ==========================================================
        $formActions = [];
        foreach ($doc->getElementsByTagName('form') as $form) {
            if (!($form instanceof DOMElement))
                continue;
            $action = trim($form->getAttribute('action'));
            if (!empty($action) && !preg_match('/^(javascript|#):/i', $action)) {
                $absAction = self::normalizeUrl(self::absoluteUrl($action, $url));
                $formActions[] = $absAction;
            }
        }

        // ==========================================================
        // 10. LINK EXTRACTION (Internal + External)
        // ==========================================================
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
                $imgs = $a->getElementsByTagName('img');
                if ($imgs->length > 0) {
                    $imgEl = $imgs->item(0);
                    $anchor = ($imgEl instanceof DOMElement) ? trim($imgEl->getAttribute('alt')) : 'Empty/Image';
                    if (!$anchor)
                        $anchor = 'Empty/Image';
                }
            }

            // HTML snippet for evidence
            $snippet = $doc->saveHTML($a);
            if (strlen($snippet) > 250) {
                $snippet = preg_replace('/^(<a[^>]*>).*$/is', '$1...</a>', $snippet);
            }

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

        // ==========================================================
        // 11. INDEXABILITY SCORE (0-100)
        // ==========================================================
        $isIndexable = 1;
        $indexabilityScore = 100;

        // Noindex check
        if (strpos($metaRobots, 'noindex') !== false) {
            $isIndexable = 0;
            $indexabilityScore -= 100;
        }
        // Canonical mismatch
        if ($canonicalStatus === 'mismatch') {
            $indexabilityScore -= 50;
        }
        // Missing canonical
        if ($canonicalStatus === 'missing') {
            $indexabilityScore -= 10;
        }
        // Thin content
        if ($wordCount < 50) {
            $indexabilityScore -= 30;
        } elseif ($wordCount < 100) {
            $indexabilityScore -= 15;
        }
        // Soft 404
        if ($soft404) {
            $indexabilityScore -= 80;
        }
        // Multiple canonicals
        if ($hasMultipleCanonicals) {
            $indexabilityScore -= 20;
        }
        // Nofollow
        if (strpos($metaRobots, 'nofollow') !== false) {
            $indexabilityScore -= 10;
        }

        // Clamp to 0-100
        $indexabilityScore = max(0, min(100, $indexabilityScore));

        // ==========================================================
        // RETURN ALL SIGNALS
        // ==========================================================
        return [
            // On-Page SEO
            'title' => $title,
            'meta_desc' => $metaDesc,
            'h1' => $h1Text,
            'h2_json' => json_encode($h2s),
            'h_structure_json' => json_encode($hStructure),
            'canonical' => $canonical,
            'canonical_status' => $canonicalStatus,
            'has_multiple_canonicals' => $hasMultipleCanonicals,
            'meta_robots' => $metaRobots,
            'schema_types' => $schemaTypesRaw,

            // Forensic Signals
            'hreflang_json' => json_encode($hreflangs),
            'soft_404' => $soft404,
            'is_indexable' => $isIndexable,
            'indexability_score' => $indexabilityScore,

            // Content Metrics
            'word_count' => $wordCount,
            'text_ratio_percent' => $textRatio,
            'content_hash' => $contentHash,

            // Image SEO
            'images' => $images,
            'images_count' => $imagesCount,
            'images_missing_alt' => $imagesMissingAlt,
            'images_oversized' => $imagesOversized,

            // URL Discovery
            'form_actions_json' => json_encode($formActions),

            // Links
            'internal_links' => $internalLinks,
            'external_links' => $externalLinks,

            // Hreflang-discovered URLs (for queue insertion)
            'hreflang_urls' => array_column($hreflangs, 'url'),
            // Form-discovered URLs (for queue insertion)
            'form_urls' => $formActions,
        ];
    }
}
?>