# Abuse notice and suspension

Section M: "abuse notice". Rule: suspend the resource at once when a violation is confirmed (Customer Agreement 2.5), within 24 hours of the notice at the latest; open a case, answer AWS. Rules R10, R13, R14.

## Trigger

- An AWS abuse notice arrives at the security alternate contact of a pool account (Section 15 requires one per pool account), or an AWS Trust and Safety case.
- GuardDuty finding in a pool account, or a customer report.

## Who

Operations lead (`ops`, `support` roles may work the case). The 24-hour clock starts when the notice arrives, not when someone reads it.

## Safe checks

1. Identify the resource from the notice: match the instance or resource name (`tc-<type>-<id>`) or the IP to `resources` on `/customers/[id]`. The pool account is looked up internally; the account id and the AWS text are never sent to the customer (U6).
2. Open the case first: `/abuse`, `openAbuseCase` with the source (AWS notice, customer report, internal) and notes.
3. Is the violation confirmed? Use the notice evidence and the resource state. If unclear, ask AWS or the customer within the 24 hours, but do not let the clock run out without a decision.

## Steps

1. Confirmed: `suspendResource` with a reason. The resource is suspended (public ports closed or stopped, data intact). Once an admin suspends it, a renewal or payment never resumes it; only an admin action does (Section 11).
2. Notify the customer with a neutral text (what was suspended, why in general terms, how to contact support). No AWS identifiers.
3. Answer AWS from the shared security mailbox with the action taken and the time. Keep the reply short and factual.
4. Customer fixes the issue: review, then resume through the admin action, add a note, `closeAbuseCase` with the outcome.
5. Repeated or severe abuse: ask the owner about ending the subscription. Destroy follows [lifecycle-approval.md](lifecycle-approval.md), never a console delete.

## Rollback

A wrong suspension is lifted by an admin resume with a reason. The customer is told.

## Log

Case id, resource id, notice time, suspension time, AWS case reference. No customer phone or email in the case notes (R14).

## Must not

Ignore a notice past 24 hours; delete the resource from the AWS console; assume a role in a pool account from a laptop; tell the customer an AWS account id or ARN.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
