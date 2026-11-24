import { describe, expect, it } from "vitest";
import { renderInvoiceHtml, type InvoiceDocument } from "@tc/core";
import {
  createInvoiceRendererHandler,
  MAX_HTML_BYTES,
  rendererTierOf,
  MAX_RETURN_BYTES,
  type RendererDeps,
} from "./handler";
import { createFakePdfRenderer } from "./fake";

const customerId = "0190a000-0000-7000-8000-000000000001";
const invoiceId = "0190a000-0000-7000-8000-000000000002";

const doc: InvoiceDocument = {
  kind: "invoice",
  number: "TC-2026-000042",
  issuedAt: new Date("2026-11-11T05:00:00Z"),
  company: { name: "PanelPay", address: ["Dhaka"] },
  // A test fixture only: these are not the owner's details. A tax invoice is refused without a seller.
  seller: {
    legalNameBn: "পরীক্ষা বিক্রেতা",
    legalNameEn: "Test Seller",
    bin: "0000000000000",
    addressBn: "ঢাকা",
    addressEn: "Dhaka",
    signatoryName: "Test Signatory",
    signatoryDesignation: "Test Designation",
  },
  customer: { name: "Rahim", address: null },
  lines: [
    {
      kind: "service",
      code: "aws",
      label: { en: "Cloud Server", bn: "ক্লাউড সার্ভার" },
      amountMinor: "100",
    },
  ],
  totalMinor: 100n,
};
const html = renderInvoiceHtml(doc, "bn");

function setup(over: Partial<RendererDeps> = {}) {
  const stored = new Map<string, Uint8Array>();
  const logs: Record<string, unknown>[] = [];
  const deps: RendererDeps = {
    pdf: createFakePdfRenderer(),
    store: { put: async (key, bytes) => void stored.set(key, bytes) },
    log: (e) => logs.push(e as unknown as Record<string, unknown>),
    ...over,
  };
  const inner = createInvoiceRendererHandler(deps);
  // The invocation of the "web" alias; the tests of the tier use `inner` directly.
  return { handler: (event: unknown) => inner(event, "web"), inner, stored, logs };
}

describe("invoice-renderer handler", () => {
  it("renders the HTML it is given and stores the result under the derived key", async () => {
    const { handler, stored } = setup();
    const r = await handler({ customerId, invoiceId, locale: "bn", html });
    expect(r).toEqual({
      ok: true,
      key: `invoices/${customerId}/${invoiceId}.bn.pdf`,
      bytes: expect.any(Number),
    });
    // the fake engine returns the HTML bytes
    expect(new TextDecoder().decode(stored.get(`invoices/${customerId}/${invoiceId}.bn.pdf`))).toBe(
      html,
    );
  });
  it("is idempotent: the same event writes the same key with the same bytes", async () => {
    const { handler, stored } = setup();
    const a = await handler({ customerId, invoiceId, locale: "bn", html });
    const b = await handler({ customerId, invoiceId, locale: "bn", html });
    expect(a).toEqual(b);
    expect(stored.size).toBe(1);
  });
  it.each([
    ["no object", null],
    ["a customer id that is no UUID", { customerId: "../x", invoiceId, locale: "en", html }],
    ["an invoice id that is no UUID", { customerId, invoiceId: "1", locale: "en", html }],
    ["an unknown locale", { customerId, invoiceId, locale: "fr", html }],
    ["no html", { customerId, invoiceId, locale: "en" }],
    ["empty html", { customerId, invoiceId, locale: "en", html: "" }],
    [
      "html over the size limit",
      { customerId, invoiceId, locale: "en", html: "a".repeat(MAX_HTML_BYTES + 1) },
    ],
  ])("refuses %s and writes nothing", async (_name, event) => {
    const { handler, stored } = setup();
    expect(await handler(event)).toEqual({ ok: false, reason: "invalid_event" });
    expect(stored.size).toBe(0);
  });
  it.each([
    "<img src=x>",
    '<link rel="stylesheet" href="a.css">',
    "<script>1</script>",
    '<p><a href="https://example.com">x</a></p>',
    "<p><a href=//example.com>x</a></p>",
    '<p onclick="1">x</p>',
    "<p a='>' onclick=x>y</p>",
    '<p title="x"onclick=y>z</p>',
    "<svg onload=1></svg>",
    "<IMG SRC=x>",
    '<iframe src="a"></iframe>',
    '<p style="color:red" >x</p>',
    "<p>x</p><b",
    "<style>p{background:\\75rl(a.png)}</style>",
    "<style>p{background:u\\72l(a.png)}</style>",
    "<style>@import 'a.css'</style>",
    "<style>p{background:url(a.png)}</style>",
    '<p style="color:red">x</p>',
    // parser-differential defence (review of WPU-S8): a tag name must be on the allowlist, and a dangerous
    // tag name is refused anywhere in the document
    "<a>x</a>",
    "<!-- x --><p>y</p>",
    '<meta http-equiv="refresh" content="0;url=a">',
    "<meta name=viewport content=x>",
    "<p>x</p><template><p>y</p></template>",
    "<noscript><p>y</p></noscript>",
    "<xmp><p>y</p></xmp>",
    "<math><mi>x</mi></math>",
    "<p>x</p>< script>1</script>",
    '<p>x</p><base href="https://evil.test/">',
    "<form action=/x><input></form>",
  ])("refuses HTML that refers to a resource or runs code: %s (R16)", async (bad) => {
    const { handler, stored } = setup();
    expect(await handler({ customerId, invoiceId, locale: "en", html: bad })).toEqual({
      ok: false,
      reason: "unsafe_html",
    });
    expect(stored.size).toBe(0);
  });
  // L3 (WPU-S8): the safety check looks at the template (tags, attributes, the style block) and not at the
  // escaped text of the customer, so an ordinary address is not refused. Remote fetches stay refused.
  it.each([
    "House 12//B, Road 5",
    "Burl (East), Road 5",
    "Flat 3: Block C",
    "Plot=7, Sector=3",
    "see url(x) and on=1 and src=2 and style=3",
    "https://example.com/my-shop",
    "@import 'a.css'",
    'Rahim & Sons, "Dhanmondi" <Dhaka>',
    "<script>alert(1)</script>",
    '<img src="https://evil.test/p.png" onerror="1">',
    "বাড়ি ১২//খ, রোড ৫ (পূর্ব)",
  ])("renders the customer's own text as escaped text: %s", async (text) => {
    const { handler, stored } = setup();
    for (const [name, address] of [
      [text, "House 5, Dhaka"],
      ["Rahim", text],
    ] as const) {
      const page = renderInvoiceHtml({ ...doc, customer: { name, address } }, "en");
      const r = await handler({ customerId, invoiceId, locale: "en", html: page });
      expect(r).toMatchObject({ ok: true });
      const body = new TextDecoder().decode(
        stored.get(`invoices/${customerId}/${invoiceId}.en.pdf`),
      );
      // the text is in the page only escaped: no tag of the customer survives
      expect(body).not.toMatch(/<script|<img/i);
    }
  });
  it("accepts the real tax invoice and the receipt templates (nothing of them is a fetch)", async () => {
    const { handler } = setup();
    for (const locale of ["bn", "en"] as const) {
      const r = await handler({
        customerId,
        invoiceId,
        locale,
        html: renderInvoiceHtml(doc, locale),
      });
      expect(r).toMatchObject({ ok: true });
      const receipt = renderInvoiceHtml({ ...doc, kind: "receipt" }, locale);
      expect(await handler({ customerId, invoiceId, locale, html: receipt })).toMatchObject({
        ok: true,
      });
    }
  });
  it("accepts the Bengali templates with the digit-one span, the credit note and customer text with ১ and markup (WPU-F1)", async () => {
    const { handler } = setup();
    const credit = {
      originalNumber: "TC-2026-000001",
      originalIssuedAt: new Date("2026-11-01T05:00:00Z"),
      reason: "refund",
    } as const;
    const pages = [
      renderInvoiceHtml(doc, "bn"),
      renderInvoiceHtml({ ...doc, kind: "credit_note", credit }, "bn"),
      renderInvoiceHtml({ ...doc, kind: "receipt" }, "bn"),
      renderInvoiceHtml({ ...doc, customer: { name: "<১>", address: "১ নম্বর রোড" } }, "bn"),
    ];
    for (const page of pages) {
      expect(page).toContain('<span class="d1">১</span>');
      expect(page).toContain('"Hind Siliguri"');
      expect(await handler({ customerId, invoiceId, locale: "bn", html: page })).toMatchObject({
        ok: true,
      });
    }
  });
  it("a failed engine or store throws a fixed message and logs a fixed reason, no HTML, no ids (R14)", async () => {
    const boom = setup({
      pdf: {
        render: async () => {
          throw new Error(`secret ${customerId}`);
        },
      },
    });
    await expect(boom.handler({ customerId, invoiceId, locale: "en", html })).rejects.toThrow(
      "invoice-renderer: render failed",
    );
    const fail = setup({
      store: {
        put: async () => {
          throw new Error(`secret ${invoiceId}`);
        },
      },
    });
    await expect(fail.handler({ customerId, invoiceId, locale: "en", html })).rejects.toThrow(
      "invoice-renderer: store failed",
    );
    for (const log of [...boom.logs, ...fail.logs]) {
      const text = JSON.stringify(log);
      expect(text).not.toContain(customerId);
      expect(text).not.toContain(invoiceId);
      expect(text).not.toContain("TC-2026");
      expect(text).not.toContain("Rahim");
    }
  });
});

describe("tier of the invocation (WPU-B7 L3)", () => {
  const FN = "arn:aws:lambda:ap-southeast-1:111122223333:function:tc-invoice-renderer";
  it("accepts exactly the alias web and nothing else", () => {
    expect(rendererTierOf(`${FN}:web`)).toBe("web");
    for (const arn of [
      FN,
      `${FN}:$LATEST`,
      `${FN}:admin`,
      `${FN}:Web`,
      `${FN}:web:x`,
      `${FN}:3`,
      "web",
      "",
      undefined,
      null,
      42,
    ]) {
      expect(rendererTierOf(arn), String(arn)).toBeNull();
    }
  });
  it("refuses an invocation of no tier before the event is read and renders nothing", async () => {
    const { inner, stored, logs } = setup();
    for (const tier of [null, undefined, "admin" as never]) {
      expect(await inner({ customerId, invoiceId, locale: "bn", html }, tier as never)).toEqual({
        ok: false,
        reason: "wrong_tier",
      });
    }
    expect(stored.size).toBe(0);
    expect(logs.every((l) => l["reason"] === "wrong_tier")).toBe(true);
  });
});

// WPU-N1: the web tier cannot read the invoices bucket with its own SDK (no new dependency), so on request
// the renderer also RETURNS the bytes (base64, size-limited). The object is still stored for audit.
describe("invoice-renderer handler, returnBytes", () => {
  it("returns the PDF as base64 only when asked, and still stores it", async () => {
    const { handler, stored } = setup();
    const plain = await handler({ customerId, invoiceId, locale: "en", html });
    expect(plain).not.toHaveProperty("pdfBase64");
    const r = await handler({ customerId, invoiceId, locale: "en", html, returnBytes: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const key = `invoices/${customerId}/${invoiceId}.en.pdf`;
    expect(r.pdfBase64).toBe(Buffer.from(stored.get(key) ?? new Uint8Array()).toString("base64"));
    expect(stored.has(key)).toBe(true);
  });
  it("stores but does not return a PDF over the limit", async () => {
    const big = new Uint8Array(MAX_RETURN_BYTES + 1);
    const { handler, stored } = setup({
      pdf: { render: async () => big },
    });
    const r = await handler({ customerId, invoiceId, locale: "en", html, returnBytes: true });
    expect(r).toEqual({
      ok: true,
      key: `invoices/${customerId}/${invoiceId}.en.pdf`,
      bytes: big.byteLength,
    });
    expect(stored.size).toBe(1);
  });
  it("ignores a returnBytes that is not the boolean true", async () => {
    const { handler } = setup();
    const r = await handler({ customerId, invoiceId, locale: "en", html, returnBytes: "yes" });
    expect(r).not.toHaveProperty("pdfBase64");
  });
});
