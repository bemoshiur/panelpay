import { describe, expect, it } from "vitest";
import {
  formatBin,
  isValidBin,
  parseSellerDetails,
  sellerFieldErrors,
  sellerValueOf,
  SELLER_SETTING_KEY,
} from "./index";

const good = {
  legalNameBn: "উদাহরণ লিমিটেড",
  legalNameEn: "Example Limited",
  bin: "1234567890123",
  addressBn: "ঢাকা",
  addressEn: "Dhaka",
  signatoryName: "A Person",
  signatoryDesignation: "Director",
};

describe("seller details (invoice_seller)", () => {
  it("names the setting", () => expect(SELLER_SETTING_KEY).toBe("invoice_seller"));
  it("accepts a complete row and keeps only the known fields", () => {
    const got = parseSellerDetails({ ...good, extra: "x", vatCircle: " Circle 1 " });
    expect(got).toEqual({ ...good, vatCircle: "Circle 1" });
    expect(sellerValueOf(got!)).not.toHaveProperty("extra");
  });
  // WPU-Y6: the optional trade licence number is kept, and the BIN prints in the grouping 9 and 4.
  it("keeps an optional trade licence and prints the BIN as 000000000-0000", () => {
    const got = parseSellerDetails({ ...good, tradeLicense: " TRAD/DNCC/000000/2000 " });
    expect(got?.tradeLicense).toBe("TRAD/DNCC/000000/2000");
    expect(sellerValueOf(got!)).toHaveProperty("tradeLicense", "TRAD/DNCC/000000/2000");
    expect(parseSellerDetails({ ...good, tradeLicense: "x".repeat(61) })).toBeNull();
    expect(sellerFieldErrors({ ...good, tradeLicense: "x".repeat(61) })).toEqual(["tradeLicense"]);
    expect(formatBin("0000000000000")).toBe("000000000-0000");
    expect(formatBin("bad")).toBe("bad");
  });
  it("BIN is exactly 13 Latin digits", () => {
    expect(isValidBin("1234567890123")).toBe(true);
    for (const bad of [
      "123456789012",
      "12345678901234",
      "12345678901ab",
      "১২৩৪৫৬৭৮৯০১২৩",
      " 1234567890123",
      1234567890123,
    ])
      expect(isValidBin(bad)).toBe(false);
  });
  it("refuses a missing or blank required field (R16)", () => {
    for (const key of Object.keys(good)) {
      expect(parseSellerDetails({ ...good, [key]: "" })).toBeNull();
      expect(parseSellerDetails({ ...good, [key]: "   " })).toBeNull();
      const rest: Record<string, string> = { ...good };
      delete rest[key];
      expect(parseSellerDetails(rest)).toBeNull();
    }
    expect(parseSellerDetails(null)).toBeNull();
    expect(parseSellerDetails("x")).toBeNull();
    expect(parseSellerDetails({ ...good, bin: "12" })).toBeNull();
  });
  it("names the bad fields and nothing else", () => {
    expect(sellerFieldErrors(good)).toEqual([]);
    expect(sellerFieldErrors({ ...good, bin: "1", addressEn: "", email: "x" })).toEqual([
      "addressEn",
      "bin",
      "email",
    ]);
    expect(sellerFieldErrors(null)).toEqual(["seller"]);
  });
  it("refuses control characters and over-long text; optional fields are checked when given", () => {
    expect(parseSellerDetails({ ...good, addressEn: "a\u0000b" })).toBeNull();
    expect(parseSellerDetails({ ...good, legalNameEn: "x".repeat(201) })).toBeNull();
    expect(parseSellerDetails({ ...good, email: "not-an-email" })).toBeNull();
    expect(parseSellerDetails({ ...good, phone: "abc" })).toBeNull();
    expect(
      parseSellerDetails({ ...good, phone: "+8801700000000", email: "a@b.co" }),
    ).not.toBeNull();
  });
});
