# For hosting resellers and WHMCS sellers

If you sell hosting, VPS or cloud and you are looking at AWS Lightsail as something to offer, this page helps you
decide whether TryAWS.now fits. It is written to be fair: TryAWS.now is **not** a WHMCS module and not a
general-purpose billing system.

## What TryAWS.now is, and is not

|                                                                  | TryAWS.now                                                                            | WHMCS (for comparison)                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| What it is                                                       | A purpose-built panel, wallet, ledger and provisioner for **reselling AWS Lightsail** | A general-purpose billing and client-management platform for hosting businesses |
| Licence                                                          | Open source, Apache-2.0                                                               | Commercial                                                                      |
| Stack                                                            | TypeScript, Next.js, PostgreSQL, AWS Lambda, SST                                      | PHP                                                                             |
| Billing model                                                    | **Prepaid wallet** with a double-entry ledger; no postpaid                            | Invoices and many billing models                                                |
| AWS provisioning                                                 | Built in: Lightsail and Route 53, multi-account pooling, lifecycle                    | Through modules or custom code                                                  |
| Tenant isolation on AWS                                          | Built in (private-network rules on every instance)                                    | Not its job                                                                     |
| Other products (shared hosting, SSL, support desk of many kinds) | Not included                                                                          | Broad ecosystem                                                                 |
| Payment gateways                                                 | EPS (Bangladesh) built in; adapters welcome                                           | Many gateways                                                                   |
| Maturity                                                         | Pre-launch, proven on staging                                                         | Mature, widely used                                                             |

This table is a good-faith summary of public information and of this repository's code. Check each vendor's own
documentation for the current facts. TryAWS.now is not affiliated with WHMCS Limited.

## When TryAWS.now fits

- You want to sell **only AWS-backed** resources (servers, databases, storage, CDN, DNS, domains) with your own
  brand and your own prices.
- Your customers prefer or need to **prepay in a local currency** and cannot pay AWS directly with a card.
- You want to **read, audit and change the code**, run it in your own AWS organization, and own your data.
- You value **tested money rules** (append-only ledger, idempotent jobs, server-to-server payment verification).

## When it does not fit (yet)

- You need shared cPanel hosting, SSL resale, email hosting or a large marketplace of modules. Keep WHMCS for
  those.
- You need postpaid invoices and credit terms.
- You need a gateway that is not built in and cannot write an adapter. (Contributions are welcome.)

## Using it next to WHMCS

A common path is to run both: keep WHMCS for your existing products and use TryAWS.now for the AWS-backed
line. The [WHMCS addon](../pro/whmcs/README.md) opens the panel with the client's e-mail filled in and lets
clients pay wallet top-ups through WHMCS invoices, which the panel verifies server to server before crediting. It
is not full single sign-on and does not sync balances back into WHMCS.

The quickest way to run both is **[TryAWS.now Pro](pro-edition.md)**: one CloudFormation stack in your AWS
account, with the addon on the AMI (coming soon on AWS Marketplace).

## Before you resell AWS

- **Permission and terms.** AWS decides who may resell its services. Read the AWS Customer Agreement and service
  terms, and ask AWS (or your account team) whether your model is allowed. Being in a partner programme may
  change service quotas without being a resale licence. This software does not grant you any right.
- **Trademarks.** Follow the AWS Trademark Guidelines in your marketing. Say clearly that the service runs on AWS.
- **Tax and law.** VAT, invoicing, KYC and consumer rules vary by country. Get local advice.
- **Support and abuse.** You become the first line for your customers' abuse and support. Plan for it.

## Next steps

1. Read [Architecture explained](architecture-explained.md).
2. Read the full specification in [docs/spec/](spec/) and the security gate in
   [docs/spec/15-security-gate-before-launch.md](spec/15-security-gate-before-launch.md).
3. Try it locally with the commands in the [README](../README.md#quick-start-developers).
4. Join the discussion or open an issue with what you need.

---

_TryAWS.now is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
