import { createHmac, timingSafeEqual } from "node:crypto";

// PRO-6. What a paid WHMCS invoice is worth to the panel wallet. Pure: the invoice and the client come
// from the WHMCS API (server to server, never from the caller), and this decides. Owner decision of
// 23 Nov 2026: a customer tops up the panel wallet by paying a WHMCS invoice with the reseller's own
// gateway; the panel credits only after it read, from WHMCS itself, that the same invoice is paid for
// the same amount (the R6 rule, applied to WHMCS for the Pro edition).
//
// Money is bigint minor units (R4): WHMCS amounts are decimal strings, parsed by text, never as floats.
//
// Money review of PRO-6:
// - Each top-up line names its currency and amount as written when the invoice was made, and a
//   reference: HMAC(bridge secret, "<client id>:<e-mail>") of the WHMCS client at that moment. At payment
//   the bridge recomputes it from the client WHMCS returns now. A client who changed the e-mail (or the
//   currency) after making the invoice is refused: the money cannot move to another wallet or another
//   currency (findings 3 and 5).
// - An invoice paid with WHMCS credit balance is refused: that balance can be a refund of an invoice the
//   panel already credited (finding 2, scenario B). An operator decides.

/** Every line of a top-up invoice starts with this (the WHMCS addon writes it, pro/whmcs). */
export const TOPUP_MARKER = "PanelPay wallet top-up";

export interface WhmcsInvoice {
  readonly invoiceId: string;
  readonly userId: string;
  readonly status: string;
  readonly balance: string;
  readonly total: string;
  /** WHMCS credit balance applied to the invoice ("0.00" when none). */
  readonly credit: string;
  readonly items: readonly { readonly description: string; readonly amount: string }[];
}

export interface WhmcsClient {
  readonly clientId: string;
  readonly email: string;
  readonly currencyCode: string;
}

export type MismatchReason = "ref" | "currency" | "line" | "paid_with_credit";

export type InvoiceDecision =
  | { readonly kind: "credit"; readonly amountMinor: bigint; readonly currency: string }
  | { readonly kind: "not_paid" }
  | { readonly kind: "not_topup" }
  | { readonly kind: "invalid" }
  /** A paid top-up the bridge refuses: recorded for an operator, never credited automatically. */
  | {
      readonly kind: "mismatch";
      readonly reason: MismatchReason;
      readonly amountMinor: bigint | null;
    };

const AMOUNT = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/;
const MAX_TOPUP_MINOR = 100_000_000_00n; // 100 million in major units: above it, an operator decides
// "PanelPay wallet top-up (USD 25.00) [ref 0123456789abcdef]"
const LINE =
  /^PanelPay wallet top-up \(([A-Z]{3}) ([0-9]{1,12}\.[0-9]{2})\) \[ref ([0-9a-f]{16})\]$/;

/** "12.5" -> 1250n, "12.50" -> 1250n; anything else (negative, 3 decimals, exponent, text) -> null. */
export function parseAmountMinor(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const m = AMOUNT.exec(value.trim());
  if (m === null) return null;
  const frac = (m[2] ?? ".").slice(1).padEnd(2, "0");
  return BigInt(m[1]!) * 100n + BigInt(frac);
}

/** The reference of a WHMCS client at invoice creation (pro/whmcs lib.php computes the same). */
export function clientRef(secret: string, clientId: string, email: string): string {
  return createHmac("sha256", secret)
    .update(`${clientId}:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}

const sameRef = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function decideInvoice(
  invoice: WhmcsInvoice,
  client: WhmcsClient,
  secret: string,
): InvoiceDecision {
  if (!/^[A-Z]{3}$/.test(client.currencyCode)) return { kind: "invalid" };
  if (invoice.items.length === 0) return { kind: "not_topup" };
  // A top-up invoice holds top-up lines only; anything else is the reseller's own sale, not ours.
  if (!invoice.items.every((i) => i.description.startsWith(TOPUP_MARKER))) {
    return { kind: "not_topup" };
  }
  if (invoice.status !== "Paid") return { kind: "not_paid" };
  const balance = parseAmountMinor(invoice.balance);
  const credit = parseAmountMinor(invoice.credit);
  const total = parseAmountMinor(invoice.total);
  if (balance === null || credit === null || total === null) return { kind: "invalid" };
  if (balance !== 0n) return { kind: "not_paid" };

  let sum = 0n;
  let currency: string | null = null;
  const expectedRef = clientRef(secret, client.clientId, client.email);
  let refOk = true;
  for (const item of invoice.items) {
    const amount = parseAmountMinor(item.amount);
    const m = LINE.exec(item.description);
    if (amount === null || amount <= 0n) return { kind: "invalid" };
    // A line the addon did not write (edited by hand, or an older format): an operator looks.
    if (m === null || parseAmountMinor(m[2]) !== amount) {
      return { kind: "mismatch", reason: "line", amountMinor: null };
    }
    if (currency !== null && m[1] !== currency)
      return { kind: "mismatch", reason: "line", amountMinor: null };
    currency = m[1]!;
    if (!sameRef(m[3]!, expectedRef)) refOk = false;
    sum += amount;
  }
  if (total < sum || sum > MAX_TOPUP_MINOR) return { kind: "invalid" };
  if (!refOk) return { kind: "mismatch", reason: "ref", amountMinor: sum };
  if (currency !== client.currencyCode)
    return { kind: "mismatch", reason: "currency", amountMinor: sum };
  if (credit > 0n) return { kind: "mismatch", reason: "paid_with_credit", amountMinor: sum };
  return { kind: "credit", amountMinor: sum, currency: currency! };
}
