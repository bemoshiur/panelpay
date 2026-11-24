# Capacity warning and quota request

Section M: "capacity full"; the routine says capacity is read every morning and a quota request is filed at 70% use.

## Trigger

- Morning check of `/capacity` shows a quota at or above 70% use.
- Customers are offered the waitlist (`capacity_full`), or a log event `reconcile_capacity_over_limit` appears.

## Who

DevOps (`ops` role). The owner decides on a new pool account.

## Safe checks

1. `/capacity`: pool accounts, limit and use per Region and quota code (`instance_vcpu`, `static_ip`, `database`, `load_balancer`, `container_service`, `certificate_active`, `certificate_365d`, `disk_gb`, `bucket`, `distribution`).
2. Which quotas can be raised? Only instance vCPU and static IP (Section 3.1). Databases, load balancers, buckets, distributions, container services and certificates are fixed per account and Region; they grow only by adding a pool account.
3. A customer's resources stay in the home account of the Region; an order is never moved to another account silently (Section 10.2).
4. `used` is corrected hourly by the reconciler from live data, never below live count plus unfinished create reservations. A big gap between the screen and AWS is a reconciliation question: see [ledger-check-failed.md](ledger-check-failed.md).

## Steps

1. Raisable quota: file a Service Quotas request for the pool account and Region from the console as a person with the right role (not the management account). Note the case id in the ticket. Once granted, set the new number with `setCapacityLimit` on `/capacity`, with a reason.
2. Fixed quota near the limit: tell the owner. A new pool account follows [pool-account-onboarding.md](pool-account-onboarding.md); `addPoolAccount` is a configuration change, not a code change.
3. Customers on the waitlist: after capacity grows, `notifyWaitlist` on `/capacity`.
4. A reserve per quota is a configuration value (0 at launch). Raise it only with the owner's decision.

## Rollback

`setCapacityLimit` back to the previous number with a reason. Do not lower a limit below current use.

## Log

Quota code, Region, account alias (not the account id in public places), old and new limit, case id, admin.

## Must not

Touch the management account; set a limit higher than AWS granted; put an order in another pool account by hand.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
