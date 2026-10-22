-- Lyrics fetched from the internet: plain text stays in `lyrics`; the timed version
-- (LRC lines like "[01:23.45] ...") powers line-by-line lyrics in the player.
ALTER TABLE tracks ADD COLUMN lyrics_synced TEXT;
ALTER TABLE tracks ADD COLUMN lyrics_source TEXT;
