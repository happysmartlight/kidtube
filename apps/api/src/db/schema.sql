-- KidTube Home — schema (idempotent, chay moi lan boot)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- === Be ===============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  name                   TEXT    NOT NULL,
  avatar                 TEXT    NOT NULL DEFAULT '🐻',
  color                  TEXT    NOT NULL DEFAULT '#5b9cff',
  daily_limit_min        INTEGER NOT NULL DEFAULT 30,   -- 0 = khong gioi han
  session_limit_min      INTEGER NOT NULL DEFAULT 15,   -- 0 = khong gioi han
  video_limit_session    INTEGER NOT NULL DEFAULT 0,    -- 0 = khong gioi han
  allowed_from           TEXT    NOT NULL DEFAULT '07:00',
  allowed_to             TEXT    NOT NULL DEFAULT '20:00',
  autoplay               INTEGER NOT NULL DEFAULT 0,
  autoplay_max           INTEGER NOT NULL DEFAULT 3,
  position               INTEGER NOT NULL DEFAULT 0,
  is_active              INTEGER NOT NULL DEFAULT 1,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- === Nguon: kenh / playlist / video le ================================
CREATE TABLE IF NOT EXISTS sources (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  type           TEXT    NOT NULL CHECK (type IN ('channel','playlist','video')),
  external_id    TEXT    NOT NULL,
  title          TEXT    NOT NULL DEFAULT '',
  thumbnail      TEXT,
  url            TEXT    NOT NULL DEFAULT '',
  auto_pull      INTEGER NOT NULL DEFAULT 1,
  auto_approve   INTEGER NOT NULL DEFAULT 0,  -- mac dinh tat: tuan thu nguyen tac P3
  last_pulled_at TEXT,
  last_error     TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (type, external_id)
);

-- === Video ============================================================
CREATE TABLE IF NOT EXISTS videos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id        TEXT    NOT NULL UNIQUE,
  title             TEXT    NOT NULL DEFAULT '',
  thumbnail         TEXT,
  duration_sec      INTEGER,                    -- NULL khi RSS chua co duration
  channel_id        TEXT,
  channel_title     TEXT,
  published_at      TEXT,
  source_id         INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  status            TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected','later')),
  reject_reason     TEXT,
  is_live           INTEGER NOT NULL DEFAULT 0,
  -- NULL = chua biet, 1 = nhung duoc, 0 = chu kenh chan nhung ra ngoai YouTube
  embeddable        INTEGER,
  local_path        TEXT,                       -- duong dan tuong doi trong MEDIA_DIR
  file_size         INTEGER,
  download_status   TEXT    NOT NULL DEFAULT 'none'
                            CHECK (download_status IN ('none','queued','downloading','done','error')),
  download_progress REAL    NOT NULL DEFAULT 0,
  download_error    TEXT,
  watch_count       INTEGER NOT NULL DEFAULT 0,
  last_watched_at   TEXT,
  -- title + channel_title da bo dau & viet thuong, de tim kiem tieng Viet
  -- khong phu thuoc dau/hoa-thuong (xem lib/search.ts)
  search_text       TEXT,
  added_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_videos_status    ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_source    ON videos(source_id);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_dlstatus  ON videos(download_status);

-- === Ke tren trang chu ================================================
CREATE TABLE IF NOT EXISTS shelves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  emoji      TEXT    NOT NULL DEFAULT '⭐',
  color      TEXT    NOT NULL DEFAULT '#5b9cff',
  position   INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shelf_items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  shelf_id INTEGER NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id)  ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (shelf_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_shelfitems_shelf ON shelf_items(shelf_id, position);

-- Ke nao cho be nao. KHONG co dong nao cho shelf_id = ke do hien cho MOI be.
CREATE TABLE IF NOT EXISTS profile_shelves (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shelf_id   INTEGER NOT NULL REFERENCES shelves(id)  ON DELETE CASCADE,
  PRIMARY KEY (profile_id, shelf_id)
);

-- === Nhat ky xem ======================================================
CREATE TABLE IF NOT EXISTS watch_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id      INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id        INTEGER NOT NULL REFERENCES videos(id)   ON DELETE CASCADE,
  day             TEXT    NOT NULL,             -- YYYY-MM-DD gio dia phuong
  started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  seconds_watched INTEGER NOT NULL DEFAULT 0,
  completed       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_watchlog_day     ON watch_log(day, profile_id);
CREATE INDEX IF NOT EXISTS idx_watchlog_profile ON watch_log(profile_id, started_at DESC);

-- === Phien xem (de tinh quota/luot) ===================================
CREATE TABLE IF NOT EXISTS kid_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id     INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day            TEXT    NOT NULL,
  started_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  seconds_used   INTEGER NOT NULL DEFAULT 0,
  videos_watched INTEGER NOT NULL DEFAULT 0,
  closed         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_open ON kid_sessions(profile_id, closed, last_seen_at DESC);

-- === Hang doi tai offline =============================================
CREATE TABLE IF NOT EXISTS download_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id    INTEGER NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  priority    INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','done','error','cancelled')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  started_at  TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dlq_pick ON download_queue(status, priority DESC, created_at);

-- === Bo loc tu dong ===================================================
CREATE TABLE IF NOT EXISTS filter_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL CHECK (type IN
               ('keyword_block','max_duration','min_duration','block_live','title_regex')),
  value      TEXT    NOT NULL,
  note       TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- === Cai dat (key-value) ==============================================
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Ghi nhan da seed chua
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
