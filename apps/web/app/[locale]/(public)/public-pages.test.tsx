import { customerUsd, quote, usdToBdtMinor } from "@tc/core";
import { formatMoney } from "@tc/ui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Locale } from "@tc/ui/runtime";
import { webMessages } from "../../../i18n/messages.ts";
import { publicBn } from "../../../messages/public-bn.ts";
import { publicEn } from "../../../messages/public-en.ts";
import type { PublicCatalog } from "../../../server/public/catalog.ts";
import { HONEYPOT_FIELD } from "../../../server/public/support-form-fields.ts";
import {
  FIXTURE_FX,
  FIXTURE_ROWS,
  FIXTURE_RULE,
  NONCE,
  UNAVAILABLE,
  openCatalog,
} from "./public.fixtures.ts";
import { renderers } from "./public-states.tsx";
import type { Renderer } from "./public-states.tsx";

// The server action is replaced: the page only needs a function to post to.
vi.mock("./products/[family]/actions.ts", () => ({
  notifyMeAction: async () => ({ status: "idle" }),
}));

const SHORT = {
  bn: "১০০% AWS অবকাঠামো। Amazon Lightsail দিয়ে তৈরি।",
  en: "100% AWS infrastructure. Built on Amazon Lightsail.",
};
const TRADEMARK =
  "Amazon Web Services, AWS, Amazon Lightsail and Amazon Route 53 are trademarks of Amazon.com, Inc. or its affiliates.";
const LONG_EN =
  "Every server, database and storage resource you buy here is an Amazon Lightsail resource running in an AWS Region (Singapore or Mumbai).";

// The escaping of React's static markup: text is compared as it appears in the HTML.
const escape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

/** The `<main>` of a page: its own content, without the menu and the footer of the shell. */
const mainOf = (page: string): string => /<main[\s>][^]*<\/main>/.exec(page)?.[0] ?? "";
/** A string leaf of the composed messages of a locale, such as `Shell.footer.address`. */
const leaf = (locale: Locale, key: string): string =>
  String(
    key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part],
        webMessages[locale],
      ),
  );

let all: Record<string, Renderer>;
let open: PublicCatalog;
beforeAll(async () => {
  open = await openCatalog();
  all = renderers(open, UNAVAILABLE);
});

const LOCALES = ["bn", "en"] as const;
const count = (html: string, pattern: RegExp): number => (html.match(pattern) ?? []).length;

describe("every public page, in bn and en (U1, U4, U6, U11, 16.8)", () => {
  it("has the landmarks, exactly one h1, the AWS short statement and the trademark line", () => {
    for (const [id, render] of Object.entries(all)) {
      for (const locale of LOCALES) {
        const page = render(locale);
        const where = `${id} ${locale}`;
        expect(count(page, /<h1[\s>]/g), `${where}: one h1`).toBe(1);
        expect(count(page, /<main[\s>]/g), `${where}: one main`).toBe(1);
        expect(page, where).toContain("<header");
        expect(page, where).toContain("<nav");
        expect(page, where).toContain("<footer");
        expect(page, where).toContain(escape(SHORT[locale]));
        expect(page, `${where}: trademark line`).toContain(TRADEMARK);
        expect(page, `${where}: skip link`).toContain('href="#main"');
      }
    }
  });

  it("has no inline style, no event handler attribute and no image without alt text (U4, a11y)", () => {
    for (const [id, render] of Object.entries(all)) {
      for (const locale of LOCALES) {
        const page = render(locale);
        expect(page, `${id} ${locale}`).not.toMatch(/\sstyle="/);
        expect(page, `${id} ${locale}`).not.toMatch(/\son[a-z]+="/);
        for (const img of page.match(/<img\b[^>]*>/g) ?? []) {
          expect(img, `${id} ${locale}`).toMatch(/\balt="/);
          // A size on every image: no layout shift when it loads (Lighthouse CLS).
          expect(img, `${id} ${locale}`).toMatch(/\bwidth="\d+"/);
          expect(img, `${id} ${locale}`).toMatch(/\bheight="\d+"/);
        }
        // Text a visitor reads is real text, and a link has a name.
        for (const a of page.match(/<a\b[^>]*>[^]*?<\/a>/g) ?? []) {
          const named = a.replace(/<[^>]*>/g, "").trim() !== "" || /aria-label="[^"]+"/.test(a);
          expect(named, `${id} ${locale}: ${a.slice(0, 80)}`).toBe(true);
        }
        // Nothing from a third-party origin (U3): every URL in an attribute is local or a mailto/tel.
        // WPU-X30: the one exception is the open-source credit link to the author (NOTICE, Apache-2.0 4(d)).
        for (const url of page.match(/(?:src|href)="https?:\/\/[^"]+"/g) ?? []) {
          expect(url, `${id} ${locale}`).toMatch(
            /cloud\.example\.test|schema\.org|www\.linkedin\.com\/in\/in-moshiur/,
          );
        }
      }
    }
  });

  it("names Amazon Lightsail in the first paragraph of the pages that sell (16.8)", () => {
    for (const id of ["home.data", "cloud.data", "help.data"]) {
      expect(all[id]!("en")).toContain(LONG_EN);
    }
    for (const id of ["home.data", "pricing.data", "cloud.data"]) {
      expect(all[id]!("en")).toContain("Amazon Lightsail");
    }
  });

  it("never shows an account id, an ARN or an internal name (U6, R11)", () => {
    for (const [id, render] of Object.entries(all)) {
      for (const locale of LOCALES) {
        // The text of the page: tags (and their class names, which start with tc-) are left out.
        const text = render(locale).replace(/<[^>]*>/g, " ");
        expect(text, id).not.toMatch(/arn:aws/);
        expect(text, id).not.toMatch(/\b\d{12}\b/);
        expect(text, id).not.toMatch(/\btc-[a-z]+-[a-z0-9]+/);
      }
    }
  });
});

describe("prices equal the pricing engine's output (WPP-T1, R4)", () => {
  const totalOf = (aws: string) =>
    quote({ awsPriceUsd: aws, fxRate: FIXTURE_FX, rule: FIXTURE_RULE }).totalMinor;
  const takaOf = (aws: string, locale: "bn" | "en") =>
    formatMoney(totalOf(aws), { locale, mode: "wholeUp" });

  it("pricing, cloud servers and home show only taka amounts of engine totals, and no dollar (WPU-X16)", () => {
    for (const locale of LOCALES) {
      const rows = [...(FIXTURE_ROWS["linux_instance"] ?? []), ...(FIXTURE_ROWS["database"] ?? [])];
      const allowed = new Set(rows.map((r) => takaOf(r.awsPriceUsd, locale)));
      for (const id of ["pricing.data", "cloud.data", "home.data"]) {
        const page = all[id]!(locale);
        const text = page.replace(/<[^>]*>/g, " ");
        expect(text, `${id} ${locale} has no dollar`).not.toMatch(/\$|USD|US dollar|ডলার/i);
        const shown = page.match(/৳[0-9০-৯,]+/g) ?? [];
        expect(shown.length, `${id} ${locale} shows prices`).toBeGreaterThan(0);
        for (const amount of shown) expect(allowed, `${id} ${locale} ${amount}`).toContain(amount);
      }
    }
  });

  it("the taka shown for each plan is the amount the checkout debits (the engine total, never converted)", () => {
    for (const row of FIXTURE_ROWS["linux_instance"] ?? []) {
      const q = quote({ awsPriceUsd: row.awsPriceUsd, fxRate: FIXTURE_FX, rule: FIXTURE_RULE });
      expect(q.totalMinor).toBe(totalOf(row.awsPriceUsd));
      expect(usdToBdtMinor(customerUsd(q).micro, FIXTURE_FX)).toBe(q.totalMinor);
    }
  });

  it("shows the price of every open offer on the pricing page and none of a family whose flag is off", () => {
    for (const locale of LOCALES) {
      const page = all["pricing.data"]!(locale);
      for (const row of FIXTURE_ROWS["linux_instance"] ?? []) {
        expect(page, row.id).toContain(takaOf(row.awsPriceUsd, locale));
      }
      const windowsText = takaOf("9.0000", locale);
      expect(page).not.toContain(`${windowsText}<`);
    }
  });

  it("shows the specification of each location: Mumbai and Singapore differ in data transfer", () => {
    const page = all["pricing.data"]!("en");
    expect(page).toContain("1000 GB");
    expect(page).toContain("2000 GB");
    expect(page).toContain("Singapore");
    expect(page).toContain("Mumbai");
  });

  it("says the prices include VAT and fees and are for 30 days", () => {
    expect(all["pricing.data"]!("en")).toContain(escape(publicEn.Public.common.priceNote));
    expect(all["pricing.data"]!("bn")).toContain(escape(publicBn.Public.common.priceNote));
  });

  it("shows no price and says so when the catalog is unavailable (R16)", () => {
    for (const id of ["home.unavailable", "pricing.unavailable", "cloud.unavailable"]) {
      for (const locale of LOCALES) {
        const page = all[id]!(locale);
        // Fail closed (R16): no price of any currency, neither taka nor dollar.
        expect(page.replace(/<[^>]*>/g, " "), id).not.toMatch(/৳|\$|USD|ডলার/);
        expect(page, id).toContain(
          escape(
            locale === "bn"
              ? publicBn.Public.common.unavailableTitle
              : publicEn.Public.common.unavailableTitle,
          ),
        );
      }
    }
  });

  it("says prices are in taka (BDT), for 30 days, paid from the taka wallet, and Amazon Lightsail (WPU-X16)", () => {
    for (const locale of LOCALES) {
      const note =
        locale === "bn" ? publicBn.Public.common.priceNote : publicEn.Public.common.priceNote;
      expect(note).toContain(SHORT[locale]);
      expect(note).toMatch(locale === "bn" ? /মূল্য টাকায় \(BDT\)/ : /Prices are in taka \(BDT\)/);
      expect(note).not.toMatch(/USD|dollar|ডলার|exchange rate|বিনিময় হার/i);
      for (const id of ["pricing.data", "cloud.data", "home.data"]) {
        expect(all[id]!(locale), `${id} ${locale}`).toContain(escape(note));
      }
    }
  });

  it("is safe at 360 px: no inline style, no fixed width, the table scrolls inside its wrapper", () => {
    for (const id of ["pricing.data", "cloud.data", "home.data"]) {
      for (const locale of LOCALES) {
        // WPU-X21: the EPS badge declares its real size (1120 px wide); CSS sets it to 100% (max 560 px).
        const page = all[id]!(locale).replace(/<img[^>]*eps-pay-dark\.png[^>]*>/g, "");
        expect(page, id).not.toMatch(/style="/);
        expect(page, id).not.toMatch(/\bwidth="\d{4,}/);
      }
    }
    expect(all["pricing.data"]!("en")).toContain("table-responsive-lg");
  });

  it("the JSON-LD offers are in BDT with the same whole-taka price as the page", () => {
    const blocks = jsonLd(all["pricing.data"]!("en"));
    const product = blocks.find((b) => b["@type"] === "Product") as {
      offers: { priceCurrency: string; price: string }[];
    };
    const prices = (FIXTURE_ROWS["linux_instance"] ?? [])
      .concat(FIXTURE_ROWS["database"] ?? [])
      .map((r) => takaOf(r.awsPriceUsd, "en").replace(/[^0-9]/g, ""));
    expect(product.offers.map((o) => o.price).sort()).toEqual([...prices].sort());
    expect(new Set(product.offers.map((o) => o.priceCurrency))).toEqual(new Set(["BDT"]));
    expect(JSON.stringify(blocks)).not.toMatch(/USD|dollar/i);
  });
});

function jsonLd(page: string): Record<string, unknown>[] {
  return [...page.matchAll(/<script type="application\/ld\+json"([^>]*)>([^<]*)<\/script>/g)].map(
    (m) => {
      expect(m[1]).toContain(`nonce="${NONCE}"`);
      return JSON.parse(m[2] as string) as Record<string, unknown>;
    },
  );
}

describe("structured data (WPP-T3)", () => {
  it("every page has Organization, WebSite and WebPage; help has FAQPage; products have Product", () => {
    const types = (id: string) => jsonLd(all[id]!("en")).map((b) => b["@type"]);
    const site = ["Organization", "WebSite", "WebPage"];
    expect(types("home.data")).toEqual([...site, "BreadcrumbList"]);
    expect(types("help.data")).toEqual([...site, "BreadcrumbList", "FAQPage"]);
    expect(types("pricing.data")).toEqual([...site, "BreadcrumbList", "Product"]);
    expect(types("cloud.data")).toEqual([...site, "BreadcrumbList", "FAQPage", "Product"]);
    expect(types("support.data")).toEqual([...site, "BreadcrumbList"]);
  });

  it("the blocks contain no raw '<' (they cannot end the script block)", () => {
    for (const [id, render] of Object.entries(all)) {
      const page = render("en");
      for (const m of page.matchAll(
        /<script type="application\/ld\+json"[^>]*>([^<]*)<\/script>/g,
      )) {
        expect(m[1], id).not.toContain("<");
      }
      // Besides the data blocks the only script is the form replay of React (Next puts the nonce on it).
      const others = (page.match(/<script\b[^>]*>[^]*?<\/script>/g) ?? []).filter(
        (script) => !script.startsWith('<script type="application/ld+json"'),
      );
      for (const script of others) expect(script, id).toContain('addEventListener("submit"');
    }
  });
});

describe("/help (WPP-T2)", () => {
  it("has at least ten questions and the four required answers, in both locales", () => {
    for (const locale of LOCALES) {
      const page = all["help.data"]!(locale);
      const items = (locale === "bn" ? publicBn : publicEn).Public.help.items;
      expect(Object.keys(items).length).toBeGreaterThanOrEqual(10);
      for (const key of ["realAws", "noAccount", "billing", "dataLocation"] as const) {
        expect(page, `${locale} ${key} question`).toContain(escape(items[key].q));
        expect(page, `${locale} ${key} answer`).toContain(escape(items[key].a));
      }
    }
    const en = all["help.data"]!("en");
    expect(en).toContain("Yes, 100%");
    expect(en).toContain("AWS Singapore");
  });

  it("the FAQ JSON-LD lists every question", () => {
    const faq = jsonLd(all["help.data"]!("en")).find((b) => b["@type"] === "FAQPage") as {
      mainEntity: unknown[];
    };
    expect(faq.mainEntity).toHaveLength(Object.keys(publicEn.Public.help.items).length);
  });
});

const LEGAL = ["terms", "privacy", "acceptable-use", "refund"] as const;
type LegalTree = { title: string; sections: Record<string, Record<string, string>> };

describe("/support and /legal (WPP-T2, WPU-Z7)", () => {
  // Owner decision 2026-11-13: support is the in-app request system; no support phone, no support
  // e-mail (a deviation from 16.8). The company name and address stay in the footer of every page.
  it("support shows no phone, no e-mail address and no address block; it leads to support requests", () => {
    for (const locale of LOCALES) {
      const page = all["support.data"]!(locale);
      const main = mainOf(page);
      // WPU-Y6: the JSON-LD carries the company BIN (13 digits), which is not a phone number; the
      // check reads the text a visitor sees, without the script blocks.
      const text = main.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]*>/g, " ");
      const t = (locale === "bn" ? publicBn : publicEn).Public.support;
      expect(main).not.toMatch(/href="(tel|mailto):/);
      expect(text, "an e-mail address").not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(text, "a phone number").not.toMatch(/(?:[\d০-৯][\s-]?){10,}/);
      expect(main, "the address is not a contact block").not.toContain(
        escape(leaf(locale, "Shell.footer.address")),
      );
      expect(page, "the footer keeps the address").toContain(
        escape(leaf(locale, "Shell.footer.address")),
      );
      // Signed-in customers open and follow requests in the panel; the panel asks for a sign-in first.
      const prefix = "/en"; // WPU-X19: /support is English only
      expect(main).toContain(`href="${prefix}/support/new"`);
      expect(main).toContain(`href="${prefix}/support/requests"`);
      for (const key of ["lead", "customerText", "visitorText", "newCta", "requestsCta"] as const) {
        expect(main, key).toContain(escape(t[key]));
      }
      // The visitor form is unchanged: its fields and the honeypot.
      for (const field of ["email", "name", "category", "subject", "message", HONEYPOT_FIELD]) {
        expect(main, field).toContain(`name="${field}"`);
      }
    }
  });

  it("every legal document is approved: no draft notice, the version, every section in order", () => {
    for (const doc of LEGAL) {
      for (const locale of LOCALES) {
        const page = all[`legal.${doc}`]!(locale);
        const main = mainOf(page);
        const where = `${doc} ${locale}`;
        const t = (locale === "bn" ? publicBn : publicEn).Public.legal;
        // WPU-Y6 (owner, 2026-11-14): the texts are approved; no draft notice is shown.
        expect(main, where).not.toMatch(/draft|খসড়া|alert-warning/i);
        expect(main, where).toContain(escape(t.version));
        expect(main, where).not.toMatch(/\[legal text[^\]]*pending\]|\[আইনি লেখা[^\]]*বাকি\]/i);
        // Every title and paragraph of the messages is on the page, in their order, with the
        // provider's name and address filled in from the footer messages, and the brand from the
        // shell's brand (WPU-Z8).
        const tree = (t.docs as unknown as Record<string, LegalTree>)[doc]!;
        const fill = (text: string): string =>
          text
            .replace(/\{company\}/g, leaf(locale, "Shell.footer.companyName"))
            .replace(/\{address\}/g, leaf(locale, "Shell.footer.address"))
            .replace(/\{bin\}/g, leaf(locale, "Shell.footer.bin"))
            .replace(/\{tradeLicense\}/g, leaf(locale, "Shell.footer.tradeLicense"))
            .replace(/\{brand\}/g, leaf(locale, "Shell.brand"));
        let from = 0;
        for (const [key, section] of Object.entries(tree.sections)) {
          for (const [part, text] of Object.entries(section)) {
            const at = main.indexOf(escape(fill(text)), from);
            expect(at, `${where} ${key}.${part}`).toBeGreaterThanOrEqual(0);
            from = at + 1;
          }
        }
        expect(main, where).not.toMatch(/\{(?:company|address|bin|tradeLicense|brand)\}/);
        expect(main, where).not.toMatch(/TiCON System/i);
        // WPU-Y6 (owner, 2026-11-14): the open points are removed; no note and no unfilled value.
        expect(page, where).not.toMatch(
          /\[To be decided|\[সিদ্ধান্ত বাকি|সিদ্ধান্ত বাকি|To be decided/,
        );
        expect(page, where).not.toMatch(/\{[A-Za-z]+\}/);
        if (doc === "terms" || doc === "privacy") {
          // WPU-Y6: the provider is TryAWS.now with its BIN and trade licence, exactly as given.
          expect(main, where).toContain("BIN: 000000000-0000");
          expect(main, where).toContain("Trade License: TRAD/DNCC/000000/2000");
        }
        expect(main, `${where}: the brand`).toContain(leaf(locale, "Shell.brand"));
        // One heading per section, under the h2 of the document.
        expect(count(main, /<h3[\s>]/g), where).toBe(Object.keys(tree.sections).length);
        expect(page).toContain('aria-current="page"');
        for (const other of LEGAL) expect(page).toContain(`/legal/${other}`);
      }
    }
  });

  it("the acceptable use policy carries the AWS statements of 16.13 word for word", () => {
    for (const locale of LOCALES) {
      const page = all["legal.acceptable-use"]!(locale);
      expect(mainOf(page), locale).toContain(escape(leaf(locale, "Aws.long")));
      expect(page, locale).toContain(escape(SHORT[locale]));
      expect(page, locale).toContain(TRADEMARK);
    }
  });

  // WPU-X19 (owner, 2026-11-15): only the home page is bilingual, with its language switch.
  it("the language switch is on the home page only", () => {
    for (const locale of LOCALES) {
      const home = all["home.data"]!(locale);
      expect(home, locale).toContain('hrefLang="bn"');
      expect(home, locale).toContain('hrefLang="en"');
      expect(home, locale).toContain('href="/en"');
    }
    for (const id of ["help.data", "pricing.data", "cloud.data", "support.data", "legal.terms"]) {
      for (const locale of LOCALES) {
        const page = all[id]!(locale);
        expect(page, `${id} ${locale}`).not.toContain("hrefLang=");
        expect(page, `${id} ${locale}`).not.toContain("tc-locale-switch");
      }
    }
  });

  it("the Bengali home page is Bengali and every link that leaves it goes to the English page", () => {
    const home = all["home.data"]!("bn");
    expect(home).toContain(escape(publicBn.Public.entity.statement));
    const anchors = [...home.matchAll(/<a\s[^>]*?href="([^"]*)"/g)].map((m) => m[1] as string);
    const own = anchors.filter((href) => href.startsWith("/"));
    expect(own.length).toBeGreaterThan(10);
    for (const href of own) {
      const path = href.split(/[?#]/)[0] as string; // the region links of the home page stay on it
      expect(path === "/" || path === "/en" || path.startsWith("/en/"), href).toBe(true);
    }
    expect(own).toContain("/en/pricing");
    expect(own).toContain("/en/login");
  });
});

describe("a family whose flag is off (WPP-T4, R12)", () => {
  it("shows the coming soon page with a notify-me form that posts the family and an e-mail", () => {
    for (const locale of LOCALES) {
      const page = all["family.soon"]!(locale);
      const t = (locale === "bn" ? publicBn : publicEn).Public;
      expect(page).toContain(escape(t.soon.text));
      expect(page).toContain('name="family"');
      expect(page).toContain('value="databases"');
      expect(page).toContain('name="email"');
      expect(page).toContain('type="email"');
      expect(page).toContain(escape(t.soon.submit));
      expect(page).not.toContain("৳");
    }
  });

  it("an open family has no form", () => {
    const page = all["family.open"]!("en");
    expect(page).not.toContain('name="family"');
    expect(page).not.toContain("<form");
  });
});

describe("the maintenance page (WPP-T2)", () => {
  it("says it is maintenance, in the public frame", () => {
    expect(all["maintenance.data"]!("en")).toContain(
      escape(publicEn.Public.system.maintenanceTitle),
    );
    expect(all["maintenance.data"]!("bn")).toContain(
      escape(publicBn.Public.system.maintenanceTitle),
    );
  });
});
