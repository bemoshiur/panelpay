# Contributing to PanelPay

Thank you for helping. PanelPay is an open-source, prepaid AWS Lightsail reseller panel, and it gets better
with people who know AWS, billing, payments, Next.js or hosting operations.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). By sending a contribution you agree it is
licensed under the [Apache License 2.0](LICENSE) (section 5 of the licence).

## Good places to start

- Issues labelled **good first issue** and **help wanted**.
- A **payment-gateway adapter**. EPS (the Bangladesh gateway) is built in, in `packages/eps`. Other gateways
  (Stripe, SSLCommerz, bKash and more) are welcome: open an issue first so we agree on the interface.
- **Translations** of the panel messages (`packages/ui/messages/`).
- **Runbooks and docs** in `docs/`: clearer is always better.
- **Lightsail product adapters** in `packages/aws/adapters/` (with the AWS API behaviour you verified).
- A **WHMCS bridge** or import tool for sellers who move from WHMCS.

Open an issue first for anything bigger than a small fix, so we can agree on the approach before you spend time.

## Set up

Requirements: Node.js 24, pnpm 10, Docker.

```bash
pnpm install
pnpm db:up && pnpm db:migrate      # local PostgreSQL in Docker
pnpm verify --quick                # lint, typecheck, unit tests of the packages you changed
pnpm test --filter @tc/core        # the tests of one package
```

The commercial website theme is **not** in this repository. The project builds and tests without it
(see [docs/theme.md](docs/theme.md)).

## The rules that never bend

These protect real money and real customers. A pull request that breaks one will not be merged. The full list
(R1 to R17) is in [CLAUDE.md](CLAUDE.md) and [docs/spec/02-rules-that-are-never-broken.md](docs/spec/02-rules-that-are-never-broken.md).
The ones you will meet first:

- Money is integer **paisa** (`bigint`). No floats. Rounding is half-up. Decimal maths only in `packages/core/pricing`.
- The ledger is **double-entry and append-only**. A correction is a reversing transaction, never an edit.
- Credit a wallet only after **server-to-server payment verification** of the same transaction id and amount.
- Every state-changing request and job is **idempotent**, enforced by a unique key.
- Customer data is read only through **tenant-scoped repositories**; every endpoint has a cross-tenant test.
- The web and admin apps **never call AWS provisioning**; they write an operation row and enqueue it.
- **Fail closed:** if a check cannot complete, refuse the action.
- No secrets, no AWS account ids, no personal data in the repository, in logs or in tests.

## How to work

1. Fork, then branch from `main`. One topic per pull request.
2. Write the test first for `packages/core`, `packages/db`, `packages/eps` and `packages/aws`. See it fail, then implement.
3. Run `pnpm verify --quick` and the tests of what you touched. Show the command and its output in the pull request.
4. Keep the commit message in the form `<area>: <change>`.
5. Open the pull request and fill in the template. Money, auth or tenant-isolation changes get an extra review.

Do not edit generated files (`docs/spec/` is generated from `TICON_CLOUD_MEGA_PLAN.md` by `pnpm spec:split`).
A change to a contract in `docs/spec/F-contracts-between-tracks.md` is its own pull request.

## Using an AI coding assistant

This repository includes [CLAUDE.md](CLAUDE.md), `.claude/` rules and agents. AI-assisted pull requests are
welcome under the same rules as any other: you are responsible for what you submit, the tests must pass, and
the evidence must be real output.

## Reporting a security problem

Do not use a public issue. See [SECURITY.md](SECURITY.md).

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
