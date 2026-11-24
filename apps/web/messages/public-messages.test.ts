import { forbiddenWording, messageKeys } from "@tc/ui";
import type { Messages } from "@tc/ui/runtime";
import { describe, expect, it } from "vitest";
import { webMessages } from "../i18n/messages.ts";
import { publicBn } from "./public-bn.ts";
import { publicEn } from "./public-en.ts";

describe("public site messages (WPP-T1 to WPP-T4)", () => {
  it("bn and en have the same keys, none empty, and no forbidden wording", () => {
    expect(messageKeys(publicBn)).toEqual(messageKeys(publicEn));
    expect(messageKeys(publicBn).length).toBeGreaterThan(150);
    for (const tree of [publicBn, publicEn]) {
      expect(forbiddenWording(tree)).toEqual([]);
      for (const key of messageKeys(tree)) {
        const value = key
          .split(".")
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], tree);
        expect(typeof value === "string" && value.trim().length > 0, key).toBe(true);
      }
    }
  });

  it("has at least ten questions, and the four required answers of 16.8", () => {
    const items = publicBn.Public.help.items;
    expect(Object.keys(items).length).toBeGreaterThanOrEqual(10);
    expect(publicEn.Public.help.items.realAws.a).toMatch(/^Yes, 100%/);
    expect(publicEn.Public.help.items.noAccount.a).toMatch(/^No\./);
    expect(publicEn.Public.help.items.billing.a).toMatch(/^PanelPay/);
    expect(publicEn.Public.help.items.dataLocation.a).toMatch(/AWS Singapore/);
  });

  it("is composed in both locales with Bengali text in bn", () => {
    for (const locale of ["bn", "en"] as const) {
      expect(webMessages[locale]["Public"], locale).toBeDefined();
    }
    expect((webMessages.bn["Public"] as Messages)["crumb"]).toBeDefined();
    expect(publicBn.Public.home.heroTitle).toMatch(/[ঀ-৿]/);
  });
});

// WPU-Z7, owner decision 2026-11-13: support is the in-app request system. There is no support phone
// and no support e-mail (a deviation from 16.8, which asks for a phone and the company address).
describe("support through support requests, no phone and no e-mail (WPU-Z7)", () => {
  it("the support page has no phone or e-mail keys any more, in either locale", () => {
    for (const tree of [publicBn, publicEn]) {
      const keys = Object.keys(tree.Public.support);
      for (const gone of ["phoneTitle", "phonePending", "emailTitle", "emailPending"]) {
        expect(keys, gone).not.toContain(gone);
      }
    }
  });

  it("the FAQ says who bills and supports: PanelPay, through support requests in the panel, no phone", () => {
    const { billing, support } = publicEn.Public.help.items;
    expect(billing.a).toMatch(/^PanelPay\./);
    expect(billing.a).toContain("support requests in the panel");
    expect(billing.a).toContain("no support phone");
    expect(support.a).toContain("support request");
    expect(support.a).toContain("no support phone line or support email address");
    const bn = publicBn.Public.help.items;
    expect(bn.billing.a).toMatch(/^PanelPay।/);
    expect(bn.billing.a).toContain("সাপোর্ট অনুরোধ");
    expect(bn.billing.a).toContain("ফোন লাইন নেই");
    expect(bn.support.a).toContain("সাপোর্ট অনুরোধ");
  });

  it("no public text holds a phone number or an e-mail address (the form's example address aside)", () => {
    for (const tree of [publicBn, publicEn]) {
      for (const key of messageKeys(tree)) {
        if (key.endsWith("emailPlaceholder")) continue;
        const value = String(
          key.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], tree),
        );
        expect(value, key).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
        expect(value, key).not.toMatch(/(?:[\d০-৯][\s-]?){10,}/);
      }
    }
  });
});

// WPU-Z7: the legal pages are full drafts in place of the one-line placeholders. Every section is
// numbered from 1, has a title and the paragraphs p1, p2, ...; nothing of the old placeholders is left.
// WPU-Y6: the owner approved the texts on 2026-11-14 and removed the open points; the page shows no
// draft notice and no open note.
type LegalSection = Record<string, string>;
type LegalDocTree = { title: string; sections: Record<string, LegalSection> };
const legalDocs = (tree: typeof publicBn | typeof publicEn): Record<string, LegalDocTree> =>
  tree.Public.legal.docs as unknown as Record<string, LegalDocTree>;
const LOCALES = [
  ["bn", publicBn],
  ["en", publicEn],
] as const;
const OLD_PLACEHOLDER = /\[legal text[^\]]*pending\]|\[আইনি লেখা[^\]]*বাকি\]/i;
const latinDigits = (text: string): string =>
  text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - "০".charCodeAt(0)));

describe("legal drafts (WPU-Z7)", () => {
  it("has the four documents, and no placeholder of the old one-line texts is left", () => {
    for (const [locale, tree] of LOCALES) {
      const docs = legalDocs(tree);
      expect(Object.keys(docs).sort(), locale).toEqual([
        "acceptable-use",
        "privacy",
        "refund",
        "terms",
      ]);
      for (const key of messageKeys(tree.Public.legal)) {
        const value = String(
          key
            .split(".")
            .reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], tree.Public.legal),
        );
        expect(value, `${locale} ${key}`).not.toMatch(OLD_PLACEHOLDER);
      }
    }
  });

  it("numbers the sections of each document from 1, each with a title and paragraphs p1, p2, ...", () => {
    for (const [locale, tree] of LOCALES) {
      for (const [name, doc] of Object.entries(legalDocs(tree))) {
        const sections = Object.entries(doc.sections);
        expect(sections.length, `${locale} ${name}`).toBeGreaterThanOrEqual(5);
        sections.forEach(([key, section], index) => {
          const where = `${locale} ${name}.${key}`;
          const parts = Object.keys(section);
          expect(parts[0], where).toBe("title");
          expect(parts.slice(1), where).toEqual(parts.slice(1).map((_, i) => `p${i + 1}`));
          expect(parts.length, `${where} has a paragraph`).toBeGreaterThan(1);
          expect(latinDigits(section["title"] as string), where).toMatch(
            new RegExp(`^${index + 1}\\. \\S`),
          );
        });
      }
    }
    // The same sections in the same order in both locales (the types check the keys, not the order).
    for (const name of Object.keys(legalDocs(publicBn))) {
      const bnKeys = Object.keys(legalDocs(publicBn)[name]!.sections);
      expect(Object.keys(legalDocs(publicEn)[name]!.sections), name).toEqual(bnKeys);
    }
  });

  // WPU-Y6 (owner decision 2026-11-14): the open points are removed. No text holds a bracketed note, in
  // either form, nor any other bracket; bn and en have the same paragraphs.
  it("holds no open note and no bracket, the same paragraphs in bn and en", () => {
    for (const [name, doc] of Object.entries(legalDocs(publicEn))) {
      for (const [key, section] of Object.entries(doc.sections)) {
        const bnSection = legalDocs(publicBn)[name]!.sections[key]!;
        expect(Object.keys(bnSection), `${name}.${key}`).toEqual(Object.keys(section));
        for (const [part, en] of Object.entries(section)) {
          const bn = bnSection[part] as string;
          const where = `${name}.${key}.${part}`;
          expect(en, where).not.toMatch(/To be decided|[[\]]/);
          expect(bn, where).not.toMatch(/সিদ্ধান্ত বাকি|[[\]]/);
        }
      }
    }
  });

  // WPU-Y6: no legal message holds an open note, and every {value} is one that LegalContent fills.
  it("holds no open note and only the values the page fills, in every legal message", () => {
    const FILLED = new Set(["{brand}", "{company}", "{address}", "{bin}", "{tradeLicense}"]);
    for (const [locale, tree] of LOCALES) {
      for (const key of messageKeys(tree.Public.legal)) {
        const value = String(
          key
            .split(".")
            .reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], tree.Public.legal),
        );
        const where = `${locale} ${key}`;
        expect(value, where).not.toMatch(/To be decided|সিদ্ধান্ত বাকি/);
        for (const value_ of value.match(/\{[^}]*\}/g) ?? []) {
          expect(FILLED.has(value_), `${where} ${value_}`).toBe(true);
        }
      }
    }
  });

  // WPU-Z8: like {company} and {address}, the brand comes from one place (Shell.brand) through {brand}.
  it("names the brand only through the {brand} value, never as a literal", () => {
    for (const [locale, tree] of LOCALES) {
      let uses = 0;
      for (const key of messageKeys(tree.Public.legal.docs)) {
        const value = String(
          key
            .split(".")
            .reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], tree.Public.legal.docs),
        );
        expect(value, `${locale} ${key}`).not.toMatch(/PanelPay|TryAWS|MeghVPS|TiCON\s+Cloud/i);
        uses += (value.match(/\{brand\}/g) ?? []).length;
      }
      expect(uses, locale).toBeGreaterThanOrEqual(10);
    }
  });

  // WPU-Y6 (owner, 2026-11-14): the legal texts are APPROVED. No draft notice, no "draft" in the
  // version line or the page descriptions. A deliberate deviation from the draft notice of the spec.
  it("has no draft notice: the texts are approved by the owner", () => {
    for (const [locale, tree] of LOCALES) {
      const legal = tree.Public.legal as Record<string, unknown>;
      expect(legal["draftTitle"], locale).toBeUndefined();
      expect(legal["draftText"], locale).toBeUndefined();
      expect(tree.Public.legal.version, locale).not.toMatch(/draft|খসড়া/i);
      expect(tree.Public.meta.legal.descriptionOf, locale).not.toMatch(/draft|খসড়া|অনুমোদন/i);
    }
    expect(publicEn.Public.legal.version).toBe("Version 5, 15 November 2026");
    expect(publicBn.Public.legal.version).toBe("সংস্করণ ৫, ১৫ নভেম্বর ২০২৬");
  });

  it("says where the data is kept in the words of the FAQ (16.8), and names the abuse category of the form", () => {
    for (const [locale, tree] of LOCALES) {
      const docs = legalDocs(tree);
      expect(docs["privacy"]!.sections["storage"]!["p1"], locale).toBe(
        tree.Public.help.items.dataLocation.a,
      );
      expect(docs["acceptable-use"]!.sections["report"]!["p1"], locale).toContain(
        `“${tree.Public.support.form.categories.abuse}”`,
      );
    }
  });

  it("passes on the AWS rules of 16.8 in the acceptable use policy, in both locales", () => {
    const aupOf = (tree: typeof publicBn | typeof publicEn): string =>
      Object.values(legalDocs(tree)["acceptable-use"]!.sections)
        .flatMap((section) => Object.values(section))
        .join("\n");
    // WPU-Z8 VERIFY (2026-11-13): the CDN rule in the words of the Amazon Lightsail FAQ ("How is Lightsail
    // CDN intended to be used?": "workloads that involve a high number of requests per second or large
    // amount of video streaming are not permitted").
    const rules = {
      en: [
        "AWS Acceptable Use Policy",
        "mine cryptocurrency",
        "AWS Service Terms, section 1.25",
        "AWS Service Terms, section 51.3",
        "a high number of requests per second or a large amount of video streaming",
        "Amazon Lightsail FAQ",
        "port 25 is closed",
        "AWS Customer Agreement, section 2.5",
      ],
      bn: [
        "AWS Acceptable Use Policy",
        "ক্রিপ্টোকারেন্সি মাইনিং",
        "AWS Service Terms, ধারা ১.২৫",
        "AWS Service Terms, ধারা ৫১.৩",
        "প্রতি সেকেন্ডে অনেক বেশি অনুরোধ বা বিপুল পরিমাণ ভিডিও স্ট্রিমিং",
        "Amazon Lightsail FAQ",
        "পোর্ট ২৫ বন্ধ",
        "AWS Customer Agreement, ধারা ২.৫",
      ],
    } as const;
    for (const [locale, tree] of LOCALES) {
      for (const rule of rules[locale]) expect(aupOf(tree), `${locale} ${rule}`).toContain(rule);
    }
  });

  it("promises a tax invoice and a credit note only for purchases and renewals, nothing for charges by use", () => {
    // Spec 9.3 and packages/core/invoices: a tax invoice for each purchase and each renewal, and a credit
    // note only for the full reversal of a charge with an issued invoice (credit-note.ts). Charges by use
    // (backup storage by the day, a static IP by the hour) get neither: an open owner decision (JOURNEY,
    // WPU-I2 ruling 5 and WPU-I5): the texts make no promise there (WPU-Y6: the open note is removed).
    const words = {
      en: { purchase: "purchase", renewal: "renewal", byUse: /charges? by use/ },
      bn: { purchase: "কেনা", renewal: "নবায়ন", byUse: /ব্যবহারভিত্তিক/ },
    } as const;
    for (const [locale, tree] of LOCALES) {
      const { terms, refund } = legalDocs(tree);
      const promises = {
        "terms.wallet.p4": terms!.sections["wallet"]!["p4"]!,
        "terms.invoices.p1": terms!.sections["invoices"]!["p1"]!,
        "terms.invoices.p2": terms!.sections["invoices"]!["p2"]!,
        "refund.reversal.p1": refund!.sections["reversal"]!["p1"]!,
      };
      for (const [where, text] of Object.entries(promises)) {
        const promise = text;
        expect(promise, `${locale} ${where}`).toContain(words[locale].purchase);
        expect(promise, `${locale} ${where}`).toContain(words[locale].renewal);
        expect(promise, `${locale} ${where}`).not.toMatch(words[locale].byUse);
      }
      for (const [where, section] of Object.entries({
        "terms.invoices": terms!.sections["invoices"]!,
        "refund.reversal": refund!.sections["reversal"]!,
      })) {
        for (const text of Object.values(section).slice(1)) {
          expect(text, `${locale} ${where}`).not.toMatch(words[locale].byUse);
        }
      }
    }
  });
});

// WPU-Z8: the text items of the WPU-Z7 review.
const allText = (doc: LegalDocTree): string =>
  Object.values(doc.sections)
    .flatMap((section) => Object.values(section))
    .join("\n");

describe("legal drafts, the review items of WPU-Z7 (WPU-Z8)", () => {
  it("names the CDN with its AWS name of 16.13, Amazon Lightsail CDN distribution", () => {
    for (const [locale, tree] of LOCALES) {
      const docs = legalDocs(tree);
      expect(docs["terms"]!.sections["service"]!["p1"], locale).toContain(
        "Amazon Lightsail CDN distribution",
      );
      for (const [name, doc] of Object.entries(docs)) {
        expect(allText(doc), `${locale} ${name}`).not.toMatch(
          /Amazon Lightsail CDN(?! distribution)/,
        );
      }
    }
  });

  it("does not say that every charge by use is taken by the day: a static IP is charged by the hour", () => {
    const en = legalDocs(publicEn)["terms"]!.sections["usage"]!["p1"]!;
    expect(en).not.toMatch(/day by day|every day|daily/);
    expect(en).toContain("the storage of the backups you keep, by the day");
    expect(en).toContain(
      "a static IP that is not attached to a server, by the hour after the first hour",
    );
    const bn = legalDocs(publicBn)["terms"]!.sections["usage"]!["p1"]!;
    expect(bn).not.toMatch(/চার্জ ব্যবহার অনুযায়ী প্রতিদিন/);
    expect(bn).toContain("আপনার রাখা ব্যাকআপের স্টোরেজ প্রতিদিন");
    expect(bn).toContain("স্ট্যাটিক আইপি প্রথম ঘণ্টার পর ঘণ্টা হিসেবে");
  });

  // WPU-Y6: the rule above 100% of data transfer (spec 11) is not built; with the open note removed, the
  // terms promise only the notices at 80% and 100%, and no pack or port closure.
  it("promises only the 80% and 100% notices for data transfer, no 50 GB pack and no port closure", () => {
    for (const [locale, tree] of LOCALES) {
      const p2 = legalDocs(tree)["terms"]!.sections["usage"]!["p2"]!;
      expect(p2, locale).toMatch(/80%|৮০%/);
      expect(p2, locale).not.toMatch(/50 GB|৫০ GB|port|পোর্ট/);
    }
  });

  // WPU-Y6: the open note on data protection rights is removed; privacy 8 says only what the panel does.
  it("makes no promise on copies, corrections or deletion of data in privacy 8", () => {
    const words = {
      en: [/copy/, /correction/, /deletion/],
      bn: [/কপি/, /সংশোধন/, /মুছে ফেলার/],
    } as const;
    for (const [locale, tree] of LOCALES) {
      const rights = Object.values(legalDocs(tree)["privacy"]!.sections["rights"]!).slice(1);
      expect(rights.length, locale).toBeGreaterThanOrEqual(1);
      for (const word of words[locale])
        expect(rights.join(" "), `${locale} ${word}`).not.toMatch(word);
    }
  });

  it("keeps the clauses that two documents share word for word the same in both", () => {
    for (const [locale, tree] of LOCALES) {
      const docs = legalDocs(tree);
      // terms 5 and refund 6: a payment whose amount does not match is not added to the wallet
      expect(docs["terms"]!.sections["wallet"]!["p3"], locale).toBe(
        docs["refund"]!.sections["review"]!["p1"],
      );
      // terms 11 and acceptable use 7: a suspension for a breach is not lifted by a payment
      const shared = docs["acceptable-use"]!.sections["suspend"]!["p2"]!;
      expect(docs["terms"]!.sections["suspension"]!["p1"]!.endsWith(` ${shared}`), locale).toBe(
        true,
      );
    }
  });

  it("the footer links to the terms and the privacy policy carry the titles of their pages", () => {
    for (const [locale, tree] of LOCALES) {
      const footer = (webMessages[locale]["Shell"] as Messages)["footer"] as Messages;
      expect(footer["terms"], locale).toBe(legalDocs(tree)["terms"]!.title);
      expect(footer["privacy"], locale).toBe(legalDocs(tree)["privacy"]!.title);
    }
  });
});
