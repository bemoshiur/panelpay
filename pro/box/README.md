# Pro edition: box layout (PRO-3)

Everything of TryAWS.now Pro on one EC2 instance in the buyer's own AWS account. This folder holds
configuration only; the installer (PRO-4) copies it into place and the AMI (PRO-7) bakes it in.
Nothing here creates an AWS resource.

```
internet ──443/80──> tc-caddy ──127.0.0.1:801──> tc-web    (customer panel)
                             └─127.0.0.1:802──> tc-admin  (operator app; IP allowlist in Caddy + app, TOTP)
                     tc-web ──/run/tc-invoke/invoke.sock──> tc-worker (invoke socket, PRO-2)
                     tc-worker: provisioning queue + jobs (PRO-1), AWS calls with the instance role
                     web, admin, worker ──127.0.0.1:5432──> postgresql 16 (own role each)
                     tc-backup.timer ──> pg_dump to /var/backups/tc (+ optional buyer S3)
```

| Path on the box                                     | From                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| /opt/tc/releases/<id>/web                           | `TC_BUILD_TARGET=pro next build` of apps/web, the `.next/standalone` tree            |
| /opt/tc/releases/<id>/admin                         | the same for apps/admin                                                              |
| /opt/tc/releases/<id>/worker/main.mjs               | `pnpm --filter @tc/pro-worker build` (esbuild), with its production npm dependencies |
| /opt/tc/releases/<id>/box                           | this folder                                                                          |
| /opt/tc/current                                     | symlink to the active release                                                        |
| /etc/systemd/system/tc-*.{service,timer}            | systemd/                                                                             |
| /etc/caddy/Caddyfile                                | caddy/Caddyfile                                                                      |
| /etc/postgresql/16/main/conf.d/tc.conf, pg_hba.conf | postgres/                                                                            |
| /etc/tc/*.env                                       | written by the installer, see env/README.md                                          |

## Pro decisions (owner, 23 Nov 2026)

- **R2:** PostgreSQL runs on the instance and listens on loopback only, instead of RDS behind RDS Proxy.
- **R3:** secrets are in root-owned env files on the instance, instead of SST Secrets. AWS calls use the
  instance role; there are no long-lived AWS keys.
- **Cost:** the edition adds no AWS resource besides the buyer's instance (and, only if the buyer sets
  it, their own S3 prefix for backups). It creates nothing in TiCON's accounts.

## Rules checked by tests

`pro/worker/box-layout.test.ts`: Caddy is the only public listener and proxies only to loopback; it
sets `Cloudfront-Viewer-Address` from the TCP peer in every proxy, so the client cannot spoof the address
the apps read (rate limits, admin allowlist). The operator app has an IP allowlist in Caddy. Each app runs
as its own non-root user with systemd hardening and its own database role. PostgreSQL listens on
localhost with SCRAM and logs no bind values. The env templates carry no secret value.

Still to verify on a real box (PRO-7): `caddy validate` on this Caddyfile, and the Next.js standalone paths.

## Licence (PRO-5)

The worker checks the AWS Marketplace licence at start and every 12 hours with `CheckoutLicense`
(`PROVISIONAL`, key fingerprint `aws:294406891311:AWS/Marketplace:issuer-fingerprint`) and writes
`/var/lib/tc/licence.json`. An ended contract never stops the installed version (EULA). Only `tc-update`
reads the status: `node /opt/tc/current/worker/licence-gate.mjs` exits 0 when an active licence was seen
in the last 48 hours and 3 otherwise. AWS License Manager has no charge.

The instance role needs, for this, only `license-manager:CheckoutLicense` (it has no resource-level
permission, so `"Resource": "*"`; security review L5):

```json
{ "Effect": "Allow", "Action": "license-manager:CheckoutLicense", "Resource": "*" }
```

## Security review of PRO-2 to PRO-5 (23 Nov 2026)

- **H1** No password in the PostgreSQL log: `log_statement = 'none'`, `log_min_error_statement = 'panic'`,
  and the installer sends only a SCRAM verifier for `tc_owner` (`bin/scram-verifier.mjs`).
- **H2** R1 on one box: tc-web, tc-admin, tc-caddy and tc-backup cannot reach the instance metadata
  service (`IPAddressDeny`), and since PRO-8 `tc-firewall` also rejects metadata traffic from every
  user except root and tc-worker (IPv4 and IPv6), so a process started outside those units cannot take
  the role either. The AMI requires IMDSv2 with a hop limit of 1 (PRO-7).
- **M1** Caddy has no admin API (`admin off`).
- **M2** The invoke server is a Unix socket in the worker's runtime directory; web and admin listen on
  801/802 (below 1024); `tc-firewall` (nftables, own table) lets only Caddy reach 801/802 and only the
  platform users reach PostgreSQL over TCP.
- **M3** Caddy is a pinned release binary (SHA-512 of the GitHub release), not Ubuntu universe's package.
- **L1–L6** env files root:root 0600, nothing sourced by bash (systemd-run with EnvironmentFile), a strict
  email pattern, `{http.request.remote}` for IPv6, a root-only log directory, least-privilege licence
  permission, our own Caddy unit without `--environ`.

## WHMCS bridge (PRO-6)

Optional. With the three WHMCS answers, the installer starts `tc-bridge` (user `tc-bridge`, group
`caddy`, socket `/run/tc-bridge/bridge.sock`). Caddy routes only `/bridge/whmcs/*` of the panel host to it.
The bridge connects to PostgreSQL as `web_rw`, the role whose rights the EPS return also uses to credit a
wallet; it needs no AWS credentials. The reseller side is `pro/whmcs/` (README there).

## One-click install (PRO-8)

The Marketplace listing delivers the AMI with `pro/cfn/tryawsnow-pro.yaml` (generated by
`pro/cfn/build-template.mjs` from `infra/org/pool-roles.yaml` and `dns-account.yaml`). One stack in the
buyer's account makes:

- the instance role, assumable by EC2 only. It can assume the six Tc roles, call CheckoutLicense, read
  the two customer client secrets (DescribeUserPoolClient on the customer pool), look up the first
  operator (AdminGetUser on the operator pool) and put invoice PDFs;
- the Tc roles with the SaaS permissions and boundaries, trusted only by that instance role and the
  stack's ExternalId (the UUID of the stack id);
- the customer and operator Cognito pools and their three clients, and the first operator (Cognito
  e-mails a temporary password);
- an invoices bucket (SSE-S3, TLS only, retained);
- a security group (80/443 open, 22 from the operator CIDR), an Elastic IP, and the instance (IMDSv2,
  encrypted gp3);
- the two Route 53 roles only if the buyer sets `EnableDomains=yes`.

At first boot the user data writes `/root/tc/answers.env` (no secret in it) and runs
`tc-install --answers`. The installer reads the client secrets from Cognito with the instance role
and keeps them in `/etc/tc/.cognito` (root, 0600). It registers the account as the one pool account
(stage `pro`), so the Tc roles' ExternalId becomes `pool_accounts.external_id`. The buyer then points
the two domains at the stack output `PublicIp`. Caddy retries the certificates until DNS resolves.

Security review of PRO-8 (23 Nov 2026):

- **H1** The Route 53 roles are made only with `EnableDomains=yes` (default `no`, R12). The Tc roles
  act on the whole account, so the template asks the buyer to confirm a dedicated account
  (`DedicatedAccount=yes`). Follow-up, VERIFY: a tag condition on the destructive Lightsail actions.
- **M1** The S3 copy of the nightly dump moved out of `tc-backup` (user postgres, metadata denied) into
  `tc-backup-s3` (root, started on success, the dump directory read-only).
- **L1** Residual: the instance role can read the two customer client secrets. Only the installer
  uses those calls (a repo test fails if the apps or functions start to), and the secrets already sit in
  the root-only env files, so root on the box gains nothing new from them.
- **L2** The user data writes under `umask 077`. **L3** The operator CIDR (template and installer)
  cannot be wider than /8.
- **L4** Cognito's default sender is shared by both pools: 50 e-mails a day for the account in total
  (sign-up codes, password resets, the first operator). An open sign-up form can use them up. Follow-up:
  a global daily sign-up cap and an optional SES identity parameter.

Limits of this version:

- Cognito sends its own e-mails, 50 a day (`COGNITO_DEFAULT`, see L4). For more, switch the pools to SES.
- The Lambda triggers of the SaaS pools (custom messages, the preSignUp guard) are not part of Pro.
  Sign-up is still closed to anyone without a client secret.
- The role names are fixed, so the template installs once per AWS account.
- Customers can order Lightsail in ap-southeast-1, ap-south-1 and us-east-1 (LIGHTSAIL_REGIONS).
