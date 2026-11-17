import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unwrapDigitOneHtml } from "@tc/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WPU-G4: the printable invoice. Cross-tenant proof for the route (R8), the headers, the fail-closed
// answers (R16).

// WPU-I2: the seller is read from the invoice (the snapshot of the day of issue), never from the
// settings. `state.seller` keeps its shape and is turned into the stored value here.
const snapshotOf = vi.hoisted(() => (stored: unknown): unknown => {
  const s = stored as { state: string; seller?: unknown; version?: number };
  if (s.state === "ok") return { v: 1, version: s.version ?? 1, ...(s.seller as object) };
  if (s.state === "invalid") return { v: 1 };
  return null;
});

const state = vi.hoisted(() => ({
  rows: [] as {
    id: string;
    customerId: string;
    lines: unknown;
    totalMinor: bigint;
    seller?: unknown;
    buyer?: unknown;
  }[],
  seller: { state: "none" } as unknown,
}));
vi.mock("@tc/db", async () => ({
  parseSellerRowValue: (await vi.importActual<typeof import("@tc/db")>("@tc/db"))
    .parseSellerRowValue,
  withTx: async (fn: (tx: unknown) => unknown) => fn({}),
  customerRepos: (_tx: unknown, customerId: string) => ({
    profile: { get: async () => ({ id: customerId, market: "BD", name: "Rahim" }) },
    invoices: {
      get: async (id: string) => {
        const found = state.rows.find((r) => r.id === id && r.customerId === customerId);
        return found === undefined
          ? null
          : {
              seller: (found as { seller?: unknown }).seller ?? snapshotOf(state.seller),
              ...found,
              fiscalYear: 2026,
              number: 12,
              orderId: null,
              issuedAt: new Date("2026-11-01T06:00:00Z"),
              pdfKey: null,
            };
      },
    },
  }),
}));

const {
  INVOICE_DOCUMENT_HEADERS,
  INVOICE_DOCUMENT_RATE_LIMITS,
  invoiceDocument,
  printableInvoice,
} = await import("./invoice-document.ts");

const A = "0190aaaa-0000-7000-8000-0000000000c1";
const B = "0190aaaa-0000-7000-8000-0000000000c2";
const INV = "0190aaaa-0000-7000-8000-0000000000e1";
const LINES = [
  {
    kind: "service",
    code: "aws",
    label: { bn: "এডব্লিউএস", en: "AWS service" },
    amountMinor: "60000",
  },
  { kind: "step", code: "vat", label: { bn: "ভ্যাট", en: "VAT <b>" }, amountMinor: "9000" },
];
const SELLER = {
  legalNameBn: "বিক্রেতা লিমিটেড",
  legalNameEn: "Seller <Ltd>",
  bin: "1234567890123",
  addressBn: "ঢাকা",
  addressEn: "Dhaka",
  signatoryName: "Karim",
  signatoryDesignation: "Director",
};
beforeEach(() => {
  state.seller = { state: "ok", seller: SELLER, version: 1 };
});
const deps = (customerId: string | null, name = "Rahim") => ({
  session: customerId === null ? null : ({ customerId } as never),
  customerName: async () => name,
});

describe("the printable invoice", () => {
  it("answers 401 without a session and reads nothing (R9)", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    expect(await invoiceDocument(deps(null), "en", INV)).toEqual({ status: 401 });
  });

  it("prints the invoice of the session's customer: number, lines, total, escaped text", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    const out = await invoiceDocument(deps(A, "Rahim <script>"), "en", INV);
    expect(out.status).toBe(200);
    const html = out.html as string;
    expect(html).toContain("TC-2026-000012");
    expect(html).toContain("690.00");
    expect(html).toContain("AWS service");
    expect(html).toContain("VAT &lt;b&gt;");
    expect(html).toContain("Rahim &lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(html).toContain("100% AWS infrastructure");
  });

  it("is in Bengali with Bengali digits in bn", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    const out = await invoiceDocument(deps(A), "bn", INV);
    expect(out.html).toContain("৬৯০.০০");
    expect(out.html).toContain("কর চালানপত্র");
  });

  it("is the Mushak 6.3 tax invoice with the seller's legal name, BIN and address (WPU-I1)", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    const en = await invoiceDocument(deps(A), "en", INV);
    const html = en.html as string;
    expect(html).toContain("Mushak-6.3");
    expect(html).toContain("Seller &lt;Ltd&gt;");
    // WPU-Y6: the seller BIN prints in the grouping 9 and 4 ("000000000-0000" form).
    expect(html).toContain("123456789-0123");
    expect(html).toContain("Dhaka");
    expect(html).toContain("Karim");
    expect(html).toContain("Rahim");
    // the buyer has no address, BIN or NID on file: a dash, nothing invented
    expect(html).toMatch(/Address:<\/strong> -</);
    const bn = (await invoiceDocument(deps(A), "bn", INV)).html as string;
    expect(bn).toContain("বিক্রেতা লিমিটেড");
    expect(unwrapDigitOneHtml(bn)).toContain("১২৩৪৫৬৭৮৯-০১২৩");
  });

  it("WPU-I2: a reprint shows the seller of the day of issue, not the current setting", async () => {
    const issuedUnder = {
      v: 1,
      version: 1,
      ...SELLER,
      legalNameEn: "Old Name Ltd",
      addressEn: "Old Road",
    };
    state.rows = [
      { id: INV, customerId: A, lines: LINES, totalMinor: 69000n, seller: issuedUnder },
    ];
    // The owner changes the seller after the issue.
    state.seller = {
      state: "ok",
      seller: { ...SELLER, legalNameEn: "New Name Ltd", addressEn: "New Road" },
      version: 2,
    };
    const html = (await invoiceDocument(deps(A), "en", INV)).html as string;
    expect(html).toContain("Old Name Ltd");
    expect(html).toContain("Old Road");
    expect(html).not.toContain("New Name Ltd");
    expect(html).not.toContain("New Road");
  });

  it("prints the buyer's address and BIN from the snapshot stored on the invoice, escaped (WPU-I3)", async () => {
    state.rows = [
      {
        id: INV,
        customerId: A,
        lines: LINES,
        totalMinor: 69000n,
        buyer: {
          name: "Rahim & <Sons>",
          address: "House 5, Road 3, Dhaka",
          taxId: { kind: "bin", value: "1234567890123" },
        },
      },
    ];
    const html = (await invoiceDocument(deps(A, "Profile Name"), "en", INV)).html as string;
    expect(html).toContain("Rahim &amp; &lt;Sons&gt;");
    expect(html).not.toContain("Profile Name");
    expect(html).toContain("<strong>Address:</strong> House 5, Road 3, Dhaka");
    expect(html).toContain("<strong>BIN:</strong> 1234567890123");
    const bn = (await invoiceDocument(deps(A), "bn", INV)).html as string;
    expect(unwrapDigitOneHtml(bn)).toContain("১২৩৪৫৬৭৮৯০১২৩");
    // WPU-D3: a snapshot issued before the NID was removed still prints, without the number
    state.rows[0]!.buyer = {
      name: null,
      address: null,
      taxId: { kind: "nid", value: "1234567890" },
    };
    const nid = (await invoiceDocument(deps(A, "Karim"), "en", INV)).html as string;
    expect(nid).not.toMatch(/1234567890(?!\d)/);
    expect(nid).not.toContain("NID");
    expect(nid).toContain("<strong>BIN:</strong> -");
    expect(nid).toContain("Karim");
  });

  it("WPU-I4: a reprint shows both snapshots of the day of issue, whatever the seller setting and the profile say now", async () => {
    state.rows = [
      {
        id: INV,
        customerId: A,
        lines: LINES,
        totalMinor: 69000n,
        seller: { v: 1, version: 1, ...SELLER, legalNameEn: "Old Name Ltd" },
        buyer: {
          name: "Rahim Traders",
          address: "House 5, Road 3, Dhaka",
          taxId: { kind: "bin", value: "1234567890123" },
        },
      },
    ];
    state.seller = {
      state: "ok",
      seller: { ...SELLER, legalNameEn: "New Name Ltd" },
      version: 2,
    };
    const first = (await invoiceDocument(deps(A, "Renamed Profile"), "en", INV)).html as string;
    const second = (await invoiceDocument(deps(A, "Renamed Again"), "en", INV)).html as string;
    for (const html of [first, second]) {
      expect(html).toContain("Old Name Ltd");
      expect(html).not.toContain("New Name Ltd");
      expect(html).toContain("Rahim Traders");
      expect(html).toContain("House 5, Road 3, Dhaka");
      expect(html).toContain("<strong>BIN:</strong> 1234567890123");
      expect(html).not.toContain("Renamed");
    }
  });

  it("an invoice with no snapshot, or a snapshot that does not parse, prints '-' (R16)", async () => {
    for (const buyer of [
      undefined,
      null,
      "x",
      { name: 1 },
      { taxId: { kind: "bin", value: "12" } },
    ]) {
      state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n, buyer }];
      const html = (await invoiceDocument(deps(A), "en", INV)).html as string;
      expect(html, JSON.stringify(buyer)).toMatch(/Address:<\/strong> -</);
      expect(html).toMatch(/BIN:<\/strong> -</);
    }
  });

  it("answers 503 and prints nothing when the seller details are missing or unreadable (R16)", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    for (const stored of [{ state: "none" }, { state: "invalid" }]) {
      state.seller = stored;
      expect(await invoiceDocument(deps(A), "en", INV)).toEqual({ status: 503 });
    }
    // another customer's invoice is still a 404 (R8), not a hint that a seller is missing
    expect(await invoiceDocument(deps(B), "en", INV)).toEqual({ status: 404 });
  });

  it("answers 404 for another customer's invoice, like for a missing one (R8)", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    expect(await invoiceDocument(deps(B), "en", INV)).toEqual({ status: 404 });
    expect(await invoiceDocument(deps(A), "en", "0190aaaa-0000-7000-8000-0000000000ff")).toEqual({
      status: 404,
    });
    expect(await invoiceDocument(deps(A), "en", "../../x")).toEqual({ status: 404 });
  });

  it("refuses lines that do not add up instead of printing a wrong total (R16)", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 70000n }];
    expect(await invoiceDocument(deps(A), "en", INV)).toEqual({ status: 500 });
  });

  it("fails closed when the name cannot be read", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    const out = await invoiceDocument(
      {
        session: { customerId: A } as never,
        customerName: async () => {
          throw new Error("db down arn:aws:rds:x");
        },
      },
      "en",
      INV,
    );
    expect(out).toEqual({ status: 500 });
  });

  it("carries a CSP that allows nothing but its inline CSS, and is never cached", () => {
    const csp = INVOICE_DOCUMENT_HEADERS["Content-Security-Policy"] as string;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).not.toMatch(/script-src|https?:/);
    expect(INVOICE_DOCUMENT_HEADERS["Cache-Control"]).toBe("private, no-store");
    expect(INVOICE_DOCUMENT_HEADERS["X-Robots-Tag"]).toContain("noindex");
  });
});

// Item 3 of security review 2 (R9): the printable invoice route has a rate limit, like the PDF route.
describe("the printable invoice route (rate limit, R9)", () => {
  const limited = (customerId: string | null, allowed: boolean | "throws") => {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        ...deps(customerId),
        rateLimit: async () => {
          calls.push("limit");
          if (allowed === "throws") throw new Error("db down");
          return { allowed };
        },
      },
    };
  };

  it("limits to 60 a minute for each customer under the action invoice.document", () => {
    expect(INVOICE_DOCUMENT_RATE_LIMITS).toEqual([
      { action: "invoice.document", limit: 60, windowSeconds: 60 },
    ]);
  });

  it("order: 401 before the limiter, 404 for a malformed id before the limiter, then the limiter, then the read", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    const anon = limited(null, true);
    expect(await printableInvoice(anon.deps, "en", INV)).toEqual({ status: 401 });
    expect(anon.calls).toEqual([]);
    const bad = limited(A, true);
    expect(await printableInvoice(bad.deps, "en", "../../x")).toEqual({ status: 404 });
    expect(bad.calls).toEqual([]);
    const ok = limited(A, true);
    expect((await printableInvoice(ok.deps, "en", INV)).status).toBe(200);
    expect(ok.calls).toEqual(["limit"]);
  });

  it("answers 429 over the limit and reads and prints nothing", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    const over = limited(A, false);
    expect(await printableInvoice(over.deps, "en", INV)).toEqual({ status: 429 });
  });

  it("fails closed with 503 when the limiter cannot answer (R16)", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    expect(await printableInvoice(limited(A, "throws").deps, "en", INV)).toEqual({ status: 503 });
  });

  it("keeps the cross-tenant answer: another customer's invoice is a 404 after the limiter (R8)", async () => {
    state.rows = [{ id: INV, customerId: A, lines: LINES, totalMinor: 69000n }];
    expect(await printableInvoice(limited(B, true).deps, "en", INV)).toEqual({ status: 404 });
  });

  it("the route calls printableInvoice with the rate limit of the session's customer, not the bare invoiceDocument", () => {
    const route = readFileSync(
      join(
        __dirname,
        "..",
        "app",
        "[locale]",
        "(panel)",
        "invoices",
        "[id]",
        "document",
        "route.ts",
      ),
      "utf8",
    );
    expect(route).toContain("printableInvoice(");
    expect(route).not.toMatch(/\binvoiceDocument\(/);
    expect(route).toContain("INVOICE_DOCUMENT_RATE_LIMITS");
    expect(route).toMatch(/customerRepos\(tx, s\.customerId\)\.rateLimits\.consume/);
  });
});
