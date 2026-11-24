#!/usr/bin/env bash
# WPU-Z11: deploys the three GitHub OIDC CI role stacks of infra/org into the account of the CURRENT AWS
# credentials (staging and production share that account, owner decision 2026-11-13):
#   tc-ci-deploy-staging     infra/org/ci-deploy-staging.yaml     role TcCiDeployStaging
#   tc-ci-plan-production    infra/org/ci-plan-production.yaml    role TcCiPlanProduction
#   tc-ci-deploy-production  infra/org/ci-deploy-production.yaml  role TcCiDeployProduction
# and tc-ci-oidc-provider (infra/org/ci-oidc-provider.yaml) ONLY when the account has no OpenID Connect
# provider for token.actions.githubusercontent.com (one per account and URL; the role templates build the
# provider ARN themselves, so a provider made by another project serves too).
#
# Run by the owner, never by Claude Code or CI (docs/runbooks/go-live.md step 3). Load the credentials
# first with the pattern of JOURNEY.md (an `aws login` profile):
#   CREDS="$(aws configure export-credentials --profile your-aws-profile --format env)" && eval "$CREDS"
#   export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null; unset AWS_PROFILE
#
# Refuses (exit 1, nothing deployed) when `aws sts get-caller-identity` fails, when the account is the
# management account of its AWS Organization, or when the organization cannot be checked (R16).
# GitHub ids: GitHub signs the immutable OIDC subject repo:<org>@<owner-id>/<repo>@<repo-id>:... for this
# repository; the ids are read with `gh api`, or taken from TC_GITHUB_OWNER_ID and TC_GITHUB_REPO_ID.
# Prints only stack names and final statuses. No secret is read or printed.
set -euo pipefail
umask 077

readonly GITHUB_ORG="bemoshiur"
readonly GITHUB_REPO="panelpay"
readonly STAGING_WEB_DOMAIN="staging.tryaws.now"
readonly STAGING_ADMIN_DOMAIN="admin-staging.tryaws.now"
readonly PROTECTED_BRANCH="main"
readonly REGION="ap-southeast-1"
readonly OIDC_HOST="token.actions.githubusercontent.com"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly ROOT
readonly ORG_DIR="${ROOT}/infra/org"

die() {
  echo "ci-roles: $1" >&2
  exit 1
}

command -v aws >/dev/null 2>&1 || die "the aws command is not installed"

# 1. Credentials must work. Fail closed: no fallback to another profile.
if ! ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  die "AWS credentials do not work (aws sts get-caller-identity failed). Load them first: see docs/runbooks/go-live.md"
fi
[[ "$ACCOUNT" =~ ^[0-9]{12}$ ]] || die "aws sts get-caller-identity gave no account id"

# 2. Never the management account (CLAUDE.md). An account outside any organization is fine; any other
#    error means the check could not complete, so refuse (R16).
if ORG_ERR="$(aws organizations describe-organization --query Organization.MasterAccountId --output text 2>&1)"; then
  [[ "$ORG_ERR" =~ ^[0-9]{12}$ ]] || die "the organization check gave no management account id; refusing"
  [[ "$ORG_ERR" != "$ACCOUNT" ]] || die "the current credentials are in the organization's management account; refusing"
elif [[ "$ORG_ERR" != *AWSOrganizationsNotInUseException* ]]; then
  die "the organization check failed; refusing (is this the right account and are the credentials complete?)"
fi

# 3. GitHub owner and repository ids (digits only).
OWNER_ID="${TC_GITHUB_OWNER_ID:-}"
REPO_ID="${TC_GITHUB_REPO_ID:-}"
if [[ -z "$OWNER_ID" || -z "$REPO_ID" ]]; then
  command -v gh >/dev/null 2>&1 || die "gh is not installed: set TC_GITHUB_OWNER_ID and TC_GITHUB_REPO_ID (docs/runbooks/go-live.md)"
  OWNER_ID="$(gh api "repos/${GITHUB_ORG}/${GITHUB_REPO}" --jq .owner.id)" || die "gh api could not read the repository"
  REPO_ID="$(gh api "repos/${GITHUB_ORG}/${GITHUB_REPO}" --jq .id)" || die "gh api could not read the repository"
fi
[[ "$OWNER_ID" =~ ^[0-9]{1,20}$ ]] || die "the GitHub owner id is not a number"
[[ "$REPO_ID" =~ ^[0-9]{1,20}$ ]] || die "the GitHub repository id is not a number"

# deploy <stack> <template> <parameter overrides...>: prints "<stack> <status>" only.
deploy() {
  local stack="$1" template="$2"
  shift 2
  local args=(
    --region "$REGION"
    --stack-name "$stack"
    --template-file "${ORG_DIR}/${template}"
    --capabilities CAPABILITY_NAMED_IAM
    --no-fail-on-empty-changeset
  )
  if [[ $# -gt 0 ]]; then args+=(--parameter-overrides "$@"); fi
  if ! aws cloudformation deploy "${args[@]}" >/dev/null 2>&1; then
    echo "${stack} FAILED (read the stack events in the CloudFormation console)"
    return 1
  fi
  local status
  status="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$stack" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null)" || status="UNKNOWN"
  echo "${stack} ${status}"
}

# 4. The OIDC provider, only when none exists for the GitHub host.
PROVIDERS="$(aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text 2>/dev/null)" ||
  die "could not list the OpenID Connect providers; refusing"
if [[ "$PROVIDERS" != *"oidc-provider/${OIDC_HOST}"* ]]; then
  deploy tc-ci-oidc-provider ci-oidc-provider.yaml || die "the OIDC provider stack failed; the role stacks were not deployed"
else
  echo "tc-ci-oidc-provider SKIPPED (the account already has a provider for ${OIDC_HOST})"
fi

GITHUB_PARAMS=(
  "GitHubOrg=${GITHUB_ORG}"
  "GitHubOwnerId=${OWNER_ID}"
  "GitHubRepo=${GITHUB_REPO}"
  "GitHubRepoId=${REPO_ID}"
)

FAILED=0
deploy tc-ci-deploy-staging ci-deploy-staging.yaml "${GITHUB_PARAMS[@]}" \
  "ProtectedBranch=${PROTECTED_BRANCH}" \
  "WebDomain=${STAGING_WEB_DOMAIN}" \
  "AdminDomain=${STAGING_ADMIN_DOMAIN}" || FAILED=1
deploy tc-ci-plan-production ci-plan-production.yaml "${GITHUB_PARAMS[@]}" || FAILED=1
deploy tc-ci-deploy-production ci-deploy-production.yaml "${GITHUB_PARAMS[@]}" || FAILED=1

exit "$FAILED"
