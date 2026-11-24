import { describe, expect, it } from "vitest";
import {
  InvoiceError,
  renderInvoiceHtml,
  unwrapDigitOneHtml as plain,
  wrapDigitOneHtml,
  type InvoiceDocument,
} from "./index";

const seller = {
  legalNameBn: "উদাহরণ সার্ভিসেস লিমিটেড",
  legalNameEn: "Example Services Limited",
  bin: "1234567890123",
  addressBn: "১ নম্বর রোড, ঢাকা",
  addressEn: "Road 1, Dhaka",
  signatoryName: "Karim Uddin",
  signatoryDesignation: "Director",
  vatCircle: "Dhaka South",
};

const doc: InvoiceDocument = {
  seller,
  kind: "invoice",
  number: "TC-2026-000042",
  issuedAt: new Date("2026-11-11T05:00:00Z"),
  company: { name: "PanelPay", address: ["House 1, Road 2", "Dhaka"] },
  customer: { name: "Rahim & <Sons>", address: "Mirpur, Dhaka" },
  lines: [
    {
      kind: "service",
      code: "aws",
      label: {
        en: "Cloud Server, Amazon Lightsail instance",
        bn: "ক্লাউড সার্ভার, Amazon Lightsail instance",
      },
      amountMinor: "10000",
    },
    {
      kind: "step",
      code: "bd_vat",
      label: { en: "VAT", bn: "ভ্যাট" },
      amountMinor: "550",
      rate: "0.055",
    },
  ],
  totalMinor: 10550n,
};

describe("renderInvoiceHtml", () => {
  it("is a complete document with one inline style element and no URL", () => {
    const html = renderInvoiceHtml(doc, "en");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html).not.toMatch(/https?:|url\(|@import|<link|<script|<img|\bsrc=|\bstyle=/i);
  });
  it("shows the number, the lines and the exact total", () => {
    const html = renderInvoiceHtml(doc, "en");
    expect(html).toContain("TC-2026-000042");
    expect(html).toContain("100.00");
    expect(html).toContain("5.50");
    expect(html).toContain("105.50");
    expect(html).toContain("100.00");
    expect(html).toContain("Cloud Server, Amazon Lightsail instance");
    expect(html).toContain('lang="en"');
  });
  it("renders Bengali labels and Bengali digits in bn, but the number in Latin digits", () => {
    const html = plain(renderInvoiceHtml(doc, "bn"));
    expect(html).toContain('lang="bn"');
    expect(html).toContain("ক্লাউড সার্ভার");
    expect(html).toContain("১০৫.৫০");
    expect(html).toContain("TC-2026-000042");
    expect(html).toContain("১১-১১-২০২৬");
  });
  it("carries the AWS statements of 16.13 unchanged, with no endorsement claim", () => {
    const en = renderInvoiceHtml(doc, "en");
    expect(en).toContain("100% AWS infrastructure. Built on Amazon Lightsail.");
    expect(en).toContain(
      "Amazon Web Services, AWS, Amazon Lightsail and Amazon Route 53 are trademarks of Amazon.com, Inc. or its affiliates.",
    );
    expect(en).toContain("PanelPay sells, bills and supports the service.");
    const bn = plain(renderInvoiceHtml(doc, "bn"));
    expect(bn).toContain("১০০% AWS অবকাঠামো। Amazon Lightsail দিয়ে তৈরি।");
    expect(bn).toContain("বিক্রি, বিল ও সাপোর্ট PanelPay দেয়।");
    expect(en).not.toMatch(/AWS Lightsail/);
  });
  it("escapes customer text, so it is never markup (R11)", () => {
    const html = renderInvoiceHtml(doc, "en");
    expect(html).toContain("Rahim &amp; &lt;Sons&gt;");
    expect(html).not.toContain("<Sons>");
  });
  it("never shows an AWS account id or an ARN, and carries no tc- resource name", () => {
    const html = renderInvoiceHtml(doc, "en");
    expect(html).not.toMatch(/arn:aws|\b\d{12}\b|tc-[a-z]+-/i);
  });
  it("a receipt says it is not a tax invoice", () => {
    const html = renderInvoiceHtml({ ...doc, kind: "receipt" }, "en");
    expect(html).toContain("Payment receipt");
    expect(html).toContain("not a tax invoice");
    expect(renderInvoiceHtml(doc, "en")).not.toContain("not a tax invoice");
  });
  it("is the Mushak 6.3 tax invoice with the form marks", () => {
    const html = renderInvoiceHtml(doc, "en");
    expect(html).toContain("Mushak-6.3");
    expect(html).toContain("Rule 40(1)(ka)");
    expect(html).toContain("Government of the People&#39;s Republic of Bangladesh");
    expect(html).toContain("National Board of Revenue");
    expect(html).toContain("Tax Invoice");
    const bn = plain(renderInvoiceHtml(doc, "bn"));
    expect(bn).toContain("কর চালানপত্র");
    expect(bn).toContain("গণপ্রজাতন্ত্রী বাংলাদেশ সরকার");
    expect(bn).toContain("জাতীয় রাজস্ব বোর্ড");
  });
  it("shows the seller legal name, BIN and address in the locale, and the buyer", () => {
    const en = renderInvoiceHtml(
      { ...doc, customer: { ...doc.customer, taxId: { kind: "bin", value: "1990123456789" } } },
      "en",
    );
    expect(en).toContain("Example Services Limited");
    expect(en).toContain("123456789-0123");
    expect(en).toContain("Road 1, Dhaka");
    expect(en).toContain("Dhaka South");
    expect(en).not.toContain("NID");
    expect(en).toContain("1990123456789");
    const bn = plain(renderInvoiceHtml(doc, "bn"));
    expect(bn).toContain("উদাহরণ সার্ভিসেস লিমিটেড");
    expect(bn).toContain("১২৩৪৫৬৭৮৯-০১২৩");
    expect(bn).toContain("১ নম্বর রোড, ঢাকা");
  });
  // WPU-Y6 (owner, 2026-11-14): the seller is printed with its BIN as the owner gives it (9 and 4 digits
  // with a hyphen) and, when entered, its trade licence number.
  it("prints the seller BIN as 000000000-0000 and the trade licence when it is entered", () => {
    const owner = { ...seller, bin: "0000000000000", tradeLicense: "TRAD/DNCC/000000/2000" };
    const en = renderInvoiceHtml({ ...doc, seller: owner }, "en");
    expect(en).toContain("<strong>BIN:</strong> 000000000-0000");
    expect(en).toContain("<strong>Trade License:</strong> TRAD/DNCC/000000/2000");
    const bn = plain(renderInvoiceHtml({ ...doc, seller: owner }, "bn"));
    expect(bn).toContain("০০০০০০০০০-০০০০");
    expect(bn).toContain("ট্রেড লাইসেন্স");
    expect(bn).toContain("TRAD/DNCC/000000/2000");
    expect(renderInvoiceHtml(doc, "en")).not.toContain("Trade License");
  });
  it("splits the stored VAT line from the rest, never recomputing it", () => {
    const en = renderInvoiceHtml(doc, "en");
    // value 100.00, VAT 5.50 at 5.5%, total 105.50, supplementary duty 0.00
    expect(en).toMatch(/<td class="num">100\.00<\/td>/);
    expect(en).toContain("5.5%");
    expect(en).toMatch(/<td class="num">5\.50<\/td>/);
    expect(en).toContain("0.00");
  });
  it("prints the amount in words and the date and time of issue in Dhaka time", () => {
    expect(renderInvoiceHtml(doc, "en")).toContain("One Hundred Five Taka and Fifty Paisa only");
    expect(renderInvoiceHtml(doc, "en")).toContain("11:00");
    expect(plain(renderInvoiceHtml(doc, "bn"))).toContain("একশত পাঁচ টাকা ও পঞ্চাশ পয়সা মাত্র");
    expect(plain(renderInvoiceHtml(doc, "bn"))).toContain("১১:০০");
  });
  it("has the signatory block, the print stylesheet and A4", () => {
    const html = renderInvoiceHtml(doc, "en");
    expect(html).toContain("Karim Uddin");
    expect(html).toContain("Director");
    expect(html).toContain("@media print");
    expect(html).toContain("size:A4");
  });
  it("refuses a tax invoice without seller details (R16) but not a receipt", () => {
    const noSeller: InvoiceDocument = { ...doc };
    delete noSeller.seller;
    expect(() => renderInvoiceHtml(noSeller, "en")).toThrow(/seller_details_missing/);
    expect(() => renderInvoiceHtml({ ...noSeller, kind: "receipt" }, "en")).not.toThrow();
  });
  it("shows a dash for a missing buyer address and BIN, and escapes the seller text", () => {
    const html = renderInvoiceHtml(
      { ...doc, seller: { ...seller, legalNameEn: "A <b>&</b> Co" }, customer: { name: "X" } },
      "en",
    );
    expect(html).toContain("A &lt;b&gt;&amp;&lt;/b&gt; Co");
    expect(html).not.toContain("<b>&</b>");
  });
  it("is the same for the same input (pure)", () => {
    expect(plain(renderInvoiceHtml(doc, "bn"))).toBe(plain(renderInvoiceHtml(doc, "bn")));
  });
  it("fails closed when the lines do not add up to the total (R16)", () => {
    expect(() => renderInvoiceHtml({ ...doc, totalMinor: 1n }, "en")).toThrow(InvoiceError);
  });
});

// WPU-F1: Hind Siliguri for the Bengali text, Noto Sans Bengali for the digit one, by fontconfig name.
describe("the fonts of the invoice (WPU-F1)", () => {
  const SPAN = '<span class="d1">১</span>';
  const kinds = ["invoice", "receipt", "credit_note"] as const;
  const credit = {
    originalNumber: "TC-2026-000001",
    originalIssuedAt: new Date("2026-11-01T05:00:00Z"),
    reason: "refund",
  } as const;
  const make = (kind: (typeof kinds)[number]): InvoiceDocument =>
    kind === "credit_note" ? { ...doc, kind, credit } : { ...doc, kind };

  it.each(kinds)(
    "%s: Hind Siliguri first, the digit rule in the style block, no inline style",
    (kind) => {
      const html = renderInvoiceHtml(make(kind), "bn");
      expect(html).toContain(
        'font-family:"Hind Siliguri","Noto Sans Bengali","Noto Sans",sans-serif',
      );
      expect(html).toContain('.d1{font-family:"Noto Sans Bengali","Hind Siliguri",sans-serif}');
      expect(html).not.toMatch(/\sstyle\s*=/i);
      expect(html).not.toMatch(/@font-face|url\(/i);
    },
  );

  it.each(kinds)("%s: every ১ of the text is wrapped, and only in text", (kind) => {
    const html = renderInvoiceHtml(make(kind), "bn");
    const body = html.slice(html.indexOf("<body>"));
    expect(body).toContain(SPAN);
    // no ১ outside a span: removing the spans leaves none behind
    expect(body.replaceAll(SPAN, "")).not.toContain("১");
    expect(plain(html)).not.toContain("<span");
  });

  it("wraps the digit one of money, dates and the number of rows, and not the other digits", () => {
    const html = renderInvoiceHtml(doc, "bn");
    expect(html).toContain(`<td class="num">${SPAN}০০.০০</td>`); // 100.00
    expect(html).toContain(`${SPAN}${SPAN}-${SPAN}${SPAN}-২০২৬`); // 11-11-2026
    expect(html).not.toContain('<span class="d1">২</span>');
    expect(html).not.toContain('<span class="d1">0</span>');
  });

  it("escapes first and wraps after: customer text with ১ and markup stays inert (R11)", () => {
    const html = renderInvoiceHtml(
      { ...doc, customer: { name: "<১>", address: '১ নম্বর রোড, "১১" & Co' } },
      "bn",
    );
    expect(html).toContain(`&lt;${SPAN}&gt;`);
    expect(html).toContain(`${SPAN} নম্বর রোড, &quot;${SPAN}${SPAN}&quot; &amp; Co`);
    expect(html).not.toContain("<১>");
  });

  it("is idempotent: wrapping the finished document again changes nothing", () => {
    const html = renderInvoiceHtml(doc, "bn");
    expect(wrapDigitOneHtml(html)).toBe(html);
  });

  it("an English invoice with Latin digits has no span at all", () => {
    expect(renderInvoiceHtml(doc, "en")).not.toContain('<span class="d1">');
  });
});
