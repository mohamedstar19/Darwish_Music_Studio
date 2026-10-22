#!/usr/bin/env bash
# Daily backup: database + songs/pictures + settings. Run ON THE SERVER from the project folder
# (scripts/deploy.sh installs a 3:30 AM cron job for it when BACKUP_DIR is set in .env).
#
#   BACKUP_DIR   where backups go. Use another machine (e.g. the NAS mount), not the server's own disk.
#   KEEP_DAYS    how long daily database copies and deleted/replaced files are kept (default 30).
#
# Layout in BACKUP_DIR:
#   db/dms_YYYY-MM-DD_HHMM.dump     database (pg_dump custom format), one per day
#   media/                          mirror of the songs, covers and originals
#   media-removed/YYYY-MM-DD_HHMM/  files that were deleted or replaced that day (kept KEEP_DAYS)
#   env/.env                        server settings (passwords!) — readable by the owner only
#   backup.log                      history
#
# Every database copy is test-restored into a temporary database before it counts as good.
# The result is written to data/media/.backup-status.json so the admin panel can show it.
set -uo pipefail

cd "$(dirname "$0")/.."
PROJECT="$(pwd)"
envval() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

BACKUP_DIR="${BACKUP_DIR:-$(envval BACKUP_DIR)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-$(envval BACKUP_KEEP_DAYS)}"
KEEP_DAYS="${KEEP_DAYS:-30}"
MEDIA_PATH="$(envval MEDIA_PATH)"
MEDIA_PATH="${MEDIA_PATH:-./data/media}"
STATUS_FILE="$MEDIA_PATH/.backup-status.json"
STAMP="$(date +%Y-%m-%d_%H%M)"
STARTED="$(date -Iseconds)"
T0=$(date +%s)
# The NAS is a "hard" NFS mount: if it disappears, file access would wait forever. Cap every step.
T=timeout

log() { echo "[$(date '+%F %T')] $*"; }

write_status() { # ok error
  local ok="$1" err="${2:-}"
  local dumps db_bytes media_bytes media_files
  dumps=$(ls "$BACKUP_DIR"/db/dms_*.dump 2>/dev/null | wc -l)
  db_bytes=$(stat -c %s "$BACKUP_DIR/db/dms_${STAMP}.dump" 2>/dev/null || echo 0)
  media_bytes=$(du -sb "$MEDIA_PATH" 2>/dev/null | cut -f1 || echo 0)
  media_files=$(find "$MEDIA_PATH" -type f ! -name '.backup-status.json' 2>/dev/null | wc -l)
  err=$(printf '%s' "$err" | tr '"\\\n' "'/ " | cut -c1-300)
  cat > "$STATUS_FILE.tmp" <<EOF
{"ok": $ok, "startedAt": "$STARTED", "finishedAt": "$(date -Iseconds)", "seconds": $(( $(date +%s) - T0 )),
 "destination": "$BACKUP_DIR", "dbBytes": ${db_bytes:-0}, "mediaBytes": ${media_bytes:-0}, "mediaFiles": ${media_files:-0},
 "dbCopies": ${dumps:-0}, "keepDays": $KEEP_DAYS, "tracks": ${TRACKS:-0}, "error": "$err"}
EOF
  mv "$STATUS_FILE.tmp" "$STATUS_FILE"
}

fail() {
  log "FAILED: $*"
  write_status false "$*"
  exit 1
}

# Only one backup at a time.
exec 9>"$PROJECT/.backup.lock"
flock -n 9 || { log "Another backup is running; skipping."; exit 0; }

log "Backup to $BACKUP_DIR (keep $KEEP_DAYS days)"
$T 60 mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/media" "$BACKUP_DIR/media-removed" "$BACKUP_DIR/env" \
  || fail "مش قادر يوصل لمكان النسخ الاحتياطي ($BACKUP_DIR). الـ NAS شغال؟"
$T 60 touch "$BACKUP_DIR/.write-test" && rm -f "$BACKUP_DIR/.write-test" || fail "مكان النسخ الاحتياطي مش بيقبل كتابة"

# 1) Database: dump to a temp file, then test-restore it into a scratch database.
DUMP="$BACKUP_DIR/db/dms_${STAMP}.dump"
$T 1800 docker compose exec -T db pg_dump -U dms -d dms --format=custom > "$DUMP.part" || fail "pg_dump فشل"
[ -s "$DUMP.part" ] || fail "نسخة قاعدة البيانات فاضية"

TRACKS_LIVE=$(docker compose exec -T db psql -U dms -d dms -tAc "SELECT count(*) FROM tracks" | tr -d '[:space:]')
docker compose exec -T db psql -U dms -d postgres -qc "DROP DATABASE IF EXISTS dms_restore_check" >/dev/null
docker compose exec -T db psql -U dms -d postgres -qc "CREATE DATABASE dms_restore_check" >/dev/null || fail "مقدرش يعمل قاعدة اختبار"
if ! $T 1800 docker compose exec -T db pg_restore -U dms -d dms_restore_check --no-owner < "$DUMP.part" >/dev/null 2>"$PROJECT/.restore-check.err"; then
  docker compose exec -T db psql -U dms -d postgres -qc "DROP DATABASE IF EXISTS dms_restore_check" >/dev/null
  fail "تجربة استرجاع النسخة فشلت: $(tail -1 "$PROJECT/.restore-check.err")"
fi
TRACKS=$(docker compose exec -T db psql -U dms -d dms_restore_check -tAc "SELECT count(*) FROM tracks" | tr -d '[:space:]')
docker compose exec -T db psql -U dms -d postgres -qc "DROP DATABASE IF EXISTS dms_restore_check" >/dev/null
rm -f "$PROJECT/.restore-check.err"
# Songs may be added while the dump runs, so the copy can only be equal or a little behind.
[ -n "$TRACKS" ] && [ "$TRACKS" -le "${TRACKS_LIVE:-0}" ] && [ "$TRACKS" -ge $(( ${TRACKS_LIVE:-0} - 50 )) ] \
  || fail "عدد الأغاني في النسخة ($TRACKS) مش مطابق للموقع ($TRACKS_LIVE)"
mv "$DUMP.part" "$DUMP"
log "Database: $(du -h "$DUMP" | cut -f1), restore check OK ($TRACKS songs)"

# 2) Songs, pictures, originals: copy what's new or changed. Anything deleted or replaced
#    on the site is moved to media-removed/<today> instead of being lost.
$T 21600 rsync -a --delete --exclude '.backup-status.json' --exclude 'tmp/' \
  --backup --backup-dir="../media-removed/$STAMP" \
  "$MEDIA_PATH/" "$BACKUP_DIR/media/" || fail "نسخ الأغاني والصور فشل"
log "Media: $(find "$BACKUP_DIR/media" -type f | wc -l) files"

# 3) Settings (database password, sign-in secret, admin link).
$T 60 install -m 600 .env "$BACKUP_DIR/env/.env" || fail "نسخ ملف الإعدادات فشل"

# 4) Drop old copies.
find "$BACKUP_DIR/db" -name 'dms_*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/db" -name '*.part' -mtime +1 -delete
find "$BACKUP_DIR/media-removed" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
find "$BACKUP_DIR/media-removed" -mindepth 1 -maxdepth 1 -type d -empty -delete

write_status true
log "Done in $(( $(date +%s) - T0 ))s"
