# Runbooks

Operational pages of Section M (operations and support). Each one has a trigger, who acts, safe checks, steps, rollback, what to log and what must not be done. They name the admin actions of `docs/spec/16/16.12-admin-screens-wp8.md`, the log events of the functions and the files of this repository.

Rules that hold in every runbook: never deploy production by hand (the CI role deploys after approval), never touch the management account, no long-lived AWS keys (STS AssumeRole only), no secret value in any page, log or chat, no personal data in logs (R14), and a correction of money is a reversing transaction (R5). The specification describes no break-glass procedure, so none exists; see the end of [incident.md](incident.md).

Commands cited in these pages: `pnpm verify --task <id>`, `pnpm db:up`, `pnpm db:migrate`, `pnpm test --filter <package>`, `node scripts/restore-drill.mjs`. The repository test of task WP9-T4 checks that every page below exists and that every `pnpm` script it cites is in `package.json`.

## Index

| Runbook                                                                          | Section M topic                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [payment-stuck-or-disputed.md](payment-stuck-or-disputed.md)                     | payment stuck or disputed                               |
| [eps-unavailable-manual-topup.md](eps-unavailable-manual-topup.md)               | EPS unavailable, manual top-up                          |
| [ledger-check-failed.md](ledger-check-failed.md)                                 | reconciliation mismatch, ledger check failed            |
| [refund.md](refund.md)                                                           | refund                                                  |
| [fx-rate-change.md](fx-rate-change.md)                                           | FX rate change                                          |
| [provisioning-failed-and-dead-letter.md](provisioning-failed-and-dead-letter.md) | provisioning failed, dead-letter queue                  |
| [capacity-full-and-quota.md](capacity-full-and-quota.md)                         | capacity full, quota request                            |
| [lifecycle-approval.md](lifecycle-approval.md)                                   | lifecycle approval                                      |
| [disk-detach-and-destroy.md](disk-detach-and-destroy.md)                         | disk detach and destroy: unmount, stop, then detach     |
| [unpaid-usage-switch.md](unpaid-usage-switch.md)                                 | turning the unpaid usage rule on or off                 |
| [pool-account-onboarding.md](pool-account-onboarding.md)                         | adding a pool account                                   |
| [pool-account-single.md](pool-account-single.md)                                 | launch on one pool account                              |
| [single-account-lean.md](single-account-lean.md)                                 | one account, lean stage                                 |
| [go-live.md](go-live.md)                                                         | go-live in one account: CI roles, secrets, first deploy |
| [staging-on-demand.md](staging-on-demand.md)                                     | staging only during test sessions, removed after each   |
| [domain-registration-problem.md](domain-registration-problem.md)                 | domain registration problem                             |
| [abuse-notice-and-suspension.md](abuse-notice-and-suspension.md)                 | abuse notice                                            |
| [kyc-review.md](kyc-review.md)                                                   | KYC review                                              |
| [customer-mfa-reset.md](customer-mfa-reset.md)                                   | customer authenticator (TOTP) reset                     |
| [bucket-access-key-orphan.md](bucket-access-key-orphan.md)                       | bucket access key, orphan after a lost answer           |
| [secret-rotation.md](secret-rotation.md)                                         | secret rotation                                         |
| [sms-gateway.md](sms-gateway.md)                                                 | SMS gateway (Gennet), secrets, test send                |
| [incident.md](incident.md)                                                       | incident                                                |
| [support-requests.md](support-requests.md)                                       | support inbox                                           |
| [restore-drill.md](restore-drill.md)                                             | database restore (written in WP9-T3)                    |
| [ai-visibility.md](ai-visibility.md)                                             | OmniRank audit, GEO files, IndexNow, off-site steps     |

## Walked through once

Filled in by the owner when a person has read the page against the admin app and the log groups and done its safe checks. Empty means not done. Nobody has claimed it yet.

| Runbook                                                                          | walked through (date, by whom) |
| -------------------------------------------------------------------------------- | ------------------------------ |
| [payment-stuck-or-disputed.md](payment-stuck-or-disputed.md)                     |                                |
| [eps-unavailable-manual-topup.md](eps-unavailable-manual-topup.md)               |                                |
| [ledger-check-failed.md](ledger-check-failed.md)                                 |                                |
| [refund.md](refund.md)                                                           |                                |
| [fx-rate-change.md](fx-rate-change.md)                                           |                                |
| [provisioning-failed-and-dead-letter.md](provisioning-failed-and-dead-letter.md) |                                |
| [capacity-full-and-quota.md](capacity-full-and-quota.md)                         |                                |
| [lifecycle-approval.md](lifecycle-approval.md)                                   |                                |
| [disk-detach-and-destroy.md](disk-detach-and-destroy.md)                         |                                |
| [unpaid-usage-switch.md](unpaid-usage-switch.md)                                 |                                |
| [pool-account-onboarding.md](pool-account-onboarding.md)                         |                                |
| [pool-account-single.md](pool-account-single.md)                                 |                                |
| [single-account-lean.md](single-account-lean.md)                                 |                                |
| [staging-on-demand.md](staging-on-demand.md)                                     |                                |
| [go-live.md](go-live.md)                                                         |                                |
| [domain-registration-problem.md](domain-registration-problem.md)                 |                                |
| [abuse-notice-and-suspension.md](abuse-notice-and-suspension.md)                 |                                |
| [kyc-review.md](kyc-review.md)                                                   |                                |
| [customer-mfa-reset.md](customer-mfa-reset.md)                                   |                                |
| [bucket-access-key-orphan.md](bucket-access-key-orphan.md)                       |                                |
| [secret-rotation.md](secret-rotation.md)                                         |                                |
| [sms-gateway.md](sms-gateway.md)                                                 |                                |
| [incident.md](incident.md)                                                       |                                |
| [support-requests.md](support-requests.md)                                       |                                |
| [restore-drill.md](restore-drill.md)                                             |                                |
| [ai-visibility.md](ai-visibility.md)                                             |                                |

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
