# Pro edition: box layout (PRO-3)

Everything of TryAWS.now Pro on one EC2 instance in the buyer's own AWS account. This folder holds
configuration only; the installer (PRO-4) copies it into place and the AMI (PRO-7) bakes it in.
Nothing here creates an AWS resource.

```
internet ──443/80──> caddy ──127.0.0.1:3000──> tc-web    (customer panel)
                          └─127.0.0.1:3001──> tc-admin  (operator app; IP allowlist in Caddy + app, TOTP)
                     tc-web ──127.0.0.1:9700──> tc-worker (loopback invoke, PRO-2)
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

The instance role needs, for this:

```json
{
  "Effect": "Allow",
  "Action": [
    "license-manager:CheckoutLicense",
    "license-manager:CheckInLicense",
    "license-manager:ListReceivedLicenses",
    "license-manager:GetLicense"
  ],
  "Resource": "*"
}
```
