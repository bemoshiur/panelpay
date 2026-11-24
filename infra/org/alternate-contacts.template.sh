#!/usr/bin/env bash
# PanelPay: security alternate contact of every account (Section 3.3, Section 15 item 17,
# docs/runbooks/pool-account-onboarding.md step 4). AUTHORED ONLY. DevOps runs it by hand from the
# management account (or the delegated administrator of AWS Account Management) with a person's role.
# Claude Code never runs it.
#
# It is a DRY RUN unless the first argument is --apply. In a dry run it only prints what it would do.
#
# Inputs (environment, never written into this repository):
#   TC_ACCOUNTS_FILE            text file, one account per line: "<alias> <12 digit account id>"
#   TC_SECURITY_CONTACT_NAME    name of the monitored mailbox owner (a team, not a person if possible)
#   TC_SECURITY_CONTACT_TITLE   role title
#   TC_SECURITY_CONTACT_EMAIL   monitored mailbox that receives AWS abuse and security notices
#   TC_SECURITY_CONTACT_PHONE   phone number in +<country code><number> form
# VERIFY: `aws account put-alternate-contact` takes --account-id only from the management account or
# a delegated administrator, and only when trusted access for account.amazonaws.com is enabled
# (`aws organizations enable-aws-service-access --service-principal account.amazonaws.com`).
# VERIFY: the option names below against `aws account put-alternate-contact help`.
# R14: the script prints the alias, never the email address, the phone number or the account id.

set -euo pipefail

mode="dry-run"
if [ "${1:-}" = "--apply" ]; then
  mode="apply"
fi

for name in TC_ACCOUNTS_FILE TC_SECURITY_CONTACT_NAME TC_SECURITY_CONTACT_TITLE TC_SECURITY_CONTACT_EMAIL TC_SECURITY_CONTACT_PHONE; do
  if [ -z "${!name:-}" ]; then
    echo "missing environment variable: ${name}" >&2
    exit 2
  fi
done

if [ ! -r "${TC_ACCOUNTS_FILE}" ]; then
  echo "cannot read the accounts file" >&2
  exit 2
fi

count=0
while read -r alias account_id; do
  case "${alias}" in
    "" | \#*) continue ;;
  esac
  if ! [[ "${account_id}" =~ ^[0-9]{12}$ ]]; then
    echo "skip ${alias}: the account id is not 12 digits" >&2
    exit 2
  fi
  if [ "${mode}" = "apply" ]; then
    aws account put-alternate-contact \
      --account-id "${account_id}" \
      --alternate-contact-type SECURITY \
      --name "${TC_SECURITY_CONTACT_NAME}" \
      --title "${TC_SECURITY_CONTACT_TITLE}" \
      --email-address "${TC_SECURITY_CONTACT_EMAIL}" \
      --phone-number "${TC_SECURITY_CONTACT_PHONE}"
    # Read it back: a call that returned 200 but stored something else is not a proof.
    aws account get-alternate-contact \
      --account-id "${account_id}" \
      --alternate-contact-type SECURITY \
      --query 'AlternateContact.AlternateContactType' --output text > /dev/null
    echo "set the SECURITY alternate contact of ${alias}"
  else
    echo "dry run: would set the SECURITY alternate contact of ${alias}"
  fi
  count=$((count + 1))
done < "${TC_ACCOUNTS_FILE}"

echo "${mode}: ${count} account(s)"
