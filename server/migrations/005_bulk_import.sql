-- Film songs section.
INSERT INTO categories (name, slug, description, color, sort_order)
VALUES ('أغاني الأفلام', 'film-songs', 'أغاني وموسيقى الأفلام', '#e11d48', 3)
ON CONFLICT (slug) DO NOTHING;

-- Bulk import: recognise a file that was already uploaded (by its content),
-- and publish automatically once processing is done when the import asked for it.
ALTER TABLE tracks ADD COLUMN source_hash TEXT;
ALTER TABLE tracks ADD COLUMN auto_publish BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX tracks_source_hash_idx ON tracks (source_hash);

-- Find works and categories by normalized Arabic name when sorting imports.
CREATE INDEX works_title_norm_idx ON works (norm_ar(title));
