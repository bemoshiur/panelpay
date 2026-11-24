# Domain registration problem

Section M: "domain registration problem". Section 12: all calls run in `tc-dns`; Route 53 Domains uses the `us-east-1` endpoint; no refunds on registrations. The domain family flag stays off in production until the legal text is ready (R12).

## Trigger

A domain order stays `waiting` long, goes `needs_attention`, or the customer reports the domain is suspended or the verification email was never confirmed.

## Who

Operations (`ops`); support talks to the customer.

## Safe checks

1. `/operations`: the operation's step and attempts. Registration is asynchronous; the provisioner polls `GetOperationDetail` with `waiting` and `next_run_at`.
2. TLDs that need extra parameters or eligibility proof go to an admin review step before `RegisterDomain`; check that the review was done.
3. The registrant must confirm the verification email. A domain left unverified is suspended by the registry. Ask the customer to check the address they gave.
4. The automatic hosted zone created by `RegisterDomain` should be adopted, not duplicated. Reconciliation rows of kind `orphan` or `missing` on `/reconciliation` can point to it.
5. Quota: 20 domains per account by default; check [capacity-full-and-quota.md](capacity-full-and-quota.md).
6. Configuration (WPU-X10). Every create, renewal and "registry confirmed not renewed" check fails closed with `not_configured` when the provisioner lacks `TC_DNS_ACCOUNT_ID`, `TC_DNS_EXTERNAL_ID` (the `tc-dns-roles` stack, role `TcDnsProvisioner` trusting this stage) or `TC_DOMAIN_CONTACT_KEY_ARN` (the KMS key `alias/tc-<stage>-domain-contact`, set by the deploy). A draft on `/domains/new` answers "unavailable" when the web app lacks `DOMAIN_CONTACT_KEY_ARN`. The catalog sync logs `"tlds":{"ok":false}` when `ListPrices` with `TcDnsReader` fails; without TLD prices no domain can be priced. Only the web role may encrypt with the contact key and only the provisioner may decrypt; never add another grant to read a contact by hand.
7. The name search on `/domains` still says "unavailable": the reader's `checkDomain` is not built (JOURNEY, WPU-X10). An order does not need it, because the provisioner checks the name again before `RegisterDomain`.

## Steps

1. Waiting for the registry: wait; no action.
2. `needs_attention`: fix the cause (contact details, quota), then `retryOperation`. For a permanent refusal `rejectOperation`; the reversing ledger transaction is posted. Note that a registration already accepted by the registry is not refunded (Section 12).
3. Unverified or suspended domain: tell the customer to confirm the email; support records the case with `replyByEmail`.
4. Zones not delegated to Route 53 within 14 days are removed after two notices: nothing to do by hand.

## Rollback

None for a registration. A wrong zone adoption is fixed with a new operation, not by editing Route 53 by hand.

## Log

Operation id, domain name (not secret), step, decision, admin.

## Must not

Register a domain by hand in the console for a customer; turn the domain flag on in production; use the management account.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
