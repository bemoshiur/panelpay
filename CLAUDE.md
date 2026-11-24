# PanelPay platform

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
