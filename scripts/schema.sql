CREATE TABLE IF NOT EXISTS saved_progressions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL,
  mode TEXT NOT NULL,
  preset_id TEXT NOT NULL,
  bpm INTEGER NOT NULL,
  is_example INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  key_note INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL,
  original_bpm INTEGER NOT NULL DEFAULT 120,
  preset_id TEXT NOT NULL DEFAULT 'piano',
  sections TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS structures (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  bpm INTEGER NOT NULL DEFAULT 120,
  bars TEXT NOT NULL DEFAULT '[]',
  sections TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_progressions_device ON saved_progressions(device_id);
CREATE INDEX idx_songs_device ON songs(device_id);
CREATE INDEX idx_structures_device ON structures(device_id);
