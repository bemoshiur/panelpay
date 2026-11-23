#!/usr/bin/env bash
# PRO-3. Nightly pg_dump of the platform database (custom format), kept TC_BACKUP_KEEP_DAYS days on the
# box. Runs as postgres, which cannot reach the instance metadata service (security review M1 of PRO-8):
# the copy to the buyer's S3 is tc-backup-s3.sh, a separate root unit started on success (OnSuccess=).
# Output is fixed text only (R14): no connection string, no error body.
set -euo pipefail
umask 077

DIR=/var/backups/tc
KEEP="${TC_BACKUP_KEEP_DAYS:-14}"
[[ "$KEEP" =~ ^[0-9]{1,3}$ ]] || { echo '{"event":"backup_failed","stage":"config"}'; exit 1; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$DIR/ticoncloud-$stamp.dump"
tmp="$file.partial"

if ! pg_dump --format=custom --compress=6 --no-owner --file="$tmp" ticoncloud 2>/dev/null; then
  rm -f "$tmp"
  echo '{"event":"backup_failed","stage":"dump"}'
  exit 1
fi
# A dump that pg_restore cannot list is not a backup.
if ! pg_restore --list "$tmp" >/dev/null 2>&1; then
  rm -f "$tmp"
  echo '{"event":"backup_failed","stage":"verify"}'
  exit 1
fi
mv "$tmp" "$file"

find "$DIR" -maxdepth 1 -name 'ticoncloud-*.dump' -type f -mtime +"$KEEP" -delete
echo "{\"event\":\"backup_done\",\"file\":\"$(basename "$file")\"}"
