CREATE TABLE IF NOT EXISTS community_media(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,object_key TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS community_media_day ON community_media(created_at);
CREATE TABLE IF NOT EXISTS community_posts(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,alias TEXT NOT NULL,city TEXT NOT NULL DEFAULT '',title TEXT NOT NULL,body TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('text','photo','video')),media_url TEXT NOT NULL DEFAULT '',media_id TEXT REFERENCES community_media(id),root_id TEXT NOT NULL UNIQUE REFERENCES community_comments(id),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','published','deleted')),created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS community_posts_status ON community_posts(status);
CREATE TABLE IF NOT EXISTS community_post_reports(post_id TEXT NOT NULL REFERENCES community_posts(id),session_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(post_id,session_id));

CREATE INDEX IF NOT EXISTS community_posts_author ON community_posts(session_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS community_posts_attachment ON community_posts(media_id);
