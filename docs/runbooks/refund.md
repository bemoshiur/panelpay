# Refund

Section M: "refund". Rules: R5, R10, R13 (destructive actions need approval), and Section 9.2 item 6: EPS has no refund API in its current public version.

## Trigger

A customer asks for money back; support or finance agrees; or a failed order needs a decision beyond the automatic reversal.

## Who

Finance admin (`recordManualRefund`). A second admin approves anything that goes through an adjustment above the limit (BD: 10,000 BDT per wallet per 24 hours, see [eps-unavailable-manual-topup.md](eps-unavailable-manual-topup.md#the-limit-wpu-x5-owner-decision-2026-11-14)).

## Safe checks

1. Is it already refunded? Provisioning that fails permanently posts a reversing transaction by itself (`order-reversal:<order id>`). Look at `/wallets/[customerId]` first. Do not refund twice.
2. Domain registrations are not refunded (Section 12). A top-up cannot be refunded to the card or wallet by the platform: it is paid out by hand.
3. Check the customer, the amount and the original payment on `/payments`.

## Steps

1. Money that returns to the customer's own bank or wallet: pay it from the EPS dashboard (a person logs in; no credentials are shared), then on `/payments` run `recordManualRefund` with the payment, the BDT amount and the reason. The ledger posts debit `customer_wallet`, credit `refunds`.
2. Money that stays in the wallet as credit: use `createAdjustment` (credit) with the reason.
3. Tell the customer in the support thread (`replyByEmail` on `/support`).

## Rollback

A refund recorded by mistake is reversed by an adjustment with the reason "reverse refund <id>". The bank payout itself is outside the platform and is reversed only by finance with the bank.

## Log

Payment id, refund amount, reason, admin, EPS dashboard reference (not the account number).

## Must not

Refund more than the original payment; refund to a different person than the payer; post a refund without a reason.

Related: [payment-stuck-or-disputed.md](payment-stuck-or-disputed.md).

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
