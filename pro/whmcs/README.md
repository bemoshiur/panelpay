# PanelPay Pro: WHMCS addon (PRO-6)

For resellers who sell PanelPay Pro (AWS Lightsail under their own brand) to clients they already
bill in WHMCS. Two things, both owner decisions of 23 Nov 2026:

1. **Open panel.** The client area page `index.php?m=panelpay` links to the panel's own sign-in page
   with the client's e-mail filled in. The client signs in with the panel password; WHMCS gets no new
   sign-in power over the panel.
2. **Top up wallet.** The client enters an amount and gets a normal WHMCS invoice ("PanelPay wallet
   top-up (USD 25.00) [ref …]"; the reference ties the invoice to the client and e-mail that made it). They pay it with any gateway of your WHMCS. When it is paid, the addon tells the panel the
   invoice number. The panel then reads the invoice **from your WHMCS API itself** and credits the
   wallet only if all of this holds:
   - the invoice is paid in full;
   - every line is a top-up line;
   - the WHMCS client's e-mail matches exactly one verified panel account;
   - the currency equals that account's wallet currency.

   An invoice is credited at most once, however often it is sent.

## Install

1. On the Pro box, run the installer with the three WHMCS answers:
   - WHMCS URL;
   - API identifier;
   - API secret.

   The installer starts `tc-bridge` and writes the bridge secret to `/etc/tc/bridge-secret.txt`. Only root can read that file.

2. In WHMCS, create an **API role** that allows only `GetInvoice` and `GetClientsDetails`, and an API
   credential for an admin with that role. Those are the identifier and secret of step 1.
3. Copy `modules/addons/panelpay/` into your WHMCS `modules/addons/`. Then activate **PanelPay Panel** in
   _System Settings → Addon Modules_ and set:
   - **Panel URL**: `https://panel.your-brand.com`;
   - **Bridge secret**: the content of `/etc/tc/bridge-secret.txt`;
   - the smallest and largest top-up.
4. Set each client's WHMCS currency to the panel's market currency. An invoice in another currency is
   held for review and never converted.

## What the panel refuses, and where it shows

The panel never credits a paid top-up in these cases. Each one is recorded as a payment discrepancy on the
operator's reconciliation screen (note `whmcs invoice <n>: <reason>`), and WHMCS logs
`PanelPay: invoice #… not credited yet (…)` in the Activity Log:

| Reason             | Meaning                                                                                                 | What to do                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `unmatched`        | The client's WHMCS e-mail is not the e-mail of exactly one verified panel account.                      | Fix the e-mail, then re-send.                                 |
| `ref`              | The client's WHMCS e-mail changed after the invoice was made. The money is not sent to another account. | Check with the client; an operator decides.                   |
| `currency`         | The client's WHMCS currency changed after the invoice was made.                                         | An operator decides; nothing is converted.                    |
| `wallet currency`  | The WHMCS currency is not the panel wallet's currency.                                                  | Set the client's WHMCS currency to the panel market currency. |
| `paid_with_credit` | The invoice was paid with WHMCS credit balance, which can be a refund of a top-up already credited.     | An operator decides.                                          |
| `line`             | A line is not in the addon's own format (edited by hand).                                               | An operator decides.                                          |
| `changed`          | The invoice was already credited, and WHMCS now shows another amount.                                   | An operator decides.                                          |

**Refunds.** When a credited top-up is refunded, cancelled or marked unpaid in WHMCS, the addon tells the
panel. The panel records `whmcs invoice <n>: now Refunded` (or Cancelled, Unpaid) for an operator, who
corrects the wallet with an approved adjustment. The panel never reverses a wallet automatically.

**Missed notices.** If the panel was down when an invoice was paid, the bridge finds it within 15 minutes:
every 15 minutes it reads the newest paid invoices from your WHMCS and credits any top-up it has not credited
yet. To force it now, open _Addons → PanelPay Panel_, enter the invoice number and choose **Re-send**.

## Tests

`php pro/whmcs/test/lib-test.php` tests the PHP helpers and prints the signature the panel side pins in
`pro/whmcs-bridge/server.test.ts`.
