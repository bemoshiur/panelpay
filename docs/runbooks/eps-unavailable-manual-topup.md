# EPS unavailable: manual top-up

Section M: "EPS unavailable (manual top-up by a `finance` admin with a bank or wallet receipt)". Rules: R5, R10, R13 not involved; wallet changes are real money.

## Trigger

- EPS GetToken or InitializeEPS fails for many customers (payments marked `failed` at once), or EPS is announced as down.
- A customer holds a bank or wallet receipt for money sent to PanelPay outside the gateway.

## Who

A finance admin or a superadmin creates the adjustment; a second finance or superadmin approves above the limit (the requester can never approve their own).

### The limit (WPU-X5, owner decision 2026-11-14)

- Setting `wallet.adjustment_limit_minor`, scope `market`, market BD: **1,000,000 paisa = 10,000 BDT per wallet per 24 hours**. Credits and debits that posted without a second admin in the last 24 hours count together with the new request (no splitting). Up to the limit one finance admin's adjustment posts at once; above it the adjustment waits as `pending` for a second finance or superadmin.
- Set by migration 0029 (and by the launch seed for a market created after the migrations), each with one `audit_log` row (actor `system`, action `setting.set`, target `setting` / `BD:wallet.adjustment_limit_minor`). Neither ever overwrites an existing value.
- The `/wallets/[customerId]` page shows the limit in force. A missing or malformed value counts as 0: every adjustment then waits for a second admin (R16).
- No admin screen writes this setting yet. Until one exists, the limit changes **only by a reviewed migration** (a new forward-only migration, with its own audit row and reason), never by editing the row by hand. Follow-up: a superadmin screen for the limit, audited with actor, reason, IP and target (R10).
- `finance` and `superadmin` create adjustments (credit and debit; superadmin by owner decision 2026-11-14). Within the limit the adjustment completes with the one admin; above it a second finance or superadmin approves or rejects. Nobody approves or rejects their own. `support` and `ops` cannot create.

## Safe checks

1. Is it really EPS? Look for `payments_sweep_failed` in the `payments-sweeper` log group and failed payments on `/payments`. Retry later before posting by hand: a pending payment may still verify.
2. The receipt shows our bank or wallet account, the amount and a reference. Check that the reference was not used before: search `/audit` and `/wallets/[customerId]` for it.
3. Check the customer on `/customers/[id]` (status, KYC).

## Steps

1. `/wallets/[customerId]`, `createAdjustment`: a credit, the BDT amount from the receipt, and as reason "manual top-up, receipt <reference>" (reference only, no account numbers).
2. Below the limit it posts at once (debit `adjustments`, credit `customer_wallet`). Above the limit it waits as `pending` until a second admin runs `approveAdjustment` or `rejectAdjustment`.
3. Tell the customer. Keep the receipt where the finance team keeps its bank records, not in the repository.
4. When EPS is back, check that a late EPS success for the same money did not also credit the wallet: look for a `topup:<payment id>` transaction next to the adjustment and reverse one of them (see [payment-stuck-or-disputed.md](payment-stuck-or-disputed.md)).

## Rollback

`createAdjustment` as a debit with the reason "reverse manual top-up <id>". Never delete the first posting (R5).

## Log

Adjustment id, amount, receipt reference, requester, approver. Never the full phone or email of the customer (R14).

## Must not

Credit a wallet from a screenshot nobody checked; credit without a reason; approve your own adjustment; touch the ledger tables directly.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
