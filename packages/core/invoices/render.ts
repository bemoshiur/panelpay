// The invoice HTML (9.3). One template for the invoice page and for the PDF of invoice-renderer. The
// CSS is inlined in one <style> element and the document refers to no URL (3: the renderer has no
// network); the fonts are packaged with the function and named in font-family, never fetched (U4
// exception for the invoice). Pure: the same input gives the same text.
import type { Locale, Minor } from "../types";
import { roundedShareMinor } from "../pricing/vat-check";
import { amountInWords } from "./words";
import { BENGALI_DIGIT_FONT, DIGIT_ONE_CLASS, wrapDigitOneHtml } from "./digit-one";
import { formatBin, type SellerDetails } from "./seller";
import {
  InvoiceError,
  formatMinor,
  parseLineAmount,
  type InvoiceLine,
  type Numerals,
} from "./base";

export type DocumentKind = "invoice" | "receipt" | "credit_note";

/** WPU-C1: why a credit note was issued (the stored codes of invoices.reason). */
export type CreditReason = "refund" | "plan_change_not_delivered" | "order_failed";

export interface InvoiceDocument {
  kind: DocumentKind;
  number: string;
  issuedAt: Date;
  company: { name: string; address: readonly string[] };
  /** The registered person of a tax invoice (Mushak 6.3). Required for kind "invoice". */
  seller?: SellerDetails;
  customer: {
    name: string | null;
    address?: string | null;
    /** The buyer's BIN, only when the customer has one (a registered business). No NID (WPU-D3). */
    taxId?: { kind: "bin"; value: string } | null;
  };
  lines: readonly InvoiceLine[];
  totalMinor: Minor;
  numerals?: Numerals;
  /**
   * WPU-C1 (ruling 5): the date of supply of a tax invoice: the charge date (the ledger transaction time).
   * A normal invoice shows the same date as the date of issue; a backlog invoice shows the original charge
   * date. null or omitted: not known, printed as "-" (nothing is invented).
   */
  supplyAt?: Date | null;
  /** WPU-C1: a credit note (kind "credit_note") names the invoice it credits and the reason. */
  credit?: { originalNumber: string; originalIssuedAt: Date; reason: CreditReason };
}

// 16.13, unchanged.
const SHORT_STATEMENT: Record<Locale, string> = {
  en: "100% AWS infrastructure. Built on Amazon Lightsail.",
  bn: "১০০% AWS অবকাঠামো। Amazon Lightsail দিয়ে তৈরি।",
};
const TRADEMARK_LINE =
  "Amazon Web Services, AWS, Amazon Lightsail and Amazon Route 53 are trademarks of Amazon.com, Inc. or its affiliates.";
// Who sells, bills and supports (no implied endorsement, 16.13).
const SELLER_LINE: Record<Locale, string> = {
  en: "TryAWS.now sells, bills and supports the service.",
  bn: "বিক্রি, বিল ও সাপোর্ট TryAWS.now দেয়।",
};

const TEXT = {
  en: {
    invoice: "Invoice",
    receipt: "Payment receipt",
    notTax: "This is a payment receipt, not a tax invoice.",
    number: "Number",
    date: "Date",
    billedTo: "Billed to",
    description: "Description",
    amount: "Amount (BDT)",
    total: "Total (BDT)",
  },
  bn: {
    invoice: "ইনভয়েস",
    receipt: "পেমেন্ট রসিদ",
    notTax: "এটি পেমেন্ট রসিদ, ট্যাক্স ইনভয়েস নয়।",
    number: "নম্বর",
    date: "তারিখ",
    billedTo: "গ্রাহক",
    description: "বিবরণ",
    amount: "টাকা (BDT)",
    total: "মোট (BDT)",
  },
} as const;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
// Every string that is not a constant of this file goes through here (R11).
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
function dateText(at: Date, locale: Locale, numerals: Numerals | undefined): string {
  const dhaka = new Date(at.getTime() + 6 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const text = `${p(dhaka.getUTCDate())}-${p(dhaka.getUTCMonth() + 1)}-${dhaka.getUTCFullYear()}`;
  const bengali = (numerals ?? (locale === "bn" ? "beng" : "latn")) === "beng";
  return bengali ? text.replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)] ?? d) : text;
}

// The font names are packaged with the function (VERIFY: Bengali shaping in the PDF engine). Fonts are
// named for fontconfig, never fetched: a @font-face URL would be an aborted request in the PDF engine.
// Hind Siliguri draws the Bengali text (owner decision, WPU-F1); the digit one is wrapped in a span of
// class d1 and drawn with BENGALI_DIGIT_FONT (digit-one.ts), through a rule of the <style> block.
const TEXT_FONTS = `"Hind Siliguri","${BENGALI_DIGIT_FONT}","Noto Sans",sans-serif`;
const DIGIT_RULE = `.${DIGIT_ONE_CLASS}{font-family:"${BENGALI_DIGIT_FONT}","Hind Siliguri",sans-serif}`;
const CSS = `
body{font-family:${TEXT_FONTS};color:#1b1f23;font-size:13px;line-height:1.5;margin:0;padding:32px}
header{display:flex;justify-content:space-between;border-bottom:2px solid #1b1f23;padding-bottom:12px}
h1{font-size:22px;margin:0}
.brand{font-size:20px;font-weight:700}
table{width:100%;border-collapse:collapse;margin-top:20px}
th,td{padding:8px;border-bottom:1px solid #d0d4d9;text-align:left}
th.num,td.num{text-align:right;white-space:nowrap}
tfoot td{font-weight:700;border-top:2px solid #1b1f23;border-bottom:0}
.meta{margin-top:16px;display:flex;justify-content:space-between}
.note{margin-top:16px}
footer{margin-top:32px;border-top:1px solid #d0d4d9;padding-top:12px;font-size:11px;color:#4a5159}
${DIGIT_RULE}
`.trim();

// ---- Mushak 6.3 (tax invoice, VAT Rules 2016) ----------------------------------------------------
const MUSHAK = {
  en: {
    gov: "Government of the People's Republic of Bangladesh",
    board: "National Board of Revenue",
    title: "Tax Invoice",
    rule: "[Rule 40(1)(ka)]",
    form: "Mushak-6.3",
    seller: "Registered person",
    sellerName: "Name",
    bin: "BIN",
    address: "Address",
    circle: "VAT circle / commissionerate",
    tradeLicense: "Trade License",
    buyer: "Buyer",
    invoiceNo: "Challan / invoice no.",
    issued: "Date and time of issue",
    destination: "Delivery destination",
    vehicle: "Vehicle",
    serial: "Sl.",
    description: "Description of goods or services (type and specification)",
    quantity: "Quantity / unit",
    unitPrice: "Unit price excl. taxes",
    totalExcl: "Total price excl. taxes",
    sd: "Supplementary duty",
    value: "Value",
    vatRate: "VAT rate",
    vatAmount: "VAT amount",
    totalIncl: "Total price incl. all taxes",
    total: "Total",
    words: "Amount in words",
    components: "Price components (BDT)",
    signatory: "Authorised signatory",
    sigName: "Name",
    sigDesignation: "Designation",
    sigDate: "Date",
    sigLine: "Signature",
    unit: "1 service",
    fallback: "Cloud service, Amazon Lightsail",
    contact: "Contact",
    supplyDate: "Date of supply",
    original: "Original / মূল কপি",
    creditTitle: "Credit Note",
    creditForm: "Mushak-6.7",
    creditNo: "Credit note no.",
    originalNo: "Original invoice no.",
    originalDate: "Original invoice date",
    reason: "Reason",
    reasonText: {
      refund: "Refund",
      plan_change_not_delivered: "Plan change not delivered",
      order_failed: "Order failed",
    },
    reverses: "This credit note reverses the original invoice in full.",
    creditWords: "Amount credited in words",
  },
  bn: {
    gov: "গণপ্রজাতন্ত্রী বাংলাদেশ সরকার",
    board: "জাতীয় রাজস্ব বোর্ড",
    title: "কর চালানপত্র",
    rule: "[বিধি ৪০(১)(ক)]",
    form: "মূসক-৬.৩ (Mushak-6.3)",
    seller: "নিবন্ধিত ব্যক্তি",
    sellerName: "নাম",
    bin: "বিআইএন",
    address: "ঠিকানা",
    circle: "ভ্যাট সার্কেল / কমিশনারেট",
    tradeLicense: "ট্রেড লাইসেন্স",
    buyer: "ক্রেতা",
    invoiceNo: "চালান / ইনভয়েস নম্বর",
    issued: "ইস্যুর তারিখ ও সময়",
    destination: "সরবরাহের গন্তব্য",
    vehicle: "যানবাহন",
    serial: "ক্রম",
    description: "পণ্য বা সেবার বর্ণনা (প্রকৃতি ও বিনির্দেশ)",
    quantity: "পরিমাণ / একক",
    unitPrice: "কর ব্যতীত একক মূল্য",
    totalExcl: "কর ব্যতীত মোট মূল্য",
    sd: "সম্পূরক শুল্ক",
    value: "মূল্য",
    vatRate: "ভ্যাটের হার",
    vatAmount: "ভ্যাটের পরিমাণ",
    totalIncl: "সকল কর সহ মোট মূল্য",
    total: "মোট",
    words: "কথায়",
    components: "মূল্যের উপাদান (টাকা)",
    signatory: "ক্ষমতাপ্রাপ্ত ব্যক্তির স্বাক্ষর",
    sigName: "নাম",
    sigDesignation: "পদবি",
    sigDate: "তারিখ",
    sigLine: "স্বাক্ষর",
    unit: "১ সেবা",
    fallback: "ক্লাউড সেবা, Amazon Lightsail",
    contact: "যোগাযোগ",
    supplyDate: "সরবরাহের তারিখ",
    original: "Original / মূল কপি",
    creditTitle: "ক্রেডিট নোট",
    creditForm: "মূসক-৬.৭ (Mushak-6.7)",
    creditNo: "ক্রেডিট নোট নম্বর",
    originalNo: "মূল চালানের নম্বর",
    originalDate: "মূল চালানের তারিখ",
    reason: "কারণ",
    reasonText: {
      refund: "ফেরত (রিফান্ড)",
      plan_change_not_delivered: "প্ল্যান পরিবর্তন সম্পন্ন হয়নি",
      order_failed: "অর্ডার ব্যর্থ হয়েছে",
    },
    reverses: "এই ক্রেডিট নোট মূল চালানটি সম্পূর্ণ বাতিল করে।",
    creditWords: "ক্রেডিট করা পরিমাণ কথায়",
  },
} as const;
const VAT_CODE = "bd_vat";

// "0.055" -> "5.5%". Decimal text in, text out: no float (R4). null when it is not a decimal.
export function percentText(rate: string): string | null {
  const m = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(rate);
  if (m === null) return null;
  const frac = (m[2] ?? "").padEnd(2, "0");
  const whole = `${m[1]}${frac.slice(0, 2)}`.replace(/^0+(?=\d)/, "");
  const rest = frac.slice(2).replace(/0+$/, "");
  return `${whole}${rest === "" ? "" : `.${rest}`}%`;
}

function digitsFor(text: string, locale: Locale, numerals: Numerals | undefined): string {
  const bengali = (numerals ?? (locale === "bn" ? "beng" : "latn")) === "beng";
  return bengali ? text.replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)] ?? d) : text;
}
function timeText(at: Date, locale: Locale, numerals: Numerals | undefined): string {
  const dhaka = new Date(at.getTime() + 6 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return digitsFor(`${p(dhaka.getUTCHours())}:${p(dhaka.getUTCMinutes())}`, locale, numerals);
}

const MUSHAK_CSS = `
@page{size:A4;margin:12mm}
body{font-family:${TEXT_FONTS};color:#1b1f23;font-size:12px;line-height:1.45;margin:0;padding:16px}
.head{text-align:center}
.head .gov{font-size:13px;font-weight:700}
.head h1{font-size:18px;margin:6px 0 2px}
.form{text-align:right;font-weight:700}
.copy{text-align:right;font-size:11px}
.grid{display:flex;gap:16px;margin-top:12px}
.grid>div{flex:1;border:1px solid #1b1f23;padding:8px}
.grid h2{font-size:12px;margin:0 0 4px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{padding:5px;border:1px solid #1b1f23;text-align:left;vertical-align:top}
th{font-size:11px;background:#eef0f2}
th.num,td.num{text-align:right;white-space:nowrap}
tfoot td{font-weight:700}
.words{margin-top:10px}
.sig{margin-top:28px;display:flex;justify-content:flex-end}
.sig>div{width:45%;border-top:1px solid #1b1f23;padding-top:6px}
footer{margin-top:20px;border-top:1px solid #d0d4d9;padding-top:8px;font-size:10px;color:#4a5159}
@media print{body{padding:0}th{background:#eee}}
${DIGIT_RULE}
`.trim();

// One row of the line table of the Mushak 6.3. `value` is the base the VAT of the row is charged on; for
// a row without VAT it is the row's own price. `rate` is the stored rate of the VAT line, as the text of
// the percent, null for a dash.
interface MushakRow {
  label: string;
  priceExcl: bigint;
  value: bigint;
  rate: string | null;
  vat: bigint;
  total: bigint;
}

interface ParsedLine {
  line: InvoiceLine;
  amount: bigint;
}

// WPU-I5. The rows of the table. The AWS service is the first row; Korea VAT, the processing fee and any
// markup are rows of their own (no VAT is charged on them); a VAT line sits on the service row when its
// own base is the AWS base, else on a row of its own with the running subtotal as its value. Before the
// VAT is printed the page checks it: round_half_up(value x stored rate) must be the VAT of the line,
// from integers, or nothing is printed (R16). The rows' totals add up to the total of the invoice.
function mushakRows(parsed: readonly ParsedLine[], locale: Locale): MushakRow[] {
  const isVat = (p: ParsedLine) => p.line.kind === "step" && p.line.code === VAT_CODE;
  const rows: MushakRow[] = [];
  const serviceTotal = parsed
    .filter((p) => p.line.kind === "service")
    .reduce((s, p) => s + p.amount, 0n);
  let serviceRow: MushakRow | undefined;
  for (const p of parsed) {
    if (isVat(p)) continue;
    const row: MushakRow = {
      label: p.line.label[locale],
      priceExcl: p.amount,
      value: p.amount,
      rate: p.line.kind === "service" ? "0%" : null,
      vat: 0n,
      total: p.amount,
    };
    rows.push(row);
    if (serviceRow === undefined && p.line.kind === "service") serviceRow = row;
  }
  let running = 0n;
  for (const p of parsed) {
    if (isVat(p)) {
      const rate = p.line.rate;
      let base: bigint;
      let rateText: string | null = null;
      if (rate === undefined) {
        // No stored rate (an old line): nothing to check against and nothing recomputed; "-" is printed.
        base = serviceTotal;
      } else {
        rateText = percentText(rate);
        const hit = [serviceTotal, running].find((candidate) => {
          try {
            return roundedShareMinor(candidate, rate) === p.amount;
          } catch {
            return false;
          }
        });
        if (hit === undefined || rateText === null) throw new InvoiceError("vat_mismatch");
        base = hit;
      }
      const target =
        serviceRow !== undefined && serviceRow.vat === 0n && base === serviceRow.priceExcl
          ? serviceRow
          : undefined;
      if (target !== undefined) {
        target.value = base;
        target.rate = rateText;
        target.vat = p.amount;
        target.total = target.priceExcl + p.amount;
      } else {
        rows.push({
          label: p.line.label[locale],
          priceExcl: 0n,
          value: base,
          rate: rateText,
          vat: p.amount,
          total: p.amount,
        });
      }
    }
    running += p.amount;
  }
  return rows;
}

function mushakRowHtml(
  r: MushakRow,
  index: number,
  unit: string,
  money: (n: bigint) => string,
  num: (text: string) => string,
): string {
  return [
    `<tr><td>${num(String(index + 1))}</td><td>${escapeHtml(r.label)}</td><td>${unit}</td>`,
    `<td class="num">${money(r.priceExcl)}</td><td class="num">${money(r.priceExcl)}</td><td class="num">${money(0n)}</td>`,
    `<td class="num">${money(r.value)}</td><td class="num">${r.rate === null ? "-" : num(r.rate)}</td><td class="num">${money(r.vat)}</td><td class="num">${money(r.total)}</td></tr>`,
  ].join("");
}

function renderMushak(doc: InvoiceDocument, locale: Locale): string {
  const seller = doc.seller;
  // A tax invoice never goes out without the seller's legal details (R16).
  if (seller === undefined) throw new InvoiceError("seller_details_missing");
  const t = MUSHAK[locale];
  const bn = locale === "bn";
  const parsed = doc.lines.map((line) => ({ line, amount: parseLineAmount(line.amountMinor) }));
  const sum = parsed.reduce((s, p) => s + p.amount, 0n);
  // The page never prints a total that its lines do not add up to (R16).
  if (doc.lines.length === 0 || sum !== doc.totalMinor) throw new InvoiceError("invalid_lines");

  const money = (n: bigint) => formatMinor(n, locale, doc.numerals);
  const rows = mushakRows(parsed, locale);
  const dash = "-";
  const esc = escapeHtml;
  const num = (text: string) => digitsFor(text, locale, doc.numerals);
  const name = bn ? seller.legalNameBn : seller.legalNameEn;
  const address = bn ? seller.addressBn : seller.addressEn;
  const buyerTax = doc.customer.taxId;
  const contact = [seller.phone, seller.email].filter((x): x is string => x !== undefined);
  const buyerAddress = (doc.customer.address ?? "") === "" ? dash : esc(doc.customer.address ?? "");
  const buyerName =
    doc.customer.name === null || doc.customer.name === "" ? dash : esc(doc.customer.name);
  const buyerTaxText =
    buyerTax === null || buyerTax === undefined || buyerTax.kind !== "bin"
      ? dash
      : num(esc(buyerTax.value));
  const when = `${dateText(doc.issuedAt, locale, doc.numerals)} ${timeText(doc.issuedAt, locale, doc.numerals)}`;
  const credit = doc.kind === "credit_note";
  // A credit note names the invoice it credits and the reason (ruling 6); it never prints without them (R16).
  if (credit && doc.credit === undefined) throw new InvoiceError("invalid_lines");
  const title = credit ? t.creditTitle : t.title;
  const form = credit ? t.creditForm : t.form;
  const supply =
    doc.supplyAt === undefined || doc.supplyAt === null
      ? dash
      : dateText(doc.supplyAt, locale, doc.numerals);
  const numberBlock = credit
    ? [
        `<strong>${t.creditNo}:</strong> ${esc(doc.number)}<br>`,
        `<strong>${t.originalNo}:</strong> ${esc(doc.credit?.originalNumber ?? "")}<br>`,
        `<strong>${t.originalDate}:</strong> ${dateText(doc.credit?.originalIssuedAt ?? doc.issuedAt, locale, doc.numerals)}<br>`,
        `<strong>${t.reason}:</strong> ${esc(t.reasonText[doc.credit?.reason ?? "refund"])}<br>`,
        `<strong>${t.issued}:</strong> ${when}`,
      ].join("")
    : [
        `<strong>${t.invoiceNo}:</strong> ${esc(doc.number)}<br>`,
        `<strong>${t.supplyDate}:</strong> ${supply}<br>`,
        `<strong>${t.issued}:</strong> ${when}`,
      ].join("");

  // Escaped first, wrapped after: the digit one of every text node (money, dates, numbers, the buyer's
  // address) gets its span in one pass over the finished document (digit-one.ts).
  return wrapDigitOneHtml(
    [
      "<!doctype html>",
      `<html lang="${locale}">`,
      `<head><meta charset="utf-8"><title>${esc(title)} ${esc(doc.number)}</title><style>${MUSHAK_CSS}</style></head>`,
      "<body>",
      `<div class="form">${esc(form)}</div>`,
      `<div class="copy">${esc(t.original)}</div>`,
      `<div class="head"><div class="gov">${esc(t.gov)}</div><div class="gov">${esc(t.board)}</div>`,
      // The rule citation of the credit note form is not checked against the official text: none is printed.
      `<h1>${esc(title)}</h1>${credit ? "" : `<div>${esc(t.rule)}</div>`}</div>`,
      `<div class="grid"><div><h2>${t.seller}</h2>`,
      `<div><strong>${t.sellerName}:</strong> ${esc(name)}</div>`,
      // WPU-Y6: the seller BIN in the grouping the owner gives it (9 and 4 digits, "000000000-0000").
      `<div><strong>${t.bin}:</strong> ${num(esc(formatBin(seller.bin)))}</div>`,
      seller.tradeLicense !== undefined
        ? `<div><strong>${t.tradeLicense}:</strong> ${esc(seller.tradeLicense)}</div>`
        : "",
      `<div><strong>${t.address}:</strong> ${esc(address)}</div>`,
      seller.vatCircle !== undefined
        ? `<div><strong>${t.circle}:</strong> ${esc(seller.vatCircle)}</div>`
        : "",
      contact.length > 0
        ? `<div><strong>${t.contact}:</strong> ${contact.map(esc).join(", ")}</div>`
        : "",
      `</div><div><h2>${t.buyer}</h2>`,
      `<div><strong>${t.sellerName}:</strong> ${buyerName}</div>`,
      `<div><strong>${t.address}:</strong> ${buyerAddress}</div>`,
      `<div><strong>${t.bin}:</strong> ${buyerTaxText}</div>`,
      `</div></div>`,
      `<div class="grid"><div>${numberBlock}</div>`,
      `<div><strong>${t.destination}:</strong> ${buyerAddress}<br><strong>${t.vehicle}:</strong> ${dash}</div></div>`,
      `<table><thead><tr><th>${t.serial}</th><th>${t.description}</th><th>${t.quantity}</th>`,
      `<th class="num">${t.unitPrice}</th><th class="num">${t.totalExcl}</th><th class="num">${t.sd}</th>`,
      `<th class="num">${t.value}</th><th class="num">${t.vatRate}</th><th class="num">${t.vatAmount}</th><th class="num">${t.totalIncl}</th></tr></thead>`,
      `<tbody>${rows.map((r, i) => mushakRowHtml(r, i, t.unit, money, num)).join("")}</tbody>`,
      `<tfoot><tr><td colspan="4">${t.total}</td><td class="num">${money(rows.reduce((s, r) => s + r.priceExcl, 0n))}</td><td class="num">${money(0n)}</td>`,
      `<td></td><td></td><td class="num">${money(rows.reduce((s, r) => s + r.vat, 0n))}</td><td class="num">${money(doc.totalMinor)}</td></tr></tfoot></table>`,
      `<p class="words"><strong>${credit ? t.creditWords : t.words}:</strong> ${amountInWords(doc.totalMinor, locale)}</p>`,
      credit ? `<p>${t.reverses}</p>` : "",
      `<table><caption>${t.components}</caption><tbody>${parsed
        .filter((p) => !(p.line.kind === "step" && p.line.code === VAT_CODE))
        .map(
          (p) =>
            `<tr><td>${esc(p.line.label[locale])}</td><td class="num">${money(p.amount)}</td></tr>`,
        )
        .join("")}</tbody></table>`,
      `<div class="sig"><div><strong>${t.signatory}</strong><br>${t.sigName}: ${esc(seller.signatoryName)}<br>${t.sigDesignation}: ${esc(seller.signatoryDesignation)}<br>${t.sigDate}: ${dateText(doc.issuedAt, locale, doc.numerals)}<br>${t.sigLine}:</div></div>`,
      `<footer><p>${SHORT_STATEMENT[locale]} ${SELLER_LINE[locale]}</p><p>${TRADEMARK_LINE}</p></footer>`,
      "</body></html>",
    ].join("\n"),
  );
}

export function renderInvoiceHtml(doc: InvoiceDocument, locale: Locale): string {
  if (doc.kind === "invoice" || doc.kind === "credit_note") return renderMushak(doc, locale);
  const t = TEXT[locale];
  let sum = 0n;
  const rows = doc.lines.map((line) => {
    const amount = parseLineAmount(line.amountMinor);
    sum += amount;
    return `<tr><td>${escapeHtml(line.label[locale])}</td><td class="num">${formatMinor(amount, locale, doc.numerals)}</td></tr>`;
  });
  // The page never prints a total that its lines do not add up to (R16).
  if (doc.lines.length === 0 || sum !== doc.totalMinor) throw new InvoiceError("invalid_lines");

  const title = doc.kind === "receipt" ? t.receipt : t.invoice;
  const company = [doc.company.name, ...doc.company.address].map(escapeHtml).join("<br>");
  const customer = [doc.customer.name ?? "", doc.customer.address ?? ""]
    .filter((s) => s !== "")
    .map(escapeHtml)
    .join("<br>");

  return wrapDigitOneHtml(
    [
      "<!doctype html>",
      `<html lang="${locale}">`,
      `<head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(doc.number)}</title><style>${CSS}</style></head>`,
      "<body>",
      `<header><div><div class="brand">${escapeHtml(doc.company.name)}</div><div>${company}</div></div>`,
      `<div><h1>${escapeHtml(title)}</h1></div></header>`,
      `<div class="meta"><div><strong>${t.billedTo}</strong><br>${customer}</div>`,
      `<div><strong>${t.number}</strong> ${escapeHtml(doc.number)}<br><strong>${t.date}</strong> ${dateText(doc.issuedAt, locale, doc.numerals)}</div></div>`,
      `<table><thead><tr><th>${t.description}</th><th class="num">${t.amount}</th></tr></thead>`,
      `<tbody>${rows.join("")}</tbody>`,
      `<tfoot><tr><td>${t.total}</td><td class="num">${formatMinor(doc.totalMinor, locale, doc.numerals)}</td></tr></tfoot></table>`,
      doc.kind === "receipt" ? `<p class="note">${t.notTax}</p>` : "",
      `<footer><p>${SHORT_STATEMENT[locale]} ${SELLER_LINE[locale]}</p><p>${TRADEMARK_LINE}</p></footer>`,
      "</body></html>",
    ].join("\n"),
  );
}
