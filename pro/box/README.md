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
- **H2** R1 on one box: tc-web, tc-admin and tc-caddy cannot reach the instance metadata service
  (`IPAddressDeny`), so only tc-worker holds the instance role's credentials. The AMI also requires
  IMDSv2 with a hop limit of 1 (PRO-7).
- **M1** Caddy has no admin API (`admin off`).
- **M2** The invoke server is a Unix socket in the worker's runtime directory; web and admin listen on
  801/802 (below 1024); `tc-firewall` (nftables, own table) lets only Caddy reach 801/802 and only the
  platform users reach PostgreSQL over TCP.
- **M3** Caddy is a pinned release binary (SHA-512 of the GitHub release), not Ubuntu universe's package.
- **L1–L6** env files root:root 0600, nothing sourced by bash (systemd-run with EnvironmentFile), a strict
  email pattern, `{http.request.remote}` for IPv6, a root-only log directory, least-privilege licence
  permission, our own Caddy unit without `--environ`.
