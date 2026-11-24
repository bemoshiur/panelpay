import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = ["logo.svg", "logo-light.svg", "symbol.svg"] as const;
const SOURCE = new URL("../../design/brand/", import.meta.url);
const WEB = new URL("./public/brand/", import.meta.url);
const ADMIN = new URL("../admin/public/brand/", import.meta.url);

function read(dir: URL, name: string): Buffer {
  return readFileSync(new URL(name, dir));
}

describe("placeholder brand files", () => {
  it("exist in design/brand and are byte-equal in apps/web/public/brand", () => {
    for (const name of FILES) {
      expect(read(WEB, name).equals(read(SOURCE, name)), name).toBe(true);
    }
  });

  // The admin copies are made by Task 8, which removes the condition.
  it.skipIf(!existsSync(ADMIN))("are byte-equal in apps/admin/public/brand", () => {
    for (const name of FILES) {
      expect(read(ADMIN, name).equals(read(SOURCE, name)), name).toBe(true);
    }
  });

  it("are under 4096 bytes, start with <svg and have a viewBox", () => {
    for (const name of FILES) {
      const file = read(SOURCE, name);
      expect(file.length, name).toBeLessThan(4096);
      const text = file.toString("utf8");
      expect(text.startsWith("<svg"), name).toBe(true);
      expect(text, name).toContain("viewBox=");
    }
  });

  // BRAND-2 (owner, 2026-11-24): the brand is PanelPay. The wordmark is plain SVG text with a generic font
  // stack; the symbol is three server panels with a coin (panel + pay), the same in the logo and the icon.
  it("name PanelPay and write it as the wordmark of both logos; the symbol is the panels-and-coin mark", () => {
    for (const name of FILES) {
      const text = read(SOURCE, name).toString("utf8");
      expect(text, name).toContain('aria-label="PanelPay"');
      expect(text, name).toContain("<title>PanelPay</title>");
      expect(text, name).not.toMatch(/Megh|VPS|TryAWS/);
    }
    for (const name of ["logo.svg", "logo-light.svg"]) {
      const text = read(SOURCE, name).toString("utf8");
      const visible = [...text.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)]
        .map((m) => (m[1] as string).replace(/<[^>]+>/g, ""))
        .join("");
      expect(visible, name).toBe("PanelPay");
      expect(text, name).toMatch(/<text\b[^>]*font-family="[^"]*, sans-serif"/);
    }
    expect(read(SOURCE, "symbol.svg").toString("utf8")).toContain(
      '<path d="M15 19h34M15 32h34M15 45h17"',
    );
    expect(read(SOURCE, "symbol.svg").toString("utf8")).toContain(
      '<circle cx="46" cy="45" r="6.8"',
    );
    expect(read(SOURCE, "logo.svg").toString("utf8")).toContain(
      '<path d="M8 17.5h16M8 24.5h16M8 31.5h8"',
    );
    expect(read(SOURCE, "logo.svg").toString("utf8")).toContain(
      '<circle cx="23" cy="31.5" r="3.4"',
    );
  });

  it("hold no script, style, link, external URL or foreignObject", () => {
    for (const name of FILES) {
      // The one namespace declaration an SVG file needs to work in an <img> is the only URL allowed.
      const text = read(SOURCE, name)
        .toString("utf8")
        .replace('xmlns="http://www.w3.org/2000/svg"', "");
      for (const forbidden of [
        "<script",
        "<style",
        "href=",
        "http://",
        "https://",
        "<foreignObject",
      ]) {
        expect(text, `${name} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
