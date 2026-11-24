# Support requests

Routine in Section M: first answer within 1 working hour in launch week (operations lead). The admin page is `/support` (role `support`).

Support is an in-app request system with a thread (owner decision 2026-11-13, round 3): there is no support phone and no support e-mail address. A signed-in customer reads the answers and replies in the panel; a visitor of the public form gets the answer by e-mail and answers with a new request.

## Trigger

A request in state `open` on `/support`: a new request from the public form or the panel, or a request whose customer has replied in the panel (a customer reply opens an `answered` or `closed` request again). The list shows the newest activity first.

## Who

Operations lead; admins with the `support` role.

## Safe checks

1. `/support`: category, subject, state (`open` waits for support, `answered` waits for the requester, `closed` is done), last activity. The requester's address is masked (R14).
2. `/support/<id>`: the whole conversation, oldest first: the request, then every reply with its author (customer, visitor, or the admin by the first characters of the id) and its time.
3. Is the requester a customer or a visitor? A customer request carries the customer id from the session; a visitor request carries a name and an e-mail only.
4. Route by category: money to [payment-stuck-or-disputed.md](payment-stuck-or-disputed.md); provisioning to [provisioning-failed-and-dead-letter.md](provisioning-failed-and-dead-letter.md); KYC to [kyc-review.md](kyc-review.md); abuse to [abuse-notice-and-suspension.md](abuse-notice-and-suspension.md).

## Steps

1. Reply (`replyByEmail`): the text becomes a message of the conversation and the request becomes `answered`. A customer gets an e-mail that a reply waits in the panel, with a link to the request; a visitor gets the text by e-mail. The audit row keeps the length of the reply, never the text. One reply per question.
2. `closeRequest` (with a reason) when done. A closed request takes no reply from support; `reopenRequest` (with a reason) opens it again.
3. A customer reply in the panel opens the request again by itself; it comes back to the top of the `open` list.

## A customer cannot sign in or reset the password (customer pool)

Customers sign up, confirm the e-mail and reset the password only through the web app (WPU-X12). The Cognito triggers (`functions/cognito-messages`) refuse every code that does not come through the server-only sign-up client, and the customer app client has a secret, so a code asked for in the Cognito console or with the AWS CLI never goes out.

1. Send the customer to the reset page of the panel (`/forgot-password`). Never use `AdminResetUserPassword` on the CUSTOMER pool: its e-mail is refused by the trigger by design, so it only leaves the user in a state that needs another reset.
2. Break-glass, when the web reset cannot work (an outage of SSM, which the triggers read their client id from, so every reset code is refused until it is back): `AdminSetUserPassword` with `--permanent` on the customer pool sets a new password and sends no message. Only the operations lead, with the customer's request in the support thread, and tell the customer to change the password after signing in. Record the request id in the log; never write the password anywhere.
3. The admin pool is different: its reset (and the invitation) keeps working through the admin app client and the trigger lets it through. The same outage refuses it too (the trigger cannot tell the pools apart without its configuration); use `AdminSetUserPassword` there as well.
4. After the customer app client or the sign-up client is replaced (the client id changes), the triggers read the new id themselves within a minute of the first event of each container. No forced cold start is needed. Sessions of the replaced client end: customers sign in again.

## Rollback

Closed is a state, not a deletion: `reopenRequest` opens a request again. Messages are never edited or deleted; a correction is a new reply.

## Log

Request id, category, time to first answer. No message text in logs.

## Must not

Put an AWS account id, ARN or raw AWS text into a reply; ask for passwords, card numbers or full document numbers in a reply.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
