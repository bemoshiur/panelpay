# TryAWS.now Pro: single-EC2 edition, sold on AWS Marketplace

Status: plan, 23 Nov 2026. Owner decisions are in "Decisions". Nothing here changes the open-source edition.

## Decisions (owner, 23 Nov 2026)

- Channel: AWS Marketplace, **AMI product with contract pricing**.
- What is sold: a **Pro edition** (single-EC2 installer, WHMCS bridge, white-label, updates and support).
  The open-source core stays Apache-2.0.
- Price: **USD 199**. AWS Marketplace has no perpetual price for AMI products (public contracts are 1, 12, 24
  or 36 months; private offers up to 60). The listing therefore sells a **36-month contract at USD 199**, and the
  EULA grants a perpetual right to keep running the version installed during the contract. Only updates and
  support stop when the contract ends. The licence check is ours, so it honours that rule.
- Target buyers: WHMCS customers and hosting resellers who want to sell AWS Lightsail under their brand.
- No extra AWS bill for TiCON beyond cents of build time. Each step that starts paid resources asks first.

## What changes for one EC2

The open-source edition runs on Lambda, SQS, EventBridge Scheduler, RDS behind RDS Proxy and CloudFront.
The Pro edition runs everything on **one EC2 instance in the buyer's own account**, and keeps the cheap
managed pieces that would be risky to rewrite.

| Piece today                                                            | Pro on one EC2                                                                                                                                                    | Why                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Next.js web and admin on Lambda + CloudFront                           | Next.js standalone servers (systemd), Caddy for TLS                                                                                                               | Compute on the box                                                      |
| RDS PostgreSQL + RDS Proxy                                             | PostgreSQL on the box, local socket, TLS not needed off-box                                                                                                       | R2 is satisfied: the database is private to the box                     |
| provisioner on SQS                                                     | a long-running `tc-worker` process; the existing sweep already re-sends rows whose `enqueue_seq` is 0, so the worker can poll the operation table (no SQS needed) | `OperationQueue` is already a port; SQS becomes optional                |
| 6 cron Lambdas (EventBridge Scheduler)                                 | systemd timers that run the same handler entry points                                                                                                             | Same code, different trigger                                            |
| 4 invoke Lambdas (reader, access-details, kyc-check, invoice-renderer) | a local worker HTTP endpoint on 127.0.0.1 only, called with the same payloads                                                                                     | Web still never imports packages/aws (R1): it calls the worker, not AWS |
| migrator (deploy)                                                      | runs in the installer and on every update                                                                                                                         |                                                                         |
| Cognito (customers and admins)                                         | **kept**, in the buyer's account (free tier covers small resellers)                                                                                               | No new auth code (R17)                                                  |
| cognito-messages trigger                                               | kept as one small Lambda, or Cognito default messages                                                                                                             | Decide in PRO-4                                                         |
| Pool accounts via STS AssumeRole                                       | unchanged; the instance role assumes into the buyer's pool accounts                                                                                               | R3 kept: instance role, no keys                                         |

## Tasks (one PR each)

1. **PRO-1 runtime port.** A `functions/runtime-ec2` entry that maps each function's trigger (queue, cron,
   invoke) to a local runner, plus the polling `OperationQueue` adapter. Tests first for the queue adapter.
2. **PRO-2 invoke over loopback.** Web and admin call the four invoke functions through a loopback client
   behind the existing ports. Cross-tenant tests stay green.
3. **PRO-3 box layout.** systemd units, Caddy, local PostgreSQL, env files, log rotation, backups to the
   buyer's S3. Mirrors the BlessBit box layout.
4. **PRO-4 installer and first-run wizard.** One command (or AMI user data) that installs, migrates, asks for
   domain, Cognito pool, pool accounts and payment gateway, then hands over to the admin app.
5. **PRO-5 Marketplace licence check.** AWS License Manager `CheckoutLicense` for the product SKU at start and
   daily; an expired contract keeps the installed version running and only blocks updates (EULA rule above).
6. **PRO-6 WHMCS bridge.** A WHMCS server module (PHP): single sign-on into the panel and wallet balance sync.
   Lives in its own folder, Pro only.
7. **PRO-7 AMI build.** Packer template, hardened Ubuntu, no secrets in the image, AWS Marketplace AMI scan.
   Asks before starting the build instance.
8. **PRO-8 Listing.** AMI product in Partner Central (seller account 542374379351): 36-month contract USD 199,
   EULA, usage instructions, support contact.
9. **PRO-9 Outreach.** WHMCS reseller lead list and Gmail drafts (sign-off "S M Moshiur Rahman", signature,
   clickable cal.com link), sent by the owner.

## Open questions

- Payment gateways for resellers outside Bangladesh (EPS is BDT only). Stripe adapter in Pro, or reseller's own?
- Which Lightsail families are on by default in Pro (R12: all off until the buyer enables them).
- Instance size to recommend (start: t3.small; measure in PRO-3).
