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
    $db->exec("CREATE TABLE IF NOT EXISTS crawl_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        url VARCHAR(2048) NOT NULL,
        depth INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'PENDING',
        error_msg TEXT,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        UNIQUE KEY unique_crawl_url (crawl_id, url(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Create Pages Table
    $db->exec("CREATE TABLE IF NOT EXISTS pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        url VARCHAR(2048) NOT NULL,
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
        UNIQUE KEY unique_crawl_page_url (crawl_id, url(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Create Links Table (For graphing and internal link counts)
    $db->exec("CREATE TABLE IF NOT EXISTS links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        source_url VARCHAR(2048) NOT NULL,
        target_url VARCHAR(2048) NOT NULL,
        anchor_text TEXT,
        html_snippet TEXT,
        is_external TINYINT(1) DEFAULT 0,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Create Issues Table
    $db->exec("CREATE TABLE IF NOT EXISTS issues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crawl_id INT NOT NULL,
        page_id INT NOT NULL,
        type VARCHAR(100) NOT NULL,
        severity VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        description TEXT,
        recommendation TEXT,
        html_location TEXT,
        offending_link TEXT,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
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

    // Indexes for absolute performance
    $db->exec("CREATE INDEX idx_crawl_queue_status ON crawl_queue(crawl_id, status)");
    $db->exec("CREATE INDEX idx_pages_crawl_url ON pages(crawl_id, url(255))");
    $db->exec("CREATE INDEX idx_links_target ON links(crawl_id, target_url(255))");
    $db->exec("CREATE INDEX idx_issues_severity ON issues(crawl_id, severity)");

    echo "Database initialized successfully.\n";

} catch (PDOException $e) {
    echo "Initialization failed: " . $e->getMessage() . "\n";
}
?>