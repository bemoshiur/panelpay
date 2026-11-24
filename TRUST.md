# TiCON Trust Center

Security, compliance and data-handling information for products of **TiCON System Limited** sold on
AWS Marketplace:

- **PanelPay Pro**: prepaid Amazon Lightsail reseller panel with WHMCS (AMI with CloudFormation).
- **BlessBit Multicast**: one live feed to many Facebook Pages and YouTube channels (SaaS).

Questions, or a document you need for a vendor review: **business@ticonsys.com** ·
[book a call](https://cal.com/ticonsys/meeting).

## Company

| Item                                 | Status                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Legal entity                         | TiCON System Limited, with separately registered companies in Bangladesh, South Korea and the USA |
| AWS                                  | AWS Partner; AWS Marketplace seller                                                               |
| ISO/IEC 27001 (information security) | Certified. Certificate available on request                                                       |
| ISO 9001 (quality management)        | Certified. Certificate available on request                                                       |
| SOC 2, PCI DSS, HIPAA                | Not certified. We do not claim them                                                               |

## How each product handles your data

### PanelPay Pro (runs in your AWS account)

TiCON does not host your data. The CloudFormation stack runs the panel in **your own AWS account**,
so customer data, invoices and logs stay there.

- **Access**: no long-lived AWS keys. The instance uses its instance role (IMDSv2 only, hop limit 1). The
  provisioning roles trust only that role, with an ExternalId.
- **Least privilege**: IAM roles are scoped to the stack. Route 53 roles are created only if you turn on
  domain selling (`EnableDomains=yes`). The stack must go in an account used only for PanelPay.
- **Network**: the security group opens 80 and 443. SSH is allowed only from your operator CIDR, which can
  be no wider than /8. A host firewall (nftables) keeps the internal ports local and blocks instance-metadata
  access for every user except root and the worker.
- **Encryption**: encrypted EBS volume; TLS for the panel; the invoices bucket uses SSE-S3, blocks public
  access, and is kept when the stack is deleted.
- **Sign-in**: Amazon Cognito user pools for customers and operators.
- **Money**: amounts are kept as integers (no floating point); the ledger is double-entry and append-only.
- **Source**: open source (Apache-2.0). You can read every line in this repository.

Details: [docs/pro-edition.md](docs/pro-edition.md) and [pro/box/README.md](pro/box/README.md).

### BlessBit Multicast (SaaS operated by TiCON)

- **Hosting**: runs on AWS in the Asia Pacific (Mumbai) Region, with Amazon Route 53 for DNS.
- **Stream keys**: never written to logs or metrics.
- **OAuth tokens** for Facebook and YouTube: encrypted at rest (AWS KMS).
- **Sign-in**: email one-time code or Google. Your AWS identity is never used as a login; an AWS
  Marketplace purchase is linked to your workspace with a signed, single-use claim.
- **Content**: your broadcast is relayed without re-encoding and without a watermark. BlessBit does not
  record your stream.
- **Policies**: [Privacy](https://blessbit.live/privacy/) · [Terms](https://blessbit.live/terms/) ·
  [Data deletion](https://blessbit.live/data-deletion/).

BlessBit Multicast is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc. or Google LLC.

## Report a security problem

Do not open a public issue. Follow [SECURITY.md](SECURITY.md) (GitHub private vulnerability report). We aim
to acknowledge within 3 working days and to share a plan within 10 working days.

## Documents available on request

Under NDA where needed: ISO/IEC 27001 and ISO 9001 certificates, information security policy, and a completed
security questionnaire (for example CAIQ). Write to business@ticonsys.com.

---

_Last reviewed: 23 November 2026. AWS and Amazon Lightsail are trademarks of Amazon.com, Inc. or its
affiliates._
