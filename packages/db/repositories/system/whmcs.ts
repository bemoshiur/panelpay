import { sql } from "drizzle-orm";
import type { Tx } from "../../client";

// PRO-6. The one read that the WHMCS bridge of the Pro edition makes without a customer: which panel
// customer a paid WHMCS invoice belongs to. The key is the e-mail of the WHMCS client, read by the
// bridge from the WHMCS API itself (never from the request). Only an active customer whose e-mail the
// panel has verified matches; no match or more than one match is not a customer (R16), and the money
// waits for an operator. The customer id is an output only; no function here takes one (R8, the same
// rule as repositories/system/payments.ts). Classified in tenancy.ts. Runs as web_rw (SELECT on
// customers and markets).

export type WhmcsCustomerMatch =
  | { readonly kind: "one"; readonly customerId: string; readonly currency: string }
  | { readonly kind: "none" }
  | { readonly kind: "many" };

// The shape of an address, not a full RFC 5322 check: a value that cannot be one never reaches SQL.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}$/;

async function customerByVerifiedEmail(tx: Tx, email: string): Promise<WhmcsCustomerMatch> {
  if (typeof email !== "string" || email.length > 320 || !EMAIL.test(email)) return { kind: "none" };
  const { rows } = await tx.execute<{ id: string; currency: string }>(sql`
    select c.id::text as id, m.currency as currency
      from customers c join markets m on m.code = c.market
     where lower(c.email) = lower(${email})
       and c.status = 'active'
       and c.email_verified_at is not null
     order by c.id
     limit 2`);
  if (rows.length === 0) return { kind: "none" };
  if (rows.length > 1) return { kind: "many" };
  return { kind: "one", customerId: rows[0]!.id, currency: rows[0]!.currency };
}

export const systemWhmcs = Object.freeze({ customerByVerifiedEmail });
export type SystemWhmcs = typeof systemWhmcs;
