import { formatMoney } from "@tc/ui";
import { describe, expect, it } from "vitest";
import {
  breadcrumbLd,
  faqLd,
  organizationLd,
  pageMetadata,
  productLd,
  serializeJsonLd,
  wholeTakaUp,
} from "./seo.ts";
import {
  FAMILY_PAGES,
  NOINDEX,
  PUBLIC_PATHS,
  indexableStage,
  isPublicPath,
  robotsTagFor,
} from "./indexing.ts";

const ORIGIN = "https://cloud.example.test";

describe("pageMetadata", () => {
  // WPU-X19 (owner, 2026-11-15): only the home page has a bn/en pair.
  it("the home page gives hreflang for bn and en and an x-default (16.8)", () => {
    const home = pageMetadata({
      origin: ORIGIN,
      locale: "bn",
      path: "/",
      title: "t",
      description: "d",
    });
    expect(home.alternates?.canonical).toBe(`${ORIGIN}/`);
    expect(home.alternates?.languages).toEqual({
      bn: `${ORIGIN}/`,
      en: `${ORIGIN}/en`,
      "x-default": `${ORIGIN}/`,
    });
    const en = pageMetadata({
      origin: ORIGIN,
      locale: "en",
      path: "/",
      title: "t",
      description: "d",
    });
    expect(en.alternates?.canonical).toBe(`${ORIGIN}/en`);
    expect(en.alternates?.languages).toMatchObject({ bn: `${ORIGIN}/`, en: `${ORIGIN}/en` });
  });

  it("every other page declares only its English URL: an English canonical and no hreflang", () => {
    for (const locale of ["en", "bn"] as const) {
      const meta = pageMetadata({
        origin: ORIGIN,
        locale,
        path: "/pricing",
        title: "t",
        description: "d",
      });
      expect(meta.alternates?.canonical, locale).toBe(`${ORIGIN}/en/pricing`);
      expect(meta.alternates?.languages, locale).toBeUndefined();
      expect(meta.openGraph).toMatchObject({
        url: `${ORIGIN}/en/pricing`,
        locale: "en_US",
      });
      expect((meta.openGraph as { alternateLocale?: unknown }).alternateLocale).toBeUndefined();
    }
  });

  it("can ask not to be indexed", () => {
    const meta = pageMetadata({
      origin: ORIGIN,
      locale: "bn",
      path: "/products/cdn",
      title: "t",
      description: "d",
      index: false,
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("structured data", () => {
  it("escapes everything that could end a script block", () => {
    const text = serializeJsonLd({ a: "</script><script>alert(1)</script><!-- &    " });
    expect(text).not.toContain("<");
    expect(text).not.toContain(">");
    expect(text).not.toContain("&");
    expect(text).not.toContain(" ");
    expect(JSON.parse(text)).toEqual({ a: "</script><script>alert(1)</script><!-- &    " });
  });

  it("builds Organization, BreadcrumbList, FAQPage and Product with an Offer in BDT", () => {
    expect(organizationLd(ORIGIN, { description: "d", legalName: "L" })).toMatchObject({
      "@type": "Organization",
      "@id": `${ORIGIN}/#organization`,
      name: "PanelPay",
      legalName: "L",
      description: "d",
      // WPU-Y6: the BIN and the trade licence of the company as identifiers, exactly as the owner gave them.
      identifier: [
        { "@type": "PropertyValue", propertyID: "BIN", value: "000000000-0000" },
        { "@type": "PropertyValue", propertyID: "Trade License", value: "TRAD/DNCC/000000/2000" },
      ],
    });
    const crumbs = breadcrumbLd(ORIGIN, "en", [
      { name: "Home", path: "/" },
      { name: "Pricing", path: "/pricing" },
    ]) as { itemListElement: { position: number; item: string }[] };
    expect(crumbs.itemListElement.map((i) => [i.position, i.item])).toEqual([
      [1, `${ORIGIN}/en`],
      [2, `${ORIGIN}/en/pricing`],
    ]);
    expect(faqLd([{ question: "q?", answer: "a" }])).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "q?", acceptedAnswer: { text: "a" } }],
    });
    const product = productLd({
      name: "Cloud Server",
      description: "d",
      url: ORIGIN,
      offers: [{ name: "n", priceMinor: 58450n, url: ORIGIN }],
    }) as { offers: { priceCurrency: string; price: string }[] };
    expect(product.offers[0]).toMatchObject({ priceCurrency: "BDT", price: "585" });
  });

  it("writes the price the way the plan cards show it: whole taka, rounded up (R4)", () => {
    for (const minor of [0n, 1n, 99n, 100n, 101n, 123456n, 99999999n]) {
      const shown = formatMoney(minor, { locale: "en", mode: "wholeUp" }).replace(/[^0-9]/g, "");
      expect(wholeTakaUp(minor)).toBe(shown === "" ? "0" : shown);
    }
    expect(() => wholeTakaUp(5 as never)).toThrow(TypeError);
  });
});

describe("indexing", () => {
  it("lets the public pages be indexed, in both locales, and no other path", () => {
    for (const path of PUBLIC_PATHS) {
      expect(isPublicPath(path), path).toBe(true);
      expect(isPublicPath(path === "/" ? "/en" : `/en${path}`), path).toBe(true);
      expect(robotsTagFor(path, true)).toBeNull();
    }
    for (const page of FAMILY_PAGES) expect(isPublicPath(`/products/${page.slug}`)).toBe(true);
  });

  it("puts noindex on the panel, the sign-in pages, the dev pages and anything unknown", () => {
    for (const path of [
      "/dashboard",
      "/servers/new",
      "/en/wallet/topup",
      "/login",
      "/en/signup",
      "/verify",
      "/dev/ui",
      "/en/dev/sign-in",
      "/settings/profile",
      "/maintenance",
      "/products/unknown",
      "/legal/unknown",
      "/something-else",
    ]) {
      expect(robotsTagFor(path, true), path).toBe(NOINDEX);
    }
  });

  it("only production is an indexable stage; staging, local, test and a missing stage are not (WPU-Z16)", () => {
    expect(indexableStage({ TC_STAGE: "production" })).toBe(true);
    for (const stage of ["staging", "local", "test", "", "Production", undefined]) {
      expect(indexableStage({ TC_STAGE: stage }), String(stage)).toBe(false);
    }
  });

  it("puts noindex on every path, public pages included, of a stage that is not production", () => {
    for (const path of [...PUBLIC_PATHS, "/en", "/en/pricing", "/dashboard"]) {
      expect(robotsTagFor(path, false), path).toBe(NOINDEX);
    }
  });
});
