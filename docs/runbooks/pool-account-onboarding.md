# Pool account onboarding

Rules: R3 (no long-lived keys; cross-account is STS AssumeRole), the management account is never touched by a developer or Claude Code session, Section 3.1 (adding a pool account is a configuration change).

## Trigger

The owner decides on a new pool account (for example `tc-pool-n2`) because fixed quotas are near the limit ([capacity-full-and-quota.md](capacity-full-and-quota.md)).

## Who

DevOps with the account owner of the AWS Organization. A person with the right role does the AWS steps in the console. A Claude Code session does none of them.

## Checklist

1. Create the account inside the pool OU of the existing Organization. Check the Organization account quota first (default 10) and ask AWS if it is too low.
2. The SCP of the pool OU applies (`infra/org/scps.yaml`): Lightsail only. Confirm the provisioner role cannot use a denied action (gate item in Section 15).
3. Create the roles that the platform assumes: `TcProvisioner`, `TcReader`, `TcAccessDetails`, each trusting only the platform Lambda roles of `tc-platform` (production) or `tc-platform-stg` (staging, only `tc-pool-dev`). No access key is created for any user. Template: `infra/org/pool-roles.yaml` (order of application in `infra/org/README.md`); the ExternalId is a new plain value, recorded in step 7.
4. Set a monitored security alternate contact for AWS abuse notices (Section 15): `infra/org/alternate-contacts.template.sh`, dry run first.
5. Turn on CloudTrail and GuardDuty for the account (organization trail, `infra/org/cloudtrail-trail.yaml`, and GuardDuty auto-enable for members, `infra/org/guardduty.yaml`); confirm the account is a member in both.
6. Record the real Lightsail quotas per Region (new accounts can start below the documented defaults) and file requests for the raisable ones.
7. Admin app `/capacity`: `addPoolAccount` with the alias and tier (`trusted` or `new`), then `setCapacityLimit` for each quota code and Region with the recorded values.
8. Smoke test on staging with `tc-pool-dev` only. Production traffic waits for the owner.

## Safe checks

`/capacity` shows the account with the right limits and zero use. A test order in staging reaches `active` in `tc-pool-dev`; none in production.

## Rollback

Set all limits of the new account to 0 with `setCapacityLimit` so no home is assigned. Do not close an account that already hosts customers.

## Log

Account alias (not the id in shared notes), date, who, quotas, the case ids of quota requests.

## Must not

Create IAM users or access keys; attach an SCP exception without the owner; use the management account for workloads; deploy production.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
