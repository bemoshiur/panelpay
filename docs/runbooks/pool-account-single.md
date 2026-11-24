# Single pool account launch (WPU-G1)

Rules: R3 (no long-lived keys, STS AssumeRole only), R7 (idempotent), R10 (admin actions are audited), R16 (fail closed), the management account is never touched. This page is for the stage where the whole platform runs on ONE AWS pool account. The general procedure for any account is [pool-account-onboarding.md](pool-account-onboarding.md); the gaps behind this page are P1, P2, P5 and P9 of [lightsail-parity-gap.md](../analysis/lightsail-parity-gap.md).

## Trigger

The owner has one pool account (roles `TcProvisioner`, `TcReader`, `TcAccessDetails` exist, steps 1 to 6 of the onboarding page are done) and no pool account is registered in the database yet, or `/capacity` of the admin app shows missing cells.

## Who

Staging and production with ONE pool account: whoever runs the go-live (owner decision 2026-11-14: a Claude Code session may run it), through the migrator, with no database URL at all. Any other case (several pool accounts, a local database, a fix that the migrator path refuses): DevOps with the table-owner database URL of the stage, through the CLI. A Claude Code session never sees that URL.

## The migrator path (WPU-X4, the way for the one-account stage)

The database is private (R2: Lambda in the VPC through RDS Proxy only) and has no bastion, so the CLI below cannot reach it on staging or production. The migrator function runs inside the VPC as the master user at every deploy, and after the first-admin step it registers the pool account with the same idempotent code as the CLI (`seedPoolAccount` of `packages/db/seed-pool.ts`).

1. Do steps 1 to 6 of the onboarding page and the role stacks of this account (section above). Record the real quotas (step 1 below).
2. Read the ExternalId of the stack made from `infra/org/pool-roles.yaml`: `aws cloudformation describe-stacks --stack-name <pool roles stack name> --query "Stacks[0].Parameters[?ParameterKey=='ExternalId'].ParameterValue" --output text`. It is a plain value, not a secret (6.3), and like `TC_DNS_EXTERNAL_ID` it shows in the `sst diff` job summary of the deploy workflows (function environment). Keep it out of chat and tickets all the same.
3. Set the GitHub environment variable (not a secret) of the stage: `gh variable set TC_POOL_EXTERNAL_ID --env staging` (or `--env production`), value on standard input. `TC_POOL_ACCOUNT_IDS` of the same environment must hold exactly this one 12-digit id. `deploy-staging.yml` and `deploy-production.yml` pass the variable to `sst`; `infra/stacks/workers.ts` gives it to the migrator function only.
4. Redeploy the stage (`deploy-staging.yml`, or the next `v*` tag for production; a production deploy that carries the variable is the confirmation that the CLI asks for with `--confirm-production`).
5. Read the log line `migrator_pool_account` of the migrator function (CloudWatch). It holds the decision and at most the last 4 digits of the account id (`accountSuffix`), never the ExternalId (R14):
   - `inserted` (`cellsCreated` 26): the account `pool-1`, tier `new`, status `active`, with the 26 capacity cells at the seed's placeholder limits.
   - `skipped: exists`: a later deploy; nothing changed, limits and `used` stay (R7). Missing cells are filled in (`cellsCreated` above 0).
   - `skipped: not configured`: `TC_POOL_EXTERNAL_ID` is empty. Nothing written; the deploy goes on.
   - `skipped: several pool accounts`: `TC_POOL_ACCOUNT_IDS` holds more than one id. Multi-account onboarding stays manual: use the CLI and the admin app.
   - `skipped: malformed`: the id is not 12 digits or the ExternalId does not match `^[A-Za-z0-9+=,.@:/_-]{16,1224}$` (the `AllowedPattern` of `pool-roles.yaml`). Nothing written; correct the variable and redeploy.
   - `skipped: differs`: a row for this account exists with another name, tier or ExternalId, or the alias `pool-1` belongs to another account. Nothing was written and the deploy goes on: a stale, non-secret variable never blocks a later deploy (hotfixes included). Correct the variable, or empty it when the account was registered another way (for example by the CLI with another alias). The CLI stays strict: it refuses the same case with an error.
   - Any other error of the step (the database) fails the deploy with `migrator: could not register the pool account` and the log line `migrator_failed` with step `pool_account` (R16); the seed's transaction is rolled back.

   When the step wrote something (`inserted`, or `skipped: exists` with `cellsCreated` above 0), it also wrote one `audit_log` row in the same transaction: actor `system`, action `pool_account.bootstrap`, target the `pool_accounts` row, reason "pool account bootstrap" with before and after (alias, tier, status, last 4 digits of the id, counts; never the ExternalId). The CLI writes no audit row; its operator fills in the Log section below.

6. Continue with step 5 below: set the real limits on `/capacity` (audited, R10).

The variable may stay set: every later deploy logs `skipped: exists`. After an audited change of the account's tier or ExternalId every deploy logs `skipped: differs` and changes nothing; empty the variable (or set the new ExternalId) to make the line say `skipped: exists` again.

## Roles when the account also holds DNS

If this one account is also the DNS account ([single-account-lean.md](single-account-lean.md)), deploy `pool-roles.yaml` first and `dns-account.yaml` second with `CreateBillingReader=false` (`TcBillingReader` exists once, owned by the pool stack). `ControlPlaneStage` is `staging` or `production` in both and must match the stage that runs the functions. No account id is written down.

## Steps

The CLI path (`pnpm seed:pool-account`) is steps 2 to 4; it needs a direct table-owner connection, so it serves a local database and the cases the migrator path leaves out. Steps 1 and 5 to 7 apply to both paths.

1. Record the real Lightsail quotas of the account in the three launch Regions (`ap-southeast-1`, `ap-south-1`, `us-east-1`). A limit above the real quota sells what AWS then refuses (gap P3).
2. Dry run the arguments on the stage: `pnpm seed:pool-account -- --stage staging --aws-account-id <12 digits> --external-id <plain ExternalId> --name <alias> --limits '{"instance_vcpu": <real>, "static_ip": <real>}'`. The command checks every field before it opens a connection. Production needs `--confirm-production`, and only the owner decides that.
3. The command writes one `pool_accounts` row (status `active`, tier `new` unless `--tier` says otherwise) and one `pool_capacity` row per cell: the eight Regional quota codes (`instance_vcpu`, `static_ip`, `database`, `load_balancer`, `container_service`, `certificate_active`, `certificate_365d`, `disk_gb`) in each of the three Regions, and `bucket` and `distribution` once as Region `global`. The `us-east-1` certificate rows also serve distributions. That is 26 rows. Each limit starts as a deliberately low placeholder or your `--limits` value, and `used` starts at 0.
4. Run the same command again: it reports the rows as already there and changes nothing. It never overwrites a limit or a `used` value, and it refuses (writes nothing) when the account id exists with another name, tier or ExternalId, or the name belongs to another account.
5. Open `/capacity` of the admin app and set each limit to the recorded real quota with `setCapacityLimit` (audited, R10). Set the reserve per quota if wanted.
6. Check the catalog: migration 0009 adds the `disk` anchor row for `us-east-1` (P9), so disks can be ordered there; the feature flag `disk` stays off in production (R12). VERIFY the block storage price for `us-east-1` before production.
7. Give the stack its two required settings. `TC_VPC_CIDR` and `TC_PROBE_SOURCES` are environment variables of the deploy shell or of the CI environment, like the other names in `JOURNEY.md`; `readStageConfig` (`infra/lib/stage.ts`) refuses a staging or production deploy without them and says which one is missing, and `infra/stacks/workers.ts` copies both into the provisioner function only. A personal stage may leave them out, and then every Linux create stops before the static IP (R16).
   - `TC_VPC_CIDR`: the verified network of the pool account and Region (the Lightsail VPC), a private (RFC 1918) CIDR between `/16` and `/28`. VERIFY where the Lightsail console and API show it (the VPC peering page of the Region) before the first value is written; DevOps records it per account.
   - `TC_PROBE_SOURCES`: where DevOps gets the NAT addresses. On a lean stage (`TC_STAGE_SIZE=lean`, WPU-Z10) there is ONE NAT instance with ONE Elastic IP for the whole VPC, so the value is one `/32`: the stack output `natAddress` ([single-account-lean.md](single-account-lean.md), step 3); a removed and redeployed staging gets a new one each session ([staging-on-demand.md](staging-on-demand.md)). On a full stage the control plane VPC has one managed NAT gateway per Availability Zone (two), and each has an Elastic IP. The probe connects from those addresses. In the console of the control plane account (`tc-platform` for production, `tc-platform-stg` for staging) open VPC, NAT gateways, and read the "Primary public IPv4 address" of each gateway of the stage's VPC (CLI form for DevOps: `aws ec2 describe-nat-gateways --filter Name=vpc-id,Values=<vpc id>`, field `NatGatewayAddresses[].PublicIp`). The NAT addresses exist only after the first deploy of the network stack, so the first deploy of a stage uses a documentation address (for example `198.51.100.1/32`, which nobody can connect from) and the stack is redeployed with the real addresses; until then no server can be probed and no Linux create finishes. Write each as `/32` and join with commas, for example `198.51.100.10/32,198.51.100.11/32` (documentation addresses). Rules, checked at synth: at most 10 entries, each a public IPv4 `/16` or narrower, never `0.0.0.0/0`, never a private, shared, loopback or link-local range.
     The bootstrap beacon port of a new server is opened to those addresses only, during create, and closed again at the end of create. Without `TC_PROBE_SOURCES` every Linux create stops before the static IP and nothing is opened (R16). The web function needs `PROVISIONING_QUEUE_URL` (the infra stack sets it); without it operations start at the next scheduler sweep instead of within seconds.

## The tier rule with one account

A customer has a risk tier (`new`, `trusted`) and a pool account has a tier; normally a customer is only placed in an account of its own tier. When exactly one pool account is active, that account serves every tier: `decide` (capacity) and the home assignment accept it. With none, or with two or more active accounts, the exact tier match applies again and an order that fits nowhere is refused as `not_configured` (R16). A disabled second account does not count. A home never changes: customers who were placed while only one account existed stay in it after a second account is added; the second account serves new homes by tier.

## Safe checks

`/capacity` shows the account with the right limits and zero use. A test order on staging in each Region reaches `active` only in `tc-pool-dev`. `select count(*) from pool_capacity` is 26 for the account.

## Rollback

Set all limits of the account to 0 with `setCapacityLimit` so no home is assigned. Do not delete rows of an account that hosts customers.

## Log

Account alias (not the id in shared notes), stage, date, who, the real quotas, the case ids of quota requests.

## Must not

Run this against production without the owner; put an AWS account id, ExternalId or any key in a ticket, chat or the repository; create IAM users or access keys; raise a limit above the real AWS quota; use the management account.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
