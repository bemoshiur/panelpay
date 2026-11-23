import { sql } from "drizzle-orm";
import { asNullableText, asText, toMinor } from "../../ledger/values";
import { created, refused, replayed, type Written } from "../result";
import { isUuid, type TenantScope } from "../scope";

// One payment as the application reads it. `status` is text so that @tc/db does not import @tc/eps;
// @tc/eps narrows it with PAYMENT_STATES. The idempotency key and the verify payload are not part of
// it: the first is the caller's own, the second is read by nobody but an admin (grants of 0006).
export interface PaymentRow {
  id: string;
  customerId: string;
  gateway: string;
  merchantTransactionId: string;
  amountMinor: bigint;
  currency: string;
  status: string;
  gatewayTransactionId: string | null;
  verifiedAt: Date | null;
  ledgerTransactionId: string | null;
  createdAt: Date;
}

export interface NewPayment {
  id: string;
  merchantTransactionId: string;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  // PRO-6: "whmcs" is a paid WHMCS invoice of the Pro edition, credited after the same server-to-server
  // check of the amount (pro/whmcs-bridge). The column has no check list; this is the allowlist.
  gateway: (typeof PAYMENT_GATEWAYS)[number];
}

export const PAYMENT_GATEWAYS = ["eps", "whmcs"] as const;

// R8: the customer is the one of the scope; no method takes a customer id. Written by web_rw only
// with the columns of its grants (no SELECT of verify_payload, no write of the amount or the owner
// after the insert).
export interface PaymentsRepo {
  // Idempotent by (customer, idempotencyKey) (R7): the first call answers created, the same key with
  // the same amount and currency answers replayed with the stored row, the same key with another
  // amount or currency answers conflict. An input that fails its checks answers validation.
  insert(input: NewPayment): Promise<Written<PaymentRow>>;
  get(paymentId: string): Promise<PaymentRow | null>;
  // Newest first. limit is an integer from 1 to 100, else TypeError.
  list(limit: number): Promise<PaymentRow[]>;
  // initiated -> redirected. false when no row of this customer is still initiated.
  markRedirected(paymentId: string, gatewayTransactionId: string | null): Promise<boolean>;
  // initiated -> failed. false when no row of this customer is still initiated.
  markFailed(paymentId: string): Promise<boolean>;
}

// The 12 columns of the grants of web_rw and worker_rw that make a PaymentRow, with the amount as
// text (int8 is never read as a number, R4) and every name aliased. Fixed text only; the table and
// the columns never come from input (R11).
export const PAYMENT_COLUMNS = sql`
  p.id as "id",
  p.customer_id as "customerId",
  p.gateway as "gateway",
  p.merchant_transaction_id as "merchantTransactionId",
  p.amount_minor::text as "amountMinor",
  p.currency as "currency",
  p.status as "status",
  p.gateway_transaction_id as "gatewayTransactionId",
  p.verified_at as "verifiedAt",
  p.ledger_transaction_id as "ledgerTransactionId",
  p.created_at as "createdAt"`;

// Raw rows: a raw tx.execute gives int8 and timestamptz as text, so they are mapped here.
export function toPaymentRow(row: Record<string, unknown>): PaymentRow {
  const verifiedAt = row.verifiedAt;
  return {
    id: asText(row.id),
    customerId: asText(row.customerId),
    gateway: asText(row.gateway),
    merchantTransactionId: asText(row.merchantTransactionId),
    amountMinor: toMinor(row.amountMinor),
    currency: asText(row.currency),
    status: asText(row.status),
    gatewayTransactionId: asNullableText(row.gatewayTransactionId),
    verifiedAt: verifiedAt === null ? null : new Date(asText(verifiedAt)),
    ledgerTransactionId: asNullableText(row.ledgerTransactionId),
    createdAt: new Date(asText(row.createdAt)),
  };
}

const MAX_INT8 = 9223372036854775807n;
const MERCHANT_TRANSACTION_ID = /^[\x21-\x7e]{10,128}$/;
const CURRENCY = /^[A-Z]{3}$/;
// A gateway transaction id comes from EPS; it is stored, never interpreted.
const GATEWAY_ID_MAX = 128;

export const isGatewayId = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 1 && value.length <= GATEWAY_ID_MAX;

const validInsert = (input: NewPayment): boolean =>
  typeof input === "object" &&
  input !== null &&
  typeof input.id === "string" &&
  isUuid(input.id) &&
  typeof input.merchantTransactionId === "string" &&
  MERCHANT_TRANSACTION_ID.test(input.merchantTransactionId) &&
  typeof input.idempotencyKey === "string" &&
  input.idempotencyKey.length >= 1 &&
  input.idempotencyKey.length <= 128 &&
  typeof input.amountMinor === "bigint" &&
  input.amountMinor > 0n &&
  input.amountMinor <= MAX_INT8 &&
  typeof input.currency === "string" &&
  CURRENCY.test(input.currency) &&
  (PAYMENT_GATEWAYS as readonly string[]).includes(input.gateway);

export function paymentsRepo(scope: TenantScope): PaymentsRepo {
  const { tx, customerId } = scope;

  const one = async (rows: Record<string, unknown>[]): Promise<PaymentRow | null> => {
    const [row] = rows;
    return row === undefined ? null : toPaymentRow(row);
  };

  return {
    insert: async (input) => {
      if (!validInsert(input)) return refused("validation");
      // ON CONFLICT on the unique key of the request, never a caught 23505 (it would abort the
      // caller's transaction). A conflict on another constraint (the merchant transaction id, the
      // primary key) is a bug of the caller and surfaces as the database error it is.
      const inserted = await tx.execute<Record<string, unknown>>(sql`
        insert into payments as p
          (id, customer_id, gateway, merchant_transaction_id, idempotency_key, amount_minor, currency)
        values (${input.id}, ${customerId}, ${input.gateway}, ${input.merchantTransactionId},
                ${input.idempotencyKey}, ${input.amountMinor.toString()}::bigint, ${input.currency})
        on conflict (customer_id, idempotency_key) do nothing
        returning ${PAYMENT_COLUMNS}`);
      const fresh = await one(inserted.rows);
      if (fresh !== null) return created(fresh);

      // The key is taken: read the row of this customer and key (a later statement sees a row that
      // a concurrent transaction committed while this one waited on the unique index).
      const { rows } = await tx.execute<Record<string, unknown>>(sql`
        select ${PAYMENT_COLUMNS} from payments p
         where p.customer_id = ${customerId} and p.idempotency_key = ${input.idempotencyKey}`);
      const stored = await one(rows);
      if (stored === null) return refused("conflict"); // rolled back in between: the caller retries
      return stored.amountMinor === input.amountMinor && stored.currency === input.currency
        ? replayed(stored)
        : refused("conflict");
    },

    get: async (paymentId) => {
      if (typeof paymentId !== "string" || !isUuid(paymentId)) return null;
      const { rows } = await tx.execute<Record<string, unknown>>(sql`
        select ${PAYMENT_COLUMNS} from payments p
         where p.id = ${paymentId} and p.customer_id = ${customerId}`);
      return one(rows);
    },

    list: async (limit) => {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError("payments.list: the limit is an integer from 1 to 100");
      }
      const { rows } = await tx.execute<Record<string, unknown>>(sql`
        select ${PAYMENT_COLUMNS} from payments p
         where p.customer_id = ${customerId}
         order by p.created_at desc, p.id desc
         limit ${limit}`);
      return rows.map(toPaymentRow);
    },

    markRedirected: async (paymentId, gatewayTransactionId) => {
      if (typeof paymentId !== "string" || !isUuid(paymentId)) return false;
      if (gatewayTransactionId !== null && !isGatewayId(gatewayTransactionId)) {
        throw new TypeError("payments.markRedirected: the gateway transaction id is not usable");
      }
      const result = await tx.execute(sql`
        update payments p set status = 'redirected', gateway_transaction_id = ${gatewayTransactionId}
         where p.id = ${paymentId} and p.customer_id = ${customerId} and p.status = 'initiated'`);
      return result.rowCount === 1;
    },

    markFailed: async (paymentId) => {
      if (typeof paymentId !== "string" || !isUuid(paymentId)) return false;
      const result = await tx.execute(sql`
        update payments p set status = 'failed'
         where p.id = ${paymentId} and p.customer_id = ${customerId} and p.status = 'initiated'`);
      return result.rowCount === 1;
    },
  };
}
