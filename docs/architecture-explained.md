# How PanelPay works on AWS (architecture explained)

This page explains, in plain language, how an AWS Lightsail reseller platform can be built safely: which AWS
accounts it uses, how a purchase becomes a server, how money is kept correct, and how customers are kept apart.
It is also a good tour of real-world AWS patterns: STS AssumeRole across accounts, SQS FIFO, Lambda in a VPC,
RDS Proxy, Cognito, CloudFront with WAF, Route 53, and infrastructure as code with SST.

The exact rules and tables are in the specification: [docs/spec/03-architecture.md](spec/03-architecture.md),
[10-provisioning.md](spec/10-provisioning.md) and [11-lifecycle-engine.md](spec/11-lifecycle-engine.md). Numbers
such as AWS quotas were checked in November 2026 and can change: always verify them in the AWS documentation.

## 1. The big idea

The customer never touches AWS. The customer uses a panel. The panel never touches AWS either. It only writes a
row in a database that says "please do this", and background workers do the AWS work with narrow permissions.

```
Customer ─▶ CloudFront + WAF ─▶ customer panel (Next.js)  ─┐
Admin    ─▶ CloudFront + WAF ─▶ admin panel (Next.js)     ─┤ write an "operation" row, enqueue it
                                                            ▼
                       PostgreSQL (private, via RDS Proxy) ◀─ workers (AWS Lambda)
                                                            │
                                                            ▼
                               AWS accounts that hold the customer resources
                               (reached only by STS AssumeRole)
```

Why this shape?

- **A web server that can create servers is a high-value target.** If the panel is compromised, the attacker
  should find no AWS keys and no permission to create resources. In this design the web tier has no IAM
  permission to assume the provisioning roles (rule R1).
- **Work that talks to AWS can fail and be retried.** A queue plus a database row gives you retries, a visible
  status and an audit trail.

## 2. A multi-account layout

Instead of one big AWS account, the platform uses several, each with one purpose:

| Account                       | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Management (the organization) | AWS Organizations, service control policies, billing. No workloads.                |
| Platform (control plane)      | The panels, workers, database, queues. Reached by CI and named admins only.        |
| Platform staging              | The same stack for testing, with its own database.                                 |
| One or more **pool** accounts | Where the customers' Lightsail resources live. Lightsail only, enforced by an SCP. |
| DNS account                   | Route 53 hosted zones and domain registrations. Route 53 only.                     |

Why **pool accounts**? Some Lightsail limits cannot be raised, for example the number of managed databases per
Region, load balancers per Region, buckets and CDN distributions per account. The only way to grow past them is
to add accounts. So "add a pool account" is a **configuration change, not a code change**, and a customer is
assigned a home pool account per Region on first purchase and stays there (load balancers, disks, static IPs and
private database access only work inside one account and Region).

## 3. Cross-account access without long-lived keys

The workers run in the control-plane account. To act in a pool account they call **STS AssumeRole** into a role
that exists in that pool account. The role is narrow: one for provisioning, one read-only role for live state, one
for secrets such as a Windows password. There are no access keys stored anywhere (rule R3). CI deploys with
GitHub **OIDC**, again without stored keys.

This is the standard, safe way to build a multi-account platform on AWS, and it is worth learning on its own.

## 4. From a click to a running server

1. The customer chooses a plan and presses **Buy**.
2. The panel opens **one database transaction**: lock the wallet row, re-check the customer, KYC status, the
   feature flag and limits, price the order, check the balance, reserve capacity, then insert the order, the
   subscription, the resource, an **operation** row, the ledger entries and the invoice. Commit.
3. After the commit, the operation id is sent to an **SQS FIFO** queue. (If that message is lost, a scheduler
   finds `queued` operations that were never sent and sends them: the database is the source of truth.)
4. The **provisioner** Lambda reads the queue, assumes the pool role, and runs the steps: create the instance,
   wait until it is running, allocate and attach a static IP, open the right ports. Each step is **idempotent**.
5. If the create cannot finish, it **fails closed** and the customer's money is refunded to the wallet.

The queue's `MessageGroupId` is the resource id, so steps for one resource never run in parallel. The
deduplication id includes a counter, because SQS silently drops a repeated deduplication id for five minutes.

## 5. Keeping customers apart on shared infrastructure

Lightsail filters traffic to the public IP only. Instances of different customers in the same pool account can
see each other on the private network. PanelPay closes that gap: the first-boot script of every Linux instance
installs `nftables` rules that **drop all traffic from the account's private network range**, then proves it by
starting a small "beacon" that the platform probes from a fixed address. A server is marked ready only after the
probe sees the proof marker. See [docs/spec/10-provisioning.md](spec/10-provisioning.md) section 10.4 and
[packages/aws/adapters/bootstrap.ts](../packages/aws/adapters/bootstrap.ts).

In the database, every customer table is read through a **tenant-scoped repository** that takes the customer id
from the verified session, and every endpoint has a cross-tenant test.

## 6. Money that adds up

- Amounts are **integer paisa** (`bigint`), never floating point. Rounding is half-up. Decimal maths is allowed
  in exactly one place (`packages/core/pricing`).
- The **ledger is double-entry and append-only.** Every transaction balances. The database role used by the app
  has no `UPDATE` or `DELETE` on ledger and audit tables. A mistake is fixed with a new reversing transaction.
- A wallet is credited only after **server-to-server verification** with the payment gateway of the same
  transaction id and amount. The browser redirect is untrusted input.
- A **reconciler** compares what you sold with what AWS actually bills, and writes discrepancy rows instead of
  "fixing" them by itself.

## 7. The lifecycle: renew, suspend, delete

A scheduler finds subscriptions at period end, renews them from the wallet if auto-renew is on and funded,
otherwise moves them through grace, suspension and deletion. Destructive steps need the right subscription
state and, where AWS supports it, a **final snapshot** first. Until a configured date they also need admin
approval (rule R13).

## 8. Running it cheaply

The control plane is serverless where possible (Lambda, SQS, EventBridge Scheduler) with one PostgreSQL
instance behind RDS Proxy. A lean single-account setup is described in
[docs/runbooks/single-account-lean.md](runbooks/single-account-lean.md); the author's estimate for a lean
production control plane was about 80 to 90 USD per month before customer resources. Treat that as a planning
number, not a promise.

## 9. Where to look in the code

| Topic                                                 | Where           |
| ----------------------------------------------------- | --------------- |
| Pricing, ledger, lifecycle                            | `packages/core` |
| Schema, migrations, tenant repositories               | `packages/db`   |
| Lightsail and Route 53 adapters, error classification | `packages/aws`  |
| Payment gateway client                                | `packages/eps`  |
| Workers                                               | `functions/`    |
| Infrastructure as code                                | `infra/` (SST)  |
| Proofs and gates                                      | `verify/`       |

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
