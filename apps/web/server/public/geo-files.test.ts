import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shellMessages } from "@tc/ui";
import { publicBn } from "../../messages/public-bn.ts";
import { publicEn } from "../../messages/public-en.ts";
import { FAQ_KEYS } from "../../app/[locale]/(public)/help/HelpContent.tsx";
import {
  GEO_FAQ_KEYS,
  GEO_FILES,
  GEO_LICENSE,
  GEO_SITE_URL,
  factsJson,
  geoAttribution,
  geoFile,
  geoPages,
  llmsFullTxt,
  llmsTxt,
} from "./geo.ts";
import { CONTENT_UPDATED } from "./seo.ts";

// WPU-Z16: the GEO files are PHYSICAL files in apps/web/public (OmniRank: a dynamic route at a .txt or
// .json path can answer 403 behind CloudFront). This test writes them with GEO_WRITE=1:
//
//   GEO_WRITE=1 pnpm --filter @tc/web exec vitest run server/public/geo-files.test.ts
//
// and without it fails when a file on disk differs from what the messages give today.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = join(root, "public");
const repoRoot = join(root, "..", "..");

if (process.env.GEO_WRITE === "1") {
  for (const name of GEO_FILES) writeFileSync(join(publicDir, name), geoFile(name), "utf8");
}

const shellEn = shellMessages.en as unknown as {
  Aws: { long: string; trademark: string };
  Shell: { footer: { companyName: string } };
};
const shellBn = shellMessages.bn as unknown as { Aws: { long: string } };

describe("the GEO files on disk (WPU-Z16)", () => {
  it.each(GEO_FILES)("%s is a physical file equal to the output of geo.ts", (name) => {
    const path = join(publicDir, name);
    expect(existsSync(path), `${name}: run GEO_WRITE=1 (see the top of this file)`).toBe(true);
    expect(readFileSync(path, "utf8"), `${name}: run GEO_WRITE=1 to write it again`).toBe(
      geoFile(name),
    );
  });
});

describe("llms.txt", () => {
  const text = llmsTxt();
  it("opens with the brand, the entity statement in both languages and the canonical site", () => {
    expect(text.startsWith("# PanelPay\n")).toBe(true);
    expect(text).toContain(`> ${publicEn.Public.entity.statement}`);
    expect(text).toContain(`> ${publicBn.Public.entity.statement}`);
    expect(text).toContain(`Canonical site: ${GEO_SITE_URL}`);
    expect(text).toContain(`Published by ${shellEn.Shell.footer.companyName}`);
    expect(text).toContain(`Last updated: ${CONTENT_UPDATED}`);
  });

  it("states the AWS long statement of 16.13, both Regions with codes, prices and support", () => {
    expect(text).toContain(shellEn.Aws.long);
    expect(text).toContain("Singapore (ap-southeast-1)");
    expect(text).toContain("Mumbai (ap-south-1)");
    expect(text).toContain(publicEn.Public.common.priceNote);
    expect(text).toContain(publicEn.Public.support.lead);
  });

  // WPU-Y6 (owner, 2026-11-14): the company is PanelPay with its BIN and trade licence, never the old
  // legal name, in every GEO file.
  it("names the company PanelPay with its BIN and trade licence, never the old legal name", () => {
    expect(text).toContain("- Company: PanelPay, ");
    expect(text).toContain(
      "- Identifiers: BIN: 000000000-0000, Trade License: TRAD/DNCC/000000/2000",
    );
    expect(llmsFullTxt()).toContain(
      "Identifiers: BIN: 000000000-0000, Trade License: TRAD/DNCC/000000/2000",
    );
    for (const file of [text, llmsFullTxt(), factsJson()])
      expect(file).not.toMatch(/TiCON System/i);
  });

  // WPU-X19 (owner, 2026-11-15): only the home page is Bengali; every other page is English only.
  it("links every English page and the Bengali home page, and no other Bengali URL", () => {
    for (const page of geoPages("en")) {
      const url = GEO_SITE_URL + (page.path === "/" ? "/en" : `/en${page.path}`);
      expect(text, url).toContain(`](${url}): `);
    }
    expect(geoPages("bn").map((page) => page.path)).toEqual(["/"]);
    expect(text).toContain(`](${GEO_SITE_URL}/): `);
    // Every page URL of the file is the home page or under /en.
    const urls = [...text.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1] as string);
    for (const url of urls) {
      const path = url.slice(GEO_SITE_URL.length);
      expect(path === "/" || path === "/en" || path.startsWith("/en/"), url).toBe(true);
    }
    for (const hidden of ["/dashboard", "/login", "/wallet", "/products/databases", "/api/"]) {
      expect(text, hidden).not.toContain(hidden);
    }
  });

  it("ends with OmniRank's citation licence block", () => {
    expect(text).toContain("## How to cite us");
    expect(text).toContain(
      `Content is licensed ${GEO_LICENSE}. When quoting, attribute to ${geoAttribution()} and link the source URL.`,
    );
    // WPU-Y6 (owner, 2026-11-14): the company is PanelPay; the attribution is the brand alone.
    expect(geoAttribution()).toBe("PanelPay");
  });
});

describe("llms-full.txt", () => {
  const text = llmsFullTxt();
  it("holds every English answer block and FAQ item, and the Bengali home answer only", () => {
    const p = publicEn.Public;
    for (const answer of [
      p.entity.statement,
      p.pricing.answer,
      p.cloudServers.answer,
      p.help.answer,
      p.support.lead,
    ]) {
      expect(text).toContain(answer);
    }
    for (const key of GEO_FAQ_KEYS) {
      expect(text).toContain(`Q: ${p.help.items[key].q}`);
      expect(text).toContain(`A: ${p.help.items[key].a}`);
    }
    // WPU-X19: the Bengali part is the home page; its other texts are not served any more.
    const bn = publicBn.Public;
    expect(text).toContain(bn.entity.statement);
    for (const key of GEO_FAQ_KEYS) expect(text).not.toContain(`Q: ${bn.help.items[key].q}`);
    expect(text).not.toContain(bn.pricing.answer);
    expect(text).toContain(shellBn.Aws.long);
    expect(text).toContain(shellEn.Aws.trademark);
    expect(text).toContain("## How to cite us");
  });

  it("lists the FAQ in the order of the /help page", () => {
    expect([...GEO_FAQ_KEYS]).toEqual([...FAQ_KEYS]);
    expect(GEO_FAQ_KEYS).toEqual(Object.keys(publicEn.Public.help.items));
  });
});

describe("facts.json", () => {
  const facts = JSON.parse(factsJson()) as Record<string, unknown>;
  it("parses, and carries OmniRank's keys with the licence and the attribution", () => {
    expect(facts).toMatchObject({
      name: "PanelPay",
      url: GEO_SITE_URL,
      entityType: "Organization",
      license: GEO_LICENSE,
      attribution: geoAttribution(),
      legalName: "PanelPay",
      identifiers: { bin: "000000000-0000", tradeLicense: "TRAD/DNCC/000000/2000" },
      dateModified: CONTENT_UPDATED,
    });
    expect(facts.sameAs).toBeUndefined();
  });

  it("says what the home answer block and the Organization JSON-LD say", () => {
    expect(facts.description).toEqual({
      bn: publicBn.Public.entity.statement,
      en: publicEn.Public.entity.statement,
    });
    expect(facts.service).toMatchObject({
      regions: [
        { code: "ap-southeast-1", name: "Singapore" },
        { code: "ap-south-1", name: "Mumbai" },
      ],
      priceCurrency: "BDT",
      paymentCurrency: "BDT",
    });
  });
});

describe("omnirank.config.json (WPU-Z16)", () => {
  const config = JSON.parse(readFileSync(join(repoRoot, "omnirank.config.json"), "utf8")) as {
    site: { name: string; url: string; legalName: string };
    geo: { license: string; attribution: string; answerBlockSelector: string };
    audit: { failOn: string[] };
  };
  it("names the same site, licence, attribution and answer-block selector as the site", async () => {
    const { ANSWER_SELECTOR } = await import("./seo.ts");
    expect(config.site.url).toBe(GEO_SITE_URL);
    expect(config.site.name).toBe("PanelPay");
    expect(config.site.legalName).toBe(shellEn.Shell.footer.companyName);
    expect(config.geo.license).toBe(GEO_LICENSE);
    expect(config.geo.attribution).toBe(geoAttribution());
    expect(config.geo.answerBlockSelector).toBe(ANSWER_SELECTOR);
  });

  it("gates the audit on the gates the public pages pass", () => {
    for (const gate of [
      "h1",
      "canonical",
      "schema",
      "llms-txt",
      "llms-full",
      "facts-json",
      "ai-allowlist",
    ]) {
      expect(config.audit.failOn).toContain(gate);
    }
  });
});

describe("IndexNow key file (WPU-Z16)", () => {
  it("is one file at the site root, named by its key and holding only the key", () => {
    const keys = readdirSync(publicDir).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
    expect(keys).toHaveLength(1);
    const key = keys[0]!.slice(0, 32);
    expect(readFileSync(join(publicDir, keys[0]!), "utf8")).toBe(key);
  });
});
