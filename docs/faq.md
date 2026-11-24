# Frequently asked questions

## What is PanelPay?

PanelPay is a free, open-source control panel and billing system for reselling Amazon Lightsail. Customers
top up a prepaid wallet and launch servers, databases, storage, CDN, DNS zones and domains. The platform charges
the wallet, keeps a double-entry ledger, creates the resources in your AWS accounts and renews or suspends them
on schedule.

## Is it a WHMCS alternative or a WHMCS module?

It is an alternative for one job: selling AWS Lightsail resources with a prepaid wallet. It is not a WHMCS
module and does not replace WHMCS for shared hosting, SSL, email hosting or postpaid billing. Some sellers run
both. See [For hosting resellers](for-hosting-resellers.md).

## Am I allowed to resell AWS Lightsail?

That is decided by AWS, not by this software. Read the AWS Customer Agreement and service terms and ask AWS
whether your model is allowed. This project gives you no right to resell AWS. See the notes in the
[README](../README.md#important-notes-before-you-use-it).

## Which AWS services does it use?

Amazon Lightsail (instances, disks, databases, buckets, load balancers, containers, CDN distributions, static
IPs, snapshots), Amazon Route 53 (DNS zones and domain registration), AWS Lambda, Amazon SQS, Amazon EventBridge
Scheduler, Amazon RDS for PostgreSQL with RDS Proxy, Amazon Cognito, Amazon CloudFront with AWS WAF, Amazon SES,
Amazon S3, AWS KMS and AWS STS.

## How does it handle many customers and AWS limits?

It uses several AWS accounts. Some Lightsail limits cannot be raised, so capacity grows by adding "pool"
accounts, which is a configuration change. Each customer has a home pool account per Region. See
[Architecture explained](architecture-explained.md).

## How are customers kept apart from each other?

Two layers. In the database, all customer data is read through tenant-scoped repositories with cross-tenant
tests. On AWS, every Linux instance gets firewall rules at first boot that drop traffic from the private
network of the pool account, and the platform checks that this worked before it marks the server ready.

## How is money handled?

In integer paisa, never floating point. The ledger is double-entry and append-only; mistakes are corrected with
reversing transactions. A wallet is credited only after server-to-server verification with the payment gateway
of the same transaction id and amount.

## Which payment gateways are supported?

EPS, the Bangladesh gateway, is built in. The gateway code is isolated in `packages/eps`, and other gateways are
welcome as contributions. Open an issue first so the interface is agreed.

## Can I use it outside Bangladesh?

The market, currency, tax lines and gateway are configuration and adapters, not hard-coded, so it can be
adapted. The shipped defaults (taka, VAT lines, EPS, Bangla and English messages) are for Bangladesh. Expect to
write a gateway adapter and review the tax and invoice settings for your country.

## Is it ready for production?

Not yet. The code is complete and was proven on a staging environment, but it has not taken real customer money
in production. Read the [security gate](spec/15-security-gate-before-launch.md) before you accept payments.

## How much does it cost to run?

The control plane is mostly serverless plus one PostgreSQL instance. The author's planning estimate for a lean
production setup was about 80 to 90 USD per month before customer resources. Your cost depends on your design
choices, traffic and AWS prices. See [single-account-lean](runbooks/single-account-lean.md).

## Why open source?

To let people learn how a safe, multi-account AWS reseller platform is built, to let sellers run their own, and
to build it together. The name and logo are not licensed for reuse; see [NOTICE](../NOTICE).

## Why is the website theme not in the repository?

The original panel uses a commercial theme that cannot be redistributed. The project builds and tests without it,
and you can add your own licensed copy. See [theme.md](theme.md).

## How do I contribute?

Read [CONTRIBUTING.md](../CONTRIBUTING.md). Good first areas: payment-gateway adapters, translations, docs and
runbooks, Lightsail product adapters, and a WHMCS bridge.

## Who made it?

[S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur), with contributors.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
