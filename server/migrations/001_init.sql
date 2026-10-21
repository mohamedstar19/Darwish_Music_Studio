-- Darwish Music Studio: initial schema

-- Arabic-friendly search: unify alef/taa marbuta/alef maqsura forms and drop tashkeel/tatweel,
-- so "اغاني" finds "أغاني" and "مكتبه" finds "مكتبة".
CREATE FUNCTION norm_ar(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(lower(coalesce(t, '')), 'أإآٱةىـًٌٍَُِّْ', 'ااااهي')
$$;

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
  history_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_disabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#7c3aed',
  sort_order  INT NOT NULL DEFAULT 0
);

CREATE TABLE artists (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  bio        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A "work" is the show, anime, series or film a song belongs to.
CREATE TABLE works (
  id             SERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  original_title TEXT,
  kind           TEXT NOT NULL DEFAULT 'cartoon'
                 CHECK (kind IN ('cartoon', 'anime', 'series', 'film', 'original', 'other')),
  year           INT,
  studio         TEXT,
  description    TEXT,
  cover_path     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tracks (
  id                 SERIAL PRIMARY KEY,
  title              TEXT NOT NULL,
  artist_id          INT REFERENCES artists(id) ON DELETE SET NULL,
  work_id            INT REFERENCES works(id) ON DELETE SET NULL,
  category_id        INT REFERENCES categories(id) ON DELETE SET NULL,
  year               INT,
  duration_sec       REAL,
  lyrics             TEXT,
  credits            TEXT,
  original_path      TEXT,
  audio_path         TEXT,
  cover_path         TEXT,
  file_size          BIGINT,
  processing_status  TEXT NOT NULL DEFAULT 'pending'
                     CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  processing_error   TEXT,
  -- Rights: only 'original' and 'licensed' tracks can ever be published.
  rights_type        TEXT NOT NULL DEFAULT 'pending' CHECK (rights_type IN ('original', 'licensed', 'pending')),
  rights_source      TEXT,
  rights_notes       TEXT,
  license_scope      TEXT[] NOT NULL DEFAULT '{}',
  license_regions    TEXT,
  license_expires_at DATE,
  is_published       BOOLEAN NOT NULL DEFAULT FALSE,
  play_count         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tracks_work_idx ON tracks(work_id);
CREATE INDEX tracks_category_idx ON tracks(category_id);
CREATE INDEX tracks_artist_idx ON tracks(artist_id);
CREATE INDEX tracks_title_idx ON tracks (lower(title));

CREATE TABLE favorites (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   INT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE TABLE playlists (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  mood        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE playlist_tracks (
  playlist_id INT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    INT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position    INT NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE stations (
  id                 SERIAL PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  color              TEXT NOT NULL DEFAULT '#f97316',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  shuffle            BOOLEAN NOT NULL DEFAULT TRUE,
  requests_mode      TEXT NOT NULL DEFAULT 'moderated' CHECK (requests_mode IN ('off', 'moderated', 'auto')),
  sort_order         INT NOT NULL DEFAULT 0,
  -- Live state: everybody tuned in hears current_track_id from current_started_at.
  current_track_id   INT REFERENCES tracks(id) ON DELETE SET NULL,
  current_started_at TIMESTAMPTZ,
  rotation_index     INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE station_tracks (
  station_id INT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  track_id   INT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, track_id)
);

CREATE TABLE station_history (
  id         BIGSERIAL PRIMARY KEY,
  station_id INT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  track_id   INT REFERENCES tracks(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  request_id INT
);
CREATE INDEX station_history_idx ON station_history(station_id, started_at DESC);

CREATE TABLE song_requests (
  id         SERIAL PRIMARY KEY,
  station_id INT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  track_id   INT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'played')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX song_requests_queue_idx ON song_requests(station_id, status, created_at);

CREATE TABLE plays (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INT REFERENCES users(id) ON DELETE SET NULL,
  track_id         INT REFERENCES tracks(id) ON DELETE SET NULL,
  station_id       INT REFERENCES stations(id) ON DELETE SET NULL,
  source           TEXT NOT NULL DEFAULT 'ondemand',
  seconds_listened INT NOT NULL DEFAULT 0,
  played_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plays_user_idx ON plays(user_id, played_at DESC);
CREATE INDEX plays_time_idx ON plays(played_at);

CREATE TABLE reports (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  track_id    INT REFERENCES tracks(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('rights', 'broken', 'metadata', 'other')),
  message     TEXT NOT NULL,
  contact     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  admin_note  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE playback_errors (
  id         BIGSERIAL PRIMARY KEY,
  track_id   INT REFERENCES tracks(id) ON DELETE SET NULL,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  message    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bandwidth_daily (
  day   DATE PRIMARY KEY,
  bytes BIGINT NOT NULL DEFAULT 0
);

-- Starter categories and stations (names from the project plan; edit freely from the admin panel).
INSERT INTO categories (name, slug, color, sort_order) VALUES
  ('شارات سبيستون', 'spacetoon', '#f59e0b', 1),
  ('كرتون عربي', 'cartoon-arabic', '#ef4444', 2),
  ('أنمي مدبلج', 'anime-arabic', '#8b5cf6', 3),
  ('أغاني أطفال كلاسيكية', 'kids-classics', '#10b981', 4),
  ('مسلسلات وذكريات', 'drama-memories', '#3b82f6', 5),
  ('أعمال درويش الأصلية', 'darwish-originals', '#ec4899', 6);

INSERT INTO stations (slug, name, description, color, sort_order) VALUES
  ('spacetoon-memories', 'Spacetoon Memories', 'شارات قناة شباب المستقبل', '#f59e0b', 1),
  ('cartoon-arabic', 'Cartoon Arabic', 'كرتون عربي على مدار اليوم', '#ef4444', 2),
  ('90s-2000s', '90s & 2000s', 'ذكريات التسعينات والألفينات', '#06b6d4', 3),
  ('anime-arabic', 'Anime Arabic', 'أنمي مدبلج بالعربي', '#8b5cf6', 4),
  ('kids-classics', 'Kids Classics', 'أغاني أطفال كلاسيكية', '#10b981', 5),
  ('drama-memories', 'Drama Memories', 'تترات مسلسلات زمان', '#3b82f6', 6),
  ('darwish-originals', 'Darwish Originals', 'أعمال أصلية من درويش ستوديو', '#ec4899', 7);
