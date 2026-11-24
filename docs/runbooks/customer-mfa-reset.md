# Customer authenticator (TOTP) reset

Section M: "customer sign-in help". WPU-X11. Rules R10, R14, R16.

A customer buys only with a verified e-mail, a verified mobile number and an authenticator app switched on. Cognito keeps the real setting. The platform keeps a copy, `customers.totp_enabled_at`, because the purchase code in `packages/core` cannot call Cognito. The copy is cleared by the platform itself whenever it sees that Cognito says the authenticator is off; this page is for the support steps that change the Cognito setting from outside the panel, and it tells what clears the copy.

## Trigger

A customer has lost the phone with the authenticator app, or asks support to switch the authenticator off, or a support colleague must call `AdminSetUserMFAPreference` for the customer's user in the customer pool.

## Who

Support with the superadmin role, with the control-plane role of the stage (never a long-lived key). The customer is identified by the verified e-mail of the request and a second proof you agree on with the owner (for example an SMS code to the verified phone number). Without that proof nothing is reset: a reset is how an attacker takes an account.

## Safe checks

1. The request comes from the e-mail address of the account and from the support page, not from a forwarded message.
2. Look at the audit rows of the customer on `/customers/[id]`: a recent `auth.totp_drift` row means the authenticator was already switched off outside the panel, and the request may follow a theft.
3. Ask for the second proof. A customer who cannot give it waits; do not reset to be kind.

## Steps

1. Switch the authenticator off at Cognito for that user: `AdminSetUserMFAPreference` with the software token disabled.
2. End the Cognito sessions of the user: `AdminUserGlobalSignOut`. Know what it does and does not do. It stops the refresh tokens, so no session can renew itself. It does NOT set `customers.sessions_valid_after` (the platform's cut-off, which only the customer's own switch-on and switch-off and an admin suspension set). An access token that was already issued therefore stays accepted for the ordinary pages of the panel until it expires, which is the access token lifetime of the pool. Draft and purchase are not affected by this: they ask Cognito first and refuse a signed-out token.
   - If an `auth.totp_drift` row exists for the customer, or theft is suspected, that is not enough. Suspend the customer in the admin app (suspension sets the cut-off at once; this is also the way to stop a thief's open session on the panel) and unsuspend after the customer has proved who they are. When the admin action "reset authenticator" exists (a tracked follow-up, see below) use that instead of a suspension.
   - After suspected theft also reset the password of the customer (`AdminResetUserPassword`, or the customer's own reset flow after the proof): the thief may still hold it.
3. The platform copy `customers.totp_enabled_at` is cleared by the platform, not by hand, at the first of these: the customer's next sign-in (the tokens come without the authenticator challenge, so the sign-in clears the copy and writes the audit row `auth.totp_drift`), or the next draft or purchase (it asks Cognito for the setting of the session's user with GetUser, refuses when the authenticator is off or the answer cannot be had, and clears the copy). Until then the core still sees the old copy, but no draft or purchase passes without the Cognito check. There is no admin action that writes `totp_enabled_at` directly; do not edit the database by hand.
4. Tell the customer: the account has no authenticator now, buying is blocked, and they switch it on again in Settings, Security after they sign in with the password.

## Rollback

There is none for a wrong reset except to switch the authenticator on again with the customer, who must have a fresh sign-in. If the reset was a mistake of ours, say so in the ticket and tell the owner.

## Log

Customer id, the ticket, who did the reset, which proof was used (the word, not the value), the time. Never the secret key, an authenticator code, a token or the phone number (R14).

R10: a reset made outside the admin app leaves no admin audit row. The record is then (a) the CloudTrail events of the customer pool's account, `AdminSetUserMFAPreference`, `AdminUserGlobalSignOut` and, when used, `AdminResetUserPassword`, with the role that called them, and (b) the ticket, which must hold the reason, the actor, the time and the proof used. The platform's own `auth.totp_drift` row is written later, when the copy is cleared. Until the admin action "reset authenticator" exists (a tracked follow-up: it clears the copy, sets the cut-off and writes the audit row with actor, reason, IP and target, R10), every such reset needs both records.

## Must not

Reset on the word of a chat message or a forwarded e-mail alone; switch the authenticator off at Cognito and consider the job done without telling the customer; read or ask for the secret key or a code of the app; keep a copy of any code or key in a ticket; change `customers` by hand to clear the copy.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
