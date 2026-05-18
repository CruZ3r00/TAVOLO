-- printer_targets: storage multi-printer per stazioni e dispositivi cassa.
-- Sincronizzato da Strapi via config.update WS o pull HTTP periodico.

CREATE TABLE IF NOT EXISTS printer_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('station','cash')),
  key TEXT NOT NULL,
  driver TEXT NOT NULL,
  host TEXT,
  port INTEGER,
  options_json TEXT,
  capabilities_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  UNIQUE(role, key)
);

CREATE INDEX IF NOT EXISTS idx_printer_targets_role_enabled ON printer_targets(role, enabled);
