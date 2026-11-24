# One account and the lean stage (WPU-B8)

Rules: R2 (database private, RDS Proxy, TLS), R3 (no long-lived keys, STS AssumeRole only), R12 (feature flags), R13 (final snapshot), R16 (fail closed), the management account is never touched. This page is for the stage where the control plane, the one pool account and the DNS role all live in ONE AWS account, sized as small as the rules allow. Staging runs only during test sessions and is removed after each one ([staging-on-demand.md](staging-on-demand.md)); production runs lean around the clock (owner decision 2026-11-13, about 80 to 90 USD a month). For the pool account registration itself see [pool-account-single.md](pool-account-single.md); the general procedure for any further account is [pool-account-onboarding.md](pool-account-onboarding.md).

## The one-account ruling

The owner decided (`JOURNEY.md`, 2026-11-13) that one AWS account holds everything:

- It is a MEMBER account of the organisation, never the management account. Deploying there does not touch the management account.
- The control plane, the single pool account and the DNS role are the same account. `TC_ACCOUNT_ID`, `TC_POOL_ACCOUNT_IDS` and `TC_DNS_ACCOUNT_ID` carry the same id. The id has 12 digits and exists only in the GitHub variable `TC_ACCOUNT_ID` (and the matching names above); it is never written in the repository, a ticket or a chat.
- The cross-account roles `TcProvisioner`, `TcReader`, `TcAccessDetails` and the DNS roles are deployed in that same account and still assumed by STS with their ExternalIds (R3). No IAM user and no access key is added because the account is shared.
- Cost if the ruling is wrong: weaker blast-radius isolation. A mistake in a platform role or policy can reach customer Lightsail resources in the same account, and a customer-side incident shares quotas and limits with the platform. The three-account design (control plane, pool, DNS) stays the target when revenue allows; the way back is below.

## Trigger

The owner wants to run the platform on one account as cheaply as the rules allow, or the budget alarm of this stage sent a message (see "At a budget alarm").

## Who

The owner or DevOps with the deploy rights of the stage. A Claude Code session never deploys this stage and never sees the values of the variables, the account id or any secret.

## Steps

1. Decide the size. The deploy shell or the CI environment sets `TC_STAGE_SIZE` to `lean` or `full`. Unset means `full`. Any other value refuses the deploy before anything is created (R16). Production changes size only when the owner sets it explicitly.
2. Set the three account variables to the same 12 digit id, in the GitHub variables and the CI environment only: `TC_ACCOUNT_ID`, `TC_POOL_ACCOUNT_IDS`, `TC_DNS_ACCOUNT_ID`. Deploy the roles of steps 1 to 6 of the onboarding page into this account, then follow [pool-account-single.md](pool-account-single.md) to register the account and set the real Lightsail quotas.
3. Set `TC_VPC_CIDR` as in [pool-account-single.md](pool-account-single.md). Set `TC_PROBE_SOURCES` to the address of the single NAT instance (one `/32`). The address exists only after the first deploy of the network stack, so the first deploy uses a documentation address (for example `198.51.100.1/32`), and the stack is redeployed with the real address. Until then no server can be probed and no Linux create finishes. The address is the stack output `natAddress`, or in EC2, Elastic IPs, the address named `tc-<stage>-nat-ip` (its instance is tagged `sst:is-nat=true`). A removed and redeployed staging gets a new address each session ([staging-on-demand.md](staging-on-demand.md)).
   What SST really builds (VERIFY review 2026-11-13, docs/analysis/verify-review-2026-11-13.md, E rows `single-account-lean.md:26` and `:55`): `sst.aws.Vpc` with `nat: "ec2"` launches one t4g.nano fck-nat instance and one Elastic IP in EACH Availability Zone, so two of each with two zones. A lean stage therefore does not use SST's NAT: `infra/stacks/network.ts` (WPU-Z10) asks the Vpc for no NAT and builds ONE fck-nat t4g.nano (the image SST would choose) with ONE Elastic IP in the first zone, and points the private route tables of both zones at it. So there is exactly one address.
4. Add the alarm e-mail addresses to the stage settings. Each address receives a subscription message from Amazon SNS and the subscription stays pending until that person confirms it. An unconfirmed address gets no budget or alarm mail.
5. Deploy through the CI role after approval (never by hand, never a Claude Code session). The owner starts it.
6. What `lean` sets:
   - Database: `db.t4g.micro`, single zone, 20 GB storage, backups kept 7 days. RDS Proxy stays (R2). TLS only and KMS encryption stay. Deletion protection and the final snapshot stay on production; staging has neither and keeps backups 1 day, because it is removed after each test session and its test data is wiped (WPU-Z10, [staging-on-demand.md](staging-on-demand.md)).
   - Network: ONE t4g.nano NAT instance (fck-nat) with one Elastic IP for the whole VPC, instead of two NAT gateways (and instead of SST's one instance per zone). Two Availability Zones stay because the database subnet group needs two.
   - WAF: a minimal web ACL with the Common managed group, the rate rules for login, signup, verify, wallet and eps-return, and the admin IP allowlist. The other managed groups of `full` are not attached.
   - Logs: the log groups of the functions of `functions/` keep 7 days. On staging every function log group keeps 7 days (WPU-Z10: the Next.js, image optimizer, revalidation and Cognito trigger functions too); on production those keep SST's own defaults.
   - Budget: an AWS Budgets monthly cost budget with notifications on ACTUAL spend, sent to the alarm SNS topic. Staging: 50 USD, at 25, 40 and 50 USD. Production: 100 USD, at 50, 80 and 100 USD. It counts only the costs tagged `sst:app` = `tryaws-now` AND `sst:stage` = the stage, because the account also runs the owner's other projects; the two tags must be activated as cost allocation tags in the Billing console of the PAYER account, and until then the budget counts nothing ([staging-on-demand.md](staging-on-demand.md), "The budget e-mail").
7. After the deploy, confirm every e-mail subscription of the alarm topic, then run the safe checks.

## Role stacks in the one account

Both role templates go into the same account, in this order, with the DevOps admin role (never a StackSet, never a Claude Code session). The account id and ExternalId are typed at deploy time only.

1. `infra/org/pool-roles.yaml`: `ControlPlaneAccountId` (the same account), `ExternalId`, `ControlPlaneStage` (`staging` for a staging control plane, `production` otherwise). It creates `TcProvisioner`, `TcReader`, `TcAccessDetails`, `TcBillingReader` and `TcPoolPermissionsBoundary`.
2. `infra/org/dns-account.yaml`: the same three parameters, the same `ControlPlaneStage`, and `CreateBillingReader=false`. It creates `TcDnsProvisioner`, `TcDnsReader` and `TcDnsPermissionsBoundary`. With the default `true` the stack fails, because `TcBillingReader` already exists.

`TcBillingReader` of step 1 is the only billing role. Its `ce:GetCostAndUsage` on every resource reads the cost of the whole account, Route 53 included, so the reconciler needs no second role. Both stacks may use one ExternalId or two; the pool and DNS rows of the database must hold the value of their own stack. A test (`tests/repo/infra-org.test.mjs`, WPU-Y7) pins that no role or policy name is in both stacks with `CreateBillingReader=false`. Deleting the pool stack removes `TcBillingReader`; delete the DNS stack first.

## Cost per line item

Estimate, not measured: check the AWS pricing pages and Cost Explorer after 7 days. No price below is a quote. The budget limit is the ceiling the alarm watches, not a forecast that the lines add up to it. The figures of 2026-11-13 are in [docs/analysis/cost-estimate-2026-11-13.md](../analysis/cost-estimate-2026-11-13.md).

| Line item                    | Lean setting                                    | What drives the cost                                                                                                      | Figure                                                                                                                      |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Database instance            | `db.t4g.micro`, single zone                     | instance hours, 730 hours a month, Region price                                                                           | VERIFY on the RDS pricing page                                                                                              |
| Database storage and backups | 20 GB, 7 days                                   | GB-month, backup storage above the free allowance                                                                         | VERIFY                                                                                                                      |
| RDS Proxy                    | one proxy                                       | vCPU-hours of the instance behind it, so the minimum for a micro                                                          | VERIFY on the RDS Proxy pricing page                                                                                        |
| NAT                          | one t4g.nano NAT instance (fck-nat) for the VPC | instance hours of one instance (730 h), its 4 GB root volume, standard EC2 data transfer out (no NAT data processing fee) | about 3.9 USD for the instance; compare with 2 NAT gateways (2 × hourly + per GB processed + their 2 public IPv4 addresses) |
| Public IPv4 addresses        | the one NAT Elastic IP, load balancer if any    | hourly charge per public address (730 h × 0.005 USD)                                                                      | about 3.65 USD                                                                                                              |
| Lambda, SQS, EventBridge     | pay per use                                     | requests and duration; low at launch volume                                                                               | VERIFY in Cost Explorer after 7 days                                                                                        |
| WAF                          | one web ACL, few rules                          | web ACL, rules and requests (monthly fee per ACL and per rule)                                                            | VERIFY on the WAF pricing page                                                                                              |
| CloudWatch logs              | 7 days retention                                | ingested GB and stored GB                                                                                                 | VERIFY in Cost Explorer after 7 days                                                                                        |
| Route 53                     | hosted zones                                    | monthly fee per zone, queries; grows with customer domains                                                                | VERIFY                                                                                                                      |
| KMS, Secrets Manager         | few keys and secrets                            | monthly fee per key and secret, requests                                                                                  | VERIFY                                                                                                                      |
| Customer Lightsail resources | sold to prepaid customers                       | paid from the customer wallet, not part of the platform budget                                                            | counted in the account bill; see below                                                                                      |

Customer Lightsail resources run in the same account, so they appear on the same bill. They do not carry the `sst:app` and `sst:stage` tags, so the tag-filtered budget does not count them; read customer growth in Cost Explorer, not in the budget alarm.

## What lean gives up

- The database is in one Availability Zone. A zone failure or maintenance takes it down until it recovers; recovery is the restore of [restore-drill.md](restore-drill.md).
- One NAT instance in one zone is one point of failure for the outbound traffic of the functions in BOTH zones (EPS, AWS APIs, SMS), and has the bandwidth of a t4g.nano. If it stops, outbound traffic stops until it is replaced (a redeploy, or start the instance in EC2).
- Backups reach back 7 days, logs 7 days. An incident older than a week has no log to read.
- Fewer WAF managed groups. Common rules and the rate rules stay; known-bad-input and reputation groups of `full` are absent.
- A shared account: blast radius as in the ruling above.

## When an organization SCP denies budgets

On 2026-11-14 the staging deploy failed at `MonthlyBudget`: a service control policy of the AWS Organization (not one of `infra/org/scps.yaml`) denies `budgets:ModifyBudget` to this member account. The management account is never touched from this repository. So the GitHub variable `TC_BUDGET_ALARM` is `off` in the environments `staging` and `production`, and the stage budget is left out (`infra/lib/lean.ts` parseBudgetAlarm; unset or `on` keeps it). The budget alerts then live in the management account (AWS Billing and Cost Management, Budgets), and keep their stage meaning only with a tag filter, because the account also runs other projects: one monthly cost budget for staging filtered to the tags `sst:app=tryaws-now` and `sst:stage=staging` (50 USD, alerts at 25, 40 and 50 USD actual), one for production with `sst:stage=production` (100 USD, alerts at 50, 80 and 100 USD actual), both to the alarm e-mail address. Activate the two tags as cost allocation tags first. Customer Lightsail resources carry no such tags, so read them in Cost Explorer. Before buying opens these budgets must exist (go-live.md step 9). When the SCP allows budgets again, set the variable to `on` (or delete it) and redeploy. Switching a stage whose state already holds a budget to `off` makes the deploy delete it, which needs `budgets:DeleteBudget`; the SCP may deny that too. The CI roles keep their `BudgetOfTheStage` statement on purpose, for the day the switch is `on` again.

## At a budget alarm

On staging, the first step at ANY staging alarm (25, 40 or 50 USD) is to check that staging is not left running, and to remove it if no test needs it: `npx sst remove --stage staging` or the CI workflow "remove-staging" ([staging-on-demand.md](staging-on-demand.md)). The alarm mail names the command in the budget name.

At the first notifications (staging 25 and 40 USD, production 50 and 80 USD, ACTUAL spend):

1. Open Cost Explorer for the account, filter by the tags `sst:app` and `sst:stage`, group by service, and compare with the table above. Name the line that grew.
2. Check whether a platform line grew (NAT data, logs, WAF requests) or a stage was left running.
3. Write the finding in the log.

At the limit (staging 50 USD, production 100 USD, ACTUAL spend):

1. Repeat the review above and decide with the owner: accept and raise the budget limit, or reduce.
2. To reduce, in this order: shorten log retention further, remove a feature family that is not selling (feature flags stay off in production, R12), stop non-essential stacks. Do not delete the database, the snapshots or customer resources, and do not weaken TLS, KMS, deletion protection or the WAF rate rules to save money.
3. A new customer purchase must not be blocked silently: if capacity or provisioning is stopped, say so on the status page and in the support inbox ([support-requests.md](support-requests.md)).

## Safe checks

`TC_STAGE_SIZE` unset deploys `full`; a wrong word is refused before any resource. After the deploy: the database shows `db.t4g.micro`, not multi-AZ, TLS required on the proxy, and on production 7 day backups and deletion protection on (staging: 1 day, off); there is exactly one NAT instance (tag `sst:is-nat=true`) and one NAT Elastic IP, both private route tables send `0.0.0.0/0` to that instance, and its address equals `TC_PROBE_SOURCES`; the web ACL has the Common group and the rate rules; Lambda log groups show 7 days; the budget shows the limit and notifications of the stage and its two tag conditions; every alarm e-mail subscription is confirmed (not pending). `/capacity` of the admin app shows the account with the real limits ([pool-account-single.md](pool-account-single.md)).

## Rollback

To `full` on the same account: unset `TC_STAGE_SIZE` (or set `full`), redeploy through CI after approval. The network gets managed NAT gateways, the log retention becomes 14 days, the other WAF managed groups return, and on a production stage the database becomes `db.t4g.medium` and Multi-AZ (on other stages it stays `db.t4g.micro` single-zone, with 14 day backups; staging keeps 1 day), so `TC_PROBE_SOURCES` must be replaced with the two gateway addresses (first deploy with documentation addresses, then redeploy, as above). Expect a short interruption while the database or network changes; do it in a quiet hour and announce it. The cost of `full` is higher; check the budget limit first.

To separate accounts: follow [pool-account-onboarding.md](pool-account-onboarding.md) for a new pool account, register it, set its real limits, then move new homes there (a home never moves by itself: customers placed in the shared account stay until a planned migration). Create the DNS account separately and point `TC_DNS_ACCOUNT_ID` to it. Change variables one at a time and redeploy after each. Rotate any ExternalId that was ever written outside the CI secrets ([secret-rotation.md](secret-rotation.md)).

## Log

Stage, date, who, the size (`lean` or `full`), the alarm that fired and the Cost Explorer finding, the decision. Account alias only, never the id.

## Must not

Put the account id, an ExternalId or any key in the repository, a ticket or a chat; deploy this stage from a Claude Code session or by hand; use the management account; create IAM users or access keys; run a size other than `lean` or `full`; remove RDS Proxy, TLS or KMS to save money, or deletion protection or the final snapshot of production (staging gives up these two by owner decision, WPU-Z10, and nothing else); claim a figure of the cost table as measured before Cost Explorer shows it; skip the confirmation of the alarm e-mail subscriptions.

### Warning: ControlPlaneStage=staging for the DNS roles

`dns-account.yaml` accepts `ControlPlaneStage=staging` only so that the one-account stage can use it. The DNS roles can change and delete every hosted zone of the account (`Resource: "*"`). Never deploy a staging-trusted DNS stack into a separate customer DNS account (`tc-dns` of the three-account design); keep `production` there. In the one account the zones of customers and of the platform share the account anyway, which is the accepted cost of the one-account ruling (JOURNEY.md, 2026-11-13).

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
