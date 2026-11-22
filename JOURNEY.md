# JOURNEY

One entry per task or handoff, newest last. Copy this form:

```markdown
## 2026-11-12 14:20 WP3-T1 (track A, <driver>)
Done: <what changed, one or two lines>
Proof: <command> -> <result>
VERIFY results: <item>: <what was observed>
Needs decision:
1. <question>. Options: <a>, <b>. Blocks: <task ids>.
Next: <task id or exact next step>
```

## 2026-11-23 01:20 PRO-0 (track Pro, Claude)
Done: docs/pro/single-ec2-plan.md: owner decisions (AWS Marketplace AMI, Pro edition, USD 199 as a 36-month contract with a perpetual-use EULA), the mapping from Lambda/SQS/RDS to one EC2, tasks PRO-1 to PRO-9.
Proof: plan only, no code.
VERIFY results: AWS Marketplace AMI contract pricing: public durations 1, 12, 24, 36 months; private offers up to 60 months; no perpetual price (docs.aws.amazon.com/marketplace/latest/userguide/ami-contracts.html, read 2026-11-23).
Needs decision:
1. The Pro edition departs from R2 (PostgreSQL on the box instead of RDS behind RDS Proxy) and R3 (secrets in a root-only env file on the box instead of SST Secrets). Options: accept for Pro only, or keep RDS and SSM in the buyer's account. Blocks: PRO-3.
Next: PRO-1.

## 2026-11-23 02:05 PRO-1 (track Pro, Claude)
Done: createLocalQueue (packages/core/operations/local-queue.ts): the provisioning queue inside the worker, same contract as the SQS FIFO queue of 3.3 (group per resource, 5-minute deduplication, retry delay, run timeout that frees the attempt but not the group, dead letters reported by id); pro/worker (@tc/pro-worker): job runner with the schedules of infra/lib/functions.ts, worker that binds provisioner and scheduler to the local queue and gives the provisioner a Lambda-like context so its lease guard applies, main.ts that fails closed with fixed log lines. Provisioner buildDeps({ queue }) and scheduler buildSchedulerHandler({ queue }) take an injected queue; without one they behave as before. Workspace gains the folder pro/; R1 lint now also bars apps and packages from @tc/pro-* and pro/ paths.
Proof: vitest run pro packages/core/operations functions/provisioner functions/scheduler -> 95 files, 1023 passed, 1 skipped (PostgreSQL 16); vitest run tests/repo -> all pass except "runs on the Node version pinned in .nvmrc" (sandbox Node 22.23.5, repo pins 24.22.2: environment); eslint and tsc clean on the changed packages.
VERIFY results: none new.
Needs decision:
1. Same as PRO-0 item 1 (R2, R3 for Pro). Blocks: PRO-3.
Next: PRO-2 (invoke functions over loopback). PRO-3 bundles main.ts with esbuild: Node type stripping cannot run the workspace .ts packages.

## 2026-11-23 02:20 PRO-2 (track Pro, Claude)
Done: pro/worker/invoke-server.ts: a loopback-only HTTP stand-in for lambda:InvokeFunction. It binds 127.0.0.1 or ::1 only, checks a shared token in constant time, serves only reader, access-details, kyc-check and invoice-renderer, fixes the tier to the "web" alias in the ARN it hands the handler (WPU-S6), caps the body at 256 KiB and answers a thrown error with a fixed 502 and no message (R14). main.ts starts it when PRO_INVOKE_PORT and PRO_INVOKE_TOKEN are both set. apps/web/server/loopback-invoker.ts: the matching client, with no import of pro/ or packages/aws (R1). The four *PortFromEnv functions use it when PRO_INVOKE_URL is set; a non-loopback URL or a short token makes the port "not available", never a Lambda fallback (R16). Only apps/web invokes these functions; apps/admin has no invoke port, so the plan's "web and admin" is web only.
Proof: vitest run pro/worker apps/web/server tests/repo -> 185 files, 3124 passed, 50 skipped, 1 failed ("runs on the Node version pinned in .nvmrc": sandbox Node 22, repo pins 24, environment only); tsc --noEmit clean for apps/web and pro/worker; eslint clean on the changed files.
VERIFY results: none new.
Needs decision:
1. Same as PRO-0 item 1 (R2, R3 for Pro). Blocks: PRO-3.
Next: PRO-3 (box layout). It must not create any AWS resource; the owner allows no new AWS cost. The AMI build of PRO-7 needs the owner's approval first.

## 2026-11-23 02:45 PRO-3 (track Pro, Claude)
Done: pro/box: systemd units (tc-web, tc-admin, tc-worker, tc-backup + timer), each app as its own non-root user with hardening, its own env file and its own database role; Caddyfile (the only public listener; proxies to 127.0.0.1:3000/3001; sets Cloudfront-Viewer-Address from the TCP peer so the address the apps read cannot be spoofed; IP allowlist in front of the operator app, R10); PostgreSQL 16 conf.d and pg_hba (localhost, SCRAM, no bind values in the log); env templates with no values; tc-backup.sh (pg_dump custom format, checked with pg_restore --list, kept 14 days, optional copy to the buyer's own S3). pro/worker/build.mjs bundles the worker with esbuild 0.28.2 (already in the lockfile). next.config of web and admin: output "standalone" only when TC_BUILD_TARGET=pro; the Lambda build is unchanged. Also on PRO-1: "pro/*" added to the root Vitest projects (CI did not run the worker tests) and a repo test that keeps the projects and the workspace folders equal; createLocalQueue added to the @tc/core export surface test (the CI failure of #10).
Proof: vitest run pro/worker -> 4 files, 31 passed (a removed header_up line makes box-layout fail, checked); vitest --project repo -> 1390 passed, 5 skipped, 1 failed (.nvmrc Node version, sandbox only); apps/web next-config.test 2 passed; tsc clean for apps/web, apps/admin, pro/worker; eslint clean; systemd-analyze verify on the units shows no unit error; node build.mjs -> dist/main.mjs passes node --check.
VERIFY results: caddy validate not run (no Caddy binary in the sandbox); to run on the first box, PRO-7.
Decided: owner, 2026-11-23 02:20: the Pro edition may keep PostgreSQL and its secrets on the buyer's instance (R2, R3 for Pro only), on the condition that TiCON has no AWS bill. The edition creates no AWS resource in TiCON's accounts.
Next: PRO-4 (installer and first-run wizard, including a migrator entry that reads the role passwords from the box instead of SST links).

## 2026-11-23 03:05 PRO-4 (track Pro, Claude)
Done:
- `pro/box/bin/tc-install.sh` (Ubuntu 24.04, idempotent, unattended with `--answers`):
  - installs PostgreSQL 16 and Caddy from Ubuntu's archive, and Node 24.22.2 from nodejs.org with a pinned SHA-256;
  - creates the users, and generates the secrets once (`openssl rand`; the owner password goes to psql on stdin);
  - makes a TLS certificate for the local PostgreSQL and writes `/etc/tc/*.env` with the owner and mode of `env/README.md`;
  - runs the migrations, then grants CONNECT to the five roles only;
  - installs the units and checks the Caddyfile with `caddy validate` before starting Caddy.
- PostgreSQL is TLS-only, even on loopback (`hostssl`, TLS 1.3, `sslmode=verify-full` against the box's certificate), because the migrator refuses a session without TLS (R2). `tc_owner` (CREATEROLE) owns the database.
- `functions/migrator`: `migratorDeps(config)` is exported, so the Lambda handler and Pro run the same `runMigrator`.
- `pro/worker/migrate.ts` + `migrate-config.ts`: config from `/etc/tc/migrate.env`. It requires a local URL with verify-full, five distinct passwords of 32+ characters and an absolute folder; the stage is "pro", so all flags start off.
- `pro/worker/bundle-deps.mjs` pins the npm dependencies of the bundles to the versions the workspace resolves (R17).
- Plan: the partner-solution step after the Marketplace listing; price confirmed.

Proof:
- `vitest run pro/worker functions/migrator` -> 12 files, 98 passed. Two planted mistakes in the installer (a wrong env file mode; a secret printed) each make box-layout fail.
- The bundled `dist/migrate.mjs`, with its pinned npm dependencies installed by `npm install --omit=dev --ignore-scripts`, ran against a fresh PostgreSQL 16 cluster with the repo's `pg_hba` and TLS:
  - first run: 5 roles created, 29 migrations, 8 system accounts, production seed (12 flags, all off);
  - second run: nothing changed.
- web_rw connects with verify-full (ssl true); a plaintext connection is refused by `pg_hba`.
- `shellcheck -S warning` is clean; tsc and eslint are clean.

VERIFY results:
- Ubuntu 24.04 has no awscli package: the backup's S3 copy needs the CLI from the AMI (PRO-7) and fails closed without it.
- The nodejs.org SHASUMS256.txt for 24.22.2 was read over HTTPS on 2026-11-23. Its GPG signature was not checked: do that in PRO-7.

Not run: the installer end to end. It needs an Ubuntu 24.04 instance with systemd, which comes in PRO-7, after the owner approves the build instance and its cost.

Next: PRO-5 (licence check with AWS License Manager CheckoutLicense; no cost to TiCON).

## 2026-11-23 03:25 PRO-5 (track Pro, Claude)
Done: pro/worker/licence.ts: CheckoutLicense check (PROVISIONAL, AWS Marketplace key fingerprint, entitlement "pro") at start and every 12 hours, recorded in /var/lib/tc/licence.json (systemd StateDirectory). Missing or ended licence -> expired; a check that could not complete -> unknown, never expired; only the error name is logged. licenceAllowsUpdate: updates only with an active licence checked in the last 48 hours (R16); the running platform never reads the status (EULA: an ended contract keeps the installed version). licence-gate.mjs for tc-update (exit 0 or 3). @aws-sdk/client-license-manager 3.1166.0 (same version as the other AWS clients; not an auth or crypto dependency). Installer writes TC_PRODUCT_SKU from the release (baked into the AMI in PRO-7).
Proof: vitest run pro/worker -> 6 files, 46 passed; licence-gate.mjs with no status file prints "refused" and exits 3; tsc, eslint, shellcheck clean.
VERIFY results: AWS Marketplace seller guide (ami-license-manager-integration, container-anywhere-license-manager-integration), read 2026-11-23: the key fingerprint for licences issued by AWS Marketplace is aws:294406891311:AWS/Marketplace:issuer-fingerprint; after a contract ends the buyer cannot launch new instances of the AMI, but running ones are not stopped. The tiered entitlement name and unit must be checked against the test licence once the product exists (PRO-8).
Next: PRO-6 (WHMCS bridge).

## 2026-11-23 04:00 PRO-5 review fixes (track Pro, Claude)
Done: security-reviewer over pro-1-runtime..pro-5-licence; every finding fixed on this branch (they touch PRO-3/PRO-4 files too):
- H1: PostgreSQL logs no statement text (log_statement none, log_min_error_statement panic); the installer sends tc_owner a SCRAM verifier (pro/box/bin/scram-verifier.mjs), never the clear password.
- H2: tc-web, tc-admin and tc-caddy have IPAddressDeny for the instance metadata service, so only tc-worker holds the instance role (R1 on one box).
- M1: Caddy `admin off`.
- M2: the invoke server is a Unix socket in tc-worker's RuntimeDirectory (/run/tc-invoke, 0750, socket 0660); web and admin listen on 801/802 with CAP_NET_BIND_SERVICE; tc-firewall (nftables table inet tc_local) lets only `caddy` connect to 801/802 and only root, postgres and the three app users to 5432.
- M3: Caddy 2.11.7 release binary with the SHA-512 of the GitHub release checksums file, instead of Ubuntu universe's caddy.
- L1-L6:
  - env files are root:root 0600, and bash sources nothing: migrate and caddy validate run through systemd-run with EnvironmentFile, and the secrets file is read line by line;
  - stricter email pattern;
  - `{http.request.remote}` for IPv6;
  - /var/log/tc is root 0700;
  - the licence permission is CheckoutLicense only;
  - our own tc-caddy unit, without --environ.

Proof:
- vitest (pro/worker + the five web invoke files): 10 files, 85 passed. New layout tests cover each finding. A real Unix-socket round trip is tested on both the server and the client side.
- The nftables file was loaded in the sandbox: root -> 802 refused, caddy -> 802 answered 200, tc-web -> 5432 connected, caddy -> 5432 refused; the table and the test users were then removed. `nft -c` refuses a user name that does not exist.
- The SCRAM verifier was set on tc_owner: the right password logs in and a wrong one is refused.
- With the new tc.conf, a successful and a failing ALTER ROLE ... PASSWORD left 0 occurrences of the password in the PostgreSQL log.
- shellcheck, tsc and eslint are clean.

Open:
- functions/migrator ensureRoles still sends clear passwords for the five roles; with logging off they reach no log. Sending verifiers there too is a shared Lambda/Pro change for its own task.
- IMDSv2 with hop limit 1 goes in the AMI launch settings (PRO-7).

Next: PRO-6 (WHMCS bridge).
