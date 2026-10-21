#!/usr/bin/env sh
# Nightly backup: database dump + media files. Run ON THE SERVER from the project folder.
# Example cron (3 AM daily):
#   0 3 * * * cd /opt/Darwish_Music_Studio && ./scripts/backup.sh >> backups/backup.log 2>&1
# Set BACKUP_DIR to a different disk or a TrueNAS mount so backups survive a disk failure.
set -eu

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
MEDIA_PATH="$(grep -E '^MEDIA_PATH=' .env | cut -d= -f2- || true)"
MEDIA_PATH="${MEDIA_PATH:-./data/media}"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/media"

docker compose exec -T db pg_dump -U dms -d dms --format=custom > "$BACKUP_DIR/db/dms_${STAMP}.dump"
echo "DB dump: $BACKUP_DIR/db/dms_${STAMP}.dump"

# Media: incremental copy (only new/changed files). Originals + converted audio + covers.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$MEDIA_PATH/" "$BACKUP_DIR/media/"
else
  cp -ru "$MEDIA_PATH/." "$BACKUP_DIR/media/"
fi
echo "Media synced to $BACKUP_DIR/media"

find "$BACKUP_DIR/db" -name 'dms_*.dump' -mtime +"$KEEP_DAYS" -delete

# Restore a dump with:
#   docker compose exec -T db pg_restore -U dms -d dms --clean --if-exists < backups/db/dms_YYYY-MM-DD_HHMM.dump
