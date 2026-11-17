# TiCON Cloud on AWS: MEGA PLAN

Version 1.2, 2026-11-11. Launch target: Tuesday 2026-11-17.
Owner: S M Moshiur Rahman, TiCON System Limited. Builder: Claude Code with the TiCON dev team.

This one file is the source of truth for the product, the launch and the build. It replaces `TICON_CLOUD_LIGHTSAIL_BUILD_PLAN.md`: the full text of that file (version 0.3) is Part 3 here, with the same section numbers.

| Part | Sections | What it holds | Who reads it |
| --- | --- | --- | --- |
| 1. Start here | A to G | What to give Claude Code, how to set it up for speed, the task backlog, the prompts, the contracts between tracks, the verification gates | Moshiur, every developer, Claude Code at bootstrap |
| 2. Product and launch | H to O | Product brief, metrics, day-by-day timeline, roles, go/no-go, go-to-market, operations, risks, roadmap | Moshiur, leads; Claude Code when a task needs it |
| 3. Build specification | 0 to 18 | Architecture, security rules, data model, pricing, wallet and EPS, provisioning, lifecycle, admin, work packages, screens | Claude Code, per task |
| 4. Appendices | P to U | Ready text for `CLAUDE.md`, settings, hooks, rules, skills, subagents, templates, glossary | Claude Code at bootstrap |

Changes against build plan 0.3, all made in this version:

| Where | Change |
| --- | --- |
| Part 1, Part 2, Part 4 | New |
| 3.1, 6.3 | The staging control plane moves to its own AWS account (`tc-platform-stg`), so developer machines and Claude Code never hold credentials that reach production |
| 3.2, 5, 9.3 | New function `invoice-renderer`: invoice PDFs are rendered from HTML by headless Chromium, because Bengali text needs real text shaping |
| 0, 2, 16.2 | `CLAUDE.md` stays short. Full rule text lives in path-scoped rule files and in generated `docs/spec/` files (Appendix P to S) |
| 4, 5 | CI and deploy row; `.claude/`, `docs/spec/`, `verify/` and `docs/runbooks/` in the layout |
| 14, 15, 17 | Pointers to the task backlog and the gates; one more security check; open items for roles and for Amazon SES production access |

Version 1.1 applies the corrections of the pre-flight audit of 2026-11-11. The findings and their evidence are in `docs/audit/2026-11-11-mega-plan-audit.md`. The exact edits are in `docs/audit/2026-11-11-corrections.json`, and `docs/audit/2026-11-11-apply-corrections.mjs` applies them to version 1.0.

Version 1.2 changes three things that the first build of the repository kit showed, and adds one open item: the kit paths of CODEOWNERS (B.2, E.1), the format check in gate M0 and in CI (C.7, G), one sentence about `pool_capacity` (3.3), and an open item about the sandbox of the Claude Code kit (Section 17). Each change and its reason is in `docs/audit/2026-11-11-plan-1.2-changes.md`.

# Part 1. Start here

## A. Read this first

What is being built: TiCON Cloud, a prepaid self-service cloud panel for Bangladesh. Every resource a customer buys is an Amazon Lightsail resource on AWS, and customers are told so openly. They pay in taka through EPS into a wallet and buy 30-day terms. Part 2 Section H has the product brief.

Three things make this build fast with Claude Code, and the rest of Part 1 sets them up:

| Lever | What it means here | Where |
| --- | --- | --- |
| Small context per session | One task per session. Claude Code reads the task row, the listed spec files and nothing else. `CLAUDE.md` is under 200 lines; the long text is this file, split into `docs/spec/` | C, E, Appendix P |
| A check Claude can run | Every task has a proof (a test or a command) and every day has a gate (`pnpm verify --gate M2`). Claude works until the check passes and shows the output | E, G |
| Parallel tracks that do not collide | Four tracks in separate git worktrees, joined by the contracts of Section F. Pull requests are small and reviewed by a second, fresh session before a human looks | C, F |

Order of work on the first morning:

1. Moshiur and DevOps complete Section B (what Claude Code needs).
2. One developer runs the bootstrap prompt of Section E.1. It creates the repository kit from the appendices.
3. Each track starts its first task with `/wp-start <task id>` (Section E.3).
4. At 21:00 the lead runs the day's gate (Section G) and Moshiur answers the open "Needs decision" items.

## B. What to give Claude Code

Claude Code works only with what is on the developer's machine and in the repository. This section is the complete list. Nothing on it is optional unless marked.

### B.1 Files in the repository before the first session

| Item | Where it goes | From |
| --- | --- | --- |
| This file | `TICON_CLOUD_MEGA_PLAN.md` in the repository root | Moshiur |
| The mockup zip, unpacked | `design/mockup/` (the `template`, `order-form`, `whmcs-template`, `email`, `newsletter`, `graphic`, `documentation` folders) | Moshiur |
| TiCON Cloud logo as SVG for dark and light backgrounds, favicon | `design/brand/` | Dev team, from the `ticoncloud` site repo |
| Sample TiCON Cloud invoice (PDF) | `design/reference/invoice-sample.pdf` | Moshiur |
| The team's `eps-payment-gateway` skill folder, copied without any `.env*` file (the skill's README says that `assets/.env.production` holds live credentials of another project) | `.claude/skills/eps-payment-gateway/` | Dev team |
| Legal texts when ready: terms, acceptable use, privacy, refund, domain registration agreement | `content/legal/<doc>.<locale>.mdx` | Moshiur with the legal adviser |

### B.2 Accounts and access

| Access | Scope to give | Scope never to give |
| --- | --- | --- |
| GitHub | One private repository (for example `TiCON-Project/ticoncloud-platform`), `gh` signed in on each developer machine. Branch protection on `main`: pull request required, CI checks required, CODEOWNERS review on money and security paths and on the kit (`.claude/`, `CLAUDE.md`, `.github/`, `scripts/`, `verify/`, `tests/repo/`, `TICON_CLOUD_MEGA_PLAN.md` and the root files `package.json`, `pnpm-workspace.yaml`, `eslint.config.mjs`, `vitest.config.mjs`, `tsconfig.base.json`, `.prettierrc.json`, `.prettierignore`, `.gitleaks.toml`, `.gitignore`, `.worktreeinclude`) | Organization admin rights; permission to push to `main` |
| AWS, staging control plane | An IAM Identity Center permission set on the account `tc-platform-stg` that can deploy the SST app. Used as a named CLI profile, for example `tc-stg` | Any access to `tc-platform` (production), the management account, `tc-pool-v1`, `tc-pool-n1` |
| AWS, test pool | A permission set on `tc-pool-dev` limited to Lightsail, used by integration and isolation tests | Any other pool account |
| AWS, DNS for tests | Permission on `tc-dns` to manage test hosted zones only. Domain registration stays with DevOps | `route53domains:RegisterDomain` from a developer machine |
| Production deploys | None from a machine. Production is deployed by GitHub Actions through an OIDC role after a manual approval | Long-lived AWS keys anywhere (R3) |
| Organization setup (accounts, OUs, SCPs, pool roles) | Claude Code writes the templates in `infra/org/`. DevOps reviews and applies them from the management account | The management account credentials |
| Domain and email | DNS records for `my.`, `ops.` and the staging names; SES domain identity with DKIM for `ticoncloud.com`. Created by the IaC where the zone is in Route 53, otherwise DevOps first validates an ACM certificate in us-east-1 for these names, the apps use `domain: { name, dns: false, cert }`, and DevOps adds CNAME records to the CloudFront domain names after the deploy | Registrar account password |
| EPS | Staging and production credentials as SST secrets (B.3). A test customer account with a small real balance for end-to-end payments | Credentials in a prompt, a file in the repo, or a chat |
| SMS provider | API key as an SST secret, sender id as config, two test phone numbers | Same as EPS |

### B.3 Secrets: set by a person, never shown to Claude Code

A person types these into their own terminal with `npx sst secret set <Name> <value> --stage <stage>` (confirm the syntax in the SST docs). Claude Code knows only the names. Production values are set only by a named administrator of `tc-platform`, because `--stage production` needs credentials for `tc-platform`, which no developer machine may hold (3.1): in a short-lived IAM Identity Center session, from AWS CloudShell or from a machine that runs no Claude Code session, before the first production deploy, noted in `JOURNEY.md` without the values. The project settings deny `sst secret` and `sst shell` commands and reads of `.env` files (Appendix Q). These rules match one spelling of a command and are not a boundary (C.2): anyone, or any session, with the staging profile can read the staging secrets.

| Secret name | Stages | Set by |
| --- | --- | --- |
| `EpsMerchantId`, `EpsStoreId`, `EpsUsername`, `EpsPassword`, `EpsHashKey` | staging, production (separate values) | Moshiur or the lead |
| `SmsApiKey` | staging, production (separate values) | Lead |
| None for pool accounts: each ExternalId is a plain column of `pool_accounts`, so adding a pool needs no secret and no deploy | - | DevOps |

Generated by the infrastructure code, never typed by anyone: the HMAC key for order draft tokens, the OTP hashing key, KMS keys, database passwords.

### B.4 Decisions and values Claude Code needs as config

| Value | Default in this plan | Owner |
| --- | --- | --- |
| Panel and admin domains | `my.ticoncloud.com`, `ops.ticoncloud.com`; staging `my-stg.` and `ops-stg.` | Moshiur |
| FX rate for market BD | 127 as the test value. The real rate is set by a `finance` admin before beta | Moshiur |
| Top-up minimum, maximum and quick amounts | Open (Section 17) | Moshiur |
| Launch Regions | Singapore `ap-southeast-1`, Mumbai `ap-south-1` | Decided |
| Pool account ids and real quotas | Entered in `pool_accounts` and `pool_capacity` by DevOps | DevOps |
| Admin IP allowlist, on-call list | Open (Section 17) | Moshiur |
| Support phone, support email, sender names | Open (Section 17) | Moshiur |
| Company details on invoices | Name and address from Section 1; BIN and other registration numbers from the sample invoice | Moshiur |
| Color scheme, numerals | Mockup colors; Bengali numerals (Section 17) | Moshiur |

### B.5 Tools on each developer machine

| Tool | Note |
| --- | --- |
| Claude Code, current version | Auto mode is the starting permission mode from v2.1.283. Check with `claude --version` |
| Node.js | Node.js 24, the Lambda runtime `nodejs24.x` and the SST default; Node.js 26 is only a preview runtime on Lambda this month. Pin it in `.nvmrc` and `package.json` `engines` |
| pnpm, Git, GitHub CLI `gh`, `jq` | `jq` is used by the hook scripts |
| AWS CLI v2 | Signed in through IAM Identity Center with the profiles of B.2 |
| Docker | Runs the PostgreSQL container for integration tests |
| Playwright browsers | Installed by the repo's setup script |

### B.6 People Claude Code depends on

| Need | Who | Response time during the sprint |
| --- | --- | --- |
| "Needs decision" items in `JOURNEY.md` | Moshiur | Twice a day, 10:00 and 21:00 |
| Review of pull requests that touch money, auth, IAM or infrastructure | Lead developer | Within 2 working hours |
| AWS organization changes, quotas, DNS | DevOps | Same day |
| KYC review, support, abuse during beta and launch | Operations lead | Section M |

### B.7 What Claude Code must never receive

Production or management account credentials. Real customer data, KYC documents or a production database dump. EPS or SMS credentials in any readable form. A session started with `--dangerously-skip-permissions` or in `bypassPermissions` mode on a machine that holds AWS credentials. The theme files in a public repository.

## C. Set up Claude Code for speed

### C.1 One-time setup per machine

1. Install or update Claude Code, sign in, and open the repository folder once with `claude` to accept workspace trust.
2. Run the bootstrap prompt (E.1) on one machine only. Everyone else pulls the result.
3. Run `/permissions` and confirm the project rules loaded. Run `/sandbox` and confirm the sandbox is on (the project settings turn it on and list the commands that run outside it). Run `/hooks` and confirm the three hooks of Appendix Q are listed.
4. Run `/context` and confirm `CLAUDE.md` is loaded and small.
5. Optional plugins through `/plugin`: a TypeScript code intelligence plugin, and Superpowers if the team already uses it (its planning, test-first, worktree and review skills fit the loop of C.3).

### C.2 Permission modes by activity

| Activity | Mode | How |
| --- | --- | --- |
| Planning a task | Plan | `claude --permission-mode plan`, or `Shift+Tab` until the status bar shows plan mode. `Ctrl+G` opens the plan in an editor |
| Implementing a task | Auto, with the sandbox on and the allow and deny rules of Appendix Q | Default from v2.1.283, or `--permission-mode auto` |
| Unattended batch work (for example translating message files) | `dontAsk` with an explicit tool list | `claude -p "<prompt>" --allowedTools "Read,Edit,Bash(pnpm test *)" --permission-mode dontAsk` |
| Never | `bypassPermissions` | Disabled in project settings |

Deny rules and hooks are guard rails. The real boundary is what the AWS profile can reach (staging and the test pool only) and what branch protection allows. With the sandbox on, the `Read` and `Edit` deny rules also bind every sandboxed command: a sandboxed `pnpm spec:split` cannot write `docs/spec/`, a sandboxed test cannot read `.env.local`, and a sandboxed `git merge` over those paths fails with `unable to unlink old`. The `sandbox.excludedCommands` list of Appendix Q runs these commands outside the sandbox.

### C.3 The loop for every task

1. Run `git fetch origin` in the main checkout, then start a fresh session in its own worktree: `claude --worktree wp3-t1 --permission-mode plan`. The worktree lives in `.claude/worktrees/wp3-t1/` on branch `worktree-wp3-t1`. Run `pnpm install` there.
2. Type `/wp-start WP3-T1`. Claude reads the task row, the spec files named for its work package and the last entries of `JOURNEY.md`, then writes a plan: files, interfaces consumed and produced, tests, open questions.
3. Read the plan. Fix it or approve it. Leave plan mode.
4. Claude writes the failing tests first, runs them, implements, and runs them until they pass. For long tasks set the proof as a `/goal` condition so Claude keeps going until it holds.
5. Claude runs `pnpm verify --task WP3-T1` and shows the output.
6. Claude asks the matching reviewer subagent (Appendix S) to review the diff in a fresh context, fixes what affects correctness or the spec, and ignores style opinions.
7. Claude appends a `JOURNEY.md` entry, commits with the task id, pushes, and opens a pull request with `gh pr create`. It does not merge.
8. A human reviews. Money, auth, IAM and infrastructure paths need the lead's approval (CODEOWNERS). After merge, CI deploys staging.
9. `/clear` or close the session. Never start the next task in the same context.
10. Keep the worktree until the pull request is merged. For review changes run `claude --worktree wp3-t1 --resume` (on another machine `claude --worktree "#<pr number>"`), fix, run `pnpm verify --task`, push. Remove the worktree after the merge.

### C.4 Context discipline

| Rule | Why |
| --- | --- |
| One task per session; `/clear` between tasks; name sessions with `/rename` | A focused context gives better answers and costs less |
| Never ask Claude to read this whole file after bootstrap. Point it to `docs/spec/<file>` | The file is about 170 KB |
| Use subagents for investigation ("use a subagent to find how X is done") | Exploration stays out of the main context |
| After two failed corrections of the same problem, `/clear` and restart with a sharper prompt | Failed attempts pollute the context |
| Side questions with `/btw` | The answer does not enter history |
| `CLAUDE.md` contains this line: "When compacting, keep the task id, the list of changed files and the commands that prove the task" | Project-root `CLAUDE.md` is re-read after compaction |

### C.5 Parallel work

| Track | Owns | Typical sessions in parallel |
| --- | --- | --- |
| A, core and money | `packages/core`, `packages/db`, `packages/eps`, WP0, WP1, WP3 | 1 to 2 |
| B, provisioning | `packages/aws`, `functions/*`, WP4 to WP7 | 1 to 2 |
| C, identity and UI | `packages/auth`, `packages/ui`, `apps/web`, WPU, WP2, WPP, all screens | 2 |
| D, admin | `apps/admin`, WP8 | 1 |

- One worktree per task, named after the task id. `.worktreeinclude` copies `.env.local` into each new worktree; `.claude/worktrees/` is in `.gitignore`.
- A new worktree starts from the default branch on the remote. Claude Code fetches the default branch only when the repository has not been fetched for 24 hours, so run `git fetch origin` first. A task that needs work not yet merged waits for the merge, or its driver creates the worktree with git from the branch that has the work (`git worktree add .claude/worktrees/wp3-t2 -b worktree-wp3-t2 worktree-wp3-t1`) and starts `claude` inside it. `worktree.baseRef` cannot name a branch, and in `.claude/settings.local.json` it would apply to every later worktree.
- A track edits another track's package only where its task row in E.3 puts the work there (for example `functions/catalog-sync` for track A and `packages/core/operations` for track B), and notes it in `JOURNEY.md` (Section 14). Otherwise it codes against the contract in Section F and, until the real function exists, against a typed stub with the same signature. Track B writes `packages/core/{operations,capacity,orders,lifecycle}` and `packages/notify`, with migrations reviewed by track A; each `functions/` folder belongs to the track whose task creates it.
- A contract change is its own small pull request that updates Section F first.
- A mechanical change across many files (message keys, renames) is its own task with one pull request, done in one session. `/batch` opens one pull request per unit, so use it only when the lead agrees, and never for shared files such as message catalogs.
- One person can drive two sessions. More than two per person lowers review quality.

### C.6 External tools

Prefer command line tools over MCP servers, because they cost less context: `gh` for GitHub, `aws` for read-only checks in staging, `npx sst` for deploys. No MCP server is required. If the team adds one (for example an AWS documentation server) add it with `claude mcp add --transport http <name> --scope project <url>` so it lands in `.mcp.json`, and connect only servers the team trusts: a server that returns outside content is a prompt injection path.

### C.7 Git and CI

| Rule | Detail |
| --- | --- |
| Branching | Trunk-based. One short-lived branch per task, squash merge, linear history |
| Pull request size | One task. If a diff passes about 600 changed lines outside generated files, split the task |
| CI on every pull request | Install, lint (with the import-boundary rule for R1), format check, typecheck, unit tests, integration tests against a PostgreSQL container, secret scan, dependency audit, `pnpm verify --quick`, spec split in sync |
| Deploy | Merge to `main` deploys `staging` through an OIDC role in `tc-platform-stg`. Production deploys from a tag through an OIDC role in `tc-platform` after a manual approval in a protected GitHub environment. A tag ruleset lets only the lead and DevOps create `v*` tags; the workflow fails unless the tagged commit is on `main`; the environment `production` accepts only `v*` tags and needs a reviewer other than the tagger. The `tc-platform` role trusts only `sub` = `repo:<org>/<repo>:environment:production`, the staging role only `repo:<org>/<repo>:ref:refs/heads/main`. CODEOWNERS (E.1) covers, among its other paths, `.github/`, `infra/`, `sst.config.ts` and `.claude/` |
| Migrations | Forward-only, run by the `migrator` function during deploy (R15) |
| Commit messages | `WP3-T1: <what changed>` |

## D. Rules for every session

These go into `CLAUDE.md` (Appendix P).

1. Work on exactly one task id. If the task needs something outside its scope, write it in `JOURNEY.md` and stop.
2. Tests first for logic in `packages/core`, `packages/db`, `packages/eps` and `packages/aws`. A task without a passing proof is not done.
3. Show evidence: the command and its output. Never write "should work".
4. Stop and write a "Needs decision" entry instead of guessing when any of these appear: a rule of Section 2 or 16.2 blocks the task; a price, tax or wallet rule is unclear; an AWS API behaves differently from the spec; data would be deleted; a new dependency for auth or crypto is needed; legal wording is needed; anything would run against production.
5. Never read or print secrets. Never run `sst secret`. Never deploy to production. Never touch the management account.
6. Never edit `design/mockup/`, generated `docs/spec/` files, or a migration that is already merged.
7. Use the contracts of Section F as written. Change them only through a pull request that edits this file.
8. Customer-facing text follows Section 16.13: AWS is named with the exact statements; account ids, ARNs and raw AWS errors are never shown.
9. Check AWS, SST, Next.js, Cognito and EPS details against current documentation before using them. Record each VERIFY result in `JOURNEY.md`.

## E. Backlog and prompts

### E.1 Bootstrap prompt (first session, once)

```text
Read TICON_CLOUD_MEGA_PLAN.md completely. This is the only session that reads it whole.

Then do task WP0-T1:
1. Create the monorepo skeleton of Section 5 (pnpm workspaces, TypeScript strict, ESLint with an
   import-boundary rule that enforces R1, Prettier, Vitest). Exclude .claude/worktrees/ in the ESLint, Vitest,
   Playwright and TypeScript configs: those tools do not read .gitignore.
2. Create CLAUDE.md, .claude/settings.json, the hook scripts, .claude/rules/, .claude/skills/,
   .claude/agents/, .worktreeinclude, .gitignore, .github/CODEOWNERS (owned by the lead and the second reviewer: money, auth, IAM and infrastructure paths including infra/, sst.config.ts and packages/db/migrations/, and the kit: .claude/, CLAUDE.md, .github/, scripts/, verify/, tests/repo/, TICON_CLOUD_MEGA_PLAN.md and the root files package.json, pnpm-workspace.yaml, eslint.config.mjs, vitest.config.mjs, tsconfig.base.json, .prettierrc.json, .prettierignore, .gitleaks.toml, .gitignore, .worktreeinclude), JOURNEY.md and the pull request template exactly
   from Appendices P to T. Write .claude/settings.json after step 4, as the last kit file, so its hooks
   do not run before scripts/verify.mjs exists.
3. Write scripts/split-plan.mjs and run it so docs/spec/ holds one file per section of this plan,
   each with a "GENERATED, do not edit" header. File name: <id>-<slug>.md, where the id is the
   section letter or the two-digit section number and the slug is the heading in lower case, with every run of
   characters outside a-z and 0-9 replaced by one hyphen and no hyphen at either end (E-backlog-and-prompts.md,
   08-pricing-engine.md, 09-wallet-ledger-and-eps.md). A section over 150 lines also gets a
   folder <id>/ with one file per subsection. docs/spec/INDEX.md lists every file with its heading.
   A heading inside a fenced code block is not a section boundary.
4. Write scripts/verify.mjs and verify/baseline.json as Section G specifies. Fill the baseline
   from this plan: the pricing vectors of Section 8, the tables of Section 7, the routes and
   priorities of Section 16, the theme allow-list of 16.3, the secret names of B.3.
5. Add the CI workflow of C.7.
6. Run pnpm verify --gate M0 and show the output. Open a pull request, run gh pr checks --watch
   and show the result. Stop.

Do not create application code, AWS resources or migrations in this task.
```

### E.2 Prompts for the rest of the sprint

| Use | What to type |
| --- | --- |
| Start a task | `/wp-start WP3-T1` in a fresh worktree session started in plan mode |
| Prove a task or a gate | `/wp-verify WP3-T1` or `/wp-verify M2` |
| End a session with unfinished work | `/handoff` |
| Second opinion on money code | `Use the money-reviewer subagent to review this diff against docs/spec/08 and docs/spec/09. Report only gaps that affect correctness or the spec.` |
| Second opinion on security | `Use the security-reviewer subagent on this diff. Check R1 to R17 and the cross-tenant test for every new endpoint.` |
| Check a screen against the plan | `Use the spec-checker subagent: compare apps/web/app/servers against docs/spec/16 rows for /servers. List missing states, actions and messages.` |
| Answer a blocked task | Paste the decision under the item in `JOURNEY.md`, then `claude --worktree <task> --resume` and say: `The decision for item N is recorded in JOURNEY.md. Continue.` |
| Explain a failure | `The gate M2 fails with this output: <paste>. Find the root cause with a subagent, write a failing test that reproduces it, then fix it.` |

### E.3 Task backlog

Each row is one session-sized task. "Read" names the spec sections the task needs; the same list is in the `/wp-start` skill. Screens are in the task of their data unless a row says otherwise. Days follow Section 14.

**WP0 Foundation (Wed 11, track A with DevOps). Read: 2, 3, 4, 5, 6.3, Appendices.**

| Task | Output | Proof |
| --- | --- | --- |
| WP0-T1 | Repository kit: skeleton, `CLAUDE.md`, `.claude/`, `docs/spec/`, verify script and baseline, CI | `pnpm verify --gate M0` green locally and in CI |
| WP0-T2 | SST app with stages, VPC with two AZs and NAT, hello page behind CloudFront and WAF | `npx sst deploy --stage staging` succeeds; page loads through CloudFront; a direct request to the function URL gets 403 |
| WP0-T3 | RDS PostgreSQL with RDS Proxy, roles `web_rw`, `admin_rw`, `worker_rw`, `migrator`, `report_ro`, TLS forced, `migrator` function | A connection from the internet fails; a connection without TLS through the proxy is refused; the instance shows 14-day backup retention and deletion protection on; `migrator` runs an empty migration |
| WP0-T4 | Cognito pools for customers and admins (admin TOTP required, email sent through SES), SQS FIFO queue with dead-letter queue, buckets `kyc`, `invoices`, `exports`, alarms to SNS | Deployed outputs listed by `pnpm verify --task WP0-T4` |
| WP0-T5 | `infra/org/`: templates for accounts, OUs, SCPs, the roles of Section 6.3, the organization CloudTrail trail, GuardDuty in every account and the security alternate contact of each pool account (3.3, Section 15). Applied by DevOps, not by Claude Code | DevOps confirms in `JOURNEY.md`; a test proves the staging web role cannot assume `TcProvisioner` |
| WP0-T6 | By Fri 13: the production control plane deployed once through CI with every feature flag off; SES production access requested on Wed 11 | A tag deploy succeeds after approval; the production web role cannot assume any pool role |

**WP1 Data and pricing (Wed 11, track A). Read: 2 (R4, R5, R8, R15), 7, 8.**

| Task | Output | Proof |
| --- | --- | --- |
| WP1-T1 | Drizzle schema and migrations for every table of Section 7, constraints, ledger balance trigger, grants | No application role can UPDATE or DELETE an (A) table; `web_rw` cannot set `operations.approved_by` or write admin-owned tables; unbalanced transaction is rejected; `select current_user` from the deployed `web` function returns `web_rw` |
| WP1-T2 | Tenant-scoped repositories and a cross-tenant test helper used by every later endpoint | Helper proves customer A cannot read or write customer B rows |
| WP1-T3 | Pricing engine in `packages/core/pricing` | All Section 8 vectors pass, including both extra vectors |
| WP1-T4 | Markets, FX rates, pricing rules (append-only), feature flags, preview of five products | A new rate never changes a stored order; preview equals engine output |
| WP1-T5 | `catalog-sync` function and config prices, with the read-only STS and Lightsail client in `packages/aws` that WP4-T1 then extends | Catalog holds real plans from `tc-pool-dev` with BDT prices; no active instance plan is IPv6-only; TLD prices loaded |

**WP2 Identity (Wed 11, track C). Read: 2 (R8, R9, R14, R16), 3.3 (the `kyc` bucket), 6.1, 16.9, 16.10 settings rows, 16.13.**

| Task | Output | Proof |
| --- | --- | --- |
| WP2-T1 | `packages/auth`: token verification, cookie session, `requireCustomer`, fresh sign-in check | A tampered or expired token is rejected; cookies are `HttpOnly`, `Secure`, `SameSite=Lax` |
| WP2-T2 | `/signup`, `/verify` (email), `/login`, `/forgot-password`, `/reset-password` | Playwright completes sign-up to sign-in in `bn` at 360 px |
| WP2-T3 | Phone OTP with the SMS provider adapter | Limits hold: 5 attempts, 3 sends per hour per number and per IP; codes are stored hashed |
| WP2-T4 | `/kyc`: presigned upload, submission, status | The web role cannot read a KYC object; a staging-only seed command marks a test customer `verified` until `approveKyc` exists (WP8-T2); the proof that no resource is created before `verified` runs in WP4-T4 |
| WP2-T5 | `/settings/profile`, `/settings/security` | Email or phone change needs a fresh sign-in and a new verification |

**WPU UI kit and shells (Wed 11, track C, second session). Read: 16.1 to 16.7, 16.13, 16.16.**

| Task | Output | Proof |
| --- | --- | --- |
| WPU-T1 | `scripts/sync-theme.ts`, theme assets, `tc.css`, the composite font family | Build output has no file from the theme's `assets/js`; Bengali renders with Noto Sans Bengali |
| WPU-T2 | Kit, part one: `Card`, `Button`, `Field`, `Badge`, `Tabs`, `Accordion`, `Modal`, `ConfirmDestroy`, `Toast`, `DataTable` | Gallery page shows each in `bn` and `en` |
| WPU-T3 | Kit, part two: the remaining components of 16.6 | Same |
| WPU-T4 | Four shells, `next-intl` setup, AWS statements and footers, `/dev/ui`, CSP in report-only mode | The 16.16 checks that apply to the gallery pass; the `next build` route table shows every page as dynamic |

**WP3 Wallet and EPS (Thu 12, track A; screens with track C). Read: 2 (R4 to R7, R16), 3.2, 3.4, 8, 9, 16.10 dashboard, wallet and invoice rows, 16.13, the `eps-payment-gateway` skill.**

| Task | Output | Proof |
| --- | --- | --- |
| WP3-T1 | Ledger: accounts, `postTransaction`, wallet balance cache, nightly balance check | Balance equals the sum of entries; a wallet cannot go negative |
| WP3-T2 | `packages/eps` client and payment state machine, return handlers under `/pay/eps/` | Replay, forged success URL, amount mismatch and double callback tests credit nothing extra |
| WP3-T3 | `payments-sweeper` function | A payment whose browser never returned is credited by the sweeper once; old ones expire |
| WP3-T4 | `/wallet`, `/wallet/topup`, `/wallet/topup/[paymentId]` | A real top-up on staging credits once and shows the new balance |
| WP3-T5 | Invoices and receipts: numbering, `invoice-renderer`, `/invoices` | PDF matches the sample layout; Bengali text is shaped correctly (VERIFY) |

**WP4 Provisioning core (Thu 12 to Fri 13, track B; screens with track C). Read: 2 (R1, R3, R7, R11, R13), 3.2, 3.4, 6.3, 10, 16.10 server rows, 16.11.**

| Task | Output | Proof |
| --- | --- | --- |
| WP4-T1 | `packages/aws`: STS client with ExternalId, Lightsail client factory, AWS error mapping, retries | The web bundle cannot import it (lint); errors map to platform codes |
| WP4-T2 | Operations engine: table, states, FIFO enqueue, `provisioner` step runner, dead-letter alarm | A step retried three times creates one resource; an operation with a wait step completes on the real FIFO queue in staging; an operation committed without a queue message is picked up within 3 minutes |
| WP4-T3 | Capacity: reservation inside the purchase transaction, release, waitlist | Two concurrent orders for the last slot: one succeeds, one gets the waitlist |
| WP4-T4 | Orders: draft token, `placeOrder`, purchase transaction, automatic reversal on failed create | Double submit with one idempotency key charges once; a failed create refunds once; an order from a customer who is not `verified` is refused and creates no resource |
| WP4-T5 | Linux instance adapter with key import, static IP and ports | A paid order on staging yields a running instance reachable by SSH with the customer key |
| WP4-T6 | Bootstrap firewall template and the isolation test | `tests/isolation` passes in `tc-pool-dev` |
| WP4-T7 | `/servers`, `/servers/new`, `/orders/review`, `/orders/[id]`, tabs Overview, Access, Networking, `/settings/ssh-keys` | Playwright creates a server at 360 px in `bn` against staging |

**WP5 Instance extras and lifecycle (Fri 13, track B; screens with track C). Read: 3.2, 6.3, 8, 9.1, 9.3, 10.3, 11, 16.10, 16.14.**

| Task | Output | Proof |
| --- | --- | --- |
| WP5-T1 | Backups, automatic backups, restore to a new server | Restore creates a working server from a snapshot |
| WP5-T2 | Block storage adapter | Create, attach, detach, destroy cycle passes |
| WP5-T3 | `reader` function: live state, metrics, transfer use, with its own tenant check | Customer A cannot read customer B's metrics |
| WP5-T4 | Lifecycle engine with an injectable clock, `scheduler` function | One test instance passes renew, grace, suspend, final snapshot, destroy, restore, purge on the test clock |
| WP5-T5 | `packages/notify`: email through SES, SMS, in-app, templates in `bn` and `en` | Every trigger of 16.14 sends once; no secret in any message |
| WP5-T6 | Tabs Backups, Storage, Metrics, Billing, Destroy; `/dashboard` complete; `/notifications` | Destroy needs the typed name and a fresh sign-in |

**WP6 Gate A (Sat 14, track B). Read: 10.3, 10.4, 16.10 rows of each family.**

| Task | Output | Proof |
| --- | --- | --- |
| WP6-T1 | Windows instance adapter and the `access-details` function | Password is shown once and never stored; bootstrap passes the isolation test |
| WP6-T2 | Managed database adapter and screens | Create, stop, start, snapshot, destroy cycle on the test clock |
| WP6-T3 | Load balancer adapter and screens | Targets limited to the customer's own servers in the same location |
| WP6-T4 | Object storage adapter and screens | Secret key shown once; suspend removes access |

**WP7 Gate B and metering (Sun 15, track B). Read: 10.3, 11 (metered items), 12, 16.10.**

| Task | Output | Proof |
| --- | --- | --- |
| WP7-T1 | Container service adapter and screens | Cycle passes; no registry login is ever issued |
| WP7-T2 | CDN adapter and screens | Cycle passes |
| WP7-T3 | DNS zones and record editor | Apex NS and SOA are read-only; records validate per type |
| WP7-T4 | Domains: search, registration with contact, verification state, renewal | Second confirmation repeats the name; TLDs with extra parameters go to admin review |
| WP7-T5 | Metering: snapshot storage per day, data transfer | Daily charge equals GB x price / 30; 80% and 100% notices sent |
| WP7-T6 | `reconciler`: inventory hourly, cost daily, payments | Zero unexplained resources; cost variance under 2% on the latest day Cost Explorer has data for |

**WP8 Admin (Sat 14 to Sun 15, track D). Read: 2 (R10), 6.2, 13, 16.12.**

| Task | Output | Proof |
| --- | --- | --- |
| WP8-T1 | Admin app: shell, sign-in with TOTP, roles, audit of every action, WAF allowlist | No MFA means no sign-in; outside the allowlist gets 403; a direct request to the admin function URL gets 403 |
| WP8-T2 | Customers and KYC review | Document images come through short-lived URLs and are never cached |
| WP8-T3 | Wallets, payments, adjustments with second approval | An adjustment above the limit waits for a second admin |
| WP8-T4 | Pricing, catalog and flags | Saving a rule shows the five-product preview first |
| WP8-T5 | Capacity and the operations queue | A destructive operation runs only after approval (R13) |
| WP8-T6 | Audit search and admin users | Every admin action has an audit row |
| WP8-T7 | Support, abuse, reconciliation (P1) | Listed in 16.12 |

**WPP Public pages (Sat 14, track C). Read: 16.7, 16.8, 16.13, H, L.**

| Task | Output | Proof |
| --- | --- | --- |
| WPP-T1 | `/`, `/pricing`, `/products/cloud-servers` from the live catalog | Prices equal the pricing engine output |
| WPP-T2 | `/help`, `/support`, `/legal/[doc]`, system pages | The four required FAQ answers are present; AWS statements and trademark line on every page |
| WPP-T3 | Metadata, structured data, sitemap, robots, `hreflang` | Public pages indexable, panel `noindex`; Lighthouse accessibility and SEO 90 or more on a phone profile |
| WPP-T4 | P1 pages of gated families with "notify me" | A flag-off family shows the coming soon page |

**WP9 Hardening (Mon 16, all tracks). Read: 15, 16.16, K, M.**

| Task | Output | Proof |
| --- | --- | --- |
| WP9-T1 | Every Section 15 item checked | Evidence for each item in `JOURNEY.md` |
| WP9-T2 | Cross-tenant and isolation sweep over every endpoint | Report with zero gaps |
| WP9-T3 | Database restore drill; purchase concurrency test | Point-in-time restore works; no double spend and no over-reservation under 50 parallel orders with stubbed adapters |
| WP9-T4 | Runbooks of Section M in `docs/runbooks/`; signed-in support form | Each runbook was walked through once |
| WP9-T5 | Wording pass in `bn` and `en`; final legal content | No untranslated key; U6 checks pass |
| WP9-T6 | Production tag deploy of the build that passed gate M5, approved by DevOps; then the beta: 10 to 20 customers with real payments on production with core flags on | Each beta customer has a verified payment and a running server |

**WP10 Launch (Tue 17). Read: K, M.**

| Task | Output | Proof |
| --- | --- | --- |
| WP10-T1 | Flags on for families that passed their gate; monitoring and on-call confirmed | `pnpm verify --gate M7` |
| WP10-T2 | First-day report at 21:00 | Payments verified, no stuck operations, no dead-letter messages, active resources counted |

Critical path for launch day: WP0, WP1, WP2, WPU, WP3, WP4, WP5, the P0 tasks of WP8 and WPP, WP9. WP7-T5 (metering) and WP7-T6 (the reconciler) are on the critical path too: no feature flag covers them, K item 8 needs the daily cost reconciliation, and core backups are charged by metering. WP6, WP7-T1 to WP7-T4 and every P1 row can slip behind their feature flags without moving the date.

## F. Contracts between tracks

These signatures let the four tracks start on day one. They are starting contracts: change one only through a pull request that edits this section, and say so in `JOURNEY.md`. Server Actions in `apps/web` and `apps/admin` are thin wrappers with the action names of Section 16; they call these functions.

```ts
// packages/core/types.ts
export type Minor = bigint;                     // money in paisa (R4)
export type Locale = "bn" | "en";
export type ErrorCode =
  | "unauthenticated" | "forbidden" | "kyc_required" | "limit_reached" | "flag_off"
  | "validation" | "insufficient_balance" | "capacity_full" | "price_changed"
  | "conflict" | "not_found" | "rate_limited" | "upstream_unavailable" | "internal";
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorCode; fields?: Record<string, string>; data?: unknown; ref?: string };
export interface Clock { now(): Date }           // injected everywhere time matters (Section 11)

// packages/core/pricing
export interface PricingStep { code: string; rate: string; base: "aws" | "subtotal"; label: Record<Locale, string> }
export interface PriceQuote {
  currency: "BDT"; fxRate: string; ruleVersion: string;
  baseMinor: Minor; steps: { code: string; amountMinor: Minor }[]; totalMinor: Minor;
}
export function quote(input: { awsPriceUsd: string; quantity?: string; fxRate: string; rule: { version: string; steps: PricingStep[] } }): PriceQuote;   // quantity for per-GB and daily prices (R4); the rule carries its version

// packages/db
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
export function customerRepos(tx: Tx, customerId: string): CustomerRepos;   // every method is tenant-scoped (R8)
export function adminRepos(tx: Tx, actor: AdminActor): AdminRepos;          // every write also writes audit_log (R10)

// packages/core/ledger
export interface Posting { account: LedgerAccountRef; direction: "debit" | "credit"; amountMinor: Minor }
export function postTransaction(tx: Tx, input: {
  kind: LedgerKind; reference: { type: string; id: string };
  idempotencyKey: string; actor: Actor; memo?: string; postings: Posting[];
}): Promise<Result<{ transactionId: string }>>;
export function walletBalance(tx: Tx, customerId: string): Promise<Minor>;

// packages/auth
export function requireCustomer(): Promise<CustomerSession>;   // customerId, kycStatus, riskTier, locale, signedInAt
export function requireFreshSignIn(s: CustomerSession, clock: Clock): Result<true>;   // 10 minutes
export function requireAdmin(roles: AdminRole[]): Promise<AdminActor>;

// packages/eps
export function startTopUp(s: CustomerSession, input: { amountMinor: Minor; idempotencyKey: string }):
  Promise<Result<{ paymentId: string; redirectUrl: string }>>;
export function verifyPayment(merchantTransactionId: string):
  Promise<Result<{ state: "credited" | "pending" | "failed" | "cancelled" | "expired" }>>;

// packages/core/orders
export function createOrderDraft(s: CustomerSession, input: unknown):
  Promise<Result<{ token: string; quote: PriceQuote; expiresAt: Date }>>;
export function placeOrder(s: CustomerSession, input: { token: string; idempotencyKey: string }):
  Promise<Result<{ orderId: string }>>;          // "price_changed" carries a new draft { token, quote, expiresAt } in `data`

// packages/core/operations
export function enqueueOperation(tx: Tx, input: {
  resourceId: string; kind: OperationKind; payload: unknown;
  idempotencyKey: string; needsApproval?: boolean;
}): Promise<{ operationId: string }>;   // inserts the row only (queued, next_run_at = now); the queue message is sent after commit

// packages/core/flags
export function isEnabled(flag: FeatureFlag, market: string): Promise<boolean>;

// packages/notify
export function notify(tx: Tx, input: { customerId?: string; email?: string; template: TemplateId; data: Record<string, unknown>; dedupeKey: string }): Promise<void>;   // inserts a `pending` row; `notifier` sends it after commit
```

`ProductAdapter` (Section 10.3) is the contract between `packages/aws` and the `provisioner`. The live read contract is one function in `functions/reader`: `describe(resourceId, caller)` and `metrics(resourceId, caller, range)`, where `caller` is `{ customerId }` or `{ adminId }`, both of which check ownership themselves, and `checkDomain(name)`, which reads no customer data.

**Reader additions: load balancer target health and database metrics (contract change WPU-Y6).** Two more read operations of `functions/reader`, both read-only and display-only. They use the same invocation event `{ action, resourceId, caller, ... }`, the same `caller` (`{ customerId }` from the `web` alias or `{ adminId }` from the `admin` alias), the same tenant check on the platform resource id, the same rate limit window per caller and the same fixed-word log line (`event` = `reader_read`, `action` = `target_health` or `database_metrics`, outcome; no id and no AWS text, R14). Order of every call (R9): authenticate, authorize (the tenant check, R8), validate, rate limit, execute, audit.

```ts
// functions/reader (shapes also exported to apps/web and apps/admin as types only)
export type MetricRange = "1h" | "1d" | "1w";     // as for `metrics`

// Load balancer target health. resourceId = the platform id of a resource of family `load_balancer`.
export type TargetHealthState = "healthy" | "unhealthy" | "initial" | "unused" | "draining" | "unavailable";
export type TargetHealthReason =                  // platform words, never the AWS strings; null when healthy
  | "registering" | "initial_checks"              // initial
  | "response_code_mismatch" | "timeout" | "failed_checks" | "internal_error"   // unhealthy
  | "not_registered" | "not_in_use" | "ip_unusable" | "stopped"                 // unused
  | "deregistering"                               // draining
  | "unknown";                                    // any value the platform does not know
export interface TargetHealth {
  targetResourceId: string;                       // platform id of the customer's own server, never an AWS name
  health: TargetHealthState;
  reason: TargetHealthReason | null;
}
export interface TargetHealthReport {
  resourceId: string;
  live: boolean;                                  // false: the load balancer is not live, targets is empty, AWS was not asked
  checkedAt: string;                              // ISO 8601, UTC, from the injected Clock
  targets: TargetHealth[];                        // at most 20 (the target limit of the product), sorted by targetResourceId
  counts: Record<TargetHealthState, number>;      // over `targets`
  unresolved: number;                             // targets AWS reported that match no recorded target of this load balancer
}
// event: { action: "targetHealth", resourceId, caller }
targetHealth(resourceId: string, caller: ReadCaller): Promise<ReaderResult<TargetHealthReport>>;

// Managed database metrics. resourceId = the platform id of a resource of family `database`.
export type DatabaseMetricName = "cpu" | "connections" | "freeStorage" | "diskQueue";
export interface DatabaseMetricSeries {
  metric: DatabaseMetricName;
  unit: "percent" | "count" | "bytes";
  statistic: "average" | "maximum" | "minimum";   // what one point means; stated so no screen has to guess
  periodSeconds: number;                          // seconds covered by one point
  points: { at: string; value: number }[];       // ISO 8601 UTC, ascending, finite numbers; a missing period is a missing point
}
export interface DatabaseMeasured { resourceId: string; range: MetricRange; series: DatabaseMetricSeries[] }
// event: { action: "databaseMetrics", resourceId, caller, range }
databaseMetrics(resourceId: string, caller: ReadCaller, range: MetricRange): Promise<ReaderResult<DatabaseMeasured>>;
```

Fixed content of the two reads.
- Target health maps the Lightsail `GetLoadBalancer` health summary (`instanceHealth`: `initial`, `healthy`, `unhealthy`, `unused`, `draining`, `unavailable`; `instanceHealthReason`: `Lb.RegistrationInProgress` and `Lb.InitialHealthChecking` to `registering` and `initial_checks`; `Instance.ResponseCodeMismatch`, `Instance.Timeout`, `Instance.FailedHealthChecks` and `Lb.InternalError` to `response_code_mismatch`, `timeout`, `failed_checks` and `internal_error`; `Instance.NotRegistered`, `Instance.NotInUse`, `Instance.IpUnusable` and `Instance.InvalidState` to `not_registered`, `not_in_use`, `ip_unusable` and `stopped`; `Instance.DeregistrationInProgress` to `deregistering`). A state the platform does not know becomes `unavailable`, a reason it does not know becomes `unknown`. The reader maps each generated server name back to a platform id only against the recorded targets of that same load balancer (the same list the target rule of Section 10.3 checks); a name that matches none is counted in `unresolved` and never shown.
- A load balancer that is not live (still being created, destroyed or purged) is answered from the database: `live` is false, `targets` is empty and AWS is not asked, as `describe` does. Only a live load balancer calls AWS.
- Database metrics reads the Lightsail database metrics for the range of `metrics` (periods 300, 900 and 3600 seconds for 1h, 1d and 1w): `cpu` = `CPUUtilization`, average, percent; `connections` = `DatabaseConnections`, maximum, count; `freeStorage` = `FreeStorageSpace`, minimum, bytes; `diskQueue` = `DiskQueueDepth`, maximum, count. All four series are returned or none. VERIFY at staging that these statistics and units are accepted for each metric (the AWS page names Sum as the most useful statistic for `FreeStorageSpace` and `DiskQueueDepth`, which would add up a value sampled each minute over a longer period) and record the result; a change of statistic or period changes only the values of `statistic` and `periodSeconds`, not the shape.
- Both reads require the family: a resource of another family is `validation`. A range that is not `1h`, `1d` or `1w` is `validation`. A resource that is missing, belongs to another customer, is not placed in a pool account or is unknown to the admin is `not_found`, with no way to tell these cases apart (R8).

Errors. Only the codes of `ErrorCode` that the reader already returns: `unauthenticated` (no caller, both caller keys, or a caller key that does not fit the alias), `not_found`, `validation`, `rate_limited`, `upstream_unavailable` (a role, credential or availability problem on our side) and `internal`. AWS "not found", throttling and access errors map as for `describe` and `metrics`. Fail closed (R16): any AWS error, an answer for another resource name, a non-finite or negative value, a metric that is not one of the four, more than 20 targets, or a tenant check that cannot complete refuses the whole read with one of these codes. The reader returns no partial list and no partial series, and never retries inside one call.

Callers and limits. Only the server side of `apps/web` (alias `web`, for the customer panel tabs of a load balancer and a database) and `apps/admin` (alias `admin`) call these reads, as they call `describe` and `metrics`; neither imports `packages/aws` (R1). The data is for display. The `provisioner`, the lifecycle engine, billing and the `reconciler` never use it to decide anything. The reader uses the existing `TcReader` role (Lightsail `Get*` only, Section 6), so these reads need no new permission, and adds no write.

Never returned: AWS account ids, ARNs, generated AWS names (`tc-<type>-<id>`), Region or zone names, IP addresses of targets, the health check path, raw AWS error text or exception names, and any customer-supplied text (R11, rule U6). A caller identifies every resource by its platform id only.

## G. Verification and gates

`scripts/verify.mjs` is the single check that people and Claude Code run. It reads `verify/baseline.json` (facts copied from this plan) and reports pass or fail with evidence.

| Command | Runs | Used by |
| --- | --- | --- |
| `pnpm verify --quick` | Lint, typecheck and unit tests of changed packages. Under 60 seconds | The Stop hook, CI |
| `pnpm verify --task <id>` | The quick checks plus the proof of that task | Step 5 of the loop |
| `pnpm verify --gate <M0..M7>` | Every proof of the work packages in that gate, plus the gate's own checks against staging | The lead at 21:00, CI nightly |

Contract of the script: exit code 0 only when every check passed; a table of checks with pass or fail on stdout; `verify/report-<name>.json` with, for each check, the command, the exit code and the last lines of output. A check that cannot run counts as failed (R16). The baseline holds no secrets.

| Gate | When | Passes when |
| --- | --- | --- |
| M0 | Wed 11, morning | Repository kit exists; `pnpm verify --quick` passes; spec split in sync; the format check (`pnpm format:check`) passes. The lead merges the kit pull request only when its CI run is green |
| M1 | Wed 11, 21:00 | Staging deployed; database private; schema and pricing vectors pass; sign-up to KYC submission works; UI gallery passes; a signed-in customer sees the real catalog in taka |
| M2 | Thu 12, 21:00 | A real top-up credits exactly once and the replay and forgery tests pass; a paid order produces a server reachable by SSH; UI review done with Moshiur |
| M3 | Fri 13, 21:00 | Server features complete; one instance passes the whole lifecycle on the test clock; notifications send |
| M4 | Sat 14, 21:00 | Gate A adapters pass their cycles; admin P0 screens work; public P0 pages live on staging |
| M5 | Sun 15, 21:00 | Gate B adapters pass; metering runs; reconciler reports zero unexplained resources and cost variance under 2% |
| M6 | Mon 16, 18:00 | Every Section 15 item has evidence; go/no-go list of Section K is full; beta payments verified |
| M7 | Tue 17, launch | Flags set as decided; alarms deliver; on-call confirmed; first-day report produced |

A gate that fails is finished the next morning before new work starts.

# Part 2. Product and launch

## H. Product brief

| Topic | Decision |
| --- | --- |
| Problem | Developers, agencies and small companies in Bangladesh want AWS but cannot pay AWS easily: it needs an international card in dollars, there is no taka invoice, and a bill arrives after use |
| Product | TiCON Cloud: Amazon Lightsail resources sold prepaid in taka through a Bengali-first panel, paid by EPS, with VAT invoices and local support |
| Promise to the customer | 100% AWS infrastructure, at about the AWS price, in taka, prepaid, with a taka invoice and support in Bengali |
| Customers | Web and software agencies; SaaS companies and startups; e-commerce shops; existing TiCON Cloud customers (for dev and test servers); developers and students |
| Price | AWS list price x FX rate x 1.17 (10% Korea VAT, 5% Bangladesh VAT, 2% processing fee, each on the AWS price). At FX 127 the 5 USD plan is 743 taka for 30 days, about 1.7% above one AWS month bought directly with 15% VAT (about 3% over a full year, because a term is 30 days and AWS bills by the calendar month) |
| What TiCON adds | Local payment, prepaid control of spending, identity checks, taka invoices, Bengali support, a path to full AWS with TiCON later |
| Not in this product | Postpaid billing, AWS console or API access for customers, mail sending (port 25 stays closed), private networking between customers, hourly billing, resources outside Lightsail |
| Launch scope | Core on launch day; Gate A and Gate B families when they pass their tests (Section 1) |
| Markets after Bangladesh | Africa and other retail markets. A market is a config row: currency, gateway, pricing steps, locales |

Metrics. All come from existing tables, so no tracking script is needed:

| Metric | Definition | Target |
| --- | --- | --- |
| Active paid resources (north star) | Subscriptions in state `active` | 20 on launch day, 50 by day 14, 100 by day 30 |
| Activation funnel | Signed up, phone verified, KYC submitted, KYC verified, first verified top-up, first active resource (counts and step conversion per day) | Measured from beta; targets set after week one |
| Time to first server | From first verified top-up to the first resource in state `active` | Median under 5 minutes |
| KYC review time | From submission to decision | Under 2 working hours in launch week |
| Provisioning success | Operations of kind create that end `succeeded` | 98% or more |
| Money integrity | Wallet balance minus ledger sum, per wallet | Zero differences, every night |
| Cost integrity | AWS cost of pool accounts against expected cost, per account and UTC day. Expected cost: for each live resource that AWS bills by the hour, hours alive x AWS monthly price / 744, plus config-priced items in their own unit. AWS cost: Cost Explorer daily unblended cost without tax, read for the latest complete day (Cost Explorer lags about 24 hours). Grace hours, retained snapshots and unattached static IPs are reported as their own lines, not as variance | Variance under 2%; zero unexplained resources |
| Renewal rate | Subscriptions renewed at their first period end | Measured from day 30 |

The admin dashboard shows the first five every day (16.12, route `/`).

## I. Timeline

| Day | Milestone | Owner | Passes when |
| --- | --- | --- | --- |
| Day 0, Tue 10 | Decisions locked, mockup received, Partner application and quota requests, EPS confirmed | Moshiur, DevOps | Applications filed; plan with the team |
| Day 1, Wed 11 | Foundation: repository kit, staging, schema, pricing, identity, UI kit, catalog (WP0, WP1, WP2, WPU) | Dev team, DevOps | Gate M1 |
| Day 2, Thu 12 | Money path and first server (WP3, WP4 start); UI review in the evening | Dev team, Moshiur | Gate M2 |
| Day 3, Fri 13 | Cloud Server complete and lifecycle (WP4 end, WP5) | Dev team | Gate M3 |
| Day 4, Sat 14 | Gate A families, admin, public pages (WP6, WP8, WPP) | Dev team | Gate M4 |
| Day 5, Sun 15 | Gate B families, metering, reconciliation (WP7, WP8 end) | Dev team, DevOps | Gate M5 |
| Day 6, Mon 16 | Hardening, beta with real payments, legal pages; go/no-go at 18:00 (WP9) | Everyone | Gate M6 |
| Day 7, Tue 17 | Public launch, announcement, watch all day (WP10) | Everyone | Gate M7; 20 active resources; no stuck payment |
| Days 8 to 14 | Stabilize; open families that missed their gate; agency program | Everyone | All families open; 50 active resources |

Stand-up at 10:00 for 15 minutes. Gate check at 21:00. Friday and Saturday are working days this week.

## J. Roles

| Role | Person | Responsible for |
| --- | --- | --- |
| Product owner | Moshiur | Decisions, pricing, EPS, AWS Partner and commercial matters, legal content approval, sales, go/no-go |
| Lead developer | Dev team | Track A, contracts of Section F, reviews of money and security pull requests, merges, CI |
| Track drivers | Dev team | One person per track supervises that track's Claude Code sessions (one person may drive two tracks) |
| DevOps | TiCON DevOps | AWS Organization, accounts, SCPs, pool roles, quotas, DNS, SES, alarms, production deploy approval |
| Operations lead | To be named | KYC review, support inbox, abuse notices, daily reconciliation check |
| Legal adviser, VAT consultant | External | Terms, acceptable use, privacy, refund; VAT point and base |

Smallest workable team: two drivers, part-time DevOps and Moshiur. With four drivers the plan has slack; with two, Gate B is likely to open after launch.

## K. Go/no-go on Monday 16 at 18:00

Launch happens only when all twelve are true. A product family that fails its own tests stays switched off; it does not stop the launch.

- [ ] A real EPS payment passes from start to finish, and every payment is verified server to server before the wallet is credited.
- [ ] The same callback arriving twice credits the wallet once.
- [ ] Every wallet balance equals the sum of its ledger entries; no wallet is negative.
- [ ] One customer cannot see or operate another customer's resources.
- [ ] One customer's server cannot reach another customer's server over the private network.
- [ ] The whole end-of-term cycle passes; deletions need admin approval for the first two weeks.
- [ ] The launch Regions have room for at least 40 servers with static IPs.
- [ ] The daily AWS cost reconciliation runs and shows zero unexplained cost.
- [ ] Terms, acceptable use, privacy and refund pages are published.
- [ ] Identity verification is on, and new customers have limits.
- [ ] The platform's own database backup and restore test passed.
- [ ] Support phone, support email and the on-call list are final.

## L. Go-to-market

Core message: real AWS, at about the AWS price, in taka, prepaid, with a VAT invoice. Markup is zero, so launch offers are service (migration help, fast support), not discounts. Every public sentence follows the wording rules of Section 16.13.

| Customer | Offer | First step |
| --- | --- | --- |
| Web and software agencies | All client servers from one wallet; hands-on migration help for the first 20 agencies | Personal invitation to the beta |
| SaaS companies and startups | From 743 taka; grow into full AWS with TiCON later | Direct message to the founder |
| E-commerce shops | WordPress ready to use; VAT invoice for the accounts | Demo video |
| Existing TiCON Cloud customers | Dev and test servers prepaid, on a separate budget | Email and phone |
| Developers and students | An AWS server in minutes, paid in taka | Community posts and tutorials |

| When | Work | Target |
| --- | --- | --- |
| Days 0 to 2 | List of 100 target organizations; waitlist page on ticoncloud.com | List and page ready |
| Days 3 to 5 | Personal beta invitations; 60-second demo video; price page in taka | 30 interested |
| Day 6 | Beta customers top up and create their first server | 10 to 20 paying |
| Day 7 | Announcement: Facebook page, LinkedIn, email, developer communities | 20 active resources |
| Days 8 to 30 | Agency program; two Bengali tutorials a week; 10 follow-ups a day | 100 active resources |

| Objection | Answer |
| --- | --- |
| A local VPS is cheaper | For local speed alone it is. Choose this for visitors abroad, AWS infrastructure, and a path to full AWS later |
| I can buy from AWS directly | Then you need a dollar card, pay 15% VAT without a BIN, and get no taka invoice. Here the price is about 1.7% higher per 30-day term (about 3% over a full year), with support in Bengali |
| Where is my data | Your servers, databases and storage are in the AWS Region you choose: Singapore or Mumbai. Your account and identity documents are kept in AWS Singapore |
| Will my money get stuck | Every wallet transaction and invoice is visible in the panel, and the refund policy is published |

Content Claude Code drafts for review, in `bn` and `en` (task WPP and WP9): landing and product page copy, the FAQ, email and SMS templates, ten help articles, the announcement post, and drafts of the legal pages for the legal adviser. No AWS mark in paid search ads without authorization from AWS.

## M. Operations and support

| Routine | When | Who |
| --- | --- | --- |
| KYC queue | Continuously in working hours; under 2 hours in launch week | Operations lead |
| Operations queue (approvals, needs attention) | Three times a day; at once on an alarm | Track B driver until day 14, then operations |
| Payments pending (`initiated` or `redirected`) over 30 minutes, and every payment in `review` | Twice a day | Finance admin |
| Reconciliation report | Every morning | Finance admin and DevOps |
| Capacity per pool account and Region | Every morning; quota request at 70% use | DevOps |
| Abuse notices from AWS | Suspend the resource at once when a violation is confirmed (Customer Agreement 2.5), within 24 hours of the notice at the latest; open a case, answer AWS | Operations lead |
| Support inbox | First answer within 1 working hour in launch week | Operations lead |

Runbooks that task WP9-T4 writes into `docs/runbooks/`, one page each with symptoms, checks, actions and who decides: payment stuck or disputed; EPS unavailable (manual top-up by a `finance` admin with a bank or wallet receipt); provisioning failed; capacity full; lifecycle approval; abuse notice; KYC review; refund; domain registration problem; reconciliation mismatch; database restore; incident (severity levels, who is told, customer notice).

## N. Risks

| Risk | Effect | Answer |
| --- | --- | --- |
| Quota or Partner approval comes late | No room on launch day | Applied on day 0; start with 40 servers across two Regions and two accounts (20 if the static IP quota does not rise); waitlist for the rest |
| EPS integration fault | No online top-up | For the first days accept bank or wallet deposits and credit through the admin adjustment with approval |
| Billing or lifecycle error | Money lost or customer data deleted | Lifecycle tested on a minute clock; admin approval before deletion; daily reconciliation |
| Whole catalog in one week | Half-finished products reach customers | Feature flag per family; gates on day 6 |
| Customer abuse | AWS notice, action against the account | Identity checks; limits for new customers; separate pool; port 25 closed |
| Customers share a private network inside one account | One customer's server can reach another's private address | OS firewall at first boot; generated database passwords; isolation test; dedicated account for sensitive customers |
| AWS naming rules broken | AWS objects; pages or ads must change | Fixed statements and rules in 16.13; wording confirmed with the AWS Partner manager before launch |
| Bengali text in invoice PDFs renders wrongly | Unreadable invoices | Headless Chromium renderer; VERIFY on day 2; fallback is an English PDF with the Bengali invoice on screen |
| Tracks collide or drift from the plan | Rework, merge conflicts | Contracts of Section F; one task per pull request; fresh-context review; daily gate |
| Review bottleneck on the lead | Merges wait | Reviewer subagents first; CODEOWNERS only on the paths that E.1 lists (money, security, infrastructure and the kit); second reviewer named on day 1 |
| Domain registration | No refunds; registrant details needed | Gate B; double confirmation; contact in the customer's name |
| Amazon SES production access comes late | Sign-up codes, receipts and invoices reach only verified addresses, so beta customers cannot confirm their email | Requested on Wed 11; AWS gives a first answer within 96 hours (by Sun 15) and may ask for more. Until access is granted the customer Cognito pool uses the Cognito default sender for sign-up codes (50 emails a day), and receipts and invoices are read in the panel |

## O. After launch

| When | Item |
| --- | --- |
| Days 8 to 14 | Families that missed their gate; P1 screens; agency program; help articles |
| Weeks 3 to 4 | Plan change (resize through snapshot), light and dark switch, statement export, team members on one customer account, coupons for service offers, referral for agencies |
| Later | Second market (currency, gateway, locales as config), public pages on `ticoncloud.com` paths, customer API tokens, dedicated pool accounts as a product, full AWS upgrade path with TiCON |

# Part 3. Build specification

Sections 0 to 18 below are the build specification. Their numbers are stable: tasks, rules and the generated `docs/spec/` files refer to them.

## 0. How Claude Code uses this specification

1. This is Part 3 of the mega plan. Work starts from Part 1: the bootstrap prompt of Section E.1 once, then one task per session with `/wp-start <task id>`.
2. Task WP0-T1 creates `CLAUDE.md`, the path-scoped rules in `.claude/rules/` and the generated `docs/spec/` files from this file (Appendices P to T). `CLAUDE.md` stays under 200 lines; the long text stays here.
3. Work package by work package (Section 14), task by task (Section E.3). A task is done only when its proof passes. A work package is done only when its acceptance tests pass.
4. Never weaken a rule in Section 2 or Section 16.2 to make a task pass. If a rule blocks the work, stop and write the question under "Needs decision" in `JOURNEY.md`.
5. Check AWS, SST and EPS API details against current documentation before use. Items marked VERIFY must be proven in the staging pool account and the result recorded in `JOURNEY.md`.
6. This file is the master. Change it in a pull request, then run `pnpm spec:split` so `docs/spec/` follows.

## 1. Product in one page

TiCON Cloud is a prepaid, self-service cloud panel (in the style of Vultr or DigitalOcean) whose resources are Amazon Lightsail resources in AWS accounts owned by TiCON. Customers are told openly that the service is 100% AWS: every server, database, disk, bucket, load balancer and container service they buy is an Amazon Lightsail resource in an AWS Region, and CDN, DNS and domains use Amazon Lightsail CDN and Amazon Route 53, which are global AWS services. They do not get an AWS account, the AWS console or AWS API access; they use the TiCON Cloud panel. They sign up, verify identity, top up a wallet in BDT through EPS, and buy resources on 30-day prepaid terms.

| Decision | Value |
| --- | --- |
| Brand | TiCON Cloud: TiCON's own panel, billing and support, built on Amazon Lightsail |
| AWS visibility | Named openly on public pages, in the panel, on invoices and in emails: the service is 100% AWS (rule U6 and Section 16.13). Wording follows the AWS Trademark Guidelines |
| Markets | Bangladesh first; Africa and other retail markets later (market is a config row, not code) |
| Billing | Prepaid wallet, 30-day terms, auto-renew from wallet, no postpaid |
| Payment gateway | EPS hosted checkout (merchant and store already approved and live) |
| Price rule (BD) | AWS USD price x FX rate, plus 10% Korea VAT, 5% Bangladesh VAT, 2% processing fee, each on the AWS price. Total 17%. Markup field exists and is 0. All editable by admin |
| Catalog | Every Lightsail product: instances (Linux, Windows), managed databases, containers, load balancers, block storage, object storage, CDN, static IP, snapshots, DNS, domains |
| Domains | Every TLD that Route 53 offers is listed, with prices synced from AWS |
| Launch gates | Core (signup, KYC, wallet, EPS, invoices, Linux instances, static IP, firewall, backups, disks, admin) is guaranteed on launch day. Gate A (Windows, database, load balancer, object storage) and Gate B (containers, CDN, DNS, domains) open only if they pass the Day 6 tests. Every product has a feature flag |
| Customer panel URL | `my.ticoncloud.com` (assumption, configurable) |
| Admin panel URL | `ops.ticoncloud.com` (assumption, configurable) |
| Company address on invoices and legal pages | TiCON System Limited, Level 1, Example House, 1 Example Avenue, Sector-1, Example Area, Dhaka-1000 |
| Default locale | Bengali (`bn`), English (`en`) second |

## 2. Rules that are never broken

Security is the first requirement of this product. `CLAUDE.md` carries these rules in short form, and the path-scoped rule files carry them verbatim (Appendices P and R).

| # | Rule |
| --- | --- |
| R1 | The web tier never provisions. `apps/web` and `apps/admin` have no IAM permission to assume pool roles and must not import provisioning clients from `packages/aws`. They only write an operation row and enqueue it. Enforce with IAM and with an ESLint import-boundary rule. |
| R2 | The database is private. It is reachable only from Lambda functions inside the VPC through RDS Proxy, with TLS required. No public endpoint, ever. |
| R3 | No long-lived AWS keys and no secrets in the repo, in logs, or in client bundles. Cross-account access is STS AssumeRole only. Secrets live in SST Secrets (`sst.Secret`): encrypted in the SST state bucket of the stage's account (the passphrase is an SSM parameter) and bundled, encrypted, into each function that links them. Link a secret only to the functions that use it. A new value applies at the next deploy. |
| R4 | Money is an integer in minor units (paisa, `BIGINT`). Decimal math is allowed only inside the pricing engine with a decimal library. Rounding is half-up. No floats anywhere near money. |
| R5 | The ledger is double-entry and append-only. Every transaction balances. Corrections are new reversing transactions, never updates or deletes. The application database role has no UPDATE or DELETE on ledger and audit tables. |
| R6 | A wallet is credited only after a server-to-server EPS verification returns success for the same merchantTransactionId and amount. EPS takes and returns no currency: every EPS amount is BDT, and the currency of the payment row is fixed to the market currency when the row is created. Redirect query parameters are untrusted input. |
| R7 | Every state-changing request and job is idempotent. An idempotency key is accepted or derived, and a unique constraint enforces it. |
| R8 | Tenant scoping: customer data is read and written only through repository functions that take `customerId` from the verified session, never from the request body, query or path. Each endpoint has a cross-tenant (IDOR) test. |
| R9 | Order of work in every server action and route handler: authenticate, authorize, validate with zod, rate limit, execute, write audit log. |
| R10 | Admin is a separate app, domain, Cognito user pool and CloudFront distribution, with mandatory TOTP MFA and a WAF IP allowlist. Every admin action stores actor, reason, IP and target. |
| R11 | AWS resource names are generated by the platform (`tc-<type>-<16 char id>`) and tagged where Lightsail supports tags. Customer-supplied text is never used as an AWS name, tag key, or inside user data without escaping from a fixed template. |
| R12 | Every product family sits behind a feature flag that defaults to off in production. |
| R13 | Destructive lifecycle actions (delete instance, database, disk, bucket, snapshot, release static IP) run only when the subscription state allows it and a final snapshot exists where the product supports one. Until 2026-12-01 they also need admin approval in the operations queue. |
| R14 | Logs are structured JSON and contain no passwords, tokens, EPS secrets, ID document numbers, or full phone numbers and emails. |
| R15 | Pricing, ledger, lifecycle and capacity allocation have unit tests. Nothing merges with failing tests. Migrations are forward-only. |
| R16 | Fail closed. If a check cannot be completed (EPS verify, KYC status, capacity, authorization), the action is refused. |
| R17 | Dependencies are pinned by lockfile. No high or critical advisories at release. No new auth or crypto dependency without a recorded reason. |

## 3. Architecture

### 3.1 AWS accounts

All accounts are TiCON's own, inside the existing TiCON AWS Organization, in a dedicated OU tree. The Lightsail Partner application is submitted from the management account so member accounts receive higher default instance quotas.

| Account | Purpose | Notes |
| --- | --- | --- |
| Management (existing) | Organizations, SCPs, billing, Lightsail Partner enrollment | No workloads and no platform role. Cost Explorer access for member accounts is switched on here |
| `tc-platform` (new) | The production control plane: web, admin, workers, database, queues, buckets | Reached only by the CI deploy role and by named administrators. No developer machine and no Claude Code session holds credentials for it |
| `tc-platform-stg` (new) | The staging control plane: the same stack with its own VPC and database | Developers and Claude Code deploy here. It works only with `tc-pool-dev` and with test zones in `tc-dns` |
| `tc-pool-v1` | Lightsail resources of trusted customers | Lightsail only, by SCP |
| `tc-pool-n1` | Lightsail resources of new customers | Lightsail only, by SCP. Keeps new-customer abuse away from trusted customers |
| `tc-pool-dev` | Lightsail resources created by staging and tests | Never used by production |
| `tc-dns` | Route 53 hosted zones and Route 53 domain registrations | Route 53 only, by SCP |

Rules for pools:

- A customer gets a home pool account per Region on first purchase. All of that customer's resources in the Region stay in the home account, because load balancers, disks, static IPs, private database access and bucket resource access only work inside one account and Region.
- The home account does not change later (Lightsail has no cross-account snapshot copy), so it is chosen once: customers an admin marked `trusted` before their first purchase (existing TiCON Cloud customers, verified businesses) go to `tc-pool-v1`, everyone else goes to `tc-pool-n1`. Later cohorts get new pool accounts (`tc-pool-n2`, ...).
- Only instance vCPU and static IP quotas can be raised. Databases (40 per Region), load balancers (10 per Region), buckets (20 per account), distributions (20 per account), container services (100 per Region) and active certificates (10 per Region, 20 new per 365 days) are fixed. Capacity for these grows only by adding pool accounts, so adding a pool account must be a config change, not a code change.
- New AWS accounts can start below the documented default quotas. Record real quotas per account and Region in `pool_capacity`.

### 3.2 Runtime components and their privileges

Region for the control plane: `ap-southeast-1`. Everything runs on AWS Lambda through SST.

| Component | Trigger | May do | Must not do |
| --- | --- | --- | --- |
| `web` (customer Next.js server) | CloudFront + WAF | Database through RDS Proxy; enqueue operations; presign KYC uploads; insert `notifications` rows through `notify` (the `notifier` sends them); invoke `reader` | Assume any pool or DNS role; call Lightsail or Route 53; read KYC objects |
| `admin` (admin Next.js server) | CloudFront + WAF with IP allowlist | Same as `web`, plus read KYC objects, approve operations, invoke `catalog-sync`, and call the Cognito admin API of the admin pool only | Assume any pool or DNS role |
| `provisioner` | SQS FIFO queue | Database; assume `TcProvisioner` in listed pool accounts and `TcDnsProvisioner` in `tc-dns` | Be reachable from the internet |
| `reader` | Invoked by `web` and `admin` | Assume `TcReader` (read-only) to fetch live state and metrics for one resource id, after its own tenant check; assume `TcDnsReader` for domain availability, domain status and DNS records | Any write in pool accounts or in `tc-dns` |
| `access-details` | Invoked by `web` | Assume `TcAccessDetails` to fetch a Windows password or a database master password, or to create a bucket access key and return its secret once, for one resource id, after its own tenant check; writes an audit row | Anything else |
| `invoice-renderer` | Invoked by `web` and `admin` for one invoice, after their own tenant check | Render the invoice HTML to PDF with headless Chromium and write it to the `invoices` bucket. Runs in the VPC with its own security group whose only egress is HTTPS to S3 through an S3 gateway endpoint; receives self-contained HTML (CSS inlined) and packaged fonts including Noto Sans Bengali; `@sparticuz/chromium` stays outside the bundle, x86_64, about 2 GB memory | Read the database; reach the internet; assume any role |
| `scheduler` | EventBridge Scheduler (`sst.aws.CronV2`), every minute | Database; send the queue message for every `waiting` operation whose `next_run_at` has passed and every `queued` operation still unsent 2 minutes after its `next_run_at` (this recovers a message lost after the purchase committed); enqueue lifecycle operations and notifications | Assume pool roles |
| `payments-sweeper` | EventBridge Scheduler (`sst.aws.CronV2`), every 5 minutes | Database; call EPS verify for pending payments | Assume pool roles |
| `catalog-sync` | Daily and on demand | Assume `TcReader` and `TcDnsReader` (TLD prices); write catalog tables | Change prices of existing subscriptions |
| `reconciler` | Hourly inventory, daily cost | Assume `TcReader`, `TcDnsReader` (hosted zones and domains belong to the inventory) and `TcBillingReader`; measure data transfer every hour and write `usage_records` (Section 11); write discrepancy rows; alert | Fix discrepancies by itself |
| `migrator` | Deploy time | Run migrations with the migrator database role | Serve traffic |
| `notifier` | EventBridge Scheduler (`sst.aws.CronV2`), every minute | Database; read `pending` `notifications` rows, send them through SES or the SMS gateway (`SmsApiKey`) and mark them sent. `notify(tx, ...)` only inserts the row | Assume pool roles |
| `cognito-messages` | Custom message trigger of both Cognito pools | Render Cognito emails (codes, temporary password) in the user's locale with the `packages/notify` layout, under 20,000 characters | Read the database; assume any role |

### 3.3 Network and data stores

- VPC with two AZs, public and private subnets, managed NAT gateway (outbound calls to EPS, AWS APIs and the SMS gateway go through NAT). `invoice-renderer` runs in two isolated subnets with no NAT route and reaches S3 only through an S3 gateway endpoint; its package holds the fonts, and the HTML it receives has its CSS inlined and refers to no URL.
- Amazon RDS for PostgreSQL in private subnets: Multi-AZ in production, storage encrypted with a KMS key, automated backups with 14 days point-in-time recovery, deletion protection on, TLS forced, RDS Proxy in front. `sst.aws.Postgres` defaults differ (`rds.force_ssl` 0, 7-day backups, final snapshot skipped, no deletion protection, the VPC default security group, proxy without `requireTls`): override each through `transform` and give the instance its own security group that admits 5432 only from the proxy.
- Database roles: `web_rw` (customer panel), `admin_rw` (admin panel) and `worker_rw` (functions), each DML only with no UPDATE or DELETE on the append-only (A) tables of Section 7 (`ledger_transactions`, `ledger_entries`, `audit_log`, `legal_acceptances`, `fx_rates`, `pricing_rules`); `web_rw` cannot write `fx_rates`, `pricing_rules`, `feature_flags`, `admin_users` or `pool_accounts`, can change only the column `used` of `pool_capacity` (the capacity reservation of 10.2 runs inside the purchase transaction of `web`), and cannot set `operations.approved_by`; `migrator` (DDL), `report_ro` (read-only). Do not `link` the Postgres component to web, admin or workers: its link carries the master user. List `web_rw`, `admin_rw`, `worker_rw` and `report_ro` in the component's `proxy.credentials` and give each function only its own role's credentials. `migrator` alone uses the master user, to create the roles.
- S3 buckets, all private with Block Public Access: `kyc` (SSE-KMS, uploads by presigned POST with size and content-type conditions, read only by `admin`), `invoices`, `exports`.
- SQS FIFO queue `provisioning` with a dead-letter queue. MessageGroupId is the resource id. The deduplication id is `<operation id>:<enqueue_seq>`, a counter kept on the operation row and increased for every send, never the operation id alone: SQS accepts a second message with the same deduplication id inside 5 minutes, even after the first was deleted, but does not deliver it, so the next step, a repeated wait check or a retry would vanish without an error. An alarm fires when the dead-letter queue is not empty.
- CloudFront in front of both apps. Both `sst.aws.Nextjs` apps set `protection: "oac-with-edge-signing"`, so their Lambda function URLs accept only signed requests from their own distribution and no request can skip the WAF or the admin allowlist. The SST default `"none"` leaves the function URLs public and outside WAF (VERIFY that Server Actions work behind it; request bodies are limited to 1 MB, and KYC files go straight to S3). AWS WAF with the AWS managed core, known-bad-inputs and IP-reputation rule groups, plus rate-based rules for login, OTP, top-up and order endpoints. Server Actions POST to the page URL, so these rules match method POST on those page paths in both locales and on `/pay/eps/`. The web ACLs and the admin IP set are created in us-east-1 (a second provider) and attached through `transform.cdn` (`webAclArn`).
- CloudTrail (organization trail) and GuardDuty enabled for every account above. Alarms go to an SNS topic that emails the on-call list.

### 3.4 Main flows

Top-up: `web` creates `payments` row -> EPS GetToken -> EPS InitializeEPS -> browser goes to EPS -> EPS returns browser to success, fail or cancel URL -> handler calls EPS CheckMerchantTransactionStatus -> on verified success posts the ledger transaction -> wallet balance updates. The sweeper repeats the verify step for payments whose browser never came back.

Purchase: `web` opens one database transaction: lock wallet row, check customer status, KYC, feature flag and risk-tier limits again, price the order, check balance, reserve capacity, insert order, subscription, resource, operation, ledger transaction and invoice -> commit -> send the operation id to the queue (after commit, outside the transaction; `enqueueOperation(tx, ...)` only inserts the row as `queued` with `next_run_at` = now, and if the send is lost the `scheduler` sends it, 3.2) -> `provisioner` runs the product adapter step by step -> resource becomes `active` -> notify. Permanent failure posts a reversing ledger transaction and notifies.

Expiry: `scheduler` finds subscriptions at period end -> auto-renew if enabled and funded -> otherwise grace -> suspend -> final snapshot and delete -> snapshot purge. Section 11 has the timings.

## 4. Stack

| Layer | Choice | Why (security first) |
| --- | --- | --- |
| Language | TypeScript, strict mode | One language end to end; types on money and ids |
| Web framework | Next.js 16.4.x (current stable on 2026-11-11), exact version pinned in both apps, App Router, Server Actions and Route Handlers. `sst.aws.Nextjs` sets `openNextVersion` to an OpenNext release whose changelog names that Next.js patch (SST's default is 3.9.14) | Server-side rendering keeps secrets and logic off the client |
| Infrastructure as code | SST v4, exact version pinned (4.17.2 on 2026-11-11); `transform` and raw `aws.*` code follows Pulumi AWS v7 names (OpenNext on Lambda, `sst.aws.Vpc`, `sst.aws.Postgres` with proxy, `sst.aws.Nextjs` with `vpc` and `protection: "oac-with-edge-signing"`, `sst.aws.Queue`, `sst.aws.CronV2`, `sst.aws.Bucket`, `sst.Secret`) | No servers to patch; one IAM role per function gives real privilege separation |
| Database | Amazon RDS for PostgreSQL 16 or newer, private, behind RDS Proxy | Financial ledger and KYC data stay inside TiCON's own AWS account and off the internet |
| ORM and migrations | Drizzle ORM with `pg`, drizzle-kit migrations | Typed SQL, explicit transactions and row locks |
| Authentication | Amazon Cognito: one user pool for customers, a separate pool for admins | Passwords are never stored in our database; managed MFA and lockout |
| Validation | zod on every input | Rule R9 |
| Queue and schedule | SQS FIFO, EventBridge | Durable, ordered per resource, no public surface |
| AWS access | AWS SDK for JavaScript v3 (`@aws-sdk/client-lightsail`, `@aws-sdk/client-route-53`, `@aws-sdk/client-route-53-domains`, `@aws-sdk/client-sts`, `@aws-sdk/client-cost-explorer`; confirm the names at install), used only inside `packages/aws` with temporary credentials from STS AssumeRole. The SDK calls the Lightsail API (version 2016-11-28) | The SDK signs requests, retries throttled calls and types every action. No hand-written HTTP calls to AWS, no AWS CLI, and no CloudFormation for customer resources |
| Payments | EPS hosted checkout through the team's `eps-payment-gateway` skill (Next.js client) | No card data touches the platform |
| Email | Amazon SES with DKIM for `ticoncloud.com` | |
| SMS | Provider adapter (`SmsProvider` interface); provider chosen by the team | OTP codes are hashed at rest |
| Money math | `decimal.js` or `big.js` inside `packages/core/pricing` only | Rule R4 |
| Tests | Vitest (unit and integration against a Postgres container), Playwright (critical flows) | Rule R15 |
| i18n | `next-intl`, `bn` default | |
| CI and deploy | GitHub Actions. Staging deploys on merge through an OIDC role in `tc-platform-stg`. Production deploys from a tag through an OIDC role in `tc-platform` after a manual approval | No deploy key exists anywhere (R3) |
| Invoice PDF | The invoice HTML rendered by headless Chromium in `invoice-renderer` | Bengali text needs real text shaping |
| UI | Bootstrap 5.2.3 CSS and the Antler theme CSS from the mockup, rendered by React Server Components (Section 16). No jQuery and no theme JavaScript | Small script surface, so a strict CSP with nonces works. Nonces make every page dynamic (no prerendering, no CDN caching, no Partial Prerendering); `proxy.ts` sets the nonce and the CSP header |
| UI behavior | Radix UI primitives (dialog, dropdown menu, tabs, accordion, toast, tooltip) carrying the theme's classes | Keyboard and focus handling without the theme's scripts |
| Charts | Recharts, rendered on the client only | SVG output, no `eval` |
| Fonts and icons | Self-hosted Open Sans and Noto Sans Bengali; Font Awesome Free 6.4.2 and the theme's line icon fonts | No third-party origin at runtime |

Differences from the usual TiCON default stack, and why: RDS inside a VPC instead of an external serverless Postgres, Lambda inside the VPC with NAT, and Cognito instead of a library-managed password store. Each trade costs some money and setup time and removes an internet-facing path to money or identity data.

## 5. Repository layout

```
apps/
  web/            customer panel and public pages (Next.js); public/theme/ is generated
  admin/          admin panel (Next.js); public/theme/ is generated
packages/
  core/           pricing, ledger, lifecycle, capacity, policies (pure logic, no AWS, no HTTP)
  db/             Drizzle schema, migrations, repositories (tenant-scoped)
  aws/            Lightsail, Route 53 and STS clients and product adapters (imported only by functions/)
  eps/            EPS client and payment state machine
  notify/         email and SMS providers and templates
  auth/           Cognito token verification and session helpers
  ui/             theme files, tokens, shells and components shared by web and admin (Section 16)
functions/
  provisioner/  reader/  access-details/  scheduler/  payments-sweeper/
  catalog-sync/  reconciler/  migrator/  invoice-renderer/  notifier/  cognito-messages/
infra/            SST definitions (one file per concern); infra/org/ holds the Organization templates that DevOps applies
tests/            e2e and isolation tests
design/           mockup/ (the mockup zip contents: read-only reference, excluded from every build), brand/ (logo, favicon), reference/ (sample invoice)
scripts/          sync-theme.ts (Section 16.3), split-plan.mjs and verify.mjs (Section G)
verify/           baseline.json and the gate checks (Section G)
content/          legal pages, FAQ and help articles as MDX
docs/spec/        generated from the mega plan, one file per section; docs/runbooks/ for operations
.claude/          settings, hooks, rules, skills and subagents (Appendices Q to S)
CLAUDE.md  JOURNEY.md  TICON_CLOUD_MEGA_PLAN.md
```

## 6. Identity and access

### 6.1 Customers

- Cognito customer pool: email and password sign-up, email verification, password policy of at least 12 characters, optional TOTP MFA, self-service password reset. Destructive actions (destroy a resource, delete a snapshot, change email or phone) and sensitive ones (enable or disable TOTP, reveal any password, create a bucket access key, change name servers, switch database public mode) require a fresh sign-in within the last 10 minutes.
- Tokens are kept only in `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Nothing in `localStorage`. The server verifies the access token's signature, issuer, `client_id`, `token_use` and expiry on every request (`aud` exists only in the ID token and is checked there), maps the Cognito `sub` to `customers.id`, and refuses a token issued before the customer's `sessions_valid_after` time or for a customer who is not active. Revoked Cognito tokens still pass the local check until they expire, so sign-out everywhere, a password change and a suspension set `sessions_valid_after` (with `AdminUserGlobalSignOut`); the acting browser signs in again. Admin tokens are checked the same way against `admin_users.status`. `proxy.ts` refreshes an expiring access token before rendering, because Server Components cannot set cookies.
- Phone verification is an in-app OTP by SMS: 6 digits, stored hashed, 5 minute expiry, 5 attempts, 3 sends per hour per number and per IP.
- KYC: customer type (individual or business), ID document images uploaded straight to the `kyc` bucket by presigned POST, document number stored encrypted with a KMS data key. Status: `none`, `pending`, `verified`, `rejected`. No resource can be created before `verified`.
- Risk tier is separate from KYC status. Everyone passes KYC; the tier is `new` or `trusted` and drives limits (Section 10.2) and the home pool. A customer becomes `trusted` by admin decision, or automatically after 14 days and one paid renewal with no abuse case.

### 6.2 Admins

- Separate Cognito pool, no self sign-up, TOTP required, short sessions (8 hours), roles `support`, `finance`, `ops`, `superadmin`.
- `ops.ticoncloud.com` is reachable only from the WAF IP allowlist.
- Manual wallet credits and debits: `finance` role only, mandatory reason, and a second admin's approval above a configurable amount.

### 6.3 IAM roles in other accounts (starting point, tighten after VERIFY)

| Role | Account | Trusted principal | Permissions |
| --- | --- | --- | --- |
| `TcProvisioner` | each pool account | the matching control plane account (`tc-platform` for customer pools, `tc-platform-stg` for `tc-pool-dev`) with the condition `aws:PrincipalArn` = its `provisioner` function role, and `sts:ExternalId` per pool account (a plain value in `pool_accounts`). In this row and the rows below, write the trust as the control plane account with an `aws:PrincipalArn` condition, and give the function roles fixed names in `infra/`: a trust that names a role directly stores its internal id, breaks when a deploy recreates the role, and cannot be saved before the role exists | Explicit allow-list of the Lightsail actions used by the adapters in Section 10.3: every command the adapters call, including the Get, start, stop and restore calls that the table there does not name, plus `lightsail:TagResource`, which AWS also checks when a create carries tags. Explicit deny of `lightsail:DownloadDefaultKeyPair`, `lightsail:PeerVpc`, `lightsail:UnpeerVpc`, `lightsail:ExportSnapshot`, `lightsail:CreateCloudFormationStack`, `lightsail:GetInstanceAccessDetails` |
| `TcReader` | each pool account | `reader`, `catalog-sync`, `reconciler` roles | Lightsail `Get*` only, without `GetInstanceAccessDetails`, `GetRelationalDatabaseMasterUserPassword`, `DownloadDefaultKeyPair` |
| `TcAccessDetails` | each pool account | `access-details` role | `lightsail:GetInstanceAccessDetails` only on instances tagged `tc:os` = `windows` (condition `aws:ResourceTag/tc:os`), because for a Linux instance the same call returns a temporary SSH key; `lightsail:GetRelationalDatabaseMasterUserPassword`; `lightsail:CreateBucketAccessKey`. Nothing else |
| `TcDnsProvisioner` | `tc-dns` | `provisioner` role | The Route 53 and Route 53 Domains actions in Section 12 |
| `TcDnsReader` | `tc-dns` | `reader`, `catalog-sync`, `reconciler` roles | `route53domains:CheckDomainAvailability`, `route53domains:GetDomainSuggestions`, `route53domains:ListPrices`, `route53domains:GetDomainDetail`, `route53domains:GetContactReachabilityStatus` (the contact verification state of Section 12, which `GetDomainDetail` does not return), `route53domains:ListDomains`, `route53:ListHostedZones`, `route53:GetHostedZone`, `route53:ListResourceRecordSets` only |
| `TcBillingReader` | each pool account and `tc-dns` | `reconciler` role of the matching control plane | `ce:GetCostAndUsage` only (a member account sees only its own cost) |

SCP on the pool OU: deny every action except `lightsail:*` and the minimum read-only support actions, and deny Lightsail outside `ap-southeast-1`, `ap-south-1` and `us-east-1` (distributions and other global Lightsail resources are managed through `us-east-1`). SCP on `tc-dns`: only Route 53 and Route 53 Domains. Both SCPs also allow `ce:GetCostAndUsage` for `TcBillingReader`. An SCP also binds the root user and every admin role of a member account, so both SCPs exempt one named admin role (condition on `aws:PrincipalArn`) for IAM changes to the `Tc` roles, Service Quotas requests and support cases: static IP, vCPU and domain increases are requested inside the account. Before the SCP is attached, DevOps creates and deletes one bucket in each pool account as that admin, so that Lightsail creates its service-linked role `AWSServiceRoleForLightsail`; `TcProvisioner` has no IAM permission to create it. VERIFY in `tc-pool-dev`, with the SCP attached, that `TcProvisioner` can create an instance and a bucket and that the admin role can list and file a quota increase, then record the final policy JSON in `infra/`.

## 7. Data model

All primary keys are UUID v7, generated by the application with a UUID v7 library (PostgreSQL before 18 has no `uuidv7()`, and Drizzle's `defaultRandom()` gives version 4). All money columns end in `_minor` and are `BIGINT`. Every table has `created_at`. Tables marked (A) are append-only.

| Table | Key columns |
| --- | --- |
| `customers` | `cognito_sub` unique, `sessions_valid_after`, email, phone, `phone_verified_at`, name, type, `kyc_status`, `risk_tier`, market, locale, status |
| `kyc_submissions` | customer, document type, encrypted document number, S3 keys, status, reviewer, reviewed at, note |
| `ssh_keys` | customer, name, public key, fingerprint (public keys only) |
| `otp_challenges` | customer, phone (also a new number waiting for `changePhone`), code hash, expires at, attempts, consumed at |
| `rate_limits` | scope key (for example a hashed phone number, a customer or an IP), window start, count; unique on scope key and window start; rows older than a day are purged |
| `legal_acceptances` (A) | customer, document (terms, acceptable use, privacy, refund, domain registration agreement), version, accepted at, IP |
| `markets` | code (`BD`), currency (`BDT`), gateway, locales, numerals (`beng` or `latn`), top-up minimum and maximum (`_minor`), quick amounts (JSON), active |
| `fx_rates` (A) | market, rate (numeric), effective from, set by admin |
| `pricing_rules` (A) | market, optional product family, ordered steps (JSON), effective from, set by admin |
| `catalog_products` | family, AWS bundle or power id, platform, Region, specs (JSON), `aws_price_usd` (numeric 12,4), billing unit, feature flag, active, synced at |
| `tlds` | TLD, registration, renewal and transfer price in USD, needs extra parameters (bool), synced at |
| `feature_flags` | key, market, enabled |
| `settings` | key, market, scope (`market`, `tier` or `customer`) and scope id, value (JSON), set by admin; unique on key, market, scope and scope id. Holds tier and customer limits, config prices, the image allow-list, capacity reserves and the adjustment approval limit |
| `wallets` | customer unique, currency, `balance_minor` (cached), version |
| `ledger_accounts` | type (`customer_wallet`, `gateway_clearing`, `revenue_aws_base`, `vat_korea_payable`, `vat_bd_payable`, `processing_fee_income`, `markup_income`, `refunds`, `adjustments`), customer (nullable), currency |
| `ledger_transactions` (A) | kind, reference type and id, `idempotency_key` unique, actor, memo |
| `ledger_entries` (A) | transaction, account, direction, `amount_minor` > 0 |
| `wallet_adjustments` | customer, direction, `amount_minor`, kind (`goodwill`, `deposit`, `correction`), reason, evidence reference, requested by, approved by (never the requester), status (`pending`, `approved`, `rejected`), ledger transaction |
| `payments` | customer, gateway, `merchant_transaction_id` unique, `idempotency_key` (unique per customer), `amount_minor`, currency, status (`initiated`, `redirected`, `credited`, `failed`, `cancelled`, `expired`, `review`), gateway transaction id, verify payload (JSON), verified at, ledger transaction |
| `orders` | customer, kind (`new`, `renew`, `addon`, `restore`), items and price snapshot (JSON), `total_minor`, ledger transaction, `idempotency_key` (unique per customer), status |
| `invoices` | sequential number per fiscal year, customer, order, lines (JSON), `total_minor`, issued at, PDF key |
| `pool_accounts` | AWS account id, name, tier, role ARN, ExternalId, status |
| `pool_capacity` | pool account, Region, quota code, limit, used, checked at |
| `customer_homes` | customer, Region, pool account (unique per customer and Region) |
| `resources` | customer, family, product, pool account, Region, AWS name, state, parent resource (nullable: the instance of a disk, static IP or backup), config (JSON: the order configuration and the state saved at suspend, such as port rules and load balancer targets), deleted at. Each manual or final snapshot is its own row of family `backup` |
| `subscriptions` | resource, customer, term days, price snapshot, period start and end, auto renew, status |
| `operations` | resource, kind, state, step, attempts, `enqueue_seq`, `next_run_at`, last error, `idempotency_key` unique, payload (JSON), needs approval, approved by |
| `usage_records` | resource, metric, period (unique together), quantity (for metered items) |
| `domains` | customer, resource, name, TLD, Route 53 operation id, status, expires at, hosted zone, registrant contact (JSON, encrypted) |
| `dns_zones` | customer, resource, name, hosted zone id, name servers, delegated at, status, notices sent at |
| `notifications` | customer (nullable), email (for visitors), channel (`email`, `sms`, `in_app`), template, payload, `dedupe_key` unique (for a reminder: subscription, period end and days), status, attempts, sent at, read at |
| `waitlist_entries` | customer (nullable), email (for visitors who are not signed in), product family, Region, reason (`capacity` or `flag_off`), notified at |
| `support_requests` | customer (nullable), name and email (for visitors who are not signed in), category, related resource (nullable), subject, message, status, handled by |
| `admin_users` | `cognito_sub` unique, role, status |
| `abuse_cases` | resource, source, status, notes |
| `discrepancies` | kind (`orphan`, `missing`, `cost`, `payment`), details (JSON), status |
| `audit_log` (A) | actor type and id, action, target type and id, IP, user agent, metadata (JSON) |

Constraints to implement in the database, not only in code: unique keys above; `amount_minor > 0`; a deferred constraint trigger that rejects a ledger transaction whose debits and credits differ; `wallets.balance_minor >= 0`.

State values: `payments.status` is `initiated`, `redirected`, `credited`, `failed`, `cancelled`, `expired` or `review` (`pending` is the display name of `initiated` and `redirected`; `review` is shown as pending with a note to contact support, 9.2); `resources.state` is `creating`, `active`, `stopped`, `suspended`, `destroyed` or `failed`; `orders.status` is `paid`, `fulfilled` or `reversed`.

## 8. Pricing engine

Inputs: `aws_price_usd`, the market's current FX rate, and the market's ordered steps. Output: base and one amount per step, all in minor units.

```
base_minor = round_half_up(aws_price_usd * fx_rate * 100)
running    = base_minor
for step in steps:                     # in order
    basis        = base_minor if step.base == "aws" else running
    step.amount  = round_half_up(basis * step.rate)
    running     += step.amount
total_minor = running
```

Launch configuration for market `BD`. The block shows the Bengali label of each step. A stored step has `label` with `bn` and `en`, as `PricingStep` in Section F requires; the English labels are Korea VAT, Bangladesh VAT, Processing fee and Service charge. Each step code posts to one ledger account of 9.1: `korea_vat` to `vat_korea_payable`, `bd_vat` to `vat_bd_payable`, `processing_fee` to `processing_fee_income`, `markup` to `markup_income`. A rule with a step code that has no account is not saved:

```json
[
  {"code": "korea_vat",      "label_bn": "কোরিয়ার VAT",     "rate": "0.10", "base": "aws"},
  {"code": "bd_vat",         "label_bn": "বাংলাদেশের VAT",   "rate": "0.05", "base": "aws"},
  {"code": "processing_fee", "label_bn": "প্রসেসিং ফি",       "rate": "0.02", "base": "aws"},
  {"code": "markup",         "label_bn": "সার্ভিস চার্জ",      "rate": "0",    "base": "aws"}
]
```

Rules:

- A 30-day term is charged the full AWS monthly price of the bundle.
- An order stores the FX rate, the rule version and every step amount. Changing a rate later never changes an existing order or the current period of a subscription. Renewals use the rate and rule in force at renewal time.
- The admin editor shows a preview of five sample products before a new rate or rule is saved, and saves a new row with an effective time.
- Switching `bd_vat.base` to `"subtotal"` (and moving it last) gives the alternative where 5% VAT is charged on the full value. Both must work. Switching the base without moving the step gives a third result that matches neither (5 USD at FX 127: bd_vat 3493, total 74613), so `savePricingRule` refuses a rule in which a step with base `subtotal` is not the last step.

Test vectors (FX 127, launch configuration, all amounts in paisa):

| aws_usd | base | korea_vat | bd_vat | processing_fee | total |
| --- | --- | --- | --- | --- | --- |
| 5 | 63500 | 6350 | 3175 | 1270 | 74295 |
| 7 | 88900 | 8890 | 4445 | 1778 | 104013 |
| 12 | 152400 | 15240 | 7620 | 3048 | 178308 |
| 24 | 304800 | 30480 | 15240 | 6096 | 356616 |
| 44 | 558800 | 55880 | 27940 | 11176 | 653796 |
| 84 | 1066800 | 106680 | 53340 | 21336 | 1248156 |
| 9.50 | 120650 | 12065 | 6033 | 2413 | 141161 |
| 15 | 190500 | 19050 | 9525 | 3810 | 222885 |
| 10 | 127000 | 12700 | 6350 | 2540 | 148590 |
| 18 | 228600 | 22860 | 11430 | 4572 | 267462 |
| 1 | 12700 | 1270 | 635 | 254 | 14859 |
| 2.50 | 31750 | 3175 | 1588 | 635 | 37148 |
| 0.50 | 6350 | 635 | 318 | 127 | 7430 |
| 3.50 | 44450 | 4445 | 2223 | 889 | 52007 |

Extra vectors: FX 124.77 and aws_usd 5 gives base 62385, steps 6239, 3119, 1248, total 72991. With the alternative configuration (bd_vat last on subtotal) and FX 127, aws_usd 5 gives bd_vat 3556 and total 74676. Negative vector: `bd_vat` switched to `subtotal` but left in second place gives bd_vat 3493 and total 74613; a rule in that shape must be refused.

Catalog sync sources: `GetBundles`, `GetBlueprints`, `GetRelationalDatabaseBundles`, `GetRelationalDatabaseBlueprints`, `GetContainerServicePowers`, `GetBucketBundles` per launch Region (transfer allowances differ by Region), `GetDistributionBundles` once in `us-east-1` (distribution APIs answer only there), Route 53 Domains `ListPrices` for TLDs. Prices without an API (load balancer, block storage per GB, snapshot per GB, hosted zone) are admin-editable config rows seeded from the AWS pricing pages.

Instance bundles: `GetBundles` returns bundles with a public IPv4 address (`publicIpv4AddressCount` 1, from 5 USD) and IPv6-only bundles (0, from 3.50 USD). At launch `catalog-sync` marks active only the bundles with a public IPv4 address and stores IPv6-only bundles inactive, because the Linux adapter always attaches a static IP and AWS does not allow a static IP on an IPv6-only instance.

## 9. Wallet, ledger and EPS

### 9.1 Postings

| Event | Debit | Credit |
| --- | --- | --- |
| Top-up verified | `gateway_clearing` | `customer_wallet` |
| Purchase or renewal | `customer_wallet` (total) | `revenue_aws_base` (base), `vat_korea_payable`, `vat_bd_payable`, `processing_fee_income`, `markup_income` (one line per step whose amount is above 0; a step of 0, such as the markup at launch, stays in the price snapshot and posts no line) |
| Provisioning failed, automatic reversal | the same accounts, reversed | |
| Metered daily charge (snapshot storage, transfer packs) | `customer_wallet` | same split as a purchase |
| Admin credit or debit | `adjustments` or `customer_wallet` | the other one, with reason. Posted when the adjustment is approved (at once below the limit) |
| Refund paid out manually | `customer_wallet` | `refunds` |

The wallet balance is the sum of its ledger entries. `wallets.balance_minor` is a cache updated in the same transaction and checked by a nightly job.

Idempotency keys of ledger transactions are derived on the server, so a repeated request or an overlapping job run cannot post twice: `topup:<payment id>`, `order:<hash of the draft token>` (new orders), `order-reversal:<order id>`, `renew:<subscription id>:<new period start>` (every renewal, automatic or manual), `meter:<resource id>:<metric>:<period>`, and for an admin posting the id of its request row. A key sent by a client is never used alone. A repeated request returns the first result.

### 9.2 EPS top-up

Follow the team's `eps-payment-gateway` skill for endpoints, hashing and the Next.js client. Where the skill and this plan differ, this plan wins: credentials never come from an `.env` file, an amount is never passed through `Number()` (R4), and the verify payload is not written to logs (R14). Platform rules on top of it:

1. `merchant_transaction_id` is generated by the server, unique, at least 10 characters, and stored before calling EPS.
2. Success, fail and cancel URLs are fixed route handlers under `/pay/eps/`. They read only the transaction id from the redirect, then call the verify API. They never trust a status in the URL.
3. Credit only when the verify response says success (accept the known variants: `Success`, `SUCCESS`, `COMPLETED`), the amount equals the stored payment (EPS returns no currency; convert `TotalAmount`, a decimal string such as `1500.00`, to paisa with integer arithmetic, never with `Number()`, and treat any difference as a mismatch), and the payment row is still uncredited. Lock the payment row with `SELECT ... FOR UPDATE`.
4. The sweeper verifies payments in `initiated` or `redirected` state every 5 minutes for 24 hours, then marks them `expired`. `initiated` and `redirected` are what Section F, the screens and Section M call pending. If InitializeEPS returns an error the payment is marked `failed` at once. A payment that EPS reports as successful but that fails the amount check is never credited and never expired: it gets the state `review`, a `discrepancies` row of kind `payment` and an alert to finance, and the customer sees it as pending with a note to contact support.
5. Rate limit top-up initiation per customer and per IP. Minimum and maximum top-up amounts are market config.
6. EPS has no refund API in its current public version. Refunds are processed manually through the EPS dashboard and recorded by a `finance` admin.
7. EPS credentials exist only as SST Secrets. They are never printed, logged, or sent to the client.

### 9.3 Invoices

Each purchase and renewal creates an invoice with one line for the AWS service price (the AWS list price converted at the stored FX rate) and one line per pricing step whose amount is not 0, matching the layout of TiCON Cloud's current invoice (sample pending, Section 17). The PDF is produced by the `invoice-renderer` function from the same HTML template as the invoice page, with self-hosted fonts. VERIFY that Bengali conjuncts and numerals are shaped correctly in the PDF. If that is not proven on day 2, ship an English PDF and keep the Bengali invoice on screen. A top-up produces a payment receipt, not a tax invoice. The VAT point for prepaid top-ups is an open item for the VAT consultant; keep invoice creation behind a single function so the trigger can move.

## 10. Provisioning

### 10.1 Operations

- An operation is a row with a kind, a step and a state: `queued`, `running`, `waiting`, `succeeded`, `failed`, `needs_approval`, `needs_attention`.
- The `provisioner` handles one step per invocation and saves the new step. When the next step can run at once, it sends the operation to the queue again. When it has to wait for AWS (instance pending, database creating, snapshot pending, domain registration in progress) or retry after an error, it sets the state `waiting` with `next_run_at` and sends nothing, because a FIFO queue has no per-message delay. The `scheduler` (every minute) sends `waiting` operations whose `next_run_at` has passed and `queued` operations still unsent 2 minutes after their `next_run_at`, which also recovers a first message lost after the purchase committed.
- Every step is idempotent. Create steps use the deterministic AWS name, so a retry that finds the resource already present with the right tags continues instead of failing.
- After 5 failed attempts the operation becomes `needs_attention` and appears in the admin queue; no refund is posted yet. An admin then retries it (`retryOperation`, back to `queued`) or rejects it (`rejectOperation`). A create becomes `failed` only when it is rejected there or when its error can never succeed on a retry. `failed` is final and `retryOperation` is refused for it. The move to `failed` and the reversing ledger transaction are one database transaction, keyed by the order id, so the reversal is posted once. The same step releases the capacity, sets the subscription to `ended`, queues the removal of anything the create already made in AWS and notifies the customer. If that removal fails, a `discrepancies` row is opened; the refund stands.
- Tags on every AWS resource that supports tags: `tc:env`, `tc:customer`, `tc:resource`, `tc:order`. Instances also get `tc:os` (`linux` or `windows`) at create and at restore; the `TcAccessDetails` policy reads it (Section 6.3). Static IPs and automatic snapshots take no tags; for them the retry rule and the reconciler use the deterministic name or the parent instance, matched against `resources`.

### 10.2 Capacity and limits

- `pool_capacity` rows per pool account, Region and quota code: `instance_vcpu`, `static_ip`, `database`, `load_balancer`, `container_service`, `certificate_active`, `certificate_365d` (certificates created in the last 365 days: 20 per Region, fixed), `disk_gb` (per Region), `bucket`, `distribution` (per account). Certificates for distributions are always created in `us-east-1`, so that Region has its own rows for both certificate codes.
- Reservation happens inside the purchase transaction with `SELECT ... FOR UPDATE` on the affected rows. Sell up to the limit minus a configurable reserve per quota (0 at launch while limits are small; raise it after quotas grow). Release on delete and on failed create. The hourly inventory run corrects `used` from live data, but never below the live count plus the reservations of create operations not yet `succeeded`; `certificate_365d` has no live count and is kept from the platform's own records.
- If the home account is full the order is refused with a waitlist option. It is never placed in another account silently.
- Default limits for risk tier `new` (admin-editable): at most 2 instances, bundle price at most 24 USD, no Windows, no containers, at most 1 static IP each. Tier `trusted`: at most 20 instances until raised by admin.
- Outbound port 25 stays closed (AWS default). Mail sending is not offered at launch.

### 10.3 Product adapters

One adapter per family in `packages/aws/adapters`, all implementing the interface below. `parseConfig` and `capacityNeeds` are pure functions in `packages/core/products` (schemas from `packages/core/validation`), so `createOrderDraft` and `placeOrder` use them without importing `packages/aws`; the adapter imports them from there:

```ts
interface ProductAdapter<C> {
  family: ProductFamily;
  parseConfig(input: unknown): C;                      // zod
  capacityNeeds(config: C): CapacityNeed[];
  aws: {
    create(ctx: OpCtx<C>): Promise<StepResult>;        // multi-step, idempotent
    suspend(ctx: OpCtx<C>): Promise<StepResult>;
    resume(ctx: OpCtx<C>): Promise<StepResult>;
    finalSnapshot(ctx: OpCtx<C>): Promise<StepResult>; // no-op where not supported
    destroy(ctx: OpCtx<C>): Promise<StepResult>;
    purgeSnapshots(ctx: OpCtx<C>): Promise<StepResult>;
    describe(ctx: OpCtx<C>): Promise<LiveState>;
    action(kind: OperationKind, ctx: OpCtx<C>): Promise<StepResult>; // reboot, stop, start, ports, static IP, backups, disks, targets, deploy, records
  };
}
```

| Family (gate) | Create | Suspend at grace | Final snapshot and destroy | Notes |
| --- | --- | --- | --- | --- |
| Linux instance (core) | `ImportKeyPair` if missing, `CreateInstances` with bootstrap user data, wait for running, `AllocateStaticIp`, `AttachStaticIp`, `PutInstancePublicPorts` | Save the port rules, then close all public ports (VERIFY that `PutInstancePublicPorts` with an empty list closes everything). Config switch allows `StopInstance` instead | `CreateInstanceSnapshot`, wait, `DeleteInstance`, `ReleaseStaticIp` | Restore with `CreateInstancesFromSnapshot`. The public IP changes after a restore; say so in the UI |
| Firewall, static IP (core) | `PutInstancePublicPorts`, `OpenInstancePublicPorts`, `CloseInstancePublicPorts`, `AttachStaticIp`, `DetachStaticIp` | with the instance | with the instance | Validate protocols, port ranges and CIDRs with zod |
| Backups (core) | `CreateInstanceSnapshot`, `EnableAddOn` (AutoSnapshot), `DeleteInstanceSnapshot` | keep | manual backups and the final snapshot: purge 14 days after the instance is deleted. AWS deletes automatic backups together with the instance, so after a destroy only manual backups and the final snapshot remain, and the Destroy tab says so | Snapshot storage is metered daily per GB |
| Block storage (core) | `CreateDisk` in the instance's AZ, `AttachDisk` | with the instance | `CreateDiskSnapshot`, `DetachDisk`, `DeleteDisk` | VERIFY attach and detach rules for running instances |
| Windows instance (A) | As Linux, with the pool's default key pair, and without automatic backups: Lightsail does not support the AutoSnapshot add-on on Windows instances, so the create option and the Backups switch are hidden and backups are manual | as Linux | as Linux | Password is fetched on demand by `access-details`, shown once, never stored. UI tells the customer to change it at first login |
| Managed database (A) | `CreateRelationalDatabase` with `publiclyAccessible=false`, wait for available | `StopRelationalDatabase` (AWS restarts it after 7 days, grace is 48 hours) | `DeleteRelationalDatabase` with a final snapshot | Password comes from `GetRelationalDatabaseMasterUserPassword` on demand (VERIFY that Lightsail generates it when omitted). Public mode is a customer toggle with a warning |
| Load balancer (A) | `CreateLoadBalancer`, `AttachInstancesToLoadBalancer`; optional `CreateLoadBalancerTlsCertificate` and `AttachLoadBalancerTlsCertificate` | `DetachInstancesFromLoadBalancer` (remember the list) | `DeleteLoadBalancer` | Targets must be the customer's instances in the same account and Region. HTTPS uses the scarce certificate quota |
| Object storage (A) | `CreateBucket`. Access keys are created on demand by `access-details` (`CreateBucketAccessKey`), because AWS returns the secret only in that response; the secret is returned once (U9) and never stored | Make the bucket private and delete its access keys | `DeleteBucket` with force after 14 days | 20 buckets per pool account; 2 keys per bucket |
| Container service (B) | `CreateContainerService`, `CreateContainerServiceDeployment` | `UpdateContainerService` with `isDisabled=true` (AWS still bills it) | `DeleteContainerService` | Public registry images only at launch. Do not hand out registry logins (`CreateContainerServiceRegistryLogin`), they are account-wide |
| CDN (B) | `CreateDistribution` in `us-east-1` | `UpdateDistribution` with `isEnabled=false` | `DeleteDistribution` | Origin is the customer's own instance, load balancer or bucket. Custom domains need a certificate |
| DNS (B) | Route 53 `CreateHostedZone` in `tc-dns` | none | Delete record sets, `DeleteHostedZone` | Section 12 |
| Domain (B) | Route 53 Domains `RegisterDomain` in `tc-dns` | none | none (expires) | Section 12. `RegisterDomain` also creates a hosted zone: adopt it, never create a second one |

### 10.4 Tenant isolation inside a pool account

Lightsail firewall rules filter only traffic that arrives through the public IP. Instances in the same account and Region can reach each other on private IPs. Databases without public mode are reachable by every Lightsail resource in the same account and Region. Container services have a private domain reachable the same way. The platform therefore adds its own isolation:

1. Bootstrap firewall on every instance through user data, from a fixed template. It installs a systemd unit that applies the rules on every boot and does not depend on `ufw`:
   - read the VPC CIDR from instance metadata (`network/interfaces/macs/<mac>/vpc-ipv4-cidr-block`) with an IMDSv2 session token, because Amazon Linux 2023 and Ubuntu 24 blueprints have IMDSv2 by default and a request without a token can be refused; expected value `172.26.0.0/16` (VERIFY). If the read fails, the unit uses the expected value and still applies the rules, so it fails closed;
   - allow established and related traffic;
   - allow UDP source port 67 to destination port 68 (DHCP);
   - allow TCP 80 from the VPC CIDR (Lightsail load balancer traffic and health checks; load balancers are created with `instancePort` 80, so 443 stays closed). Port 80 is therefore reachable from other servers in the same pool account and Region, and private traffic between a customer's own servers is blocked; the Networking tab says both;
   - drop everything else whose source is inside the VPC CIDR, in a hook that runs before NAT and forwarding (for example an nftables `inet` table at prerouting), so ports published by Docker are covered too.
   Windows gets the equivalent Windows Firewall block rules in a PowerShell launch script (block rules win over allow rules there, so block the port ranges around 80 and UDP 68 rather than everything). VERIFY both scripts on every blueprint that is offered; a blueprint is listed in the catalog only after its bootstrap passes the isolation test.
2. Per-customer SSH key pairs. The private key is generated in the browser or supplied by the customer; only the public key reaches the platform. Start with RSA keys; allow ED25519 only if `ImportKeyPair` accepts it (VERIFY).
3. The pool's default key pair is used only for Windows. `DownloadDefaultKeyPair` is denied to every platform role.
4. Database passwords are generated, at least 24 characters, and shown on demand. The panel recommends TLS connections.
5. The UI never describes a container service without a public endpoint as "private".
6. Customers who need hard isolation get a dedicated pool account (a config row), sold as a separate option later.
7. Isolation test in `tests/isolation` (runs in `tc-pool-dev`): two instances owned by different test customers; B cannot open TCP 22, 443, 3306, a high TCP port or a UDP port on A's private IP, and the test records that B can open TCP 80; B cannot open a port that Docker publishes on A; a load balancer health check to A passes; DHCP renewal on A works after a reboot. Instances are dual-stack by default and every IPv6 address is public, so the test also has an IPv6 case: B cannot open a port on A's IPv6 address that A's IPv6 firewall does not allow, and a rule sent with IPv4 sources only leaves that port closed for IPv6 (VERIFY both). Until both hold, instances are created with `ipAddressType` `ipv4`.

## 11. Lifecycle engine

Subscription states: `active`, `grace` (resource suspended, data intact), `retained` (resource destroyed, final snapshot kept), `ended` (snapshots purged). All timings are config values read through an injectable clock so the whole cycle can be tested in minutes.

| When | Action |
| --- | --- |
| 7, 3 and 1 day before period end | Reminder by email with the renewal amount at today's rate and the wallet balance; SMS only at 1 day (16.14) |
| Period end, auto-renew on, wallet funded | Charge, extend 30 days, invoice |
| Period end, not renewed | State `grace`. Suspend the resource (Section 10.3). Notify |
| During grace | Customer pays: resume the resource, new period starts from the old period end. Paying means `renewNow`, or, with auto-renew on, the `scheduler` itself: it tries the renewal again on every run and renews as soon as the wallet covers the amount |
| Period end + 48 hours | State `retained`. Final snapshot, then destroy the resource. Needs admin approval until 2026-12-01. Notify |
| During retention | Customer pays: restore from the final snapshot, new period starts at restore time. A family without a final snapshot (load balancer, container service, CDN, DNS) keeps its configuration in `resources.config` and is created again from it; its endpoint changes and the badge and email say "settings kept" |
| Destroy + 14 days | State `ended`. Purge snapshots. Notify |
| Any time | A resource suspended by an admin (`suspendResource`) stays suspended: a renewal or payment never resumes it; only an admin action does |

Metered items: snapshot storage is charged daily at (GB x price per GB-month / 30). Data transfer is measured hourly from instance metrics by the `reconciler` through `TcReader` and written to `usage_records`; notify at 80% and 100% of the bundle allowance; above 100% buy 50 GB packs from the wallet if the customer enabled it, otherwise close public ports until the next period. If a daily charge cannot be paid the item enters the same grace flow.

## 12. Domains and DNS

All calls run in `tc-dns`. Route 53 Domains uses the `us-east-1` endpoint.

- TLD catalog: `ListPrices` daily into `tlds`. Show every TLD. TLDs that require extra parameters or eligibility proof are listed too, but their orders go to an admin review step before `RegisterDomain`.
- Search: `CheckDomainAvailability`. Price: registration price through the pricing engine, per year.
- Register: collect registrant contact details from the customer (the customer is the registrant), privacy protection on where the TLD supports it, `AutoRenew=false`. Poll `GetOperationDetail`. The registrant must confirm the verification email or the domain is suspended by the registry; show that status and offer `ResendContactReachabilityEmail`. `setNameServers` calls `UpdateDomainNameservers`.
- `RegisterDomain` itself creates a Route 53 hosted zone with the domain's name in `tc-dns` and points the domain's name servers to it; AWS bills it like any hosted zone, unless it is deleted within 12 hours. After the registration succeeds, find it with `ListHostedZonesByName` and record its id on the `domains` row. If the customer orders a DNS zone for that name, this zone is the one: save it as the `dns_zones` row and never call `CreateHostedZone` for a domain registered here. If the customer bought no DNS zone, keep the zone and count it as TiCON's cost until the owner decides what to do with it (Section 17). VERIFY in `tc-dns` with the first real registration.
- No refunds on registrations. Require a second confirmation that repeats the exact domain name.
- TiCON registers names for its customers, so it is a reseller under section 3.12 of the Route 53 Domain Name Registration Agreement. The domain flag stays off until the customer's domain registration agreement in `content/legal/` carries the provisions ICANN requires, names the sponsoring registrar or links a lookup, and links ICANN's Registrant Educational Information and Registrants' Benefits and Responsibilities pages, and until the order flow saves the customer's consent to the processing of registration data in `legal_acceptances`. No ICANN logo is shown.
- Renewal is prepaid: reminders 60, 30 and 7 days before expiry, then `RenewDomain` when the wallet is charged.
- Quota: 20 domains per account by default. Request an increase for `tc-dns` on Day 0.
- DNS zones: `CreateHostedZone` with the operation id as caller reference, except for a domain registered here, whose automatic hosted zone is adopted (see Register). Zone price is a 30-day product. Record editor for A, AAAA, CNAME, MX, TXT, SRV and CAA through `ChangeResourceRecordSets`; the apex NS and SOA records are read-only.
- A zone is allowed only for a domain the customer registered here or declares to control. Zones that are not delegated to their Route 53 name servers within 14 days are removed after two notices.
- Transfer out is handled by support at launch.

## 13. Admin panel, version 1

| Area | Functions |
| --- | --- |
| Customers | Search, view, KYC review with document viewer, suspend, risk tier, limits |
| Wallets | Ledger view, manual credit or debit with reason and approval, payment lookup and re-verify |
| Pricing | FX rate, pricing steps per market with preview, config prices, catalog sync status |
| Products | Feature flags per market, blueprint allow-list |
| Capacity | Limits and usage per pool account, Region and quota; add pool account; waitlist |
| Operations | Queue of failed and waiting operations, approve destructive actions, retry |
| Abuse | Cases, suspend resource or customer within one action, notes |
| Reconciliation | Orphans, missing resources, cost variance, payment mismatches |
| Audit | Search the audit log |
| Support | Customer support requests: reply by email, close |
| Admin users | Invite, set role, disable |

Routes, actions, roles and priorities for each area are in Section 16.12.

## 14. Work packages

Run tracks in parallel in separate worktrees: A (core and money: WP0, WP1, WP3), B (provisioning: WP4, WP5, WP6, WP7), C (identity and UI: WPU, WP2, WPP, and the screens of every package), D (admin: WP8). Packages are the boundaries; do not edit another track's package without noting it in `JOURNEY.md`.

Screens belong to the work package named in Section 16. A work package that owns screens is done only when those screens work against real data on staging in `bn` and `en` and pass the checks of Section 16.16. Track C builds each screen against the Server Actions and repository functions that tracks A, B and D expose. Until an action exists the screen uses a typed stub with the same signature.

UI review checkpoint: Thursday 12, evening. Sign-up, top-up and the create-server flow are shown to Moshiur on staging in the mockup's look, so changes to look or wording land before the weekend.

Each work package is broken into session-sized tasks in Section E.3, and each day ends with a gate of Section G.

| WP | Day | Scope | Acceptance tests |
| --- | --- | --- | --- |
| WP0 Foundation | Wed 11 | Monorepo, SST app with stages, VPC, RDS and proxy, Cognito pools, queue, buckets, WAF, CI (lint, typecheck, test), the Claude Code kit of Appendices P to T | `sst deploy --stage staging` succeeds; database is not reachable from the internet; a hello page loads through CloudFront; CI is green |
| WP1 Data and pricing | Wed 11 | Schema and migrations, database roles, pricing engine, markets, FX and rules, catalog sync from `tc-pool-dev` | All Section 8 vectors pass; no application role can UPDATE `ledger_entries`; catalog shows real bundles with BDT prices |
| WP2 Identity | Wed 11 | Sign-up, sign-in, sessions in cookies, phone OTP, KYC upload and status | JWT tampering is rejected; OTP limits hold; KYC object is not readable by the web role; no resource creation before `verified` (proved in WP4-T4) |
| WPU UI kit and shells | Wed 11 | Section 16.3 to 16.7: theme sync, fonts, tokens, component kit, four shells, i18n scaffolding, `/dev/ui` gallery | The gallery passes the checks of Section 16.16 that apply to it; the build output has no file from the theme's `assets/js` |
| WP3 Wallet and EPS | Thu 12 | Ledger, wallet, top-up flow, sweeper, receipts, invoice data | Real top-up credits once; replayed callback credits nothing; forged success URL credits nothing; amount mismatch credits nothing; balance equals ledger sum |
| WP4 Provisioning core | Thu 12 to Fri 13 | Pool accounts and roles, capacity, operations and queue, Linux instance adapter, keys, bootstrap firewall, static IP, firewall rules | Paid order yields a running instance reachable by SSH with the customer key; a failed create refunds once; isolation test passes; web role cannot assume `TcProvisioner` |
| WP5 Instance extras and lifecycle | Fri 13 | Snapshots, auto backups, disks, metrics through `reader`, reboot, stop and start, lifecycle engine, scheduler, notifications, restore | One test instance goes through renew, grace, suspend, final snapshot, destroy, restore and purge on the test clock |
| WP6 Gate A | Sat 14 | Windows, managed database, load balancer, object storage adapters | Each adapter passes create, suspend, resume, destroy on the test clock in `tc-pool-dev` |
| WP7 Gate B and metering | Sun 15 | Containers, CDN, DNS, domains; snapshot and transfer metering; reconciler | Each adapter passes its cycle; reconciler reports zero unexplained resources and cost variance under 2% |
| WP8 Admin | Sat 14 to Sun 15 | Sections 13 and 16.12 | Admin without MFA cannot sign in; admin outside the allowlist gets 403; every action writes an audit row |
| WPP Public pages | Sat 14 | The P0 pages of Section 16.8, fed by the live catalog; metadata, structured data, sitemap | Prices on `/pricing` equal the pricing engine output for the same products; public pages are indexable and panel routes are `noindex`; Lighthouse accessibility and SEO scores of 90 or more on a phone profile |
| WP9 Hardening | Mon 16 | Section 15, backup restore drill, 10 to 20 beta customers with real payments, final legal page content, wording pass in `bn` and `en`, signed-in support form | Every Section 15 item is checked with evidence in `JOURNEY.md` |
| WP10 Launch | Tue 17 | Feature flags on for products that passed, monitoring, on-call | First-day dashboard: payments verified, no stuck operations, no dead-letter messages |

## 15. Security gate before launch

- [ ] Web and admin function roles have no `sts:AssumeRole` permission (checked in IAM and by a test that tries it).
- [ ] RDS has no public endpoint; security group allows only the proxy; TLS is forced.
- [ ] No secret in the repo history or client bundles (secret scan in CI). After the Playwright P0 run a script searches the staging log groups for the test password, tokens, document number, full phone and email and finds none (R14).
- [ ] Every customer endpoint has a passing cross-tenant test.
- [ ] EPS: replay, forged redirect, amount mismatch and double callback tests pass.
- [ ] Ledger: balance check job reports zero differences; no negative wallet.
- [ ] Rate limits active on sign-in, OTP, top-up and order endpoints (WAF and application).
- [ ] Security headers: CSP with nonces, HSTS, `X-Content-Type-Options`, `frame-ancestors 'none'`, `Referrer-Policy`.
- [ ] Cookies are `HttpOnly`, `Secure`, `SameSite=Lax`; Server Actions accept only same-origin requests.
- [ ] Uploads: size and type limits enforced by the presigned policy; bucket is private.
- [ ] Admin: separate pool, MFA required, IP allowlist enforced, all actions audited. A direct request to the Lambda function URL of `web` or `admin` returns 403.
- [ ] Isolation test passes in each launch Region.
- [ ] SCPs attached to the pool OU and `tc-dns`; the provisioner role cannot use a denied action.
- [ ] CloudTrail and GuardDuty on in every account; dead-letter, 5xx and reconciliation alarms deliver to on-call.
- [ ] Database restore from a point-in-time backup tested once.
- [ ] `pnpm audit` shows no high or critical issue.
- [ ] Each pool account has a monitored security alternate contact for AWS abuse notices, and the abuse runbook (suspend within 24 hours) is written.
- [ ] No page requests a third-party origin: fonts, scripts, styles and images are self-hosted. The only cross-origin traffic from the browser is the KYC upload to the platform's own bucket and the navigation to EPS.
- [ ] No file from the mockup's `assets/js`, `assets/php` or `order-form` folders is in a build output, and `design/mockup/` is excluded from every build.
- [ ] No page, API response, email or SMS that a customer can see contains an AWS account id, an ARN, a pool account name, an internal AWS resource name or raw AWS error text (rule U6). Exceptions: the names and addresses that rule U6 allows because the customer needs them (the bucket name, the default domain of a container service, and the endpoints of databases and distributions).
- [ ] No developer machine and no Claude Code session holds credentials for `tc-platform`, the management account or a customer pool account. Production is deployed only by the CI role after approval.
- [ ] Shell and template characters in every free-text field reach no AWS name, tag or user data (R11).
- [ ] With EPS verify, the KYC lookup or capacity stubbed to fail, the action is refused (R16).
- [ ] An absolute or `//` value of `next` is ignored (U12); a flag-off family returns `flag_off` from `placeOrder` (R12).

## 16. Screens and UI

Priority column in this section: P0 is needed on launch day (core gate). P1 opens with its launch gate (A or B) or during launch week. P2 comes after launch.

### 16.1 What the mockup is

The mockup zip received on 2026-11-10 is the unmodified ThemeForest item "Antler - Hosting Provider & WHMCS Template", version 4.5.0, by inebur. Keep its contents in the private repo under `design/mockup/` as a read-only reference. Nothing is imported from that folder directly; `scripts/sync-theme.ts` copies the shipped files (16.3).

| Folder in the zip | Contents | Use |
| --- | --- | --- |
| `template/` | 57 static HTML pages of a hosting company website and `assets/` (Bootstrap 5.2.3, theme CSS, jQuery 3.7.1 with plugins, icon fonts, patterns, images) | The look of the product and the layouts named in 16.6 to 16.12 |
| `order-form/antler/` | 26 Smarty `.tpl` files, a skin for the WHMCS `standard_cart` order form | Reference for order states and wording. Not code for this product |
| `whmcs-template/antler/` | 192 Smarty `.tpl` files of the WHMCS client area (client area home, add funds, invoices, product details, domains), built on the WHMCS Six theme (Bootstrap 3.4.1, jQuery 1.12.4), with its own `assets/`, `css/` and `js/` folders; 825 files in all | Visual reference for panel screens. Not code for this product, and nothing from it is shipped (rule U2) |
| `email/` | One HTML email layout: `index.html`, `header.html`, `footer.html`, `global.css` | Layout of transactional emails (16.14) |
| `newsletter/` | A newsletter layout | Not used at launch |
| `graphic/` | Four Illustrator files with the Antler logo and artwork | Not used. The TiCON Cloud logo comes from the `ticoncloud` site repo |
| `documentation/` | The theme's own documentation | Reference |
| `changelog(4.5.0).rtf` (a file, not a folder) | The theme's change log, top entry version 4.5.0 of 2026-10-24 | Read it before every theme update (16.3) |

Facts that shape this section:

- Nothing in the zip is customized. Titles, logo, text, USD prices and form targets are the theme's demo content. The mockup defines how the product looks, not what its screens contain.
- The `template/` pages have no customer panel: no page shows a dashboard, wallet, server management, KYC, invoice or admin screen. The theme's WHMCS client area is in `whmcs-template/antler/` as Smarty templates for WHMCS (client area home, add funds, invoices, product details, domains), not as pages that open in a browser. It is a visual reference only: `scripts/sync-theme.ts` copies nothing from it. Sections 16.9 to 16.12 specify those screens and compose them from the theme's own blocks.
- With no saved settings the pages render with `data-layout="wide"`, `data-color="pink"`, `data-background="dark"`, `data-font="opensans"`, `data-header="static"`, `data-radius="defaultradius"` and `data-textdirection="ltr"` on `<body>` (checked by loading the pages in a browser). The values in `assets/js/settings-init.js` are not applied while its settings panel is switched on. The theme also has the color schemes `blue`, `green` and `black` and the background `light`. Each is one attribute. The background `origin` has only four CSS rules and `modern` has none; do not use them.
- The shipped CSS has no external URL and no `@import`. The request to Google Fonts is made only by the theme's JavaScript, which is not shipped.
- Licence: an Envato licence covers one end product, which for a site theme is one customized website. Under Envato's licence FAQ a Regular License is enough while visitors can use the site without paying for access to it, and payment for a separate product or service does not require the Extended License. This is a reading of the FAQ, not legal advice. Before launch confirm that the licence used here is not already used on another site (Section 17).

### 16.2 UI rules

These go verbatim into `.claude/rules/ui.md` (Appendix R). `CLAUDE.md` carries a one-paragraph summary.

| # | Rule |
| --- | --- |
| U1 | The mockup is the look. Reuse its CSS classes and layouts; do not redesign. Where a screen has no mockup page, compose it from the kit in 16.6 and the shells in 16.7. |
| U2 | Ship CSS, fonts and images only. No file from the theme's `assets/js`, `assets/php` or `order-form/` reaches a build: no jQuery, no plugin, no `scripts.js`, no `settings-init.js`, no i18next, no cookie plugin, no Smarty. |
| U3 | No third-party origin at runtime. Fonts, styles, icons and images are self-hosted. No analytics, chat or tag script without a recorded decision and a CSP entry. |
| U4 | No inline script except the nonce scripts of Next.js. No inline `style` attribute in server-rendered markup; use classes. CSP runs in report-only mode on staging and a screen is done only at zero violations. U4 applies to pages of `apps/web` and `apps/admin`; email templates in `packages/notify` (16.14) and the invoice HTML for `invoice-renderer` use inline CSS. |
| U5 | All text comes from `next-intl` messages in `bn` and `en`. No hard-coded strings in components. Bengali is written first. |
| U6 | AWS is named openly. Public pages, the panel, invoices and emails tell the customer that the service is 100% AWS: every server, database, disk, bucket, load balancer and container service is an Amazon Lightsail resource in the AWS Region the customer chose, and CDN, DNS and domains use Amazon Lightsail CDN and Amazon Route 53, which are global AWS services. Use the statements, names and wording rules of 16.13, which follow the AWS Trademark Guidelines. Still never shown to a customer: AWS account ids, ARNs, the pool account structure, internal AWS resource names and raw AWS error text. One exception: a name or address that the customer needs in order to use the resource is shown, namely the bucket name (it is part of the bucket URL), the default domain of a container service (it starts with the service name) and the endpoints of databases and distributions. Errors from AWS are mapped to platform messages. |
| U7 | Server Components by default. A component is a Client Component only when it holds interaction state. Data is read on the server through repositories (R8). No customer data in `localStorage` or `sessionStorage`. |
| U8 | Every form posts to a Server Action that follows R9, and shows field errors from the same zod schema. A button that changes state is disabled while its action is pending, and the action is idempotent (R7). |
| U9 | A secret shown to a customer (Windows password, database password, bucket secret key) is returned once in a Server Action response with `no-store`, is never part of a cached render, is never logged, and is hidden again after 60 seconds. |
| U10 | A destructive action needs a dialog in which the customer types the resource name, and a fresh sign-in (Section 6.1). |
| U11 | Every screen has loading, empty, error and flag-off states (16.13) and works at a width of 360 px. State is never shown by color alone. |
| U12 | A redirect target taken from a request (`next`) must be a relative path that matches an allow-list of route prefixes. |
| U13 | The theme's demo photos, avatars, partner logos, case study PDFs and videos are not shipped. |

### 16.3 Theme port

`scripts/sync-theme.ts` copies the files below from `design/mockup/template/assets/` to `packages/ui/theme/assets/`, and from there into `public/theme/assets/` of both apps. The `assets/` tree is mirrored because `theme.min.css` refers to its files with paths such as `../patterns/` and `../../assets/img/`. The root layout links the stylesheets with plain `<link rel="stylesheet">` tags in the order of the mockup's `<head>`: Font Awesome, icon fonts, Bootstrap, `vendors.min.css`, theme, and then `tc.css`. The script also copies `tc.css` to `public/theme/`, so it is linked last as a static file and the order is fixed.

| Shipped | Note |
| --- | --- |
| `css/bootstrap.min.css` | Bootstrap 5.2.3, CSS only |
| `css/vendors.min.css` and `img/filter/*.svg` | Unmodified. Base styles of `cd-filter-block` (radio, checkbox and select of `OptionGroup`) and of the slider under `PlanPicker`; `theme.min.css` builds on them |
| `css/theme.min.css` | Unmodified, so a theme update is a file swap. All product CSS goes into `packages/ui/styles/tc.css` |
| The 8 `patterns/*.svg` files that the theme CSS refers to | Background line patterns |
| `fonts/fonts.min.css`, `fonts/cloudicon/*`, `fonts/evafeat/*` | Line icon fonts used by plan cards and menus (`icon-*` classes) |
| `fonts/fontawesome/css/all.min.css`, `fonts/fontawesome/webfonts/*.woff2` | Font Awesome Free 6.4.2 |
| `apps/*.svg` (26 files) | Logos for image tiles, among them Ubuntu, Debian, CentOS, FreeBSD, Windows, WordPress, LAMP, Joomla, Magento, Drupal, GitLab, PrestaShop, Plesk and cPanel. An image without a logo uses a generic icon |
| The `fonts/svg/*.svg` files a component uses (the folder holds 306 line illustrations) | Imported as inline SVG at build time (16.5) |

| Never shipped | Why |
| --- | --- |
| `js/*`, `php/*`, and the whole `order-form/` folder | Rule U2 |
| `css/aos.min.css`, `css/rtl/*` | Animation styles that are not used. The RTL files come back only when a right-to-left market opens |
| `img/topbanner*.jpg`, `img/partners/*`, `img/avatars/*`, `img/blog/*`, `casestudy/*`, `videos/*` | Demo photos, logos of other companies, PDFs and videos (rule U13). The CSS classes that refer to them are not used |
| `img/logo.svg`, `img/logo-light.svg`, `img/symbol.svg`, `img/favicon.ico` | Antler branding. Replaced by TiCON Cloud files in the same roles |
| `locales/*` | Theme demo translations. Text comes from `next-intl` |

The script copies only the allow-list above. It reports every `url()` in a shipped stylesheet that points to a file that is neither shipped nor on the never-shipped list, so a theme update cannot add a silent dependency. Four referenced files are already missing in the zip and belong to unused classes: `img/arrow-right-2.png`, `img/arrow-left-2.png`, `img/arrow-left-2-act.png` and `fonts/evafeat/evafeat.svg`.

### 16.4 Tokens and typography

| Token | Value | Note |
| --- | --- | --- |
| Theme attributes, customer app | `data-layout="wide" data-color="pink" data-background="dark" data-font="opensans" data-header="static" data-radius="defaultradius" data-textdirection="ltr"` on `<body>` | What the mockup renders. Written by the root layout from one config object. No cookie, no script. The root layout also wraps all content in one `div.box-container.limit-width`, as every mockup page does: the theme's color, card and button rules apply only inside it |
| Theme attributes, admin app | The same with `data-color="blue"` and `data-background="light"`, and a fixed "OPS" label in the top bar | Staff must never mistake the admin panel for the customer panel |
| Colors on the dark background | Page `#15212a`, card `#101920`, text `#ffffff`, muted text `#6c757d` | Computed from the rendered mockup. Components use the helper classes `bg-colorstyle` (page sections), `bg-seccolorstyle` (cards), `mergecolor` and `seccolor` (text), not hex values |
| Colors on the light background | Page `#ffffff`, card `#ebeff5`, text `#212122` | Same classes |
| Accent | Pink `#ee5586`. Magenta `#a5215e` for plan specification blocks and badges (`bg-purple`) | |
| Buttons | Primary: yellow `#fdd700` with black text, pill shape (`btn btn-default-yellow-fill`), one per view. Secondary: `btn btn-default-pink-fill`. Tertiary: `btn btn-outline-pink`. Destructive: Bootstrap `btn btn-danger` | |
| Radius | Cards (`sec-main`) 12 px; plan boxes (`.pricing .wrapper`) 15 px; buttons and inputs are pills | From `defaultradius` |
| Other color schemes | `data-color="blue"`, `"green"` or `"black"` change the accent with one attribute. For TiCON Cloud brand colors add `data-color="ticon"` by copying the `[data-color="pink"]` rules of `theme.css` (about 89 selectors) into `tc.css` with the brand values | Decision in Section 17. Never edit `theme.min.css` |
| Light and dark switch | Optional, P2: a customer setting that flips `data-background` between `dark` and `light`, stored in a cookie that the server reads | Both backgrounds already work in the theme |
| Font | The theme's rules name `'Open Sans'` with `!important`. Define that family in `tc.css` from self-hosted files: Open Sans for Latin text, and a second `@font-face` with the same family name and the Bengali `unicode-range` that points to Noto Sans Bengali. Take the files and the `unicode-range` values from the Fontsource packages (`@fontsource-variable/open-sans`, `@fontsource-variable/noto-sans-bengali`; confirm the names at install) | Open Sans has no Bengali glyphs. One composite family means no theme rule needs an override |
| Bengali text | For `html[lang="bn"]`: body line height of at least 1.6, `letter-spacing: 0`, no `text-transform`, headings one step smaller where a title wraps to three lines at 360 px | VERIFY that conjuncts and the taka sign render correctly on Android Chrome and iOS Safari |
| Icons | Font Awesome Free 6.4.2 (`fas`, `far`, `fab`), the theme's `icon-*` line icons, inline SVG illustrations | Decorative icons carry `aria-hidden="true"` |
| Breakpoints | Bootstrap 5 defaults. Design each screen at 360 px first | Most customers will use a phone |

### 16.5 Behavior that the theme does with scripts

| In the mockup | How the theme does it | In this product |
| --- | --- | --- |
| Header and footer | `header.html` and `footer.html` are loaded with jQuery | Shell components (16.7) |
| Theme settings panel | `settings-init.js`, cookies, `section#settings` | Fixed attributes on `<body>` (16.4). The panel and its cookies do not exist |
| Loading overlay | `div#spinner-area`, hidden by script | Not rendered |
| Deferred blocks | `div.lazyload` keeps its content inside an HTML comment until a plugin reveals it | Render the content directly |
| Illustrations | `img.svg` files are fetched and replaced by inline `<svg>` so CSS can color them | Import each SVG as a React component at build time and keep its class names and ids |
| Translations | i18next with files in `assets/locales` | `next-intl` |
| Tabs | Script on `.tabs-header` and `.tabs-item` | `Tabs` component that sets the `active` class |
| Accordion | Script on `.accordion .panel-title` | `Accordion` component with the same classes |
| Dropdown, modal, offcanvas | Bootstrap JavaScript | Radix primitives with the Bootstrap classes; focus trap and the Escape key work |
| Plan slider | noUiSlider with five plans written inside `scripts.js` (`VPS1` to `VPS5`) | `PlanPicker` fed by the catalog (16.6) |
| Monthly and yearly switch | `#run-switch` | Not used. Every term is 30 days |
| Filters on domain and price lists | Client-side filter plugins | React state over data from the server |
| Carousels | Slick and Swiper | A static grid, or a CSS scroll-snap row on phones |
| Scroll animations | AOS | None. Do not copy `data-aos` attributes |
| Forms | Posts to the theme author's WHMCS demo and to `assets/php/form-process.php` | Server Actions (rule U8) |
| Cookie banner | `gdpr-cookie.min.js` | None at launch. Only the cookies needed for sign-in and locale are set, and the privacy page says so |
| Fonts | A Google Fonts link injected by script | Self-hosted (16.4) |

### 16.6 Component kit in `packages/ui`

| Component | Built from | Notes |
| --- | --- | --- |
| `Card` | `div.sec-main.sec-bg1.bg-seccolorstyle.noshadow` in `checkout.html` and `login.html` | Base surface for panel content |
| `StatTile` | `about.html`, `section#clientstats`: `div.wrapper.price-container` | Dashboard numbers |
| `PlanCard` | `index.html`, `section.pricing`: `div.wrapper` with `div.top-content` and `ul.list-info.bg-purple`; tag `div.plans.badge.feat` | Name, price per 30 days, four specification lines, one button |
| `PlanPicker` | `vps.html`, `section#custom`: `div.wpc-cloud-range` and `div.content-price` | Phones: a list of radio cards. Desktop: the slider look on a native range input. Plans, specifications and prices come from the catalog; nothing is hard-coded |
| `OptionGroup` | `configurator.html`: `div.cd-filter-block` with `ul.radios-filter.cd-filter-content`, and the `select-filter` variant | Radio, checkbox and select groups |
| `ImageTile` | `header.html`: `div.os` tiles; logos from `/theme/assets/apps/` | Operating system and application choice |
| `SummarySidebar` | `configurator.html` and `cart.html`: `aside#sidebar.sidebar` with "Selected Plan" and `div.ordersummary` | Live price summary. On phones it becomes a bar fixed to the bottom of the screen |
| `PriceBreakdown` | `cart.html` and `checkout.html`: `table.table.compare.min` | AWS service price, one line per pricing step, total. Rendered on the server from an order or a draft |
| `DataTable` | `cart.html`: `table.table.compare` inside `div.table-responsive-lg` | Under 768 px each row becomes a stacked card. Cursor paging |
| `Tabs` | `checkout.html` and `login.html`: `div.tabs-header` with `li.btn.btn-secondary`, and `div.tabs-item` | |
| `Accordion` | `elements.html`, `section#addons`: `div.accordion.faq` | FAQ and help |
| `Field` | `elements.html`, block "Form Inputs" | Label, pill input, hint, and error text tied to the input with `aria-describedby` |
| `Badge` | `.badge` with Bootstrap background classes | State mapping in 16.13 |
| `Button` | `elements.html`, block "Buttons" | Variants in 16.4; pending state |
| `Modal`, `ConfirmDestroy`, `Toast` | The Bootstrap modal markup of `cart.html`; Bootstrap toast | `ConfirmDestroy` asks the customer to type the resource name |
| `EmptyState`, `ErrorPage` | `404.html`: `section.sec-normal.notfound`; `soon.html` | One sentence and one action |
| `HelpStrip` | `index.html`: `div.help-container` with `a.help-item` | Support entry points under public pages |
| `SecretReveal`, `CopyField` | `Field` with buttons | Rule U9 |
| `StatusTimeline` | `Card` with a step list | Order and operation progress |
| `MoneyText`, `DateText` | None | The only places that format money and dates (16.13) |
| `LocaleSwitch`, `WalletChip` | `header.html`: the `section#drop-lng` pills and the yellow "CLIENT AREA" button | |

### 16.7 Shells

| Shell | Built from | Content |
| --- | --- | --- |
| `PublicShell` | `header.html`: `div.infonews` (top line), `div.menu-wrap` with `nav#menu` (main bar), `div.menu-wrap.mobile`. `footer.html`: `footer.footer` | Top line: one announcement and the support phone. Menu: Products (the open product families), Pricing, Domains (when Gate B is open), Help, language switch with two entries (Bengali and English), and a yellow button that says "Log in", or "Console" for a signed-in visitor. Footer: four link columns (Products, Company, Support, Legal), company name and address from Section 1, the EPS footer banner from the `eps-payment-gateway` skill assets, and the AWS statement with the trademark line of 16.13. Not used: the "Special Deals" offcanvas, the cart and bell icons, the four-language switch, the newsletter form |
| `AuthShell` | `login.html`: `section.fullrock-content` | Logo and one full-height card with two tabs |
| `AppShell` | No mockup page shows an app frame, so it is composed. Top bar: the `div.menu-wrap` bar without the top line. Left navigation: `aside#sidebar.sidebar.sec-bg1.bg-seccolorstyle` of `legal.html` (icon and label rows, the active row in the accent color). Content column: `div#sidebar_content` of the same page with `Card` blocks | Top bar: logo, language switch, `WalletChip` with the balance and a yellow "Top up" button, notification bell, account menu. Navigation: Dashboard, Cloud Servers, Databases, Object Storage, Load Balancers, Containers, CDN, Domains and DNS, Wallet, Invoices, Support, Settings. A family whose flag is off is hidden, or shown with a "soon" tag when the market config asks for it. No pink title band inside the panel: each screen starts with a compact row of breadcrumb, title and one primary button. Under 992 px the navigation moves into the offcanvas of `header.html` (`div#offcanvasWithBackdrop`). A slim footer carries the short AWS statement and the trademark line of 16.13 |
| `AdminShell` | `AppShell` with the admin attributes of 16.4 | Navigation from 16.12, the "OPS" label, the signed-in admin and role |

Locale routing in both apps: `bn` at the root, `en` under `/en` (`next-intl`, `localePrefix: 'as-needed'`, `localeDetection: false`, so the `Accept-Language` header never redirects `/` to `/en`). Playwright runs with `locale: 'bn-BD'`. After sign-in the customer's saved locale decides.

### 16.8 Public pages

All are Server Components, indexable, with a canonical URL, `hreflang` for `bn` and `en`, structured data (`Organization`, `Product` with `Offer` in BDT, `FAQPage`, `BreadcrumbList`), `sitemap.xml` and `robots.txt`. Every price comes from `catalog_products` through the pricing engine. Plan cards and price tables show whole taka rounded up, with the note that prices include VAT and fees and are for 30 days. Where a plan's specification differs by location (the data transfer allowance in Mumbai is half of Singapore's), cards and tables show the value for each location. Each public page names the AWS service in its title, description and first paragraph in the form of 16.13 (for example "Cloud Server, built on Amazon Lightsail"), because customers look for AWS by name.

| Route | Mockup page | Content | P |
| --- | --- | --- | --- |
| `/` | `index.html` | Hero (`section.top-header`) with the AWS statement of 16.13, three `PlanCard` blocks fed by the catalog (cheapest open plan of three families), "Why TiCON Cloud" tiles (`section.services`), `HelpStrip`. Not used: the case study block and the map of seven datacenters (state the two launch locations as text) | P0 |
| `/pricing` | `pricing.html` | One tab per open family; plan boxes and the comparison table (`table.table.compare`). Not used: carousel and slider demos | P0 |
| `/products/cloud-servers` | `vps.html` | Plan cards, feature blocks (`section#features`), `PlanPicker` (`section#custom`), specification table (`section#specs`), FAQ | P0 |
| `/products/databases` | `database.html` | Tabs for MySQL and PostgreSQL with comparison tables | P1, Gate A |
| `/products/object-storage`, `/products/load-balancers`, `/products/containers`, `/products/cdn`, `/products/dns` | Layout of `vps.html` | The same blocks with the family's data | P1, with the family's gate |
| `/products/domains` | `domains.html` | Search box (`section.cd-main-content`, `div.cd-filter`), TLD table (`table.table.compare`: register, renew, transfer) from `tlds` with a text filter, FAQ. The availability check goes through `reader`, is cached for 60 seconds, and has a WAF rate rule and an application limit per IP | P1, Gate B |
| `/payments` | `payments.html` | How top-up works, payment methods with the EPS banner, link to the refund policy | P1 |
| `/help` | `faq.html` | FAQ in an `Accordion` from MDX files in the repo, at least ten questions at launch. Required questions: is this real AWS (yes, 100%), do I get an AWS account or the AWS console (no, the TiCON Cloud panel), who bills and supports me (TiCON Cloud), where is my data (servers, databases, disks and buckets in the AWS Region the customer chose; CDN copies at AWS edge locations worldwide; DNS is global; the account and identity documents in AWS Singapore) | P0 |
| `/help/[slug]` | `knowledgebase-list.html`, `knowledgebase-article.html` | Help articles from MDX files | P2 |
| `/support` | `contact.html`, `section#ticket` | Form: name, email, subject, department, message, saved in `support_requests` and mailed to the support inbox. Rate limited per IP, with a hidden honeypot field (no third-party captcha, rule U3). Phone and the company address. Not used: the map and the newsletter checkbox | P0 |
| `/legal/[doc]` | `legal.html` | Sidebar of documents and versioned content from MDX: terms, acceptable use, privacy, refund, domain registration agreement. The acceptable use policy passes on the AWS rules that bind TiCON's customers as end users: the AWS Acceptable Use Policy, no cryptocurrency mining (Service Terms 1.25), no use of Lightsail to avoid the data fees of other AWS services (51.3), no video streaming or very high request volume through CDN (Lightsail FAQ), outbound port 25 closed, and TiCON's right to suspend a resource at once on a breach or an AWS notice (Customer Agreement 2.5). The wording is the legal adviser's | P0 |
| Not found, error, maintenance, coming soon | `404.html`, `maintenance.html`, `soon.html` | `not-found` and `error` files of Next.js, a maintenance page behind one switch, and the page of a flag-off family with a "notify me" button that writes `waitlist_entries` | P0 |

### 16.9 Sign-in and onboarding (WP2)

| Route | Built from | Fields and behavior | Actions | P |
| --- | --- | --- | --- | --- |
| `/signup` | `login.html`, tab "Create a New Account" | Full name, email, mobile number (normalized to `+880`), password (at least 12 characters), account type; a business adds the company name. Three consent boxes (terms, acceptable use, privacy) saved in `legal_acceptances`. Not taken from the mockup form: address lines, state, postcode, country, security question | `signUp` | P0 |
| `/verify` | Same card | Email code, then phone OTP with a resend timer and the limits of Section 6.1 | `confirmEmail`, `sendPhoneOtp`, `verifyPhoneOtp` | P0 |
| `/login` | `login.html`, tab "Already Registered?" | Email and password, then the TOTP step when enabled. No "remember me". One generic message for a wrong email or password | `signIn`, `signOut` | P0 |
| `/forgot-password`, `/reset-password` | Same card | Cognito reset flow. The answer is the same whether the email exists or not | `requestPasswordReset`, `resetPassword` | P0 |
| `/kyc` | `OptionGroup` and `Field` blocks of `configurator.html` inside `AppShell` | Steps: account type, identity details, document upload (presigned POST; size and type are checked in the browser and enforced by the upload policy), review. Then a status view for `pending`, `verified` and `rejected` with the reviewer's note | `startKycUpload`, `submitKyc` | P0 |

### 16.10 Customer panel

All routes use `AppShell`, send `X-Robots-Tag: noindex`, and read data through repositories scoped to the signed-in customer (R8). "Review" in the Actions column means the action creates an order draft and continues in the flow of 16.11.

| Route | Built from | Shows | Actions | WP | P |
| --- | --- | --- | --- | --- | --- |
| `/dashboard` | `StatTile` row, `DataTable` | Wallet balance, active resources per family, renewals due in 7 days with amounts, alerts (KYC pending, low balance, resources in grace), the last five operations. Empty state: a checklist (verify phone, complete KYC, top up, create the first server) | None | WP3, completed in WP5 | P0 |
| `/wallet` | `DataTable`, `StatTile` | Balance; ledger lines (date, description, money in or out, running balance); payments with their state | `exportStatementCsv` (P2) | WP3 | P0 |
| `/wallet/topup` | The card of `checkout.html` without its account tabs; `OptionGroup` for quick amounts | Amount field with quick amounts and the market's minimum and maximum, the EPS banner, pending payments | `startTopUp`, then the browser goes to EPS | WP3 | P0 |
| `/wallet/topup/[paymentId]` | `EmptyState` style card. Wording reference: `complete.tpl` and `error.tpl` in `order-form/antler/` | Only the verified state: success with the new balance, pending with automatic refresh, failed, cancelled, expired | `recheckPayment` (rate limited) | WP3 | P0 |
| `/invoices`, `/invoices/[id]` | `DataTable`; `PriceBreakdown` | Invoice list. One invoice: AWS service price line, one line per pricing step, total, company address, customer details, and a PDF link that is a short-lived presigned URL issued after a tenant check | `getInvoicePdfUrl` | WP3 | P0 |
| `/orders/review` | `cart.html` ("Review & Checkout"): `table.table.compare` and `aside#sidebar.sidebar` "Order Summary" | The draft: product, options, 30-day term, price lines, total, wallet balance after purchase, terms box. When the balance is short: the shortfall and a top-up button that returns here | `placeOrder` | WP4 | P0 |
| `/orders/[id]` | `StatusTimeline` | Order lines, payment, progress (paid, creating, ready), or the failure with its automatic refund line | None | WP4 | P0 |
| `/servers` | `DataTable`, `EmptyState` | Name, image logo, plan, location, public IP, state badge, period end, automatic renewal | `setAutoRenew` | WP4 | P0 |
| `/servers/new` | `configurator.html`, `section.config`: option groups on the left, `SummarySidebar` on the right | One page with steps: location (the AWS Region with its name and code), image (tabs for operating systems and applications, `ImageTile`), plan (`PlanPicker`), SSH key, options (automatic backups, label). The price in the sidebar comes from the server on every change | `createOrderDraft` (review) | WP4 | P0 |
| `/servers/[id]` | `Tabs` in a `Card`, tabs below | Header: label, state, addresses, plan, AWS Region and Availability Zone, period end | | WP4 | P0 |
| Tab Overview | `StatTile`, `CopyField` | Specifications, addresses, renewal date, data transfer used against the allowance | `rebootServer`, `stopServer`, `startServer`, `renameServer` | WP5 | P0 |
| Tab Access | `CopyField`, `SecretReveal` | SSH command and key name. Windows: user name and the password on demand through `access-details` | `revealWindowsPassword` | WP4; Windows in WP6 | P0; Windows P1 |
| Tab Networking | `DataTable` with inline editing | Firewall rules (protocol, port range, source CIDR) and the static IP; a note that these rules filter public traffic only, that port 80 is reachable on the private network from other servers in the same Region, and that private traffic between the customer's own servers is blocked (10.4) | `saveFirewallRules`, `attachStaticIp`, `detachStaticIp` | WP4 | P0 |
| Tab Backups | `DataTable` | Backups with size and date, the automatic backup switch and hour | `createBackup`, `deleteBackup`, `setAutoBackup`, `restoreToNewServer` (review) | WP5 | P0 |
| Tab Storage | `DataTable` | Attached and detached disks with size and path (a detached disk is still billed) | `addDisk` (review), `attachDisk`, `detachDisk`, `destroyDisk` | WP5 | P0 |
| Tab Metrics | Charts | CPU, network in and out, status checks for 1 hour, 1 day and 1 week, read through `reader` | None | WP5 | P0 |
| Tab Billing | `PriceBreakdown` | Plan, current period, next renewal amount, automatic renewal, past invoices | `setAutoRenew`, `renewNow` (review) | WP5 | P0 |
| Tab Destroy | `ConfirmDestroy` | What is deleted (the server and its automatic backups, which AWS removes with it), what is kept (manual backups and the final backup), and for how long | `destroyServer` (rule U10; enters the approval queue until 2026-12-01) | WP5 | P0 |
| `/databases`, `/databases/new`, `/databases/[id]` | The list, configure and tab patterns above; plan table from `database.html` | Engine and version, plan, location. Detail: endpoint, port, user, password on demand, public mode switch with a warning, backups, metrics | `createOrderDraft` (review), `revealDatabasePassword`, `setPublicMode`, `createBackup`, `destroyDatabase` | WP6 | P1, Gate A |
| `/storage`, `/storage/new`, `/storage/[id]` | Same patterns | Plan, usage, access mode, access keys (the secret is shown once) | `createOrderDraft` (review), `createAccessKey`, `deleteAccessKey`, `setBucketAccess`, `destroyBucket` | WP6 | P1, Gate A |
| `/load-balancers`, `/load-balancers/new`, `/load-balancers/[id]` | Same patterns | Targets (the customer's own servers in the same location), health, HTTPS certificate state | `createOrderDraft` (review), `setTargets`, `requestCertificate`, `destroyLoadBalancer` | WP6 | P1, Gate A |
| `/containers`, `/containers/new`, `/containers/[id]` | Same patterns | Power and scale, public image and ports, deployment state, public URL | `createOrderDraft` (review), `deployContainers`, `destroyContainerService` | WP7 | P1, Gate B |
| `/cdn`, `/cdn/new`, `/cdn/[id]` | Same patterns | Origin (own server, load balancer or bucket), state, default domain | `createOrderDraft` (review), `setCdnEnabled`, `destroyCdn` | WP7 | P1, Gate B |
| `/dns`, `/dns/[zone]` | `DataTable` with inline editing | Zones, name servers, delegation state, records | `createOrderDraft` (review), `saveRecord`, `deleteRecord`, `destroyZone` | WP7 | P1, Gate B |
| `/domains`, `/domains/new`, `/domains/[name]` | Search and TLD table of `domains.html`. Wording reference: `domainregister.tpl` and `configuredomains.tpl` | Search, price per year, registrant contact form, a second confirmation that repeats the domain name. Detail: state, expiry, contact verification state, name servers | `checkDomain`, `createOrderDraft` (review), `resendVerificationEmail`, `renewDomain` (review), `setNameServers` | WP7 | P1, Gate B |
| `/settings/profile` | `Field` forms in a `Card` | Name, company, billing address, locale | `updateProfile`; `changeEmail` and `changePhone` need a fresh sign-in and a new verification | WP2 | P0 |
| `/settings/security` | Same | Password change, TOTP setup with a QR code, sign out of other sessions | `changePassword`, `enableTotp`, `disableTotp`, `signOutEverywhere` | WP2 | P0 |
| `/settings/ssh-keys` | `DataTable`, `Modal` | Public keys with fingerprints. Add by paste, or generate in the browser with Web Crypto: the private key is offered as a download and never reaches the server | `addSshKey`, `deleteSshKey` | WP4 | P0 |
| `/notifications` | `DataTable` | The last 50 notifications; the bell in the top bar shows the unread count | `markNotificationsRead` | WP5 | P1 |
| `/support` when signed in | `contact.html`, `section#ticket` | Request form with category and related resource; the customer's earlier requests | `createSupportRequest` | WP9 | P0 |

### 16.11 Create and pay flow

There is no multi-item cart at launch: one resource per order, paid from the wallet. From `cart.html` and `checkout.html` the layout is used; the payment method select, the promo code field and the order notes are not.

1. Configure (`/servers/new` or another family's `/new` page). The page loads the catalog rows that the customer may buy (feature flags, risk tier limits of Section 10.2, allowed locations). The client never computes money.
2. `createOrderDraft` validates the configuration (zod, limits, flag, KYC `verified`, capacity available but not yet reserved), prices it, and returns a draft token: the customer id, the configuration, the price snapshot and the rule version, signed with a server secret (HMAC), valid for 30 minutes. The token holds nothing secret and is accepted only from the customer it names. No database row is written.
3. Review (`/orders/review?d=<token>`) shows the lines, the total, the balance after purchase, the 30-day term, the renewal rule and the terms box.
4. Short balance: the page shows the shortfall and a button to `/wallet/topup` with the amount pre-filled (the shortfall rounded up to whole taka, and at least the market minimum) and `next` set to the review URL (rule U12). The top-up action keeps `next` in a short-lived `HttpOnly` cookie, because the browser leaves for EPS in between. After a verified top-up the result page checks it against U12 again and sends the customer back to the review page. If the draft has expired by then, the review page makes a new draft from the same configuration and shows the current price. Nothing is bought automatically.
5. `placeOrder` takes the token and an idempotency key, verifies the signature and expiry, and prices again. Inside the purchase transaction, after the wallet row is locked, it checks again what `createOrderDraft` checked: customer status, KYC `verified`, the feature flag and the risk-tier limits counted from the database (errors `forbidden`, `kyc_required`, `flag_off`, `limit_reached`). One draft gives at most one order: the hash of the token is the idempotency key of the purchase's ledger transaction, so a second `placeOrder` with the same token returns the first order. If the FX rate, the rule version or any step amount differs from the token, it makes a new draft for the same configuration at the new price and returns its token; the review page shows the old and the new total and asks again. Otherwise it runs the purchase transaction of Section 3.4 and redirects to `/orders/[id]`.
6. `/orders/[id]` refreshes every few seconds until the operation is `succeeded` or `failed`, then links to the resource. While the operation is `needs_attention` the page says the order is delayed and that support is on it. A failed create shows the automatic refund line from the ledger.
7. When the home pool is full, review offers the waitlist (`waitlist_entries`). The order is never placed elsewhere silently (Section 10.2).

### 16.12 Admin screens (WP8)

All use `AdminShell` and the same kit. Every action stores actor, reason, IP and target (R10).

| Route | Shows | Actions | Roles | P |
| --- | --- | --- | --- | --- |
| `/login` | Sign-in with TOTP, always | `signIn` | All | P0 |
| `/` | Today: verified top-ups, orders, active resources, operations waiting for approval or attention, dead-letter count, capacity warnings, KYC waiting | None | All | P0 |
| `/customers`, `/customers/[id]` | Search. Profile, KYC submissions with a document viewer (images through short-lived presigned URLs, never cached), risk tier, limits, resources, wallet summary, audit trail | `approveKyc`, `rejectKyc`, `setRiskTier`, `setLimits`, `suspendCustomer`, `resumeCustomer` | `support` reads; `ops` acts | P0 |
| `/wallets/[customerId]` | Ledger; adjustments waiting for approval | `createAdjustment` with a reason; above the limit it waits as `pending` in `wallet_adjustments` until a second admin who is not the requester runs `approveAdjustment` or `rejectAdjustment` | `finance` creates; a second `finance` or `superadmin` approves | P0 |
| `/payments` | Search by transaction id; state and verify payload | `reverifyPayment`, `recordManualRefund` | `finance` | P0 |
| `/pricing` | FX rate history, pricing steps per market, config prices | `setFxRate`, `savePricingRule` (preview of five products before saving) | `finance`, `superadmin` | P0 |
| `/catalog` | Products with their flags, image allow-list, last sync | `setFeatureFlag`, `setImageAllowed`, `runCatalogSync` | `ops` | P0 |
| `/capacity` | Pool accounts, limit and use per location and quota, waitlist | `addPoolAccount`, `setCapacityLimit`, `notifyWaitlist` | `ops` | P0 |
| `/operations` | Queues: needs approval, needs attention, running | `approveOperation`, `rejectOperation`, `retryOperation` | `ops` | P0 |
| `/support` | Support requests | `replyByEmail`, `closeRequest` | `support` | P1 |
| `/abuse` | Cases | `openAbuseCase`, `suspendResource`, `closeAbuseCase` | `ops`, `support` | P1 |
| `/reconciliation` | Discrepancies by kind | `resolveDiscrepancy` | `ops`, `finance` | P1 |
| `/audit` | Audit log search | None | All read | P0 |
| `/admins` | Admin users and roles | `inviteAdmin`, `setAdminRole`, `disableAdmin` | `superadmin` | P0 |

### 16.13 States, wording and formats

States that every screen has (rule U11):

| State | Rule |
| --- | --- |
| Loading | Skeleton blocks with the Bootstrap `placeholder` classes inside the final layout. No full-page spinner |
| Empty | An inline SVG illustration, one sentence, one primary button |
| Error | A short message, a reference id (request or operation id) and a retry button. Never a stack trace and never raw error text from AWS or EPS |
| Not allowed | KYC not verified, limit reached or account suspended: say what to do next and link to it |
| Flag off | The coming soon page with "notify me" |

State badges. Each badge has an icon and a text label:

| State | English label | Classes |
| --- | --- | --- |
| Operation running, resource being created | Creating | `badge bg-info text-dark` |
| `active` | Running | `badge bg-success` |
| Stopped by the customer | Stopped | `badge bg-secondary` |
| `grace` | Suspended, renewal due | `badge bg-warning text-dark` |
| `retained` | Deleted, backup kept | `badge bg-grey` |
| Failed or needs attention | Problem | `badge bg-danger` |
| Payment verified, pending, or failed, cancelled and expired | Paid, Pending, Failed | `bg-success`, `bg-warning text-dark`, `bg-secondary` |

AWS statements (rule U6). They are stored as messages and used unchanged:

| Use | English | Bengali |
| --- | --- | --- |
| Short statement: hero, footers, emails | 100% AWS infrastructure. Built on Amazon Lightsail. | ১০০% AWS অবকাঠামো। Amazon Lightsail দিয়ে তৈরি। |
| Long statement: landing page, product pages, FAQ | Every server, database and storage resource you buy here is an Amazon Lightsail resource running in an AWS Region (Singapore or Mumbai). TiCON Cloud sells, bills and supports the service. You manage everything from this panel and do not need an AWS account. | এখানে কেনা প্রতিটি সার্ভার, ডেটাবেস ও স্টোরেজ একটি Amazon Lightsail resource, যা Singapore বা Mumbai AWS Region থেকে চলে। বিক্রি, বিল ও সাপোর্ট TiCON Cloud দেয়। সবকিছু এই প্যানেল থেকেই চালানো যায়, আলাদা AWS account লাগে না। |
| Trademark line: footers of pages and emails | Amazon Web Services, AWS, Amazon Lightsail and Amazon Route 53 are trademarks of Amazon.com, Inc. or its affiliates. | The same line in English |

Wording rules, from the AWS Trademark Guidelines (last updated 2026-11-05). This is a reading of the guidelines, not legal advice; the wording is confirmed with AWS before launch (Section 17).

| Rule | Detail |
| --- | --- |
| Plain text only | No AWS logo and no "Powered by AWS" logo in the product. An AWS Partner badge appears only if TiCON is entitled to it and uses it as the AWS Partner Creative and Messaging Guide says |
| True statements | The 100% statement is true only while every customer resource runs on AWS. If that ever changes, the statement changes first |
| Own brand first | Product names are TiCON Cloud's own. The AWS name follows in a relational phrase: "Cloud Server, built on Amazon Lightsail". No AWS mark inside a product name, a company name or a domain name. An AWS mark in a URL path is allowed for AWS content |
| Exact marks | Write "AWS" and "Amazon Lightsail". Do not write "AWS Lightsail", and do not abbreviate, join or hyphenate a mark with another word. In Bengali prefer wording that leaves the mark standing alone, as in the statements above |
| Prominence | TiCON Cloud branding is always larger and more prominent than any AWS name |
| No implied endorsement | Never say or suggest that AWS sells, supports, sponsors or endorses TiCON Cloud. Say who does: TiCON Cloud sells, bills and supports |
| Reseller notice | If TiCON holds a Solution Provider or Distribution Seller Addendum, the guidelines require a reseller notice with the first AWS mention on a page. Its text is printed in section 3(b) of the guidelines |
| Advertising | No AWS mark in paid search ads unless AWS has authorized it. AWS authorizes only AWS Partners at validated stage, through the Partner Development Manager (guidelines, section 14) |
| Still hidden | AWS account ids, ARNs, the pool account structure, internal resource names (`tc-...`) and raw AWS error text. Shown by design, because the customer cannot use the resource without them: the bucket name, the container service default domain, and the database and distribution endpoints |

Names in customer-facing text. The AWS name appears on the first mention on a page, in product page titles, in the configure flow, on the resource detail header and on the invoice line. Lists and buttons use the product name alone.

| Internal term | Product name | Bengali | AWS name shown beside it |
| --- | --- | --- | --- |
| Instance | Cloud Server | ক্লাউড সার্ভার | Amazon Lightsail instance |
| Managed database | Managed Database | ম্যানেজড ডেটাবেস | Amazon Lightsail managed database |
| Disk | Block Storage | ব্লক স্টোরেজ | Amazon Lightsail block storage disk |
| Bucket | Object Storage | অবজেক্ট স্টোরেজ | Amazon Lightsail object storage bucket |
| Load balancer | Load Balancer | লোড ব্যালান্সার | Amazon Lightsail load balancer |
| Container service | Container Service | কন্টেইনার সার্ভিস | Amazon Lightsail container service |
| Distribution | CDN | সিডিএন | Amazon Lightsail CDN distribution |
| Static IP | Static IP | স্ট্যাটিক আইপি | Amazon Lightsail static IP |
| Snapshot | Backup | ব্যাকআপ | Amazon Lightsail snapshot |
| Bundle | Plan | প্ল্যান | Amazon Lightsail plan |
| Blueprint | Image | ইমেজ | Amazon Lightsail blueprint |
| Region | Location | লোকেশন | AWS Region with name and code, for example Asia Pacific (Singapore), `ap-southeast-1` |
| DNS zone, domain | DNS, Domain | ডিএনএস, ডোমেইন | Amazon Route 53 |
| Wallet top-up | Top up | টপ আপ | None |
| Base price line | AWS service price | AWS সার্ভিস মূল্য | None |

Formats:

- Money is formatted only by `MoneyText` from minor units. Review, invoices, receipts and the ledger show the exact amount with two decimals. Plan cards and price tables show whole taka rounded up, so a customer is never charged more than the displayed price.
- In the `bn` locale money, dates and counts use Bengali numerals by default. One market setting (`numerals`: `beng` or `latn`) switches them. Technical values (IP addresses, ports, sizes, ids, invoice numbers, commands) are always in Latin digits. Amount inputs accept both digit sets and the server normalizes them.
- Dates are shown in `Asia/Dhaka` time and stored in UTC.
- Shared zod schemas live in `packages/core/validation` and are used by the form and by the action:

| Input | Rule |
| --- | --- |
| Resource label | 1 to 40 characters: letters, digits, hyphen. Display only; it is never an AWS name (R11) |
| Mobile number | Bangladesh mobile format, stored as `+880` followed by ten digits |
| Top-up amount | Whole taka between the market's minimum and maximum |
| Firewall rule | Protocol `tcp`, `udp` or `all`: ports 0 to 65535 with from not above to. Protocol `icmp` (IPv4 list) or `icmpv6` (IPv6 list): the two numbers are the ICMP type, sent as `fromPort`, and the ICMP code, sent as `toPort`, each from -1 (all) to 255; the form offers Ping as a preset (type 8 and code -1 for IPv4, type 128 and code 0 for IPv6). Source as CIDR. IPv4 and IPv6 rules are separate lists of at most 60 rules each (AWS quota) |
| SSH public key | One line, `ssh-rsa` with at least 2048 bits (ED25519 only after the VERIFY of Section 10.4), at most 10 keys for one customer |
| Domain name | Lower case, IDNA-encoded, label and TLD checked against `tlds` |
| DNS record | Type from the allowed list of Section 12; value checked per type; TTL 60 to 86400 |
| `next` | Rule U12 |

### 16.14 Emails and SMS

Emails use the layout of `email/index.html` (dark header with the logo, one headline band, white body, dark footer with the company address), rebuilt in `packages/notify` as table-based templates with inline CSS, in `bn` and `en`. Hex values come from 16.4. No password, key, phone OTP or document number is sent by email, except these, sent by Cognito through the `cognito-messages` trigger in the user's locale with this layout: the email verification code, the password reset code and an admin's one-time temporary password; and links go only to the panel's own domain. The footer of every email carries the short AWS statement and the trademark line of 16.13.

| Trigger | Email | SMS |
| --- | --- | --- |
| Sign-up and verification | Welcome; email code (Cognito) | Phone OTP |
| KYC | Received, approved, rejected with the reason | Approved |
| Top-up verified | Receipt | No |
| Order paid | Invoice | No |
| Order failed and refunded | What failed, the refund line and the new wallet balance | No |
| Resource ready | Location and address, link to the panel | Yes |
| Renewal reminders at 7, 3 and 1 day | Amount and wallet balance | At 1 day |
| Renewed | Invoice | No |
| Grace started | What is suspended, until when, the amount to renew and a link to renew or top up | Yes |
| Resource destroyed, backup kept | Restore deadline | Yes |
| Backups purged | Notice | No |
| Low balance, payment expired | Notice | No |
| Security: new sign-in, password changed, TOTP changed, email or phone changed | Alert | Yes |
| Domain: contact verification pending, renewal reminders at 60, 30 and 7 days | Notice | At 7 days |

### 16.15 Mockup pages that are not built

`blackfriday`, `blog-details`, `blog-grid`, `colocation`, `cryptoexchange`, `cryptotrading`, `ddos`, `dedicated`, `developer`, `email`, `emailsecurity`, `empty`, `gaming`, `gsuite`, `header-icons`, `home3d`, `homegaming`, `homeimage`, `homevideo`, `hosting`, `iptv`, `magento`, `radiostream`, `reseller`, `seo`, `settings`, `ssl`, `voice`, `voip`, `vpn` (all `.html` in `template/`). `elements.html`, `sections.html` and `sliders.html` are references for blocks. Candidates after launch: `about.html` (company page), `datacenter.html` (locations), `wordpress.html` (a landing page for WordPress on Cloud Servers), `promos.html` (offers).

### 16.16 UI acceptance checks

- [ ] `/dev/ui` (not in production) shows every kit component with the customer and the admin attributes, in `bn` and `en`, at 360, 768 and 1280 px.
- [ ] CSP in report-only mode on staging shows zero violations across the P0 screens. Then it is enforced.
- [ ] The network log of the P0 screens shows no request to another origin, except the KYC upload to the platform's own bucket and the navigation to EPS.
- [ ] The build output contains no jQuery and no file from the theme's `assets/js`.
- [ ] Automated accessibility checks (axe) report no serious or critical issue on the P0 screens, and every P0 flow can be completed with the keyboard.
- [ ] Bengali text renders correctly on Android Chrome and iOS Safari, including conjuncts, numerals and the taka sign.
- [ ] Public pages, the panel footer and emails carry the AWS statement and the trademark line of 16.13. A test checks the message files for forbidden forms such as "AWS Lightsail".
- [ ] A test searches rendered P0 pages, emails and API responses for `arn:aws:`, the pool account ids and internal resource names and finds none. The names and addresses that rule U6 allows (the bucket name, the default domain of a container service, and the endpoints of databases and distributions) are not counted.
- [ ] Largest Contentful Paint is under 2.5 seconds on the landing and pricing pages on a simulated 4G phone.
- [ ] Playwright completes sign-up, top-up and create-server at a width of 360 px in `bn`.

## 17. Open items

| Item | Owner | Needed by |
| --- | --- | --- |
| Sample TiCON Cloud invoice (layout for 10%, 5%, 2% lines) | Moshiur | Thu 12 |
| Confirm panel domains (`my.` and `ops.ticoncloud.com`) and where the public pages live. Default: the same app on `my.ticoncloud.com`. Alternative: paths on `ticoncloud.com` through a rewrite, which fits that site's AWS search program now that AWS is named openly | Moshiur | Wed 11 |
| AWS wording and badge: confirm with the AWS Partner manager (or `trademarks@amazon.com`) the 100% AWS statements of Section 16.13 and which AWS Partner badge TiCON may display. Check whether TiCON holds a Solution Provider or Distribution Seller Addendum, because the guidelines then require a reseller notice | Moshiur | Before launch |
| Color scheme. Default: what the mockup renders (dark background, pink accent, yellow buttons). Alternative: TiCON Cloud brand colors as a fifth scheme (Section 16.4) | Moshiur | Thu 12 |
| Theme licence: confirm the Envato licence for Antler is not already used on another site, and keep the purchase code on file (Section 16.1) | Moshiur | Before launch |
| The theme's client area folder (`whmcs-template/antler/`, 192 `.tpl` files) is already in the unpacked mockup: put it in `design/mockup/` with the other folders (B.1). It is an extra visual reference for panel screens; Section 16 does not depend on it | Moshiur | Wed 11 |
| TiCON Cloud logo as SVG for dark and light backgrounds, and a favicon, from the `ticoncloud` site repo | Dev team | Wed 11 |
| Numerals in the Bengali interface for money, dates and counts. Default: Bengali numerals (Section 16.13) | Moshiur | Thu 12 |
| Support phone number and support email shown on public pages and emails | Moshiur | Sat 14 |
| Current Lightsail quotas of the pool accounts; Partner application and quota requests filed | DevOps | Day 0 |
| SMS provider and sender id | Dev team | Wed 11 |
| Amazon SES production access for `tc-platform` and `tc-platform-stg` (new accounts start in the SES sandbox; AWS answers within 96 hours, so file it first thing on Wed 11; until it is granted, test sign-ups use verified addresses and Playwright confirms its users with `AdminConfirmSignUp` on staging), and the first production deploy by Fri 13 so the beta is not the first run | DevOps | Wed 11 |
| EPS minimum and maximum top-up amounts | Moshiur | Thu 12 |
| Data transfer policy above the bundle allowance (default in Section 11: 50 GB packs, or close ports; closing ports is not a hard cap, because the Lightsail firewall allows all outbound traffic, so a server can still send data it starts itself; only `StopInstance` stops the cost) | Moshiur | Fri 13 |
| Grace behavior for instances: close public ports (default) or stop the instance | Moshiur | Fri 13 |
| VAT point for prepaid top-ups and VAT base (AWS price or full value) | VAT consultant | Before launch |
| Legal pages: terms, acceptable use, privacy, refund | Moshiur with legal adviser | Mon 16 |
| On-call list and admin IP allowlist | Moshiur | Sat 14 |
| Who drives each track, and the second reviewer for money and security pull requests (Section J) | Moshiur with the lead developer | Wed 11 |
| Operations lead named; support hours and first-response target (Section M) | Moshiur | Sat 14 |
| Source of the customer address that EPS requires on every top-up (address, city, state, postcode, country). Default: ask for the billing address on the first top-up and keep it on the profile | Moshiur | Wed 11 |
| Wed 11 load and gate M1: tracks B and D have no Wednesday task, and no Wednesday task shows the catalog to a signed-in customer. Default: gate M1 as written in G; track B may start with WP4-T1 today | Moshiur with Lead developer | Wed 11 |
| Oversized task rows (WPU-T3, WP4-T7, WP5-T5, WP9-T4 and the five "adapter and screens" rows): split them into lettered parts and name the part each gate needs? Default: split before work starts and recount tasks per day | Moshiur with Lead developer | Wed 11 |
| DNS for staging: a separate `tc-dns-stg` account or a stub adapter? Default: a separate `tc-dns-stg`, and the roles in `tc-dns` trust only `tc-platform` | Moshiur with DevOps | Wed 11 |
| Stages for parallel sessions: one `staging` stage cannot take deploys from several unmerged branches. Personal or per-track SST stages in `tc-platform-stg`, or CI-only staging with proofs after merge? Default: one stage per track; only CI deploys `staging` | Lead developer with DevOps | Wed 11 |
| EPS for staging: sandbox credentials from EPS, or the live API with a separate store, staging return URLs and a low top-up maximum? Default: ask EPS for sandbox credentials today | Moshiur | Wed 11 |
| Lambda concurrent executions quota of `tc-platform` and `tc-platform-stg` (ap-southeast-1, and us-east-1 for Lambda@Edge): new accounts start below 1,000. Read it today and request an increase; keep every function at or below 3,008 MB | DevOps | Sun 15 |
| Staging domain: its own domain or a zone delegated from `ticoncloud.com`? Staging SES stays in the sandbox and only `tc-platform` asks for SES production access. Until then, the plan as written applies | Moshiur with DevOps | Wed 11 |
| First data before the admin panel exists: seed for `pool_accounts`, `pool_capacity` and config rows, a staging fixture for KYC-verified test customers with test credit, and the first `superadmin` on each stage. Until then, the plan as written applies | Lead developer with DevOps | Wed 11 |
| OTP and form rate limits per number, per customer and per IP, given that carrier NAT puts many users behind one IP. Until then, the limits of 6.1 apply | Moshiur with Lead developer | Wed 11 |
| Journal: keep one shared `JOURNEY.md`, or one file per task under `journey/` once tracks open pull requests in parallel (every parallel pull request conflicts on the shared file)? Default: keep `JOURNEY.md` until then | Lead developer | Wed 11 |
| Bring three dates of this table forward: VAT point and base by Fri 13, legal texts as version 1.0 by Sun 15, sample invoice on Wed 11 (WP3-T5 runs on Thu 12)? Default: the dates in the rows above stand | Moshiur | Wed 11 |
| Written AWS confirmation (Partner manager or Solution Provider Program) that TiCON may resell Lightsail from its own accounts, add pool accounts to pass fixed quotas and give bucket keys to customers (Customer Agreement 6.4 and 2.4). Default: ask now; the go/no-go list of K stays as written | Moshiur | Sun 15 |
| Pool accounts and bucket keys before AWS answers (Customer Agreement 6.4(b) and 2.4). Default: `tc-pool-n2` waits for AWS's answer; bucket keys are built as 10.3 says and reach no customer while the bucket flag is off | Moshiur with DevOps | Wed 11 |
| Capacity for go/no-go item 7: K asks for 40 servers with static IPs, N accepts 20, and default quotas give 5 static IPs per pool account and Region. Set the number per pool and say whether `tc-pool-n2` is ready at launch. Default: K item 7 as written (40); DevOps files the static IP increases today and records real quotas in `pool_capacity` | Moshiur with DevOps | Sun 15 |
| Admin approval of destroys (R13) ends 2026-12-01, before the first end-of-term destroy (2026-12-18) and the first snapshot purge (2027-01-01). When should it end? Default: R13 as written, with the end date kept as a config value (2026-12-01) so that it can move without a code change | Moshiur | Thu 12 |
| Which deletes wait for admin approval under R13: only the deletes that the platform starts at the end of a term, every delete, or whole resources only? Default: R13 as it reads now | Moshiur with Lead developer | Wed 11 |
| A 30-day term costs TiCON about 96.8% of the AWS monthly price, because AWS bills by the hour. Charge base x 720/744, or keep the monthly price and correct "about 1.7%" and "markup is zero"? Default: keep the price and correct the claims | Moshiur | Wed 11 |
| Ports between customers on the private network: 10.4 now closes 443, but port 80 stays open from the VPC for load balancers, and the Networking tab says so. Go/no-go item 5 cannot be ticked while 80 is open. Close 80 too by default, with a load balancer variant chosen at create, or keep it open and reword item 5? The isolation test follows. Default: as 10.4 says; item 5 stays as written | Moshiur with Lead developer | Wed 11 |
| Detached static IP: AWS charges 0.005 USD an hour after the first hour and the address still uses static IP quota. Remove the customer detach action at launch, or give it a daily price? Default: no detach action for customers at launch | Moshiur | Wed 11 |
| Who is the named administrator of `tc-platform` who sets the production secrets (B.3), and from where: AWS CloudShell or a protected CI job? Default: CloudShell, before the first production deploy | Moshiur with DevOps | Thu 12 |
| GitHub plan of the organization: required reviewers on the `production` environment of a private repository need Enterprise Cloud. If the plan is lower, what replaces them? Until then, the plan as written applies | DevOps | Thu 12 |
| Tax document for a reversed purchase (credit note, void, or invoice only after `active`) and for metered daily charges (monthly usage invoice, or none). Default: invoices follow 9.3 as written until decided | Moshiur with VAT consultant | Wed 11 |
| Server reboot, stop, start and rename are P0 in 16.10 and in the WP5 scope, but have no task, adapter call or allowed action. Default: add task WP5-T7 on Fri 13 and the three actions to the `TcProvisioner` allow-list | Moshiur with Lead developer | Thu 12 |
| Task ids per gate for the two-day packages WP4 and WP8, and whether gate M4 needs every admin P0 screen or only sign-in and KYC review. Default: the gates as written in G | Moshiur with Lead developer | Wed 11 |
| CSP style policy: Radix and `next/image` write inline style attributes, which U4 forbids. Allow them or replace them, and write the full directive list of 16.2? Until then, U4 applies as written | Lead developer with Moshiur | Wed 11 |
| Payment methods enabled on the TiCON Cloud EPS store (bKash, Nagad, Rocket, cards, internet banking), each confirmed by one real payment. Until then, the plan as written applies | Moshiur | Fri 13 |
| Overage on object storage, CDN, container service and database plans: AWS bills storage and transfer above the plan without a cap, and buckets and containers have no transfer metric. Bill daily, cap, or absorb? Default: these flags stay off until a rule is built | Moshiur | Wed 11 |
| Price source of the 50 GB transfer pack, and who pays outbound transfer that an instance sends after its ports close at grace. Until then, the plan as written applies | Moshiur | Fri 13 |
| Backup storage charge: the API gives only the disk size of a snapshot, while AWS bills used and changed data. Full size for each, or a smaller basis? Default: the first kept backup at disk size, each further one at 10% of it | Moshiur | Thu 12 |
| Cost check of gate M5 and K item 8: the tolerance (2% or a floor per account), the day compared (Cost Explorer is about a day late) and whether staging may read cost. Cost Explorer is switched on by hand in the management account. Default: 2% per account | Moshiur with DevOps | Sat 14 |
| Homes per pool account: a cap and the rule for opening the next account, because buckets (20), distributions (20) and load balancers (10 per Region) are fixed per account and a home never changes. Check the Organization's account quota (default 10). Until then, the plan as written applies | Moshiur with DevOps | Wed 11 |
| Fallback if SES production access is not granted by Sun 15 (AWS promises a first answer within 96 hours; until then only verified recipients get mail, 200 a day). Default: the Cognito default sender for codes and verified beta addresses | Moshiur with DevOps | Sun 15 |
| Cost of grace and retention (48 hours of the resource plus 14 days of snapshot storage per non-renewal, up to about 0.79 USD on the 5 USD plan): accept it as cost of sale, or charge a restore fee? Until then, TiCON bears it | Moshiur | Thu 12 |
| Production before the go decision: sign-up, KYC upload and top-up have no flag, so the customer app is public from the Fri 13 deploy. Default: a WAF IP allowlist until the beta, then KYC approval only for invited customers | Moshiur with Lead developer | Thu 12 |
| Order of Sat 14 to Mon 16: beta KYC on Sat and Sun, a staff smoke test in both production pools on Sun 15, WP9-T1 to T3 before the beta pays, and the time of the go/no-go. Default: the order in this sentence, go/no-go at 18:00 on Mon 16 | Moshiur with Lead developer | Sun 15 |
| Hosted zone that Route 53 creates with every registered domain when the customer buys no DNS zone: keep it at TiCON's cost (0.50 USD a month), put a zone in every domain price, or delete it within 12 hours? Default: keep it (Section 12) | Moshiur | Sat 14 |
| DNS zone at the end of an unpaid term: keep it through the 14-day retention (Bengali plan), save the records and delete, or delete at 48 hours (10.3)? A new zone gets new name servers. Default: delete after saving the records for a restore within 14 days | Moshiur | Thu 12 |
| DNS zone price: Route 53 charges a zone at creation and on the 1st of each month without proration, and every query at 0.40 USD per million with no cap. Which term, and are queries metered and charged? Until then, the plan as written applies | Moshiur | Sat 14 |
| Domain names with registry premium prices (not in `ListPrices`; `RegisterDomain` needs `Consent`): refuse them, or sell them at their own price with a renewal price per domain? Default: refuse them | Moshiur | Sat 14 |
| Families without a snapshot (load balancer, container service, CDN) after the destroy at period end plus 48 hours: keep the settings 14 days and recreate on payment (Bengali plan), or end the subscription at once? The badge and restore email follow. Default: as Section 11 says (settings kept, and the resource created again on payment) | Moshiur | Thu 12 |
| Unpaid daily backup charge: what "the same grace flow" means for backups. Default: no new backups, existing ones kept, the charge retried daily, deletion after 14 unpaid days with two notices | Moshiur | Thu 12 |
| EPS contract rate and settlement terms against the 2% processing fee (EPS charges on the whole top-up; public rates 2.0% to 2.2%), and who bears the commission on a refunded top-up. Default: confirm the rate, then set the fee to cover it or accept the gap in writing | Moshiur | Wed 11 |
| Finance admin and second approver named (FX rate, pending payments, reconciliation report, manual top-ups, refunds), and the approval limit for wallet adjustments set. Until then, the plan as written applies | Moshiur | Fri 13 |
| FX rate: source, buffer, review interval, and the guard on rate and pricing rule changes. Default: a rate more than 5% away from the current one needs a second admin | Moshiur | Wed 11 |
| What "the Day 6 tests" of Gates A and B are, who decides per family and where it is recorded. Default: the M4 or M5 cycle on staging plus one staff run in a production pool before the flag goes on, recorded in `JOURNEY.md` | Moshiur with Lead developer | Sun 15 |
| Rule for a go/no-go list that is not complete at 18:00 on Mon 16: second check time, how far the launch moves, who may waive an item. Default: a second check on Tue 17 at 10:00, then one day at a time | Moshiur | Mon 16 |
| Ledger accounts and postings for bank settlement and gateway commission (`gateway_clearing` is never cleared in 9.1), and for a payment that EPS or a bank takes back after the wallet was spent (receivable, negative wallet or write-off). Until then, the plan as written applies | Moshiur with VAT consultant | Wed 11 |
| Tax review beyond the VAT point: the Bangladesh rate for this service (5% assumed), whether the 10% Korean VAT on the AWS bill is a cost or recoverable, and how that line is named and explained on invoices, the price page and the FAQ | Moshiur with VAT consultant | Before launch |
| Tax Settings of every pool account: member accounts do not inherit the payer's settings. Set them in each pool account and in `tc-dns` | DevOps | Before launch |
| Domain registration agreement for customers, with the reseller duties of section 3.12 of the Route 53 Domain Name Registration Agreement. Default: the domain flag stays off until it is published | Moshiur with Legal adviser | Before launch |
| Theme licence type and count: Regular (29 USD) or Extended (320 USD) for a panel whose customers pay, and a second licence for `ops.`? Ask Envato Support in writing. Default: buy a second Regular licence | Moshiur | Before launch |
| Domain renewal rule: automatic charge and `RenewDomain` 35 days before expiry, or by hand only; the last safe day per TLD; who pays a restoration fee. Until then, domains do not renew automatically (`AutoRenew=false`, Section 12) | Moshiur | Sat 14 |
| The sandbox of the Claude Code kit: with the settings of Appendix Q, Claude can run code that it wrote outside the sandbox with no prompt (through the excluded test and verify commands, the format hook and the Stop hook), and a sandboxed script can read credential files in the home folder and rewrite the settings and hooks of the kit. A hardened kit is ready, with its costs and with what it does not close, in `docs/audit/2026-11-11-kit-security.md`. Adopt it, or keep Appendix Q. Until then, the plan as written applies (Appendix Q; C.2: deny rules and hooks are guard rails, the real boundary is the AWS profile and branch protection) | Moshiur with Lead developer | Wed 11 |

## 18. Sources checked on 2026-11-10

- Lightsail quotas: https://docs.aws.amazon.com/general/latest/gr/lightsail.html
- Lightsail Partner Program: https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-partners.html
- Lightsail firewall and private traffic: https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html
- Database public mode: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-configuring-database-public-mode.html
- Container services and private domain: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services.html
- Lightsail API reference: https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/Welcome.html
- AWS Service Terms (sections 1.4, 48, 51): https://aws.amazon.com/service-terms/
- SST components: https://sst.dev/docs/component/aws/nextjs/ , https://sst.dev/docs/component/aws/vpc/ , https://sst.dev/docs/component/aws/postgres/
- Mockup zip (`Mockup.zip`, Antler 4.5.0): unpacked, inventoried and rendered in a browser on 2026-11-10. File names, class names, colors and counts in Section 16 come from that check
- Envato licence FAQ and Regular License terms: https://themeforest.net/licenses/faq , https://themeforest.net/licenses/terms/regular/2.0
- AWS Trademark Guidelines (last updated 2026-11-05): https://aws.amazon.com/trademark-guidelines
- Claude Code documentation checked on 2026-11-11: listed in Appendix U

# Part 4. Appendices

Task WP0-T1 creates these files as written. They follow the Claude Code documentation checked on 2026-11-11 (Appendix U). If a Claude Code release has changed a format, follow the current documentation and note the difference in `JOURNEY.md`.

## P. `CLAUDE.md`

Keep it under 200 lines. It is loaded in every session, so it holds only what applies to every task. Everything else is in `docs/spec/` and in the path-scoped rules of Appendix R.

```markdown
# TiCON Cloud platform

Prepaid cloud panel for Bangladesh. Customer resources are Amazon Lightsail resources in
TiCON's AWS pool accounts; DNS zones and domains are Amazon Route 53 resources in `tc-dns`. The money is real: wallet, double-entry ledger, EPS payments.

The specification is TICON_CLOUD_MEGA_PLAN.md. Do not read it whole. Read the files in docs/spec/
that your task names. docs/spec/INDEX.md lists them. The task backlog is docs/spec/E-backlog-and-prompts.md.

## Commands
- pnpm install
- pnpm verify --quick              lint, typecheck and unit tests of changed packages
- pnpm verify --task <task id>     proof of one task
- pnpm verify --gate <M0..M7>      a day's gate
- pnpm test --filter <package>     tests of one package; prefer single tests while iterating
- pnpm db:up / pnpm db:migrate     local PostgreSQL in Docker
- pnpm spec:split                  regenerate docs/spec after the plan changed
- npx sst deploy --stage staging   staging only, and ask first

## How to work
1. One task id per session. If the task needs something outside its scope, write it in JOURNEY.md and stop.
2. Plan first: files, interfaces consumed and produced (docs/spec/F-contracts-between-tracks.md), tests, open questions.
3. Tests first for packages/core, packages/db, packages/eps, packages/aws. See the test fail, then implement.
4. Show evidence: the command and its output. Never say "should work".
5. Before the pull request: pnpm verify --task <id>, then a review by the matching subagent.
6. End of session: append a JOURNEY.md entry, commit as "<task id>: <change>", push, gh pr create. Do not merge.
7. Check AWS, SST, Next.js, Cognito and EPS details against current documentation. Record VERIFY results in JOURNEY.md.

## Stop and write a "Needs decision" entry when
- a rule below blocks the task
- a price, tax, wallet or refund rule is unclear
- an AWS API behaves differently from the spec
- data would be deleted, or anything would touch production
- a new auth or crypto dependency seems needed
- legal wording is needed

## Never
- R1 Web and admin apps never call AWS provisioning and never import packages/aws. They write an operation row and enqueue it.
- R2 The database is private: Lambda in the VPC through RDS Proxy with TLS only.
- R3 No long-lived AWS keys. No secrets in the repo, in logs or in client bundles. Cross-account access is STS AssumeRole.
- R4 Money is bigint paisa. Decimal math only inside packages/core/pricing. Rounding is half-up. No floats.
- R5 The ledger is double-entry and append-only. A correction is a reversing transaction.
- R6 Credit a wallet only after server-to-server EPS verification of the same transaction id and amount (EPS amounts are always BDT).
- R7 Every state-changing request and job is idempotent, enforced by a unique key.
- R8 Customer data only through tenant-scoped repositories. customerId comes from the session. Each endpoint has a cross-tenant test.
- R9 Order in every action: authenticate, authorize, validate with zod, rate limit, execute, audit.
- R10 Admin is a separate app with TOTP and an IP allowlist. Every admin action stores actor, reason, IP and target.
- R11 AWS names are generated (tc-<type>-<id>). Customer text never becomes an AWS name, a tag key or unescaped user data.
- R12 Every product family is behind a feature flag that is off by default in production.
- R13 Destructive lifecycle actions need the right subscription state, a final snapshot where supported, and admin approval until 2026-12-01.
- R14 Logs are structured and hold no passwords, tokens, secrets, document numbers, full phone numbers or emails.
- R15 Pricing, ledger, lifecycle and capacity have unit tests. Migrations are forward-only.
- R16 Fail closed: if a check cannot complete, refuse the action.
- R17 Dependencies are pinned. No high or critical advisories. No new auth or crypto dependency without a recorded reason.
- Never read or print secrets, never run sst secret, never deploy production, never touch the management account.
- Never edit design/mockup/, docs/spec/ or a migration that is already on main.
- Never change a contract of docs/spec/F-contracts-between-tracks.md inside a task. A contract change is its own pull request that edits Section F of TICON_CLOUD_MEGA_PLAN.md.

## UI
The mockup theme is the look: reuse its CSS classes, ship no theme JavaScript, self-host everything,
all text through next-intl in bn and en. AWS is named openly with the exact statements of
docs/spec/16 (16.13). AWS account ids, ARNs and raw AWS errors are never shown. Full rules load
from .claude/rules/ui.md when you touch apps/ or packages/ui/.

## Package boundaries
- packages/core: pure logic (pricing, ledger, orders, lifecycle, capacity). No AWS, no HTTP.
- packages/db: schema, migrations, tenant-scoped repositories.
- packages/aws: AWS clients and product adapters. Imported only by functions/.
- packages/eps, packages/notify, packages/auth, packages/ui: as named.
- apps/web, apps/admin: Next.js apps. Thin Server Actions that call packages.
- functions/: Lambda handlers. infra/: SST. verify/: gate checks. docs/runbooks/: operations.

## When compacting
Keep the task id, the list of changed files and the commands that prove the task.
```

## Q. Settings, hooks and ignore files

`.claude/settings.json` (shared, checked in):

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm install)",
      "Bash(pnpm verify *)",
      "Bash(pnpm test *)",
      "Bash(pnpm lint *)",
      "Bash(pnpm typecheck *)",
      "Bash(pnpm db:up)",
      "Bash(pnpm db:migrate)",
      "Bash(pnpm spec:split)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(gh pr create *)",
      "Bash(gh pr view *)",
      "Bash(gh run view *)"
    ],
    "ask": [
      "Bash(npx sst deploy --stage staging*)",
      "Bash(git push *)",
      "Bash(aws *)"
    ],
    "deny": [
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(./**/*.pem)",
      "Edit(/design/mockup/**)",
      "Edit(/docs/spec/**)",
      "Bash(npx sst secret *)",
      "Bash(pnpm sst secret *)",
      "Bash(pnpm exec sst secret *)",
      "Bash(npx sst shell *)",
      "Bash(pnpm sst shell *)",
      "Bash(npx sst deploy --stage production*)",
      "Bash(npx sst remove *)",
      "Bash(git push --force*)",
      "Bash(git push origin main*)",
      "Bash(aws organizations *)",
      "Bash(aws iam *)"
    ],
    "disableBypassPermissionsMode": "disable"
  },
  "sandbox": {
    "enabled": true,
    "excludedCommands": ["docker *", "pnpm db:up", "pnpm db:migrate", "pnpm test *", "pnpm verify *", "pnpm spec:split", "gh *", "git fetch *", "git pull *", "git push *", "git merge *", "git rebase *", "npx sst *", "npx playwright *", "aws *"],
    "network": { "allowedDomains": ["registry.npmjs.org", "github.com", "*.githubusercontent.com"] }
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh", "onFailure": "block" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "f=$(jq -r '.tool_input.file_path // empty'); case \"$f\" in ''|*.md|*.mdx) exit 0 ;; esac; npx prettier --write --ignore-unknown \"$f\"" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/stop-check.sh" }
        ]
      }
    ]
  }
}
```

`.claude/hooks/protect-files.sh` (make it executable). Exit code 2 blocks the edit and sends the message to Claude:

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
FILE_PATH="${FILE_PATH//\\//}"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
block() { echo "Blocked: $1" >&2; exit 2; }

case "$FILE_PATH" in
  */design/mockup/*) block "design/mockup is a read-only reference" ;;
  */docs/spec/*)     block "docs/spec is generated. Edit TICON_CLOUD_MEGA_PLAN.md, then run pnpm spec:split" ;;
  */.env|*/.env.*)   block "env files are edited by people only" ;;
  */packages/db/migrations/*)
    ROOT=$(git -C "${CWD:-.}" rev-parse --show-toplevel 2>/dev/null)
    REL="${FILE_PATH#"$ROOT"/}"
    if [ -n "$ROOT" ] && git -C "$ROOT" cat-file -e "origin/main:$REL" 2>/dev/null; then
      block "this migration is already on main. Migrations are forward-only: add a new one"
    fi ;;
esac
exit 0
```

`.claude/hooks/stop-check.sh` (make it executable). It runs the quick check at the root of the worktree the session is in, at the end of every turn that leaves uncommitted changes, and skips it until `pnpm install` has run and `scripts/verify.mjs` exists:

```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then exit 0; fi
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
ROOT=$(git -C "${CWD:-$CLAUDE_PROJECT_DIR}" rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0
if [ -z "$(git status --porcelain)" ] || [ ! -d node_modules ] || [ ! -f scripts/verify.mjs ]; then
  exit 0
fi
if ! OUT=$(pnpm -s verify --quick 2>&1); then
  echo "pnpm verify --quick failed. Fix this before stopping, or write what blocks you in JOURNEY.md:" >&2
  echo "$OUT" | tail -n 40 >&2
  exit 2
fi
exit 0
```

`.worktreeinclude` (copied into every new worktree; it holds local, non-secret settings such as the local database URL):

```text
.env.local
```

Lines to add to `.gitignore`:

```text
.claude/worktrees/
.claude/settings.local.json
CLAUDE.local.md
.env
.env.*
.sst/
verify/report-*.json
```

## R. Path-scoped rules in `.claude/rules/`

Each file starts with a `paths:` list in YAML frontmatter and loads only when Claude works on matching files. The body is the full text of the named rules, copied verbatim from Section 2 or Section 16.2, followed by the pointers.

| File | `paths` | Body |
| --- | --- | --- |
| `money.md` | `packages/core/pricing/**`, `packages/core/ledger/**`, `packages/core/orders/**`, `packages/eps/**`, `functions/payments-sweeper/**` | R4, R5, R6, R7, R16 in full. Pointers: `docs/spec/08`, `docs/spec/09`. "Run the pricing vectors after every change in pricing" |
| `aws.md` | `packages/aws/**`, `functions/**`, `infra/**` | R1, R2, R3, R11, R12, R13 in full. Pointers: `docs/spec/03`, `docs/spec/06`, `docs/spec/10` |
| `data.md` | `packages/db/**` | R5, R8, R15 in full. "Every new repository method takes the tenant scope and gets a cross-tenant test" |
| `ui.md` | `apps/**`, `packages/ui/**`, `packages/notify/**`, `content/**` | U1 to U13 in full. Pointers: `docs/spec/16` files for tokens, kit, statements and names |
| `admin.md` | `apps/admin/**` | R10 in full. Pointer: `docs/spec/16` (16.12) |
| `lifecycle.md` | `packages/core/lifecycle/**`, `functions/scheduler/**` | R4, R5, R7, R13, R16 in full. Pointer: `docs/spec/11`. "Time comes from the injected Clock only" |
| `server.md` | `apps/**`, `functions/**`, `packages/auth/**`, `packages/core/operations/**`, `**/package.json`, `pnpm-lock.yaml` | R6, R7, R8, R9, R14, R16, R17 in full. Pointers: `docs/spec/02`, `docs/spec/06` |

Example, `.claude/rules/money.md`:

```markdown
---
paths:
  - "packages/core/pricing/**"
  - "packages/core/ledger/**"
  - "packages/core/orders/**"
  - "packages/eps/**"
  - "functions/payments-sweeper/**"
---

# Money rules

(R4, R5, R6, R7 and R16, copied verbatim from Section 2)

- Specification: docs/spec/08-pricing-engine.md and docs/spec/09-wallet-ledger-and-eps.md
- Run the pricing vectors after every change in packages/core/pricing.
- A change to a posting rule or to the EPS credit rule needs a "Needs decision" entry first.
```

## S. Skills and subagents

`.claude/skills/wp-start/SKILL.md`:

```markdown
---
name: wp-start
description: Start one task of the TiCON Cloud mega plan by its id, for example WP3-T1
disable-model-invocation: true
---
Task id: $ARGUMENTS

1. Open docs/spec/E-backlog-and-prompts.md and find the row of this task and the "Read" list of its
   work package. Read those docs/spec files first. Read another docs/spec file only when the task
   row names a route, function or rule that they do not contain, and name that file in the plan.
   Read the last 60 lines of JOURNEY.md.
2. Write the plan for this task only: files to create or change, the interfaces you consume and
   produce (docs/spec/F-contracts-between-tracks.md), the tests that prove the task, every VERIFY
   item it touches, and anything that needs a decision. Stop and show the plan.
3. After the plan is approved: write the failing tests, run them and show that they fail, implement,
   run them until they pass. Keep to the package boundaries in CLAUDE.md.
4. Run pnpm verify --task <id> and show the output.
5. Ask the reviewer subagent that fits the paths you changed (security-reviewer, money-reviewer or
   spec-checker) to review the diff. Fix what affects correctness or the specification.
6. Append a JOURNEY.md entry from the template. Commit as "<task id>: <change>", push the branch,
   and open a pull request with gh pr create using the template. Do not merge.
If anything on the "Stop and write a Needs decision entry" list in CLAUDE.md applies, do that instead
of guessing.
```

`.claude/skills/wp-verify/SKILL.md`:

```markdown
---
name: wp-verify
description: Run the proof of a task or a gate of the TiCON Cloud mega plan and report evidence
disable-model-invocation: true
---
Target: $ARGUMENTS (a task id such as WP3-T1, or a gate M0 to M7)

Run pnpm verify --task <id> or pnpm verify --gate <gate>. Show the table and, for every failed
check, the command, the last lines of its output and the most likely cause. Do not change code in
this skill. If a check cannot run, report it as failed and say what is missing.
```

`.claude/skills/handoff/SKILL.md`:

```markdown
---
name: handoff
description: End a session cleanly when a task is not finished
disable-model-invocation: true
---
Append a JOURNEY.md entry with: task id, what is done, what is left as a numbered list, the exact
next command to run, open decisions, and the branch name. Commit work in progress on the task
branch with the message "<task id>: wip, see JOURNEY". Push. Do not open a pull request.
```

`.claude/agents/security-reviewer.md`:

```markdown
---
name: security-reviewer
description: Reviews a diff of the TiCON Cloud platform for security and tenant isolation gaps
tools: Read, Grep, Glob, Bash
model: opus
---
You review one diff, which the caller passes to you. Do not edit files. Read docs/spec/02 and the rule files in .claude/rules/ first.
Check: R1 import boundary; every new endpoint follows R9 and has a cross-tenant test (R8);
no secret, token, document number or raw AWS error reaches a log, a response or a client bundle;
redirect targets follow U12; IAM changes grant the least needed; inputs are validated with zod.
Report only findings that affect security or the stated rules, each with file, line and a fix.
Say "no findings" when there are none.
```

`.claude/agents/money-reviewer.md`:

```markdown
---
name: money-reviewer
description: Reviews pricing, ledger, wallet, order and EPS code against the specification
tools: Read, Grep, Glob, Bash
model: opus
---
You review one diff against docs/spec/08 and docs/spec/09. Do not edit files; run only git diff and the
pricing vector tests. Check: integer paisa everywhere and
half-up rounding (R4); every ledger transaction balances and nothing updates or deletes ledger rows
(R5); a wallet credit happens only after a verified EPS response with equal id and amount (EPS returns no currency),
under a row lock (R6); idempotency keys with unique constraints (R7); the purchase transaction
locks the wallet, prices on the server, reserves capacity and reverses once on failure.
Run the pricing vectors. Report only findings that can lose or create money, each with a failing
scenario. Say "no findings" when there are none.
```

`.claude/agents/spec-checker.md`:

```markdown
---
name: spec-checker
description: Compares an implementation with the rows of the specification it implements
tools: Read, Grep, Glob
model: sonnet
---
You are given a path and the docs/spec file and rows it implements. List what the specification
asks for that the code does not do: missing routes, states (loading, empty, error, not allowed,
flag off), actions, validation rules, messages in bn and en, AWS statements and names of 16.13.
Do not report style. Do not suggest features the specification does not ask for.
```

## T. Templates

`JOURNEY.md` entry:

```markdown
## 2026-11-12 14:20 WP3-T1 (track A, <driver>)
Done: <what changed, one or two lines>
Proof: <command> -> <result>
VERIFY results: <item>: <what was observed>
Needs decision:
1. <question>. Options: <a>, <b>. Blocks: <task ids>.
Next: <task id or exact next step>
```

Pull request description:

```markdown
Task: WP3-T1
What changed:
Proof (command and output):
Spec sections implemented:
Contracts changed (Section F): none | <which>
Reviewer subagent result:
Risk if this is wrong:
```

Definition of done for a task: the proof passes and its output is in the pull request; `pnpm verify --quick` is green; the reviewer subagent has no open finding that affects correctness or the specification; new endpoints have a cross-tenant test; new text exists in `bn` and `en`; `JOURNEY.md` has the entry; a human approved the pull request.

## U. Glossary and sources for Part 1

| Term | Meaning |
| --- | --- |
| Task | One row of Section E.3, sized for one Claude Code session and one pull request |
| Work package (WP) | A group of tasks with shared acceptance tests (Section 14) |
| Gate (M0 to M7) | The end-of-day check of Section G |
| Track | A set of packages owned by one driver (C.5) |
| Driver | The person who supervises a track's Claude Code sessions |
| Proof | The test or command that shows a task works |
| Pool account | An AWS account of TiCON that holds customers' Lightsail resources (Section 3.1) |
| Launch gate A, B | Product families that open only after their tests pass (Section 1) |

Claude Code documentation checked on 2026-11-11:

- Best practices: https://code.claude.com/docs/en/best-practices
- Worktrees: https://code.claude.com/docs/en/worktrees
- Permissions: https://code.claude.com/docs/en/permissions
- Hooks guide: https://code.claude.com/docs/en/hooks-guide
- Memory, `CLAUDE.md` and rules: https://code.claude.com/docs/en/memory
- MCP: https://code.claude.com/docs/en/mcp
