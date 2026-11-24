# Secret rotation

Rules: R3 (no long-lived AWS keys; no secrets in the repo, in logs or in client bundles), R14. This page names where secrets live. It holds no value and no example value.

## Trigger

A planned rotation, a person with access leaves, or a suspected leak (a secret in a log, a ticket, a chat or a bundle).

## Who

DevOps (a person). A Claude Code session does not read, print or rotate secrets and never runs `sst secret`.

## Where secrets live

- EPS credentials: SST Secrets `EpsMerchantId`, `EpsStoreId`, `EpsUsername`, `EpsPassword`, `EpsHashKey`. They reach the `payments-sweeper` and the web payment code only through the secret port (`functions/payments-sweeper/secrets.ts`). Errors name the secret, never the value.
- SMS gateway (Gennet): SST Secrets `SmsApiKey` (the API token) and `SmsSenderId` (the sender id), read by the `notifier` and by the web app for the phone OTP. See [sms-gateway.md](sms-gateway.md); to stop every send at once, revoke the token in the Gennet portal.
- Database: per-role credentials in RDS Proxy (`web_rw`, `admin_rw`, `worker_rw`, `report_ro`); `migrator` alone uses the master user (Section 3.3).
- Cognito: user pool settings; no shared password.
- AWS cross-account access: STS AssumeRole only. There are no long-lived access keys to rotate; if one exists, that is itself an incident (see [incident.md](incident.md)).

## Steps

1. Create the new value at the provider (EPS dashboard, SMS gateway console, RDS Proxy secret) as a person, not through chat or the repository.
2. Set it in the staging stage first, deploy staging, and run a test top-up and a test notification. Staging deploys are asked for first (`npx sst deploy --stage staging`).
3. Production: the CI deploy role deploys after approval. A person sets the production secret through the SST secret commands on their own trusted machine or in the console; the value never enters a ticket.
4. Check: a payment verifies, the sweeper log shows `payments_sweep`, and the notifier log shows no `notifier_run_failed`.
5. Revoke the old value at the provider.

## Safe checks

Search the repository and the staging log groups for the old and new value markers is done by the CI secret scan and the log-search script of the Section 15 gate; never search by pasting the value.

## Rollback

Keep the old value valid until step 4 passes. If it fails, set the old secret back and redeploy.

## Log

Which secret name, when, who, staging and production result. Never the value, not even a prefix.

## Must not

Put a value in `.env`, the repository, a log, a pull request or a chat; deploy production from a laptop.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
