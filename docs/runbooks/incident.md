# Incident

Section M: "incident (severity levels, who is told, customer notice)". The plan names the topic but fixes no numbers; the levels below are a proposal for the owner to confirm (Needs decision recorded in JOURNEY.md).

## Trigger

An alarm to on-call (`tc-<stage>-provisioning-dlq-not-empty`, `tc-<stage>-scheduler-stopped`, `tc-<stage>-ledger-mismatch`, `tc-<stage>-ledger-check-silent`; 5xx and reconciliation have no alarm yet and are read in the logs), a customer report with real money or data at risk, a leaked secret, or an outage of EPS or AWS.

## Severity (proposed)

| Level | Meaning                                                                  | Told                                 | Customer notice                             |
| ----- | ------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------- |
| S1    | Money wrong (ledger mismatch, double credit), data exposure, secret leak | Owner and on-call at once            | Within 24 hours, in the customer's language |
| S2    | Panel or provisioning down, payments cannot complete                     | On-call at once, owner within 1 hour | Status message when it lasts over 1 hour    |
| S3    | One customer, one resource, a workaround exists                          | Operations lead in working hours     | Reply in the support thread                 |

## Steps

1. Name an incident lead (one person). Open a note with the time, the symptom and the level.
2. Stop the damage first with the smallest safe action: turn the product family flag off in `/catalog` (`setFeatureFlag`), suspend a resource ([abuse-notice-and-suspension.md](abuse-notice-and-suspension.md)), or pause nothing in AWS by hand.
3. Money involved: freeze nothing by editing data. Use [ledger-check-failed.md](ledger-check-failed.md) and [payment-stuck-or-disputed.md](payment-stuck-or-disputed.md).
4. Database damage: [restore-drill.md](restore-drill.md) describes the point-in-time restore checks. A production restore is the owner's decision.
5. Secret leak: [secret-rotation.md](secret-rotation.md), starting at once.
6. Customer notice: plain words, no AWS account id, ARN, pool name or raw AWS error (U6). Say what happened, what is affected, what we did, when the next update comes.
7. After: write a short review in JOURNEY.md (timeline, cause, what changed) within 3 working days.

## Rollback

Turn the flag back on only when the cause is fixed and checked on staging.

## Break-glass

The specification describes no break-glass procedure. Nobody may invent one during an incident: no shared admin account, no long-lived key, no access to production from a developer machine. If one is needed, record a Needs decision and ask the owner.

## Log

Times (UTC and local), who, level, actions, customer notice text. No secret, document number, full phone or email (R14).

## Must not

Deploy production by hand; touch the management account; edit or delete ledger or audit rows; paste logs with personal data into a chat.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
