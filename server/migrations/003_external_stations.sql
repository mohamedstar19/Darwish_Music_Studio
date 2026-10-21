-- Stations can now be either "synced" (plays tracks from our library in sync for
-- everyone) or "external" (an internet radio stream played from its own link).
ALTER TABLE stations ADD COLUMN kind TEXT NOT NULL DEFAULT 'synced' CHECK (kind IN ('synced', 'external'));
ALTER TABLE stations ADD COLUMN stream_url TEXT;
ALTER TABLE stations ADD COLUMN homepage_url TEXT;
ALTER TABLE stations ADD COLUMN logo_path TEXT;
