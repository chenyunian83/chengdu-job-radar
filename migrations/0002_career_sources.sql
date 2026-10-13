CREATE TABLE IF NOT EXISTS career_sources (
  url TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  last_checked TEXT,
  status TEXT,
  job_count INTEGER NOT NULL DEFAULT 0,
  is_seed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_career_sources_check_queue
  ON career_sources(last_checked, last_seen DESC);
