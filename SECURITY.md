# Security policy

PanelPay handles money (a wallet and a double-entry ledger) and creates cloud resources, so we take
security reports seriously.

## Report a vulnerability

**Do not open a public issue for a security problem.**

1. Use GitHub's private report: [Report a vulnerability](https://github.com/bemoshiur/panelpay/security/advisories/new).
2. If that is not possible, send a private message to the maintainer on
   [LinkedIn](https://www.linkedin.com/in/in-moshiur) and say only that you have a security report; details
   follow in a private channel.

Please include what you found, the steps to reproduce it, and the impact. We aim to acknowledge a report
within 3 working days and to tell you the plan within 10 working days. We will credit you in the fix unless you
prefer to stay anonymous.

## Scope

In scope: code in this repository (the web and admin apps, the Lambda functions, the packages, the SST
infrastructure code, the CI workflows).

Out of scope: your own deployment's configuration, AWS itself, third-party services (EPS, SMS providers),
social engineering, and denial of service by volume.

## What we ask of you

- Test only against your own deployment, never against someone else's.
- Never read, change or delete data that is not yours.
- Never put real secrets, keys or customer data in an issue, pull request or test.

## For people running this software

- Keep the secrets in SST Secrets or your own secret store, never in the repository.
- Use short-lived credentials (OIDC and STS AssumeRole). The code is written so that no long-lived AWS key is
  needed (rules R3 and R17 in [CLAUDE.md](CLAUDE.md)).
- Read [docs/spec/15-security-gate-before-launch.md](docs/spec/15-security-gate-before-launch.md) before you
  take real payments.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
