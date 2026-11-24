# Payment stuck, in review or disputed

Section M: "payment stuck or disputed". Rules: R6 (credit only after server-to-server verification of the same transaction id and amount), R5 (a correction is a reversing transaction), R10 (reason, IP, target stored).

## Trigger

- A payment in `initiated` or `redirected` for more than 30 minutes (checked twice a day), or any payment in `review`.
- Log line `payment_review` (severity `alert`, written by `functions/payments-sweeper/alert.ts`) or `payments_sweep_failed`.
- A customer says "I paid but my wallet did not change".

## Who

Finance admin (role `finance`). DevOps for `payments_sweep_failed`.

## Safe checks (read only)

1. Admin app, `/payments`: search by the transaction id. Read the state and the verify payload. Do not paste the payload into a chat or a ticket (R14).
2. States: `initiated` or `redirected` = the sweeper still verifies every 5 minutes for 24 hours, then marks `expired`. `review` = EPS reports success but the amount check failed, or the verify answer was odd. A `review` payment is never credited and never expired by itself.
3. Compare the amount EPS returns with the stored payment. EPS amounts are always BDT; the platform compares integers in paisa (`packages/eps/amount.ts`).
4. In `/wallets/[customerId]` check that no `topup:<payment id>` ledger transaction exists yet (a payment credits once).

## Steps

1. Pending over 30 minutes: run `reverifyPayment` on `/payments` (admin action, needs a reason). It calls the same server-to-server verify as the sweeper (`packages/eps/recheck.ts`).
2. Verify says success and the amount equals the stored payment: the wallet is credited once by the ledger key `topup:<payment id>`. Tell the customer.
3. `review`: do not credit by hand. Read the reason in the `discrepancies` row (kind `payment`) on `/reconciliation`. If EPS confirms a different amount in its own dashboard, ask the owner (Needs decision: the amount rule is R6). After the decision, either `resolveDiscrepancy` with the reason, or a manual top-up under [eps-unavailable-manual-topup.md](eps-unavailable-manual-topup.md).
4. Dispute (customer says money left the bank, EPS says failed): ask for the bank or wallet receipt, compare the EPS transaction id in the EPS dashboard (log in as a person; never share the credentials), and only then follow step 3.

## Rollback

A credit posted by mistake is reversed by a reversing transaction through `createAdjustment` (second admin above the limit). Never edit or delete a ledger row (R5).

## Log

JOURNEY or the ticket: payment id (not the customer's phone or email), the state before and after, the action, the admin and the reason. The audit row is written by the admin action itself.

## Must not

Credit from a status in a URL; credit without a matching amount; pass an amount through `Number()`; print the verify payload or EPS credentials.

Related: [ledger-check-failed.md](ledger-check-failed.md), [refund.md](refund.md).

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
