#!/usr/bin/env bash
# PRO-4. Installs or re-runs the setup of TryAWS.now Pro on ONE Ubuntu 24.04 instance in the buyer's own
# AWS account. Idempotent: a second run keeps every generated secret and only rewrites what the answers
# change. Creates no AWS resource; AWS calls of the platform use the instance role (R3).
#
#   sudo /opt/tc/current/box/bin/tc-install.sh            # asks the questions
#   sudo /opt/tc/current/box/bin/tc-install.sh --answers /root/tc-answers.env   # unattended
#
# The answers file holds KEY=value lines with the keys of ask() below. Output is fixed text: no secret,
# password or token is ever printed (R14).
set -euo pipefail
umask 077

RELEASE="${TC_RELEASE_DIR:-/opt/tc/current}"
ETC=/etc/tc
PG_ETC=/etc/postgresql/16/main
NODE_VERSION="$(tr -d '[:space:]' <"$RELEASE/box/node-version")"
CADDY_VERSION="$(tr -d '[:space:]' <"$RELEASE/box/caddy-version")"

say() { printf '%s\n' "$*"; }
die() {
  say "tc-install: $*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || die "run as root (sudo)"
. /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] || die "Ubuntu 24.04 is required"
[[ -d "$RELEASE/web" && -d "$RELEASE/admin" && -f "$RELEASE/worker/main.mjs" ]] || die "release not found in $RELEASE"

# ---------------------------------------------------------------- answers
ANSWERS=""
if [[ "${1:-}" == "--answers" ]]; then
  ANSWERS="${2:?answers file}"
  [[ -f "$ANSWERS" ]] || die "answers file not found"
fi
declare -A A=()
if [[ -n "$ANSWERS" ]]; then
  while IFS='=' read -r k v; do
    [[ "$k" =~ ^[A-Z_]+$ ]] || continue
    A[$k]="$v"
  done <"$ANSWERS"
fi

# ask KEY "question" REGEX [default]
ask() {
  local key="$1" q="$2" re="$3" def="${4:-}" v="${A[$1]:-}"
  if [[ -z "$v" && -f "$ETC/answers.env" ]]; then
    v="$(grep -E "^$key=" "$ETC/answers.env" | tail -1 | cut -d= -f2- || true)"
  fi
  if [[ -z "$v" && -z "$ANSWERS" ]]; then
    read -r -p "$q${def:+ [$def]}: " v
  fi
  v="${v:-$def}"
  [[ "$v" =~ $re ]] || die "invalid value for $key"
  A[$key]="$v"
}

HOST_RE='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
ask TC_PANEL_HOST "Customer panel domain (e.g. panel.example.com)" "$HOST_RE"
ask TC_ADMIN_HOST "Operator app domain (e.g. ops.example.com)" "$HOST_RE"
ask TC_ADMIN_ALLOW "Operator IP allowlist, CIDRs separated by spaces" '^[0-9a-fA-F:./ ]{7,500}$'
ask TC_ACME_EMAIL "Email for the TLS certificates (Let's Encrypt)" '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}$'
ask AWS_REGION "AWS Region of this instance" '^[a-z]{2}(-[a-z]+)+-[0-9]$' "$(cloud-init query region 2>/dev/null || true)"
ask COGNITO_CUSTOMER_POOL_ID "Cognito user pool id for customers" '^[a-z]{2}(-[a-z]+)+-[0-9]_[A-Za-z0-9]{1,55}$'
ask COGNITO_CUSTOMER_CLIENT_ID "Cognito app client id for customers" '^[a-z0-9]{1,128}$'
ask COGNITO_ADMIN_POOL_ID "Cognito user pool id for operators" '^[a-z]{2}(-[a-z]+)+-[0-9]_[A-Za-z0-9]{1,55}$'
ask COGNITO_ADMIN_CLIENT_ID "Cognito app client id for operators" '^[a-z0-9]{1,128}$'
ask TC_FIRST_ADMIN_SUB "Cognito sub of the first operator (empty to skip)" '^([0-9a-f-]{36})?$' ""

# The answers are not secret; they are kept so a re-run asks nothing.
mkdir -p "$ETC" && chmod 0751 "$ETC"
{
  for k in TC_PANEL_HOST TC_ADMIN_HOST TC_ADMIN_ALLOW TC_ACME_EMAIL AWS_REGION COGNITO_CUSTOMER_POOL_ID \
    COGNITO_CUSTOMER_CLIENT_ID COGNITO_ADMIN_POOL_ID COGNITO_ADMIN_CLIENT_ID TC_FIRST_ADMIN_SUB; do
    printf '%s=%s\n' "$k" "${A[$k]}"
  done
} >"$ETC/.answers.tmp"
chmod 0600 "$ETC/.answers.tmp"
mv "$ETC/.answers.tmp" "$ETC/answers.env"

# ---------------------------------------------------------------- packages
say "1/7 packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# PostgreSQL 16 from Ubuntu's own archive (main). No third-party apt repository on the box.
apt-get install -y -qq postgresql-16 nftables curl xz-utils openssl >/dev/null

# pinned_download URL FILE SUMFILE ALGO: downloads FILE and checks it against the sum pinned in the
# release (R17) before anything of it is used. Prints the path of the checked file.
pinned_download() {
  local url="$1" file="$2" sums="$3" algo="$4" dir expected
  dir="$(mktemp -d)"
  expected="$(grep -E "^[0-9a-f]{64,128}  $file\$" "$sums" | cut -d' ' -f1 || true)"
  [[ -n "$expected" ]] || die "no pinned checksum for $file"
  curl -fsSL --proto '=https' -o "$dir/$file" "$url"
  echo "$expected  $dir/$file" | "${algo}sum" -c --quiet - || die "checksum mismatch for $file"
  printf '%s' "$dir/$file"
}
arch="$(dpkg --print-architecture)"
case "$arch" in amd64) narch=x64 ;; arm64) narch=arm64 ;; *) die "unsupported architecture" ;; esac
if [[ "$(node --version 2>/dev/null || true)" != "v$NODE_VERSION" ]]; then
  # Pinned from nodejs.org SHASUMS256.txt.
  tarball="node-v$NODE_VERSION-linux-$narch.tar.xz"
  got="$(pinned_download "https://nodejs.org/dist/v$NODE_VERSION/$tarball" "$tarball" "$RELEASE/box/node-sha256" sha256)"
  tar -xJf "$got" -C /usr/local --strip-components=1 --no-same-owner
  ln -sf /usr/local/bin/node /usr/bin/node
  rm -rf "$(dirname "$got")"
fi
if [[ "$(/usr/local/bin/caddy version 2>/dev/null | cut -d' ' -f1)" != "v$CADDY_VERSION" ]]; then
  # Security review M3: the one public-facing process is a current, pinned Caddy release (SHA-512 from the
  # checksums file of the GitHub release), not the older package of Ubuntu's universe archive.
  tarball="caddy_${CADDY_VERSION}_linux_$arch.tar.gz"
  got="$(pinned_download "https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION/$tarball" \
    "$tarball" "$RELEASE/box/caddy-sha512" sha512)"
  tar -xzf "$got" -C "$(dirname "$got")" caddy
  install -m 0755 -o root -g root "$(dirname "$got")/caddy" /usr/local/bin/caddy
  rm -rf "$(dirname "$got")"
fi

# ---------------------------------------------------------------- users
say "2/7 users"
getent group tc >/dev/null || groupadd --system tc
for u in tc-web tc-admin tc-worker; do
  id "$u" >/dev/null 2>&1 || useradd --system --gid tc --home-dir /nonexistent --shell /usr/sbin/nologin "$u"
done
getent group caddy >/dev/null || groupadd --system caddy
id caddy >/dev/null 2>&1 || useradd --system --gid caddy --home-dir /var/lib/tc-caddy --shell /usr/sbin/nologin caddy
install -d -m 0700 -o root -g root /var/log/tc
install -d -m 0700 -o caddy -g caddy /var/lib/tc-caddy
mkdir -p /var/backups/tc && chown postgres:postgres /var/backups/tc && chmod 0700 /var/backups/tc

# ---------------------------------------------------------------- secrets (generated once, kept)
say "3/7 secrets"
secret() { openssl rand -hex 24; } # 48 characters of [0-9a-f]: no pipe, no shell quoting issue
SECRETS="$ETC/.secrets"
if [[ ! -f "$SECRETS" ]]; then
  {
    echo "OWNER=$(secret)"
    echo "WEB_RW=$(secret)"
    echo "ADMIN_RW=$(secret)"
    echo "WORKER_RW=$(secret)"
    echo "MIGRATOR=$(secret)"
    echo "REPORT_RO=$(secret)"
    echo "INVOKE=$(secret)"
  } >"$SECRETS"
  chmod 0600 "$SECRETS"
fi
# Read, never sourced: KEY=hex lines only (security review L1, L2).
while IFS='=' read -r k v; do
  [[ "$k" =~ ^[A-Z_]+$ && "$v" =~ ^[0-9a-f]{48}$ ]] || die "the secrets file is damaged"
  printf -v "$k" '%s' "$v"
done <"$SECRETS"

# ---------------------------------------------------------------- postgresql
say "4/7 database"
if [[ ! -f "$PG_ETC/tc-server.key" ]]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
    -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
    -keyout "$PG_ETC/tc-server.key" -out "$PG_ETC/tc-server.crt" 2>/dev/null
  chown postgres:postgres "$PG_ETC/tc-server.key" "$PG_ETC/tc-server.crt"
  chmod 0600 "$PG_ETC/tc-server.key"
fi
install -m 0644 "$PG_ETC/tc-server.crt" "$ETC/pg-ca.crt"
install -m 0644 -o postgres -g postgres "$RELEASE/box/postgres/tc.conf" "$PG_ETC/conf.d/tc.conf"
install -m 0640 -o postgres -g postgres "$RELEASE/box/postgres/pg_hba.conf" "$PG_ETC/pg_hba.conf"
systemctl enable --now postgresql >/dev/null 2>&1
systemctl restart postgresql

psql_su() { su postgres -s /bin/bash -c "psql -v ON_ERROR_STOP=1 -qtA $*"; }
if [[ "$(psql_su "-c \"select 1 from pg_roles where rolname='tc_owner'\"")" != 1 ]]; then
  psql_su "-c \"create role tc_owner login createrole\""
fi
# Security review H1: only the SCRAM verifier reaches the server (on stdin, never argv), so the clear-text
# password is in no statement and no log line.
VERIFIER="$(printf '%s' "$OWNER" | node "$RELEASE/box/bin/scram-verifier.mjs")" || die "verifier failed"
[[ "$VERIFIER" =~ ^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$ ]] || die "verifier failed"
printf "alter role tc_owner password '%s';\n" "$VERIFIER" | su postgres -s /bin/bash -c "psql -v ON_ERROR_STOP=1 -qtA" >/dev/null
if [[ "$(psql_su "-c \"select 1 from pg_database where datname='ticoncloud'\"")" != 1 ]]; then
  psql_su "-c \"create database ticoncloud owner tc_owner\""
fi

# ---------------------------------------------------------------- env files
say "5/7 configuration"
TLS="?sslmode=verify-full&sslrootcert=$ETC/pg-ca.crt"
url() { printf 'postgres://%s:%s@127.0.0.1:5432/ticoncloud%s' "$1" "$2" "$TLS"; }

write_env() { # file owner group mode, content on stdin
  local f="$1" tmp
  tmp="$(mktemp "$ETC/.tmp.XXXXXX")"
  cat >"$tmp"
  chown "$2:$3" "$tmp"
  chmod "$4" "$tmp"
  mv "$tmp" "$f"
}

write_env "$ETC/common.env" root root 0600 <<EOF
TC_STAGE=pro
AWS_REGION=${A[AWS_REGION]}
EOF
write_env "$ETC/web.env" root root 0600 <<EOF
DATABASE_URL=$(url web_rw "$WEB_RW")
PRO_INVOKE_SOCKET=/run/tc-invoke/invoke.sock
PRO_INVOKE_TOKEN=$INVOKE
APP_ORIGIN=https://${A[TC_PANEL_HOST]}
COGNITO_CUSTOMER_POOL_ID=${A[COGNITO_CUSTOMER_POOL_ID]}
COGNITO_CUSTOMER_CLIENT_ID=${A[COGNITO_CUSTOMER_CLIENT_ID]}
EOF
write_env "$ETC/admin.env" root root 0600 <<EOF
DATABASE_URL=$(url admin_rw "$ADMIN_RW")
ADMIN_IP_ALLOWLIST=$(tr ' ' ',' <<<"${A[TC_ADMIN_ALLOW]}")
COGNITO_ADMIN_POOL_ID=${A[COGNITO_ADMIN_POOL_ID]}
COGNITO_ADMIN_CLIENT_ID=${A[COGNITO_ADMIN_CLIENT_ID]}
EOF
# PRO-5: the AWS Marketplace product SKU is baked into the AMI (PRO-7); empty outside a Marketplace install.
PRODUCT_SKU="$(tr -d '[:space:]' <"$RELEASE/box/product-sku" 2>/dev/null || true)"
[[ -z "$PRODUCT_SKU" || "$PRODUCT_SKU" =~ ^[A-Za-z0-9-]{1,128}$ ]] || die "invalid product SKU in the release"
write_env "$ETC/worker.env" root root 0600 <<EOF
DATABASE_URL=$(url worker_rw "$WORKER_RW")
PRO_INVOKE_SOCKET=/run/tc-invoke/invoke.sock
PRO_INVOKE_TOKEN=$INVOKE
TC_PRODUCT_SKU=$PRODUCT_SKU
EOF
write_env "$ETC/caddy.env" root root 0600 <<EOF
TC_ACME_EMAIL=${A[TC_ACME_EMAIL]}
TC_PANEL_HOST=${A[TC_PANEL_HOST]}
TC_ADMIN_HOST=${A[TC_ADMIN_HOST]}
TC_ADMIN_ALLOW=${A[TC_ADMIN_ALLOW]}
EOF
[[ -f "$ETC/backup.env" ]] || write_env "$ETC/backup.env" root root 0600 <<EOF
TC_BACKUP_S3_URI=
TC_BACKUP_KEEP_DAYS=14
EOF
write_env "$ETC/migrate.env" root root 0600 <<EOF
TC_MASTER_URL=$(url tc_owner "$OWNER")
TC_MIGRATIONS_DIR=$RELEASE/migrations
TC_DB_PASSWORD_WEB_RW=$WEB_RW
TC_DB_PASSWORD_ADMIN_RW=$ADMIN_RW
TC_DB_PASSWORD_WORKER_RW=$WORKER_RW
TC_DB_PASSWORD_MIGRATOR=$MIGRATOR
TC_DB_PASSWORD_REPORT_RO=$REPORT_RO
TC_FIRST_ADMIN_SUB=${A[TC_FIRST_ADMIN_SUB]}
EOF

# ---------------------------------------------------------------- migrate
say "6/7 migrations"
# systemd reads the env file itself: nothing is sourced or evaluated by bash (security review L1, L2).
install -m 0600 -o root -g root /dev/null /var/log/tc/migrate.log
systemd-run --quiet --wait --pipe --collect --property=EnvironmentFile="$ETC/migrate.env" \
  --working-directory="$RELEASE/worker" /usr/bin/node migrate.mjs >/var/log/tc/migrate.log 2>&1 \
  || die "migrations failed, see /var/log/tc/migrate.log"
psql_su "-d ticoncloud -c \"grant connect on database ticoncloud to web_rw, admin_rw, worker_rw, migrator, report_ro\""
psql_su "-c \"revoke connect on database ticoncloud from public\""

# ---------------------------------------------------------------- services
say "7/7 services"
install -m 0644 "$RELEASE/box/caddy/Caddyfile" "$ETC/Caddyfile"
install -m 0644 "$RELEASE/box/nftables/tc.nft" "$ETC/tc.nft"
for u in tc-firewall tc-web tc-admin tc-worker tc-caddy tc-backup; do
  install -m 0644 "$RELEASE/box/systemd/$u.service" /etc/systemd/system/
done
install -m 0644 "$RELEASE/box/systemd/tc-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tc-firewall >/dev/null 2>&1
systemctl restart tc-firewall
systemctl enable --now tc-worker tc-web tc-admin tc-backup.timer >/dev/null 2>&1
systemctl restart tc-worker tc-web tc-admin
systemd-run --quiet --wait --pipe --collect --property=EnvironmentFile="$ETC/caddy.env" --uid=caddy \
  --setenv=XDG_DATA_HOME=/var/lib/tc-caddy --setenv=XDG_CONFIG_HOME=/var/lib/tc-caddy \
  /usr/local/bin/caddy validate --config "$ETC/Caddyfile" --adapter caddyfile >/dev/null 2>&1 \
  || die "the Caddy configuration did not validate"
systemctl enable tc-caddy >/dev/null 2>&1
systemctl restart tc-caddy

for u in postgresql tc-firewall tc-worker tc-web tc-admin tc-caddy; do
  systemctl is-active --quiet "$u" || die "$u is not running (journalctl -u $u)"
done
say "done: https://${A[TC_PANEL_HOST]} and https://${A[TC_ADMIN_HOST]}"
