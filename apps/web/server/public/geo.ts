import { shellMessages } from "@tc/ui";
import { localePath } from "@tc/ui/runtime";
import type { Locale } from "@tc/ui/runtime";
import { publicBn } from "../../messages/public-bn.ts";
import { publicEn } from "../../messages/public-en.ts";
import { LEGAL_DOCS } from "./indexing.ts";
import { COMPANY_BIN, COMPANY_TRADE_LICENSE, CONTENT_UPDATED, SITE_NAME } from "./seo.ts";

// WPU-Z16 (GEO): llms.txt, llms-full.txt and facts.json, the machine-readable ground truth that
// answer engines can cite, in the format of OmniRank v0.4.0 (docs/geo-artifacts-guide.md). Every
// sentence comes from the messages of the site (Public, Shell, Aws), so the files say what the pages
// say. They are written as PHYSICAL files into apps/web/public (OmniRank: on OpenNext behind
// CloudFront a dynamic route at a .txt or .json path may answer 403), by geo-files.test.ts with
// GEO_WRITE=1; without it the same test fails when the files on disk differ from this output.
// The product families are not listed: they open behind feature flags (R12), and these files are
// fixed at build time.

/** The production origin. The files are the same on every stage and always point at production. */
export const GEO_SITE_URL = "https://tryaws.now";

/**
 * The citation licence of the files (OmniRank `geo.license`). ASSUMPTION of WPU-Z16, recorded as
 * "Needs decision" (legal wording): CC-BY-4.0 over the public texts, so answer engines may quote
 * them with attribution. The owner may set "none" instead; omnirank.config.json carries the same value.
 */
export const GEO_LICENSE = "CC-BY-4.0";

/** The physical files under apps/web/public, by their path at the site root. */
export const GEO_FILES = ["llms.txt", "llms-full.txt", "facts.json"] as const;
export type GeoFile = (typeof GEO_FILES)[number];

type PublicTree = typeof publicBn.Public;
const PUBLIC: Readonly<Record<Locale, PublicTree>> = {
  bn: publicBn.Public,
  en: publicEn.Public as unknown as PublicTree,
};
type ShellTree = {
  Shell: { footer: { companyName: string; address: string; bin: string; tradeLicense: string } };
  Aws: { short: string; long: string; trademark: string };
};
const SHELL = shellMessages as unknown as Readonly<Record<Locale, ShellTree>>;

/** The FAQ of /help in its order on the page (HelpContent.tsx FAQ_KEYS). */
export const GEO_FAQ_KEYS = [
  "realAws",
  "noAccount",
  "billing",
  "dataLocation",
  "payment",
  "priceIncludes",
  "locations",
  "identity",
  "products",
  "port25",
  "support",
  "bdt",
  "vatInvoice",
  "refunds",
] as const;

interface GeoPage {
  path: string;
  title: string;
  description: string;
  /** The answer block of the page, when it has one. */
  answer: string | null;
}

/**
 * The public pages of the files, in the order of the site's menu. WPU-X19 (owner, 2026-11-15): only
 * the home page is Bengali, so the bn list is the home page alone; every other page is English.
 */
export function geoPages(locale: Locale): GeoPage[] {
  const p = PUBLIC[locale];
  const home: GeoPage = { path: "/", ...p.meta.home, answer: p.entity.statement };
  if (locale === "bn") return [home];
  const pages: GeoPage[] = [
    home,
    { path: "/pricing", ...p.meta.pricing, answer: p.pricing.answer },
    { path: "/products/cloud-servers", ...p.meta.cloudServers, answer: p.cloudServers.answer },
    { path: "/help", ...p.meta.help, answer: p.help.answer },
    { path: "/support", ...p.meta.support, answer: p.support.lead },
  ];
  for (const doc of LEGAL_DOCS) {
    const title = p.legal.docs[doc].title;
    pages.push({
      path: `/legal/${doc}`,
      title,
      description: p.meta.legal.descriptionOf.replace("{title}", title),
      answer: null,
    });
  }
  return pages;
}

const urlOf = (locale: Locale, path: string): string => GEO_SITE_URL + localePath(locale, path);

/**
 * The company of the footer is the publisher. WPU-Y6 (owner, 2026-11-14): the company is PanelPay, so
 * the attribution is the brand alone, and the BIN and the trade licence follow the company.
 */
const company = (): string => SHELL.en.Shell.footer.companyName;
export const geoAttribution = (): string => company();
const companyIds = (): string =>
  `${SHELL.en.Shell.footer.bin}, ${SHELL.en.Shell.footer.tradeLicense}`;

/** The two AWS Regions, with the names of the messages and their codes (16.13 format). */
function regions(locale: Locale): { code: string; name: string }[] {
  return Object.entries(PUBLIC[locale].location).map(([code, name]) => ({ code, name }));
}

function licenceBlock(): string[] {
  // OmniRank's citation block (geo_artifacts.py `_licence_block`), word for word.
  return [
    "## How to cite us",
    "",
    `Content is licensed ${GEO_LICENSE}. When quoting, attribute to ${geoAttribution()} and link the source URL.`,
    "When quoting a page, prefer that page's AnswerBlock — it is written to be lifted verbatim.",
  ];
}

function pageList(locale: Locale): string[] {
  return geoPages(locale).map(
    (page) => `- [${page.title}](${urlOf(locale, page.path)}): ${page.description}`,
  );
}

/** `/llms.txt`: what the site is, its pages in both languages, the key facts and the licence. */
export function llmsTxt(): string {
  const en = PUBLIC.en;
  const bn = PUBLIC.bn;
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${en.entity.statement}`,
    "",
    `> ${bn.entity.statement}`,
    "",
    `Canonical site: ${GEO_SITE_URL}`,
    `Published by ${company()}`,
    `Last updated: ${CONTENT_UPDATED}`,
    "",
    "## Key facts",
    "",
    `- What: ${SHELL.en.Aws.long}`,
    `- Locations: ${regions("en")
      .map((r) => `${r.name} (${r.code})`)
      .join(", ")}`,
    `- Prices: ${en.common.priceNote}`,
    `- Support: ${en.support.lead}`,
    `- Company: ${company()}, ${SHELL.en.Shell.footer.address}`,
    `- Identifiers: ${companyIds()}`,
    `- Machine-readable facts: ${GEO_SITE_URL}/facts.json`,
    `- Full text: ${GEO_SITE_URL}/llms-full.txt`,
    "",
    `## Pages, English (${geoPages("en").length})`,
    "",
    ...pageList("en"),
    "",
    `## হোম পাতা, বাংলা (${geoPages("bn").length})`,
    "",
    ...pageList("bn"),
    "",
    ...licenceBlock(),
    "",
  ];
  return lines.join("\n");
}

function fullCorpus(locale: Locale): string[] {
  const p = PUBLIC[locale];
  const lines: string[] = [];
  for (const page of geoPages(locale)) {
    lines.push(`### ${page.title}`, "", `URL: ${urlOf(locale, page.path)}`, "", page.description);
    if (page.answer !== null) lines.push("", page.answer);
    lines.push("");
  }
  // WPU-X19: the help page, and so the FAQ, is English only.
  if (locale === "en") {
    lines.push(`### ${p.help.heading}`, "");
    for (const key of GEO_FAQ_KEYS) {
      const item = p.help.items[key];
      lines.push(`Q: ${item.q}`, `A: ${item.a}`, "");
    }
  }
  lines.push(SHELL[locale].Aws.long, "", p.common.priceNote, "", SHELL[locale].Aws.trademark, "");
  return lines;
}

/** `/llms-full.txt`: every page's title, URL, description and answer block, and the whole FAQ. */
export function llmsFullTxt(): string {
  return [
    `# ${SITE_NAME}: full text`,
    "",
    `> ${PUBLIC.en.entity.statement}`,
    "",
    `Canonical site: ${GEO_SITE_URL}`,
    `Published by ${company()}, ${SHELL.en.Shell.footer.address}`,
    `Identifiers: ${companyIds()}`,
    `Last updated: ${CONTENT_UPDATED}`,
    "",
    "## English",
    "",
    ...fullCorpus("en"),
    "## বাংলা",
    "",
    ...fullCorpus("bn"),
    ...licenceBlock(),
    "",
  ].join("\n");
}

/** `/facts.json`: the same facts as structured data (OmniRank's keys first, then the site's own). */
export function factsJson(): string {
  const both = <T>(pick: (locale: Locale) => T): Record<Locale, T> => ({
    bn: pick("bn"),
    en: pick("en"),
  });
  const facts = {
    name: SITE_NAME,
    url: GEO_SITE_URL,
    entityType: "Organization",
    license: GEO_LICENSE,
    attribution: geoAttribution(),
    legalName: company(),
    identifiers: { bin: COMPANY_BIN, tradeLicense: COMPANY_TRADE_LICENSE },
    dateModified: CONTENT_UPDATED,
    locales: [
      { code: "bn-BD", path: "/", default: true },
      { code: "en", path: "/en" },
    ],
    nap: { street: SHELL.en.Shell.footer.address, city: "Dhaka", country: "BD" },
    description: both((l) => PUBLIC[l].entity.statement),
    service: {
      product: both((l) => PUBLIC[l].product.linux_instance),
      statement: both((l) => SHELL[l].Aws.long),
      regions: regions("en"),
      prices: both((l) => PUBLIC[l].common.priceNote),
      priceCurrency: "BDT",
      paymentCurrency: "BDT",
      payment: "EPS",
      support: both((l) => PUBLIC[l].support.lead),
    },
    // WPU-X19: the help page is English only, so is its FAQ.
    faq: {
      en: GEO_FAQ_KEYS.map((key) => ({
        q: PUBLIC.en.help.items[key].q,
        a: PUBLIC.en.help.items[key].a,
      })),
    },
    pages: both((l) =>
      geoPages(l).map((page) => ({ title: page.title, url: urlOf(l, page.path) })),
    ),
    trademark: SHELL.en.Aws.trademark,
  };
  return JSON.stringify(facts, null, 2) + "\n";
}

export function geoFile(name: GeoFile): string {
  if (name === "llms.txt") return llmsTxt();
  if (name === "llms-full.txt") return llmsFullTxt();
  return factsJson();
}
