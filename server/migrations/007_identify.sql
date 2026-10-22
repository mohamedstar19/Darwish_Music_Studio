-- Settings changed from the admin panel (e.g. the AcoustID application key).
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Song identification (by sound via AcoustID, or by a cleaned-up name search).
-- identify_status: NULL (not checked) | 'applied' | 'suggested' | 'none' | 'dismissed'
ALTER TABLE tracks ADD COLUMN identify_status TEXT;
ALTER TABLE tracks ADD COLUMN identify_suggestion JSONB;
ALTER TABLE tracks ADD COLUMN identified_at TIMESTAMPTZ;
-- Same AcoustID = same recording, even when the files differ: used to spot duplicates.
ALTER TABLE tracks ADD COLUMN acoustid_id TEXT;
CREATE INDEX tracks_acoustid_idx ON tracks (acoustid_id);
CREATE INDEX tracks_identify_status_idx ON tracks (identify_status);
