-- Swapi database schema (SQLite). Run automatically by server.js on start.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  token           TEXT    UNIQUE,                 -- random secret, kept in the browser (no passwords yet)
  is_demo         INTEGER NOT NULL DEFAULT 0,     -- 1 = seeded demo buddy
  pronouns        TEXT    NOT NULL DEFAULT '',
  goal            TEXT    NOT NULL DEFAULT '',    -- "who do you want to become?"
  level           INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 2),
  confidence      INTEGER NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  hobby           TEXT    NOT NULL DEFAULT 'gaming',
  times           TEXT    NOT NULL DEFAULT '["Morning"]',  -- JSON array
  teach           TEXT    NOT NULL DEFAULT '[]',           -- JSON [{t,k}]
  want            TEXT    NOT NULL DEFAULT '[]',           -- JSON [{t,k}]
  has_cert        INTEGER NOT NULL DEFAULT 0,
  xp              INTEGER NOT NULL DEFAULT 0,
  streak          INTEGER NOT NULL DEFAULT 0,
  demo_rating_avg REAL,
  demo_rating_n   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen       TEXT
);

-- One row per swipe. Re-swiping updates the row.
CREATE TABLE IF NOT EXISTS swipes (
  from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liked      INTEGER NOT NULL,
  boost      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_id, to_id)
);

-- A match is stored once, with user_a < user_b.
CREATE TABLE IF NOT EXISTS matches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages (to_id, id);

CREATE TABLE IF NOT EXISTS meetings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buddy_name TEXT    NOT NULL,
  meet_date  TEXT    NOT NULL,           -- YYYY-MM-DD
  meet_hour  INTEGER NOT NULL CHECK (meet_hour BETWEEN 0 AND 23)
);

CREATE TABLE IF NOT EXISTS sessions (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL,
  buddy     TEXT    NOT NULL,
  held_at   TEXT    NOT NULL,
  seconds   INTEGER NOT NULL DEFAULT 0,
  rounds    INTEGER NOT NULL DEFAULT 0,
  reactions INTEGER NOT NULL DEFAULT 0,
  headline  TEXT    NOT NULL DEFAULT '',
  my_rating INTEGER,
  PRIMARY KEY (user_id, client_id)
);

CREATE TABLE IF NOT EXISTS journal (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL,
  topic      TEXT    NOT NULL DEFAULT '',
  buddy      TEXT    NOT NULL DEFAULT '',
  learned    TEXT    NOT NULL,
  next_step  TEXT    NOT NULL DEFAULT '',
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS skills (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic          TEXT    NOT NULL,
  learned_count  INTEGER NOT NULL DEFAULT 0,
  taught_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, topic)
);

-- Ratings a user gave to a buddy after a session.
CREATE TABLE IF NOT EXISTS ratings (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL,
  to_name    TEXT    NOT NULL,
  useful     INTEGER NOT NULL CHECK (useful BETWEEN 1 AND 5),
  likes      TEXT    NOT NULL DEFAULT '[]',
  comment    TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_to ON ratings (to_name);
