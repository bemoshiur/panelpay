# SMS gateway (Gennet)

The SMS gateway is Gennet, through its white-label "ISMS" API v3 (WPU-Z3): one POST of JSON per message to `https://isms.gennet.com.bd/api/v3/send-sms`. The web app sends the phone OTP at once (`phone_otp` is never queued) and the `notifier` sends the notification SMS (the `sms` rows of `notifications`). Both use `GennetSmsTransport` (`packages/notify/sms/gennet.ts`) behind `GatewaySmsProvider` (`packages/notify/sms/gateway.ts`). Rules: R3 (no secret in the repository, a log, a ticket or a chat), R14 (no full phone number and no SMS text in a log), R16 (fail closed).

## Trigger

- First set-up of the gateway on a stage (staging first, then production).
- A new token or a new sender id (a rotation, see [secret-rotation.md](secret-rotation.md)).
- The phone step of `/verify` says it is not open or to try later, or SMS notifications stay pending or end failed.

## Who

DevOps (a person) sets the secrets and the IP whitelist. The owner holds the login of the Gennet portal. A Claude Code session never reads, prints or sets a secret and never runs `sst secret`.

## The secrets

| SST Secret    | Holds                                       | Linked to         |
| ------------- | ------------------------------------------- | ----------------- |
| `SmsApiKey`   | the `api_token` of the Gennet API           | `web`, `notifier` |
| `SmsSenderId` | the `sid`, the sender id approved by Gennet | `web`, `notifier` |

Set both in your own terminal, per stage, from the Gennet portal. The values are never written down: not in a file, a ticket, a pull request or a chat, and not in this page.

1. `npx sst secret set SmsApiKey <token> --stage staging`
2. `npx sst secret set SmsSenderId <sender id> --stage staging`
3. Deploy the stage (ask first; production only through the CI deploy after approval). A new value applies at the next deploy.

`SmsSenderId` is new with WPU-Z3. Both SMS secrets are optional (final review M2): `infra/stacks/secrets.ts` declares them with the placeholder `not-configured`, so a stage without an SMS contract deploys with SMS off. `scripts/golive/stage-secrets.sh` asks for both and an empty answer sets nothing (the placeholder applies). Every other secret of `infra/lib/functions.ts` needs a value on a stage before its next deploy (VERIFY: a `sst.Secret` without a value fails the deploy with its name).

What the code does with them (fail closed, R16):

- Both readable and not empty: the web app on stage staging or production builds the gateway, and the phone OTP works; the notifier sends the SMS rows.
- Either one missing, empty, unreadable or the placeholder `not-configured`: the web app has no OTP service (the phone step of `/verify` shows the "not open" state) and the notifier does not read SMS rows at all, so they stay pending with their attempts intact. Nothing is ever sent to Gennet then, and the placeholder is never used as a token or a sender id. Stage local and test never use the real gateway (only `TC_SMS=fake`).

Production must not run with SMS off unnoticed (WPU-Y5):

- Every deploy outputs `smsConfigured`, a boolean that is true only when both secrets hold something other than empty or `not-configured` (`smsConfigured` of `infra/lib/functions.ts`). The output is that boolean and nothing else; no secret value is in `.sst/outputs.json`.
- `scripts/post-deploy-check.mjs --stage production` fails (exit 1) when `smsConfigured` is not true, and is BLOCKED (exit 2) when the output is missing. Staging may run without SMS.
- The notifier logs `{"event":"notifier_sms_off","channel":"sms","severity":"alert"}` at the start of every run without the gateway. Only production has the log filter `NotifierSmsOffFilter` (metric `NotifierSmsOff`, namespace `TiconCloud/Alerts`) and the alarm `NotifierSmsOffAlarm` on the alarm topic: the metric has no stage dimension, and staging runs with SMS off by design in the same account, so a staging filter would fire the production alarm. On staging the line is only in the notifier's log. To clear it, set both secrets and deploy again.

The secrets reach the code as SST links, read with the SST SDK (`Resource` of `sst/resource`, WPU-Z15; through the one link reader `packages/db/links.ts` (`@tc/db/links`), used by `apps/web/server/secrets.ts` and `functions/notifier/secrets.ts` and by the database password in `packages/db/env.ts`). SST 4.17.2 gives a deployed Lambda function its links only in an encrypted file (`SST_KEY_FILE`, `SST_KEY`) and the Next.js server through the wrapper that decrypts that file into `globalThis.SST_KEY_FILE_DATA`; only `sst dev` sets the variables `SST_RESOURCE_SmsApiKey` and `SST_RESOURCE_SmsSenderId`. If a secret cannot be read, SMS stays off (fail closed), and an unreadable database password fails the same way. VERIFY on the first staging deploy: a phone OTP reaches a test phone.

## IP whitelist

The ISMS API refuses a caller whose address is not whitelisted in the portal (status code 4003 "IP Blacklisted" in the public ISMS Plus v3 documentation, logged as `ip_not_whitelisted`; VERIFY for Gennet). Both callers run in the VPC and leave through the NAT, so the portal must list every public NAT address of the stage, the same addresses as `TC_PROBE_SOURCES`:

| Stage                          | NAT                                                                                                                                                                                 | Addresses to whitelist |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| full                           | one managed NAT gateway per Availability Zone ([pool-account-single.md](pool-account-single.md))                                                                                    | two                    |
| lean, before WPU-Z10 is merged | one NAT instance and one Elastic IP per Availability Zone: SST 4.17.2 makes them for `nat: "ec2"` ([verify-review-2026-11-13.md](../analysis/verify-review-2026-11-13.md), item 11) | two                    |
| lean, once WPU-Z10 is merged   | one NAT instance for the whole VPC ([single-account-lean.md](single-account-lean.md))                                                                                               | one                    |

Production runs lean as well (owner decision of 2026-11-13). Read the addresses in the console of the stage's account: VPC, NAT gateways ("Primary public IPv4 address") on a full stage; EC2, Elastic IPs (the addresses associated with the NAT instances) on a lean stage. Each function leaves through the NAT of its own Availability Zone, so with one address missing only some sends fail, with `ip_not_whitelisted`. Whitelist them in the Gennet portal (the owner logs in). When the NAT addresses change (a new stage, `lean` to `full`, the merge of WPU-Z10), whitelist the new ones before the change and remove the old ones after it.

## Reason words of a failed send

The adapter reads Gennet's answer by its `status_code` (WPU-Z17): a third-party Gennet SDK says that Gennet answers a failure with HTTP 200 and status `FAILED` (VERIFY), so the HTTP status alone never decides. Every failed send gets one fixed word. The `notifier` writes it as `detail` in its `notifier_retry` and `notifier_failed` log lines, next to the row id and the template, never with the number, the text, the token or the answer. The phone OTP of the web app does not log the word (its `otp.send` log line says only `upstream_unavailable` or `validation`); to see the word on a stage, send a notification SMS (step 5 of the first test send) and read the notifier log.

| Word                 | Gennet's answer (ISMS v3)                                                                                                                  | Outcome                                                                        | What the owner does                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`              | 4001 Unauthorized                                                                                                                          | failed: the notifier retries, the OTP says "try later"                         | The API token is wrong, revoked or not yet set. Check it in the portal, set the right one with `npx sst secret set SmsApiKey <token> --stage <stage>` in your own terminal, then deploy.                                                                                                            |
| `sender`             | 4002 SID Not Permitted                                                                                                                     | failed                                                                         | The sender id is not approved for the account, or is spelled differently. Check the approved sender id in the portal, set it with `npx sst secret set SmsSenderId <sender id> --stage <stage>`, then deploy.                                                                                        |
| `ip_not_whitelisted` | 4003 IP Blacklisted                                                                                                                        | failed                                                                         | Whitelist every NAT address of the stage (above). If only some sends fail, one address is missing.                                                                                                                                                                                                  |
| `duplicate`          | 4023 Duplicate CMS ID, or an item `DUPLICATE`                                                                                              | failed                                                                         | The same `csms_id` was sent before: a row retried after a lost answer. Find its first send in the portal's report; if it was delivered, nothing to do. If new messages get it, ask Gennet how long a `csms_id` must stay unique and record the answer in JOURNEY.md.                                |
| `rate_limited`       | 4029 Too Many Requests, 4031 TPS Exceeded, 4033 Too Many OTP Requests                                                                      | failed                                                                         | Wait. The notifier pauses the SMS channel for the run after 5 failures in a row and retries the rows later; an OTP customer tries again later. If it lasts, ask Gennet for the account's limits.                                                                                                    |
| `invalid_number`     | 4025 Invalid MSISDN, 4028 Invalid Message Data, or an item `INVALID` or `BLOCKED`                                                          | refused: the row ends failed at once, the OTP form marks the number as invalid | Nothing, for one customer. If every send is refused (for example right after a new sender id), check the sender id: the ISMS table gives 4028 also for an invalid sender id or `csms_id`, and an item `INVALID` also for a text that is too long. Read the code of the send in the portal's report. |
| `unknown`            | any other code (4004, 4005, 4020, 4022, 4024, 4026, 4027, 4030, 4032, 4034, 4035, 5000), no code, a body that is not JSON, a network error | failed                                                                         | Read the status code of the send in the portal's report: the balance (no code for an insufficient balance is documented), an outage, a new code. If a code repeats, record it in JOURNEY.md so that the adapter can name it.                                                                        |

An answer without one of these codes is read by its words (`error_message`, `status_message`, and `status_meaning` and `description` in Gennet's second answer shape) only to pick `token`, `sender`, `ip_not_whitelisted`, `duplicate` or `rate_limited`; words never refuse a number. A refusal counts only in an answer of HTTP 2xx, 400, 413 or 422; with any other HTTP status the send is failed and its word is read from the body. A failed SMS without a word timed out (no answer within 10 seconds) or was refused by our own checks before the gateway (an empty or too long text).

## First test send (staging)

Only on staging, only to the operator's own phone, never to a customer's number.

1. Both secrets are set, the stage is deployed after they were set, and the NAT addresses are whitelisted.
2. Sign in to the staging panel with a test account, open `/verify`, enter your own mobile number and send the code.
3. Expect within a minute exactly: `PanelPay Your OTP is: <six digits>. Please do not share your OTP with anyone.` (the provider's OTP format with the brand PanelPay, owner decision of 2026-11-13; the operator's template must match it). Enter the code: the number shows as verified.
4. In the Gennet portal, the sent report shows the message. Where it shows our id of the message (`csms_id`), it is 20 characters of the letters A-Z and the digits 2-7.
5. A notification SMS: approve the identity check of the test account in the admin app (`kyc_approved` has an SMS). The notifier log shows `notifier_sent` with channel `sms` and the row id, never the number or the text. If the send fails, `notifier_retry` or `notifier_failed` carries the reason word as `detail` (table above).
6. If the code does not come (the page says the phone step is not open, or to try later), check in this order: the two secret names are set on the stage (names only) and the deploy came after them; the reason word of a notification SMS in the notifier log (step 5); the IP whitelist; the balance and the sender id in the portal; the portal's report for the status code of the answer.

## VERIFY items (open until the first test send)

Source of what is known: the public ISMS Plus API documentation of SSL Wireless, https://ismsplus.sslwireless.com/api-documentation (read on 2026-11-13; the same field names as the Gennet API the owner described). The Gennet page https://isms.gennet.com.bd/developer/api-info needs the portal login and was not read; the owner can compare it with the items below.

- The answer format. The adapter expects the ISMS Plus v3 answer of SSL Wireless (same field names): JSON with `status` (`SUCCESS` or `FAILED`), `status_code`, `error_message` and `smsinfo` items with `sms_status`, `status_message`, `csms_id` and `reference_id`; it also reads a second shape with `status_meaning` and `description` (the test fixtures of a third-party Gennet SDK). Only HTTP 2xx with status `SUCCESS` (and an `smsinfo` item `SUCCESS`) is a sent message. Refused (the customer sees a field error, the row ends failed): status codes 4025 and 4028, or an item `INVALID` or `BLOCKED`, in an answer of HTTP 2xx, 400, 413 or 422 (WPU-Z17). Everything else is failed (retried by the notifier, "try later" for the OTP), with a reason word (above). If Gennet answers differently, sends fail; they are never counted as sent by mistake. Confirm the codes, and whether Gennet uses 4028 for an invalid sender id: then a wrong sender id shows as `invalid_number` and its sends are refused instead of retried.
- Duplicate `csms_id`. The notifier derives the `csms_id` from the row id, so a retry of a row has the same id; the OTP derives it from the challenge id, which is sent once. ISMS Plus documents 4023 "Duplicate CMS ID" (and an item `DUPLICATE`); the adapter treats it as failed (`duplicate`). After a lost answer the first SMS may have arrived: each retry is then answered as a duplicate (`duplicate`, unavailable) until the row's attempts run out and it ends failed; no second SMS is sent, and repeated duplicates count toward the run's SMS pause streak. Confirm how Gennet answers a repeated `csms_id`. Also VERIFY whether Gennet uses 4028 for an invalid sender id or csms_id (the adapter refuses 4028 as an invalid number) and whether an item BLOCKED without 4033 can mean an OTP rate limit (the adapter refuses it).
- The IP whitelist (above), and whether the web function and the notifier really leave through the whitelisted NAT addresses.
- The brand in the OTP. The OTP text starts with `PanelPay`, which is also a domain name (73 characters, one GSM 7-bit part, no other link). Confirm that Gennet's OTP template takes this brand as written and that the message is not filtered as an SMS with a link (some phones show `PanelPay` as a link). Since WPU-Z8 every notification SMS also starts with `PanelPay: `; check one notification SMS in the same test send.
- Bengali text. Notification SMS in Bengali are Unicode (ISMS reports `sms_type` `BN`); confirm that Gennet sends them and how it counts the parts. The OTP is always English.
- Limits. ISMS Plus documents 4029 Too Many Requests, 4031 TPS Exceeded and 4033 Too Many OTP Requests (all three `rate_limited`). The notifier sends at most 50 rows a run, one after the other, and pauses the SMS channel for the run after 5 failures in a row.
- Rotation. The token and the portal password were once pasted into a chat (JOURNEY.md, owner decisions round 3): the owner rotates both before the first use.

## Stop all SMS at once

Revoke or regenerate the API token in the Gennet portal: every send then fails at the gateway (nothing is sent), at once and without a deploy. The OTP answers "try later", SMS rows are retried and end failed (reason word `token`). To start again, set the new token with `npx sst secret set SmsApiKey <token> --stage <stage>` and deploy.

## Log

Date, stage, which secret names were set (never a value), the whitelisted addresses as "NAT addresses of the stage" (not the token), the result of the test send (code received or not, the reason word of the notifier log, the status code read in the portal).

## Must not

Write a token, a sender id, a portal password or a phone number in the repository, a log, a ticket, a pull request or a chat; test with a customer's number or on production; use the account for bulk SMS or for the OTP of another service (Google, Facebook, WhatsApp and the like are forbidden by the provider); change the OTP text without the provider's template; turn off the IP whitelist to make a test pass.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
