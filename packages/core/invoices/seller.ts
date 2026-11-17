// The seller of a tax invoice (Mushak 6.3): legal name, BIN and address, which the owner enters in the
// admin panel (settings key `invoice_seller`). Pure. Nothing here is invented or defaulted: a row that is
// missing or that does not parse gives null, and an invoice is not issued or printed without it (R16).

export const SELLER_SETTING_KEY = "invoice_seller";

export interface SellerDetails {
  legalNameBn: string;
  legalNameEn: string;
  /** 13 Latin digits. */
  bin: string;
  addressBn: string;
  addressEn: string;
  signatoryName: string;
  signatoryDesignation: string;
  /** VAT circle / commissionerate, optional. */
  vatCircle?: string;
  /** WPU-Y6: the trade licence number, optional, printed as given (e.g. TRAD/DNCC/000000/2000). */
  tradeLicense?: string;
  phone?: string;
  email?: string;
}

const REQUIRED = [
  ["legalNameBn", 200],
  ["legalNameEn", 200],
  ["addressBn", 400],
  ["addressEn", 400],
  ["signatoryName", 120],
  ["signatoryDesignation", 120],
] as const;
const OPTIONAL = [
  ["vatCircle", 200],
  ["tradeLicense", 60],
  ["phone", 20],
  ["email", 120],
] as const;

const BIN = /^[0-9]{13}$/;
const PHONE = /^[+0-9][0-9 ()-]{5,19}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const hasControl = (s: string): boolean =>
  [...s].some((c) => {
    const code = c.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

export function isValidBin(value: unknown): value is string {
  return typeof value === "string" && BIN.test(value);
}

/**
 * WPU-Y6: a BIN as printed: the 13 digits in the NBR grouping of 9 and 4 with a hyphen
 * ("000000000-0000", exactly as the owner gives it). Stored as 13 digits; anything else is unchanged.
 */
export function formatBin(bin: string): string {
  return BIN.test(bin) ? `${bin.slice(0, 9)}-${bin.slice(9)}` : bin;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t === "" || t.length > max || hasControl(t)) return null;
  return t;
}

/** The NAMES of the fields that are missing or malformed (never their values, R14). Empty = complete. */
export function sellerFieldErrors(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["seller"];
  const raw = value as Record<string, unknown>;
  const bad: string[] = [];
  for (const [key, max] of REQUIRED) if (text(raw[key], max) === null) bad.push(key);
  if (!isValidBin(raw["bin"])) bad.push("bin");
  for (const [key, max] of OPTIONAL) {
    const given = raw[key];
    if (given === undefined || given === null || given === "") continue;
    const t = text(given, max);
    if (t === null || (key === "phone" && !PHONE.test(t)) || (key === "email" && !EMAIL.test(t))) {
      bad.push(key);
    }
  }
  return bad;
}

/** The row as the document uses it, or null when anything is missing or malformed (R16). */
export function parseSellerDetails(value: unknown): SellerDetails | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [key, max] of REQUIRED) {
    const t = text(raw[key], max);
    if (t === null) return null;
    out[key] = t;
  }
  if (!isValidBin(raw["bin"])) return null;
  out["bin"] = raw["bin"];
  for (const [key, max] of OPTIONAL) {
    const given = raw[key];
    if (given === undefined || given === null || given === "") continue;
    const t = text(given, max);
    if (t === null) return null;
    if (key === "phone" && !PHONE.test(t)) return null;
    if (key === "email" && !EMAIL.test(t)) return null;
    out[key] = t;
  }
  return out as unknown as SellerDetails;
}

/** Only the known fields, for storing. */
export function sellerValueOf(seller: SellerDetails): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key] of REQUIRED) out[key] = seller[key];
  out["bin"] = seller.bin;
  for (const [key] of OPTIONAL) {
    const v = seller[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}
