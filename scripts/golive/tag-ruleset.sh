#!/usr/bin/env bash
# WPU-Y5 (d): creates, or brings back to the wanted form, the repository ruleset `tc-release-tags` on the tags
# refs/tags/v* of this repository: only the repository admin role may create, update (move) or delete a release
# tag. The production deploy runs from a v* tag (docs/runbooks/go-live.md), so this keeps a person without admin
# rights from starting it once there are more collaborators.
#
# Run by the owner, never by Claude Code or CI, with `gh` logged in as a repository admin:
#   bash scripts/golive/tag-ruleset.sh
#
# Idempotent: it lists the rulesets of the repository (tags only, not inherited), updates the one named
# tc-release-tags when it exists (PUT) and creates it otherwise (POST), then reads it back and refuses (exit 1)
# when GitHub does not hold the wanted target, enforcement, tag pattern, rules and admin bypass (R16).
# GitHub REST "Repository rules" (API version 2022-11-28): target tag, enforcement active,
# conditions.ref_name.include ["refs/tags/v*"], rules creation/update/deletion, bypass_actors RepositoryRole with
# actor_id 5 (the repository admin role; GitHub does not document the role ids, VERIFY in the ruleset page after
# the first run that the bypass list shows "Repository admin").
#
# A private repository on GitHub Free has no rulesets: GitHub answers HTTP 403 ("Upgrade to GitHub Pro or make
# this repository public"). The script then says so and exits 3; nothing changed. Until then the gate is the
# production environment's deployment tag policy v* (docs/runbooks/go-live.md).
#
# Prints only the ruleset id, the action and the HTTP status of a failure. It never reads, prints or passes a
# token: `gh` uses its own login, and no raw answer of GitHub is printed.
set -euo pipefail
umask 077

readonly GITHUB_ORG="bemoshiur"
readonly GITHUB_REPO="panelpay"
readonly RULESET_NAME="tc-release-tags"
readonly TAG_PATTERN="refs/tags/v*"
readonly ADMIN_ROLE_ID=5
readonly API_VERSION="X-GitHub-Api-Version: 2022-11-28"
readonly REPO_PATH="repos/${GITHUB_ORG}/${GITHUB_REPO}"

die() {
  echo "tag-ruleset: $1" >&2
  exit "${2:-1}"
}

# fail_from <answer of a failed gh api call> [written]: a clear message by HTTP status, never the answer itself.
# Before any write it says "Nothing changed."; with `written` (the read-back after a successful POST or PUT) it says
# that the ruleset was written and must be checked in the GitHub settings.
fail_from() {
  local status outcome
  status="$(grep -oE 'HTTP [0-9]{3}' <<<"$1" | tail -n 1 | cut -d' ' -f2 || true)"
  if [[ "${2:-}" == "written" ]]; then
    outcome="The ruleset WAS written (${ACTION:-written} ${RULESET_ID:-}), but it could not be read back: check ${RULESET_NAME} in the GitHub settings (Rules, Rulesets)."
  else
    outcome="Nothing changed."
  fi
  case "$status" in
    403)
      if [[ "${2:-}" == "written" ]]; then die "GitHub answered HTTP 403 to the read-back. ${outcome}"; fi
      die "GitHub answered HTTP 403: rulesets on a private repository need GitHub Pro (or Team). ${outcome} Buy GitHub Pro, then run this again (docs/runbooks/go-live.md)." 3
      ;;
    404) die "GitHub answered HTTP 404: the repository is not visible to the gh login, or the login is not a repository admin. ${outcome}" ;;
    401) die "GitHub answered HTTP 401: gh is not logged in (run gh auth login yourself). ${outcome}" ;;
    "") die "gh api failed without an HTTP status (network or gh error). ${outcome}" ;;
    *) die "GitHub answered HTTP ${status}. ${outcome}" ;;
  esac
}

command -v gh >/dev/null 2>&1 || die "gh is not installed"

readonly BODY='{
  "name": "tc-release-tags",
  "target": "tag",
  "enforcement": "active",
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [{ "type": "creation" }, { "type": "update" }, { "type": "deletion" }]
}'

# 1. The rulesets of this repository on tags, not the inherited ones.
if ! LISTED="$(gh api -H "$API_VERSION" \
  "${REPO_PATH}/rulesets?targets=tag&includes_parents=false&per_page=100" \
  --jq ".[] | select(.name == \"${RULESET_NAME}\") | .id" 2>&1)"; then
  fail_from "$LISTED"
fi
# bash 3.2 (macOS) has no mapfile: count the non-empty lines.
EXISTING=""
COUNT=0
while IFS= read -r id; do
  [[ -n "$id" ]] || continue
  [[ "$id" =~ ^[0-9]{1,20}$ ]] || die "the ruleset list gave an id that is not a number"
  EXISTING="$id"
  COUNT=$((COUNT + 1))
done <<<"$LISTED"
[[ "$COUNT" -le 1 ]] || die "more than one ruleset is named ${RULESET_NAME}; remove the extra one in the GitHub settings first"

# 2. Update the one that exists, or create it.
if [[ "$COUNT" -eq 1 ]]; then
  ACTION="updated"
  if ! OUT="$(gh api -H "$API_VERSION" --method PUT "${REPO_PATH}/rulesets/${EXISTING}" \
    --input - --jq .id <<<"$BODY" 2>&1)"; then
    fail_from "$OUT"
  fi
else
  ACTION="created"
  if ! OUT="$(gh api -H "$API_VERSION" --method POST "${REPO_PATH}/rulesets" \
    --input - --jq .id <<<"$BODY" 2>&1)"; then
    fail_from "$OUT"
  fi
fi
RULESET_ID="$(tail -n 1 <<<"$OUT")"
[[ "$RULESET_ID" =~ ^[0-9]{1,20}$ ]] || die "GitHub gave no ruleset id"

# 3. Read it back: the form GitHub holds, as one line (R16: a ruleset that differs is a failure).
readonly SHAPE_JQ='[.target, .enforcement, (.conditions.ref_name.include | join(",")),
  ([.rules[].type] | sort | join(",")),
  ([.bypass_actors[] | "\(.actor_type):\(.actor_id):\(.bypass_mode)"] | join(","))] | join(" ")'
if ! SHAPE="$(gh api -H "$API_VERSION" "${REPO_PATH}/rulesets/${RULESET_ID}" --jq "$SHAPE_JQ" 2>&1)"; then
  fail_from "$SHAPE" written
fi
readonly WANTED="tag active ${TAG_PATTERN} creation,deletion,update RepositoryRole:${ADMIN_ROLE_ID}:always"
[[ "$SHAPE" == "$WANTED" ]] || die "ruleset ${RULESET_ID} does not hold the wanted form after the ${ACTION%d}; check it in the GitHub settings"

echo "tag-ruleset: ${ACTION} ruleset ${RULESET_ID} (${RULESET_NAME}: ${TAG_PATTERN}, creation, update and deletion for repository admins only)"
