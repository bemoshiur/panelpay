# Restore drill (WP9-T3)

Two drills. The first runs on a laptop and is automatic. The second is the real one on RDS and is a
manual VERIFY: nobody has done it yet, and until a person has ticked it in JOURNEY.md the backlog row
"point-in-time restore works" is not proven.

## 1. Logical restore on the local database (automatic)

`node scripts/restore-drill.mjs` (add `--allow-empty` for a freshly migrated database with no ledger rows).

- Needs `pg_dump`, `pg_restore`, `psql` on the PATH and the local database (`pnpm db:up && pnpm db:migrate`).
  Without them it prints `BLOCKED` and exits 2. A skipped drill is not a pass.
- Refuses `TC_STAGE=staging|production` and any `DATABASE_URL` that is not `localhost`, `127.0.0.1` or `::1`.
- Dumps the source, restores into `tc_restore_drill_<random>`, compares the row counts of 11 tables, runs the
  ledger check (balanced and two-sided transactions) and the wallet = ledger invariant (no mismatch, no negative
  wallet, no wallet account without a wallet) on the copy, then drops the copy.
- Exit 0 passed, 1 failed or refused, 2 BLOCKED.

## 2. Point-in-time restore on RDS (manual VERIFY, staging only, ask first)

Never in production. Never in the management account. No secret is pasted into a ticket or a chat.

Before

- [ ] The staging DB instance has automated backups on and a retention of at least 7 days (console: Maintenance and backups).
- [ ] Note the latest restorable time and the time of one known top-up in the staging ledger.
- [ ] Note, for that customer, the wallet balance and `select count(*) from ledger_entries`.

Restore

- [ ] RDS console, the staging instance, Actions, Restore to point in time. Pick a time AFTER the known top-up.
- [ ] Give the new instance another identifier (`...-drill-<date>`), the same VPC, the private subnet group and the
      same security group that only the Lambda functions use. Public access: No. TLS only (R2).
- [ ] Wait until the instance is `available`. Do not connect any application to it.

Check (from the migrator Lambda or a bastion that is already allowed, through TLS)

- [ ] The ledger check passes on the copy: no wallet whose cached balance differs from its entries, no negative
      wallet, no unbalanced or one-sided transaction (run the nightly check function against the copy, or paste the SQL of
      `INVARIANTS` in `scripts/lib/restore-drill.mjs`).
- [ ] The known top-up is there, and the balance and the entry count of that customer equal the noted values.
- [ ] `select max(created_at) from ledger_transactions` is not later than the restore time.
- [ ] The migration table lists the same migrations as the source.

After

- [ ] Delete the drill instance, with no final snapshot unless a person wants one. Confirm in the console that it is gone.
- [ ] Write in JOURNEY.md: date, who, the restore time, the minutes the restore took, the result of each check.
      If any check failed, write a "Needs decision" entry and stop.

Not covered here: restoring a deleted instance from its final snapshot, cross-region copies and the restore of the
KYC bucket (S3 versioning). Each needs its own drill.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
