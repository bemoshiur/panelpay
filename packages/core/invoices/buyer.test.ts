import { expect, it } from "vitest";
import { buyerSnapshotFrom, parseBuyerSnapshot } from "./buyer";
import { unwrapDigitOneHtml as plain } from "./digit-one";
import { renderInvoiceHtml, type InvoiceDocument } from "./render";

const none = { billingName: null, billingAddress: null, customerBin: null };

it("no billing detail at all gives no snapshot: the invoice prints '-' as before", () => {
  expect(buyerSnapshotFrom(none)).toBeNull();
});

it("a snapshot holds exactly what the profile held, with the BIN as the tax id", () => {
  expect(
    buyerSnapshotFrom({
      billingName: "Rahim & Sons",
      billingAddress: "House 5, Dhaka",
      customerBin: "1234567890123",
    }),
  ).toEqual({
    name: "Rahim & Sons",
    address: "House 5, Dhaka",
    taxId: { kind: "bin", value: "1234567890123" },
  });
  // A profile object that still carries a NID (an old caller) never puts it on the snapshot.
  expect(buyerSnapshotFrom({ ...none, customerNid: "1234567890" } as never)).toBeNull();
  expect(buyerSnapshotFrom({ ...none, billingAddress: "House 5, Dhaka" })).toEqual({
    name: null,
    address: "House 5, Dhaka",
    taxId: null,
  });
});

it("the billing name defaults to the profile name, but only when some billing detail exists", () => {
  expect(buyerSnapshotFrom(none, "Karim Rahman")).toBeNull();
  expect(buyerSnapshotFrom({ ...none, billingAddress: "House 5, Dhaka" }, "Karim Rahman")).toEqual({
    name: "Karim Rahman",
    address: "House 5, Dhaka",
    taxId: null,
  });
  expect(
    buyerSnapshotFrom(
      { ...none, billingName: "Rahim Traders", customerBin: "1234567890123" },
      "Karim",
    ),
  ).toMatchObject({ name: "Rahim Traders" });
});

it("parseBuyerSnapshot reads a stored snapshot and refuses anything malformed (R16)", () => {
  const stored = {
    name: "A B",
    address: "House 5, Dhaka",
    taxId: { kind: "bin", value: "1234567890123" },
  };
  expect(parseBuyerSnapshot(stored)).toEqual(stored);
  expect(parseBuyerSnapshot(null)).toBeNull();
  expect(parseBuyerSnapshot([])).toBeNull();
  expect(parseBuyerSnapshot("x")).toBeNull();
  expect(parseBuyerSnapshot({ ...stored, taxId: { kind: "bin", value: "12" } })).toBeNull();
  expect(
    parseBuyerSnapshot({ ...stored, taxId: { kind: "nid", value: "123456789012" } }),
  ).toBeNull();
  // WPU-D3: a snapshot issued before the NID was removed is still accepted, but the number is never returned.
  const old = parseBuyerSnapshot({ ...stored, taxId: { kind: "nid", value: "1234567890" } });
  expect(old).toEqual({ name: "A B", address: "House 5, Dhaka", taxId: null });
  expect(JSON.stringify(old)).not.toMatch(/1234567890(?!\d)/);
  expect(JSON.stringify(parseBuyerSnapshot({ ...stored, nid: "1990123456" }))).not.toContain(
    "1990123456",
  );
  expect(
    parseBuyerSnapshot({ ...stored, taxId: { kind: "tin", value: "1234567890123" } }),
  ).toBeNull();
  expect(parseBuyerSnapshot({ ...stored, address: 5 })).toBeNull();
  expect(parseBuyerSnapshot({ ...stored, address: "x".repeat(301) })).toBeNull();
  expect(parseBuyerSnapshot({ ...stored, name: "x".repeat(121) })).toBeNull();
  // Keys the snapshot does not define are dropped, not carried onto the invoice.
  expect(parseBuyerSnapshot({ ...stored, email: "a@b.c" })).toEqual(stored);
});

// The render: the Mushak 6.3 buyer block prints the stored address, BIN or NID, escaped (R11).
const seller = {
  legalNameBn: "উদাহরণ সার্ভিসেস লিমিটেড",
  legalNameEn: "Test Seller Ltd",
  bin: "0000000000000",
  addressBn: "ঢাকা",
  addressEn: "Dhaka",
  signatoryName: "A",
  signatoryDesignation: "B",
};
const doc = (customer: InvoiceDocument["customer"]): InvoiceDocument => ({
  kind: "invoice",
  number: "TC-2026-000001",
  issuedAt: new Date("2026-11-12T04:00:00Z"),
  company: { name: "PanelPay", address: [] },
  seller,
  customer,
  lines: [
    { kind: "service", code: "aws", label: { bn: "সেবা", en: "Service" }, amountMinor: "10000" },
  ],
  totalMinor: 10000n,
});

it("renders the buyer address and BIN, in Bengali digits for bn", () => {
  const html = renderInvoiceHtml(
    doc({
      name: "Rahim & Sons",
      address: "House 5, Dhaka",
      taxId: { kind: "bin", value: "1234567890123" },
    }),
    "en",
  );
  expect(html).toContain("Rahim &amp; Sons");
  expect(html).toContain("<strong>Address:</strong> House 5, Dhaka");
  expect(html).toContain("<strong>BIN:</strong> 1234567890123");
  const bn = plain(
    renderInvoiceHtml(
      doc({ name: "রহিম", address: "বাড়ি ৫", taxId: { kind: "bin", value: "1234567890123" } }),
      "bn",
    ),
  );
  expect(bn).toContain("১২৩৪৫৬৭৮৯০১২৩");
});

it("prints the BIN only, never a NID, and '-' for what the customer did not enter", () => {
  const html = renderInvoiceHtml(
    doc({ name: "Rahim", address: null, taxId: { kind: "nid", value: "1234567890" } as never }),
    "en",
  );
  expect(html).not.toContain("1234567890");
  expect(html).not.toContain("NID");
  expect(html).toContain("<strong>BIN:</strong> -");
  expect(html).toContain("<strong>Address:</strong> -");
  const empty = renderInvoiceHtml(doc({ name: "Rahim" }), "en");
  expect(empty).toContain("<strong>Address:</strong> -");
  expect(empty).toContain("<strong>BIN:</strong> -");
});

it("escapes a hostile address and name (R11)", () => {
  const html = renderInvoiceHtml(
    doc({ name: `<img src=x onerror=1>`, address: `"><script>1</script>`, taxId: null }),
    "en",
  );
  expect(html).not.toContain("<script>1");
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;script&gt;");
});
