#!/usr/bin/env bash
# PRO-7. Builds the Pro release archive that the AMI bakes in:
#   web/ admin/   Next.js standalone servers (TC_BUILD_TARGET=pro), with .next/static and public/
#   worker/       main.mjs, migrate.mjs, licence-gate.mjs + their pinned npm dependencies
#   bridge/       bridge.mjs + its pinned npm dependencies (WHMCS bridge, PRO-6)
#   migrations/   packages/db/migrations (forward-only)
#   box/          pro/box (units, Caddyfile, installer, pins)
#   whmcs/        the WHMCS addon (modules/addons/panelpay) for the buyer to upload to their WHMCS
#   RELEASE       the git commit
# Output: pro/ami/out/tc-pro-<commit>.tar.gz. No secret is in it: secrets are made at first boot.
set -euo pipefail
umask 022

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
COMMIT="$(git rev-parse --short=12 HEAD)"
[[ -z "$(git status --porcelain -- apps packages pro functions)" ]] || {
  echo "make-release: the working tree has changes; commit first" >&2
  exit 1
}
OUT="$ROOT/pro/ami/out"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
REL="$STAGE/tc-pro-$COMMIT"
mkdir -p "$REL" "$OUT"

export TC_BUILD_TARGET=pro NEXT_TELEMETRY_DISABLED=1
for app in web admin; do
  pnpm --filter "@tc/$app" build >/dev/null
  mkdir -p "$REL/$app"
  cp -a "apps/$app/.next/standalone/." "$REL/$app/"
  mkdir -p "$REL/$app/apps/$app/.next"
  cp -a "apps/$app/.next/static" "$REL/$app/apps/$app/.next/static"
  [[ -d "apps/$app/public" ]] && cp -a "apps/$app/public" "$REL/$app/apps/$app/public"
  # No environment file of the build host travels with the release.
  find "$REL/$app" -maxdepth 4 -name '.env*' -type f -delete
done

for pkg in worker whmcs-bridge; do
  (cd "pro/$pkg" && pnpm run build >/dev/null)
  dest="$REL/$([[ $pkg == worker ]] && echo worker || echo bridge)"
  mkdir -p "$dest"
  cp -a "pro/$pkg/dist/." "$dest/"
  rm -rf "$dest/node_modules"
  (cd "$dest" && npm install --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null)
done

cp -a packages/db/migrations "$REL/migrations"
cp -a pro/box "$REL/box"
mkdir -p "$REL/whmcs" && cp -a pro/whmcs/modules "$REL/whmcs/modules"
echo "$COMMIT" >"$REL/RELEASE"

tar -C "$STAGE" -czf "$OUT/tc-pro-$COMMIT.tar.gz" "tc-pro-$COMMIT"
sha256sum "$OUT/tc-pro-$COMMIT.tar.gz" | tee "$OUT/tc-pro-$COMMIT.tar.gz.sha256"
