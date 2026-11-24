# Staging on demand (WPU-Z10)

Rules: R2 (database private, RDS Proxy, TLS: unchanged on staging), R3 (no long-lived keys, the CI role through OIDC), R13 (production keeps deletion protection and the final snapshot), R14 (no secret, account id or personal data in a log or ticket), R16 (fail closed). The management account is never touched. Production is not removed and not changed by anything on this page.

Owner decision 2026-11-13 (`JOURNEY.md`, cost): staging as designed costs about 89 USD a month and the project ceiling is 50 USD, so staging runs ONLY during a test session: deploy, test, remove. While it runs it is as cheap as the rules allow (lean size, one NAT instance, one week of logs, one day of backups). A removal deletes everything that costs money and keeps what is free and painful to recreate. The figures are in [docs/analysis/cost-estimate-2026-11-13.md](../analysis/cost-estimate-2026-11-13.md).

**The rule: never leave staging up overnight unless a test needs it.** A running staging costs about **2.7 USD a day** (about 80 USD a month with the single NAT instance, divided by 30), whether anyone uses it or not.

## Trigger

A change needs a test on AWS (a gate's manual proof, a deploy rehearsal before production, an AWS behaviour to VERIFY), or the staging budget mail arrived (25, 40 or 50 USD), or the next-day check below found something billable.

## Who

The owner or DevOps with the staging deploy rights. A Claude Code session never deploys or removes staging and never sees a variable value, an account id or a secret.

## Start a session

1. Choose one way and use it for the whole session:
   - CI: run the workflow "deploy-staging" (Actions, deploy-staging, Run workflow, from `main`). A reviewer of the `staging` environment approves the deploy job.
   - A person's terminal, with the staging deploy role assumed through SSO (never an access key): `npx sst deploy --stage staging`, with the same variables as the CI environment `staging` exported in that shell (the names are in `JOURNEY.md`), `TC_STAGE_SIZE=lean` included.
2. Adopt the kept user pools (from the second session on). The first deploy of staging creates the two Cognito user pools; note the stack outputs `customerPoolId` and `adminPoolId` once and store them as the GitHub variables `TC_COGNITO_CUSTOMER_POOL_ID` and `TC_COGNITO_ADMIN_POOL_ID` of the `staging` environment (they are ids, not secrets). Every later deploy with these two variables adopts the kept pools (Pulumi `import`, `infra/stacks/auth.ts`), so the admin users and their TOTP are still there. Without them the deploy creates two NEW, empty pools beside the kept ones. The variables are refused on every stage but staging. The CI deploy passes them only once deploy-staging.yml lists them in its `env` (remove-staging.yml already does); until then use the terminal way for a session that needs the kept admins.
3. The NAT address is new in every session (the Elastic IP is deleted at each removal). If the session tests Linux server creation or an SMS send: read the stack output `natAddress`, set `TC_PROBE_SOURCES` of the `staging` environment to that address as `/32`, whitelist it in the Gennet portal ([sms-gateway.md](sms-gateway.md)), and deploy again. Without that, Linux creates stop before the static IP (R16) and the SMS gateway refuses the caller; everything else works.
4. Confirm that the alarm e-mail subscriptions of the new alarm topic are confirmed (a new topic is created each session, so each address gets a new confirmation mail).

5. Container plans (WPU-X20). Before that change nothing wrote the container plans, so `/containers/new` said "No plan is for sale right now". The catalog sync now reads `GetContainerServicePowers` in each launch Region and writes one `container_service` row per power (nano to xlarge, scale 1). After a deploy of that change: (a) run the `catalog-sync` Lambda once (Lambda console, Test, empty event; the summary log line `catalog_sync` must say `result: ok` and `catalog_sync_containers` must show `mapped` above 0 for each Region); (b) in the admin app open Pricing, Price book and check that the market of the test customer has a pricing rule in force for the family `container_service` (a plan is priced only when a rule exists; without one the page still says "No plan is for sale right now", fail closed R16); if there is none, add it with the usual four steps and a reason; (c) check that the feature flag `container_service` is on for the market. Then `/containers/new` lists the plans.

## What to test

The manual proofs of the gate in hand (`verify/manual-proofs.mjs`, for example `wp0-t3-staging-database`), the smoke checks of the deploy, and the VERIFY items of the change. Write down which proofs passed before ending the session: the evidence (screenshots, outputs) must be taken while the stage runs.

## End the session

1. Run the workflow "remove-staging" (Actions, remove-staging, Run workflow, from `main`, type `staging` in the confirmation field; a reviewer of the `staging` environment approves), or in the terminal of step 1: `npx sst remove --stage staging`.
2. A removal takes 15 to 40 minutes: the RDS instance and its proxy take minutes to delete, and the security groups and subnets of the VPC wait until AWS releases the network interfaces of the Lambda functions. If the removal stops on a security group, a subnet or the VPC with a "has dependent object" or "in use" error, wait 30 minutes and run it again; it continues where it stopped.
3. A production removal is refused by SST (`protect`), and the workflow can only name staging.

## What is wiped and what persists

Wiped by `sst remove --stage staging` (removal `remove` on staging, `infra/lib/stage.ts` `removalPolicy` and `removalRules`):

- The RDS instance with all test data: no deletion protection and no final snapshot on staging, backups 1 day, and the automated backups go with the instance. Its subnet group, parameter group, RDS Proxy and the proxy's Secrets Manager secrets (SST deletes them without a recovery window).
- The NAT instance, its Elastic IP and its security group; the VPC, its subnets, route tables, the S3 gateway endpoint and the Cloud Map private zone.
- Both WAF web ACLs and their IP sets, both CloudFront distributions, the Lambda@Edge signers, every Lambda function and its log group, the queues, the schedules, the DynamoDB tables of Next.js.
- The S3 buckets kyc, invoices and exports (emptied first: `forceDestroy` on staging), and the Next.js asset buckets.
- The KMS keys: scheduled for deletion (30 days); a key pending deletion is not billed.
- The alarms, the log metric filters, the alarm topic, the budget.

Kept (free, and painful to recreate):

- Both Cognito user pools, with the admin users and their TOTP (Pulumi `retainOnDelete` on staging). The app clients are deleted and created again; the web and admin apps get the new client ids from the deploy.
- The SST secrets (`sst remove` does not delete them). They are set once with `npx sst secret set` by a person in their own terminal and stay valid for the next session.
- The SST state and its bootstrap bucket, the OIDC role of CI, the hosted zone of the domain (none of them belongs to the stage).

Left behind and nearly free: the log groups that Lambda@Edge creates by itself in the Regions where viewers were served (`/aws/lambda/us-east-1.<name>`); the stack never created them, so it cannot delete them. They hold a few KB; delete them by hand in the next-day check if they show storage.

## Next day: check that nothing billable remains

Cost data arrives with a delay of up to 24 hours, so this check is for the day after a removal.

1. Cost Explorer (Billing console of the staging account): daily granularity, the last 3 days, group by Service, filter by tag `sst:stage` = `staging` (and `sst:app` = `tryaws-now`). The day after the removal shows no RDS, no EC2 instance or Elastic IP (EC2-Other, VPC public IPv4), no WAF, no Secrets Manager. KMS may show a part-day.
2. Without the tag filter, group by Service: the account also runs the owner's other projects (their SES identities and Route 53 zones), so a line there is not necessarily staging. A line of a service that only staging uses (RDS, WAF) means something remained.
3. In the console of the Region (ap-southeast-1) and of us-east-1 for WAF: RDS instances (none named `tc-staging-*` or the stage's SST name), EC2 instances tagged `sst:is-nat=true` (none), Elastic IPs (none named `tc-staging-nat-ip`), WAF web ACLs in Global (CloudFront) (none named `tc-staging-*`).
4. If something remained: run the removal again (End the session, step 1). If it still remains, write a "Needs decision" entry; never delete a resource of another project.

## The budget e-mail

While the GitHub variable `TC_BUDGET_ALARM` is `off` (an organization SCP denies budgets to this account, 2026-11-14), staging has no budget of its own and the mail below comes from the management-account budget of [single-account-lean.md](single-account-lean.md) instead. With the switch `on`: the staging budget (`infra/stacks/budget.ts`) is 50 USD a month and mails at 25, 40 and 50 USD of actual spend. Its name, which the mail quotes, ends with "stop it with sst remove --stage staging". At any staging budget mail: check whether staging is running and remove it unless a test needs it.

The budget counts only the costs of resources tagged `sst:app` = `tryaws-now` AND `sst:stage` = `staging`, the tags SST puts on every resource it creates, because the account is shared with the owner's other projects. A tag counts in billing only after a person has activated it as a **cost allocation tag in the Billing console of the PAYER account** (the management account of the organisation: Billing and Cost Management, Cost allocation tags, select `sst:app` and `sst:stage`, Activate). A Claude Code session never does this, because it never touches the management account. A tag appears in that list only after a resource carrying it has existed, and activation takes up to 24 hours. **Until both tags are active the filter counts nothing, the budget never mails, and the next-day Cost Explorer check above is the only guard.** Costs that carry no tag (data transfer, for example) are never counted by the budget; the next-day check without the tag filter sees them.

## Safe checks

After a deploy: one NAT instance and one Elastic IP; the database shows 1 day of backups, no deletion protection, TLS required on the proxy; the Lambda log groups of the stage show 7 days; the two user pools have the ids of the two variables (from the second session on). After a removal: the checks of "Next day" above.

## Rollback

A failed deploy: fix the cause and deploy again, or remove the stage. A failed adoption of a kept pool (the deploy reports that the inputs to import do not match the existing resource): unset the two pool variables and deploy, which creates new empty pools, then invite the admins again; the kept pools stay unused in AWS (free) until a person deletes them in the Cognito console after turning off their deletion protection. Write the difference that blocked the import in the log so the stack can be changed to match.

## Log

Date, who, start and end time of the session, the way (CI or terminal), the proofs that passed, the removal result, the next-day check result. Pool ids and the NAT address may be logged; never an account id, an ExternalId or a secret.

## Must not

Leave staging up overnight without a test that needs it; remove production or point any of this at production; run `sst remove` from a Claude Code session; delete the kept user pools or the SST secrets to "clean up"; activate cost allocation tags from a Claude Code session or touch the management account in any other way; delete a resource that belongs to another project of the shared account; put a pool id variable on production or a personal stage (the deploy refuses it).

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
