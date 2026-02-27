<?php
require_once __DIR__ . '/config.php';

try {
    $db = getDb();

    // Create Projects Table
    $db->exec("CREATE TABLE IF NOT EXISTS projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Create Crawls Table
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

    // Create Queue Table (For the background worker)
    // url_hash: SHA2 generated column for true dedup beyond 255-char prefix
    // updated_at: tracks when status last changed, used for stuck-URL recovery
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

    // Create Pages Table
    // url_hash: SHA2 generated column for true dedup beyond 255-char prefix
    $db->exec("CREATE TABLE IF NOT EXISTS pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        url VARCHAR(2048) NOT NULL,
        url_hash CHAR(64) AS (SHA2(url, 256)) STORED,
        status_code INT,
        load_time_ms INT,
        size_bytes INT,
        word_count INT,
        text_ratio_percent INT,
        content_hash VARCHAR(64),
        title TEXT,
        meta_desc TEXT,
        h1 TEXT,
        h2_json TEXT,
        canonical TEXT,
        meta_robots TEXT,
        schema_types TEXT,
        is_indexable TINYINT(1) DEFAULT 1,
        depth INT,
        redirect_chain_json TEXT,
        crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        UNIQUE KEY unique_crawl_page_hash (crawl_id, url_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Create Links Table (For graphing and internal link counts)
    // UNIQUE KEY on (crawl_id, source_url, target_url) prevents duplicate link rows from retries
    $db->exec("CREATE TABLE IF NOT EXISTS links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        source_url VARCHAR(2048) NOT NULL,
        target_url VARCHAR(2048) NOT NULL,
        anchor_text TEXT,
        html_snippet TEXT,
        is_external TINYINT(1) DEFAULT 0,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        UNIQUE KEY unique_link (crawl_id, source_url(191), target_url(191))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Create Issues Table
    // NOTE: page_id is nullable because sitemap_parser inserts orphan-page issues with no matching page record
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

    // Create Logs Table
    $db->exec("CREATE TABLE IF NOT EXISTS crawl_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        type VARCHAR(50) DEFAULT 'INFO',
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // ============================================================
    // MIGRATIONS — Safely add new columns/keys to existing tables
    // CREATE TABLE IF NOT EXISTS won't modify existing tables,
    // so these ALTER statements handle upgrades from older schemas.
    // ============================================================
    $migrations = [
        // Add updated_at column to crawl_queue (for stuck-URL time-check recovery)
        "ALTER TABLE crawl_queue ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        // Add url_hash generated column to crawl_queue (for true dedup beyond 255-char prefix)
        "ALTER TABLE crawl_queue ADD COLUMN url_hash CHAR(64) AS (SHA2(url, 256)) STORED",
        // Add url_hash generated column to pages
        "ALTER TABLE pages ADD COLUMN url_hash CHAR(64) AS (SHA2(url, 256)) STORED",
        // Add UNIQUE KEY on links table (prevents duplicate link rows)
        "ALTER TABLE links ADD UNIQUE KEY unique_link (crawl_id, source_url(191), target_url(191))",
        // Drop old prefix-based unique keys and add hash-based ones
        "ALTER TABLE crawl_queue DROP INDEX unique_crawl_url",
        "ALTER TABLE crawl_queue ADD UNIQUE KEY unique_crawl_url_hash (crawl_id, url_hash)",
        "ALTER TABLE pages DROP INDEX unique_crawl_page_url",
        "ALTER TABLE pages ADD UNIQUE KEY unique_crawl_page_hash (crawl_id, url_hash)",
    ];

    foreach ($migrations as $sql) {
        try {
            $db->exec($sql);
        } catch (PDOException $e) {
            // Ignore — column/key already exists or old key doesn't exist
        }
    }

    // Indexes for absolute performance (ignore duplicate key errors if they already exist)
    $indexes = [
        "CREATE INDEX idx_crawl_queue_status ON crawl_queue(crawl_id, status)",
        "CREATE INDEX idx_pages_crawl_url ON pages(crawl_id, url(255))",
        "CREATE INDEX idx_links_target ON links(crawl_id, target_url(255))",
        "CREATE INDEX idx_links_source ON links(crawl_id, source_url(255))",
        "CREATE INDEX idx_issues_severity ON issues(crawl_id, severity)",
        "CREATE INDEX idx_crawl_logs_crawl ON crawl_logs(crawl_id, id)"
    ];

    foreach ($indexes as $sql) {
        try {
            $db->exec($sql);
        } catch (PDOException $e) {
            // Ignore if index already exists (1061 is MySQL's duplicate key error code)
        }
    }

    echo "Database initialized successfully.\n";

} catch (PDOException $e) {
    echo "Initialization failed: " . $e->getMessage() . "\n";
}
?>