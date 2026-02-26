<?php
require_once __DIR__ . '/../config.php';

class Parser
{
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
            $name = strtolower($meta->getAttribute('name'));
            if ($name === 'description')
                $metaDesc = trim($meta->getAttribute('content'));
            if ($name === 'robots')
                $metaRobots = strtolower(trim($meta->getAttribute('content')));
        }

        foreach ($doc->getElementsByTagName('link') as $link) {
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

        // Simple MD5 hash for spotting exact content duplicates
        $contentHash = md5($cleanText);

        // --- 4. Links Construction ---
        $internalLinks = [];
        $externalLinks = [];
        $baseHost = parse_url($url, PHP_URL_HOST);

        foreach ($doc->getElementsByTagName('a') as $a) {
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
                    $anchor = trim($imgs->item(0)->getAttribute('alt')) ?: 'Empty/Image';
                }
            }

            // Extract HTML Snippet for precise audits
            $snippet = $doc->saveHTML($a);
            if (strlen($snippet) > 250) {
                // truncate large nodes
                $snippet = preg_replace('/^(<a[^>]*>).*$/is', '$1...</a>', $snippet);
            }

            $linkData = [
                'url' => preg_replace('/#.*$/', '', $absUrl), // strip fragments
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
            'is_indexable' => $isIndexable,
            'internal_links' => $internalLinks,
            'external_links' => $externalLinks
        ];
    }
}
?>