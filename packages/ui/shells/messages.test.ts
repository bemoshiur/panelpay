import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { forbiddenWording, messageKeys, missingKeys } from "./message-checks.ts";
import { shellMessages } from "./messages/index.ts";
import type { Messages } from "../runtime/index.ts";
import type { AdminNavId, AppNavId } from "./types.ts";

const specPath = fileURLToPath(
  new URL("../../../docs/spec/16/16.13-states-wording-and-formats.md", import.meta.url),
);

function leaf(tree: Messages, dotted: string): string {
  let node: string | Messages = tree;
  for (const part of dotted.split(".")) {
    if (typeof node === "string") throw new Error(`not a branch before ${dotted}`);
    const next: string | Messages | undefined = node[part];
    if (next === undefined) throw new Error(`missing key ${dotted}`);
    node = next;
  }
  if (typeof node !== "string") throw new Error(`${dotted} is not a leaf`);
  return node;
}

function specRow(markdown: string, label: string): { en: string; bn: string } {
  const line = markdown.split("\n").find((l) => l.startsWith(`| ${label} |`));
  if (line === undefined) throw new Error(`row not found in 16.13: ${label}`);
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  const [, en, bn] = cells;
  if (en === undefined || bn === undefined) throw new Error(`row has no two statements: ${label}`);
  // WPU-B1, WPU-Z8: docs/spec/16.13 still names the old brand (the plan is edited in its own pull request);
  // the statements are compared with the brand of the product, PanelPay (owner decision 2026-11-13).
  const brand = (text: string): string => text.replace(/TiCON\s+Cloud/g, "PanelPay");
  return { en: brand(en), bn: brand(bn) };
}

describe("shellMessages", () => {
  const { bn, en } = shellMessages;

  it("bn and en have the same keys", () => {
    expect(missingKeys(bn, en)).toEqual([]);
    expect(missingKeys(en, bn)).toEqual([]);
    expect(messageKeys(bn).length).toBeGreaterThan(60);
  });

  it("every leaf is a non-empty string", () => {
    for (const tree of [bn, en]) {
      for (const key of messageKeys(tree)) {
        expect(leaf(tree, key).trim().length, key).toBeGreaterThan(0);
      }
    }
  });

  it("Aws.short, Aws.long and Aws.trademark equal the strings of 16.13 in both locales", () => {
    const markdown = readFileSync(specPath, "utf8");
    const short = specRow(markdown, "Short statement: hero, footers, emails");
    const long = specRow(markdown, "Long statement: landing page, product pages, FAQ");
    const trademark = specRow(markdown, "Trademark line: footers of pages and emails");
    expect(short.en.length).toBeGreaterThan(20);
    expect(long.bn.length).toBeGreaterThan(100);
    expect(leaf(en, "Aws.short")).toBe(short.en);
    expect(leaf(bn, "Aws.short")).toBe(short.bn);
    expect(leaf(en, "Aws.long")).toBe(long.en);
    expect(leaf(bn, "Aws.long")).toBe(long.bn);
    expect(trademark.bn).toBe("The same line in English");
    expect(leaf(en, "Aws.trademark")).toBe(trademark.en);
    expect(leaf(bn, "Aws.trademark")).toBe(trademark.en);
  });

  it("has no forbidden wording in any shell message", () => {
    expect(forbiddenWording(bn)).toEqual([]);
    expect(forbiddenWording(en)).toEqual([]);
  });

  it("the nav keys cover every AppNavId and AdminNavId", () => {
    const appIds: AppNavId[] = [
      "dashboard",
      "cloudServers",
      "databases",
      "objectStorage",
      "loadBalancers",
      "containers",
      "cdn",
      "domains",
      "wallet",
      "invoices",
      "support",
      "settings",
    ];
    const adminIds: AdminNavId[] = [
      "today",
      "customers",
      "payments",
      "pricing",
      "catalog",
      "capacity",
      "operations",
      "support",
      "abuse",
      "reconciliation",
      "audit",
      "admins",
    ];
    for (const tree of [bn, en]) {
      for (const id of appIds) expect(leaf(tree, `Shell.nav.${id}`).length).toBeGreaterThan(0);
      for (const id of adminIds) {
        expect(leaf(tree, `Shell.admin.nav.${id}`).length).toBeGreaterThan(0);
      }
      for (const role of ["superadmin", "ops", "finance", "support"]) {
        expect(leaf(tree, `Shell.admin.roles.${role}`).length).toBeGreaterThan(0);
      }
    }
  });

  it("bn is not a copy of en for Shell.nav.dashboard", () => {
    expect(leaf(bn, "Shell.nav.dashboard")).not.toBe(leaf(en, "Shell.nav.dashboard"));
  });

  // WPU-Y6 (owner, 2026-11-14): the company is PanelPay, never the old legal name, with the BIN and
  // the trade licence written exactly as the owner gave them. A deliberate deviation from 16.14 of the spec.
  it("names the company PanelPay with its BIN and trade licence, the same in both locales", () => {
    for (const key of ["address", "companyName", "bin", "tradeLicense"]) {
      expect(leaf(bn, `Shell.footer.${key}`)).toBe(leaf(en, `Shell.footer.${key}`));
    }
    expect(leaf(en, "Shell.footer.companyName")).toBe("PanelPay");
    expect(leaf(en, "Shell.footer.bin")).toBe("BIN: 000000000-0000");
    expect(leaf(en, "Shell.footer.tradeLicense")).toBe("Trade License: TRAD/DNCC/000000/2000");
    for (const tree of [bn, en]) expect(JSON.stringify(tree)).not.toMatch(/TiCON System/i);
  });

  // WPU-Z8: the brand is PanelPay (owner decision 2026-11-13), in Latin letters in both locales.
  it("names the brand PanelPay in the header, the logo text and the home link", () => {
    for (const tree of [bn, en]) {
      expect(leaf(tree, "Shell.brand")).toBe("PanelPay");
      expect(leaf(tree, "Shell.logoAlt")).toBe("PanelPay");
    }
    expect(leaf(bn, "Shell.homeLabel")).toBe("PanelPay হোম");
    expect(leaf(en, "Shell.homeLabel")).toBe("PanelPay home");
  });

  // WPU-Z8: the footer link carries the title of the page it opens (apps/web: Public.legal.docs.terms.title).
  it("calls the terms link of the footer 'Terms of service'", () => {
    expect(leaf(en, "Shell.footer.terms")).toBe("Terms of service");
    expect(leaf(bn, "Shell.footer.terms")).toBe("সেবার শর্তাবলি");
  });
});
