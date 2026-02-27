<?php
require_once __DIR__ . '/config.php';

try {
    $db = getDb();

    // ============================================================
    // CLEAN RESET: Visit init_db.php?reset=1 to DROP all tables and recreate
    // Use this when upgrading from an older schema version
    // ============================================================
    if (isset($_GET['reset']) && $_GET['reset'] === '1') {
        $db->exec("SET FOREIGN_KEY_CHECKS = 0");
        $db->exec("DROP TABLE IF EXISTS crawl_logs");
        $db->exec("DROP TABLE IF EXISTS issues");
        $db->exec("DROP TABLE IF EXISTS images");
        $db->exec("DROP TABLE IF EXISTS links");
        $db->exec("DROP TABLE IF EXISTS gsc_urls");
        $db->exec("DROP TABLE IF EXISTS crawl_queue");
        $db->exec("DROP TABLE IF EXISTS pages");
        $db->exec("DROP TABLE IF EXISTS crawls");
        $db->exec("DROP TABLE IF EXISTS projects");
        $db->exec("SET FOREIGN_KEY_CHECKS = 1");
        echo "All tables dropped. Recreating...\n";
    }

    // ============================================================
    // CORE TABLES
    // ============================================================

    // Projects Table
    $db->exec("CREATE TABLE IF NOT EXISTS projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Crawls Table
    $db->exec("CREATE TABLE IF NOT EXISTS crawls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING',
        urls_crawled INT DEFAULT 0,
        settings_json TEXT,
        started_at DATETIME,
        ended_at DATETIME,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Crawl Queue Table
    $db->exec("CREATE TABLE IF NOT EXISTS crawl_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        url VARCHAR(2048) NOT NULL,
        url_hash CHAR(64) AS (SHA2(url, 256)) STORED,
        depth INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'PENDING',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        error_msg TEXT,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        UNIQUE KEY unique_crawl_url_hash (crawl_id, url_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ============================================================
    // PAGES TABLE — Expanded for forensic SEO
    // ============================================================
    $db->exec("CREATE TABLE IF NOT EXISTS pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        url VARCHAR(2048) NOT NULL,
        url_hash CHAR(64) AS (SHA2(url, 256)) STORED,

        -- HTTP Response
        status_code INT,
        load_time_ms INT,
        size_bytes INT,
        redirect_chain_json TEXT,

        -- Content Metrics
        word_count INT DEFAULT 0,
        text_ratio_percent INT DEFAULT 0,
        content_hash VARCHAR(64),

        -- On-Page SEO Signals
        title TEXT,
        meta_desc TEXT,
        h1 TEXT,
        h2_json TEXT,
        h_structure_json TEXT,
        canonical TEXT,
        meta_robots TEXT,
        x_robots_tag VARCHAR(255) DEFAULT NULL,
        schema_types TEXT,

        -- Forensic SEO Signals
        hreflang_json TEXT,
        canonical_status VARCHAR(50) DEFAULT NULL,
        has_multiple_canonicals TINYINT(1) DEFAULT 0,
        soft_404 TINYINT(1) DEFAULT 0,
        is_indexable TINYINT(1) DEFAULT 1,
        indexability_score INT DEFAULT 100,

        -- Image Stats
        images_count INT DEFAULT 0,
        images_missing_alt INT DEFAULT 0,
        images_oversized INT DEFAULT 0,

        -- URL Discovery
        form_actions_json TEXT,

        -- Metadata
        depth INT,
        crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        UNIQUE KEY unique_crawl_page_hash (crawl_id, url_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ============================================================
    // LINKS TABLE — With discovery source tracking
    // ============================================================
    $db->exec("CREATE TABLE IF NOT EXISTS links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        source_url VARCHAR(2048) NOT NULL,
        target_url VARCHAR(2048) NOT NULL,
        anchor_text TEXT,
        html_snippet TEXT,
        is_external TINYINT(1) DEFAULT 0,
        discovery_source VARCHAR(50) DEFAULT 'internal_link',
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        UNIQUE KEY unique_link (crawl_id, source_url(191), target_url(191))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ============================================================
    // IMAGES TABLE — Per-page image inventory
    // ============================================================
    $db->exec("CREATE TABLE IF NOT EXISTS images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        page_id INT NOT NULL,
        src VARCHAR(2048),
        alt TEXT,
        width INT DEFAULT NULL,
        height INT DEFAULT NULL,
        has_lazy_loading TINYINT(1) DEFAULT 0,
        format VARCHAR(20) DEFAULT NULL,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ============================================================
    // ISSUES TABLE — Auto-detected SEO issues
    // ============================================================
    $db->exec("CREATE TABLE IF NOT EXISTS issues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        page_id INT DEFAULT NULL,
        url VARCHAR(2048) DEFAULT NULL,
        type VARCHAR(100) NOT NULL,
        severity VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        description TEXT,
        recommendation TEXT,
        html_location TEXT,
        offending_link TEXT,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ============================================================
    // GSC URL SOLVER TABLE — "Why Is Google Seeing This URL?"
    // ============================================================
    $db->exec("CREATE TABLE IF NOT EXISTS gsc_urls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        url VARCHAR(2048) NOT NULL,
        found_in_links TINYINT(1) DEFAULT 0,
        found_in_sitemap TINYINT(1) DEFAULT 0,
        found_in_canonical TINYINT(1) DEFAULT 0,
        found_in_hreflang TINYINT(1) DEFAULT 0,
        found_in_redirect TINYINT(1) DEFAULT 0,
        source_pages_json TEXT,
        fix_type VARCHAR(100),
        severity VARCHAR(50),
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Crawl Logs Table
    $db->exec("CREATE TABLE IF NOT EXISTS crawl_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        type VARCHAR(50) DEFAULT 'INFO',
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ============================================================
    // PERFORMANCE INDEXES
    // ============================================================
    $indexes = [
        "CREATE INDEX idx_crawl_queue_status ON crawl_queue(crawl_id, status)",
        "CREATE INDEX idx_pages_crawl_url ON pages(crawl_id, url(255))",
        "CREATE INDEX idx_pages_canonical ON pages(crawl_id, canonical(255))",
        "CREATE INDEX idx_pages_content_hash ON pages(crawl_id, content_hash)",
        "CREATE INDEX idx_pages_title ON pages(crawl_id, title(255))",
        "CREATE INDEX idx_pages_indexability ON pages(crawl_id, indexability_score)",
        "CREATE INDEX idx_links_target ON links(crawl_id, target_url(255))",
        "CREATE INDEX idx_links_source ON links(crawl_id, source_url(255))",
        "CREATE INDEX idx_links_discovery ON links(crawl_id, discovery_source)",
        "CREATE INDEX idx_issues_severity ON issues(crawl_id, severity)",
        "CREATE INDEX idx_issues_type ON issues(crawl_id, type)",
        "CREATE INDEX idx_images_page ON images(crawl_id, page_id)",
        "CREATE INDEX idx_crawl_logs_crawl ON crawl_logs(crawl_id, id)",
        "CREATE INDEX idx_gsc_urls_crawl ON gsc_urls(crawl_id, url(255))",
    ];

    foreach ($indexes as $sql) {
        try {
            $db->exec($sql);
        } catch (PDOException $e) {
            // Ignore if index already exists
        }
    }

    // ============================================================
    // SEAMLESS DATABASE MIGRATIONS
    // Auto-patch existing tables without dropping them
    // ============================================================
    $migrations = [
        "ALTER TABLE pages ADD COLUMN redirect_chain_json TEXT AFTER size_bytes",
        "ALTER TABLE pages ADD COLUMN h_structure_json TEXT AFTER h2_json",
        "ALTER TABLE pages ADD COLUMN hreflang_json TEXT AFTER schema_types",
        "ALTER TABLE pages ADD COLUMN canonical_status VARCHAR(50) DEFAULT NULL AFTER canonical",
        "ALTER TABLE pages ADD COLUMN has_multiple_canonicals TINYINT(1) DEFAULT 0 AFTER canonical_status",
        "ALTER TABLE pages ADD COLUMN soft_404 TINYINT(1) DEFAULT 0 AFTER hreflang_json",
        "ALTER TABLE pages ADD COLUMN is_indexable TINYINT(1) DEFAULT 1 AFTER soft_404",
        "ALTER TABLE pages ADD COLUMN indexability_score INT DEFAULT 100 AFTER is_indexable",
        "ALTER TABLE pages ADD COLUMN form_actions_json TEXT AFTER images_oversized",
        "ALTER TABLE pages ADD COLUMN x_robots_tag VARCHAR(255) DEFAULT NULL AFTER meta_robots",

        "ALTER TABLE links ADD COLUMN html_snippet TEXT AFTER anchor_text",
        "ALTER TABLE links ADD COLUMN discovery_source VARCHAR(50) DEFAULT 'internal_link' AFTER is_external",

        "ALTER TABLE images ADD COLUMN has_lazy_loading TINYINT(1) DEFAULT 0 AFTER height",
        "ALTER TABLE images ADD COLUMN format VARCHAR(20) DEFAULT NULL AFTER has_lazy_loading",

        "ALTER TABLE issues ADD COLUMN html_location TEXT AFTER recommendation",
        "ALTER TABLE issues ADD COLUMN offending_link TEXT AFTER html_location"
    ];

    foreach ($migrations as $sql) {
        try {
            $db->exec($sql);
            echo "Migration applied: " . explode(' ', $sql)[4] . "\n";
        } catch (PDOException $e) {
            // Column likely exists
        }
    }

    echo "Database initialized successfully. Schema version: FORENSIC-2.1\n";

} catch (PDOException $e) {
    echo "Initialization failed: " . $e->getMessage() . "\n";
}
?>