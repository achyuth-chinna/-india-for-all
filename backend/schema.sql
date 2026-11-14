-- India for All: D1 / SQLite schema, migration v1
CREATE TABLE IF NOT EXISTS research_items (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('education','healthcare','public_spending','crime','other')),
 region TEXT NOT NULL DEFAULT 'India',
 source_name TEXT NOT NULL,
 source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),
 source_published_on TEXT,
 reporting_period TEXT NOT NULL,
 metric_value TEXT,
 metric_unit TEXT,
 evidence_note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','published','rejected')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 reviewed_at TEXT,
 reviewed_by TEXT,
 published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_research_status_date ON research_items(status,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_region_category ON research_items(region,category);
CREATE TABLE IF NOT EXISTS review_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 item_id TEXT NOT NULL REFERENCES research_items(id),
 action TEXT NOT NULL,
 actor TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_review_item ON review_events(item_id,occurred_at DESC);
