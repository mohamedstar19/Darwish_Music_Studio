#!/usr/bin/env bash
# Bring data back from the daily backups. Run ON THE SERVER from the project folder.
#
#   ./scripts/restore.sh list                     show the database copies
#   ./scripts/restore.sh db latest --yes          put back the newest database copy
#   ./scripts/restore.sh db <file.dump> --yes     put back a specific copy
#   ./scripts/restore.sh media --yes              copy back missing songs/pictures (nothing is deleted)
#   ./scripts/restore.sh removed                  list files kept after being deleted/replaced
#
# Before replacing the database, the current one is saved to db/before-restore_<time>.dump.
set -euo pipefail

cd "$(dirname "$0")/.."
envval() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
BACKUP_DIR="${BACKUP_DIR:-$(envval BACKUP_DIR)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
MEDIA_PATH="$(envval MEDIA_PATH)"
MEDIA_PATH="${MEDIA_PATH:-./data/media}"

cmd="${1:-list}"
confirm() { [ "${!#}" = "--yes" ] || { echo "Add --yes to really do it."; exit 1; }; }

case "$cmd" in
  list)
    ls -lh "$BACKUP_DIR"/db/*.dump 2>/dev/null | awk '{print $5"\t"$9}' || echo "No database copies in $BACKUP_DIR/db"
    ;;
  db)
    file="${2:-}"
    [ -n "$file" ] || { echo "Which copy? Use 'latest' or a file from: $0 list"; exit 1; }
    [ "$file" = "latest" ] && file="$(ls -t "$BACKUP_DIR"/db/dms_*.dump | head -1)"
    [ -f "$file" ] || file="$BACKUP_DIR/db/$file"
    [ -s "$file" ] || { echo "Not found: $file"; exit 1; }
    confirm "$@"
    safety="$BACKUP_DIR/db/before-restore_$(date +%Y-%m-%d_%H%M).dump"
    echo "Saving the current database first: $safety"
    docker compose exec -T db pg_dump -U dms -d dms --format=custom > "$safety"
    echo "Stopping the site..."
    docker compose stop app
    echo "Restoring $file ..."
    docker compose exec -T db pg_restore -U dms -d dms --clean --if-exists --no-owner < "$file"
    docker compose start app
    echo "Done. Songs now: $(docker compose exec -T db psql -U dms -d dms -tAc 'SELECT count(*) FROM tracks' | tr -d '[:space:]')"
    ;;
  media)
    confirm "$@"
    rsync -a --ignore-existing --info=stats1 "$BACKUP_DIR/media/" "$MEDIA_PATH/"
    echo "Missing files copied back to $MEDIA_PATH"
    ;;
  removed)
    find "$BACKUP_DIR/media-removed" -type f -printf '%TY-%Tm-%Td  %P\n' 2>/dev/null | sort -r | head -100
    echo "Copy one back with: cp \"$BACKUP_DIR/media-removed/<path>\" \"$MEDIA_PATH/<same path without the date folder>\""
    ;;
  *)
    sed -n '2,12p' "$0"
    ;;
esac
