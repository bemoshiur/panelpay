# Ledger check failed or reconciliation mismatch

Section M: "reconciliation mismatch". Rules: R5 (append-only; correct with a reversing transaction), R15, R16.

## Trigger

- The CloudWatch alarm `tc-<stage>-ledger-mismatch` (a `ledger_mismatch` or `ledger_check_failed` line), or `tc-<stage>-ledger-check-silent` (no `ledger_check_ok` line for 26 hours, so the check did not run). The check runs every day at 02:00 Asia/Dhaka (the function `LedgerCheck`, 20:00 UTC) and at the end of each hourly reconciler run; both alarms are in `infra/stacks/alarms.ts` and go to the SNS topic `tc-<stage>-alarms`.
- Log message `ledger_mismatch` or `ledger_check_failed` from `functions/reconciler/ledger-check.ts`. `ledger_check_ok` is the healthy line; its silence is also an alarm.
- Log events `reconcile_findings`, `reconcile_incomplete`, `reconcile_capacity_over_limit`, `reconcile_stale_operations` from the hourly inventory run (`functions/reconciler/reconcile.ts`).
- Open rows on the admin `/reconciliation` page (kinds `orphan`, `missing`, `cost`, `payment`).

## Who

Finance admin and DevOps each morning (reconciliation report). The reconciler never fixes a discrepancy by itself.

## Safe checks (read only)

1. `ledger_mismatch`: the log line holds counts, kinds and the first 10 findings (ids and amounts as text). A wallet whose cached `balance_minor` differs from the sum of its entries, a negative wallet, or an unbalanced or one-sided transaction.
2. `ledger_check_failed`: the job could not finish. Treat it as a failure (R16), not as "no differences". Read the `reason`, fix the cause (database reachability through RDS Proxy, role `worker_rw`), run again.
3. Local reproduction on a copy only: `node scripts/restore-drill.mjs` runs the same invariants on a local copy (see [restore-drill.md](restore-drill.md)). Never against staging or production data.
4. `/reconciliation`: read each row's kind. `orphan` = in AWS, not in `resources`; `missing` = in `resources`, not in AWS; `cost` = billing differs; `payment` = EPS and ledger disagree.

## Steps

1. Wallet mismatch or unbalanced transaction: stop. Write a "Needs decision" entry in JOURNEY.md with the wallet id and the amounts, and tell the owner. Do not "fix" the cache by hand.
2. After the owner decides, post a reversing or correcting transaction through `createAdjustment` (second admin above the limit).
3. `orphan`/`missing`: find the resource on `/operations` and `/customers/[id]`. An orphan stays untouched until an admin decides; a `missing` resource goes to [provisioning-failed-and-dead-letter.md](provisioning-failed-and-dead-letter.md) or [abuse-notice-and-suspension.md](abuse-notice-and-suspension.md) if AWS suspended it.
4. Close each row with `resolveDiscrepancy` and a reason.

## Rollback

A correction that was wrong is reversed with another transaction. The check runs again the next night; you can invoke the `reconciler` ledger check handler from the console (a person, staging first).

## Log

Date, finding kinds and counts, the decision, the correcting transaction ids. No phone, email or document numbers (R14).

## Must not

Update or delete rows of `ledger_transactions`, `ledger_entries` or `audit_log`; deploy to production to "fix" it; ignore a `ledger_check_failed`.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
