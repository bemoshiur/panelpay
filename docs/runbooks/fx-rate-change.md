# FX rate change

Rules: R4 (money is bigint paisa; decimal math only in `packages/core/pricing`; half-up rounding), R5 (`fx_rates` and `pricing_rules` are append-only), R10.

## Trigger

The USD to BDT rate that PanelPay charges must change (the market moved, or the owner decides on a new rate). Prices of existing subscriptions are not changed by a new rate; renewals use "today's rate" (Section 11).

## Who

A finance admin or the superadmin. Rates are posted by person, never by a script and never by a feed.

- **Alone, at once** (WPU-X9, owner decision 2026-11-14, "alone, within ±3%"): the FIRST rate of a market (no rate in force and no rate ever stored, a scheduled one included), and any later rate that is at most 3 percent away from EVERY rate in force during the 24 hours before it (owner decision 2026-11-14, "3% per 24 hours": |new − old| / old ≤ 3% for each, both bounds included, exact decimal comparison). The window holds the rate in force 24 hours ago and every rate that started since. A scheduled change is checked against the 24 hours before now AND the 24 hours before its own start. No change is made alone while a rate is already scheduled after it (after now, or after its start). The rate is in force from its start as soon as it is saved.
  - Example: 122 → 118.34 (−3%) is alone; one hour later 114.79 is −3% of 118.34 but −5.9% of the 122 of the last 24 hours, so it waits for a second admin. 24 hours and 1 second after the 118.34 step, 114.79 is alone again.
- **Four eyes** (WPU-Y1): any larger change waits as a pending change for 24 hours until a different active finance or superadmin admin approves it from their own session, never the one who asked. So does any change, a re-confirm too, made while another rate is already scheduled after it. If the platform cannot tell (no rate in force but a row stored, an unreadable rate, a history of the window longer than it reads), it fails closed to four eyes.
- A rate more than 10 percent away from the one in force needs the confirm box from both admins; a rate outside the range of its market (BD: 50 to 500) is refused.
- Every change keeps its reason and an audit row `fx_rate.set` (actor, reason, IP, target). A rate set alone has `metadata.after.approval` = `single_admin_first_rate` or `single_admin_within_limit`; a four-eyes rate has `metadata.after.approvedBy` (the admin who asked).
- Note: alone, the rate moves at most 3 percent per 24 hours; over several days small steps can still add up, each audited. Finance reviews the `fx_rate.set` rows of the week (see "Log").

## Maximum age (WPU-Y1)

A rate is good for 7 days from its start. After 6 days the daily alert `fx_rate_stale_warning` fires and `/pricing` shows a warning. After 7 days new purchases are refused with "prices are being updated", renewals and usage charges are held (not dropped, not double charged) and are charged from the old period end once a new rate is in force. To keep the same rate, save the same value again: it is a re-confirm (a 0 percent change, so one admin alone unless a later rate is already scheduled or the rate moved more than 3 percent in the last 24 hours) and restarts the 7 days.

## Safe checks

1. `/pricing`: read the FX history and the current rate per market.
2. Before saving, open the preview of five products. It prices them with the real pricing engine at the new rate. Compare with a hand calculation of one product.
3. Check the size of the change against the limits shown by the screen: up to 3 percent within 24 hours applies at once; more waits for a second admin.

## Steps

1. `/pricing`, "New rate": new rate, start (empty is now, at most 7 days ahead), reason.
2. Up to 3 percent within 24 hours (or the first rate): the screen says the rate is saved and in force from its start. More than that, or a change before a scheduled rate: the screen says the change is waiting; a different admin reads the five-product preview and approves it on `/pricing` (or lets it expire after 24 hours).
3. After it is active, check `/pricing` history shows one new row and that a new draft order shows the new price. Customers with an open draft see `price_changed` and must accept the new total.
4. Tell support the new rate and the time.

## Rollback

Append a new rate row with the old value and the reason "revert". Never edit a row (append-only). The revert is measured like any change, against every rate of the last 24 hours: undoing a rise of 3 percent (103 back to 100, −2.91%) is within the limit, but undoing a fall of 3 percent (97 back to 100, +3.09%) is not and needs a second admin, as does undoing any larger change.

## Log

Old rate, new rate, effective time, requester, approver (or the single-admin ground), reason. Rates are not secret.

## Must not

Use floats or spreadsheet rounding for the stored rate; change a price of an existing subscription; skip the preview.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
