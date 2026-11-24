import { beforeAll, describe, expect, it, vi } from "vitest";
import { publicBn } from "../../../messages/public-bn.ts";
import { publicEn } from "../../../messages/public-en.ts";
import type { PublicCatalog } from "../../../server/public/catalog.ts";
import { LEGAL_DOCS } from "../../../server/public/indexing.ts";
import {
  ANSWER_SELECTOR,
  CONTENT_UPDATED,
  OG_IMAGE,
  pageMetadata,
} from "../../../server/public/seo.ts";
import { ORIGIN, UNAVAILABLE, openCatalog } from "./public.fixtures.ts";
import { renderers } from "./public-states.tsx";
import type { Renderer } from "./public-states.tsx";

// WPU-Z16: the gates of OmniRank v0.4.0 (docs/audit-guide.md) and the AEO points of the owner's
// decision of 2026-11-13, checked on the server HTML of every public page in bn and en: one h1, the
// answer block (40 to 60 words, no list, the first match of the selector), the FAQ as a description
// list that matches its FAQPage JSON-LD, Organization with a stable @id, WebSite and WebPage, the
// dated "last updated" line, and title and description lengths.

vi.mock("./products/[family]/actions.ts", () => ({
  notifyMeAction: async () => ({ status: "idle" }),
}));

let all: Record<string, Renderer>;
beforeAll(async () => {
  const open: PublicCatalog = await openCatalog();
  all = renderers(open, UNAVAILABLE);
});

const LOCALES = ["bn", "en"] as const;
const MESSAGES = { bn: publicBn.Public, en: publicEn.Public as unknown as typeof publicBn.Public };

const decode = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
/** The text of an HTML fragment, as BeautifulSoup's get_text(" ", strip=True) gives it. */
const textOf = (html: string): string =>
  decode(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
/** OmniRank's `words` unit: str.split() of the text. */
const words = (text: string): number => text.split(/\s+/).filter((w) => w !== "").length;

/** The first element whose class list holds `subheading` (OmniRank: soup.select(selector)[0]). */
function answerBlock(page: string): string | null {
  const m = /<(\w+)\b[^>]*class="(?:[^"]*\s)?subheading(?:\s[^"]*)?"[^>]*>([^]*?)<\/\1>/.exec(page);
  return m ? (m[2] as string) : null;
}

function jsonLd(page: string): Record<string, unknown>[] {
  return [...page.matchAll(/<script type="application\/ld\+json"[^>]*>([^<]*)<\/script>/g)].map(
    (m) => JSON.parse(m[1] as string) as Record<string, unknown>,
  );
}

const ANSWERS: Record<string, (locale: "bn" | "en") => string> = {
  "home.data": (l) => MESSAGES[l].entity.statement,
  "help.data": (l) => MESSAGES[l].help.answer,
  "pricing.data": (l) => MESSAGES[l].pricing.answer,
  "cloud.data": (l) => MESSAGES[l].cloudServers.answer,
  "support.data": (l) => MESSAGES[l].support.lead,
};

describe("answer blocks (AEO, OmniRank gate answer-block)", () => {
  it("the selector is the mockup's hero subtitle class", () => {
    expect(ANSWER_SELECTOR).toBe(".subheading");
  });

  it.each(Object.keys(ANSWERS))(
    "%s: the first .subheading is the answer, 40 to 60 words, no list",
    (id) => {
      for (const locale of LOCALES) {
        const page = all[id]!(locale);
        const block = answerBlock(page);
        expect(block, `${id} ${locale}`).not.toBeNull();
        expect(block, `${id} ${locale}`).not.toMatch(/<(?:ul|ol|li)\b/);
        const text = textOf(block!);
        expect(text).toBe(ANSWERS[id]!(locale));
        const n = words(text);
        expect(n, `${id} ${locale}: ${n} words`).toBeGreaterThanOrEqual(40);
        expect(n, `${id} ${locale}: ${n} words`).toBeLessThanOrEqual(60);
        // Near the top: before the first h2 of the page's own content.
        // WPU-X18 round 2 (owner): the home page keeps only a heading and one sentence at the top, so its
        // answer block sits in the trust line, after the services and the chooser (still inside <main>).
        const main = /<main[\s>][^]*<\/main>/.exec(page)![0];
        if (id !== "home.data") {
          expect(main.indexOf("subheading")).toBeLessThan(main.search(/<h2[\s>]/));
        } else {
          expect(main.indexOf('class="subheading')).toBeGreaterThan(main.search(/<h2[\s>]/));
        }
      }
    },
  );

  it("the entity statement names what, for whom, where and how it is billed, in both languages", () => {
    const en = MESSAGES.en.entity.statement;
    for (const part of [
      "PanelPay",
      "Bangladesh",
      "Amazon Lightsail",
      "Singapore",
      "Mumbai",
      "BDT",
      "taka",
      "EPS",
    ]) {
      expect(en).toContain(part);
    }
    const bn = MESSAGES.bn.entity.statement;
    for (const part of [
      "PanelPay",
      "বাংলাদেশ",
      "Amazon Lightsail",
      "Singapore",
      "Mumbai",
      "BDT",
      "টাকা",
      "EPS",
    ]) {
      expect(bn).toContain(part);
    }
  });
});

describe("FAQ (OmniRank gate faq, FAQPage JSON-LD)", () => {
  it.each(["help.data", "cloud.data"])(
    "%s: a description list that matches its FAQPage block, in order",
    (id) => {
      for (const locale of LOCALES) {
        const page = all[id]!(locale);
        const dts = [...page.matchAll(/<dt\b[^>]*>([^]*?)<\/dt>/g)].map((m) =>
          textOf(m[1] as string),
        );
        const dds = [...page.matchAll(/<dd\b[^>]*>([^]*?)<\/dd>/g)].map((m) =>
          textOf(m[1] as string),
        );
        expect(dts.length, `${id} ${locale}`).toBeGreaterThanOrEqual(3);
        expect(dds).toHaveLength(dts.length);
        const faq = jsonLd(page).find((b) => b["@type"] === "FAQPage") as {
          mainEntity: { name: string; acceptedAnswer: { text: string } }[];
        };
        expect(faq.mainEntity.map((q) => q.name)).toEqual(dts);
        expect(faq.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(dds);
        // No answer hidden until a script runs (Ansvisor "main text without JavaScript").
        expect(page).not.toMatch(/<dd\b[^>]*\shidden/);
      }
    },
  );

  it("answers the questions people ask AI assistants: taka, VAT invoice, Regions, KYC, support, refunds", () => {
    for (const locale of LOCALES) {
      const items = MESSAGES[locale].help.items;
      for (const key of [
        "payment",
        "bdt",
        "vatInvoice",
        "locations",
        "identity",
        "support",
        "refunds",
      ] as const) {
        expect(items[key].q.length, `${locale} ${key}`).toBeGreaterThan(0);
        expect(items[key].a.length, `${locale} ${key}`).toBeGreaterThan(0);
      }
    }
    expect(MESSAGES.en.help.items.vatInvoice.a).toContain("Mushak-6.3");
    // WPU-X26 (owner, 2026-11-15): "VAT is VAT": no country and no rate in the tax answer.
    expect(MESSAGES.en.help.items.vatInvoice.a).toContain(
      "includes VAT and the other taxes and fees that apply",
    );
    expect(MESSAGES.bn.help.items.vatInvoice.a).toContain(
      "VAT এবং প্রযোজ্য অন্যান্য কর ও ফি অন্তর্ভুক্ত",
    );
    expect(MESSAGES.en.help.items.vatInvoice.a).not.toContain("Prices include VAT of 5%");
    expect(MESSAGES.bn.help.items.vatInvoice.a).toContain("মূসক-৬.৩");
  });
});

describe("structured data (OmniRank gates schema, schema-required, speakable)", () => {
  const PAGES = [
    "home.data",
    "help.data",
    "pricing.data",
    "cloud.data",
    "support.data",
    "legal.terms",
    "family.open",
  ];

  it.each(PAGES)(
    "%s: Organization with a stable @id, WebSite and WebPage that refer to it",
    (id) => {
      for (const locale of LOCALES) {
        const blocks = jsonLd(all[id]!(locale));
        for (const block of blocks) {
          expect(block["@context"]).toBe("https://schema.org");
          expect(typeof block["@type"]).toBe("string");
        }
        const org = blocks.find((b) => b["@type"] === "Organization")!;
        expect(org).toMatchObject({
          "@id": `${ORIGIN}/#organization`,
          name: "PanelPay",
          url: `${ORIGIN}/`,
          // WPU-Y6 (owner, 2026-11-14): the company is PanelPay, with its BIN and trade licence.
          legalName: "PanelPay",
          description: MESSAGES[locale].entity.statement,
          identifier: [
            { "@type": "PropertyValue", propertyID: "BIN", value: "000000000-0000" },
            {
              "@type": "PropertyValue",
              propertyID: "Trade License",
              value: "TRAD/DNCC/000000/2000",
            },
          ],
        });
        expect(org.sameAs).toBeUndefined();
        const site = blocks.find((b) => b["@type"] === "WebSite")!;
        expect(site).toMatchObject({
          "@id": `${ORIGIN}/#website`,
          publisher: { "@id": `${ORIGIN}/#organization` },
        });
        const webPage = blocks.find((b) => b["@type"] === "WebPage")!;
        expect(webPage).toMatchObject({
          // WPU-X19: only the home page is served in bn; every other page is English.
          inLanguage: id === "home.data" ? locale : "en",
          dateModified: CONTENT_UPDATED,
          isPartOf: { "@id": `${ORIGIN}/#website` },
          about: { "@id": `${ORIGIN}/#organization` },
        });
        expect(String(webPage["@id"])).toBe(`${String(webPage.url)}#webpage`);
      }
    },
  );

  it("speakable points at the answer block only on pages that have one", () => {
    for (const id of PAGES) {
      const page = all[id]!("en");
      const webPage = jsonLd(page).find((b) => b["@type"] === "WebPage")!;
      const has = answerBlock(page) !== null;
      if (has)
        expect(webPage.speakable).toEqual({
          "@type": "SpeakableSpecification",
          cssSelector: [ANSWER_SELECTOR],
        });
      else expect(webPage.speakable, id).toBeUndefined();
    }
  });
});

describe("dated pages (Ansvisor freshness)", () => {
  it("every public page says when it was last updated, with a machine-readable date", () => {
    for (const [id, render] of Object.entries(all)) {
      for (const locale of LOCALES) {
        const page = render(locale);
        // React writes the attribute as `dateTime`; HTML attribute names are case-insensitive.
        expect(page.toLowerCase(), `${id} ${locale}`).toContain(
          `<time datetime="${CONTENT_UPDATED}">`,
        );
      }
    }
    expect(all["home.data"]!("en")).toContain("Last updated: <time");
    // WPU-X27: the date shown is the one source constant CONTENT_UPDATED, formatted, never a literal.
    const shown = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Dhaka",
    }).format(new Date(`${CONTENT_UPDATED}T12:00:00+06:00`));
    expect(all["home.data"]!("en")).toContain(shown);
    expect(all["home.data"]!("bn")).toContain("সর্বশেষ হালনাগাদ: <time");
    expect(all["home.data"]!("bn")).toContain("২০২৬");
  });
});

describe("one source for the last updated date (WPU-X27)", () => {
  it("CONTENT_UPDATED is the only place that writes the date; no message or component holds a literal", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..", "..", "..");
    const files = [
      "messages/public-en.ts",
      "messages/public-bn.ts",
      "app/[locale]/(public)/_components/PublicFrame.tsx",
      "server/public/geo.ts",
    ];
    for (const f of files) {
      const text = readFileSync(join(root, f), "utf8");
      const code = text
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(code, f).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
      expect(code, f).not.toMatch(
        /(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d/,
      );
    }
    const dir = join(root, "server/public");
    const defs = readdirSync(dir)
      .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
      .filter((n) => /export const CONTENT_UPDATED\b/.test(readFileSync(join(dir, n), "utf8")));
    expect(defs).toEqual(["seo.ts"]);
  });

  it("the date is the day the public pages last changed", () => {
    expect(CONTENT_UPDATED).toBe("2026-11-15");
  });
});

describe("metadata lengths (OmniRank gates title-length, description-length, og)", () => {
  const metas = (locale: "bn" | "en") => {
    const m = MESSAGES[locale];
    const out: { title: string; description: string }[] = [
      m.meta.home,
      m.meta.pricing,
      m.meta.cloudServers,
      m.meta.help,
      m.meta.support,
    ];
    for (const doc of LEGAL_DOCS) {
      const title = m.legal.docs[doc].title;
      out.push({ title, description: m.meta.legal.descriptionOf.replace("{title}", title) });
    }
    return out;
  };

  it("every title is at most 60 characters and every description at most 160, all distinct", () => {
    for (const locale of LOCALES) {
      const list = metas(locale);
      for (const { title, description } of list) {
        expect(title.length, title).toBeLessThanOrEqual(60);
        expect(description.length, description).toBeLessThanOrEqual(160);
      }
      expect(new Set(list.map((x) => x.title)).size).toBe(list.length);
      expect(new Set(list.map((x) => x.description)).size).toBe(list.length);
    }
  });

  it("gives every page og:title and an og:image of 1200 x 630 on the site's own origin", () => {
    const meta = pageMetadata({
      origin: ORIGIN,
      locale: "en",
      path: "/help",
      title: "t",
      description: "d",
    });
    const og = meta.openGraph as {
      title: string;
      images: { url: string; width: number; height: number }[];
    };
    expect(og.title).toBe("t");
    expect(og.images).toEqual([
      { url: `${ORIGIN}${OG_IMAGE.path}`, width: 1200, height: 630, alt: "PanelPay" },
    ]);
  });
});
