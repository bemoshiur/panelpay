import type { Metadata } from "next";
import { localePath } from "@tc/ui/runtime";
import type { Locale } from "@tc/ui/runtime";

// Metadata and structured data of the public pages (16.8). Structured data is built here, on the
// server, from fixed fields and the texts of the page; it is serialised with every character that
// could end a script block escaped, so no text of a catalog or of a message can break out of it.

export const SITE_NAME = "TryAWS.now";

/**
 * WPU-Z16: the date the public texts were last changed (ISO date, Asia/Dhaka). Shown at the foot of
 * every public page, written as `dateModified` of each WebPage and into facts.json. A text change of
 * the public pages moves it (this constant is the ONE place to bump, WPU-X27); geo-files.test.ts then asks for the GEO files to be written again.
 */
export const CONTENT_UPDATED = "2026-11-15";

/** WPU-Z16: the picture of a shared link: the wordmark on the theme's dark ground, 1200 x 630. */
export const OG_IMAGE = Object.freeze({ path: "/brand/og.png", width: 1200, height: 630 });

/**
 * WPU-Z16: the CSS selector of the answer block (AEO): the hero subtitle of the mockup
 * (`.top-header .wrapper .subheading`), which holds the 40 to 60 word plain answer of a page.
 * omnirank.config.json names the same selector (geo.answerBlockSelector), and the speakable part
 * of the WebPage JSON-LD points at it.
 */
export const ANSWER_SELECTOR = ".subheading";

export interface PageMeta {
  /** A plain origin without a final slash (WebConfig.appOrigin); null when the site has none configured. */
  origin: string | null;
  locale: Locale;
  /** The path without the locale prefix, for example "/pricing". */
  path: string;
  title: string;
  description: string;
  /** false for a page that exists but must not be indexed (a coming soon page). */
  index?: boolean;
}

/** Title, description, canonical URL, `hreflang` (home page only, WPU-X19), robots and Open Graph. */
export function pageMetadata(meta: PageMeta): Metadata {
  const index = meta.index !== false;
  const robots = index ? { index: true, follow: true } : { index: false, follow: false };
  const origin = meta.origin;
  if (origin === null) {
    // No origin, no URL: the page keeps its texts and its robots rule, and claims no canonical (R16).
    return {
      title: meta.title,
      description: meta.description,
      robots,
      icons: { icon: "/brand/symbol.svg" },
    };
  }
  const url = (locale: Locale): string => origin + localePath(locale, meta.path);
  // WPU-X19 (owner, 2026-11-15): only the home page is bilingual. Every other page is English only:
  // an English canonical, no hreflang pair, English Open Graph.
  const home = meta.path === "/";
  const shown: Locale = home ? meta.locale : "en";
  return {
    metadataBase: new URL(origin),
    title: meta.title,
    description: meta.description,
    alternates: home
      ? {
          canonical: url(meta.locale),
          languages: { bn: url("bn"), en: url("en"), "x-default": url("bn") },
        }
      : { canonical: url("en") },
    robots,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: meta.title,
      description: meta.description,
      url: url(shown),
      locale: shown === "bn" ? "bn_BD" : "en_US",
      ...(home ? { alternateLocale: shown === "bn" ? ["en_US"] : ["bn_BD"] } : {}),
      // The picture shows the wordmark only, so its text is the brand in both languages.
      images: [
        {
          url: origin + OG_IMAGE.path,
          width: OG_IMAGE.width,
          height: OG_IMAGE.height,
          alt: SITE_NAME,
        },
      ],
    },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
    icons: { icon: "/brand/symbol.svg" },
  };
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * JSON for a `<script type="application/ld+json">` block. `<`, `>`, `&` and the two Unicode line
 * separators are escaped, so the text cannot contain `</script>` or an HTML comment, whatever a
 * message or a catalog field holds.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(LINE_SEPARATOR, "\\u2028")
    .replaceAll(PARAGRAPH_SEPARATOR, "\\u2029");
}

/**
 * The price of an offer as the decimal text of whole taka rounded up, the same value the plan
 * cards show (`MoneyText` mode "wholeUp"). Integer division of a bigint; no float (R4).
 */
export function wholeTakaUp(minor: bigint): string {
  if (typeof minor !== "bigint" || minor < 0n) {
    throw new TypeError("wholeTakaUp: minor must be a non-negative bigint of paisa");
  }
  return ((minor + 99n) / 100n).toString();
}

type Ld = Record<string, unknown>;

/** The stable `@id` of the organisation: every other block refers to it by this id (WPU-Z16). */
export const organizationId = (origin: string): string => `${origin}/#organization`;
export const websiteId = (origin: string): string => `${origin}/#website`;

/**
 * WPU-Y6 (owner, 2026-11-14): the two identifiers of the company TryAWS.now, exactly as the owner gave
 * them. The footer prints them with their labels (`Shell.footer.bin`, `Shell.footer.tradeLicense`); a
 * test keeps the two in step.
 */
export const COMPANY_BIN = "000000000-0000";
export const COMPANY_TRADE_LICENSE = "TRAD/DNCC/000000/2000";

/** The identifiers of the company as schema.org PropertyValue items (Organization `identifier`). */
export const companyIdentifiers = (): Ld[] => [
  { "@type": "PropertyValue", propertyID: "BIN", value: COMPANY_BIN },
  { "@type": "PropertyValue", propertyID: "Trade License", value: COMPANY_TRADE_LICENSE },
];

export interface OrganizationFacts {
  /** The entity statement (`Public.entity.statement`) in the page's language. */
  description: string;
  /** The company of the footer (`Shell.footer.companyName`): TryAWS.now (WPU-Y6). */
  legalName: string;
}

/**
 * The organisation behind the brand, with a stable `@id`. No `sameAs`: it lists only profiles that
 * exist, and none does yet (runbook "AI visibility" names the owner's steps).
 */
export function organizationLd(origin: string, facts: OrganizationFacts): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId(origin),
    name: SITE_NAME,
    legalName: facts.legalName,
    url: origin + "/",
    logo: origin + "/brand/symbol.svg",
    description: facts.description,
    identifier: companyIdentifiers(),
    areaServed: { "@type": "Country", name: "Bangladesh" },
  };
}

/** The site itself, in both languages, published by the organisation. */
export function websiteLd(origin: string): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId(origin),
    url: origin + "/",
    name: SITE_NAME,
    inLanguage: ["bn", "en"],
    publisher: { "@id": organizationId(origin) },
  };
}

/**
 * One public page: its URL, name and language, the date its text last changed, and, on a page with
 * an answer block, the speakable part that points at it.
 */
export function webPageLd(input: {
  origin: string;
  locale: Locale;
  path: string;
  name: string;
  description: string;
  answer: boolean;
}): Ld {
  const url = input.origin + localePath(input.locale, input.path);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: input.name,
    description: input.description,
    // WPU-X19: only the home page is served in bn; every other page is English.
    inLanguage: input.path === "/" ? input.locale : "en",
    isPartOf: { "@id": websiteId(input.origin) },
    about: { "@id": organizationId(input.origin) },
    dateModified: CONTENT_UPDATED,
    ...(input.answer
      ? { speakable: { "@type": "SpeakableSpecification", cssSelector: [ANSWER_SELECTOR] } }
      : {}),
  };
}

/** Organization, WebSite and WebPage: the three blocks every public page carries. */
export function siteLd(
  input: Parameters<typeof webPageLd>[0] & { organization: OrganizationFacts },
): Ld[] {
  return [
    organizationLd(input.origin, input.organization),
    websiteLd(input.origin),
    webPageLd(input),
  ];
}

export function breadcrumbLd(
  origin: string,
  locale: Locale,
  items: readonly { name: string; path: string }[],
): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: origin + localePath(locale, item.path),
    })),
  };
}

export function faqLd(items: readonly { question: string; answer: string }[]): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export interface ProductOffer {
  /** The name of the plan at its location. */
  name: string;
  /** Paisa, the engine's total: the structured data names the price in taka (BDT), WPU-X16. */
  priceMinor: bigint;
  url: string;
}

/** A product with one offer in BDT for each plan; the price is the whole-taka amount the plan cards show (WPU-X16). */
export function productLd(input: {
  name: string;
  description: string;
  url: string;
  offers: readonly ProductOffer[];
}): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: input.url,
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: input.offers.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      url: offer.url,
      priceCurrency: "BDT",
      price: wholeTakaUp(offer.priceMinor),
      availability: "https://schema.org/InStock",
    })),
  };
}
