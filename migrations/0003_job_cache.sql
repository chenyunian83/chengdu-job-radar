CREATE TABLE IF NOT EXISTS job_cache (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  published_at TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_cache_recent ON job_cache(last_seen, published_at);
