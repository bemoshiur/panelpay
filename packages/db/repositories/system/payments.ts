import { sql, type SQL } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Tx } from "../../client";
import { PAYMENT_STATUSES } from "../../schema/money";
import { isUuid } from "../scope";
import { isGatewayId, PAYMENT_COLUMNS, toPaymentRow, type PaymentRow } from "../customer/payments";

// The one place where a payment is read without a customer (open point 4 of WP3-T2). The return of the
// browser from EPS may arrive without a session, and the sweeper has no customer, so the key is the
// merchant transaction id (unique) or the status. It is not part of customerRepos and it has no
// function that takes a customer id: the customer a caller needs (for the ledger) is the customerId of
// the row it gets back, never an input. Used by verifyPayment and sweepPayments of @tc/eps only; both
// run as web_rw or worker_rw, whose grants on payments are the same for these statements. Classified
// in tenancy.ts (a function of this module reads the tenant table `payments` by a key that is no
// customer id, and writes `discrepancies`, which no customer owns).

// The key of the payment the browser names. Server made, at least 10 characters (a check of the table).
const MERCHANT_TRANSACTION_ID = /^[\x21-\x7e]{10,128}$/;
const MAX_SWEEP = 500;

// The keys of a discrepancy of kind payment. No name, phone, e-mail or payload (R14).
export const PAYMENT_DISCREPANCY_KEYS = [
  "paymentId",
  "reason",
  "expectedMinor",
  "gotMinor",
  "state",
  // PRO-6: "whmcs invoice <n>: <reason>" for a paid WHMCS top-up the bridge refused. "note" is one of
  // the keys the reconciliation screen shows (repositories/admin/reconciliation.ts DETAIL_KEYS).
  "note",
] as const;

const isStatus = (value: unknown): boolean =>
  typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);

export interface OutcomeFields {
  gatewayTransactionId?: string | null;
  verifyPayload?: unknown;
  verifiedAt?: Date;
  ledgerTransactionId?: string;
}

// A merchant transaction id that cannot be one is "no such payment" without a query (R16).
async function byMerchantTransactionId(
  tx: Tx,
  merchantTransactionId: string,
  options: { lock: boolean },
): Promise<PaymentRow | null> {
  if (
    typeof merchantTransactionId !== "string" ||
    !MERCHANT_TRANSACTION_ID.test(merchantTransactionId)
  ) {
    return null;
  }
  // FOR UPDATE makes a second verify of the same payment wait here until the first one commits.
  const lock = options.lock ? sql`for update of p` : sql``;
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    select ${PAYMENT_COLUMNS} from payments p
     where p.merchant_transaction_id = ${merchantTransactionId}
     ${lock}`);
  const [row] = rows;
  return row === undefined ? null : toPaymentRow(row);
}

// True when another payment already holds this EPS transaction id (a replayed or forged answer).
async function gatewayIdUsedElsewhere(
  tx: Tx,
  gatewayTransactionId: string,
  exceptPaymentId: string,
): Promise<boolean> {
  if (!isGatewayId(gatewayTransactionId) || !isUuid(exceptPaymentId)) {
    throw new TypeError("systemPayments.gatewayIdUsedElsewhere: the arguments are not usable");
  }
  const { rows } = await tx.execute<{ used: boolean }>(sql`
    select exists (
      select 1 from payments p
       where p.gateway_transaction_id = ${gatewayTransactionId} and p.id <> ${exceptPaymentId}
    ) as used`);
  return rows[0]?.used === true;
}

// Moves the payment from one of the states `from` to `to` and sets the given columns, and only those
// (the granted columns of 0006). The guard `status in (from)` is the compare-and-set of the state
// machine: false when the row is not in a state of `from`. The checks of the table still apply, so
// to = credited without ledgerTransactionId fails with payments_credit_check.
async function applyOutcome(
  tx: Tx,
  paymentId: string,
  from: readonly string[],
  to: string,
  fields: OutcomeFields,
): Promise<boolean> {
  if (!isUuid(paymentId) || !isStatus(to) || from.length === 0 || !from.every(isStatus)) {
    throw new TypeError("systemPayments.applyOutcome: the arguments are not usable");
  }
  const sets: SQL[] = [sql`status = ${to}`];
  if (fields.gatewayTransactionId !== undefined) {
    if (fields.gatewayTransactionId !== null && !isGatewayId(fields.gatewayTransactionId)) {
      throw new TypeError("systemPayments.applyOutcome: the gateway transaction id is not usable");
    }
    sets.push(sql`gateway_transaction_id = ${fields.gatewayTransactionId}`);
  }
  if (fields.verifyPayload !== undefined) {
    sets.push(sql`verify_payload = ${JSON.stringify(fields.verifyPayload)}::jsonb`);
  }
  if (fields.verifiedAt !== undefined) {
    if (!(fields.verifiedAt instanceof Date) || Number.isNaN(fields.verifiedAt.getTime())) {
      throw new TypeError("systemPayments.applyOutcome: verifiedAt is not a date");
    }
    sets.push(sql`verified_at = ${fields.verifiedAt.toISOString()}::timestamptz`);
  }
  if (fields.ledgerTransactionId !== undefined) {
    if (!isUuid(fields.ledgerTransactionId)) {
      throw new TypeError("systemPayments.applyOutcome: the ledger transaction id is not a UUID");
    }
    sets.push(sql`ledger_transaction_id = ${fields.ledgerTransactionId}`);
  }
  const result = await tx.execute(sql`
    update payments p set ${sql.join(sets, sql`, `)}
     where p.id = ${paymentId} and p.status in (${sql.join(
       from.map((state) => sql`${state}`),
       sql`, `,
     )})`);
  return result.rowCount === 1;
}

// The payments that still wait for a customer or for EPS and are old enough to ask about, oldest
// first, each locked for this transaction. A row that another transaction holds is skipped, so two
// sweepers (or a sweeper and a return) never work on the same payment.
async function sweepable(tx: Tx, options: { before: Date; limit: number }): Promise<PaymentRow[]> {
  const { before, limit } = options;
  if (!(before instanceof Date) || Number.isNaN(before.getTime())) {
    throw new TypeError("systemPayments.sweepable: before is not a date");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SWEEP) {
    throw new TypeError(`systemPayments.sweepable: the limit is an integer from 1 to ${MAX_SWEEP}`);
  }
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    select ${PAYMENT_COLUMNS} from payments p
     where p.status in ('initiated', 'redirected') and p.created_at <= ${before.toISOString()}::timestamptz
     order by p.created_at, p.id
     limit ${limit}
       for update of p skip locked`);
  return rows.map(toPaymentRow);
}

const isScalar = (value: unknown): boolean =>
  value === null ||
  typeof value === "boolean" ||
  typeof value === "bigint" ||
  (typeof value === "number" && Number.isSafeInteger(value)) ||
  (typeof value === "string" && value.length <= 200);

// Writes one discrepancy of kind payment. The keys are fixed and the values are ids, codes, states and
// amounts in paisa: an object with another key, or a value that is not a short scalar, is a TypeError
// and nothing is written (R14, R16). An amount may be a bigint; it is stored as text because JSON has
// no bigint and a number would lose digits (R4).
async function recordDiscrepancy(tx: Tx, details: Record<string, unknown>): Promise<void> {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    throw new TypeError("systemPayments.recordDiscrepancy: details is not an object");
  }
  const keys = Object.keys(details);
  if (
    keys.length === 0 ||
    !keys.every((k) => (PAYMENT_DISCREPANCY_KEYS as readonly string[]).includes(k))
  ) {
    throw new TypeError("systemPayments.recordDiscrepancy: a key of details is not allowed");
  }
  const stored: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!isScalar(value)) {
      throw new TypeError("systemPayments.recordDiscrepancy: a value of details is not a scalar");
    }
    stored[key] =
      typeof value === "bigint" ? value.toString() : (value as string | number | boolean | null);
  }
  if (
    stored.paymentId !== undefined &&
    (typeof stored.paymentId !== "string" || !isUuid(stored.paymentId))
  ) {
    throw new TypeError("systemPayments.recordDiscrepancy: paymentId is not a UUID");
  }
  // No RETURNING: web_rw and worker_rw may insert here but not select.
  await tx.execute(sql`
    insert into discrepancies (id, kind, details)
    values (${uuidv7()}, 'payment', ${JSON.stringify(stored)}::jsonb)`);
}

export const systemPayments = Object.freeze({
  byMerchantTransactionId,
  gatewayIdUsedElsewhere,
  applyOutcome,
  sweepable,
  recordDiscrepancy,
});

export type SystemPayments = typeof systemPayments;
