#!/usr/bin/env bash
# PRO-8 (security review M1). Copies the newest dump to the buyer's S3 (TC_BACKUP_S3_URI) with the
# instance role (R3). Runs as root after tc-backup succeeded: postgres, which makes the dump, has no
# access to the instance metadata service. Without TC_BACKUP_S3_URI it does nothing.
# Output is fixed text only (R14).
set -euo pipefail
umask 077

[[ -n "${TC_BACKUP_S3_URI:-}" ]] || exit 0
[[ "$TC_BACKUP_S3_URI" =~ ^s3://[a-z0-9][a-z0-9.-]{1,61}[a-z0-9](/[A-Za-z0-9._/-]*)?$ ]] \
  || { echo '{"event":"backup_failed","stage":"s3_config"}'; exit 1; }
# The AWS CLI is not in Ubuntu 24.04's archive; the AMI installs it (PRO-7).
AWS_CLI="$(command -v aws || true)"
[[ -z "$AWS_CLI" && -x /snap/bin/aws ]] && AWS_CLI=/snap/bin/aws
[[ -n "$AWS_CLI" ]] || { echo '{"event":"backup_failed","stage":"s3_cli"}'; exit 1; }
file="$(find /var/backups/tc -maxdepth 1 -name 'ticoncloud-*.dump' -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
[[ -n "$file" ]] || { echo '{"event":"backup_failed","stage":"s3_nofile"}'; exit 1; }
if ! "$AWS_CLI" s3 cp --only-show-errors --sse AES256 "$file" "${TC_BACKUP_S3_URI%/}/$(basename "$file")" >/dev/null 2>&1; then
  echo '{"event":"backup_failed","stage":"s3_copy"}'
  exit 1
fi
echo "{\"event\":\"backup_copied\",\"file\":\"$(basename "$file")\"}"
