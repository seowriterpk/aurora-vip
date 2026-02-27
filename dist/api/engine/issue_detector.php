<?php
/**
 * AURORA Issue Auto-Detection Engine
 * 
 * Runs AFTER each page is parsed. Analyzes extracted signals
 * and automatically inserts issues into the `issues` table.
 * 
 * Called from worker.php after successful page processing.
 */

class IssueDetector
{
    private $db;
    private $crawlId;

    public function __construct($db, $crawlId)
    {
        $this->db = $db;
        $this->crawlId = $crawlId;
    }

    /**
     * Run all detectors for a single page
     */
    public function analyze($pageId, $url, $parsed, $statusCode, $xRobotsTag = null)
    {
        $issues = [];

        // Only run content checks on 200 OK pages
        if ($statusCode == 200) {
            $issues = array_merge($issues, $this->checkTitle($url, $parsed));
            $issues = array_merge($issues, $this->checkMetaDesc($url, $parsed));
            $issues = array_merge($issues, $this->checkH1($url, $parsed));
            $issues = array_merge($issues, $this->checkHeadingHierarchy($url, $parsed));
            $issues = array_merge($issues, $this->checkCanonical($url, $parsed));
            $issues = array_merge($issues, $this->checkImages($url, $parsed));
            $issues = array_merge($issues, $this->checkThinContent($url, $parsed));
            $issues = array_merge($issues, $this->checkSoft404($url, $parsed));
            $issues = array_merge($issues, $this->checkIndexability($url, $parsed, $xRobotsTag));
        }

        // Status code issues (run on all pages)
        $issues = array_merge($issues, $this->checkStatusCode($url, $statusCode));

        // Batch insert all issues
        if (!empty($issues)) {
            $stmt = $this->db->prepare("
                INSERT INTO issues (crawl_id, page_id, url, type, severity, message, description, recommendation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");

            foreach ($issues as $issue) {
                try {
                    $stmt->execute([
                        $this->crawlId,
                        $pageId,
                        $url,
                        $issue['type'],
                        $issue['severity'],
                        $issue['message'],
                        $issue['description'] ?? null,
                        $issue['recommendation'] ?? null,
                    ]);
                } catch (\PDOException $e) {
                    // Ignore duplicate issues
                }
            }
        }

        return count($issues);
    }

    // ============================================================
    // TITLE CHECKS
    // ============================================================
    private function checkTitle($url, $parsed)
    {
        $issues = [];
        $title = $parsed['title'] ?? '';

        if (empty($title)) {
            $issues[] = [
                'type' => 'missing_title',
                'severity' => 'Medium',
                'message' => 'Page has no title tag',
                'description' => 'Title tags are critical for SEO ranking and SERP display.',
                'recommendation' => 'Add a unique, descriptive <title> tag between 30-60 characters.',
            ];
        } else {
            $len = mb_strlen($title);
            if ($len > 60) {
                $issues[] = [
                    'type' => 'title_too_long',
                    'severity' => 'Low',
                    'message' => "Title is {$len} characters (max 60)",
                    'description' => "Title: " . mb_substr($title, 0, 80) . "...",
                    'recommendation' => 'Shorten the title to under 60 characters to prevent truncation in Google SERPs.',
                ];
            }
            if ($len < 30 && $len > 0) {
                $issues[] = [
                    'type' => 'title_too_short',
                    'severity' => 'Low',
                    'message' => "Title is only {$len} characters (min 30)",
                    'description' => "Title: {$title}",
                    'recommendation' => 'Expand the title to at least 30 characters for better SERP visibility.',
                ];
            }
        }

        return $issues;
    }

    // ============================================================
    // META DESCRIPTION CHECKS
    // ============================================================
    private function checkMetaDesc($url, $parsed)
    {
        $issues = [];
        $desc = $parsed['meta_desc'] ?? '';

        if (empty($desc)) {
            $issues[] = [
                'type' => 'missing_meta_desc',
                'severity' => 'Medium',
                'message' => 'Page has no meta description',
                'description' => 'Meta descriptions improve CTR in search results.',
                'recommendation' => 'Add a compelling meta description between 50-160 characters.',
            ];
        } else {
            $len = mb_strlen($desc);
            if ($len > 160) {
                $issues[] = [
                    'type' => 'meta_desc_too_long',
                    'severity' => 'Low',
                    'message' => "Meta description is {$len} chars (max 160)",
                    'recommendation' => 'Shorten to under 160 characters to prevent truncation.',
                ];
            }
            if ($len < 50 && $len > 0) {
                $issues[] = [
                    'type' => 'meta_desc_too_short',
                    'severity' => 'Low',
                    'message' => "Meta description is only {$len} chars (min 50)",
                    'recommendation' => 'Expand to at least 50 characters for better SERP snippets.',
                ];
            }
        }

        return $issues;
    }

    // ============================================================
    // H1 CHECKS
    // ============================================================
    private function checkH1($url, $parsed)
    {
        $issues = [];
        $h1 = $parsed['h1'] ?? '';

        if (empty($h1)) {
            $issues[] = [
                'type' => 'missing_h1',
                'severity' => 'Medium',
                'message' => 'Page has no H1 heading',
                'recommendation' => 'Add a single H1 tag that describes the main topic of the page.',
            ];
        } elseif (strpos($h1, '[MULTIPLE H1 DETECTED]') !== false) {
            $issues[] = [
                'type' => 'multiple_h1',
                'severity' => 'Medium',
                'message' => 'Page has multiple H1 headings',
                'description' => 'Multiple H1s dilute topical focus and confuse search engines.',
                'recommendation' => 'Keep only one H1 per page. Demote extras to H2.',
            ];
        }

        return $issues;
    }

    // ============================================================
    // HEADING HIERARCHY CHECKS
    // ============================================================
    private function checkHeadingHierarchy($url, $parsed)
    {
        $issues = [];
        $structure = json_decode($parsed['h_structure_json'] ?? '[]', true);

        if (empty($structure))
            return $issues;

        // Check for skipped levels (H1 → H3, skipping H2)
        $prevLevel = 0;
        foreach ($structure as $heading) {
            $level = (int) substr($heading['tag'], 1);
            if ($prevLevel > 0 && $level > $prevLevel + 1) {
                $issues[] = [
                    'type' => 'heading_skip',
                    'severity' => 'Low',
                    'message' => "Heading hierarchy skips from H{$prevLevel} to H{$level}",
                    'description' => "Skipped at: \"{$heading['text']}\"",
                    'recommendation' => "Use sequential heading levels (H1 → H2 → H3). Don't skip H" . ($prevLevel + 1) . ".",
                ];
                break; // Report only first skip per page
            }
            $prevLevel = $level;
        }

        return $issues;
    }

    // ============================================================
    // CANONICAL CHECKS
    // ============================================================
    private function checkCanonical($url, $parsed)
    {
        $issues = [];

        if ($parsed['has_multiple_canonicals']) {
            $issues[] = [
                'type' => 'multiple_canonicals',
                'severity' => 'High',
                'message' => 'Page has multiple canonical tags',
                'description' => 'Multiple canonicals confuse search engines about the authoritative URL.',
                'recommendation' => 'Keep only ONE canonical tag per page. Remove duplicates from templates/plugins.',
            ];
        }

        if ($parsed['canonical_status'] === 'missing') {
            $issues[] = [
                'type' => 'missing_canonical',
                'severity' => 'Medium',
                'message' => 'Page has no self-referencing canonical tag',
                'recommendation' => 'Add <link rel="canonical" href="..."> pointing to the page itself.',
            ];
        }

        return $issues;
    }

    // ============================================================
    // IMAGE SEO CHECKS
    // ============================================================
    private function checkImages($url, $parsed)
    {
        $issues = [];
        $missingAlt = $parsed['images_missing_alt'] ?? 0;
        $totalImages = $parsed['images_count'] ?? 0;

        if ($missingAlt > 0) {
            $issues[] = [
                'type' => 'images_missing_alt',
                'severity' => ($missingAlt > 5) ? 'High' : 'Medium',
                'message' => "{$missingAlt} of {$totalImages} images missing alt text",
                'recommendation' => 'Add descriptive alt attributes to all images for accessibility and image SEO.',
            ];
        }

        return $issues;
    }

    // ============================================================
    // THIN CONTENT CHECKS
    // ============================================================
    private function checkThinContent($url, $parsed)
    {
        $issues = [];
        $wc = $parsed['word_count'] ?? 0;

        if ($wc < 50) {
            $issues[] = [
                'type' => 'thin_content',
                'severity' => 'High',
                'message' => "Extremely thin page: only {$wc} words",
                'description' => 'Google may flag this as thin content or a soft 404.',
                'recommendation' => 'Add substantial, unique content (300+ words) or noindex this page.',
            ];
        } elseif ($wc < 100) {
            $issues[] = [
                'type' => 'thin_content',
                'severity' => 'Medium',
                'message' => "Low content page: only {$wc} words",
                'recommendation' => 'Consider expanding content to at least 300 words for SEO value.',
            ];
        }

        $textRatio = $parsed['text_ratio_percent'] ?? 0;
        if ($textRatio < 10 && $wc > 0) {
            $issues[] = [
                'type' => 'low_text_ratio',
                'severity' => 'Medium',
                'message' => "Text-to-HTML ratio is {$textRatio}% (below 10%)",
                'recommendation' => 'Reduce HTML bloat (inline styles, unused scripts) or add more text content.',
            ];
        }

        return $issues;
    }

    // ============================================================
    // SOFT 404 CHECKS
    // ============================================================
    private function checkSoft404($url, $parsed)
    {
        $issues = [];

        if ($parsed['soft_404'] ?? 0) {
            $issues[] = [
                'type' => 'soft_404',
                'severity' => 'High',
                'message' => 'Page returns 200 but appears to be a 404 (soft 404)',
                'description' => 'Content contains "not found" / "no results" patterns with low word count.',
                'recommendation' => 'Return a proper 404/410 status code, or add real content to this page.',
            ];
        }

        return $issues;
    }

    // ============================================================
    // INDEXABILITY CHECKS
    // ============================================================
    private function checkIndexability($url, $parsed, $xRobotsTag)
    {
        $issues = [];

        // X-Robots-Tag: noindex in HTTP header
        if ($xRobotsTag && strpos(strtolower($xRobotsTag), 'noindex') !== false) {
            $issues[] = [
                'type' => 'x_robots_noindex',
                'severity' => 'High',
                'message' => 'X-Robots-Tag HTTP header contains noindex',
                'description' => "Header value: {$xRobotsTag}",
                'recommendation' => 'If this page should be indexed, remove the X-Robots-Tag header from server config.',
            ];
        }

        return $issues;
    }

    // ============================================================
    // STATUS CODE CHECKS
    // ============================================================
    private function checkStatusCode($url, $statusCode)
    {
        $issues = [];

        if ($statusCode >= 500) {
            $issues[] = [
                'type' => 'server_error',
                'severity' => 'Critical',
                'message' => "Server error: HTTP {$statusCode}",
                'recommendation' => 'Fix the server-side error. 5xx pages waste crawl budget and break user experience.',
            ];
        } elseif ($statusCode == 404 || $statusCode == 410) {
            $issues[] = [
                'type' => 'page_not_found',
                'severity' => 'High',
                'message' => "Page returns HTTP {$statusCode}",
                'recommendation' => $statusCode == 404
                    ? 'Either restore the page, redirect it to a relevant page, or return 410 if permanently removed.'
                    : 'This page is permanently gone (410). Remove all internal links pointing to it.',
            ];
        }

        return $issues;
    }

    // ============================================================
    // POST-CRAWL ANALYSIS (runs after entire crawl completes)
    // Detects cross-page issues: duplicate titles, duplicate metas
    // ============================================================
    public static function runPostCrawlAnalysis($db, $crawlId)
    {
        $insertStmt = $db->prepare("
            INSERT INTO issues (crawl_id, page_id, url, type, severity, message, description, recommendation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        // 1. Duplicate Titles
        $stmt = $db->prepare("
            SELECT title, GROUP_CONCAT(url SEPARATOR '|||') as urls, COUNT(*) as cnt
            FROM pages WHERE crawl_id = ? AND title IS NOT NULL AND title != ''
            GROUP BY title HAVING cnt > 1 LIMIT 50
        ");
        $stmt->execute([$crawlId]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $urls = explode('|||', $row['urls']);
            foreach ($urls as $dupUrl) {
                try {
                    $insertStmt->execute([
                        $crawlId,
                        null,
                        $dupUrl,
                        'duplicate_title',
                        'Medium',
                        "Duplicate title shared with " . (count($urls) - 1) . " other pages",
                        "Title: " . mb_substr($row['title'], 0, 100),
                        'Create unique titles for each page to avoid keyword cannibalization.',
                    ]);
                } catch (\PDOException $e) {
                }
            }
        }

        // 2. Duplicate Meta Descriptions
        $stmt = $db->prepare("
            SELECT meta_desc, GROUP_CONCAT(url SEPARATOR '|||') as urls, COUNT(*) as cnt
            FROM pages WHERE crawl_id = ? AND meta_desc IS NOT NULL AND meta_desc != ''
            GROUP BY meta_desc HAVING cnt > 1 LIMIT 50
        ");
        $stmt->execute([$crawlId]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $urls = explode('|||', $row['urls']);
            foreach ($urls as $dupUrl) {
                try {
                    $insertStmt->execute([
                        $crawlId,
                        null,
                        $dupUrl,
                        'duplicate_meta_desc',
                        'Medium',
                        "Duplicate meta description shared with " . (count($urls) - 1) . " other pages",
                        "Meta: " . mb_substr($row['meta_desc'], 0, 120),
                        'Write unique meta descriptions for each page to improve SERP CTR.',
                    ]);
                } catch (\PDOException $e) {
                }
            }
        }

        // 3. Canonical pointing to non-200 page
        $stmt = $db->prepare("
            SELECT p1.url, p1.canonical, p2.status_code
            FROM pages p1
            LEFT JOIN pages p2 ON p1.canonical = p2.url AND p1.crawl_id = p2.crawl_id
            WHERE p1.crawl_id = ? AND p1.canonical IS NOT NULL AND p1.canonical != ''
            AND p1.canonical_status = 'mismatch'
            AND (p2.status_code IS NULL OR p2.status_code >= 300)
            LIMIT 50
        ");
        $stmt->execute([$crawlId]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $targetStatus = $row['status_code'] ?? 'not crawled';
            $severity = ($targetStatus == 404 || $targetStatus == 410) ? 'Critical' : 'High';
            try {
                $insertStmt->execute([
                    $crawlId,
                    null,
                    $row['url'],
                    'canonical_to_bad_target',
                    $severity,
                    "Canonical points to page with status {$targetStatus}",
                    "Canonical: {$row['canonical']}",
                    'Update the canonical to point to a valid 200-status page.',
                ]);
            } catch (\PDOException $e) {
            }
        }
    }
}
?>