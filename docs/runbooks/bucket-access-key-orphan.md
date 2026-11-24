# Bucket access key: orphan key after a lost answer

Task WPU-B7 (L5). Rules R7 (a key is not idempotent), R14, R16. Spec 10.3: a bucket holds at most two access keys.

## Trigger

A customer writes that creating a bucket access key failed ("we could not finish this now") and a retry or the Keys tab then says "the bucket already has two keys", or the Keys tab shows a key the customer never saw.

## Why it happens

The access-details function claims the request id (the unique key and the audit row, R7), then asks Amazon Lightsail to create the key. AWS returns the secret only in that one answer.

- AWS refused before a key existed (the bucket is not active, the key limit, an error answer): no key exists. The claim of the request id is a counter that is not released, so a retry with the same request id answers "already created"; the customer reloads the Keys tab to get a new request id and tries again. Nothing to do here.
- The answer was lost after the create call was sent (timeout, the function was stopped): a key may exist at AWS whose secret nobody received. The claim is kept, so a retry with the same request id creates no second key, and the customer sees "unavailable" or "already created". This is the orphan key. It counts against the two keys of the bucket.

## Who

Operations lead. Support only collects the facts.

## Safe checks

1. Find the audit row of the request (target type resource, the bucket id, action of the key creation) and the function log line `access_details` with the outcome `internal` or `upstream_unavailable` at that time. Logs hold fixed words only; do not look for the secret.
2. In the customer's Keys tab the key list shows key ids only. A key id the customer cannot recall, created at the time of the failure, is the orphan.
3. Do not call AWS by hand outside the approved pool account procedure (never the management account, no long-lived keys, R3).

## Steps

1. Ask the customer to delete the orphan key in the Keys tab (`deleteAccessKeyCore` of the Keys tab; it writes an operation row, R1).
2. Then the customer creates a new key with a new request id (reload the page).
3. If the customer cannot delete it, an admin deletes it with the admin action for the bucket, with a reason and the ticket (R10).
4. Record the case in the ticket: bucket id, time, outcome word from the log.

## Rollback

A deleted key cannot be restored. A key the customer still needs is replaced by a new one and the customer updates their tools.

## Log

Bucket id, request id, outcome word, admin and reason. Never the key id of the customer's tools, never any secret.

## Must not

Print or store a secret key; create a key for the customer to "see it again" (AWS shows the secret once); delete a key the customer still uses without asking; touch the management account or use a long-lived key.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
