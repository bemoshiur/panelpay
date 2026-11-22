import { describe, expect, it } from "vitest";
import { decideInvoice, parseAmountMinor, TOPUP_MARKER, type WhmcsInvoice } from "./invoice";

const client = { email: "buyer@example.test", currencyCode: "USD" };
const invoice = (over: Partial<WhmcsInvoice> = {}): WhmcsInvoice => ({
  invoiceId: "1001",
  userId: "7",
  status: "Paid",
  balance: "0.00",
  total: "25.00",
  items: [{ description: `${TOPUP_MARKER} (USD 25.00)`, amount: "25.00" }],
  ...over,
});

describe("parseAmountMinor", () => {
  it("parses decimal strings exactly into minor units", () => {
    expect(parseAmountMinor("25.00")).toBe(2500n);
    expect(parseAmountMinor("12.5")).toBe(1250n);
    expect(parseAmountMinor("0.01")).toBe(1n);
    expect(parseAmountMinor("7")).toBe(700n);
    expect(parseAmountMinor("999999999999.99")).toBe(99_999_999_999_999n);
  });

  it("refuses anything that is not a plain non-negative amount with at most 2 decimals", () => {
    for (const v of [
      "-1.00",
      "1.005",
      "1e3",
      "0x10",
      "",
      " ",
      "1,000.00",
      "01.00",
      "NaN",
      12.5,
      null,
    ]) {
      expect(parseAmountMinor(v)).toBeNull();
    }
  });
});

describe("decideInvoice", () => {
  it("credits the sum of the top-up lines of a paid invoice in the client's currency", () => {
    expect(decideInvoice(invoice(), client)).toEqual({
      kind: "credit",
      amountMinor: 2500n,
      currency: "USD",
    });
  });

  it("credits the top-up lines only, not the reseller's tax", () => {
    expect(decideInvoice(invoice({ total: "27.50" }), client)).toEqual({
      kind: "credit",
      amountMinor: 2500n,
      currency: "USD",
    });
  });

  it("waits while the invoice is not paid in full", () => {
    expect(decideInvoice(invoice({ status: "Unpaid" }), client).kind).toBe("not_paid");
    expect(decideInvoice(invoice({ balance: "5.00" }), client).kind).toBe("not_paid");
  });

  it("ignores an invoice that is not a pure top-up", () => {
    expect(
      decideInvoice(
        invoice({
          items: [
            { description: `${TOPUP_MARKER} (USD 25.00)`, amount: "25.00" },
            { description: "Web hosting", amount: "5.00" },
          ],
        }),
        client,
      ).kind,
    ).toBe("not_topup");
    expect(decideInvoice(invoice({ items: [] }), client).kind).toBe("not_topup");
  });

  it("refuses malformed or inconsistent amounts (R16)", () => {
    expect(decideInvoice(invoice({ total: "20.00" }), client).kind).toBe("invalid");
    expect(
      decideInvoice(invoice({ items: [{ description: TOPUP_MARKER, amount: "-25.00" }] }), client)
        .kind,
    ).toBe("invalid");
    expect(decideInvoice(invoice({ balance: "zero" }), client).kind).toBe("invalid");
    expect(decideInvoice(invoice(), { ...client, currencyCode: "usd" }).kind).toBe("invalid");
  });
});
