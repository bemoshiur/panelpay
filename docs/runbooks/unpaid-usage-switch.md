# Unpaid usage switch

Setting `lifecycle_unpaid_enabled` (market BD, value `true` or `false`). Off by default (R12). It turns on the rule: retry every unpaid usage charge each day, suspend at 1 day, retain and request deletion at 7 days, restore on payment, and the customer messages (DRAFT wording).

## Trigger

The owner decides to start (or stop) the unpaid usage rule for the launch market.

## Before turning it on (all of them)

1. The owner approved the wording of `unpaid_warning`, `unpaid_suspended`, `unpaid_deletion` and `unpaid_snapshot_released` (packages/notify/templates/messages.ts, bn and en).
2. The PostgreSQL tests ran on a real database and pass, above all `packages/core/metering/unpaid.db.test.ts`, `functions/scheduler/handler.test.ts` and the lifecycle db tests.
3. The money review of the job is done and its findings are fixed (WPU-Y3, Y3b, Y3c, Y10 in JOURNEY.md).
4. A dry run on staging: one test customer with an unpaid charge, walk day 0, day 1, day 7, a payment, and a late payment. Check the report fields below, the messages and the `/operations` queue. Ask before any deploy to staging.

## Turn on

Set the row in `settings` for market BD to `true`. The change is a reviewed, audited step with a reason; if there is no admin screen for it, use the agreed ops change (not a hand-run query on production). Write the time and the reason in the incident log.

## Turn off

Set it to `false`. The next run does nothing (`enabled: false` in the report). Suspensions, retentions and queued operations already made stay as they are; review `/operations` for destroys in `needs_approval` and reject those you do not want. Metering then falls back to its short look-back window, so unpaid periods older than it are no longer retried.

## What to watch

- The run: daily, in the first minutes of 07:00 Dhaka (not every minute). Log event `unpaid_run`. A missing line on a day means the run did not happen.
- Report fields: `enabled`, `examined`, `charged`, `paid`, `resumed`, `suspended`, `retained`, `noticed`, `stillUnpaid`, `capped` (should fall to 0 on the next run), `skipped`, `suspendsCancelled`, `finalReleased`, `finalHeld` (every one needs an admin, see [lifecycle-approval.md](lifecycle-approval.md)), `blocked` (no price or unreadable mark: look at it), `failed` (must be 0; the scheduler job fails otherwise).
- Log events `unpaid` with action `final_held`.
- The `/operations` queue for destroys in `needs_approval` and for `needs_attention` with reason `admin_suspended` (a resume refused because an admin suspension is in force; only the admin restore lifts it).
- Cost: the queries per run are bounded (at most 240 periods per resource and run). If the run time grows, stop and ask.

## Must not

Turn it on before every item above is done; turn it on in production without the owner's written go; delete a final snapshot or approve a destroy only because the job is on.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
