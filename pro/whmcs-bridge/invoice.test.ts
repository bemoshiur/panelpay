import { describe, expect, it } from "vitest";
import {
  clientRef,
  decideInvoice,
  parseAmountMinor,
  type WhmcsClient,
  type WhmcsInvoice,
} from "./invoice";

const SECRET = "b".repeat(48);
const client: WhmcsClient = { clientId: "7", email: "Buyer@Example.test", currencyCode: "USD" };
const ref = clientRef(SECRET, "7", "buyer@example.test");
const line = (amount: string, currency = "USD", r = ref) => ({
  description: `TryAWS.now wallet top-up (${currency} ${amount}) [ref ${r}]`,
  amount,
});
const invoice = (over: Partial<WhmcsInvoice> = {}): WhmcsInvoice => ({
  invoiceId: "1001",
  userId: "7",
  status: "Paid",
  balance: "0.00",
  total: "25.00",
  credit: "0.00",
  items: [line("25.00")],
  ...over,
});
const decide = (inv: WhmcsInvoice, c: WhmcsClient = client) => decideInvoice(inv, c, SECRET);

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

describe("clientRef", () => {
  it("is the same for the same client and e-mail in any case, and differs otherwise", () => {
    expect(clientRef(SECRET, "7", " BUYER@example.test")).toBe(ref);
    expect(clientRef(SECRET, "8", "buyer@example.test")).not.toBe(ref);
    expect(clientRef(SECRET, "7", "other@example.test")).not.toBe(ref);
    expect(clientRef("c".repeat(48), "7", "buyer@example.test")).not.toBe(ref);
    expect(ref).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is the same value the WHMCS addon writes (php pro/whmcs/test/lib-test.php prints it)", () => {
    expect(clientRef("s".repeat(48), "7", " Buyer@Example.test")).toBe("cc002447a02fea47");
  });
});

describe("decideInvoice", () => {
  it("credits the sum of the top-up lines of a paid invoice", () => {
    expect(decide(invoice())).toEqual({ kind: "credit", amountMinor: 2500n, currency: "USD" });
  });

  it("credits the top-up lines only, not the reseller's tax", () => {
    expect(decide(invoice({ total: "27.50" }))).toEqual({
      kind: "credit",
      amountMinor: 2500n,
      currency: "USD",
    });
  });

  it("waits while the invoice is not paid in full", () => {
    expect(decide(invoice({ status: "Unpaid" })).kind).toBe("not_paid");
    expect(decide(invoice({ balance: "5.00" })).kind).toBe("not_paid");
  });

  it("ignores an invoice that is not a pure top-up", () => {
    expect(
      decide(invoice({ items: [line("25.00"), { description: "Web hosting", amount: "5.00" }] }))
        .kind,
    ).toBe("not_topup");
    expect(decide(invoice({ items: [] })).kind).toBe("not_topup");
  });

  it("refuses a client whose e-mail or id changed after the invoice was made (money review 5)", () => {
    expect(decide(invoice(), { ...client, email: "victim@example.test" })).toEqual({
      kind: "mismatch",
      reason: "ref",
      amountMinor: 2500n,
    });
    expect(decide(invoice(), { ...client, clientId: "8" }).kind).toBe("mismatch");
  });

  it("refuses when the client's currency is not the currency the line was written in (money review 3)", () => {
    expect(decide(invoice(), { ...client, currencyCode: "BDT" })).toEqual({
      kind: "mismatch",
      reason: "currency",
      amountMinor: 2500n,
    });
  });

  it("refuses an invoice paid with WHMCS credit balance (money review 2)", () => {
    expect(decide(invoice({ credit: "25.00" }))).toEqual({
      kind: "mismatch",
      reason: "paid_with_credit",
      amountMinor: 2500n,
    });
  });

  it("refuses a line that is not the addon's own format or disagrees with its amount", () => {
    expect(
      decide(invoice({ items: [{ description: "TryAWS.now wallet top-up", amount: "25.00" }] })),
    ).toEqual({
      kind: "mismatch",
      reason: "line",
      amountMinor: null,
    });
    const changed = decide(
      invoice({ items: [{ ...line("25.00"), amount: "99.00" }], total: "99.00" }),
    );
    expect(changed).toMatchObject({ kind: "mismatch", reason: "line" });
    const mixed = decide(invoice({ items: [line("10.00"), line("15.00", "EUR")] }));
    expect(mixed).toMatchObject({ kind: "mismatch", reason: "line" });
  });

  it("refuses malformed or inconsistent amounts (R16)", () => {
    expect(decide(invoice({ total: "20.00" })).kind).toBe("invalid");
    expect(decide(invoice({ items: [{ ...line("25.00"), amount: "-25.00" }] })).kind).toBe(
      "invalid",
    );
    expect(decide(invoice({ balance: "zero" })).kind).toBe("invalid");
    expect(decide(invoice({ credit: "x" })).kind).toBe("invalid");
    expect(decide(invoice(), { ...client, currencyCode: "usd" }).kind).toBe("invalid");
  });
});
