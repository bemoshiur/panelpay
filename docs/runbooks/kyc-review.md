# KYC review

Section M: "KYC review"; routine: continuously in working hours, under 2 hours in launch week. Rules R10, R14 (no document numbers in logs), R16.

## Trigger

A customer sits in the KYC queue (`/customers` filter, "KYC waiting" on the admin Today page).

## Who

Operations lead and admins with the right role. Reviewing KYC documents is done by a person in the admin app only.

## Safe checks

1. `/customers/[id]`: the submission, the document images (shown through short-lived presigned URLs, never cached) and the profile. Read them in the browser; do not download them or send them by chat.
2. Names and numbers match the profile. A mismatch is a rejection reason, not a guess.
3. Risk tier: existing PanelPay customers and verified businesses may be `trusted`, set before the first purchase, because the home pool account is chosen once.

## Steps

1. Approve: `approveKyc`. Optionally `setRiskTier` (`trusted` only before the customer's first purchase). The customer is notified.
2. Reject: `rejectKyc` with a reason from the list; the customer can submit again.
3. Unclear: ask through `/support` (`replyByEmail`); do not approve to clear the queue.
4. If the KYC lookup service is down, nothing is approved automatically (R16). Wait or review by hand.

## Rollback

A wrong approval is corrected by setting the customer to the right status through the admin action with a reason; open orders are handled by [abuse-notice-and-suspension.md](abuse-notice-and-suspension.md) if fraud is suspected.

## Log

Customer id (not the document number, name or phone), decision, admin, reason. The audit row is written by the action.

## Must not

Copy document images or numbers into tickets, logs or chats; approve from a screenshot; grant `trusted` after the first purchase to change the home pool.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
