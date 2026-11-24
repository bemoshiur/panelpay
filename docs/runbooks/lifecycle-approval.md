# Lifecycle approval

Section M: "lifecycle approval". Rule R13: destructive lifecycle actions need the right subscription state, a final snapshot where supported, and admin approval until 2026-12-01.

## Trigger

An operation in `needs_approval` on `/operations`: a destroy at the end of retention (period end + 48 hours), or another destructive action. The lifecycle job logs `lifecycle` and `lifecycle_run`.

## Who

Operations (`ops` role). The approver reads the evidence below; the audit row stores actor, reason, IP and target (R10).

## Safe checks (all before approving)

1. Subscription state is `retained`-bound: it was `grace` for 48 hours and the customer did not pay. Check `/customers/[id]` and the subscription.
2. The resource is not suspended by an admin for another reason (an abuse case): see [abuse-notice-and-suspension.md](abuse-notice-and-suspension.md).
3. The final snapshot exists and is `available` where the family supports one (instance, database, disk). Load balancer, container service, CDN and DNS keep their configuration in `resources.config` instead.
4. The wallet really cannot pay: no pending top-up (`/payments`) and no payment in `review`.
5. Today's date: before 2026-12-01 approval is required; after the owner removes that rule the steps stay the same.

## Steps

1. `approveOperation` with a reason, or `rejectOperation` to give the customer more time (the subscription state is then handled by the lifecycle job on its next run).
2. Watch the operation go `running` then `succeeded`; the state becomes `retained` and the customer is notified.
   A disk whose destroy stops in `needs_attention` with `conflict` is still attached to a running server: follow [disk-detach-and-destroy.md](disk-detach-and-destroy.md).
   A server with attached disks (WPU-Y4): its disks' `final_snapshot` and `destroy` are queued with it (payload `withServer`); approve them together with the server's, see [disk-detach-and-destroy.md](disk-detach-and-destroy.md).
3. 14 days later the job purges snapshots and the state becomes `ended`; this also needs the matching approval while the rule lasts.

## Unpaid usage, day 7 (WPU-Y3, WPU-Y10)

Applies only while the setting `lifecycle_unpaid_enabled` is on (see [unpaid-usage-switch.md](unpaid-usage-switch.md)).

### What you see

A usage charge (daily snapshot, static IP and so on) has been unpaid for 7 days. The job has already suspended the resource (from day 1) and moved the subscription to `retained`. In `/operations` you see, for that resource, a `final_snapshot` operation and a `destroy` operation in `needs_approval` (until 2026-12-01; after that date the destroy runs alone, but the guard still needs state `retained` and the final snapshot). The customer got the "deletion requested" message; nothing is deleted before you approve.

### Before you approve the destroy

1. The customer has really not paid: `/customers/[id]`, wallet balance, `/payments` (no pending top-up, nothing in `review`), and the resource has no `unpaidSince` cleared. If the customer paid, reject.
2. The final snapshot exists and is `available` (the `final_snapshot` operation is `succeeded`). If it is missing or failed, do not approve (R13, R16).
3. The resource is not under an abuse suspension; see [abuse-notice-and-suspension.md](abuse-notice-and-suspension.md). An admin suspension outranks every automatic resume.
4. Today's date against the R13 date 2026-12-01: before it, approval is mandatory.

### Approve or reject

- Approve with `approveOperation` and a written reason. Reject with `rejectOperation` to give more time; a rejected destroy stays rejected.
- If the customer pays while the destroy waits, the job restores the subscription and cancels a destroy that has not started. If one is still `needs_approval` after a payment, reject it.

### Held final snapshot

After a late payment the job turns the former final snapshot into an ordinary backup (the customer is told once, DRAFT message `unpaid_snapshot_released`) and bills it daily until the customer deletes it. If a destroy had started, was approved or the state is unclear, the job does NOT release it: log `final_held`, report field `finalHeld`. That snapshot stays `final` and the customer cannot delete it. An admin decides: check that the resource is live and the destroy did not run, then delete the backup with a `delete_backup` operation and approval (until 2026-12-01), reason written. Never delete a final snapshot of a resource that is still `retained`.

## Rollback

Destroy cannot be undone. If a customer pays during retention, restore from the final snapshot (new period starts at restore time). That is why every check above comes first.

## Log

Operation id, resource id, state, snapshot check, decision, admin.

## Must not

Approve without a final snapshot where one is supported; approve for a customer who paid in the last hour; let a renewal resume an admin-suspended resource.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
