-- pos-rt-service — init schema

CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Config non-sensibili, override runtime
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Secret cifrati a record con AES-256-GCM (chiave: master key)
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value_enc BLOB NOT NULL,
  iv BLOB NOT NULL,
  tag BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Record singleton del device (1 riga, id=1)
CREATE TABLE IF NOT EXISTS device (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  strapi_url TEXT NOT NULL,
  ws_url TEXT NOT NULL,
  name TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  last_sync_at TEXT
);

-- Coda job
CREATE TABLE IF NOT EXISTS job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,
  dlq_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_status_next ON job_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_job_kind ON job_queue(kind);
CREATE INDEX IF NOT EXISTS idx_job_created ON job_queue(created_at);

-- Stato sync incrementale per entità
CREATE TABLE IF NOT EXISTS sync_state (
  entity TEXT PRIMARY KEY,
  last_cursor TEXT,
  last_pulled_at TEXT
);
