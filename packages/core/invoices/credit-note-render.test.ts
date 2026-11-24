import { describe, expect, it } from "vitest";
import {
  InvoiceError,
  creditNoteIdFor,
  formatCreditNoteNumber,
  formatInvoiceNumber,
  renderInvoiceHtml,
  unwrapDigitOneHtml as plain,
  type InvoiceDocument,
} from "./index";

// WPU-C1 (rulings 2, 5, 6): the Mushak-6.3 prints BOTH the date of supply and the date of issue and is marked
// as the original; the Mushak-6.7 credit note names the original invoice, the reason, the same rows with the
// VAT split of the stored lines, and the seller and buyer of the original. Spec 8 vector 44 USD.
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
const lines = [
  { kind: "service", code: "aws", label: label("AWS service", "AWS সেবা"), amountMinor: "558800" },
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
] as const;
const invoice: InvoiceDocument = {
  seller,
  kind: "invoice",
  number: "TC-2026-000042",
  issuedAt: new Date("2026-11-11T05:00:00Z"),
  supplyAt: new Date("2026-11-11T05:00:00Z"),
  company: { name: "PanelPay", address: ["Dhaka"] },
  customer: { name: "Rahim", address: "Mirpur, Dhaka" },
  lines: [...lines],
  totalMinor: 653796n,
};
const creditNote: InvoiceDocument = {
  ...invoice,
  kind: "credit_note",
  number: "TC-CN-2026-000003",
  issuedAt: new Date("2026-11-20T05:00:00Z"),
  supplyAt: null,
  credit: {
    originalNumber: "TC-2026-000042",
    originalIssuedAt: new Date("2026-11-11T05:00:00Z"),
    reason: "order_failed",
  },
};
const tableOf = (html: string): string =>
  /<thead>.*?<\/tbody>/s.exec(html.split("<table>")[1] ?? "")?.[0] ?? "";

describe("the date of supply and the date of issue (ruling 5)", () => {
  it("a normal invoice shows the same date twice", () => {
    const html = renderInvoiceHtml(invoice, "en");
    expect(html).toContain("<strong>Date of supply:</strong> 11-11-2026<br>");
    expect(html).toContain("<strong>Date and time of issue:</strong> 11-11-2026 11:00");
  });

  it("a backlog invoice shows the original charge date and the later date of issue", () => {
    const late = renderInvoiceHtml(
      { ...invoice, issuedAt: new Date("2026-11-14T05:00:00Z") },
      "en",
    );
    expect(late).toContain("<strong>Date of supply:</strong> 11-11-2026");
    expect(late).toContain("<strong>Date and time of issue:</strong> 14-11-2026 11:00");
  });

  it("the dates are Dhaka dates: a charge at 20:00 UTC is already the next day in Dhaka", () => {
    const html = renderInvoiceHtml(
      { ...invoice, supplyAt: new Date("2026-11-11T20:00:00Z") },
      "en",
    );
    expect(html).toContain("<strong>Date of supply:</strong> 12-11-2026");
  });

  it("Bengali labels and digits", () => {
    const html = plain(renderInvoiceHtml(invoice, "bn"));
    expect(html).toContain("<strong>সরবরাহের তারিখ:</strong> ১১-১১-২০২৬");
    expect(html).toContain("<strong>ইস্যুর তারিখ ও সময়:</strong>");
  });

  it("a supply date that is not known prints a dash and nothing is invented", () => {
    const html = renderInvoiceHtml({ ...invoice, supplyAt: null }, "en");
    expect(html).toContain("<strong>Date of supply:</strong> -<br>");
    expect(renderInvoiceHtml({ ...invoice, supplyAt: undefined }, "en")).toContain(
      "<strong>Date of supply:</strong> -<br>",
    );
  });

  it("the customer's document is marked Original / মূল কপি", () => {
    for (const locale of ["en", "bn"] as const) {
      expect(renderInvoiceHtml(invoice, locale)).toContain(
        '<div class="copy">Original / মূল কপি</div>',
      );
    }
  });
});

describe("the credit note (Mushak-6.7, ruling 6)", () => {
  it("is titled Credit Note with the form number, and carries no unchecked rule citation", () => {
    const en = renderInvoiceHtml(creditNote, "en");
    expect(en).toContain("<h1>Credit Note</h1></div>");
    expect(en).toContain('<div class="form">Mushak-6.7</div>');
    expect(en).not.toContain("Rule 40");
    expect(en).not.toContain("Tax Invoice");
    const bn = renderInvoiceHtml(creditNote, "bn");
    expect(bn).toContain("<h1>ক্রেডিট নোট</h1>");
    expect(bn).toContain("মূসক-৬.৭ (Mushak-6.7)");
    expect(bn).toContain("Original / মূল কপি");
  });

  it("names the original invoice number and date, the reason, and its own number", () => {
    const html = renderInvoiceHtml(creditNote, "en");
    expect(html).toContain("<strong>Credit note no.:</strong> TC-CN-2026-000003");
    expect(html).toContain("<strong>Original invoice no.:</strong> TC-2026-000042");
    expect(html).toContain("<strong>Original invoice date:</strong> 11-11-2026");
    expect(html).toContain("<strong>Reason:</strong> Order failed");
    expect(html).toContain("<strong>Date and time of issue:</strong> 20-11-2026 11:00");
    expect(html).not.toContain("Date of supply");
    const bn = renderInvoiceHtml(
      { ...creditNote, credit: { ...creditNote.credit!, reason: "plan_change_not_delivered" } },
      "bn",
    );
    expect(bn).toContain("প্ল্যান পরিবর্তন সম্পন্ন হয়নি");
    expect(
      renderInvoiceHtml(
        { ...creditNote, credit: { ...creditNote.credit!, reason: "refund" } },
        "en",
      ),
    ).toContain("<strong>Reason:</strong> Refund");
  });

  it("repeats the rows of the original in full, with the VAT split of the stored lines", () => {
    for (const locale of ["en", "bn"] as const) {
      expect(tableOf(renderInvoiceHtml(creditNote, locale))).toBe(
        tableOf(renderInvoiceHtml(invoice, locale)),
      );
    }
    const html = renderInvoiceHtml(creditNote, "en");
    expect(html).toContain("6,537.96"); // the total of the original
    expect(html).toContain("Amount credited in words");
    expect(html).toContain("reverses the original invoice in full");
  });

  it("prints the seller and buyer it is given (the snapshots of the original), escaped", () => {
    const html = renderInvoiceHtml(
      { ...creditNote, customer: { name: "<b>Rahim</b>", address: "Mirpur" } },
      "en",
    );
    expect(html).toContain("Example Services Limited");
    expect(html).toContain("123456789-0123");
    expect(html).toContain("&lt;b&gt;Rahim&lt;/b&gt;");
  });

  it("refuses (R16) without the original invoice and the reason, without a seller, and with lines that do not add up", () => {
    const { credit: _credit, ...bare } = creditNote;
    void _credit;
    expect(() => renderInvoiceHtml(bare, "en")).toThrow(InvoiceError);
    const { seller: _s, ...noSeller } = creditNote;
    void _s;
    expect(() => renderInvoiceHtml(noSeller, "en")).toThrow(InvoiceError);
    expect(() => renderInvoiceHtml({ ...creditNote, totalMinor: 1n }, "en")).toThrow(InvoiceError);
  });

  it("a wrong VAT amount is never printed on a credit note either", () => {
    const bad = lines.map((l) => (l.code === "bd_vat" ? { ...l, amountMinor: "27941" } : l));
    expect(() =>
      renderInvoiceHtml({ ...creditNote, lines: bad, totalMinor: 653797n }, "en"),
    ).toThrow(InvoiceError);
  });
});

describe("numbers", () => {
  it("a credit note has its own number form, apart from the invoice number", () => {
    expect(formatCreditNoteNumber(2026, 3)).toBe("TC-CN-2026-000003");
    expect(formatInvoiceNumber(2026, 3)).toBe("TC-2026-000003");
    expect(() => formatCreditNoteNumber(2025, 1)).toThrow(InvoiceError);
    expect(() => formatCreditNoteNumber(2026, 0)).toThrow(InvoiceError);
  });

  it("the id of a credit note comes from its reversal, the same every time (R7)", () => {
    const a = "0190aaaa-0000-7000-8000-0000000000a1";
    const b = "0190aaaa-0000-7000-8000-0000000000a2";
    expect(creditNoteIdFor(a)).toBe(creditNoteIdFor(a));
    expect(creditNoteIdFor(a)).not.toBe(creditNoteIdFor(b));
    expect(creditNoteIdFor(a)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);
  });
});
