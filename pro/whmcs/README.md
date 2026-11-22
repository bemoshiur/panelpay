# TryAWS.now Pro: WHMCS addon (PRO-6)

For resellers who sell TryAWS.now Pro (AWS Lightsail under their own brand) to clients they already
bill in WHMCS. Two things, both owner decisions of 23 Nov 2026:

1. **Open panel.** The client area page `index.php?m=tryawsnow` links to the panel's own sign-in page
   with the client's e-mail filled in. The client signs in with the panel password; WHMCS gets no new
   sign-in power over the panel.
2. **Top up wallet.** The client enters an amount and gets a normal WHMCS invoice ("TryAWS.now wallet
   top-up"). They pay it with any gateway of your WHMCS. When it is paid, the addon tells the panel the
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
3. Copy `modules/addons/tryawsnow/` into your WHMCS `modules/addons/`. Then activate **TryAWS.now Panel** in
   _System Settings → Addon Modules_ and set:
   - **Panel URL**: `https://panel.your-brand.com`;
   - **Bridge secret**: the content of `/etc/tc/bridge-secret.txt`;
   - the smallest and largest top-up.
4. Set each client's WHMCS currency to the panel's market currency. An invoice in another currency is
   held for review and never converted.

## When a top-up was not credited

WHMCS logs `TryAWS.now: invoice #… not credited yet (reason)` in the Activity Log. Reasons:

| Reason                          | What to do                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `unmatched`                     | The client's WHMCS e-mail is not the e-mail of one verified panel account. Fix it, then re-send.        |
| `review`                        | Another currency, or the invoice changed after it was credited. An operator decides in the panel admin. |
| `not_paid`                      | Not paid in full yet. It is sent again automatically when WHMCS marks it paid.                          |
| `unavailable` / `unreachable_…` | The panel or your WHMCS API did not answer. Re-send.                                                    |

To re-send, open _Addons → TryAWS.now Panel_, enter the invoice number and choose **Re-send**. On the box,
an operator can also run `node /opt/tc/current/bridge/bridge.mjs recheck <invoice>` with the bridge environment.

## Tests

`php pro/whmcs/test/lib-test.php` tests the PHP helpers and prints the signature the panel side pins in
`pro/whmcs-bridge/server.test.ts`.
