-- App usage events: PWA installs, launches from the installed app, and song downloads.
CREATE TABLE app_events (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('install', 'app_open', 'download', 'visit')),
  listener_id TEXT,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  track_id    INT REFERENCES tracks(id) ON DELETE SET NULL,
  platform    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX app_events_kind_idx ON app_events(kind, created_at);
CREATE INDEX app_events_listener_idx ON app_events(listener_id, kind);
