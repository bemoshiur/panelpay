// PRO-6. What a paid WHMCS invoice is worth to the panel wallet. Pure: the invoice and the client come
// from the WHMCS API (server to server, never from the caller), and this decides. Owner decision of
// 23 Nov 2026: a customer tops up the panel wallet by paying a WHMCS invoice with the reseller's own
// gateway; the panel credits only after it read, from WHMCS itself, that the same invoice is paid for
// the same amount (the R6 rule, applied to WHMCS for the Pro edition).
//
// Money is bigint minor units (R4): WHMCS amounts are decimal strings, parsed by text, never as floats.

/** Every line of a top-up invoice starts with this (the WHMCS module writes it, pro/whmcs). */
export const TOPUP_MARKER = "TryAWS.now wallet top-up";

export interface WhmcsInvoice {
  readonly invoiceId: string;
  readonly userId: string;
  readonly status: string;
  readonly balance: string;
  readonly total: string;
  readonly items: readonly { readonly description: string; readonly amount: string }[];
}

export interface WhmcsClient {
  readonly email: string;
  readonly currencyCode: string;
}

export type InvoiceDecision =
  | { readonly kind: "credit"; readonly amountMinor: bigint; readonly currency: string }
  | { readonly kind: "not_paid" }
  | { readonly kind: "not_topup" }
  | { readonly kind: "invalid" };

const AMOUNT = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/;
const MAX_TOPUP_MINOR = 100_000_000_00n; // 100 million in major units: above it, an operator decides

/** "12.5" -> 1250n, "12.50" -> 1250n; anything else (negative, 3 decimals, exponent, text) -> null. */
export function parseAmountMinor(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const m = AMOUNT.exec(value.trim());
  if (m === null) return null;
  const frac = (m[2] ?? ".").slice(1).padEnd(2, "0");
  return BigInt(m[1]!) * 100n + BigInt(frac);
}

export function decideInvoice(invoice: WhmcsInvoice, client: WhmcsClient): InvoiceDecision {
  if (!/^[A-Z]{3}$/.test(client.currencyCode)) return { kind: "invalid" };
  if (invoice.items.length === 0) return { kind: "not_topup" };
  // A top-up invoice holds top-up lines only; anything else is the reseller's own sale, not ours.
  if (!invoice.items.every((i) => i.description.startsWith(TOPUP_MARKER))) {
    return { kind: "not_topup" };
  }
  if (invoice.status !== "Paid") return { kind: "not_paid" };
  const balance = parseAmountMinor(invoice.balance);
  if (balance === null) return { kind: "invalid" };
  if (balance !== 0n) return { kind: "not_paid" };

  let sum = 0n;
  for (const item of invoice.items) {
    const amount = parseAmountMinor(item.amount);
    if (amount === null || amount <= 0n) return { kind: "invalid" };
    sum += amount;
  }
  const total = parseAmountMinor(invoice.total);
  // The invoice total includes any tax the reseller charges; the wallet gets the top-up lines only.
  if (total === null || total < sum) return { kind: "invalid" };
  if (sum > MAX_TOPUP_MINOR) return { kind: "invalid" };
  return { kind: "credit", amountMinor: sum, currency: client.currencyCode };
}
