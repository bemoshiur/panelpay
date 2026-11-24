import { messageBody, supportReplyPayload } from "@tc/db";
import { describe, expect, it } from "vitest";
import { NotifyError } from "../queue/types";
import { BN, EN, SHARED } from "../templates/messages";
import { parseTemplateData, renderEmail } from "../templates/render";
import { scanSecrets } from "../text/guards";
import { IDS } from "./samples";

// WPU-Z5 (owner decision 2026-11-13, round 3): support is an in-app ticket system with no support inbox.
// A customer is told that a reply waits in the panel and gets a link to the request (the panel page of
// WPU-Z6); a visitor of the public form has no account, so the e-mail carries the reply and says that an
// answer is a new request from the support page.

const ORIGIN = "https://my.ticoncloud.test";
const ctx = (locale: "bn" | "en") =>
  ({ locale, numerals: locale === "bn" ? "beng" : "latn", panelOrigin: ORIGIN }) as const;
const BODY = "We refunded the second charge.\nIt shows in your wallet tomorrow.";
const mail = (audience: "customer" | "visitor", locale: "bn" | "en") =>
  renderEmail(
    "support_reply",
    parseTemplateData("support_reply", supportReplyPayload(IDS.request, BODY, audience)),
    ctx(locale),
  );
const strings = (catalog: typeof BN): string =>
  JSON.stringify([
    catalog.support_reply.subject,
    catalog.support_reply.headline,
    catalog.support_reply.body,
    catalog.support_reply.extra,
  ]);

describe("support_reply to a customer", () => {
  it.each(["bn", "en"] as const)(
    "says a reply waits and links to the request in the panel, without the reply text (%s)",
    (locale) => {
      const m = mail("customer", locale);
      const link = `${ORIGIN}${locale === "en" ? "/en" : ""}/support/requests/${IDS.request}`;
      expect(m.html).toContain(`href="${link}"`);
      expect(m.text).toContain(`${SHARED[locale].cta.open_request}: ${link}`);
      const texts = locale === "en" ? EN : BN;
      expect(m.text).toContain(texts.support_reply.extra?.customer_lead);
      expect(m.text).toContain(texts.support_reply.extra?.customer_next);
      expect(m.text).not.toContain("refunded");
      expect(m.html).not.toContain("refunded");
      expect(scanSecrets(`${m.subject}\n${m.text}`)).toBeNull();
    },
  );

  it("the English text says the reply is waiting in the panel", () => {
    expect(mail("customer", "en").text).toMatch(/waiting for you in the panel/);
  });

  // The notifier refuses a mail whose text looks like a secret (R14). A request id is in the link, and a
  // random id has all digits in its last group about once in 280: the check sets aside only an id in the
  // path /support/requests/<id> (text/guards.ts; the whole path is in wpu-z5-notifier.test.ts).
  it("a request id whose last group is all digits still passes the check of the whole mail", () => {
    const requestId = "0193f7c6-4d5e-5394-8f82-123456789012";
    for (const locale of ["bn", "en"] as const) {
      const data = parseTemplateData(
        "support_reply",
        supportReplyPayload(requestId, BODY, "customer"),
      );
      const m = renderEmail("support_reply", data, ctx(locale));
      expect(m.text).toContain(
        `${ORIGIN}${locale === "en" ? "/en" : ""}/support/requests/${requestId}`,
      );
      expect(scanSecrets(`${m.subject}\n${m.text}`)).toBeNull();
    }
  });
});

describe("support_reply to a visitor", () => {
  it.each(["bn", "en"] as const)(
    "carries the reply and says that an answer is a new request from the support page (%s)",
    (locale) => {
      const m = mail("visitor", locale);
      expect(m.text).toContain(BODY);
      expect(m.html).toContain(
        "We refunded the second charge.<br>It shows in your wallet tomorrow.",
      );
      const link = `${ORIGIN}${locale === "en" ? "/en" : ""}/support`;
      expect(m.html).toContain(`href="${link}"`);
      expect(m.text).toContain(`${SHARED[locale].cta.open_support}: ${link}`);
      const texts = locale === "en" ? EN : BN;
      expect(m.text).toContain(texts.support_reply.extra?.visitor_lead);
      expect(m.text).toContain(texts.support_reply.extra?.visitor_next);
      expect(m.text).not.toContain("/support/requests/");
      expect(scanSecrets(`${m.subject}\n${m.text}`)).toBeNull();
    },
  );

  it("the English text says that replies to the e-mail are not read and that an answer is a new request", () => {
    const text = mail("visitor", "en").text;
    expect(text).toMatch(/not read/);
    expect(text).toMatch(/new request from the support page/);
  });
});

describe("support_reply data and words", () => {
  it("the payload the admin repository writes is the closed list of the template", () => {
    expect(supportReplyPayload(IDS.request, BODY, "customer")).toEqual({
      requestId: IDS.request,
      body: BODY,
      audience: "customer",
    });
    for (const audience of ["customer", "visitor"] as const) {
      expect(() =>
        parseTemplateData("support_reply", supportReplyPayload(IDS.request, BODY, audience)),
      ).not.toThrow();
    }
  });

  it("refuses a payload without the audience or with another one (fail closed)", () => {
    for (const audience of [undefined, "admin", "Customer", "", 1]) {
      expect(() =>
        parseTemplateData("support_reply", { requestId: IDS.request, body: BODY, audience }),
      ).toThrow(NotifyError);
    }
  });

  it("the texts of the reply name no AWS service: AWS is only in the shared footer of 16.13", () => {
    for (const catalog of [BN, EN]) {
      expect(strings(catalog)).not.toMatch(/AWS|Amazon|Lightsail|Route 53/i);
    }
  });

  it("the texts name no support phone, no support address and no brand (the brand is the shared wordmark)", () => {
    for (const catalog of [BN, EN]) {
      expect(strings(catalog)).not.toMatch(/@|\+?880|\bphone\b|MeghVPS|PanelPay/i);
    }
  });
});

// Review round 1: the repositories refuse a message the notifier would refuse, so a stored reply can always
// be sent. The two checks agree on every character of the list and on ordinary text.
describe("the text the repositories store is the text the template takes", () => {
  const samples = [
    "Plain reply.",
    "Line one\r\nline two",
    "  padded  ",
    "আপনার উত্তর",
    "a\tb",
    "a\u0000b",
    "a\rb",
    "a\u007fb",
    "a\u0085b",
    "a\u200bb",
    "a\u200fb",
    "a\u202ab",
    "a\u202eb",
    "a\u2066b",
    "a\u2069b",
    "a\ufeffb",
    "x".repeat(5000),
    "x".repeat(5001),
    "",
  ];
  it.each(samples)("messageBody and the body field agree on %j", (text) => {
    const stored = messageBody(text);
    let parsed: string | null;
    try {
      parsed = parseTemplateData(
        "support_reply",
        supportReplyPayload(IDS.request, text, "customer"),
      ).body as string;
    } catch {
      parsed = null;
    }
    expect(stored).toBe(parsed);
  });
});
