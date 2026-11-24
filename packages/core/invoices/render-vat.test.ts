import { describe, expect, it } from "vitest";
import { InvoiceError, renderInvoiceHtml, type InvoiceDocument } from "./index";

// WPU-I5: the value on a VAT line is that VAT step's own base; Korea VAT, the processing fee and any
// markup are rows of their own; the grand total is the ledger debit. Spec 8 vector 44 USD.
const seller = {
  legalNameBn: "উদাহরণ সার্ভিসেস লিমিটেড",
  legalNameEn: "Example Services Limited",
  bin: "1234567890123",
  addressBn: "১ নম্বর রোড, ঢাকা",
  addressEn: "Road 1, Dhaka",
  signatoryName: "Karim Uddin",
  signatoryDesignation: "Director",
};
const label = (en: string, bn: string) => ({ en, bn });
const base: InvoiceDocument = {
  seller,
  kind: "invoice",
  number: "TC-2026-000042",
  issuedAt: new Date("2026-11-11T05:00:00Z"),
  company: { name: "PanelPay", address: ["Dhaka"] },
  customer: { name: "Rahim", address: "Mirpur, Dhaka" },
  lines: [],
  totalMinor: 0n,
};
const vector44: InvoiceDocument = {
  ...base,
  lines: [
    {
      kind: "service",
      code: "aws",
      label: label("AWS service", "AWS সেবা"),
      amountMinor: "558800",
    },
    {
      kind: "step",
      code: "korea_vat",
      label: label("VAT", "ভ্যাট"),
      amountMinor: "55880",
      rate: "0.10",
    },
    {
      kind: "step",
      code: "bd_vat",
      label: label("VAT", "ভ্যাট"),
      amountMinor: "27940",
      rate: "0.05",
    },
    {
      kind: "step",
      code: "processing_fee",
      label: label("Processing fee", "প্রসেসিং ফি"),
      amountMinor: "11176",
      rate: "0.02",
    },
  ],
  totalMinor: 653796n,
};
const cellsOf = (html: string): string[][] => {
  const body = /<tbody>(.*?)<\/tbody>/s.exec(html.split("<table>")[1] ?? "")?.[1] ?? "";
  return [...body.matchAll(/<tr>(.*?)<\/tr>/gs)].map((m) =>
    [...(m[1] ?? "").matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((c) => c[1] ?? ""),
  );
};
const minorOf = (text: string): bigint => BigInt(text.replace(/[,.]/g, ""));

describe("the VAT line of the Mushak 6.3 (WPU-I5)", () => {
  it("vector 44 USD: the value printed on the VAT line is the AWS base, and rate x value = VAT", () => {
    const html = renderInvoiceHtml(vector44, "en");
    const vatRow = cellsOf(html).find((r) => r[8] === "279.40");
    expect(vatRow).toBeDefined();
    expect(vatRow?.[6]).toBe("5,588.00");
    expect(vatRow?.[7]).toBe("5%");
    // round_half_up(558800 x 0.05) = 27940
    expect((minorOf(vatRow?.[6] ?? "") * 5n + 50n) / 100n).toBe(minorOf(vatRow?.[8] ?? ""));
    // the old page printed total - VAT = 6,258.56 as the value of that 5%; no value cell holds it now
    // (the footer's total excl. taxes is the sum of the rows, which is that number, and is not a value)
    expect(cellsOf(html).map((r) => r[6])).not.toContain("6,258.56");
  });
  it("the pass-through VAT (step korea_vat, labelled VAT) and the processing fee are rows of their own with their own totals", () => {
    const rows = cellsOf(renderInvoiceHtml(vector44, "en"));
    expect(rows.map((r) => r[1])).toEqual(["AWS service", "VAT", "Processing fee"]);
    expect(rows.map((r) => r[9])).toEqual(["5,867.40", "558.80", "111.76"]);
    // no VAT is charged on those rows
    expect(rows[1]?.[8]).toBe("0.00");
    expect(rows[2]?.[8]).toBe("0.00");
  });
  it("the column of totals adds up to the ledger debit exactly, and the footer says it", () => {
    const html = renderInvoiceHtml(vector44, "en");
    const sum = cellsOf(html).reduce((s, r) => s + minorOf(r[9] ?? "0"), 0n);
    expect(sum).toBe(653796n);
    expect(html).toContain('<td class="num">6,537.96</td></tr></tfoot>');
  });
  it("the rate cell shows the stored rate, in bn with Bengali digits", () => {
    expect(renderInvoiceHtml(vector44, "en")).toContain("5%");
    expect(renderInvoiceHtml(vector44, "bn")).toContain("৫%");
  });
  it("a VAT amount that is not rate x value is refused, not printed (R16)", () => {
    const wrong = {
      ...vector44,
      lines: vector44.lines.map((l) => (l.code === "bd_vat" ? { ...l, amountMinor: "27941" } : l)),
      totalMinor: 653797n,
    };
    expect(() => renderInvoiceHtml(wrong, "en")).toThrow(InvoiceError);
    expect(() => renderInvoiceHtml(wrong, "en")).toThrow(/vat_mismatch/);
  });
  it("a stored rate that does not give the VAT is refused", () => {
    const wrong = {
      ...vector44,
      lines: vector44.lines.map((l) => (l.code === "bd_vat" ? { ...l, rate: "0.06" } : l)),
    };
    expect(() => renderInvoiceHtml(wrong, "en")).toThrow(/vat_mismatch/);
  });
  it("a VAT step on the running subtotal prints that subtotal as its value, on a row of its own", () => {
    // base 10000, Korea 10% = 1000, VAT 5% of the subtotal 11000 = 550
    const html = renderInvoiceHtml(
      {
        ...base,
        lines: [
          { kind: "service", code: "aws", label: label("AWS", "AWS"), amountMinor: "10000" },
          {
            kind: "step",
            code: "korea_vat",
            label: label("VAT", "ভ্যাট"),
            amountMinor: "1000",
            rate: "0.10",
          },
          {
            kind: "step",
            code: "bd_vat",
            label: label("VAT", "ভ্যাট"),
            amountMinor: "550",
            rate: "0.05",
          },
        ],
        totalMinor: 11550n,
      },
      "en",
    );
    const rows = cellsOf(html);
    const vatRow = rows.find((r) => r[8] === "5.50");
    expect(vatRow?.[6]).toBe("110.00");
    expect(vatRow?.[7]).toBe("5%");
    expect(rows.reduce((s, r) => s + minorOf(r[9] ?? "0"), 0n)).toBe(11550n);
  });
  it("a VAT line without a stored rate prints a dash and is not recomputed", () => {
    const html = renderInvoiceHtml(
      {
        ...base,
        lines: [
          { kind: "service", code: "aws", label: label("AWS", "AWS"), amountMinor: "10000" },
          { kind: "step", code: "bd_vat", label: label("VAT", "ভ্যাট"), amountMinor: "550" },
        ],
        totalMinor: 10550n,
      },
      "en",
    );
    const row = cellsOf(html)[0];
    expect(row?.[7]).toBe("-");
    expect(row?.[8]).toBe("5.50");
  });
});
