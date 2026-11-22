#!/usr/bin/env bash
# PRO-3. Nightly pg_dump of the platform database (custom format), kept TC_BACKUP_KEEP_DAYS days on the
# box. With TC_BACKUP_S3_URI set it is also copied to the buyer's S3 with the instance role (R3).
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

if [[ -n "${TC_BACKUP_S3_URI:-}" ]]; then
  [[ "$TC_BACKUP_S3_URI" =~ ^s3://[a-z0-9][a-z0-9.-]{1,61}[a-z0-9](/[A-Za-z0-9._/-]*)?$ ]] \
    || { echo '{"event":"backup_failed","stage":"s3_config"}'; exit 1; }
  # The AWS CLI is not in Ubuntu 24.04's archive; the AMI installs it (PRO-7) only for this copy.
  command -v aws >/dev/null || { echo '{"event":"backup_failed","stage":"s3_cli"}'; exit 1; }
  if ! aws s3 cp --only-show-errors --sse AES256 "$file" "${TC_BACKUP_S3_URI%/}/$(basename "$file")" >/dev/null 2>&1; then
    echo '{"event":"backup_failed","stage":"s3_copy"}'
    exit 1
  fi
fi

find "$DIR" -maxdepth 1 -name 'ticoncloud-*.dump' -type f -mtime +"$KEEP" -delete
echo "{\"event\":\"backup_done\",\"file\":\"$(basename "$file")\"}"
