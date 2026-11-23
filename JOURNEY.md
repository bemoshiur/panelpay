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

## 2026-11-23 04:40 PRO-6 (track Pro, Claude)
Decided (owner, 2026-11-23 02:55, asked before building because it touches sign-in and a wallet rule):
- WHMCS clients sign in through the panel's own login page with their e-mail filled in. There is no new sign-in system.
- Wallet top-ups go through WHMCS invoices. The panel credits one only after it has read the paid invoice from the WHMCS API itself. This is R6 applied to a second gateway, Pro edition only.

Done:
- `pro/whmcs-bridge` (`@tc/pro-whmcs-bridge`):
  - `invoice.ts`: amounts are parsed as text into bigint minor units. A credit needs a paid invoice with nothing left to pay, top-up lines only (the marker), and a total of at least their sum. Tax stays with the reseller.
  - `whmcs-api.ts`: GetInvoice and GetClientsDetails over https, with no redirects, a timeout, and parsing field by field.
  - `credit.ts`: one transaction does all of this:
    - finds exactly one active customer with a verified e-mail;
    - inserts the payment (gateway "whmcs", merchant/idempotency key `WHMCS-<install>-<invoice>`);
    - locks it;
    - sends another currency to review and records a discrepancy;
    - posts gateway_clearing -> customer_wallet with `ledgerKey.topup`;
    - marks the payment credited.
  - `server.ts`: one signed endpoint on a Unix socket: HMAC-SHA256 over `<ts>.<body>`, a 5-minute window, constant-time compare, a global per-minute limit. The signature decides no money.
  - `main.ts`: the service, plus `recheck <invoice>`.
- `packages/db`:
  - `systemWhmcs.customerByVerifiedEmail` is a system read with no customer id, classified in tenancy.ts and type-checked against MethodsTakingCustomerId.
  - The payments repo accepts gateway "whmcs" (allowlist).
- `apps/web` login: `?email=` fills in a plain address, and anything else is dropped. It signs in nothing.
- `pro/whmcs` (PHP, WHMCS addon):
  - client area: "Open panel" and "Top up wallet", which creates the invoice;
  - InvoicePaid hook: sends a signed notice, for top-up invoices only;
  - admin page: re-send.
- Box:
  - tc-bridge.service: user tc-bridge, group caddy, socket /run/tc-bridge, IMDS denied, runs only when bridge.env exists;
  - Caddy routes `/bridge/whmcs/*` of the panel host to the socket;
  - nftables lets tc-bridge reach 5432;
  - the installer asks the optional WHMCS questions, reads the API secret without echo, and writes bridge.env and bridge-secret.txt as root 0600, never printed.

Proof:
- `vitest run packages/db packages/eps pro` plus the web loopback and login tests: 223 files, 2975 passed, 1 skipped.
- credit.test runs on real PostgreSQL:
  - credited once, then unchanged;
  - two concurrent calls give one credit;
  - unverified, unknown or duplicate e-mails credit nothing;
  - another currency goes to review;
  - a later change of amount goes to review, never a second credit;
  - logs carry no e-mail.
- The PHP and TypeScript HMAC agree byte for byte (`php pro/whmcs/test/lib-test.php` prints ae9f8af1…, pinned in server.test).
- A mutation test: removing the e-mail prefill makes the login test fail.
- `nft -c` passes with the tc-bridge user, `systemd-analyze verify` is clean, and `php -l`, shellcheck, tsc and eslint are clean.

VERIFY results: WHMCS API GetInvoice and GetClientsDetails field names (userid, status, balance, total, items.item[].description and amount; client.email and currency_code) come from WHMCS's own API documentation and are not yet checked against a live WHMCS. Do that against the first reseller's WHMCS before launch.

Next: a money and security review of this PR, then PRO-7 (AMI build; the owner approves the build instance and its cost first).

## 2026-11-23 05:30 PRO-6 review fixes (track Pro, Claude)
Done: money-reviewer and security-reviewer over pro-5-licence..pro-6-whmcs. Fixed:
- money 1 (high): the install id comes from the bridge secret, not the WHMCS host. Moving WHMCS can no longer give an old invoice a new merchant id and a second credit.
- money 2: an invoice paid with WHMCS credit balance is refused (review). New InvoiceRefunded, InvoiceCancelled and InvoiceUnpaid hooks call `/bridge/whmcs/invoice-changed`; the bridge re-reads the invoice and flags a credited one that is no longer Paid as a payment discrepancy. Nothing is reversed automatically.
- money 3 + 5 / security L4: every top-up line carries its currency, amount and a client reference: HMAC(bridge secret, "<client id>:<e-mail>"). The bridge recomputes the reference from the client WHMCS returns at payment, so an e-mail or currency changed after the invoice was made is refused. The PHP and TypeScript values are pinned against each other (cc002447a02fea47).
- money 4: every refused paid top-up is recorded as a payment discrepancy (`note`: whmcs invoice <n>: <reason>; `note` added to PAYMENT_DISCREPANCY_KEYS, a key the reconciliation screen shows). A 15-minute sweeper (GetInvoices, status Paid, newest 100) credits what the hook missed, with record:false so retries add no duplicates.
- security M1: a repo test allows systemWhmcs only in pro/whmcs-bridge, its module, db index and tests. A planted import in apps/web fails it.
- security L3: the endpoint validates the body before the rate limit (R9 order). The body check stays a strict regex: the bridge package has no zod dependency.
- security L6: tc-bridge has its own group, with SupplementaryGroups=caddy only to chgrp its socket; RuntimeDirectoryMode 0755; socket 0660, group caddy.
- security L7: the WHMCS answer size is capped while streaming.

Proof:
- `vitest run packages/db packages/eps pro tests/repo` plus the web loopback and login tests: 4198 passed, 6 skipped, 1 failed (the .nvmrc Node version check, sandbox only).
- `credit.test` (real PostgreSQL) adds tests for: the e-mail moved to another account, paid with credit, unmatched recorded, the sweeper recording nothing, an amount changed after the credit, and refund flagging.
- `php -l`, `php pro/whmcs/test/lib-test.php`, tsc, eslint and shellcheck are clean.

Needs decision:
1. When WHMCS refunds a top-up the panel already credited, may the bridge reverse the wallet automatically (a reversing ledger transaction), or does an operator always decide? Today an operator always decides (R5). Options: automatic reversal capped at the wallet balance; operator only. Blocks: nothing.

Open (low, not done here):
- security L5: a dedicated bridge_rw database role (forward-only migration + grants) instead of web_rw.
- WHMCS API field names (credit, client id, GetInvoices) are still to be checked on a live WHMCS.
- Reconciling EPS settlements against gateway_clearing must filter on payments.gateway, because WHMCS top-ups post to the same account.

Next: PR for PRO-6, then PRO-7 (AMI build; the owner approves the build instance and its cost first).

## 2026-11-23 04:45 PRO-7 AMI build (track Pro, Claude)
Done: the release archive (`pro/ami/make-release.sh`), the bake user data (`pro/ami/bake-userdata.sh`), the build script (`pro/ami/build-ami.sh`) and `tc-install.sh --bake`. The owner approved the build instance and its cost ("ok lets do it").

Built in account 739275468267 (user publicpulse), ap-southeast-1. The management account was not used.
- Release: tc-pro-827212537a7a.tar.gz, 95,915,035 bytes, sha256 908d02df…13446.
- Base: ami-09289bc217ad5e9e7 (Canonical 099720109477, ubuntu-noble-24.04-amd64-server-20261120).
- AMI: **ami-0ab0ca982c5e45218** "tryawsnow-pro-827212537a7a", x86_64, ENA, private, ImdsSupport v2.0, one 16 GB gp3 snapshot (snap-05fb942a9513e40b7), not encrypted (Marketplace requires that).
- Console: tc-bake download → updates → install → clean → TC-BAKE-OK 827212537a7a.

Bugs found by the real build, fixed (commits 6d197c2, c3294e4):
- `cloud-init status --wait` in user data waits on the stage that runs it, so the first build hung. Removed.
- The /var/log sweep failed on a log that changed while it ran, so cloud-init clean never ran (build 2 reported TC-BAKE-FAILED at line 65; its image was deregistered and its snapshot deleted). Both log sweeps now tolerate this.
- Added /etc/apt/apt.conf.d/50tc-lock-wait (DPkg::Lock::Timeout 600): first-boot unattended-upgrades no longer breaks apt in the bake or in the buyer's first tc-install.

Cleanup (verified): 3 build instances terminated, security group and temporary bucket deleted, no loose volumes. Left: the AMI and its snapshot only.

Cost: three t3.small runs of about 25 minutes in total (about 1 cent) and S3 for under an hour (negligible). Ongoing: the snapshot, billed on used blocks (a few GB, about $0.10–0.25 a month).

VERIFY results: AWS Marketplace AMI rules checked in the bake (no keys, no history, cleared logs, fresh machine-id, IMDSv2, root volume not encrypted). Not yet run: the Marketplace AMI scan (done in PRO-8 when the AMI is shared with the seller account) and an end-to-end `sudo tc-install` on an instance launched from the AMI. Both need the owner's approval: the scan touches the seller account (the management account); the test launch costs a few cents.

Next: PRO-8 (Marketplace listing: share the AMI with the seller account and run the scan; the owner decides on the management account first).

## 2026-11-23 05:00 PRO-8 Marketplace listing, part 1 (track Pro, Claude)
Owner approvals: share the AMI with the seller account and run the scan ("ok"); copy the AMI to us-east-1 in the seller account at about 5–10 cents once and about $0.15–0.25 a month for its snapshot ("হ্যাঁ, কপি করো").

Done:
- The AMI was copied from ap-southeast-1 to us-east-1 in 739275468267 and shared with the seller account, 542374379351 (the management account, used only for Marketplace).
- In the seller account: copied as **ami-0e2d9ec91e9f6ebb7** (owned by 542374379351, not encrypted). Created IAM role `AWSMarketplaceAmiIngestionRole` (AWS managed policy AWSMarketplaceAmiIngestion, trust marketplace.amazonaws.com). No other resource was touched in that account; the root connector was not used.
- Both copies in 739275468267 (ap-southeast-1 and us-east-1) were deregistered and their snapshots deleted. That account now has no PRO storage.
- Draft product **prod-ill7oycvmsrme** "TryAWS.now Pro: Prepaid Lightsail Reseller Panel with WHMCS" (Software, AMI):
  - product details (logo, descriptions, highlights, support business@ticonsys.com, three categories);
  - 34 commercial Regions (GovCloud excluded);
  - 9 x86_64 instance types (t3/t3a small–large, t3.xlarge, m6i.large, m7i.large; t3.medium recommended);
  - "Test add version 1.0.0" with Ubuntu 24.04, user ubuntu, scan port 22, and security group recommendations 443/80/22.
- make-release.sh now puts the WHMCS addon (pro/whmcs/modules) into the release; the 827212537a7a archive lacked it.

Needs decision (blocks making the listing public, not the scan):
1. Pro still uses the SaaS design for AWS access. The worker assumes TcProvisioner, TcReader, TcAccessDetails and the DNS roles with ExternalIds (packages/aws/access.ts, roles.ts), the account must be registered as the pool account in pool_accounts, and tc-install asks for two Cognito user pools. A buyer therefore needs, before the panel can create anything:
   - an adapted infra/org/pool-roles.yaml that trusts the instance role;
   - the Cognito pools;
   - the pool account row.
   Nothing on the AMI or in the installer creates these today. Options:
   - (a) deliver "AMI with CloudFormation": one template that makes the instance role, the Tc* roles trusting it, and the Cognito pools, with tc-install registering the pool account;
   - (b) a Pro-only credentials path that uses the instance role directly, plus local sign-in instead of Cognito. This changes R3/R9 behaviour and auth, so it needs the owner and a security review.
   Until one is built, the usage instructions on the listing are incomplete, and the listing stays Draft or Limited.

Open:
- Pricing ($199 for a 36-month contract, entitlement dimension "pro"), the EULA and procurement (Step 3) are not done yet.
- The India declaration banner in Partner Central (no PE, TRC, Form 41) must be answered before Q4 2026, or paid offers to buyers in India may be suspended.
- The scan result is pending.

## 2026-11-23 05:30 PRO-8 AMI scan result (track Pro, Claude)
"Test add version 1.0.0" of prod-ill7oycvmsrme **Succeeded** (started 04:42, finished 05:10 GMT+6). ami-0e2d9ec91e9f6ebb7 passes the AWS Marketplace self-service scan. A test adds no version and changes no live listing. Next: owner decision on the Pro prerequisites (roles and Cognito, see the PRO-8 part 1 entry), then pricing ($199 for 36 months), the EULA and the real version.

## 2026-11-23 PRO-8 one-click template and security review (track Pro, Claude)
Owner decision (12:58): option (a), "AMI with CloudFormation". Branch pro-8-marketplace. No AWS call, no paid resource, nothing deployed.

Shipped:
- `pro/cfn/build-template.mjs` generates `pro/cfn/tryawsnow-pro.yaml`. It copies the Tc roles and boundaries from infra/org/pool-roles.yaml and dns-account.yaml unchanged and trusts them only to the stack's instance role plus ExternalId (the stack-id UUID). The template also makes the instance role (AssumeRole on the six Tc ARNs, CheckoutLicense, two Cognito reads, PutObject on the invoices bucket), the customer and operator pools with three clients and the first operator, the invoices bucket (retained), the security group, the EIP and the IMDSv2 instance. The ImageId parameter is `AWS::EC2::Image::Id` (Marketplace substitution). cfn-lint is clean, and `--check` keeps the YAML in step with the generator.
- tc-install now: reads the client secrets with the instance role into /etc/tc/.cognito (0600); looks up the first operator's sub; writes the SST_RESOURCE_* links the web and admin apps read; and writes the worker's TC_ENV, pool, DNS and catalog settings.
- seed-pool accepts stage `pro` (test first: it failed with the old refusal text, then passed).

Bugs fixed:
- Pro could not run end to end: no Tc roles, Cognito pools or pool row; worker TC_ENV missing; seed-pool rejected `pro`; SST links missing.
- YAML 1.1 output, so `"ON"` stays a string and no aliases are written.

Security review (security-reviewer) and fixes:
- H1: the DNS roles are made only with EnableDomains=yes (default no), and the buyer must confirm a dedicated account (DedicatedAccount=yes, tagged on the instance).
- H2: nftables rejects metadata traffic from every user except root and tc-worker. The README is corrected.
- M1: the S3 backup copy moved to tc-backup-s3 (root, OnSuccess). tc-backup is denied metadata.
- L1: residual risk, the client-secret reads. A repo test pins them to the installer only.
- L2: umask 077 in the user data.
- L3: the operator CIDR can be no wider than /8 (template pattern and installer).
- L4: the shared 50-a-day Cognito e-mail quota is documented.

Tests:
- pro-cfn 19, box-layout updated; vitest 3939 passed.
- The only failure is workspace-layout's .nvmrc check (the sandbox has Node 22 and the pin is 24). It is pre-existing and unrelated.
- shellcheck: only the pre-existing SC1091 info. nft -c ok. prettier and eslint clean.

Follow-ups:
- VERIFY live: a tag-based condition on the destructive Lightsail actions (H1).
- A global daily sign-up cap and an optional SES parameter (L4).
- A test stack launch in a sandbox account.

Needs decision:
- A new AMI must be baked with this installer (about 1 cent) and copied to the seller account us-east-1 (a few cents). It replaces ami-0e2d9ec91e9f6ebb7. This needs owner approval.
- Refund rules for the $199 contract are still open.

## 2026-11-23 PRO-8 AMI rebuilt with the one-click installer (track Pro, Claude)
Owner approval: "হ্যাঁ, বানাও ও কপি করো".
- Release tc-pro-529967131d56.tar.gz (95,932,934 bytes, sha256 1b6e3553…974042). Built in 739275468267, ap-southeast-1, from base ami-09289bc217ad5e9e7. One t3.small run; the console showed TC-BAKE-OK 529967131d56 on the first try.
- The image was copied to us-east-1 and shared with 542374379351. In the seller account it was copied as **ami-0d957421c89bab25a** (Available, not encrypted, private).
- Cleanup, verified:
  - build instance terminated; security group and temporary bucket deleted;
  - both interim images in 739275468267 deregistered and their snapshots deleted (0 PRO images, 0 loose volumes in either Region);
  - the old seller AMI ami-0e2d9ec91e9f6ebb7 deregistered with its snapshot.
- Storage now: one snapshot in the seller account.

Next:
- Run "Test add version" on ami-0d957421c89bab25a.
- Switch the listing to AMI with CloudFormation (upload pro/cfn/tryawsnow-pro.yaml).
- Pricing ($199 / 36 months), the EULA, and the usage instructions.

## 2026-11-23 PRO-8 version 1.0.0 submitted, AMI with CloudFormation (track Pro, Claude)
Owner: "ok" to the Marketplace steps.

Submitted in Partner Central (seller account 542374379351): Add version 1.0.0 to prod-ill7oycvmsrme.
- AMI ami-0d957421c89bab25a. Ubuntu 24.04, user ubuntu, scan port 22, ingestion role AWSMarketplaceAmiIngestionRole.
- Delivery: **AMI with CloudFormation only**. Standalone was dropped: without the stack's roles and pools the AMI cannot run a panel.
- Template: one stack, "One-click install: TryAWS.now Pro stack". AMI parameter ImageId, recommended t3.medium.
- Usage instructions were checked against the repo: the WHMCS bridge goes through `sudo tc-install` and box/README.md; SSH only from OperatorCidr.
- Status: "Update in progress" (scan and review). The product stays Draft. Step 3 (pricing, EULA) unlocks after this.

Staging bucket `tryawsnow-pro-mp-assets-739275468267` (us-east-1, account 739275468267):
- holds 1.0.0/tryawsnow-pro.yaml and 1.0.0/architecture.png;
- public access is blocked; read is granted to assets.marketplace.amazonaws.com; TLS only; tagged Project=tryawsnow-pro;
- cost under a cent. Delete it once Marketplace has copied the files.

Architecture diagram: pro/cfn/architecture.svg and .png (1560x878, AWS icons), drawn by pro/cfn/build-diagram.py.

Risks:
- AWS asks that the template has launched in every enabled Region (34). No launch has been done (owner approval needed; a few cents per Region).
- The portal says the diagram bucket "must be publicly accessible"; we used the service-principal grant. If the review rejects either point, fix and resubmit.

Needs decision:
- A test stack launch (cost).
- The refund policy text for the offer.

## 2026-11-23 PRO-8 diagram public, test account, refund decision (track Pro, Claude)
Owner decisions:
- Make the diagram public.
- Run one test stack.
- Refund policy: "Full refund if requested within 24 hours of purchase".

Done:
- Staging bucket: BlockPublicAcls and IgnorePublicAcls stay on. The bucket policy makes only 1.0.0/architecture.png public (checked: 200); the template stays private (403). Account 420802202031 may read the template.
- New member account **420802202031** "tryawsnow-pro-test" (aws+tryawsnow-pro-test@ticonsys.com, OrganizationAccountAccessRole), created in the TiCON organization. Free; nothing runs in it.
- ami-0d957421c89bab25a shared with 420802202031.

Not done: the test stack.
- 739275468267 already holds the SaaS Tc roles with the same names, so the template cannot run there.
- The management console session is the root user, and root cannot switch roles ("Invalid information in one or more fields").
- The Mac CLI is publicpulse@739275468267, which the member role does not trust.
- Needs the owner to sign in to the test account (root password reset on its e-mail) or another identity that can assume the role. No resource was created by the failed attempt.

Finding: BlessBit Multicast (prod-7wxlkru2v4efc) is Limited, not Public. Step 4 of the listing is not started:
- the buyer-onboarding landing page (ResolveCustomer);
- the entitlement integration;
- a $0 private test offer.
AWS reviews these before a visibility change to Public.

## 2026-11-23 14:35 PRO-8 template test launch passed (track Pro, Claude)
Owner: "হ্যাঁ, চালু করে টেস্ট চালাও".

How it ran:
- The owner's console in the management account is root, which cannot switch roles. The test therefore ran as a SERVICE_MANAGED StackSet from 542374379351. Trusted access was already on (an existing service-managed stack set uses it); no org setting changed.
- Targets: OU r-56af with an Intersection filter of account 420802202031 only, us-east-1 only, automatic deployment off.
- Template: a test variant of 1.0.0/tryawsnow-pro.yaml. The only change is its own VPC, public subnet, IGW and route in place of the VpcId/SubnetId parameters, because the new account's VPC IDs are not visible from the management account. cfn-lint clean.
- Parameters: EnableDomains=yes (so the DNS roles were created too), DedicatedAccount=yes, OperatorCidr 203.0.113.7/32, placeholder domains pro-test-*.tryaws.now (no DNS records), OperatorEmail aws+tryawsnow-pro-test@ticonsys.com.

Result: **CREATE SUCCEEDED** (14:25:51 to 14:29:43). Every resource was created, including the Tc and DNS roles, both Cognito pools, the first operator, the bucket, the EIP and the instance from ami-0d957421c89bab25a.
- Not verified: the first-boot installer. There is no access to the test account's console or instance from here.

Cleanup:
- DELETE SUCCEEDED 14:33:40, then the stack set was deleted.
- Left in 420802202031 by the template's Retain policy: two Cognito user pools (deletion protection on) and the empty invoices bucket. Both are free.
- Test template removed from the staging bucket; test read grants removed from its policy.
- Cost: about 8 minutes of t3.medium plus EIP, well under a cent.

## 2026-11-23 15:15 PRO-8 version 1.0.0 failed, template made public (track Pro, Claude)
- Partner Central request 96ac7dyurapxaq5ut7gmygkf8 "Add version 1.0.0" **Failed** at 14:05: INVALID_TEMPLATE_URL, "Can't access template ... Ensure the template is publicly accessible." The service-principal grant is not enough; the template URL itself must be public.
- Fix: bucket policy statement PublicDiagramOnly renamed PublicListingAssets and now also allows public GetObject on 1.0.0/tryawsnow-pro.yaml (no secrets; the same file is in the public repo). Checked: HTTP 200, 34,441 bytes. Cost: negligible.
- Resubmission started in the console (version 1.0.0, AMI with CloudFormation only, ami-0d957421c89bab25a, Ubuntu 24.04, user ubuntu, port 22). Interrupted: another Chrome extension's autofill popup took over the tab. To finish: template URL https://tryawsnow-pro-mp-assets-739275468267.s3.amazonaws.com/1.0.0/tryawsnow-pro.yaml, diagram 1.0.0/architecture.png, AMI parameter ImageId, recommended t3.medium, usage instructions pointing to docs/pro-edition.md.

## 2026-11-23 15:30 PRO-8 version 1.0.0 resubmitted (track Pro, Claude)
Owner: "ok koro ja kora dorkar kichu additional bill jate na ase".
- Resubmitted Add version 1.0.0 at 15:20: AMI with CloudFormation only, ami-0d957421c89bab25a, Ubuntu 24.04, user ubuntu, port 22, AWSMarketplaceAmiIngestionRole, t3.medium, template and diagram from the public S3 URLs, AMI parameter ImageId. Usage instructions were checked against the template (outputs PublicIp/AdminUrl) and docs/pro-edition.md (WHMCS path /opt/tc/current/whmcs/modules/addons/tryawsnow/).
- Status "Preparing" after 8 min; it passed the point where the first attempt failed (template URL check).

## 2026-11-23 16:15 PRO-8 version 1.0.0 second failure and third submission (track Pro, Claude)
- Second attempt (15:20) failed at 16:07: INVALID_IMAGE_TYPE "Architecture diagram must be PNG or JPEG". Cause: S3 object 1.0.0/architecture.png had Content-Type binary/octet-stream. Fixed in place (CopyObject, image/png; template set to application/x-yaml). Both still public (200).
- Third submission at ~16:15 with the same values. Follow-up check scheduled in 60 min.
- Listing images: 8 JPGs (780x439) in s3://tryawsnow-pro-mp-assets-739275468267/listing-images/ (public read for that prefix). Saving them is blocked while a product request is in progress ("This product is being updated by another request"); add them after.
- Upload rule for next time: always set ContentType when putting listing files in S3.

## 2026-11-23 18:10 PRO-9 version 1.0.1 prepared: installer fix, working licence check, credential rotation (track Pro, Claude)
Owner: "1.0.1-এর প্রস্তুতি নাও ... লাইসেন্স ম্যানেজার চালু করো, সব কিছু তুমি করো". Publish of 1.0.0 was submitted at 17:33 and is in AWS review.

Found in the 1.0.0 release (built from 5299671):
- tc-install.sh line 133 `ask TC_ACME_EMAIL"Email ...` (missing space). Under `set -u` the call aborts with "$3: unbound variable", so the first-boot install of 1.0.0 stops at the answers step. Reproduced with bash. The stack test of 14:25 did not reach the installer, so this was not seen.
- The release had no `box/product-sku`, so the worker never called License Manager.
- The entitlement form was wrong. Measured in 739275468267 against the $0 test agreement agmt-6w0f5fjbbooi3s2d5tbmcsqek (licence l-fe85a58c125c43ec8891f970123466fd): ProductSKU is the product id `prod-ill7oycvmsrme`; entitlement "pro" is Unit Count, MaxCount 1. Unit None -> NoEntitlementsAllowedException; Unit Count Value 1 -> allowed; CheckInLicense -> ok.
- No credential rotation procedure (AWS Marketplace AMI usage-instruction requirement).

Done (branch pro-1.0.1-licence-rotate):
- Typo fixed; repo test that every `ask` call is `ask KEY "question"`; `bash -n` test.
- `pro/box/product-sku` = prod-ill7oycvmsrme (copied into the release by make-release.sh).
- licence-aws.ts: Count/1 checkout, immediate CheckInLicense, fallback to Unit None, no retry on throttling/access errors; 5 unit tests. Instance role: + license-manager:CheckInLicense.
- `tc-install --rotate`: new values for every generated secret, SCRAM verifiers for the five app roles on stdin (same rule as tc_owner, H1), old file kept root-only until the run succeeds. docs/pro-edition.md "Rotating credentials".
- AWS: License Manager service-linked role created in 739275468267 (free) to read the test licence.
- Tests: pro-cfn 24/24, pro/worker 66/66, tsc clean, prettier/eslint clean on changed files. `pnpm verify --quick` did not finish in 10 minutes here.

Not yet verified: `--rotate` against a real PostgreSQL (planned on the 1.0.1 test instance).

Needs decision (owner): bake the 1.0.1 AMI (one t3.small for 15-30 min, about 1-2 cents, plus copy to us-east-1) and one end-to-end launch of the stack in the test account (about 15 minutes of t3.medium + EIP, under 5 cents), then delete the 1.0.0 seller AMI snapshot once 1.0.1 is ingested.
