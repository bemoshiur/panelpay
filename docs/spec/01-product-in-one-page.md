<!-- GENERATED, do not edit. Source: TICON_CLOUD_MEGA_PLAN.md, section "1. Product in one page". Change the plan, then run pnpm spec:split. -->

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

